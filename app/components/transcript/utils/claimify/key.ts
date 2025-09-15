import type { NormalizedClaim } from "./types";

/**
 * Simple 32-bit DJB2 hash function for stable hashing
 */
function stableHash(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) + hash + str.charCodeAt(i); // hash * 33 + c
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}

/**
 * Create a stable claim key for deduplication based on normalized slots
 */
export function makeClaimKey(
    claim: Pick<
        NormalizedClaim,
        | "subjectCanonical"
        | "relationLemma"
        | "objectCanonical"
        | "timeNormalized"
        | "locationNormalized"
        | "polarity"
    >
): string {
    // Build a canonical string representation
    const parts: string[] = [];

    // Core claim components
    if (claim.subjectCanonical) {
        parts.push(`subj:${claim.subjectCanonical.toLowerCase()}`);
    }

    if (claim.relationLemma) {
        parts.push(`rel:${claim.relationLemma.toLowerCase()}`);
    }

    if (claim.objectCanonical) {
        parts.push(`obj:${claim.objectCanonical.toLowerCase()}`);
    }

    // Polarity is important for differentiation
    parts.push(`pol:${claim.polarity}`);

    // Context components (optional but help with disambiguation)
    if (claim.timeNormalized) {
        parts.push(`time:${claim.timeNormalized}`);
    }

    if (claim.locationNormalized) {
        parts.push(`loc:${claim.locationNormalized.toLowerCase()}`);
    }

    // Join with separator and hash for stable key
    const canonical = parts.join("|");
    return stableHash(canonical);
}

/**
 * Check if two claim keys are equivalent (for testing/debugging)
 */
export function claimKeysEqual(key1: string, key2: string): boolean {
    return key1 === key2;
}

/**
 * Generate a human-readable representation of the claim key components (for debugging)
 */
export function debugClaimKey(
    claim: Pick<
        NormalizedClaim,
        | "subjectCanonical"
        | "relationLemma"
        | "objectCanonical"
        | "timeNormalized"
        | "locationNormalized"
        | "polarity"
    >
): string {
    const parts: string[] = [];

    if (claim.subjectCanonical) parts.push(`subj:${claim.subjectCanonical}`);
    if (claim.relationLemma) parts.push(`rel:${claim.relationLemma}`);
    if (claim.objectCanonical) parts.push(`obj:${claim.objectCanonical}`);
    parts.push(`pol:${claim.polarity}`);
    if (claim.timeNormalized) parts.push(`time:${claim.timeNormalized}`);
    if (claim.locationNormalized) parts.push(`loc:${claim.locationNormalized}`);

    return parts.join(" | ");
}
