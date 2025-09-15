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
YOU SEE: a diarised transcript TEXT ONLY (no timestamps).
YOU ALSO SEE: your previous JSON items (reuse ids; bump version when changing the same claim).

TASK
1) Propose checkable CLAIM CANDIDATES as exact contiguous spans. Prefer precision, but do not return zero.
2) Also return speakerLabels: an array of { speakerNumber, speakerDerivedLabel }:
   - speakerNumber: the diarised tag as seen in the transcript (e.g., "Speaker 0", "Speaker 1").
   - speakerDerivedLabel: prefer a PERSON NAME if inferable from the transcript; else a ROLE/TITLE used in the transcript
     (e.g., "Host", "Interviewer", "Guest", "Professor Smith"); if unknown, return "" (empty string). Do not invent.

QUOTE & SPAN RULES
- quote: EXACT contiguous substring; may span 1–3 sentences if needed to keep subject + predicate (+ number/date/entity).
- If present, also return exact supporting spans (no paraphrase):
  • subjectSpan?      — the explicit NP naming the subject (not a pronoun).
  • objectSpan?       — the NP/complement targeted by the predicate.
  • timeSpan?         — the explicit time phrase (e.g., "in 2022", "last quarter").
  • locationSpan?     — the place/scope phrase (e.g., "in Australia").
  • attributionSpan?  — reported-speech cue (e.g., "according to X", "X said").
- context (optional): ONE adjacent sentence (prefer BEFORE) that helps understand the quote; MUST NOT duplicate the quote. No paraphrase.
- contextFragments (optional): up to 3 additional EXACT substrings elsewhere in the transcript that clarify subject/metric/time. No overlaps with quote or each other. Keep each fragment short (≤ ~120 tokens).
- searchSeeds: 1–3 tiny phrases useful for search (e.g., subject name, relation verb, object/metric).

CONTEXT POLICY (MANDATORY WHEN TRIGGERED)
You MUST include a one-sentence "context" OR 1–2 "contextFragments" (exact substrings, no overlap with the quote) whenever ANY of these triggers are present:

T1 (Attribution/Reported speech): the quote or its adjacent sentence contains a reporting verb or cue (e.g., "said", "stated", "claimed", "according to", "reported by", "wrote", "announced", "estimates", "per", "via").
T2 (Pronoun/Anaphora): the quote's subject is a pronoun (it/they/he/she/this/that/we/I) and the named subject appears in an adjacent or nearby sentence.
T3 (Deictic/Referential): the quote uses "this/that/these/those/there/here" to refer to a previously-named entity, metric, or time.
T4 (Ellipsis/Continuation): the quote obviously completes a claim begun in the immediately preceding sentence.

When a trigger fires:
- Prefer "context" = the ONE immediately adjacent sentence that resolves who/what/when.
- If the resolver is NOT adjacent, add 1–2 short "contextFragments" (exact substrings) that introduce the named subject, metric, or date.
- Keep each fragment concise (≤ ~50 tokens; hard cap 80).

MANDATORY SUBJECT RESOLUTION RULE
- If the grammatical subject inside the quote is a pronoun/deictic (T2/T3), you MUST provide either:
  (a) subjectSpan naming the subject, OR
  (b) at least one contextFragment that explicitly names the subject.
- When T1 (reported speech) fires, include attributionSpan if present.

SELF-REPORT
Set "contextRequired: true|false" and when true, set "contextReason" to one of {"T1","T2","T3","T4"} (or a short combo like "T1+T2").

CANDIDATE QUALITY (light)
- Must contain: an explicit subject noun phrase (or a pronoun if the subject is named in an included context sentence/fragment) AND
- At least ONE signal: number, date/year, named entity, or definitional/event verb ("is/was/are/hosted/invented/dates back").
- Avoid pure fillers ("well, so, you know"), imperatives/meta ("make sure…"), and stand-alone questions unless they assert a checkable proposition.

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
      // supporting spans
      subjectSpan?, objectSpan?, timeSpan?, locationSpan?, attributionSpan?,
      // context helpers
      context?, contextFragments?, contextRequired?, contextReason?,
      // (legacy) subjectNoun? — optional hint if obvious; may be dropped in future
      searchSeeds?, version?, revisionAction?, revisionNote?
    }
  ]
}
- speakerTag on each item, when present, MUST match one of the speakerNumber values (e.g., "Speaker 1").
`;

export const structuredOutputConfigLoose: StructuredOutputConfig = {
    parsingConfig: {
        parsingStrategy: "update-ms",
        transcriptInclusionPolicy: {
            transcriptMode: "window",
            windowTokenSize: 100,
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
