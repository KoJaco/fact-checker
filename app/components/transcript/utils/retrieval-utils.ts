// client/dispatchRetrieval.ts
// Phase C: send {quote, context, seeds} to Perplexity (or your retriever) and update UI state.

export type Verdict = "supported" | "disputed" | "uncertain";

export type RetrievalReq = {
    id: string; // claim id
    quote: string;
    context?: string | null;
    seeds: string[];
};

export type RetrievalUpdate = {
    id: string;
    state: "searching" | "judging" | "final" | "error";
    verdict?: Verdict;
    confidence?: number;
    rationale?: string;
    citations?: { title: string; url: string }[];
    error?: string;
};

export type AskFn = (input: {
    prompt: string;
    searchHints?: string[];
    // include model name/tier tied to plan if you want
}) => Promise<{
    verdict: Verdict;
    confidence: number; // 0..1
    rationale: string; // <= ~50 words
    citations: { title: string; url: string }[];
}>;

// Build a compact prompt for Perplexity-like systems
function buildPrompt(q: RetrievalReq) {
    const lines = [
        `Claim: ${q.quote}`,
        q.context ? `Context: ${q.context}` : null,
        q.seeds.length ? `Search hints: ${q.seeds.join(" | ")}` : null,
        `Task: Verify the claim with high precision using authoritative sources. Return a short verdict (supported/disputed/uncertain), brief rationale (<=50 words), and 2–5 citations (prefer official/org/gov/edu).`,
    ].filter(Boolean);
    return lines.join("\n");
}

export async function dispatchFactChecks(
    items: RetrievalReq[],
    ask: AskFn,
    onUpdate: (u: RetrievalUpdate) => void
) {
    // Simple sequential dispatch; you can parallelize with a small concurrency limit
    for (const it of items) {
        try {
            onUpdate({ id: it.id, state: "searching" });
            const prompt = buildPrompt(it);
            const res = await ask({ prompt, searchHints: it.seeds });
            onUpdate({
                id: it.id,
                state: "final",
                verdict: res.verdict,
                confidence: Math.max(0, Math.min(1, res.confidence)),
                rationale: res.rationale,
                citations: res.citations,
            });
        } catch (e: any) {
            onUpdate({
                id: it.id,
                state: "error",
                error: String(e?.message || e),
            });
        }
    }
}

// Live ask function that hits the Remix action backed by Perplexity
export const askPerplexity: AskFn = async ({ prompt }) => {
    // Extract the raw claim line from our prompt builder
    // Expect a line beginning with "Claim: "; fallback to whole prompt
    let claim = prompt;
    const lines = prompt.split("\n");
    const claimLine = lines.find((l) => l.toLowerCase().startsWith("claim:"));
    if (claimLine) {
        let raw = claimLine.slice("Claim:".length).trim();
        // Strip wrapping quotes if present
        if (
            (raw.startsWith('"') && raw.endsWith('"')) ||
            (raw.startsWith("'") && raw.endsWith("'"))
        ) {
            raw = raw.slice(1, -1);
        }
        claim = raw.length > 0 ? raw : claim;
    }

    const res = await fetch("/action/factcheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim, now: new Date().toISOString() }),
    });
    if (!res.ok) {
        throw new Error(`factcheck request failed (${res.status})`);
    }
    const data = await res.json();
    return {
        verdict: data.verdict as Verdict,
        confidence: Number(data.confidence ?? 0),
        rationale: String(data.rationale ?? ""),
        citations: Array.isArray(data.citations) ? data.citations : [],
    };
};
