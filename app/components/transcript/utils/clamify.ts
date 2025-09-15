// claimify-plus.ts
import type { InsightItem } from "../types";
import { assembleDistributedClaims } from "./distributed-assembler";
import { gateAndNormalizeFirstPerson } from "./first-person-gating";

export type Claim = InsightItem; // your type

export type ClaimifyOptions = {
    speakerMap?: Record<string, { name?: string; role?: string }>;
    allowFirstPersonIfNamed?: boolean; // default true
    maxOutput?: number; // keep in state/UI, e.g., 12
    maxDispatch?: number; // send to retrieval, e.g., 3-6
};

const DEF_VERBS =
    /\b(is|are|was|were|be|been|being|hosts?|hosted|invented|founded|acquired|announced|launched|dates?|dated|measures?|measured)\b/i;
const HAS_NUM = /(^|[^A-Za-z])(0|[1-9]\d*)(\.\d+)?(%|\b)/;
const HAS_YEAR = /\b(1[89]\d{2}|20\d{2}|21\d{2})\b/;
const HAS_CAPNE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})\b/; // crude named entity
const HEDGES =
    /\b(might|maybe|perhaps|possibly|some say|it seems|it appears|likely)\b/i;
const IMPER = /^(make sure|let's|let us|please|remember to|try to)\b/i;

function hasSignal(c: Claim) {
    const t = c.quote || "";
    return (
        HAS_NUM.test(t) ||
        HAS_YEAR.test(t) ||
        DEF_VERBS.test(t) ||
        HAS_CAPNE.test(t)
    );
}
function isImperative(c: Claim) {
    return IMPER.test(c.quote || "");
}
function isHedgeOnly(c: Claim) {
    const q = c.quote || "";
    const hedge = HEDGES.test(q);
    if (!hedge) return false;
    // If hedged but still has number/date/entity/def-verb, keep it.
    return !(
        HAS_NUM.test(q) ||
        HAS_YEAR.test(q) ||
        DEF_VERBS.test(q) ||
        HAS_CAPNE.test(q)
    );
}

function verifiabilityScore(c: Claim): number {
    let s = 0;
    const q = c.quote || "";
    if (HAS_NUM.test(q)) s += 3;
    if (HAS_YEAR.test(q)) s += 3;
    if (HAS_CAPNE.test(q)) s += 2;
    if (DEF_VERBS.test(q)) s += 2;
    if (HEDGES.test(q)) s -= 2;
    if (
        !c.subjectNoun ||
        /^(it|this|that|they|we|he|she|you|i|me|my|our)$/i.test(
            c.subjectNoun.trim()
        )
    )
        s -= 2;
    return s;
}

export function claimifyPlus(llmCandidates: Claim[], opts?: ClaimifyOptions) {
    const {
        speakerMap,
        allowFirstPersonIfNamed = true,
        maxOutput = 12,
        maxDispatch = 6,
    } = opts || {};

    // 1) Syntactic/semantic gates
    let filtered = llmCandidates.filter((c) => {
        if (!c.quote || !c.quote.trim()) return false;
        if (isImperative(c)) return false;
        if (!hasSignal(c)) return false;
        if (isHedgeOnly(c)) return false;

        // First-person gating/normalization
        const gate = gateAndNormalizeFirstPerson(
            {
                subjectNoun: c.subjectNoun,
                speakerHint: c.speakerHint || c.speakerTag,
            },
            { speakerMap, allowFirstPersonIfNamed }
        );
        if (!gate.ok) return false;
        if (gate.normalizedSubject) c.subjectNoun = gate.normalizedSubject;

        return true;
    });

    // 2) Assemble distributed claims (merge adjacent fragments)
    const { merged, withdrawnIds } = assembleDistributedClaims(filtered, {
        maxSentences: 3,
        maxTokensApprox: 120,
        jaccardThreshold: 0.25,
    });

    // Mark withdrawn locally (UI can fade them if they still exist in state)
    const finalClaims = merged.map<InsightItem>((c) => {
        if (withdrawnIds.has(c.id)) {
            return {
                ...c,
                revisionAction: "withdrawn" as InsightItem["revisionAction"],
                revisionNote: "superseded by merged span",
            };
        }
        return c;
    });

    // 3) Score & rank
    const ranked = finalClaims
        .map((c) => ({ c, score: verifiabilityScore(c) }))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.c)
        .slice(0, maxOutput);

    // 4) Pick dispatch set (top-K canonical)
    const toDispatch = ranked.slice(0, maxDispatch);

    return { ranked, toDispatch, withdrawnIds };
}
