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

// ---- Manual Slim Structured Output Config (schma.ai / LLM) ----
export const parsingGuide = `
YOU ARE: A span extractor. No paraphrase, no explanations. Return JSON only.

INPUTS (provided by the client on button click):
- CURRENT_WINDOW: a short diarised transcript slice (≈50 tokens).
- ADJACENT_PREV: the full sentence immediately before CURRENT_WINDOW (or "EMPTY").
- ADJACENT_NEXT: the full sentence immediately after CURRENT_WINDOW (or "EMPTY").
- You may also see your previous JSON items for id reuse.

TASK
1) Propose checkable CLAIM CANDIDATES as exact contiguous spans from CURRENT_WINDOW (you may include tokens that straddle the boundary if they appear verbatim in ADJACENT_PREV/NEXT). Prefer precision; do not return zero.
2) Also return speakerLabels: an array of { speakerNumber, speakerDerivedLabel }.

QUOTE & SPAN RULES
- quote: EXACT contiguous substring; may span 1–3 sentences if needed to keep subject + predicate (+ number/date/entity).
- If present, also return exact supporting spans (no paraphrase):
  • subjectSpan?      — explicit NP naming the subject (not a pronoun).
  • objectSpan?       — NP/complement targeted by the predicate.
  • timeSpan?         — e.g., "in 2022", "last quarter".
  • locationSpan?     — e.g., "in Australia", "worldwide".
  • attributionSpan?  — e.g., "according to X", "X said".
- context (optional): ONE adjacent sentence (prefer ADJACENT_PREV) that resolves who/what/when; MUST NOT duplicate the quote.
- contextFragments (optional): up to 2–3 additional EXACT substrings taken from ADJACENT_PREV/NEXT (only) that clarify subject/metric/time. No overlap with quote or each other. Keep each fragment short (≤ ~80 tokens).

MANDATORY CONTEXT POLICY (TRIGGERS)
If any trigger is true, include context or contextFragments:
T1 Reported speech: reporting cue in quote or adjacent ("said", "according to", "announced", "per", "via").
T2 Pronoun/Anaphora: grammatical subject in quote is a pronoun (it/they/he/she/this/that/we/I) and the named subject appears in ADJACENT_PREV/NEXT.
T3 Deictic/Referential: quote uses "this/that/these/those/here/there" for a previously-named thing in ADJACENT_PREV/NEXT.
T4 Ellipsis/Continuation: quote completes a claim begun in ADJACENT_PREV.

When a trigger fires:
- Prefer context = the ONE adjacent sentence that resolves who/what/when.
- If the resolver is in the other adjacent sentence, use contextFragments to copy only the resolving NP/phrase.
- Keep fragments concise (≤ ~50 tokens; hard cap 80).

SUBJECT RULE (STRICT)
- If the grammatical subject inside quote is a pronoun/deictic (T2/T3), you MUST provide either:
  (a) subjectSpan naming the subject (from quote or adjacents), OR
  (b) at least one context/contextFragment that explicitly names the subject.
- When T1 fires, include attributionSpan if present.
- If the subject in the quote is a pronoun/deictic, set subjectSpan to the named NP from ADJACENT_PREV/NEXT (not the pronoun), and include that adjacent sentence as context or add a short contextFragment.

SELF-REPORT
Set "contextRequired": true|false. When true, set "contextReason" to one of {"T1","T2","T3","T4"} (or combos like "T1+T2").

CANDIDATE QUALITY
- Must contain: an explicit subject NP (or pronoun with adjacent resolver) AND
- At least ONE signal: number, date/year, named entity, or definitional/event verb ("is/was/are/hosted/invented/dates back").
- Ignore fillers, imperatives, meta comments, or stand-alone questions unless they assert a checkable proposition.

REVISION
- If you improve a previously emitted claim (expand, correct, narrow), REUSE the same id and INCREMENT version.
- If a prior item is not check-worthy, mark withdrawn (reuse id, bump version).

OUTPUT JSON ONLY:
{
  "rev": <int>,
  "speakerLabels": [ { "speakerNumber": "Speaker 0", "speakerDerivedLabel": "Host" }, ... ],
  "items": [
    {
      id, kind, quote, speakerTag?,
      subjectSpan?, objectSpan?, timeSpan?, locationSpan?, attributionSpan?,
      context?, contextFragments?, contextRequired?, contextReason?,
      // (legacy) subjectNoun?,
      searchSeeds?, version?, revisionAction?, revisionNote?
    }
  ]
}
Notes:
- Use only exact substrings from CURRENT_WINDOW and ADJACENT_PREV/NEXT.
- Do not invent names, numbers, dates, or locations.
- speakerTag, if present, MUST match a speakerNumber in speakerLabels (e.g., "Speaker 1").
`;

export const structuredOutputConfigManual: StructuredOutputConfig = {
    parsingConfig: {
        parsingStrategy: "manual",
        transcriptInclusionPolicy: {
            transcriptMode: "window",
            windowTokenSize: 75, // short, since user clicks the button at the moment of a claim
            tailSentences: 10,
        },
        prevOutputInclusionPolicy: { prevOutputMode: "ignore" },
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
                    required: [
                        "id",
                        "kind",
                        "quote",
                        "searchSeeds",
                        "subjectSpan",
                    ],
                    properties: {
                        id: {
                            type: "string",
                            description: "Stable id; reuse on revisions.",
                        },
                        kind: { type: "string", enum: ["factcheck"] },

                        // Bind claim to diarised speaker (optional but recommended)
                        speakerTag: {
                            type: "string",
                            nullable: true,
                            description:
                                'Diarised tag for the speaker of this quote, e.g., "Speaker 1". If present, MUST match a speakerNumber in speakerLabels.',
                        },

                        // Exact surface spans
                        quote: {
                            type: "string",
                            description:
                                "Exact contiguous span (1–3 sentences).",
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

                        // Context helpers (adjacent-only in manual mode)
                        context: {
                            type: "string",
                            nullable: true,
                            description:
                                "One adjacent sentence for retrieval (prefer ADJACENT_PREV); must not overlap quote.",
                        },
                        contextFragments: {
                            type: "array",
                            nullable: true,
                            items: { type: "string" },
                            description:
                                "Up to 2–3 exact substrings from ADJACENT_PREV/NEXT that resolve subject/metric/time; short.",
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

                        // Legacy hint (optional)
                        subjectNoun: {
                            type: "string",
                            nullable: true,
                            description:
                                "Legacy hint for subject if obvious (inside quote/context). Prefer subjectSpan if available.",
                        },

                        // Seeds & revisions
                        searchSeeds: {
                            type: "array",
                            items: { type: "string" },

                            description: "1–3 tiny phrases for search.",
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
