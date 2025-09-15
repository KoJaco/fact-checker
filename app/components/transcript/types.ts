export type CandidateItem = {
    id: string;
    kind: "factcheck";
    quote: string; // exact contiguous span (1–3 sentences)
    context?: string | null; // one adjacent sentence (not overlapping quote)
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

export type RevisionAction =
    | "expanded"
    | "corrected"
    | "narrowed"
    | "withdrawn";

export type InsightItem = {
    id: string;
    kind: "factcheck";
    quote: string;
    context?: string | null;
    contextFragments?: string[] | null;
    contextReason?: string | null;
    attributionSpan?: string | null;
    contextRequired?: boolean | null;
    subjectNoun?: string | null;
    searchSeeds?: string[] | null;
    speakerHint?: string | null;
    speakerTag?: string | null;
    before?: string | null;
    after?: string | null;
    occurrence?: number | null;

    // factcheck
    factCheckState?:
        | "analyzing"
        | "searching"
        | "retrying"
        | "judging"
        | "final"
        | null;
    factCheckVerdict?: "supported" | "disputed" | "uncertain" | null;
    factCheckConfidence?: number | null;
    factCheckRationale?: string | null;

    hasNumber?: boolean | null;
    hasDate?: boolean | null;
    hasNamedEntity?: boolean | null;
    verifiabilityScore?: number | null;

    version?: number | null;

    // NEW: revision semantics
    revisionAction?: RevisionAction | null;
    revisionNote?: string | null;

    // ClaimEngine integration
    claimEngineData?: any; // NormalizedClaim from claimify
};
