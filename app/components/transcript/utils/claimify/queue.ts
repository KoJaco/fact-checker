import type {
    ClaimItemIn,
    LlmPayload,
    TranscriptIndex,
    Memories,
    NormalizedClaim,
    Dispatcher,
    Clock,
    Config,
} from "./types";
import { ClaimRecord } from "./state";
import { autoAttachContext } from "./context";
import { resolveSubject } from "./subject";
import {
    extractRelation,
    extractObject,
    extractQuantity,
    normalizeTime,
    normalizeLocation,
} from "./normalize";
import { makeClaimKey } from "./key";
import { isVerifiableNow, scoreVerifiability } from "./gate";
import { buildSearchQuery, buildRetryQuery } from "./query";
import { updateMemoriesFromText } from "./memories";

/**
 * Main claim processing engine
 */
export class ClaimEngine {
    private claimRecords = new Map<string, ClaimRecord>(); // keyed by claimKey
    private pendingDispatches = new Set<string>(); // claimKeys being processed
    private lastDispatchTime = 0;
    private dispatchCount = 0;

    constructor(
        private config: Config,
        private clock: Clock,
        private dispatcher: Dispatcher
    ) {}

    /**
     * Process new claims from LLM payload
     */
    upsertFromLlm(
        payload: LlmPayload,
        index: TranscriptIndex,
        memories: Memories
    ): NormalizedClaim[] {
        const results: NormalizedClaim[] = [];

        for (const item of payload.items) {
            try {
                const normalized = this.processClaimItem(item, index, memories);
                if (normalized) {
                    results.push(normalized);
                }
            } catch (error) {
                console.warn("Error processing claim item:", error, item);
            }
        }

        return results;
    }

    /**
     * Process a single claim item through the full pipeline
     */
    private processClaimItem(
        item: ClaimItemIn,
        index: TranscriptIndex,
        memories: Memories
    ): NormalizedClaim | null {
        const now = this.clock.now();

        // Handle withdrawn claims
        if (item.revisionAction === "withdrawn") {
            const existingKey = this.findExistingClaimKey(item);
            if (existingKey && this.claimRecords.has(existingKey)) {
                const record = this.claimRecords.get(existingKey)!;
                record.updateStatus("WITHDRAWN");
                return record.getClaim();
            }
            return null;
        }

        // 1. Auto-attach context if needed
        const contextData = autoAttachContext(item, index, item.speakerTag);
        const enrichedItem = {
            ...item,
            context: item.context || contextData.context,
            contextFragments:
                item.contextFragments || contextData.contextFragments,
        };

        // 2. Resolve subject using ordered attempts
        const subjectResolution = resolveSubject(enrichedItem, index, memories);

        // 3. Extract and normalize all slots
        const relation = extractRelation(enrichedItem.quote);
        const object = extractObject(
            enrichedItem.quote,
            enrichedItem.objectSpan
        );
        const quantity = extractQuantity(enrichedItem.quote);
        const timeNorm = normalizeTime(enrichedItem.timeSpan, new Date(now));
        const locationNorm = normalizeLocation(enrichedItem.locationSpan);

        // 4. Build normalized claim
        const normalized: Omit<
            NormalizedClaim,
            "claimKey" | "status" | "createdAt" | "updatedAt"
        > = {
            id: enrichedItem.id,
            speakerTag: enrichedItem.speakerTag,

            // Extracted spans
            quote: enrichedItem.quote,
            subjectSurface: subjectResolution.surface,
            objectSurface: object.surface,
            timeSurface: enrichedItem.timeSpan,
            locationSurface: enrichedItem.locationSpan,
            attributionSurface: enrichedItem.attributionSpan,
            context: enrichedItem.context,
            contextFragments: enrichedItem.contextFragments,
            originalSeeds: enrichedItem.searchSeeds || null,

            // Normalized slots
            subjectCanonical: subjectResolution.canonical,
            relationLemma: relation.lemma,
            polarity: relation.polarity,
            objectCanonical: object.canonical,

            quantityText: quantity.text,
            quantityValue: quantity.value,
            quantityUnit: quantity.unit,
            comparator: quantity.comparator,
            approx: quantity.approx,

            timeNormalized: timeNorm,
            locationNormalized: locationNorm,

            attributionSource: enrichedItem.attributionSpan,

            scope: null, // Could be extracted from context in future
            condition: null,

            coref: subjectResolution.evidence,

            version: enrichedItem.version || 1,
            confidence: scoreVerifiability({
                subjectCanonical: subjectResolution.canonical,
                relationLemma: relation.lemma,
                polarity: relation.polarity,
                objectCanonical: object.canonical,
                quantityText: quantity.text,
                timeNormalized: timeNorm,
                locationNormalized: locationNorm,
                quote: enrichedItem.quote,
            } as NormalizedClaim),
        };

        // 5. Compute claim key for deduplication
        const claimKey = makeClaimKey(normalized);

        // 6. Determine initial status
        let status: NormalizedClaim["status"];
        if (!subjectResolution.canonical) {
            status = "PENDING_COREF";
        } else {
            status = "READY";
        }

        const fullClaim: NormalizedClaim = {
            ...normalized,
            claimKey,
            status,
            createdAt: now,
            updatedAt: now,
        };

        // 7. Update or create claim record (merge by id first to avoid duplicates on same id with evolving subject)
        for (const [key, record] of this.claimRecords.entries()) {
            if (record.getClaim().id === fullClaim.id) {
                record.mergeUpgrade(fullClaim);
                this.updateMemoriesFromClaim(
                    record.getClaim(),
                    index,
                    memories
                );
                return record.getClaim();
            }
        }

        if (this.claimRecords.has(claimKey)) {
            const existingRecord = this.claimRecords.get(claimKey)!;
            existingRecord.mergeUpgrade(fullClaim);
            this.updateMemoriesFromClaim(
                existingRecord.getClaim(),
                index,
                memories
            );
            return existingRecord.getClaim();
        }

        const newRecord = new ClaimRecord(fullClaim, this.clock);
        this.claimRecords.set(claimKey, newRecord);
        this.updateMemoriesFromClaim(newRecord.getClaim(), index, memories);
        return newRecord.getClaim();
    }

