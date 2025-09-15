// context-gating-utils.ts
import type { InsightItem } from "../types";

const REPORTING =
    /\b(said|stated|claims?|claimed|according to|reported by|wrote|announced|estimates?|per|via)\b/i;
const PRONOUN_SUBJ = /^(it|they|he|she|this|that|we|i|me|my|our)$/i;
const DEICTIC = /\b(this|that|these|those|here|there)\b/i;
const CONTINUATION =
    /\b(therefore|so|thus|as a result|hence|then|after that)\b/i;

export function detectContextTriggers(
    quote: string,
    subjectNoun?: string | null
): string[] {
    const reasons: string[] = [];
    if (REPORTING.test(quote)) reasons.push("T1");
    if (subjectNoun && PRONOUN_SUBJ.test(subjectNoun.trim()))
        reasons.push("T2");
    if (DEICTIC.test(quote)) reasons.push("T3");
    if (CONTINUATION.test(quote)) reasons.push("T4");
    return reasons;
}

export function passesContextPolicy(
    item: InsightItem,
    opts?: { requireFragmentsWhenNoAdjacent?: boolean }
): { ok: boolean; needRevision?: boolean; reason?: string } {
    const triggers = detectContextTriggers(item.quote || "", item.subjectNoun);
    const modelSaysRequired = item.contextRequired === true;
    const required = modelSaysRequired || triggers.length > 0;

    if (!required) return { ok: true };

    const hasContext = !!(item.context && item.context.trim());
    const hasFragments = (item.contextFragments?.length || 0) > 0;

    if (hasContext || hasFragments) return { ok: true };

    return {
        ok: false,
        needRevision: true,
        reason:
            (item.contextReason && String(item.contextReason)) ||
            triggers.join("+") ||
            "context-missing",
    };
}
