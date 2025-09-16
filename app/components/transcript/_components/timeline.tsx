import type {
    Word,
    StructuredOutputReceived,
    Turn,
    PhraseDisplay,
} from "~/lib/sdk";

import { useState, useEffect, useRef, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import FactCheckCard from "~/components/fact-check-card";
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area";
import {
    dispatchFactChecks,
    type AskFn,
    askPerplexity,
} from "~/components/transcript/utils/retrieval-utils";
import { gateAndNormalizeFirstPerson } from "~/components/transcript/utils/first-person-gating";
import type { SpeakerMap } from "~/components/transcript/utils/first-person-gating";
import { claimifyPlus } from "~/components/transcript/utils/clamify";
import type { InsightItem } from "../types";
import {
    ClaimEngine,
    createMemories,
    DEFAULT_CONFIG,
    DEFAULT_CLOCK,
    isVerifiableNow,
    type LlmPayload,
    type TranscriptIndex,
    type Memories,
    type NormalizedClaim,
    type Dispatcher,
} from "~/components/transcript/utils/claimify";

// Feature flag: disable live retrieval (Perplexity) to avoid API usage during testing
const ENABLE_RETRIEVAL = true;

interface TimelineProps {
    transcriptFinal: {
        text: string;
        words?: Word[];
        confidence?: number;
        turns?: Turn[];
    };
    transcriptInterim: {
        text: string;
        words?: Word[];
        confidence?: number;
        turns?: Turn[];
    };
    transcriptFinalPieces: {
        text: string;
        words?: Word[];
        confidence?: number;
        turns?: Turn[];
        phrasesDisplay?: PhraseDisplay[];
    }[];
    isRecording: boolean;
    wordCount: number;
    totalFieldsUpdated: number;
    structuredOutput: StructuredOutputReceived | null;
    recordingStartTime: Date | null;
    recordingDuration: number;
    canClear?: boolean;
    onClear?: () => void;
}

function normalizeKind(k: unknown): "factcheck" {
    const s = String(k || "").toLowerCase();
    if (s === "claim" || s === "factcheck") return "factcheck";
    return "factcheck";
}

function mergeInsight(
    prev: InsightItem | undefined,
    patch: InsightItem
): InsightItem {
    if (!prev) return patch;
    const next: InsightItem = { ...prev };
    // Only assign if the field exists in patch (including null), skip undefined
    for (const [k, v] of Object.entries(patch) as [keyof InsightItem, any][]) {
        if (v !== undefined) (next as any)[k] = v;
    }
    return next;
}

export const Timeline = ({
    transcriptFinal,
    transcriptInterim,
    transcriptFinalPieces,
    isRecording,
    structuredOutput,
    recordingDuration,
    canClear,
    onClear,
}: TimelineProps) => {
    const [displayTurns, setDisplayTurns] = useState<
        { speaker: string; text: string }[]
    >([]);

    const lastProcessedPieceIdx = useRef(0);

    // console.log("structuredOutput", structuredOutput);

    // No rolling accumulation when diarization is enabled; we will display "allTurns" below.

    const [insights, setInsights] = useState<InsightItem[]>([]);
    // Speaker labeling from structured output: maps diarised labels (e.g., "Speaker 0") to derived labels (e.g., a name or role)
    const [speakerMap, setSpeakerMap] = useState<SpeakerMap>({});

    // ClaimEngine state
    const [memories] = useState<Memories>(() => createMemories());
    const [transcriptIndex, setTranscriptIndex] = useState<TranscriptIndex>({
        sentences: [],
    });

    // Track what we've already logged to prevent spam
    const loggedRevisions = useRef<Set<number>>(new Set());

    // Create dispatcher for ClaimEngine
    const dispatcher: Dispatcher = useMemo(
        () => ({
            send: async (
                claimId: string,
                query: string,
                meta: Record<string, any>
            ) => {
                if (!ENABLE_RETRIEVAL) {
                    console.warn(
                        `[Timeline] ENABLE_RETRIEVAL is false, skipping fact-check for ${claimId}`
                    );
                    return;
                }

                // Convert to our existing fact-check flow
                const claim = meta.claim as NormalizedClaim;
                if (!claim) {
                    console.log(
                        `[Timeline] No claim found in meta for ${claimId}`
                    );
                    return;
                }

                // Map to our existing InsightItem format for compatibility
                const insightItem: InsightItem = {
                    id: claim.id,
                    kind: "factcheck" as const,
                    quote: claim.quote,
                    subjectNoun: claim.subjectCanonical || "",
                    searchSeeds: [query],
                    context: claim.context,
                    speakerHint: claim.speakerTag,
                    version: claim.version,
                };

                // Dispatch through existing system
                await askPerplexity({ prompt: query });
            },
        }),
        []
    );

    const [claimEngine] = useState(
        () => new ClaimEngine(DEFAULT_CONFIG, DEFAULT_CLOCK, dispatcher)
    );

    const [pendingRetrievalIds, setPendingRetrievalIds] = useState<Set<string>>(
        new Set()
    );

    const [retriedIds, _setRetriedIds] = useState<Set<string>>(new Set());
    const setRetriedIds = (updater: (prev: Set<string>) => Set<string>) => {
        _setRetriedIds((prev) => updater(new Set(prev)));
    };

    const [factStates, setFactStates] = useState<
        Record<
            string,
            {
                state:
                    | "analyzing"
                    | "searching"
                    | "judging"
                    | "final"
                    | "error";
                verdict?: "supported" | "disputed" | "uncertain";
                confidence?: number;
                rationale?: string;
                citations?: {
                    title: string;
                    url: string;
                    quote?: string;
                    published_at?: string | null;
                }[];
            }
        >
    >({});

    // Stable canonicalization of duplicates by semantic key (kind|quote)
    const [keyToCanonicalId, setKeyToCanonicalId] = useState<
        Record<string, string>
    >({});
    const dedupedInsights = useMemo(() => {
        const byId = new Map<string, InsightItem>();
        for (const it of insights) {
            const prev = byId.get(it.id);
            if (!prev || (it.version ?? 0) >= (prev.version ?? 0)) {
                byId.set(it.id, it);
            }
        }
        // Remove withdrawals
        const filtered = Array.from(byId.values()).filter(
            (it) => it.revisionAction !== "withdrawn"
        );

        // Collapse identical kind+quote and prefer canonical id if assigned
        const byKey = new Map<string, InsightItem>();
        for (const it of filtered) {
            const key = `${it.kind}|${(it.quote || "").trim()}`;
            const current = byKey.get(key);
            const canonicalId = keyToCanonicalId[key];
            if (!current) {
                // pick canonical if matches, else take this one for now
                if (!canonicalId || canonicalId === it.id) byKey.set(key, it);
                else {
                    // keep placeholder until canonical shows up; will be replaced below if seen
                    byKey.set(key, it);
                }
            } else {
                // If we already have one, prefer canonical id; if neither are canonical, keep the one with highest version
                if (canonicalId) {
                    if (it.id === canonicalId) {
                        byKey.set(key, it);
                    } else if (current.id !== canonicalId) {
                        // neither are canonical; keep newer version
                        if ((it.version ?? 0) >= (current.version ?? 0)) {
                            byKey.set(key, it);
                        }
                    }
                } else {
                    if ((it.version ?? 0) >= (current.version ?? 0)) {
                        byKey.set(key, it);
                    }
                }
            }
        }
        return Array.from(byKey.values());
    }, [insights]);

    // Claimify pass: gate, assemble, score, and select dispatch set
    const claimified = useMemo(() => {
        return claimifyPlus(dedupedInsights as any, {
            speakerMap,
            allowFirstPersonIfNamed: true,
            maxOutput: 12,
            maxDispatch: 6,
        });
    }, [dedupedInsights, speakerMap]);
    const rankedIds = useMemo(
        () => new Set(claimified.ranked.map((c) => c.id)),
        [claimified]
    );

    // Debug: which claims are rejected by claimify (not in ranked)
    // useEffect(() => {
    //     if (!dedupedInsights.length) return;
    //     const kept = new Set(claimified.ranked.map((c) => c.id));
    //     const rejected = dedupedInsights.filter((c) => !kept.has(c.id));
    //     if (rejected.length > 0) {
    //         console.log("claimify.stats", {
    //             total: dedupedInsights.length,
    //             ranked: claimified.ranked.length,
    //             toDispatch: claimified.toDispatch.length,
    //         });
    //         console.log(
    //             "claimify.rejected",
    //             rejected.map((r) => ({
    //                 id: r.id,
    //                 subject: r.subjectNoun,
    //                 seeds: r.searchSeeds,
    //                 quote: (r.quote || "").slice(0, 200),
    //             }))
    //         );
    //     }
    // }, [dedupedInsights, claimified]);

    // Update transcript index from final pieces for ClaimEngine
    useEffect(() => {
        const sentences = transcriptFinalPieces.flatMap((piece, pieceIdx) => {
            return (
                piece.turns?.flatMap((turn, turnIdx) => ({
                    idx: pieceIdx * 1000 + turnIdx, // Simple indexing scheme
                    text: turn.words?.map((w) => w.text).join(" ") || "",
                    speakerTag: turn.speaker,
                })) || []
            );
        });

        setTranscriptIndex({ sentences });
    }, [transcriptFinalPieces]);

    // Learn canonical ids for new keys (first seen wins) and keep stable
    useEffect(() => {
        if (!insights.length) return;
        setKeyToCanonicalId((prev: Record<string, string>) => {
            const next = { ...prev };
            for (const it of insights) {
                const key = `${it.kind}|${(it.quote || "").trim()}`;
                if (!next[key]) next[key] = it.id;
            }
            return next;
        });
    }, [insights]);

    // gating moved to fact-utils
    useEffect(() => {
        if (!structuredOutput) {
            console.log(`[Timeline] No structured output to process`);
            return;
        }

        const pick = (
            obj: unknown
        ): {
            items: InsightItem[];
            speakerLabels?: {
                speakerNumber: string;
                speakerDerivedLabel: string;
            }[];
        } => {
            if (!obj || typeof obj !== "object") return { items: [] };
            const rec = obj as Record<string, unknown>;
            let speakerLabels:
                | { speakerNumber: string; speakerDerivedLabel: string }[]
                | undefined;
            if (Array.isArray(rec.items)) {
                if (Array.isArray(rec.speakerLabels)) {
                    speakerLabels = rec.speakerLabels as any;
                }
                return {
                    items: (rec.items as InsightItem[]).map((it) => ({
                        ...it,
                        kind: normalizeKind((it as any).kind),
                        speakerHint:
                            ((it as any).speakerHint as string | undefined) ??
                            ((it as any).speakerTag as string | undefined) ??
                            null,
                    })),
                    speakerLabels,
                };
            }

            const txt = rec.text as unknown;
            if (typeof txt === "string") {
                try {
                    const parsed = JSON.parse(txt);
                    if (
                        parsed &&
                        typeof parsed === "object" &&
                        Array.isArray((parsed as any).items)
                    ) {
                        const sl = Array.isArray((parsed as any).speakerLabels)
                            ? ((parsed as any).speakerLabels as any[])
                            : undefined;
                        return {
                            items: ((parsed as any).items as InsightItem[]).map(
                                (it: any) => ({
                                    ...it,
                                    kind: normalizeKind(it.kind),
                                    speakerHint:
                                        (it.speakerHint as
                                            | string
                                            | undefined) ??
                                        (it.speakerTag as string | undefined) ??
                                        null,
                                })
                            ),
                            speakerLabels: sl,
                        };
                    }
                } catch {
                    /* ignore */
                }
            }
            if (txt && typeof txt === "object") {
                const t = txt as Record<string, unknown>;
                let speakerLabels2:
                    | { speakerNumber: string; speakerDerivedLabel: string }[]
                    | undefined;
                if (Array.isArray((t as any).speakerLabels)) {
                    speakerLabels2 = (t as any).speakerLabels as any;
                }
                if (Array.isArray(t.items))
                    return {
                        items: (t.items as InsightItem[]).map((it) => ({
                            ...it,
                            kind: normalizeKind((it as any).kind),
                            speakerHint:
                                ((it as any).speakerHint as
                                    | string
                                    | undefined) ??
                                ((it as any).speakerTag as
                                    | string
                                    | undefined) ??
                                null,
                        })),
                        speakerLabels: speakerLabels2,
                    };
            }
            return { items: [] };
        };

        const finalPick = pick(structuredOutput.final);
        const deltaPick = pick(structuredOutput.delta);
        const finalItems = finalPick.items;
        const deltaItems = deltaPick.items;

        // Update speaker map if provided
        const labels = finalPick.speakerLabels || deltaPick.speakerLabels;
        if (labels && labels.length > 0) {
            setSpeakerMap((prev: SpeakerMap) => {
                const next: SpeakerMap = { ...prev };
                for (const l of labels) {
                    const key = String(l.speakerNumber || "").trim();
                    const val = String(l.speakerDerivedLabel || "").trim();
                    if (!key) continue;
                    if (val && (!next[key] || next[key]?.name !== val))
                        next[key] = { name: val };
                    // do not overwrite with empty
                }
                return next;
            });
        }

        if (finalItems.length === 0 && deltaItems.length === 0) return;

        const currentRev = structuredOutput.rev || 0;
        const shouldLog = !loggedRevisions.current.has(currentRev);

        // Convert to ClaimEngine format and process
        try {
            const claimItems = [...finalItems, ...deltaItems].map((item) => ({
                id: item.id,
                kind: "factcheck" as const,
                speakerTag: item.speakerHint || item.speakerTag,
                quote: item.quote || "",
                // prefer subjectSpan if present from newer schemas, fallback to subjectNoun
                subjectSpan: (item as any).subjectSpan || item.subjectNoun,
                objectSpan: null,
                timeSpan: null,
                locationSpan: null,
                attributionSpan: null,
                context: item.context,
                contextFragments: item.contextFragments || null,
                contextRequired: null,
                contextReason: null,
                subjectNoun: item.subjectNoun,
                searchSeeds: item.searchSeeds || [],
                version: item.version,
                revisionAction: item.revisionAction as any,
                revisionNote: null,
            }));

            // if (shouldLog) {
            //     console.log(
            //         "📥 [ClaimEngine] Raw incoming items:",
            //         claimItems.length,
            //         claimItems.map((item) => ({
            //             id: item.id,
            //             quote:
            //                 item.quote.slice(0, 80) +
            //                 (item.quote.length > 80 ? "..." : ""),
            //             subjectSpan: item.subjectSpan,
            //             speakerTag: item.speakerTag,
            //             version: item.version,
            //         }))
            //     );
            // }

            const payload: LlmPayload = {
                rev: currentRev,
                speakerLabels: labels,
                items: claimItems,
            };

            // if (shouldLog) {
            //     console.log(
            //         "🏗️ [ClaimEngine] Processing payload - rev:",
            //         payload.rev,
            //         "speakerLabels:",
            //         payload.speakerLabels?.length || 0
            //     );
            // }

            // Process through ClaimEngine
            const normalizedClaims = claimEngine.upsertFromLlm(
                payload,
                transcriptIndex,
                memories
            );

            // if (shouldLog) {
            //     console.log(
            //         "⚡ [ClaimEngine] Normalized claims:",
            //         normalizedClaims.length,
            //         normalizedClaims.map((claim) => ({
            //             id: claim.id,
            //             claimKey: claim.claimKey,
            //             status: claim.status,
            //             subjectCanonical: claim.subjectCanonical,
            //             relationLemma: claim.relationLemma,
            //             confidence: claim.confidence,
            //             quote:
            //                 claim.quote.slice(0, 60) +
            //                 (claim.quote.length > 60 ? "..." : ""),
            //         }))
            //     );
            // }

            // Convert back to InsightItem format for display compatibility
            const convertedInsights = normalizedClaims.map((claim) => ({
                id: claim.id,
                kind: "factcheck" as const,
                quote: claim.quote,
                subjectNoun:
                    claim.subjectCanonical || claim.subjectSurface || "",
                searchSeeds: claim.originalSeeds || [claim.quote],
                context: claim.context,
                contextFragments: claim.contextFragments || undefined,
                speakerHint: claim.speakerTag,
                speakerTag: claim.speakerTag,
                version: claim.version,
                revisionAction:
                    claim.status === "WITHDRAWN"
                        ? ("withdrawn" as const)
                        : undefined,
                // Add ClaimEngine data for enhanced fact card display
                claimEngineData: claim,
            }));

            // if (shouldLog) {
            //     console.log(
            //         "🔄 [ClaimEngine] Converted to insights:",
            //         convertedInsights.length,
            //         convertedInsights.map((insight) => ({
            //             id: insight.id,
            //             status: insight.claimEngineData?.status,
            //             confidence: insight.claimEngineData?.confidence,
            //             verifiable: insight.claimEngineData
            //                 ? isVerifiableNow(insight.claimEngineData)
            //                 : false,
            //         }))
            //     );
            // }

            setInsights((prev) => {
                // Merge with existing insights
                const merged = new Map<string, InsightItem>(
                    prev.map((i) => [i.id, i])
                );

                for (const it of convertedInsights) {
                    const existing = merged.get(it.id);
                    merged.set(it.id, mergeInsight(existing, it));
                }

                const nextList = Array.from(merged.values());

                // Fast equality by id:version signature
                const sameLength = nextList.length === prev.length;
                if (sameLength) {
                    const sig = (arr: InsightItem[]) =>
                        arr
                            .map((i) => `${i.id}:${i.version ?? 0}`)
                            .sort()
                            .join("|");
                    if (sig(nextList) === sig(prev)) return prev;
                }
                return nextList;
            });

            // Run ClaimEngine tick to process any ready claims
            // if (shouldLog) {
            //     console.log(
            //         "⏰ [ClaimEngine] Running tick to process ready claims..."
            //     );
            // }
            claimEngine.tick();

            // Log final state from ClaimEngine
            if (shouldLog) {
                // const engineState = claimEngine.getDisplayableClaims();
                // console.log(
                //     "📊 [ClaimEngine] Final displayable claims:",
                //     engineState.length,
                //     engineState.map((claim) => ({
                //         id: claim.id,
                //         status: claim.status,
                //         confidence: claim.confidence,
                //         verifiable: isVerifiableNow(claim),
                //         claimKey: claim.claimKey,
                //         subjectCanonical: claim.subjectCanonical,
                //         relationLemma: claim.relationLemma,
                //     }))
                // );

                // Mark this revision as logged and clean up old ones to prevent memory leaks
                loggedRevisions.current.add(currentRev);
                if (loggedRevisions.current.size > 50) {
                    const oldestRevs = Array.from(
                        loggedRevisions.current
                    ).slice(0, 25);
                    oldestRevs.forEach((rev) =>
                        loggedRevisions.current.delete(rev)
                    );
                }
            }
        } catch (error) {
            console.error(
                "Error processing claims through ClaimEngine:",
                error
            );

            // Fallback to original logic
            setInsights((prev) => {
                const merged = new Map<string, InsightItem>(
                    prev.map((i) => [i.id, i])
                );

                const updates = [...finalItems, ...deltaItems];
                for (const it of updates) {
                    const existing = merged.get(it.id);
                    merged.set(it.id, mergeInsight(existing, it));
                }
                const nextList = Array.from(merged.values());

                const sameLength = nextList.length === prev.length;
                if (sameLength) {
                    const sig = (arr: InsightItem[]) =>
                        arr
                            .map((i) => `${i.id}:${i.version ?? 0}`)
                            .sort()
                            .join("|");
                    if (sig(nextList) === sig(prev)) return prev;
                }
                return nextList;
            });
        }
    }, [structuredOutput, claimEngine, transcriptIndex, memories]);

    // Retrieval dispatch (live Perplexity via /action/factcheck)
    useEffect(() => {
        if (!insights.length) return;

        // Use claimify selections
        const ranked = claimified.ranked;
        const dispatchSet = claimified.toDispatch;

        // Only allow the canonical id per semantic key to dispatch
        const canonicalRanked = ranked.filter((it) => {
            const key = `${it.kind}|${(it.quote || "").trim()}`;
            const canonicalId = keyToCanonicalId[key];
            return !canonicalId || canonicalId === it.id;
        });

        // 2) Determine which claims need retrieval (not already in flight or finalized)
        // 2) Determine which claims need retrieval (not already in flight or finalized)
        const toDispatch = dispatchSet.filter((it: InsightItem) => {
            const fs = factStates[it.id];
            const alreadyFinal = fs?.state === "final";
            const inFlight = pendingRetrievalIds.has(it.id);
            if (alreadyFinal || inFlight) return false;

            // NEW: First-person subject gating w/ optional normalization to a name
            const gate = gateAndNormalizeFirstPerson(
                { subjectNoun: it.subjectNoun, speakerHint: it.speakerHint },
                { speakerMap, allowFirstPersonIfNamed: true }
            );

            if (!gate.ok) return false;

            // If normalized subject exists, reflect it for retrieval (non-destructive)
            if (gate.normalizedSubject) {
                it.subjectNoun = gate.normalizedSubject;
                // Optionally, augment seeds to include the normalized subject:
                const seeds = new Set([...(it.searchSeeds ?? [])]);
                seeds.add(gate.normalizedSubject);
                it.searchSeeds = Array.from(seeds);
            }
            return true;
        });

        // Debug: dropped at dispatch stage (final/in-flight/gate)
        const toDispatchIds = new Set(toDispatch.map((x) => x.id));
        const droppedAtDispatch = dispatchSet.filter(
            (x) => !toDispatchIds.has(x.id)
        );
        // if (droppedAtDispatch.length > 0) {
        //     console.log(
        //         "dispatch.rejected",
        //         droppedAtDispatch.map((r) => ({
        //             id: r.id,
        //             reason:
        //                 factStates[r.id]?.state === "final" ||
        //                 insights.find((i) => i.id === r.id)?.factCheckState ===
        //                     "final"
        //                     ? "already_final"
        //                     : pendingRetrievalIds.has(r.id)
        //                       ? "in_flight"
        //                       : "gate",
        //             subject: r.subjectNoun,
        //             seeds: r.searchSeeds,
        //             quote: (r.quote || "").slice(0, 200),
        //         }))
        //     );
        // }

        if (toDispatch.length === 0) return;
        if (!ENABLE_RETRIEVAL) return; // skip network calls while testing

        // 3) Mark as in-flight
        setPendingRetrievalIds((prev) => {
            const next = new Set(prev);
            for (const it of toDispatch) next.add(it.id);
            return next;
        });

        // 4) Build requests with stronger search hints
        const requests = toDispatch.map((it) => {
            const seeds = new Set<string>([...(it.searchSeeds ?? [])]);
            if (it.subjectNoun) seeds.add(it.subjectNoun);
            // crude harvest: numbers, years, capitalized entities
            const q = it.quote || "";
            const nums = q.match(/(\$)?\b\d[\d,]*(?:\.\d+)?\b/g) || [];
            const years = q.match(/\b(1[89]\d{2}|20\d{2}|21\d{2})\b/g) || [];
            const caps =
                q.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g) || [];
            nums.forEach((x) => seeds.add(x.replace(/,/g, "")));
            years.forEach((y) => seeds.add(y));
            caps.forEach((c) => seeds.add(c));
            const ctx =
                it.context || (it.contextFragments?.[0] ?? null) || undefined;
            return {
                id: it.id,
                quote: it.quote,
                context: ctx,
                seeds: Array.from(seeds).slice(0, 6),
            };
        });

        dispatchFactChecks(requests, askPerplexity as AskFn, (u) => {
            // console.log(
            //     `[Timeline] Received fact-check update for ${u.id}:`,
            //     u
            // );

            setFactStates((prev) => {
                const next = { ...prev };
                next[u.id] = {
                    state: u.state,
                    verdict: u.verdict ?? next[u.id]?.verdict,
                    confidence: u.confidence ?? next[u.id]?.confidence,
                    rationale: u.rationale ?? next[u.id]?.rationale,
                    citations: u.citations ?? next[u.id]?.citations,
                };
                // console.log(
                //     `[Timeline] Updated factStates for ${u.id}:`,
                //     next[u.id]
                // );
                return next;
            });

            // Clear pending when terminal
            if (u.state === "final" || u.state === "error") {
                setPendingRetrievalIds((prev) => {
                    const next = new Set(prev);
                    next.delete(u.id);
                    return next;
                });
            }

            // Reflect into insights for UI
            setInsights((prev) =>
                prev.map((item) => {
                    if (item.id !== u.id) return item;
                    const patch: Partial<InsightItem> = {};
                    if (u.state === "searching" || u.state === "judging")
                        patch.factCheckState = u.state;
                    if (u.state === "final") {
                        patch.factCheckState = "final";
                        patch.factCheckVerdict = u.verdict!;
                        patch.factCheckConfidence = u.confidence ?? null;
                        patch.factCheckRationale = u.rationale ?? null;
                    }
                    if (u.state === "error") patch.factCheckState = "retrying";
                    return mergeInsight(item, patch as InsightItem);
                })
            );

            // One-shot retry on uncertain with neutralized seeds
            if (u.state === "final" && u.verdict === "uncertain") {
                setPendingRetrievalIds((prev) => {
                    const next = new Set(prev);
                    next.delete(u.id);
                    return next;
                });
                setRetriedIds((prev) => {
                    prev.add(u.id);
                    return prev;
                });
                // build neutral seeds
                const base = insights.find((x) => x.id === u.id);
                if (base && !_hasRetried(u.id)) {
                    const neutralSeeds = (base.searchSeeds || [])
                        .map((s) =>
                            s
                                .replace(
                                    /\b(very|highly|extremely|massive|huge|tiny|small|big)\b/gi,
                                    ""
                                )
                                .trim()
                        )
                        .filter(Boolean);
                    const years =
                        base.quote.match(/\b(1[89]\d{2}|20\d{2}|21\d{2})\b/g) ||
                        [];
                    const nums = (
                        base.quote.match(/\b\d[\d,]*(?:\.\d+)?\b/g) || []
                    ).map((n) => n.replace(/,/g, ""));
                    const ctx =
                        base.context ||
                        (base.contextFragments?.[0] ?? undefined);
                    const retryReq = [
                        {
                            id: base.id,
                            quote: base.quote,
                            context: ctx,
                            seeds: Array.from(
                                new Set([...neutralSeeds, ...years, ...nums])
                            ).slice(0, 6),
                        },
                    ];
                    setPendingRetrievalIds((prev) =>
                        new Set(prev).add(base.id)
                    );
                    if (ENABLE_RETRIEVAL) {
                        dispatchFactChecks(
                            retryReq as any,
                            askPerplexity as AskFn,
                            (u2) => {
                                setFactStates((prev2) => {
                                    const next2 = { ...prev2 };
                                    next2[u2.id] = {
                                        state: u2.state,
                                        verdict:
                                            u2.verdict ?? next2[u2.id]?.verdict,
                                        confidence:
                                            u2.confidence ??
                                            next2[u2.id]?.confidence,
                                        rationale:
                                            u2.rationale ??
                                            next2[u2.id]?.rationale,
                                        citations:
                                            u2.citations ??
                                            next2[u2.id]?.citations,
                                    };
                                    return next2;
                                });
                                if (
                                    u2.state === "final" ||
                                    u2.state === "error"
                                ) {
                                    setPendingRetrievalIds((prev3) => {
                                        const next3 = new Set(prev3);
                                        next3.delete(u2.id);
                                        return next3;
                                    });
                                }
                            }
                        );
                    }
                }
                return;
            }

            if (u.state === "final" || u.state === "error") {
                setPendingRetrievalIds((prev) => {
                    const next = new Set(prev);
                    next.delete(u.id);
                    return next;
                });
            }
        });
    }, [insights]);

    // Helpers to find sentence boundaries and nth occurrence
    const findNthOccurrence = (
        haystack: string,
        needle: string,
        occurrence: number
    ): number => {
        if (!needle) return -1;
        let idx = -1;
        let from = 0;
        let count = 0;
        while (true) {
            idx = haystack.indexOf(needle, from);
            if (idx === -1) return -1;
            count += 1;
            if (count === Math.max(1, occurrence)) return idx;
            from = idx + needle.length;
        }
    };

    // Flexible matcher: tolerate punctuation/whitespace/casing differences between LLM quote and transcript
    const flexibleFind = (
        text: string,
        quote: string
    ): { index: number; matchLen: number } | null => {
        const tokens = (quote.match(/[A-Za-z0-9]+/g) || []).filter(Boolean);
        if (tokens.length === 0) return null;
        const pattern = tokens
            .map((t) => t.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"))
            .join("\\W+");
        try {
            const re = new RegExp(pattern, "i");
            const m = re.exec(text);
            if (!m) return null;
            return { index: m.index, matchLen: m[0].length };
        } catch {
            return null;
        }
    };

    const quoteRoughlyInText = (text: string, quote: string): boolean => {
        if (!text || !quote) return false;
        if (text.includes(quote)) return true;
        return !!flexibleFind(text, quote);
    };

    const _hasRetried = (id: string) => {
        return (retriedIds?.has && retriedIds.has(id)) || false;
    };

    const sentenceBoundsForIndex = (
        text: string,
        idx: number,
        quoteLen: number
    ): { start: number; end: number } => {
        if (idx < 0) return { start: 0, end: text.length };
        const punct = /[\.!?]/g;
        let start = 0;
        let end = text.length;
        let m: RegExpExecArray | null;
        while ((m = punct.exec(text)) !== null) {
            if (m.index < idx) start = m.index + 1;
            else break;
        }
        punct.lastIndex = idx + quoteLen;
        const next = punct.exec(text);
        if (next) end = next.index + 1;
        while (start < text.length && /\s/.test(text[start])) start++;
        while (end > 0 && /\s/.test(text[end - 1])) end--;
        return { start, end };
    };

    const turnTextFromWords = (words?: Word[]) =>
        (words ?? []).map((w) => w.punctuatedWord || w.text).join(" ");

    const turnTextFromPhrases = (
        turn: Turn,
        phrases?: PhraseDisplay[]
    ): string => {
        if (!phrases || phrases.length === 0) return "";
        const parts: string[] = [];
        for (const p of phrases) {
            if (p.start >= turn.start && p.end <= turn.end) {
                if (p.textNorm && p.textNorm.trim().length > 0) {
                    parts.push(p.textNorm);
                }
            }
        }
        return parts.join(" ");
    };

    // Accumulate diarized final turns into displayTurns, merging contiguous same-speaker entries across pieces
    useEffect(() => {
        const newPieces = transcriptFinalPieces.slice(
            lastProcessedPieceIdx.current
        );
        if (!newPieces.length) return;
        setDisplayTurns((prev) => {
            const result = [...prev];
            newPieces.forEach((p) => {
                const turns = (p.turns || []) as Turn[];
                const incomingRaw = turns
                    .map((t) => {
                        const textFromPhrases = turnTextFromPhrases(
                            t,
                            p.phrasesDisplay
                        );
                        const text = textFromPhrases
                            ? textFromPhrases
                            : turnTextFromWords(t.words);
                        return {
                            speaker: t.speaker || "?",
                            text,
                        };
                    })
                    .filter((e) => e.text && e.text.trim().length > 0);
                // Merge within incoming
                const incoming: { speaker: string; text: string }[] = [];
                incomingRaw.forEach((e) => {
                    if (
                        incoming.length > 0 &&
                        incoming[incoming.length - 1].speaker === e.speaker
                    ) {
                        incoming[incoming.length - 1] = {
                            speaker: e.speaker,
                            text: `${incoming[incoming.length - 1].text} ${
                                e.text
                            }`.trim(),
                        };
                    } else {
                        incoming.push(e);
                    }
                });
                // Merge with accumulated result
                incoming.forEach((e) => {
                    if (
                        result.length > 0 &&
                        result[result.length - 1].speaker === e.speaker
                    ) {
                        result[result.length - 1] = {
                            speaker: e.speaker,
                            text: `${result[result.length - 1].text} ${
                                e.text
                            }`.trim(),
                        };
                    } else {
                        result.push(e);
                    }
                });
            });
            return result;
        });
        lastProcessedPieceIdx.current = transcriptFinalPieces.length;
    }, [transcriptFinalPieces]);

    const formatDuration = (secs: number) => {
        const m = Math.floor((secs || 0) / 60)
            .toString()
            .padStart(2, "0");
        const s = ((secs || 0) % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    };

    return (
        <div className="bg-card/50 border rounded-xl p-4">
            <div className="flex justify-end mb-2">
                <div className="flex items-center gap-3 text-xs text-foreground/75">
                    <span>
                        {
                            (transcriptFinal.text || "")
                                .split(/\s+/)
                                .filter(Boolean).length
                        }{" "}
                        words
                    </span>
                    <span>•</span>
                    <span>{formatDuration(recordingDuration)}</span>
                    <button
                        onClick={onClear}
                        disabled={!canClear}
                        className="px-2 py-1 rounded-md border hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                        title="Clear transcript and structured output"
                    >
                        Clear
                    </button>
                </div>
            </div>
            {/* Real-time Transcript */}
            <ScrollArea className="min-h-[50vh]">
                <div className="font-mono text-sm whitespace-pre-wrap text-foreground/75 p-1">
                    {displayTurns.length > 0 ? (
                        <div className="space-y-1">
                            {displayTurns.map((t, i) => {
                                // BEFORE gating: all fact items whose quote appears in this turn
                                const preCandidates = dedupedInsights.filter(
                                    (it) =>
                                        it.kind === "factcheck" &&
                                        (t.text && it.quote
                                            ? quoteRoughlyInText(
                                                  t.text,
                                                  it.quote
                                              )
                                            : false)
                                );

                                // Align on-screen with claimify ranking
                                const matched = preCandidates.filter((it) =>
                                    rankedIds.has(it.id)
                                );
                                // if (
                                //     preCandidates.length > 0 &&
                                //     matched.length < preCandidates.length
                                // ) {
                                //     const dropped = preCandidates.filter(
                                //         (x) => !rankedIds.has(x.id)
                                //     );
                                //     console.log(
                                //         "render.rejected_by_rank",
                                //         dropped.map((r) => ({
                                //             id: r.id,
                                //             subject: r.subjectNoun,
                                //             seeds: r.searchSeeds,
                                //             quote: (r.quote || "").slice(
                                //                 0,
                                //                 200
                                //             ),
                                //         }))
                                //     );
                                // }
                                if (matched.length === 0) {
                                    return (
                                        <div
                                            key={`live-turn-${i}`}
                                            className="flex flex-col gap-2 items-start mb-4"
                                        >
                                            <span className="text-foreground/50">
                                                {t.speaker
                                                    ? `Speaker ${t.speaker}`
                                                    : "?"}
                                            </span>
                                            <span>{t.text}</span>
                                        </div>
                                    );
                                }

                                type Anchor = {
                                    end: number;
                                    items: InsightItem[];
                                    start: number;
                                };
                                const anchors: Anchor[] = [];
                                matched.forEach((it) => {
                                    const occ = it.occurrence || 1;
                                    let quoteIdx = findNthOccurrence(
                                        t.text,
                                        it.quote,
                                        occ
                                    );
                                    let effQuoteLen = it.quote.length;
                                    if (quoteIdx < 0) {
                                        const flex = flexibleFind(
                                            t.text,
                                            it.quote
                                        );
                                        if (!flex) return;
                                        quoteIdx = flex.index;
                                        effQuoteLen = flex.matchLen;
                                    }
                                    const { start, end } =
                                        sentenceBoundsForIndex(
                                            t.text,
                                            quoteIdx,
                                            effQuoteLen
                                        );
                                    const existing = anchors.find(
                                        (a) =>
                                            a.end === end && a.start === start
                                    );
                                    if (existing) {
                                        // Ensure unique by id within an anchor
                                        if (
                                            !existing.items.find(
                                                (x) => x.id === it.id
                                            )
                                        ) {
                                            existing.items.push(it);
                                        }
                                    } else
                                        anchors.push({
                                            start,
                                            end,
                                            items: [it],
                                        });
                                });
                                anchors.sort((a, b) => a.end - b.end);

                                const parts: React.ReactNode[] = [];
                                const breakoutBlocks: React.ReactNode[] = [];
                                let cursor = 0;
                                anchors.forEach((a, idxA) => {
                                    if (a.start > cursor)
                                        parts.push(
                                            <span key={`seg-${i}-${idxA}-pre`}>
                                                {t.text.slice(cursor, a.end)}
                                            </span>
                                        );
                                    else
                                        parts.push(
                                            <span
                                                key={`seg-${i}-${idxA}-pre-over`}
                                            >
                                                {t.text.slice(cursor, a.end)}
                                            </span>
                                        );
                                    // Clarify/Contradict rendering disabled
                                    const factCardsToRender = a.items.filter(
                                        (it) =>
                                            it.kind === "factcheck" &&
                                            rankedIds.has(it.id) &&
                                            // Only render if verifiable (when claimEngineData is available)
                                            (!it.claimEngineData ||
                                                isVerifiableNow(
                                                    it.claimEngineData
                                                ))
                                    );

                                    // Fact card rendering logs disabled to prevent spam on every render

                                    parts.push(
                                        <AnimatePresence initial={false}>
                                            {factCardsToRender.map((it) => (
                                                <motion.div
                                                    key={`fc-${i}-${it.id}`}
                                                    className="my-4 w-full"
                                                    aria-live="polite"
                                                    initial={{
                                                        opacity: 0,
                                                        y: 8,
                                                        scale: 0.98,
                                                    }}
                                                    animate={{
                                                        opacity: 1,
                                                        y: 0,
                                                        scale: 1,
                                                    }}
                                                    exit={{
                                                        opacity: 0,
                                                        y: -6,
                                                        scale: 0.98,
                                                    }}
                                                    transition={{
                                                        duration: 0.28,
                                                        ease: [
                                                            0.22, 0.6, 0.36, 1,
                                                        ],
                                                    }}
                                                    layout
                                                >
                                                    <FactCheckCard
                                                        key={`fc-${i}-${it.id}:${it.version ?? 0}`}
                                                        id={String(it.id)}
                                                        state={
                                                            // Prefer live retrieval factStates first
                                                            factStates[it.id]
                                                                ?.state ===
                                                            "final"
                                                                ? "final"
                                                                : factStates[
                                                                        it.id
                                                                    ]?.state ===
                                                                    "judging"
                                                                  ? "judging"
                                                                  : factStates[
                                                                          it.id
                                                                      ]
                                                                          ?.state ===
                                                                      "searching"
                                                                    ? "searching"
                                                                    : // Then fall back to ClaimEngine status if available
                                                                      it
                                                                            .claimEngineData
                                                                            ?.status ===
                                                                        "READY"
                                                                      ? "analyzing"
                                                                      : it
                                                                              .claimEngineData
                                                                              ?.status ===
                                                                          "QUEUED"
                                                                        ? "searching"
                                                                        : it
                                                                                .claimEngineData
                                                                                ?.status ===
                                                                            "CHECKING"
                                                                          ? "judging"
                                                                          : it
                                                                                  .claimEngineData
                                                                                  ?.status ===
                                                                              "VERIFIED"
                                                                            ? "final"
                                                                            : it
                                                                                    .claimEngineData
                                                                                    ?.status ===
                                                                                "REFUTED"
                                                                              ? "final"
                                                                              : it
                                                                                      .claimEngineData
                                                                                      ?.status ===
                                                                                  "UNCERTAIN"
                                                                                ? "final"
                                                                                : (it.factCheckState as any) ||
                                                                                  "analyzing"
                                                        }
                                                        claim={it.quote}
                                                        subject={
                                                            // Prefer ClaimEngine canonical subject
                                                            it.claimEngineData
                                                                ?.subjectCanonical ||
                                                            it.claimEngineData
                                                                ?.subjectSurface ||
                                                            it.subjectNoun ||
                                                            undefined
                                                        }
                                                        seeds={
                                                            (it.searchSeeds as
                                                                | string[]
                                                                | null) ||
                                                            undefined
                                                        }
                                                        context={
                                                            it.context ||
                                                            undefined
                                                        }
                                                        verdict={
                                                            // Prefer retrieval verdict, then map ClaimEngine status
                                                            (it.factCheckVerdict as any) ??
                                                            (it.claimEngineData
                                                                ?.status ===
                                                            "VERIFIED"
                                                                ? "supported"
                                                                : it
                                                                        .claimEngineData
                                                                        ?.status ===
                                                                    "REFUTED"
                                                                  ? "disputed"
                                                                  : it
                                                                          .claimEngineData
                                                                          ?.status ===
                                                                      "UNCERTAIN"
                                                                    ? "uncertain"
                                                                    : undefined)
                                                        }
                                                        confidence={
                                                            // Prefer retrieval, then ClaimEngine confidence
                                                            it.factCheckConfidence ??
                                                            factStates[it.id]
                                                                ?.confidence ??
                                                            it.claimEngineData
                                                                ?.confidence ??
                                                            undefined
                                                        }
                                                        rationale={
                                                            it.factCheckRationale ??
                                                            factStates[it.id]
                                                                ?.rationale ??
                                                            undefined
                                                        }
                                                        citations={(
                                                            factStates[it.id]
                                                                ?.citations ||
                                                            []
                                                        ).map((c) => ({
                                                            url: c.url,
                                                            title: c.title,
                                                            published_at:
                                                                c.published_at ??
                                                                null,
                                                            quote:
                                                                (c as any)
                                                                    .quote ||
                                                                "",
                                                        }))}
                                                        nowISO={undefined}
                                                        claimEngineData={
                                                            it.claimEngineData
                                                        }
                                                    />
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    );
                                    cursor = a.end;
                                });
                                if (cursor < t.text.length) {
                                    parts.push(
                                        <span key={`seg-${i}-tail`}>
                                            {t.text.slice(cursor)}
                                        </span>
                                    );
                                }

                                return (
                                    <div
                                        key={`live-turn-${i}`}
                                        className="flex flex-col gap-2 items-start mb-4"
                                    >
                                        <span className="text-foreground/50">
                                            {t.speaker
                                                ? `Speaker ${t.speaker}`
                                                : "?"}
                                        </span>
                                        <span>{parts}</span>
                                        {breakoutBlocks}
                                    </div>
                                );
                            })}
                            {isRecording && transcriptInterim.text && (
                                <div className="flex gap-2 items-start">
                                    <span className="shrink-0 rounded bg-muted text-foreground/80">
                                        {displayTurns[displayTurns.length - 1]
                                            ?.speaker || "?"}
                                    </span>
                                    <span className="text-muted-foreground/50 animate-pulse">
                                        {transcriptInterim.text}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <span className="text-foreground/75 block">
                            {(transcriptFinal.text || "").trim()}
                            {isRecording && transcriptInterim.text && (
                                <span className="text-muted-foreground/50 animate-pulse">
                                    {" "}
                                    {transcriptInterim.text}
                                </span>
                            )}
                        </span>
                    )}
                </div>
                <ScrollBar orientation="vertical" />
            </ScrollArea>
        </div>
    );
};