    /**
     * Find existing claim key for an item (for updates/withdrawals)
     */
    private findExistingClaimKey(item: ClaimItemIn): string | null {
        // Simple approach: look for claims with matching ID
        for (const [key, record] of this.claimRecords.entries()) {
            if (record.getClaim().id === item.id) {
                return key;
            }
        }
        return null;
    }

    /**
     * Update memories from claim information
     */
    private updateMemoriesFromClaim(
        claim: NormalizedClaim,
        index: TranscriptIndex,
        memories: Memories
    ): void {
        const textsToProcess: string[] = [];

        if (claim.quote) textsToProcess.push(claim.quote);
        if (claim.context) textsToProcess.push(claim.context);
        if (claim.contextFragments) {
            textsToProcess.push(...claim.contextFragments);
        }

        const latestSentenceIdx =
            index.sentences.length > 0
                ? Math.max(...index.sentences.map((s) => s.idx))
                : 0;

        for (const text of textsToProcess) {
            updateMemoriesFromText(
                text,
                claim.speakerTag,
                latestSentenceIdx,
                memories
            );
        }
    }

    /**
     * Main tick function - handles timeouts, debouncing, and dispatching
     */
    tick(): void {
        const now = this.clock.now();

        // Handle PENDING_COREF timeouts
        this.handleCorefTimeouts();

        // Handle dispatching for READY claims
        this.handleDispatching();

        // Clean up rate limiting state
        this.cleanupRateLimit(now);
    }

    /**
     * Handle timeout for claims stuck in PENDING_COREF
     */
    private handleCorefTimeouts(): void {
        for (const record of this.claimRecords.values()) {
            const claim = record.getClaim();

            if (
                claim.status === "PENDING_COREF" &&
                record.getAgeMs() > this.config.pendingCorefTimeoutMs
            ) {
                // Try one more time to resolve subject from current memories
                // For now, just mark as READY and let verifiability gating handle it
                record.updateStatus("READY");
            }
        }
    }

