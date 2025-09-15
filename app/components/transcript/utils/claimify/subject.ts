import type {
    ClaimItemIn,
    TranscriptIndex,
    Memories,
    CorefEvidence,
} from "./types";
import { TITLE_NP, ORG_SUFFIX, PROPER_SEQ, ACRONYM, DOMAIN } from "./context";

/**
 * Detect if the subject is likely a pronoun or deictic reference
 */
export function isPronounySubject(quote: string): boolean {
    const words = quote.trim().split(/\s+/);
    if (words.length === 0) return false;

    const firstFewWords = words.slice(0, 3).join(" ").toLowerCase();

    // Common pronouns and deictics that suggest coreference needed
    const pronounPattern =
        /^(he|she|it|they|them|this|that|these|those|the former|the latter|his|her|its|their)\b/;

    return pronounPattern.test(firstFewWords);
}

/**
 * Extract the rightmost proper noun phrase from text using patterns
 */
function extractRightmostNP(text: string): string | null {
    const patterns = [TITLE_NP, ORG_SUFFIX, PROPER_SEQ, ACRONYM];
    let rightmostMatch: string | null = null;
    let rightmostIndex = -1;

    for (const pattern of patterns) {
        const matches = [...text.matchAll(pattern)];
        for (const match of matches) {
            if (match.index !== undefined && match.index > rightmostIndex) {
                rightmostIndex = match.index;
                rightmostMatch = match[0].trim();
            }
        }
    }

    return rightmostMatch;
}

/**
 * Canonicalize entity name for comparison
 */
function canonicalizeEntity(surface: string): string {
    return surface
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Resolve subject using ordered attempts: subjectSpan -> context -> fragments -> memories
 */
export function resolveSubject(
    item: ClaimItemIn,
    index: TranscriptIndex,
    memories: Memories
): { surface?: string; canonical?: string; evidence?: CorefEvidence | null } {
    // 1. Use subjectSpan if it's a non-pronoun NP
    if (item.subjectSpan && !isPronounySubject(item.subjectSpan)) {
        const canonical = canonicalizeEntity(item.subjectSpan);
        return {
            surface: item.subjectSpan,
            canonical,
            evidence: {
                source: "adjacent",
                evidence: [item.subjectSpan],
            },
        };
    }

    // 1b. If subjectSpan is pronouny like "their site" or "its site", prefer nearest domain/ORG in context
    if (
        item.subjectSpan &&
        /\b(their|its)\s+(site|website|page)\b/i.test(item.subjectSpan)
    ) {
        const candidates: string[] = [];
        if (item.context) {
            const m = item.context.match(DOMAIN);
            if (m) candidates.push(m[0]);
        }
        if (item.contextFragments && item.contextFragments.length > 0) {
            for (const frag of item.contextFragments) {
                const m = frag.match(DOMAIN);
                if (m) {
                    candidates.push(m[0]);
                    break;
                }
            }
        }
        if (candidates.length > 0) {
            const chosen = candidates[0];
            return {
                surface: chosen,
                canonical: canonicalizeEntity(chosen),
                evidence: { source: "fragment", evidence: [chosen] },
            };
        }
    }

    // 2. Try adjacent context (prefer previous sentence)
    if (item.context) {
        const contextNP = extractRightmostNP(item.context);
        if (contextNP) {
            const canonical = canonicalizeEntity(contextNP);
            return {
                surface: contextNP,
                canonical,
                evidence: {
                    source: "adjacent",
                    evidence: [contextNP],
                },
            };
        }
    }

    // 3. Try contextFragments (newest → oldest)
    if (item.contextFragments && item.contextFragments.length > 0) {
        for (const fragment of item.contextFragments) {
            const fragmentNP = extractRightmostNP(fragment);
            if (fragmentNP) {
                const canonical = canonicalizeEntity(fragmentNP);
                return {
                    surface: fragmentNP,
                    canonical,
                    evidence: {
                        source: "fragment",
                        evidence: [fragmentNP],
                    },
                };
            }
        }
    }

    // 4. Try speakerMemory (same speaker, top salience, same topic)
    if (item.speakerTag && memories.speakerMemory.has(item.speakerTag)) {
        const speakerDeque = memories.speakerMemory.get(item.speakerTag)!;
        const entities = speakerDeque.toArray();

        // Sort by salience (descending) and find the most salient entity
        const sortedEntities = entities.sort((a, b) => b.salience - a.salience);
        if (sortedEntities.length > 0) {
            const topEntity = sortedEntities[0];
            return {
                surface: topEntity.surface,
                canonical: topEntity.canonical,
                evidence: {
                    source: "speakerMemory",
                    evidence: [topEntity.surface],
                },
            };
        }
    }

    // 5. Try globalMemory (top salience, same topic)
    const globalEntities = memories.globalMemory.toArray();
    if (globalEntities.length > 0) {
        const sortedGlobal = globalEntities.sort(
            (a, b) => b.salience - a.salience
        );
        const topGlobal = sortedGlobal[0];
        return {
            surface: topGlobal.surface,
            canonical: topGlobal.canonical,
            evidence: {
                source: "globalMemory",
                evidence: [topGlobal.surface],
            },
        };
    }

    // 6. Fallback - no resolution possible
    return {
        evidence: {
            source: "fallback",
            evidence: [],
        },
    };
}
