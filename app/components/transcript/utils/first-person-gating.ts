// firstPerson-gating.ts

export type SpeakerMap = Record<
    string,
    { name?: string; role?: string } // e.g., { "Speaker 1": { name: "Simon Sinek", role: "Guest" } }
>;

const FIRST_PERSON_SUBJECT = /^(i|me|my|mine|we|our|ours)$/i;

/**
 * Returns:
 *  - ok=false: drop this item for fact-checking.
 *  - ok=true & normalizedSubject set: safe to fact-check; use normalizedSubject when building seeds.
 */
export function gateAndNormalizeFirstPerson(
    item: {
        subjectNoun?: string | null;
        speakerHint?: string | null; // diarized label ("Speaker 0/1/...") or custom tag
    },
    opts?: {
        speakerMap?: SpeakerMap;
        allowFirstPersonIfNamed?: boolean; // default true
    }
): { ok: boolean; normalizedSubject?: string } {
    const allowIfNamed = opts?.allowFirstPersonIfNamed ?? true;
    const subject = (item.subjectNoun || "").trim();

    // No subject -> don't block here, let other gates decide.
    if (!subject) return { ok: true };

    // If not first-person pronoun, we're fine.
    if (!FIRST_PERSON_SUBJECT.test(subject)) return { ok: true };

    // First-person: try to resolve to a known speaker name.
    const tag = (item.speakerHint || "").trim();
    const resolvedName = tag && opts?.speakerMap?.[tag]?.name;

    if (allowIfNamed && resolvedName && resolvedName.trim().length > 0) {
        return { ok: true, normalizedSubject: resolvedName.trim() };
    }

    // Otherwise, reject (not verifiable beyond private experience)
    return { ok: false };
}
