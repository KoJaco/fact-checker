import type { StructuredOutputConfig } from "~/lib/sdk";

export type CandidateItem = {
    id: string;
    kind: "factcheck";
    quote: string; // exact contiguous span (1–3 sentences)
    context?: string | null; // one adjacent sentence (not overlapping quote)
    contextFragments?: string[] | null;
    subjectNoun?: string | null; // optional here (client normalizes)
    searchSeeds?: string[] | null;
    version?: number | null;
    revisionAction?: "expanded" | "corrected" | "narrowed" | "withdrawn" | null;
    revisionNote?: string | null;
};

export type CandidatePayload = {
    rev: number;
    items: CandidateItem[];
};

// ---- Slim Structured Output Config (for schma.ai / LLM) ----
export const parsingGuide = `
YOU ARE: A span extractor for explainer videos. No paraphrase, return JSON only.

CONTEXT (loose, explainer cadence)
- Cadence: every ~10s. Emit up to TWO claims (0–2) per tick.
- Input: a moderate rolling window suited for narration.

TASK
1) Propose 0–2 checkable CLAIM CANDIDATES as exact contiguous spans.
2) Also return speakerLabels: [ { speakerNumber, speakerDerivedLabel } ].

QUOTE & CONTEXT RULES
- quote: EXACT substring; 1–3 sentences to keep subject + predicate (+ number/date/entity). No paraphrase.
- supporting spans (optional): subjectSpan, objectSpan, timeSpan, locationSpan, attributionSpan (exact substrings).
- context (optional): ONE adjacent sentence (prefer BEFORE); MUST NOT duplicate quote.
- contextFragments (optional): up to 2–3 EXACT substrings elsewhere that clarify subject/metric/time (≤ ~80 tokens each; hard cap 120).
- searchSeeds: 1–3 tiny phrases (entity + metric/time).

MANDATORY CONTEXT POLICY (TRIGGERS)
Include a one-sentence context OR 1–2 fragments when:
T1 Reported speech, T2 Pronoun subject with named resolver nearby, T3 Deictic reference, T4 Ellipsis from prior sentence.

SUBJECT RULE
If the quote’s subject is a pronoun/deictic, provide subjectSpan OR add a fragment that names the subject. Add attributionSpan when T1 fires.

SELF-REPORT
Set contextRequired true|false and contextReason in {"T1","T2","T3","T4"} (or combo like "T1+T2").

CANDIDATE QUALITY
- Explicit subject (or resolved via context/fragments) AND at least ONE signal: number, year/date, named entity, or definitional/event verb.
- Avoid fillers/meta and questions unless asserting a proposition.

REVISION
Reuse id + increment version on improvements; mark withdrawn if not check-worthy.

OUTPUT JSON ONLY:
{
  "rev": <int>,
  "speakerLabels": [ { "speakerNumber": "Speaker 0", "speakerDerivedLabel": "Host" }, ... ],
  "items": [ {
    id, kind, quote, speakerTag?,
    subjectSpan?, objectSpan?, timeSpan?, locationSpan?, attributionSpan?,
    context?, contextFragments?, contextRequired?, contextReason?,
    subjectNoun?, searchSeeds?, version?, revisionAction?, revisionNote?
  } ]
}
`;

export const structuredOutputConfigLoose: StructuredOutputConfig = {
    parsingConfig: {
        parsingStrategy: "update-ms",
        transcriptInclusionPolicy: {
            transcriptMode: "window",
            windowTokenSize: 140, // a bit more room for narrative context
            tailSentences: 10,
        },
        prevOutputInclusionPolicy: {
            prevOutputMode: "ignore",
        },
    },
    updateMs: 10000,
    parsingGuide,
    schema: {
        name: "claims_candidates",
        description:
            "Candidate claims for client-side filtering & ranking, plus derived speaker labels.",
        type: "object",
        additionalProperties: false,
        required: ["rev", "items"],
        properties: {
            rev: { type: "integer" },

            // speaker labels
            speakerLabels: {
                type: "array",
                nullable: true,
                description:
                    "Array of derived speaker labels mapped from diarised tags. Prefer person names; else roles; else empty string.",
                items: {
                    type: "object",
                    required: ["speakerNumber", "speakerDerivedLabel"],
                    properties: {
                        speakerNumber: {
                            type: "string",
                            description:
                                'The diarised tag as seen in transcript, e.g., "Speaker 0".',
                        },
                        speakerDerivedLabel: {
                            type: "string",
                            description:
                                "Preferred person name if inferable; else role/title used in the transcript; else empty string.",
                        },
                    },
                },
            },

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
                            enum: ["factcheck"],
                        },

                        // bind claim to diarised speaker (optional but recommended)
                        speakerTag: {
                            type: "string",
                            nullable: true,
                            description:
                                'Diarised tag for the speaker of this quote, e.g., "Speaker 1". If present, MUST match a speakerNumber in speakerLabels.',
                        },

                        // exact surface spans
                        quote: {
                            type: "string",
                            description:
                                "Exact contiguous span (1-3 sentences).",
                        },
                        subjectSpan: {
                            type: "string",
                            nullable: true,
                            description:
                                "Exact text naming the subject (non-pronoun) if present.",
                        },
                        objectSpan: {
                            type: "string",
                            nullable: true,
                            description:
                                "Exact text naming the object/complement if present.",
                        },
                        timeSpan: {
                            type: "string",
                            nullable: true,
                            description: "Exact time phrase if present.",
                        },
                        locationSpan: {
                            type: "string",
                            nullable: true,
                            description:
                                "Exact location/scope phrase if present.",
                        },
                        attributionSpan: {
                            type: "string",
                            nullable: true,
                            description:
                                "Exact reported-speech cue if present (e.g., 'according to X').",
                        },

                        // context helpers
                        context: {
                            type: "string",
                            nullable: true,
                            description:
                                "One adjacent sentence for retrieval; not overlapping quote.",
                        },
                        contextFragments: {
                            type: "array",
                            nullable: true,
                            items: { type: "string" },
                            description:
                                "Up to 2–3 exact substrings elsewhere that resolve subject/metric/time; short.",
                        },
                        contextRequired: {
                            type: "boolean",
                            nullable: true,
                            description:
                                "True if context is required (model-derived).",
                        },
                        contextReason: {
                            type: "string",
                            nullable: true,
                            description:
                                'Trigger code: "T1"|"T2"|"T3"|"T4" or combos like "T1+T2".',
                        },

                        // legacy hint (optional)
                        subjectNoun: {
                            type: "string",
                            nullable: true,
                            description:
                                "Legacy hint for subject if obvious (inside quote/context). Prefer subjectSpan if available.",
                        },

                        // seeds & revisions
                        searchSeeds: {
                            type: "array",
                            items: { type: "string" },

                            description: "1-3 tiny phrases for search.",
                        },
                        version: { type: "integer", nullable: true },
                        revisionAction: {
                            type: "string",
                            nullable: true,
                            enum: [
                                "expanded",
                                "corrected",
                                "narrowed",
                                "withdrawn",
                            ],
                        },
                        revisionNote: { type: "string", nullable: true },
                    },
                },
            },
        },
    },
};
