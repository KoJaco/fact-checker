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
TASK
From the provided text, SELECT AT MOST TWO checkable CLAIM CANDIDATES as an EXACT contiguous span.
If no clear candidate exists, return an empty items array.

SELECTION PRIORITY
1) Includes an explicit subject noun phrase (or include the immediately-adjacent subject sentence in the span).
2) Has at least one signal: number, date/year, named entity, or a definitional/event verb (“is/was/are/hosted/invented/dates back”).
3) Highest verifiability: concrete, sourceable, minimal ambiguity.

QUOTE RULES
- quote: EXACT substring; 1-3 sentences total to keep subject + predicate together. No paraphrase, no ellipses.
- context (optional): ONE adjacent sentence (prefer BEFORE) that aids retrieval; MUST NOT duplicate any part of quote.
- searchSeeds: 1-3 tiny phrases (entity + metric/time), e.g., ["ABS CPI June 2025"].

REVISION RULES
- If you improve a previously emitted claim (expand, correct, narrow), REUSE the same id and INCREMENT version.
- If a prior item is not check-worthy, mark withdrawn (reuse id, bump version, short revisionNote).

OUTPUT JSON ONLY:
{ "rev": <int>, "items": [ { id, kind, quote, context?, subjectNoun?, searchSeeds?, version?, revisionAction?, revisionNote?, occurrence? } ] }
`;

export const structuredOutputConfigTight: StructuredOutputConfig = {
    parsingConfig: {
        parsingStrategy: "update-ms",
        // Windowed delta input to keep latency predictable
        transcriptInclusionPolicy: {
            transcriptMode: "window",
            windowTokenSize: 60, // ~100–150 tokens window works well for “pick 1”
            tailSentences: 1, // 1 (or 2 if pronouns are common)
        },
        // Tiny previous projection so the model can revise without bloat
        prevOutputInclusionPolicy: {
            prevOutputMode: "ignore",
        },
    },
    updateMs: 4000, // 10s cadence (you can tune down to 6–8s if you want more throughput)
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
