import { handleServerMsg } from "./ingest";
import type {
    TranscriptMsg,
    StructuredOutputMsg,
} from "../types/transcriptTypes";
import { useAppStore } from "../state/store";

export function runFakeFixture() {
    const t1: TranscriptMsg = {
        type: "transcript",
        text: "Australia’s inflation is 8% right now.",
        final: true,
        turns: [
            {
                speaker: "Host",
                start: 10.0,
                end: 18.0,
                words: [
                    {
                        text: "Australia’s",
                        start: 10.0,
                        end: 10.5,
                        punctuatedWord: "Australia’s",
                    },
                    {
                        text: "inflation",
                        start: 10.5,
                        end: 11.1,
                        punctuatedWord: "inflation",
                    },
                    {
                        text: "is",
                        start: 11.1,
                        end: 11.2,
                        punctuatedWord: "is",
                    },
                    {
                        text: "8%",
                        start: 11.2,
                        end: 12.0,
                        punctuatedWord: "8%",
                    },
                    {
                        text: "right",
                        start: 12.0,
                        end: 12.3,
                        punctuatedWord: "right",
                    },
                    {
                        text: "now",
                        start: 12.3,
                        end: 12.7,
                        punctuatedWord: "now.",
                    },
                ],
                final: true,
            },
        ],
        phrasesDisplay: [{ start: 10.0, end: 18.0 }],
    };
    handleServerMsg(t1);

    setTimeout(() => {
        const so1: StructuredOutputMsg = {
            type: "structured_output",
            rev: 1,
            delta: {
                clarifications: [
                    {
                        id: "c1",
                        start: 10.5,
                        end: 17.5,
                        meta: {
                            suggestions: [
                                "Which metric—CPI or core?",
                                "What period?",
                            ],
                            links: [{ speaker: "Host", ts: 10.0 }],
                        },
                    },
                ],
                factchecks: [
                    {
                        id: "f1",
                        start: 10.0,
                        end: 18.0,
                        meta: { state: "analyzing" },
                    },
                ],
            },
            final: {},
        };
        handleServerMsg(so1);

        scheduleFactcheckFlow("f1", "Australia’s inflation is 8% right now.");
    }, 400);
}

function scheduleFactcheckFlow(id: string, claimText: string) {
    const { updateFactcheck } = useAppStore.getState();
    updateFactcheck(id, { state: "searching" });
    setTimeout(async () => {
        updateFactcheck(id, { state: "judging" });
        try {
            const nowISO = new Date().toISOString();
            const res = await fetch("/action/factcheck", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ claim: claimText, now: nowISO }),
            });
            if (!res.ok) throw new Error("Bad response");
            const data = await res.json();
            updateFactcheck(id, { state: "final", nowISO, ...data });
        } catch (err) {
            updateFactcheck(id, {
                state: "final",
                verdict: "uncertain",
                confidence: 0.2,
                rationale: "Temporarily unable to verify",
                citations: [],
            });
        }
    }, 800);
}
