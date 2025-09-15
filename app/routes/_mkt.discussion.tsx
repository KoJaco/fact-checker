import { Container } from "~/components/ui/container";
import { TranscriptFlexible } from "../components/transcript/transcript-flexible";
import { useLoaderData, Link } from "react-router";

export async function loader() {
    const apiUrl = process.env.API_URL;
    return { apiUrl };
}

export default function TranscriptFlexibleRoute() {
    const { apiUrl } = useLoaderData<typeof loader>();
    return (
        <Container>
            <div className="py-24">
                <div className="flex flex-col gap-y-2 items-start justify-between mb-8">
                    <Link
                        to="/"
                        className="text-sm text-foreground/70 hover:text-foreground"
                    >
                        ← Back
                    </Link>
                    <h1 className="text-2xl font-bold">Discussion</h1>
                </div>
                {apiUrl ? (
                    <TranscriptFlexible apiUrl={apiUrl} />
                ) : (
                    <div>No API URL</div>
                )}
            </div>
        </Container>
    );
}
