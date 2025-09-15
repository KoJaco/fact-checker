import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
    const API_BASE =
        process.env
            .SCHMA_API_BASE /* e.g. https://<fly-app>.fly.dev in prod */ ??
        "http://localhost:8080"; // dev: your Go server without TLS

    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
            status: 405,
            headers: { "content-type": "application/json" },
        });
    }

    try {
        const upstream = await fetch(`${API_BASE}/api/v1/tokens/ws`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": process.env.SCHMA_API_KEY!, // server-only
            },
        });

        if (!upstream.ok) {
            const text = await upstream.text();
            return new Response(text, {
                status: upstream.status,
                headers: { "content-type": "application/json" },
            });
        }

        const data = await upstream.json();
        return new Response(JSON.stringify(data), {
            status: upstream.status,
            headers: { "content-type": "application/json" },
        }); // { token, expires_in, sid? }
    } catch (err: any) {
        // Better diagnostics while you’re wiring things up
        const msg = err?.cause?.message || err?.message || String(err);
        return new Response(
            JSON.stringify({ error: "fetch failed", detail: msg }),
            {
                status: 502,
                headers: { "content-type": "application/json" },
            }
        );
    }
}
