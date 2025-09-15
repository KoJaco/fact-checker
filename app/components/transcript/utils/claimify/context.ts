import type { ClaimItemIn, TranscriptIndex } from "./types";

// Regex helpers for finding relevant context fragments
export const TITLE_NP =
    /\b(?:Dr|Prof|Professor|Minister|President|CEO|Chair|Senator)\.?\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g;
export const ORG_SUFFIX =
    /\b[A-Z][A-Za-z&.\-]{1,}\s+(?:Inc|Ltd|LLC|PLC|AG|GmbH|Corp|Co\.|University|Council|Ministry|Department)\b/g;
export const PROPER_SEQ =
    /\b(?:[A-Z][a-z]+(?:\s|[-'])[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/g;
export const ACRONYM = /\b[A-Z]{2,}(?:-[A-Z]{2,})?\b/g;
export const TIME_PHRASE =
    /\b(?:in|by|since|during|over|as of|between)\s+(?:\d{4}|January|February|March|April|May|June|July|August|September|October|November|December|last\s+(?:year|quarter|month|week))\b/g;
// Domain/URL-like tokens (simplified)
export const DOMAIN =
    /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\w\-./?%&=]*)?\b/i;

/**
 * Find the quote in the transcript sentences, preferring same-speaker matches
 */
export function findQuoteInSentences(
    quote: string,
    index: TranscriptIndex,
    speakerTag?: string | null
): [number, number] | null {
    const sentences = index.sentences;
    if (!sentences.length) return null;

    const normalizedQuote = quote.toLowerCase().trim();

    // First pass: look for exact matches in same speaker
    if (speakerTag) {
        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];
            if (
                sentence.speakerTag === speakerTag &&
                sentence.text.toLowerCase().includes(normalizedQuote)
            ) {
                return [i, i];
            }
        }
    }

    // Second pass: look for exact matches in any speaker
    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        if (sentence.text.toLowerCase().includes(normalizedQuote)) {
            return [i, i];
        }
    }

    // Third pass: fuzzy matching - look for partial matches
    const quoteWords = normalizedQuote.split(/\s+/);
    if (quoteWords.length >= 3) {
        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];
            const sentenceWords = sentence.text.toLowerCase().split(/\s+/);

            // Check if at least 70% of quote words appear in sentence
            const matchCount = quoteWords.filter((word) =>
                sentenceWords.some(
                    (sWord) => sWord.includes(word) || word.includes(sWord)
                )
            ).length;

            if (matchCount / quoteWords.length >= 0.7) {
                return [i, i];
            }
        }
    }

    return null;
}

/**
 * Harvest adjacent context around the quote location
 */
export function harvestAdjacent(
    index: TranscriptIndex,
    startIdx: number,
    endIdx: number
): { context?: string; prev?: string; next?: string } {
    const sentences = index.sentences;
    const result: { context?: string; prev?: string; next?: string } = {};

    // Get previous sentence
    if (startIdx > 0) {
        result.prev = sentences[startIdx - 1].text;
    }

    // Get next sentence
    if (endIdx < sentences.length - 1) {
        result.next = sentences[endIdx + 1].text;
    }

    // Build context from surrounding sentences
    const contextSentences: string[] = [];
    const contextStart = Math.max(0, startIdx - 1);
    const contextEnd = Math.min(sentences.length - 1, endIdx + 1);

    for (let i = contextStart; i <= contextEnd; i++) {
        if (i !== startIdx) {
            // Don't include the quote sentence itself
            contextSentences.push(sentences[i].text);
        }
    }

    if (contextSentences.length > 0) {
        result.context = contextSentences.join(" ");
    }

    return result;
}

/**
 * Scan nearby sentences for relevant fragments containing entities or time phrases
 */
export function scanNearbyForFragments(
    index: TranscriptIndex,
    startIdx: number,
    endIdx: number,
    maxBefore: number = 5,
    maxAfter: number = 5
): string[] {
    const sentences = index.sentences;
    const fragments: string[] = [];

    const searchStart = Math.max(0, startIdx - maxBefore);
    const searchEnd = Math.min(sentences.length - 1, endIdx + maxAfter);

    const relevantPatterns = [
        TITLE_NP,
        ORG_SUFFIX,
        PROPER_SEQ,
        ACRONYM,
        TIME_PHRASE,
    ];

    for (let i = searchStart; i <= searchEnd; i++) {
        if (i >= startIdx && i <= endIdx) continue; // Skip the quote sentences

        const sentence = sentences[i];

        // Check each pattern for matches
        for (const pattern of relevantPatterns) {
            const matches = sentence.text.match(pattern);
            if (matches && matches.length > 0) {
                // Take the sentence containing the match as a fragment
                fragments.push(sentence.text);
                break; // Don't add the same sentence multiple times
            }
        }
    }

    // Return up to 2 most relevant fragments (prefer closer to quote)
    return fragments.slice(0, 2);
}

/**
 * Auto-attach context if the item lacks context and appears to have pronouns/deictics
 */
export function autoAttachContext(
    item: ClaimItemIn,
    index: TranscriptIndex,
    speakerTag?: string | null
): Pick<ClaimItemIn, "context" | "contextFragments"> {
    // If already has context, don't override
    if (
        item.context ||
        (item.contextFragments && item.contextFragments.length > 0)
    ) {
        return {
            context: item.context,
            contextFragments: item.contextFragments,
        };
    }

    // Check if quote contains pronouns or deictics that suggest need for context
    const quote = item.quote.toLowerCase();
    const pronounPattern =
        /\b(he|she|it|they|them|this|that|these|those|the former|the latter)\b/;

    if (!pronounPattern.test(quote)) {
        return {}; // No obvious need for context
    }

    // Find the quote in transcript
    const location = findQuoteInSentences(
        item.quote,
        index,
        speakerTag || item.speakerTag
    );
    if (!location) {
        return {};
    }

    const [startIdx, endIdx] = location;

    // Harvest adjacent context
    const adjacent = harvestAdjacent(index, startIdx, endIdx);

    // Scan for relevant fragments
    const fragments = scanNearbyForFragments(index, startIdx, endIdx);

    return {
        context: adjacent.context,
        contextFragments: fragments.length > 0 ? fragments : undefined,
    };
}
