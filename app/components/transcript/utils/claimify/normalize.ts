// Simple lemmatizer table for common verbs
const VERB_LEMMAS = new Map<string, string>([
    // be verbs
    ["is", "be"],
    ["are", "be"],
    ["was", "be"],
    ["were", "be"],
    ["being", "be"],
    ["been", "be"],

    // have verbs
    ["has", "have"],
    ["had", "have"],
    ["having", "have"],

    // do verbs
    ["does", "do"],
    ["did", "do"],
    ["doing", "do"],
    ["done", "do"],

    // common action verbs
    ["proposed", "propose"],
    ["proposes", "propose"],
    ["proposing", "propose"],
    ["announced", "announce"],
    ["announces", "announce"],
    ["announcing", "announce"],
    ["increased", "increase"],
    ["increases", "increase"],
    ["increasing", "increase"],
    ["decreased", "decrease"],
    ["decreases", "decrease"],
    ["decreasing", "decrease"],
    ["declined", "decline"],
    ["declines", "decline"],
    ["declining", "decline"],
    ["grew", "grow"],
    ["grows", "grow"],
    ["growing", "grow"],
    ["grown", "grow"],
    ["fell", "fall"],
    ["falls", "fall"],
    ["falling", "fall"],
    ["fallen", "fall"],
    ["rose", "rise"],
    ["rises", "rise"],
    ["rising", "rise"],
    ["risen", "rise"],
    ["reported", "report"],
    ["reports", "report"],
    ["reporting", "report"],
    ["said", "say"],
    ["says", "say"],
    ["saying", "say"],
    ["stated", "state"],
    ["states", "state"],
    ["stating", "state"],
    ["claimed", "claim"],
    ["claims", "claim"],
    ["claiming", "claim"],
    ["found", "find"],
    ["finds", "find"],
    ["finding", "find"],
    ["showed", "show"],
    ["shows", "show"],
    ["showing", "show"],
    ["shown", "show"],
    ["reached", "reach"],
    ["reaches", "reach"],
    ["reaching", "reach"],
    ["achieved", "achieve"],
    ["achieves", "achieve"],
    ["achieving", "achieve"],
]);

