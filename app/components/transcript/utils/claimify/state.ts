import type { NormalizedClaim, Clock } from "./types";

/**
 * Extended claim record that wraps NormalizedClaim with timing information
 */
export class ClaimRecord {
    private claim: NormalizedClaim;
    private firstSeen: number;
    private lastUpdate: number;
    private stableSince: number;
    private clock: Clock;

    constructor(claim: NormalizedClaim, clock: Clock) {
        this.claim = { ...claim };
        this.clock = clock;
        const now = clock.now();
        this.firstSeen = now;
        this.lastUpdate = now;
        this.stableSince = now;
    }

    /**
     * Get the current claim data
     */
    getClaim(): NormalizedClaim {
        return { ...this.claim };
    }

    /**
     * Get timing information
     */
    getTiming() {
        return {
            firstSeen: this.firstSeen,
            lastUpdate: this.lastUpdate,
            stableSince: this.stableSince,
        };
    }

    /**
     * Check if the claim has been stable for at least the given duration
     */
    stableForMs(ms: number): boolean {
        return this.clock.now() - this.stableSince >= ms;
    }

    /**
     * Bump the version and update timing
     */
    bumpVersion(): void {
        this.claim.version += 1;
        const now = this.clock.now();
        this.lastUpdate = now;
        this.stableSince = now; // Reset stability timer
        this.claim.updatedAt = now;
    }

    /**
     * Merge an upgraded claim, updating relevant fields and bumping version if changed
     */
    mergeUpgrade(newClaim: NormalizedClaim): boolean {
        let hasChanges = false;
        const now = this.clock.now();

        // Check for material changes that warrant a version bump
        const materialFields: (keyof NormalizedClaim)[] = [
            "subjectCanonical",
            "relationLemma",
            "objectCanonical",
            "quantityValue",
            "timeNormalized",
            "locationNormalized",
            "polarity",
        ];

        for (const field of materialFields) {
            if (this.claim[field] !== newClaim[field]) {
                hasChanges = true;
                break;
            }
        }

        // Always update certain fields from the newer claim
        const fieldsToUpdate: (keyof NormalizedClaim)[] = [
            "quote", // May be refined
            "context",
            "contextFragments",
            "subjectSurface",
            "objectSurface",
            "timeSurface",
            "locationSurface",
            "attributionSurface",
            "scope",
            "condition",
            "coref",
            "confidence",
        ];

        for (const field of fieldsToUpdate) {
            if (newClaim[field] !== undefined && newClaim[field] !== null) {
                (this.claim as any)[field] = newClaim[field];
            }
        }

        // Update material fields
        for (const field of materialFields) {
            if (newClaim[field] !== undefined && newClaim[field] !== null) {
                (this.claim as any)[field] = newClaim[field];
            }
        }

        // Handle special cases
        if (newClaim.revisionAction === "withdrawn") {
            this.claim.status = "WITHDRAWN";
            hasChanges = true;
        }

        // Update timing and version if there were changes
        if (hasChanges) {
            this.bumpVersion();
        } else {
            // Minor update, just refresh timestamp
            this.lastUpdate = now;
            this.claim.updatedAt = now;
        }

        return hasChanges;
    }

    /**
     * Update the status and associated timing
     */
    updateStatus(newStatus: NormalizedClaim["status"]): void {
        if (this.claim.status !== newStatus) {
            this.claim.status = newStatus;
            const now = this.clock.now();
            this.lastUpdate = now;
            this.claim.updatedAt = now;

            // Reset stability timer on status change
            this.stableSince = now;
        }
    }

    /**
     * Update confidence score
     */
    updateConfidence(confidence: number): void {
        this.claim.confidence = Math.max(0, Math.min(1, confidence));
        this.lastUpdate = this.clock.now();
        this.claim.updatedAt = this.lastUpdate;
    }

    /**
     * Check if the claim is in a final state
     */
    isFinal(): boolean {
        return ["VERIFIED", "REFUTED", "UNCERTAIN", "WITHDRAWN"].includes(
            this.claim.status
        );
    }

    /**
     * Check if the claim is ready for processing
     */
    isReady(): boolean {
        return this.claim.status === "READY";
    }

    /**
     * Check if the claim is currently being processed
     */
    isProcessing(): boolean {
        return ["QUEUED", "CHECKING"].includes(this.claim.status);
    }

    /**
     * Get age in milliseconds
     */
    getAgeMs(): number {
        return this.clock.now() - this.firstSeen;
    }

    /**
     * Get time since last update in milliseconds
     */
    getTimeSinceUpdateMs(): number {
        return this.clock.now() - this.lastUpdate;
    }

    /**
     * Create a copy of this record
     */
    clone(): ClaimRecord {
        const newRecord = new ClaimRecord(this.claim, this.clock);
        newRecord.firstSeen = this.firstSeen;
        newRecord.lastUpdate = this.lastUpdate;
        newRecord.stableSince = this.stableSince;
        return newRecord;
    }
}
