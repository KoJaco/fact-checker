import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
    const API_BASE =
        process.env
            .SCHMA_API_BASE /* e.g. https://<fly-app>.fly.dev in prod */ ??
        "http://localhost:8080"; // dev: your Go server without TLS

    if (request.method !== "GET") {
        return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
            status: 405,
            headers: { "content-type": "application/json" },
        });
    }

    const url = new URL(request.url);
    const qs = url.search;

    try {
        const upstream = await fetch(`${API_BASE}/api/v1/batch/jobs${qs}`, {
            method: "GET",
            headers: {
                "x-api-key": process.env.SCHMA_API_KEY!, // server-only
            },
        });

        const contentType =
            upstream.headers.get("content-type") || "application/json";
        const body = await upstream.text();

        return new Response(body, {
            status: upstream.status,
            headers: { "content-type": contentType },
        });
    } catch (err: any) {
        const msg = err?.cause?.message || err?.message || String(err);
        return new Response(
            JSON.stringify({ error: "proxy failed", detail: msg }),
            {
                status: 502,
                headers: { "content-type": "application/json" },
            }
        );
    }
}
