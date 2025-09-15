import { useState } from "react";
import FactCheckCard from "./fact-check-card";
import { Button } from "./ui/button";

type Verdict = "supported" | "disputed" | "uncertain";

export default function FactCheckTester() {
    const [claim, setClaim] = useState<string>(
        "The Eiffel Tower is 324 meters tall."
    );
    const [state, setState] = useState<
        "idle" | "analyzing" | "searching" | "retrying" | "judging" | "final"
    >("idle");
    const [useMock, setUseMock] = useState<boolean>(true);
    const [result, setResult] = useState<{
        verdict?: Verdict;
        confidence?: number;
        rationale?: string;
        citations?: {
            url: string;
            title: string;
            published_at?: string | null;
            quote: string;
        }[];
        nowISO?: string;
    } | null>(null);

    async function run() {
        setResult(null);
        setState("analyzing");
        if (useMock) {
            setTimeout(() => setState("searching"), 300);
            setTimeout(() => setState("retrying"), 900);
            setTimeout(() => setState("judging"), 1500);
            setTimeout(() => {
                setResult({
                    verdict: "supported",
                    confidence: 0.95,
                    rationale:
                        "The Sun's diameter is ~1,391,400 km vs Moon's 3,474 km, ~400x. The claim is a reasonable approximation.",
                    citations: [
                        {
                            url: "https://www.jpl.nasa.gov/edu/pdfs/scaless_reference.pdf",
                            title: "Solar System Sizes and Distances",
                            published_at: null,
                            quote: "Sun 1,391,400 km ... Moon 3,474 km",
                        },
                        {
                            url: "https://en.wikipedia.org/wiki/Moon",
                            title: "Moon - Wikipedia",
                            published_at: null,
                            quote: "Its mass is 1.2% that of the Earth, and its diameter is 3,474 km (2,159 mi)",
                        },
                        {
                            url: "https://solarsystem.nasa.gov/sun-by-the-numbers/",
                            title: "The Sun By the Numbers - Solar System Exploration - NASA",
                            published_at: null,
                            quote: "Sun is 109.2x larger than Earth.",
                        },
                    ],
                    nowISO: new Date().toISOString(),
                });
                setState("final");
            }, 2200);
            return;
        }
        try {
            setState("judging");
            const r = await fetch("/action/factcheck", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ claim, now: new Date().toISOString() }),
            });
            const data = await r.json();
            setResult({
                verdict: data.verdict as Verdict,
                confidence: data.confidence,
                rationale: data.rationale,
                citations: data.citations,
                nowISO: data.nowISO,
            });
            setState("final");
        } catch (e) {
            setResult({
                verdict: "uncertain",
                confidence: 0.2,
                rationale: "Temporarily unable to verify",
                citations: [],
                nowISO: new Date().toISOString(),
            });
            setState("final");
        }
    }

    return (
        <div className="mt-6 border rounded-lg p-3 bg-card/50">
            <div className="flex items-center gap-2 mb-2">
                <input
                    className="flex-1 px-2 py-1 rounded border bg-background"
                    value={claim}
                    onChange={(e) => setClaim(e.target.value)}
                    placeholder="Enter a factual claim to verify"
                />
                <label className="flex items-center gap-1 text-xs text-foreground/70">
                    <input
                        type="checkbox"
                        checked={useMock}
                        onChange={(e) => setUseMock(e.target.checked)}
                    />
                    Mock
                </label>
                <Button size="sm" onClick={run}>
                    Test fact check
                </Button>
            </div>
            {state !== "idle" && (
                <div className="mt-2">
                    <FactCheckCard
                        id="tester"
                        state={state}
                        claim={claim}
                        verdict={result?.verdict as any}
                        confidence={result?.confidence}
                        rationale={result?.rationale}
                        citations={result?.citations}
                        nowISO={result?.nowISO}
                    />
                </div>
            )}
        </div>
    );
}