// Negation patterns
const NEGATION_PATTERN =
    /\b(?:no\b|not\b|never\b|no evidence\b|lacks\b|decline\b|without\b|isn't\b|wasn't\b|aren't\b|weren't\b|doesn't\b|didn't\b|don't\b|won't\b|wouldn't\b|can't\b|cannot\b|couldn't\b)\b/i;

/**
 * Extract main relation (verb) and polarity from quote
 */
export function extractRelation(quote: string): {
    lemma: string;
    polarity: "affirmed" | "negated";
} {
    const words = quote.toLowerCase().split(/\s+/);
    let mainVerb = "";

    // Simple heuristic: find the first verb that's not an auxiliary in certain contexts
    const auxiliaries = [
        "is",
        "are",
        "was",
        "were",
        "has",
        "have",
        "had",
        "will",
        "would",
        "could",
        "should",
    ];

    for (let i = 0; i < words.length; i++) {
        const word = words[i].replace(/[^\w]/g, ""); // remove punctuation

        // Check if it's in our verb lemma table
        if (VERB_LEMMAS.has(word)) {
            // If it's an auxiliary, look for the main verb after it
            if (auxiliaries.includes(word) && i < words.length - 1) {
                const nextWord = words[i + 1].replace(/[^\w]/g, "");
                if (VERB_LEMMAS.has(nextWord)) {
                    mainVerb = VERB_LEMMAS.get(nextWord) || nextWord;
                    break;
                }
            } else {
                mainVerb = VERB_LEMMAS.get(word) || word;
                break;
            }
        }

        // Also check for common verb patterns (ending in -ed, -ing, -s)
        if (!mainVerb) {
            if (word.endsWith("ed") && word.length > 3) {
                mainVerb = word.slice(0, -2); // simple past -> base
                break;
            } else if (word.endsWith("ing") && word.length > 4) {
                mainVerb = word.slice(0, -3); // present participle -> base
                break;
            } else if (
                word.endsWith("s") &&
                word.length > 2 &&
                !word.endsWith("ss")
            ) {
                mainVerb = word.slice(0, -1); // third person singular -> base
                break;
            }
        }
    }

    // Fallback to "be" if no verb found or obvious truncation like 'wa'
    if (!mainVerb || mainVerb === "wa") {
        mainVerb = "be";
    }

    // Determine polarity
    const polarity = NEGATION_PATTERN.test(quote) ? "negated" : "affirmed";

    return { lemma: mainVerb, polarity };
}

/**
 * Extract object from quote using objectSpan or heuristics
 */
export function extractObject(
    quote: string,
    objectSpan?: string | null
): { surface?: string; canonical?: string } {
    if (objectSpan) {
        return {
            surface: objectSpan,
            canonical: objectSpan.toLowerCase().trim(),
        };
    }

    // Simple heuristic: look for noun phrases after common verbs
    const words = quote.split(/\s+/);
    const verbIndex = words.findIndex((word) =>
        VERB_LEMMAS.has(word.toLowerCase().replace(/[^\w]/g, ""))
    );

    if (verbIndex >= 0 && verbIndex < words.length - 1) {
        // Take the next few words as potential object
        const objectWords = words.slice(verbIndex + 1, verbIndex + 4);
        const objectSurface = objectWords.join(" ").replace(/[.,;!?]+$/, ""); // remove trailing punctuation

        if (objectSurface.length > 0) {
            return {
                surface: objectSurface,
                canonical: objectSurface.toLowerCase().trim(),
            };
        }
    }

    return {};
}

/**
 * Extract quantity information from quote
 */
export function extractQuantity(quote: string): {
    text?: string;
    value?: number | [number, number] | null;
    unit?: string | null;
    comparator?: "<" | "≤" | "=" | "≥" | ">" | null;
    approx?: boolean;
} {
    // Patterns for different quantity expressions
    const percentPattern = /(\d+(?:\.\d+)?)\s*%/;
    const currencyPattern =
        /\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(million|billion|trillion)?/i;
    const rangePattern = /between\s+(\d+(?:\.\d+)?)\s+and\s+(\d+(?:\.\d+)?)/i;
    const comparisonPattern =
        /(at least|more than|over|above|up to|less than|under|below|approximately|about|around)\s+(\d+(?:\.\d+)?)/i;
    const simpleNumberPattern = /(\d+(?:,\d{3})*(?:\.\d+)?)\s*([a-z]+)?/i;

    let result: ReturnType<typeof extractQuantity> = {};

    // Check for percentages
    const percentMatch = quote.match(percentPattern);
    if (percentMatch) {
        result.text = percentMatch[0];
        result.value = parseFloat(percentMatch[1]);
        result.unit = "%";
        result.comparator = "=";
        return result;
    }

    // Check for currency
    const currencyMatch = quote.match(currencyPattern);
    if (currencyMatch) {
        result.text = currencyMatch[0];
        let value = parseFloat(currencyMatch[1].replace(/,/g, ""));

        const multiplier = currencyMatch[2];
        if (multiplier) {
            switch (multiplier.toLowerCase()) {
                case "million":
                    value *= 1_000_000;
                    break;
                case "billion":
                    value *= 1_000_000_000;
                    break;
                case "trillion":
                    value *= 1_000_000_000_000;
                    break;
            }
        }

        result.value = value;
        result.unit = "USD";
        result.comparator = "=";
        return result;
    }

    // Check for ranges
    const rangeMatch = quote.match(rangePattern);
    if (rangeMatch) {
        result.text = rangeMatch[0];
        result.value = [parseFloat(rangeMatch[1]), parseFloat(rangeMatch[2])];
        result.comparator = "=";
        return result;
    }

    // Check for comparisons
    const comparisonMatch = quote.match(comparisonPattern);
    if (comparisonMatch) {
        result.text = comparisonMatch[0];
        result.value = parseFloat(comparisonMatch[2]);

        const comparator = comparisonMatch[1].toLowerCase();
        if (["at least", "more than", "over", "above"].includes(comparator)) {
            result.comparator = "≥";
        } else if (
            ["up to", "less than", "under", "below"].includes(comparator)
        ) {
            result.comparator = "≤";
        } else if (["approximately", "about", "around"].includes(comparator)) {
            result.comparator = "=";
            result.approx = true;
        }

        return result;
    }

    // Check for simple numbers
    const numberMatch = quote.match(simpleNumberPattern);
    if (numberMatch) {
        result.text = numberMatch[0];
        result.value = parseFloat(numberMatch[1].replace(/,/g, ""));
        result.unit = numberMatch[2] || null;
        result.comparator = "=";
        return result;
    }

    return result;
}

/**
 * Normalize time expressions to ISO format or relative descriptions
 */
export function normalizeTime(
    timeSurface?: string | null,
    now: Date = new Date()
): string | null {
    if (!timeSurface) return null;

    const lower = timeSurface.toLowerCase().trim();

    // Year patterns
    const yearMatch = lower.match(/\b(\d{4})\b/);
    if (yearMatch) {
        return yearMatch[1];
    }

    // Month year patterns
    const monthYearMatch = lower.match(
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/
    );
    if (monthYearMatch) {
        const months = [
            "january",
            "february",
            "march",
            "april",
            "may",
            "june",
            "july",
            "august",
            "september",
            "october",
            "november",
            "december",
        ];
        const monthIndex = months.indexOf(monthYearMatch[1]) + 1;
        return `${monthYearMatch[2]}-${monthIndex.toString().padStart(2, "0")}`;
    }

    // Relative time expressions
    const currentYear = now.getFullYear();
    if (lower.includes("last year")) {
        return (currentYear - 1).toString();
    } else if (lower.includes("this year")) {
        return currentYear.toString();
    } else if (lower.includes("next year")) {
        return (currentYear + 1).toString();
    }

    return null;
}

/**
 * Normalize location to canonical form
 */
export function normalizeLocation(
    locationSurface?: string | null
): string | null {
    if (!locationSurface) return null;

    const lower = locationSurface.toLowerCase().trim();

    // Common location mappings
    const locationMap = new Map<string, string>([
        ["us", "united states"],
        ["usa", "united states"],
        ["uk", "united kingdom"],
        ["eu", "european union"],
        ["nyc", "new york city"],
        ["la", "los angeles"],
        ["sf", "san francisco"],
    ]);

    if (locationMap.has(lower)) {
        return locationMap.get(lower)!;
    }

    // Clean up the location string
    return lower
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
