// client/dispatchRetrieval.ts
// Phase C: send {quote, context, seeds} to Perplexity (or your retriever) and update UI state.

export type Verdict = "supported" | "disputed" | "uncertain";

export type RetrievalReq = {
    id: string; // claim id
    quote: string;
    context?: string | null;
    subject?: string | null;
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
        q.subject ? `Subject: ${q.subject}` : null,
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
    // console.log(`[FactCheck] Dispatching ${items.length} fact-check requests`);

    // Simple sequential dispatch; you can parallelize with a small concurrency limit
    for (const it of items) {
        try {
            // console.log(`[FactCheck] Starting fact-check for item ${it.id}`);
            onUpdate({ id: it.id, state: "searching" });

            const prompt = buildPrompt(it);
            // console.log(
            //     `[FactCheck] Built prompt for ${it.id}:`,
            //     prompt.substring(0, 100) + "..."
            // );

            const res = await ask({ prompt, searchHints: it.seeds });
            // console.log(`[FactCheck] Got response for ${it.id}:`, {
            //     verdict: res.verdict,
            //     confidence: res.confidence,
            //     hasRationale: !!res.rationale,
            //     citationCount: res.citations?.length || 0,
            // });

            onUpdate({
                id: it.id,
                state: "final",
                verdict: res.verdict,
                confidence: Math.max(0, Math.min(1, res.confidence)),
                rationale: res.rationale,
                citations: res.citations,
            });

            // console.log(`[FactCheck] Updated state to final for ${it.id}`);
        } catch (e: any) {
            console.error(`[FactCheck] Error processing ${it.id}:`, e);
            onUpdate({
                id: it.id,
                state: "error",
                error: String(e?.message || e),
            });
        }
    }

    // console.log(
    //     `[FactCheck] Completed all ${items.length} fact-check requests`
    // );
}

// Live ask function that hits the Remix action backed by Perplexity
export const askPerplexity: AskFn = async ({ prompt, searchHints }) => {
    // Extract the raw claim line from our prompt builder
    // Expect a line beginning with "Claim: "; fallback to whole prompt
    let claim = prompt;
    let context: string | null = null;
    let subject: string | null = null;
    const lines = prompt.split("\n");
    const claimLine = lines.find((l) => l.toLowerCase().startsWith("claim:"));
    const contextLine = lines.find((l) =>
        l.toLowerCase().startsWith("context:")
    );
    const subjectLine = lines.find((l) =>
        l.toLowerCase().startsWith("subject:")
    );
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
    if (contextLine) {
        const raw = contextLine.slice("Context:".length).trim();
        context = raw.length > 0 ? raw : null;
    }
    if (subjectLine) {
        let raw = subjectLine.slice("Subject:".length).trim();
        if (
            (raw.startsWith('"') && raw.endsWith('"')) ||
            (raw.startsWith("'") && raw.endsWith("'"))
        ) {
            raw = raw.slice(1, -1);
        }
        subject = raw.length > 0 ? raw : null;
    }

    const res = await fetch("/action/factcheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            claim,
            context,
            subject,
            seeds: Array.isArray(searchHints) ? searchHints : undefined,
            now: new Date().toISOString(),
        }),
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
