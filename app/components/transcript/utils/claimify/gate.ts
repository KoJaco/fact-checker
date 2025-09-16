import type { NormalizedClaim } from "./types";

// Heuristic: detect numeric evidence (e.g., percentages and number words) in the quote text
function quoteContainsNumericEvidence(text?: string): boolean {
    if (!text) return false;
    const t = text.toLowerCase();
    // numeric digits and percentages
    if (/%|\b\d{1,3}\s*%\b/.test(t)) return true;
    // common number words and percentage phrases
    const numberWords = [
        "zero",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
        "eleven",
        "twelve",
        "thirteen",
        "fourteen",
        "fifteen",
        "sixteen",
        "seventeen",
        "eighteen",
        "nineteen",
        "twenty",
        "thirty",
        "forty",
        "fifty",
        "sixty",
        "seventy",
        "eighty",
        "ninety",
        "hundred",
        "thousand",
    ];
    const percentagePhrases = ["percent", "percentage"]; // handles "ninety four percent"
    const hasNumberWord = numberWords.some((w) => t.includes(` ${w} `));
    const hasPercentWord = percentagePhrases.some((w) => t.includes(` ${w}`));
    return hasNumberWord && hasPercentWord;
}

/**
 * Score the verifiability of a normalized claim (0..1 scale)
 */
export function scoreVerifiability(claim: NormalizedClaim): number {
    let score = 0;

    // +0.40 if subjectCanonical is present (who/what is the claim about?)
    if (claim.subjectCanonical && claim.subjectCanonical.trim().length > 0) {
        score += 0.4;
    }

    // +0.25 if relationLemma is present (what action/relationship?)
    if (claim.relationLemma && claim.relationLemma.trim().length > 0) {
        score += 0.25;
    }

    // +0.20 if we have quantitative data, time context, or object
    if (claim.quantityText || claim.timeNormalized || claim.objectCanonical) {
        score += 0.2;
    }

    // +0.20 if quote contains numeric evidence like percentages, even if not parsed
    if (quoteContainsNumericEvidence(claim.quote)) {
        score += 0.2;
    }

    // +0.10 if we have location or scope context
    if (claim.locationNormalized || claim.scope) {
        score += 0.1;
    }

    // -0.15 if the quote contains hedging language that makes verification difficult
    const hedgingPattern =
        /\b(might|may|could|likely|appears to|seems to|probably|possibly|allegedly|reportedly|supposedly)\b/i;
    if (hedgingPattern.test(claim.quote)) {
        score -= 0.15;
    }

    // Additional penalties for ambiguous or unverifiable content

    // -0.10 if subject is still pronouny/unclear after resolution
    if (
        !claim.subjectCanonical ||
        /\b(he|she|it|they|this|that)\b/i.test(claim.subjectCanonical)
    ) {
        score -= 0.1;
    }

    // -0.05 if the relation is very generic
    const genericRelations = ["be", "have", "do", "say", "go", "get", "make"];
    if (
        claim.relationLemma &&
        genericRelations.includes(claim.relationLemma.toLowerCase())
    ) {
        // If we already have numeric/context evidence, don't penalize generic relation
        const hasContextEvidence =
            !!claim.quantityText ||
            !!claim.timeNormalized ||
            !!claim.objectCanonical ||
            quoteContainsNumericEvidence(claim.quote);
        if (!hasContextEvidence) {
            score -= 0.05;
        }
    }

    // Bonus for specific types of verifiable content

    // +0.05 if we have attribution to a specific source
    if (claim.attributionSource && claim.attributionSource.trim().length > 0) {
        score += 0.05;
    }

    // +0.05 if we have numeric data with units/comparators
    if (claim.quantityValue !== undefined && claim.quantityValue !== null) {
        score += 0.05;
    }

    // Ensure score is within bounds
    return Math.max(0, Math.min(1, score));
}

/**
 * Determine if a claim is verifiable enough to dispatch for fact-checking
 */
export function isVerifiableNow(
    claim: NormalizedClaim,
    minScore: number = 0.6
): boolean {
    const score = scoreVerifiability(claim);

    // Basic score threshold
    if (score < minScore) {
        return false;
    }

    // Additional hard requirements regardless of score

    // Must have a resolved subject
    if (!claim.subjectCanonical || claim.subjectCanonical.trim().length === 0) {
        return false;
    }

    // Must have some kind of relation/predicate
    if (!claim.relationLemma || claim.relationLemma.trim().length === 0) {
        return false;
    }

    // Must not be in a status that prevents verification
    const unverifiableStatuses = ["WITHDRAWN", "PENDING_COREF"];
    if (unverifiableStatuses.includes(claim.status)) {
        return false;
    }

    return true;
}

/**
 * Get a human-readable explanation of why a claim scored as it did
 */
export function explainVerifiabilityScore(claim: NormalizedClaim): {
    score: number;
    breakdown: string[];
    verifiable: boolean;
} {
    const breakdown: string[] = [];
    let score = 0;

    if (claim.subjectCanonical && claim.subjectCanonical.trim().length > 0) {
        score += 0.4;
        breakdown.push("+0.40 for clear subject");
    } else {
        breakdown.push("0.00 - missing clear subject");
    }

    if (claim.relationLemma && claim.relationLemma.trim().length > 0) {
        score += 0.25;
        breakdown.push("+0.25 for identified relation");
    } else {
        breakdown.push("0.00 - missing relation");
    }

    if (claim.quantityText || claim.timeNormalized || claim.objectCanonical) {
        score += 0.2;
        breakdown.push("+0.20 for context data");
    } else {
        breakdown.push("0.00 - missing context data");
    }

    if (quoteContainsNumericEvidence(claim.quote)) {
        score += 0.2;
        breakdown.push(
            "+0.20 for numeric evidence in quote (e.g., percentage)"
        );
    }

    if (claim.locationNormalized || claim.scope) {
        score += 0.1;
        breakdown.push("+0.10 for location/scope");
    } else {
        breakdown.push("0.00 - missing location/scope");
    }

    const hedgingPattern =
        /\b(might|may|could|likely|appears to|seems to|probably|possibly|allegedly|reportedly|supposedly)\b/i;
    if (hedgingPattern.test(claim.quote)) {
        score -= 0.15;
        breakdown.push("-0.15 for hedging language");
    }

    if (
        !claim.subjectCanonical ||
        /\b(he|she|it|they|this|that)\b/i.test(claim.subjectCanonical)
    ) {
        score -= 0.1;
        breakdown.push("-0.10 for unclear subject");
    }

    const genericRelations = ["be", "have", "do", "say", "go", "get", "make"];
    if (
        claim.relationLemma &&
        genericRelations.includes(claim.relationLemma.toLowerCase())
    ) {
        const hasContextEvidence =
            !!claim.quantityText ||
            !!claim.timeNormalized ||
            !!claim.objectCanonical ||
            quoteContainsNumericEvidence(claim.quote);
        if (!hasContextEvidence) {
            score -= 0.05;
            breakdown.push("-0.05 for generic relation");
        }
    }

    if (claim.attributionSource && claim.attributionSource.trim().length > 0) {
        score += 0.05;
        breakdown.push("+0.05 for attribution source");
    }

    if (claim.quantityValue !== undefined && claim.quantityValue !== null) {
        score += 0.05;
        breakdown.push("+0.05 for numeric data");
    }

    score = Math.max(0, Math.min(1, score));

    return {
        score,
        breakdown,
        verifiable: isVerifiableNow(claim),
    };
}
