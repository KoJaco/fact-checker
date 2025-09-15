export interface ClaimItemIn {
    id: string;
    kind: "factcheck";
    speakerTag?: string | null;

    quote: string;
    subjectSpan?: string | null;
    objectSpan?: string | null;
    timeSpan?: string | null;
    locationSpan?: string | null;
    attributionSpan?: string | null;

    context?: string | null;
    contextFragments?: string[] | null;

    contextRequired?: boolean | null;
    contextReason?:
        | "T1"
        | "T2"
        | "T3"
        | "T4"
        | `${"T1" | "T2" | "T3" | "T4"}+${"T1" | "T2" | "T3" | "T4"}`
        | null;

    // legacy hint; may be ignored:
    subjectNoun?: string | null;

    searchSeeds: string[];
    version?: number | null;
    revisionAction?: "expanded" | "corrected" | "narrowed" | "withdrawn" | null;
    revisionNote?: string | null;
}

export interface SpeakerLabel {
    speakerNumber: string; // e.g. "Speaker 0"
    speakerDerivedLabel: string; // "", "Host", "Jane Doe"
}

export interface LlmPayload {
    rev: number;
    speakerLabels?: SpeakerLabel[] | null;
    items: ClaimItemIn[];
}

export interface Sentence {
    idx: number;
    text: string;
    speakerTag?: string | null;
}

export interface TranscriptIndex {
    // last N sentences (e.g., 80–120)
    sentences: Sentence[];
}

export interface CorefEvidence {
    source:
        | "adjacent"
        | "fragment"
        | "speakerMemory"
        | "globalMemory"
        | "fallback";
    evidence: string[]; // exact substrings used
}

export interface NormalizedClaim {
    id: string; // original llm id (may differ from dedupe key)
    speakerTag?: string | null;

    // extracted spans
    quote: string;
    subjectSurface?: string; // from subjectSpan or context-derived
    objectSurface?: string;
    timeSurface?: string;
    locationSurface?: string;
    attributionSurface?: string;
    context?: string | null;
    contextFragments?: string[] | null;
    // carry-through from LLM item for UI/search
    originalSeeds?: string[] | null;

    // normalized slots (cheap heuristics)
    subjectCanonical?: string; // canonicalized subject
    relationLemma?: string; // lemmatized simple verb/head
    polarity: "affirmed" | "negated";
    objectCanonical?: string;

    quantityText?: string; // raw quantity phrase if any
    quantityValue?: number | [number, number] | null;
    quantityUnit?: string | null;
    comparator?: "<" | "≤" | "=" | "≥" | ">" | null;
    approx?: boolean;

    timeNormalized?: string | null; // yyyy or yyyy-mm
    locationNormalized?: string | null;

    attributionSource?: string | null; // "Spearman", "NASA", ...

    scope?: string | null; // "among adults 18–25", "in Australia"
    condition?: string | null;

    coref?: CorefEvidence | null;

    // lifecycle
    claimKey: string; // stable dedupe key (see key.ts)
    version: number; // local version we manage
    status:
        | "PENDING_COREF"
        | "READY"
        | "QUEUED"
        | "CHECKING"
        | "VERIFIED"
        | "REFUTED"
        | "UNCERTAIN"
        | "WITHDRAWN";
    confidence: number; // 0..1
    createdAt: number; // ms epoch (injected clock)
    updatedAt: number;
}

export interface Entity {
    surface: string;
    canonical: string;
    role?: "PERSON" | "ORG" | "PLACE" | "PRODUCT" | "OTHER";
    lastSeenSentenceIdx: number;
    salience: number; // simple score (recency/role)
    aliases?: Set<string>;
}

export interface EntityDeque {
    push(e: Entity): void;
    pop(): Entity | undefined;
    peek(): Entity | undefined;
    toArray(): Entity[];
    size(): number;
}

export interface Memories {
    speakerMemory: Map<string, EntityDeque>; // key by speakerTag
    globalMemory: EntityDeque;
    topicId: string; // current topic segment id
}

export interface Dispatcher {
    send(
        claimId: string,
        query: string,
        meta: Record<string, any>
    ): Promise<void>;
}

export interface Clock {
    now(): number;
}

export interface Config {
    debounceMs: number; // e.g., 3000
    pendingCorefTimeoutMs: number; // e.g., 12000
    maxQueuePerMinute: number; // rate limit
}
