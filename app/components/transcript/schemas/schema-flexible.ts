import type { StructuredOutputConfig } from "~/lib/sdk";

type CandidateItemFlexible = {
    id: string; // stable; reuse on revisions
    kind: "factcheck";
    status?: "draft" | "final"; // NEW: draft-first flow
    completeness?: number | null; // 0..1 heuristic
    missingParts?: ("subject" | "predicate" | "metric" | "time")[] | null;

    quote: string; // exact span (prefer minimal, contiguous)
    context?: string | null; // one adjacent sentence (or null)
    // OPTIONAL multi-fragment support (see §3)
    contextFragments?: string[] | null;

    subjectNoun?: string | null;
    searchSeeds?: string[] | null;

    version?: number | null;
    revisionAction?: "expanded" | "corrected" | "narrowed" | "withdrawn" | null;
    revisionNote?: string | null;
};

/* ---------- Parsing Guide (two items max, draft→final, fragments) ---------- */
export const parsingGuide = `
YOU ARE: A span extractor for multi-party discussions. No paraphrase, return JSON only.

CONTEXT (flexible, after-silence)
- Triggered after voice activity detection (silence or turn end).
- Goal: capture nuanced claims that may be distributed across sentences or speakers.
- Emit up to TWO claims (0–2) per burst.

TASK
1) Propose 0–2 checkable CLAIM CANDIDATES as EXACT contiguous spans.
2) Support distributed claims by draft→final metadata.

QUOTE + CONTEXT RULES
- quote: EXACT substring; 1–3 sentences to keep subject + predicate together. No paraphrase.
- context (optional): ONE adjacent sentence (prefer BEFORE) that resolves who/what/when; MUST NOT duplicate quote.
- contextFragments (optional): up to 3 EXACT substrings elsewhere that clarify subject/metric/time (≤ ~120 tokens each).

DRAFT → FINAL RULES
- If only part of the claim is expressed (subject now, metric later, etc.), emit/upgrade a DRAFT item:
  • status: "draft"
  • completeness: 0..1
  • missingParts: any of ["subject","predicate","metric","time"]
- When subject + predicate and ≥1 signal are present, set status: "final" and raise completeness.

SELECTION PRIORITY
1) Explicit subject (or reliably resolved by context/fragments).
2) Presence of at least one signal: number, year/date, named entity, or definitional/event verb ("is/was/are/hosted/invented/dates back").
3) High verifiability and specificity.

REVISION RULES
- Reuse id + increment version on improvements; withdraw if not check-worthy.

OUTPUT JSON ONLY:
{ "rev": <int>, "items": [ { id, kind, status?, completeness?, missingParts?, quote, context?, contextFragments?, subjectNoun?, searchSeeds?, version?, revisionAction?, revisionNote?, occurrence? } ] }
Items length MUST be 0, 1, or 2.
`;

/* ---------- SCHEMAS (shared) ---------- */
const sharedItemProps = {
    id: { type: "string", description: "Stable id; reuse on revisions." },
    kind: { type: "string", format: "enum", enum: ["factcheck"] },

    status: {
        type: "string",
        nullable: true,
        format: "enum",
        enum: ["draft", "final"],
        description: "Draft-first flow for distributed claims.",
    },
    completeness: {
        type: "number",
        nullable: true,
        description: "0..1 heuristic of how complete the claim is.",
    },
    missingParts: {
        type: "array",
        nullable: true,
        items: {
            type: "string",
            format: "enum",
            enum: ["subject", "predicate", "metric", "time"],
        },
        description: "Which parts are still missing to make this checkable.",
    },

    quote: {
        type: "string",
        description: "Exact contiguous span (1-3 sentences).",
    },
    context: {
        type: "string",
        nullable: true,
        description: "One adjacent sentence; no overlap with quote.",
    },
    contextFragments: {
        type: "array",
        nullable: true,
        items: { type: "string" },
        description:
            "Up to 3 extra EXACT substrings elsewhere (no overlap) that clarify subject/metric/time.",
    },
    subjectNoun: {
        type: "string",
        nullable: true,
        description: "Explicit subject if obvious (inside quote/context).",
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
        enum: ["expanded", "corrected", "narrowed", "withdrawn"],
    },
    revisionNote: { type: "string", nullable: true },
    occurrence: {
        type: "integer",
        nullable: true,
        description:
            "Occurrence index of the exact quote within the current window.",
    },
} as const;

/* ---------- CONFIG PRESETS ---------- */

/** Tight, fast, default RT preset (single or zero claim most ticks) */
export const structuredOutputConfigTight: StructuredOutputConfig = {
    parsingConfig: {
        parsingStrategy: "update-ms",
        transcriptInclusionPolicy: {
            transcriptMode: "window",
            windowTokenSize: 100, // small local context for snappy ticks
            tailSentences: 2,
        },
        prevOutputInclusionPolicy: {
            prevOutputMode: "ignore", // allow revisions without bloat
        },
    },
    updateMs: 4000, // 4s cadence for dense streams
    parsingGuide,
    schema: {
        name: "claims_candidates_rt",
        description:
            "Up to two candidate claims per tick (draft→final capable).",
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
                    properties: sharedItemProps as any,
                },
            },
        },
    },
};

/** Elastic fallback: if previous tick emitted 0 items, temporarily expand window */
export const structuredOutputConfigElastic: StructuredOutputConfig = {
    parsingConfig: {
        parsingStrategy: "update-ms",
        transcriptInclusionPolicy: {
            transcriptMode: "window",
            windowTokenSize: 200, // bigger local context to capture distributed claims
            tailSentences: 2,
        },
        prevOutputInclusionPolicy: {
            prevOutputMode: "apply",
        },
    },
    updateMs: 6000, // give a touch more time when window is larger
    parsingGuide,
    schema: structuredOutputConfigTight.schema,
};

/** After-silence burst: run when your VAD detects a pause or long turn end */
export const structuredOutputConfigBurstAfterSilence: StructuredOutputConfig = {
    parsingConfig: {
        parsingStrategy: "after-silence",
        transcriptInclusionPolicy: {
            transcriptMode: "window",
            windowTokenSize: 260, // sweep a larger chunk but not too large
            tailSentences: 2,
        },
        prevOutputInclusionPolicy: {
            prevOutputMode: "ignore",
        },
    },
    updateMs: 0, // not used for after-silence
    parsingGuide,
    schema: structuredOutputConfigTight.schema,
};
