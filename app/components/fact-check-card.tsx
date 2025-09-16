import { Eye, EyeClosed } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useState } from "react";

type Verdict = "supported" | "disputed" | "uncertain";
type State = "analyzing" | "searching" | "retrying" | "judging" | "final";

export default function FactCheckCard({
    id,
    state,
    claim,
    subject,
    seeds,
    context,
    verdict,
    confidence,
    rationale,
    citations,
    nowISO,
    claimEngineData,
}: {
    id: string;
    state: State;
    claim?: string;
    subject?: string;
    seeds?: string[];
    context?: string;
    verdict?: Verdict;
    confidence?: number;
    rationale?: string;
    citations?: {
        url: string;
        title: string;
        published_at?: string | null;
        quote: string;
    }[];
    nowISO?: string;
    claimEngineData?: any; // NormalizedClaim
}) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const statusLabel =
        state === "analyzing"
            ? "Analyzing claim…"
            : state === "searching"
              ? "Searching sources…"
              : state === "retrying"
                ? "Retrying with broader sources…"
                : state === "judging"
                  ? "Verifying…"
                  : verdict
                    ? verdict.charAt(0).toUpperCase() + verdict.slice(1)
                    : "Final";

    const verdictBadgeClass = (() => {
        if (state !== "final") return "bg-muted text-foreground";
        if (verdict === "supported") return "bg-green-600 text-white";
        if (verdict === "disputed") return "bg-red-600 text-white";
        if (verdict === "uncertain") return "bg-yellow-500 text-black";
        return "bg-muted text-foreground";
    })();

    return (
        <Card className="rounded-xl border w-full">
            <CardHeader className="flex items-center justify-between mb-2">
                <CardTitle className="text-md font-medium flex justify-between w-full items-center gap-2">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold">Fact check</span>
                        <span
                            className={`text-xs px-2 py-0.5 rounded-full ${verdictBadgeClass}`}
                        >
                            {statusLabel}
                        </span>
                    </div>
                    <button
                        type="button"
                        aria-label={
                            isCollapsed ? "Show details" : "Hide details"
                        }
                        className="text-xs flex items-center gap-2 px-2 py-0.5 rounded border hover:bg-muted"
                        onClick={() => setIsCollapsed((v) => !v)}
                    >
                        <span>{isCollapsed ? "Show" : "Hide"}</span>
                        {isCollapsed ? (
                            <Eye className="size-4" />
                        ) : (
                            <EyeClosed className="size-4" />
                        )}
                    </button>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {isCollapsed ? (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                            {claim && (
                                <p className="text-sm">
                                    <span className="opacity-70 mr-1">
                                        Claim:
                                    </span>
                                    <span>“{claim}”</span>
                                </p>
                            )}
                        </div>
                        {subject && (
                            <p className="text-xs opacity-80">
                                <span className="mr-1">Subject:</span>
                                <span className="font-medium">{subject}</span>
                            </p>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-2 mb-4 border-b">
                            {claim && (
                                <p className="text-sm mb-2">
                                    <span className="opacity-70 mr-1">
                                        Claim:
                                    </span>
                                    <span>“{claim}”</span>
                                </p>
                            )}
                        </div>
                        <div className="mb-6">
                            {subject && (
                                <p className="text-xs mb-2 opacity-80">
                                    <span className="mr-1">Subject:</span>
                                    <span className="font-medium">
                                        {subject}
                                    </span>
                                </p>
                            )}
                            {context && (
                                <p className="text-xs mb-2 opacity-80">
                                    <span className="mr-1">Context:</span>
                                    <span className="font-medium">
                                        {context}
                                    </span>
                                </p>
                            )}
                            {claimEngineData && (
                                <div className="mb-3 space-y-1">
                                    <p className="text-xs opacity-60">
                                        <span className="mr-1">🔧 Engine:</span>
                                        <span className="font-mono text-[10px]">
                                            {claimEngineData.status} |
                                            {claimEngineData.relationLemma
                                                ? ` ${claimEngineData.relationLemma}`
                                                : ""}{" "}
                                            | score:{" "}
                                            {(
                                                claimEngineData.confidence * 100
                                            ).toFixed(0)}
                                            %
                                        </span>
                                    </p>
                                    {claimEngineData.claimKey && (
                                        <p className="text-xs opacity-50">
                                            <span className="mr-1">Key:</span>
                                            <span className="font-mono text-[9px]">
                                                {claimEngineData.claimKey}
                                            </span>
                                        </p>
                                    )}
                                </div>
                            )}
                            {Array.isArray(seeds) && seeds.length > 0 && (
                                <div className="mb-3 flex flex-wrap gap-1">
                                    {seeds.slice(0, 3).map((s, i) => (
                                        <span
                                            key={i}
                                            className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground/80 border"
                                        >
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        {state !== "final" ? (
                            <NonFinalSkeleton state={state} />
                        ) : (
                            <FinalContent
                                verdict={verdict}
                                confidence={confidence}
                                rationale={rationale}
                                citations={citations}
                                nowISO={nowISO}
                            />
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}

function NonFinalSkeleton({ state }: { state: State }) {
    return (
        <div className="space-y-2">
            <div className="h-3 bg-background/70 rounded animate-pulse h-12" />
            <div className="h-3 bg-background/50 rounded w-5/6 animate-pulse h-24" />
            <div className="h-3 bg-background/50 rounded w-3/6 animate-pulse" />
        </div>
    );
}

function FinalContent({
    verdict,
    confidence,
    rationale,
    citations,
    nowISO,
}: {
    verdict?: Verdict;
    confidence?: number;
    rationale?: string;
    citations?: {
        url: string;
        title: string;
        published_at?: string | null;
        quote: string;
    }[];
    nowISO?: string;
}) {
    return (
        <div className="space-y-3">
            {rationale && (
                <p className="text-sm leading-relaxed">{rationale}</p>
            )}
            {citations && citations.length > 0 && (
                <ul className="space-y-2">
                    {citations.slice(0, 3).map((c, i) => (
                        <li key={i} className="text-sm">
                            <blockquote className="text-xs italic opacity-80">
                                “{c.quote}”
                            </blockquote>
                            <a
                                href={c.url}
                                target="_blank"
                                rel="noreferrer"
                                className="underline"
                            >
                                {c.title}
                            </a>
                            {c.published_at ? (
                                <span className="text-xs opacity-70 ml-1">
                                    ({c.published_at})
                                </span>
                            ) : (
                                <span>N/A</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            <div className="text-xs text-muted-foreground flex items-center gap-3">
                {typeof confidence === "number" && (
                    <span>Confidence: {(confidence * 100).toFixed(0)}%</span>
                )}
                {nowISO && (
                    <span>Now: {new Date(nowISO).toLocaleString()}</span>
                )}
            </div>
        </div>
    );
}
