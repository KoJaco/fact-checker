// Main exports for the claimify system
export * from "./types";
export * from "./memories";
export * from "./context";
export * from "./subject";
export * from "./normalize";
export * from "./key";
export * from "./gate";
export * from "./state";
export * from "./queue";
export * from "./query";

// Re-export key classes and functions for easy access
export { ClaimEngine } from "./queue";
export { ClaimRecord } from "./state";
export {
    SimpleEntityDeque,
    createMemories,
    updateMemoriesFromText,
} from "./memories";
export { isPronounySubject, resolveSubject } from "./subject";
export { buildSearchQuery, buildRetryQuery } from "./query";
export { makeClaimKey, debugClaimKey } from "./key";
export {
    scoreVerifiability,
    isVerifiableNow,
    explainVerifiabilityScore,
} from "./gate";
export {
    extractRelation,
    extractObject,
    extractQuantity,
    normalizeTime,
    normalizeLocation,
} from "./normalize";
export {
    findQuoteInSentences,
    harvestAdjacent,
    scanNearbyForFragments,
    autoAttachContext,
    TITLE_NP,
    ORG_SUFFIX,
    PROPER_SEQ,
    ACRONYM,
    TIME_PHRASE,
} from "./context";

// Default configuration
export const DEFAULT_CONFIG = {
    debounceMs: 3000,
    pendingCorefTimeoutMs: 12000,
    maxQueuePerMinute: 10,
};

// Default clock implementation
export const DEFAULT_CLOCK = {
    now: () => Date.now(),
};
