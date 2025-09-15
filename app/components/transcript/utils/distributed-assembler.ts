// distributed-assembler.ts
import type { InsightItem } from "../types";

type Options = {
    maxSentences?: number; // hard cap after merge (default 3)
    maxTokensApprox?: number; // rough cap e.g., 120
    jaccardThreshold?: number; // 0..1 (default 0.25)
    allowOneInterruption?: boolean; // allow one other speaker turn between spans
};

const DEFAULTS: Required<Options> = {
    maxSentences: 3,
    maxTokensApprox: 120,
    jaccardThreshold: 0.25,
    allowOneInterruption: true,
};

// very rough token approx
const approxTokens = (s: string) =>
    Math.ceil((s.trim().split(/\s+/).length || 0) * 1.2);

const contentWords = (s: string) =>
    new Set(
        s
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((w) => w && !STOP.has(w))
    );

const STOP = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "if",
    "then",
    "so",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "by",
    "at",
    "from",
    "as",
    "that",
    "this",
    "those",
    "these",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "it",
    "its",
    "they",
    "them",
    "their",
    "he",
    "she",
    "his",
    "her",
    "we",
    "our",
    "you",
    "your",
]);

function jaccard(a: Set<string>, b: Set<string>) {
    const inter = new Set<string>();
    for (const x of a) if (b.has(x)) inter.add(x);
    const unionSize = a.size + b.size - inter.size;
    return unionSize ? inter.size / unionSize : 0;
}

function sentenceCount(s: string) {
    return (s.match(/[.!?]+/g) || []).length || 1;
}

function isPronounSubject(s?: string | null) {
    if (!s) return false;
    return /^(i|me|my|mine|we|our|ours|it|this|that|they|them|their|he|she|his|her|hers)$/i.test(
        s.trim()
    );
}

function canCombine(a: InsightItem, b: InsightItem, opts: Required<Options>) {
    // same speaker if tags equal or missing
    if (a.speakerHint && b.speakerHint && a.speakerHint !== b.speakerHint)
        return false;

    // subject continuity
    const aSub = (a.subjectNoun || "").trim();
    const bSub = (b.subjectNoun || "").trim();
    const subjectOK =
        (!!aSub && !!bSub && aSub.toLowerCase() === bSub.toLowerCase()) ||
        (!!aSub && isPronounSubject(bSub)); // b resumes with pronoun, a had explicit subject

    if (!subjectOK) return false;

    // cheap semantic cohesion
    const sim = jaccard(contentWords(a.quote), contentWords(b.quote));
    if (sim < opts.jaccardThreshold) return false;

    // length constraints after merge (approx)
    const merged = `${a.quote.trim()} ${b.quote.trim()}`.trim();
    if (sentenceCount(merged) > opts.maxSentences) return false;
    if (approxTokens(merged) > opts.maxTokensApprox) return false;

    return true;
}

/**
 * Given a list of current candidates (possibly from multiple windows),
 * assemble distributed claims by merging compatible adjacent fragments.
 * Returns the new list + a set of withdrawn ids.
 */
export function assembleDistributedClaims(
    candidates: InsightItem[],
    options?: Options
): { merged: InsightItem[]; withdrawnIds: Set<string> } {
    const opts = { ...DEFAULTS, ...(options || {}) };
    // Sort by (speakerTag, quote length asc) so we extend shorter with longer
    const items = [...candidates].sort((x, y) => {
        const s = (x.speakerHint || "").localeCompare(y.speakerHint || "");
        if (s !== 0) return s;
        return x.quote.length - y.quote.length;
    });

    const used = new Set<string>();
    const withdrawn = new Set<string>();
    const out: InsightItem[] = [];

    for (let i = 0; i < items.length; i++) {
        const a = items[i];
        if (used.has(a.id)) continue;

        let best: InsightItem = a;
        let improved = true;

        // Try greedy one-step extension (A + B). You can loop more if desired.
        for (let j = 0; j < items.length; j++) {
            if (i === j) continue;
            const b = items[j];
            if (used.has(b.id)) continue;
            if (canCombine(best, b, opts)) {
                // merge
                const merged: InsightItem = {
                    ...best,
                    // keep older id as canonical (best.id), withdraw b
                    quote: `${best.quote.trim()} ${b.quote.trim()}`.trim(),
                    context: best.context || b.context || null,
                    contextFragments: [
                        ...(best.contextFragments || []),
                        ...(b.contextFragments || []),
                    ].slice(0, 3), // keep small
                    searchSeeds: Array.from(
                        new Set([
                            ...(best.searchSeeds || []),
                            ...(b.searchSeeds || []),
                        ])
                    ),
                    subjectNoun:
                        isPronounSubject(best.subjectNoun) &&
                        b.subjectNoun &&
                        !isPronounSubject(b.subjectNoun)
                            ? b.subjectNoun
                            : best.subjectNoun,
                    version: Math.max(best.version ?? 1, b.version ?? 1) + 1,
                    revisionAction: "expanded",
                    revisionNote: "Merged adjacent spans",
                };
                withdrawn.add(b.id);
                used.add(b.id);
                best = merged;
                improved = true;
            }
        }

        used.add(a.id);
        out.push(best);
    }

    // Remove withdrawn items from output if they still exist
    const final = out.filter((it) => !withdrawn.has(it.id));
    return { merged: final, withdrawnIds: withdrawn };
}
