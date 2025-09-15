import type { NormalizedClaim } from "./types";

/**
 * Build a search query for fact-checking based on the normalized claim
 */
export function buildSearchQuery(claim: NormalizedClaim): {
    q: string;
    tags: string[];
} {
    const parts: string[] = [];
    const tags: string[] = [];

    // Determine query template based on claim characteristics
    if (claim.attributionSource) {
        // Attributed claim template: "Did [SOURCE] say that [SUBJECT] [RELATION] [OBJECT]"
        return buildAttributedQuery(claim);
    } else if (
        claim.quantityValue !== undefined &&
        claim.quantityValue !== null
    ) {
        // Numeric/metric template: "[SUBJECT] [METRIC] [QUANTITY] [SCOPE] [TIME]"
        return buildNumericQuery(claim);
    } else {
        // General event/fact template: "[SUBJECT] [RELATION] [OBJECT] [SCOPE] [TIME]"
        return buildEventQuery(claim);
    }
}

/**
 * Build query for attributed claims
 */
function buildAttributedQuery(claim: NormalizedClaim): {
    q: string;
    tags: string[];
} {
    const parts: string[] = [];
    const tags: string[] = ["attributed"];

    parts.push("Did");

    if (claim.attributionSource) {
        parts.push(claim.attributionSource);
        tags.push("source:" + claim.attributionSource.toLowerCase());
    }

    parts.push("say that");

    if (claim.subjectCanonical) {
        parts.push(claim.subjectCanonical);
        tags.push("subject:" + claim.subjectCanonical.toLowerCase());
    }

    if (claim.relationLemma) {
        // Use appropriate verb form for attribution context
        const verbForm = getVerbForm(claim.relationLemma, claim.polarity);
        parts.push(verbForm);
        tags.push("relation:" + claim.relationLemma);
    }

    if (claim.objectCanonical) {
        parts.push(claim.objectCanonical);
        tags.push("object:" + claim.objectCanonical.toLowerCase());
    }

    // Add quantity if present
    if (claim.quantityText) {
        parts.push(claim.quantityText);
        tags.push("quantity");
    }

    // Add temporal context
    if (claim.timeNormalized) {
        parts.push("in " + claim.timeNormalized);
        tags.push("time:" + claim.timeNormalized);
    }

    // Add scope context
    if (claim.scope) {
        parts.push(claim.scope);
        tags.push("scope");
    }

    return {
        q: parts.join(" "),
        tags,
    };
}

/**
 * Build query for numeric/metric claims
 */
function buildNumericQuery(claim: NormalizedClaim): {
    q: string;
    tags: string[];
} {
    const parts: string[] = [];
    const tags: string[] = ["numeric"];

    if (claim.subjectCanonical) {
        parts.push(claim.subjectCanonical);
        tags.push("subject:" + claim.subjectCanonical.toLowerCase());
    }

    // Build metric phrase from relation and object
    const metricParts: string[] = [];
    if (claim.relationLemma) {
        metricParts.push(claim.relationLemma);
        tags.push("relation:" + claim.relationLemma);
    }
    if (claim.objectCanonical) {
        metricParts.push(claim.objectCanonical);
        tags.push("object:" + claim.objectCanonical.toLowerCase());
    }

    if (metricParts.length > 0) {
        parts.push(metricParts.join(" "));
    }

    // Add quantity with appropriate formatting
    if (claim.quantityText) {
        parts.push(claim.quantityText);
        tags.push("quantity");
    } else if (
        claim.quantityValue !== undefined &&
        claim.quantityValue !== null
    ) {
        const quantityStr = Array.isArray(claim.quantityValue)
            ? `${claim.quantityValue[0]} to ${claim.quantityValue[1]}`
            : claim.quantityValue.toString();

        if (claim.quantityUnit) {
            parts.push(`${quantityStr} ${claim.quantityUnit}`);
        } else {
            parts.push(quantityStr);
        }
        tags.push("quantity");
    }

    // Add scope
    if (claim.scope) {
        parts.push(claim.scope);
        tags.push("scope");
    }

    // Add temporal context
    if (claim.timeNormalized) {
        parts.push("in " + claim.timeNormalized);
        tags.push("time:" + claim.timeNormalized);
    }

    // Add location context
    if (claim.locationNormalized) {
        parts.push("in " + claim.locationNormalized);
        tags.push("location:" + claim.locationNormalized);
    }

    return {
        q: parts.join(" "),
        tags,
    };
}

