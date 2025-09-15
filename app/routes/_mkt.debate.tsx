import { Container } from "~/components/ui/container";
import { TranscriptTight } from "../components/transcript/transcript-tight";
import { useLoaderData, Link } from "react-router";

export async function loader() {
    const apiUrl = process.env.API_URL;
    return { apiUrl };
}

export default function TranscriptTightRoute() {
    const { apiUrl } = useLoaderData<typeof loader>();
    return (
        <Container>
            <div className="pb-24 pt-24">
                <div className="flex flex-col gap-y-2 items-start justify-between mb-8">
                    <Link
                        to="/"
                        className="text-sm text-foreground/70 hover:text-foreground"
                    >
                        ← Back
                    </Link>
                    <h1 className="text-2xl font-bold">Debate</h1>
                </div>
                {apiUrl ? (
                    <TranscriptTight apiUrl={apiUrl} />
                ) : (
                    <div>No API URL</div>
                )}
            </div>
        </Container>
    );
}
