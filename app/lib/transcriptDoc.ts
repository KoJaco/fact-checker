import type {
    TranscriptMsg,
    StructuredOutputMsg,
    Turn,
    Word,
    PhraseDisplay,
} from "../types/transcriptTypes";

export type SpanKind = "text" | "clarify" | "contradict" | "factcheck-anchor";

export type Span = {
    kind: SpanKind;
    id?: string;
    turnId: string;
    startSec: number;
    endSec: number;
    charStart: number; // inclusive
    charEnd: number; // exclusive
    meta?: any;
};

export type TurnDoc = {
    id: string;
    speaker: string;
    startSec: number;
    endSec: number;
    text: string;
    wordMap: {
        startSec: number;
        endSec: number;
        charStart: number;
        charEnd: number;
    }[];
    spans: Span[];
};

export type TranscriptDoc = { turns: TurnDoc[] };

function synthesizeTurnId(turn: Turn): string {
    const base = `${turn.speaker || "spk"}-${Math.round((turn.start ?? 0) * 1000)}`;
    return turn.id || base;
}

function buildTextFromWords(words: Word[] | undefined): {
    text: string;
    wordMap: TurnDoc["wordMap"];
} {
    if (!words || words.length === 0) return { text: "", wordMap: [] };
    let text = "";
    const map: TurnDoc["wordMap"] = [];
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const token = (w.punctuatedWord ?? w.text ?? "").trim();
        const needsSpace =
            i > 0 &&
            !text.endsWith(" ") &&
            token &&
            !token.startsWith(".") &&
            !token.startsWith(",");
        const charStart = text.length + (needsSpace ? 1 : 0);
        if (needsSpace) text += " ";
        text += token;
        const charEnd = text.length;
        map.push({ startSec: w.start, endSec: w.end, charStart, charEnd });
    }
    return { text, wordMap: map };
}

function buildSentenceSpansFromPhrases(
    turnId: string,
    text: string,
    phrases?: PhraseDisplay[]
): Span[] {
    if (!phrases || phrases.length === 0)
        return inferSentenceSpans(turnId, text);
    const spans: Span[] = [];
    // Fallback to whole-text if we can't map precisely
    // Here we assume phrases cover the text range roughly
    const chunk: Span = {
        kind: "text",
        turnId,
        startSec: phrases[0].start,
        endSec: phrases[phrases.length - 1].end,
        charStart: 0,
        charEnd: text.length,
    };
    spans.push(chunk);
    return spans;
}

function inferSentenceSpans(turnId: string, text: string): Span[] {
    if (!text) return [];
    const spans: Span[] = [];
    const regex = /[^.!?]+[.!?]?/g;
    let match: RegExpExecArray | null;
    let idx = 0;
    while ((match = regex.exec(text))) {
        const frag = match[0];
        const charStart = match.index;
        const charEnd = charStart + frag.length;
        spans.push({
            kind: "text",
            turnId,
            startSec: 0,
            endSec: 0,
            charStart,
            charEnd,
        });
        idx = charEnd;
    }
    if (spans.length === 0) {
        spans.push({
            kind: "text",
            turnId,
            startSec: 0,
            endSec: 0,
            charStart: 0,
            charEnd: text.length,
        });
    }
    return spans;
}

export function buildTranscriptDoc(
    msg: TranscriptMsg,
    prev?: TranscriptDoc
): TranscriptDoc {
    const prevMap = new Map<string, TurnDoc>();
    prev?.turns.forEach((t) => prevMap.set(t.id, t));
    const turns: TurnDoc[] = [];
    const sourceTurns = msg.turns ?? [];
    for (const turn of sourceTurns) {
        const id = synthesizeTurnId(turn);
        const existing = prevMap.get(id);
        const { text, wordMap } = buildTextFromWords(turn.words);
        const spansText = buildSentenceSpansFromPhrases(
            id,
            text,
            msg.phrasesDisplay
        );
        const base: TurnDoc = {
            id,
            speaker: turn.speaker,
            startSec: turn.start,
            endSec: turn.end,
            text,
            wordMap,
            spans: spansText,
        };
        if (existing) {
            // Merge spans: keep non-text spans from existing
            const nonText = existing.spans.filter((s) => s.kind !== "text");
            base.spans = [...spansText, ...nonText].sort(
                (a, b) => a.charStart - b.charStart
            );
        }
        turns.push(base);
        prevMap.delete(id);
    }
    // Keep any previous turns not present in this message
    for (const leftover of prevMap.values()) {
        turns.push(leftover);
    }
    // Sort by start time
    turns.sort((a, b) => a.startSec - b.startSec);
    return { turns };
}