/**
 * Build query for general event/fact claims
 */
function buildEventQuery(claim: NormalizedClaim): {
    q: string;
    tags: string[];
} {
    const parts: string[] = [];
    const tags: string[] = ["event"];

    if (claim.subjectCanonical) {
        parts.push(claim.subjectCanonical);
        tags.push("subject:" + claim.subjectCanonical.toLowerCase());
    }

    if (claim.relationLemma) {
        const verbForm = getVerbForm(claim.relationLemma, claim.polarity);
        parts.push(verbForm);
        tags.push("relation:" + claim.relationLemma);
    }

    if (claim.objectCanonical) {
        parts.push(claim.objectCanonical);
        tags.push("object:" + claim.objectCanonical.toLowerCase());
    }

    // Add quantity if present
    if (claim.quantityText) {
        parts.push(claim.quantityText);
        tags.push("quantity");
    }

    // Add scope
    if (claim.scope) {
        parts.push(claim.scope);
        tags.push("scope");
    }

    // Add temporal context
    if (claim.timeNormalized) {
        parts.push("in " + claim.timeNormalized);
        tags.push("time:" + claim.timeNormalized);
    }

    // Add location context
    if (claim.locationNormalized) {
        parts.push("in " + claim.locationNormalized);
        tags.push("location:" + claim.locationNormalized);
    }

    // Fallback: if we couldn't build a good structured query, use the original quote
    if (parts.length === 0 || (parts.length === 1 && claim.relationLemma)) {
        return {
            q: claim.quote,
            tags: ["fallback"],
        };
    }

    return {
        q: parts.join(" "),
        tags,
    };
}

/**
 * Get appropriate verb form based on lemma and polarity
 */
function getVerbForm(lemma: string, polarity: "affirmed" | "negated"): string {
    // Simple verb conjugation for common verbs
    const conjugations: Record<string, string> = {
        be: "is",
        have: "has",
        do: "does",
        say: "says",
        propose: "proposes",
        announce: "announces",
        increase: "increases",
        decrease: "decreases",
        grow: "grows",
        fall: "falls",
        rise: "rises",
        report: "reports",
        claim: "claims",
        find: "finds",
        show: "shows",
        reach: "reaches",
        achieve: "achieves",
    };

    let verb = conjugations[lemma] || lemma;

    // Handle negation
    if (polarity === "negated") {
        if (verb === "is") {
            verb = "is not";
        } else if (verb === "has") {
            verb = "does not have";
        } else {
            verb = "does not " + lemma;
        }
    }

    return verb;
}

/**
 * Build a more neutral retry query by removing adjectives and keeping core facts
 */
export function buildRetryQuery(claim: NormalizedClaim): {
    q: string;
    tags: string[];
} {
    const parts: string[] = [];
    const tags: string[] = ["retry"];

    // For retry, focus on core entities and metrics, drop adjectives
    if (claim.subjectCanonical) {
        // Remove common adjectives
        const cleanSubject = claim.subjectCanonical
            .replace(
                /\b(new|old|big|small|large|huge|tiny|major|minor|significant|important)\s+/gi,
                ""
            )
            .trim();
        if (cleanSubject) {
            parts.push(cleanSubject);
            tags.push("subject:" + cleanSubject.toLowerCase());
        }
    }

    // Keep core relation
    if (claim.relationLemma) {
        parts.push(claim.relationLemma);
        tags.push("relation:" + claim.relationLemma);
    }

    // Keep object if it's not too specific
    if (claim.objectCanonical) {
        parts.push(claim.objectCanonical);
        tags.push("object:" + claim.objectCanonical.toLowerCase());
    }

    // Keep quantitative data and time as they're usually factual
    if (claim.quantityText) {
        parts.push(claim.quantityText);
        tags.push("quantity");
    }

    if (claim.timeNormalized) {
        parts.push(claim.timeNormalized);
        tags.push("time:" + claim.timeNormalized);
    }

    return {
        q: parts.join(" "),
        tags,
    };
}
