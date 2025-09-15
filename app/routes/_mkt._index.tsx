import { Container } from "~/components/ui/container";
import { useLoaderData, Link } from "react-router";

export async function loader() {
    const apiUrl = process.env.API_URL;

    return {
        apiUrl: apiUrl,
    };
}

export default function MktIndex() {
    const { apiUrl } = useLoaderData<typeof loader>();

    return (
        <Container>
            <div className="py-24">
                {!apiUrl && <div>No API URL</div>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-foreground">
                    <Link to="/debate" className="flex h-full">
                        <div className="border rounded-xl p-5 hover:bg-card/75 transition">
                            <div className="flex items-center mb-2 gap-2 justify-between">
                                <h2 className="font-semibold">Debate</h2>
                                <span className="text-sm text-foreground/50">
                                    Every 3s
                                </span>
                            </div>
                            <p className="text-sm text-foreground/75">
                                Fast and precise, for debates or conversations
                                where you expect claims to come out in a timely
                                manner.
                            </p>
                        </div>
                    </Link>
                    <Link to="/discussion" className="flex h-full">
                        <div className="border rounded-xl p-5 hover:bg-muted/50 transition">
                            <div className="flex items-center gap-2 mb-2 justify-between">
                                <h2 className="font-semibold">Discussion</h2>
                                <span className="text-sm text-foreground/50">
                                    After silence
                                </span>
                            </div>
                            <p className="text-sm text-foreground/75">
                                Slow and elastic, for discussions where claims
                                may be hidden across many sentences, or are
                                vague.
                            </p>
                        </div>
                    </Link>
                    <Link to="/data-driven" className="flex h-full">
                        <div className="border rounded-xl p-5 hover:bg-muted/50 transition">
                            <div className="flex items-center gap-2 mb-2 justify-between">
                                <h2 className="font-semibold">Explainers</h2>
                                <span className="text-sm text-foreground/50">
                                    Every 10s
                                </span>
                            </div>
                            <p className="text-sm text-foreground/75">
                                Data-driven, for explainers and reporting.
                                Expect claims to be frequent but not occuring in
                                close proximity.
                            </p>
                        </div>
                    </Link>
                    <Link to="/manual" className="flex h-full">
                        <div className="border rounded-xl p-5 hover:bg-muted/50 transition">
                            <div className="flex items-center gap-2 mb-2 justify-between">
                                <h2 className="font-semibold">Manual</h2>
                                <span className="text-sm text-foreground/50">
                                    On demand
                                </span>
                            </div>
                            <p className="text-sm text-foreground/75">
                                Manual parsing/generation. Click Parse Now to
                                request structured output.
                            </p>
                        </div>
                    </Link>
                </div>
            </div>
        </Container>
    );
}
