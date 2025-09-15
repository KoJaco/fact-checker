type Citation = {
    url: string;
    title: string;
    published_at?: string | null;
    quote: string;
};

export async function factCheckClaim({
    claimText,
    nowISO,
}: {
    claimText: string;
    nowISO: string;
}) {
    const apiKey = process.env.PERPLEXITY_API_KEY;

    if (!apiKey) {
        return {
            verdict: "uncertain" as const,
            confidence: 0.2,
            rationale: "API key missing",
            citations: [] as Citation[],
        };
    }

    const url = "https://api.perplexity.ai/chat/completions";
    const system = `You are a meticulous, time-aware fact-checker. Search the live web. Use only what you find now. Return STRICT JSON only.`;
    const user = `CLAIM:\n"${claimText}"\n\nCONTEXT & RULES:\n- Treat words like "now", "today", "currently" as referring to: ${nowISO}.\n- Prefer official sources (.gov, .edu, official orgs) and the most recent data.\n- If sources conflict or are insufficient, set verdict to "uncertain".\n- Each citation must include an exact quote copied from the page text.\n- Keep "rationale" under 50 words.\n\nRETURN JSON EXACTLY:\n{\n  "verdict": "supported | disputed | uncertain",\n  "confidence": 0.0,\n  "rationale": "string",\n  "citations": [\n    { "url": "string", "title": "string", "published_at": "YYYY-MM-DD|null", "quote": "string" }\n  ]\n}`;

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "sonar-pro",
                temperature: 0,
                max_tokens: 400,
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        schema: {
                            type: "object",
                            properties: {
                                verdict: {
                                    type: "string",
                                    enum: [
                                        "supported",
                                        "disputed",
                                        "uncertain",
                                    ],
                                },
                                confidence: {
                                    type: "number",
                                    minimum: 0,
                                    maximum: 1,
                                },
                                rationale: {
                                    type: "string",
                                },
                                citations: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            url: { type: "string" },
                                            title: { type: "string" },
                                            published_at: { type: "string" },
                                            quote: { type: "string" },
                                        },
                                        required: ["url", "title", "quote"],
                                    },
                                },
                            },
                            required: [
                                "verdict",
                                "confidence",
                                "rationale",
                                "citations",
                            ],
                        },
                    },
                },
            }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content || "{}";
        const parsed = JSON.parse(content);
        const result = {
            verdict: parsed.verdict as "supported" | "disputed" | "uncertain",
            confidence: Number(parsed.confidence ?? 0),
            rationale: String(parsed.rationale ?? ""),
            citations: Array.isArray(parsed.citations) ? parsed.citations : [],
        };

        return result;
    } catch (err) {
        return {
            verdict: "uncertain" as const,
            confidence: 0.2,
            rationale: "Temporarily unable to verify",
            citations: [] as Citation[],
        };
    }
}
