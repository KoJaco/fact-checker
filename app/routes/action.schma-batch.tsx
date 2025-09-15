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
        const formData = await request.formData();

        const upstream = await fetch(`${API_BASE}/api/v1/batch`, {
            method: "POST",
            headers: {
                // Let fetch set the multipart boundary automatically when passing FormData
                "x-api-key": process.env.SCHMA_API_KEY!, // server-only
            },
            body: formData,
        });

        const contentType =
            upstream.headers.get("content-type") || "application/json";
        const body = contentType.includes("application/json")
            ? await upstream.text()
            : await upstream.text();

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