    /**
     * Handle dispatching claims that are ready and stable
     */
    private handleDispatching(): void {
        const now = this.clock.now();

        // Check rate limit
        if (!this.canDispatchNow(now)) {
            return;
        }

        for (const record of this.claimRecords.values()) {
            const claim = record.getClaim();

            if (
                claim.status === "READY" &&
                record.stableForMs(this.config.debounceMs) &&
                isVerifiableNow(claim) &&
                !this.pendingDispatches.has(claim.claimKey)
            ) {
                this.dispatchClaim(record);

                // Respect rate limit
                if (!this.canDispatchNow(now)) {
                    break;
                }
            }
        }
    }

    /**
     * Dispatch a single claim for fact-checking
     */
    private async dispatchClaim(record: ClaimRecord): Promise<void> {
        const claim = record.getClaim();
        const query = buildSearchQuery(claim);

        record.updateStatus("QUEUED");
        this.pendingDispatches.add(claim.claimKey);
        this.recordDispatch();

        try {
            await this.dispatcher.send(claim.id, query.q, {
                claimKey: claim.claimKey,
                tags: query.tags,
                claim: claim,
            });

            record.updateStatus("CHECKING");
        } catch (error) {
            console.error("Error dispatching claim:", error);
            record.updateStatus("READY"); // Reset for retry
            this.pendingDispatches.delete(claim.claimKey);
        }
    }

    /**
     * Handle fact-check result (called by external system)
     */
    handleFactCheckResult(
        claimKey: string,
        verdict: "VERIFIED" | "REFUTED" | "UNCERTAIN",
        confidence?: number
    ): void {
        const record = this.claimRecords.get(claimKey);
        if (!record) return;

        const claim = record.getClaim();

        // Handle retry logic for uncertain results
        if (verdict === "UNCERTAIN" && claim.status === "CHECKING") {
            // One-shot retry with more neutral query
            this.retryWithNeutralQuery(record);
        } else {
            record.updateStatus(verdict);
            if (confidence !== undefined) {
                record.updateConfidence(confidence);
            }
            this.pendingDispatches.delete(claimKey);
        }
    }

    /**
     * Retry with a more neutral query for uncertain results
     */
    private async retryWithNeutralQuery(record: ClaimRecord): Promise<void> {
        const claim = record.getClaim();
        const retryQuery = buildRetryQuery(claim);

        try {
            await this.dispatcher.send(claim.id + "_retry", retryQuery.q, {
                claimKey: claim.claimKey,
                tags: [...retryQuery.tags, "retry"],
                claim: claim,
                isRetry: true,
            });
        } catch (error) {
            console.error("Error in retry dispatch:", error);
            record.updateStatus("UNCERTAIN");
            this.pendingDispatches.delete(claim.claimKey);
        }
    }

    /**
     * Check if we can dispatch now based on rate limiting
     */
    private canDispatchNow(now: number): boolean {
        const windowStart = now - 60000; // 1 minute window
        if (this.lastDispatchTime < windowStart) {
            this.dispatchCount = 0; // Reset count for new window
        }

        return this.dispatchCount < this.config.maxQueuePerMinute;
    }

    /**
     * Record a dispatch for rate limiting
     */
    private recordDispatch(): void {
        this.lastDispatchTime = this.clock.now();
        this.dispatchCount++;
    }

    /**
     * Clean up rate limiting state
     */
    private cleanupRateLimit(now: number): void {
        const windowStart = now - 60000;
        if (this.lastDispatchTime < windowStart) {
            this.dispatchCount = 0;
        }
    }

    /**
     * Get current state snapshot
     */
    getState(): NormalizedClaim[] {
        return Array.from(this.claimRecords.values()).map((record) =>
            record.getClaim()
        );
    }

    /**
     * Get claims ready for display (non-withdrawn, with sufficient confidence)
     */
    getDisplayableClaims(): NormalizedClaim[] {
        return this.getState().filter(
            (claim) => claim.status !== "WITHDRAWN" && claim.confidence >= 0.3 // Minimum threshold for display
        );
    }

    /**
     * Clear all claims (for testing/reset)
     */
    clear(): void {
        this.claimRecords.clear();
        this.pendingDispatches.clear();
        this.dispatchCount = 0;
    }
}
