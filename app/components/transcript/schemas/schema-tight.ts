import type { StructuredOutputConfig } from "~/lib/sdk";

export type CandidateItem = {
    id: string; // stable id; reuse on revision
    kind: "factcheck";
    quote: string; // exact contiguous span (1–3 sentences)
    context?: string | null; // 0–1 adjacent sentence (no overlap)
    subjectNoun?: string | null; // optional (client can normalize)
    searchSeeds?: string[] | null; // 1–3 tiny phrases
    version?: number | null; // start 1; bump on change
    revisionAction?: "expanded" | "corrected" | "narrowed" | "withdrawn" | null;
    revisionNote?: string | null;
    occurrence?: number | null; // optional: which occurrence in window
};

export type CandidatePayload = {
    rev: number;
    items: CandidateItem[]; // single-claim mode: 0 or 1 item
};

const parsingGuide = `
YOU ARE: A span extractor. No paraphrase, no explanations. Return JSON only.

CONTEXT (tight, low-latency mode)
- Cadence: every ~3s. Emit AT MOST ONE claim per tick (0 or 1).
- Input: a small rolling window around the current speech.

TASK
1) Propose a checkable CLAIM CANDIDATE as an exact contiguous span, OR return none.
2) Prefer precision and high verifiability; avoid ambiguous or opinionated text.

QUOTE & CONTEXT RULES
- quote: EXACT contiguous substring; keep subject + predicate (+ number/date/entity) together. 1–2 sentences preferred (max 3). No paraphrase, no ellipses.
- context (optional): ONE adjacent sentence (prefer BEFORE) that resolves who/what/when; MUST NOT duplicate the quote.
- searchSeeds: 1–3 tiny phrases that combine subject + metric/time or entity (e.g., "ABS CPI Jun 2025").

MANDATORY CONTEXT POLICY (TRIGGERS)
Include a one-sentence context whenever ANY trigger is true:
T1 Reported speech ("said", "according to", "announced", "per", "via").
T2 Pronoun subject (it/they/he/she/this/that/we/I) where the named subject is adjacent.
T3 Deictic reference (this/that/these/those/here/there) to a nearby named entity/metric.
T4 Ellipsis/Continuation where the claim completes the prior sentence.

SUBJECT RULE (STRICT)
- If the quote's grammatical subject is a pronoun/deictic (T2/T3), ensure subject is named via the quote or the one-sentence context.

SELECTION PRIORITY
1) Explicit subject NP (or resolved by the adjacent context).
2) Contains at least ONE signal: number, date/year, named entity, or definitional/event verb ("is/was/are/hosted/invented/dates back").
3) Highest verifiability and specificity.

REVISION
- If you improve a previously emitted claim (expand/correct/narrow), reuse the same id and increment version.
- If a prior item is not check-worthy, mark withdrawn (reuse id; bump version; brief revisionNote).

OUTPUT JSON ONLY (single-item mode):
{ "rev": <int>, "items": [ { id, kind, quote, context?, subjectNoun?, searchSeeds?, version?, revisionAction?, revisionNote?, occurrence? } ] }
Items length MUST be 0 or 1.
`;

export const structuredOutputConfigTight: StructuredOutputConfig = {
    parsingConfig: {
        parsingStrategy: "update-ms",
        // Windowed delta input to keep latency predictable
        transcriptInclusionPolicy: {
            transcriptMode: "window",
            windowTokenSize: 60, // small local context to keep latency low
            tailSentences: 1, // prefer 1; bump to 2 if pronouns are common
        },
        // Tiny previous projection so the model can revise without bloat
        prevOutputInclusionPolicy: {
            prevOutputMode: "ignore",
        },
    },
    updateMs: 3000, // ~3s cadence; emit at most one claim
    parsingGuide,
    schema: {
        name: "claims_candidates_single",
        description:
            "Single-claim candidate per tick for client-side gating & retrieval.",
        type: "object",
        additionalProperties: false,
        required: ["rev", "items"],
        properties: {
            rev: { type: "integer" },
            items: {
                type: "array",
                items: {
                    type: "object",
                    required: ["id", "kind", "quote", "searchSeeds"],
                    properties: {
                        id: {
                            type: "string",
                            description: "Stable id; reuse on revisions.",
                        },
                        kind: {
                            type: "string",
                            format: "enum",
                            enum: ["factcheck"],
                        },
                        quote: {
                            type: "string",
                            description:
                                "Exact contiguous span (1-3 sentences).",
                        },
                        context: {
                            type: "string",
                            nullable: true,
                            description:
                                "One adjacent sentence; no overlap with quote.",
                        },
                        subjectNoun: {
                            type: "string",
                            nullable: true,
                            description:
                                "Explicit subject if obvious (inside quote/context).",
                        },
                        searchSeeds: {
                            type: "array",
                            items: { type: "string" },
                            description: "1-3 tiny phrases for search.",
                        },
                        version: { type: "integer", nullable: true },
                        revisionAction: {
                            type: "string",
                            nullable: true,
                            format: "enum",
                            enum: [
                                "expanded",
                                "corrected",
                                "narrowed",
                                "withdrawn",
                            ],
                        },
                        revisionNote: { type: "string", nullable: true },
                        occurrence: {
                            type: "integer",
                            nullable: true,
                            description:
                                "Occurrence index of the exact quote within the current window.",
                        },
                    },
                },
            },
        },
    },
};
