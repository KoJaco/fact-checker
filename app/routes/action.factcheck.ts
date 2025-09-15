import type { ActionFunctionArgs } from "react-router";
import { factCheckClaim } from "~/server/perplexity.server";

export async function action({ request }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return { error: "Method not allowed", status: 405 } as const;
    }
    try {
        const body = await request.json();
        const claimText = String(body?.claim || "");
        const nowISO = String(body?.now || new Date().toISOString());
        if (!claimText) {
            return { error: "Missing claim", status: 400 } as const;
        }
        const result = await factCheckClaim({ claimText, nowISO });
        return result;
    } catch (err) {
        return {
            verdict: "uncertain",
            confidence: 0.2,
            rationale: "Temporarily unable to verify",
            citations: [],
            error: null,
            status: 200,
        } as const;
    }
}