export function mapTimeToChar(turn: TurnDoc, tSec: number): number {
    if (!turn.wordMap.length) return 0;
    let nearestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < turn.wordMap.length; i++) {
        const w = turn.wordMap[i];
        const center = (w.startSec + w.endSec) / 2;
        const dist = Math.abs(center - tSec);
        if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
        }
    }
    return turn.wordMap[nearestIdx].charEnd;
}

function findTargetTurn(doc: TranscriptDoc, item: any): TurnDoc | undefined {
    if (item.turnId) return doc.turns.find((t) => t.id === item.turnId);
    const start = item.start ?? 0;
    const end = item.end ?? 0;
    return doc.turns.find((t) => !(t.endSec < start || t.startSec > end));
}

function enclosingSentenceSpan(
    turn: TurnDoc,
    charStart: number,
    charEnd: number
): Span | undefined {
    const sentences = turn.spans.filter((s) => s.kind === "text");
    return sentences.find(
        (s) => s.charStart <= charStart && s.charEnd >= charEnd
    );
}

export function insertStructuredSpans(
    doc: TranscriptDoc,
    so: StructuredOutputMsg
): TranscriptDoc {
    const merged: TranscriptDoc = {
        turns: doc.turns.map((t) => ({ ...t, spans: [...t.spans] })),
    };
    const payload = { ...so.final, ...so.delta } as Record<string, any>;
    const keys = ["clarifications", "contradictions", "factchecks"] as const;
    for (const key of keys) {
        const items: any[] = payload[key] || [];
        for (const item of items) {
            const turn = findTargetTurn(merged, item);
            if (!turn) continue;
            const charStart = item.spanStart ?? mapTimeToChar(turn, item.start);
            const charEnd = item.spanEnd ?? mapTimeToChar(turn, item.end);
            const sentence = enclosingSentenceSpan(
                turn,
                charStart,
                charEnd
            ) || {
                charStart: 0,
                charEnd: turn.text.length,
            };
            if (key === "clarifications") {
                const span: Span = {
                    kind: "clarify",
                    id: item.id,
                    turnId: turn.id,
                    startSec: item.start,
                    endSec: item.end,
                    charStart: sentence.charEnd,
                    charEnd: sentence.charEnd,
                    meta: item.meta,
                };
                turn.spans.push(span);
            } else if (key === "contradictions") {
                const span: Span = {
                    kind: "contradict",
                    id: item.id,
                    turnId: turn.id,
                    startSec: item.start,
                    endSec: item.end,
                    charStart: sentence.charEnd,
                    charEnd: sentence.charEnd,
                    meta: item.meta,
                };
                turn.spans.push(span);
            } else if (key === "factchecks") {
                const anchor: Span = {
                    kind: "factcheck-anchor",
                    id: item.id,
                    turnId: turn.id,
                    startSec: item.start,
                    endSec: item.end,
                    charStart: sentence.charEnd,
                    charEnd: sentence.charEnd,
                    meta: item.meta ?? { state: "analyzing" },
                };
                turn.spans.push(anchor);
            }
            // Keep spans sorted by charStart
            turn.spans.sort((a, b) => a.charStart - b.charStart);
        }
    }
    return merged;
}

export function findFactcheckSpanById(
    doc: TranscriptDoc,
    id: string
): { turn: TurnDoc; span: Span } | undefined {
    for (const turn of doc.turns) {
        const span = turn.spans.find(
            (s) => s.kind === "factcheck-anchor" && s.id === id
        );
        if (span) return { turn, span };
    }
    return undefined;
}
