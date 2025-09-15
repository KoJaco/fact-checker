import { create } from "zustand";
import type {
    TranscriptMsg,
    StructuredOutputMsg,
} from "../types/transcriptTypes";
import {
    buildTranscriptDoc,
    insertStructuredSpans,
    findFactcheckSpanById,
    type TranscriptDoc,
} from "../lib/transcriptDoc";

type Mode = "diarized" | "flat";

type FactcheckPatch = Partial<{
    state: string;
    verdict: "supported" | "disputed" | "uncertain";
    confidence: number;
    rationale: string;
    citations: {
        url: string;
        title: string;
        published_at?: string | null;
        quote: string;
    }[];
    nowISO?: string;
}>;

type AppState = {
    doc: TranscriptDoc;
    mode: Mode;
    applyTranscript: (msg: TranscriptMsg) => void;
    applyStructuredOutput: (msg: StructuredOutputMsg) => void;
    updateFactcheck: (id: string, patch: FactcheckPatch) => void;
    setMode: (m: Mode) => void;
};

export const useAppStore = create<AppState>((set, get) => ({
    doc: { turns: [] },
    mode: "diarized",
    setMode: (m) => set({ mode: m }),
    applyTranscript: (msg) =>
        set((s) => ({ doc: buildTranscriptDoc(msg, s.doc) })),
    applyStructuredOutput: (msg) =>
        set((s) => ({ doc: insertStructuredSpans(s.doc, msg) })),
    updateFactcheck: (id, patch) =>
        set((s) => {
            const found = findFactcheckSpanById(s.doc, id);
            if (!found) return {} as any;
            found.span.meta = { ...(found.span.meta || {}), ...patch };
            return {
                doc: {
                    turns: s.doc.turns.map((t) =>
                        t.id === found.turn.id ? { ...found.turn } : t
                    ),
                },
            };
        }),
}));
