import { useEffect, useMemo, useRef, useState } from "react";
import { Timeline } from "./_components/timeline";
import { useSchma } from "~/lib/sdk/useSchma";
import type { ClientConfig } from "~/lib/sdk";
import Footer from "./shared/footer";
import { structuredOutputConfigManual } from "./schemas/schema-manual";

type Props = {
    apiUrl: string;
};

export const TranscriptManual = ({ apiUrl }: Props) => {
    const clientConfig: ClientConfig = useMemo(
        () => ({
            apiUrl,
            isTest: false,
            getToken: async () => {
                const r = await fetch("/action/schma-token", {
                    method: "POST",
                });
                if (!r.ok) throw new Error("token failed");
                const { token } = await r.json();
                return token;
            },
            language: "en-US",
            stt: {
                interimStabilityThreshold: 0.8,
                sampleHertz: 16000,
                diarization: { enableSpeakerDiarization: true },
            },
            structuredOutputConfig: structuredOutputConfigManual,
            redactionConfig: { disablePhi: true },
        }),
        [apiUrl]
    );

    const {
        transcriptFinal,
        transcriptFinalPieces,
        transcriptInterim,
        structuredOutput,
        connectionStatus,
        connect,
        disconnect,
        startRecording,
        stopRecording,
        clearSession,
        parseContentManually,
    } = useSchma({ config: clientConfig });

    const [isRecording, setIsRecording] = useState(false);
    const [timelineResetKey, setTimelineResetKey] = useState(0);
    const [recordingStartTime, setRecordingStartTime] = useState<Date | null>(
        null
    );
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [shouldLogNextStructured, setShouldLogNextStructured] =
        useState(false);
    const timerRef = useRef<number | null>(null);
    const handleRec = () => {
        if (!isRecording) startRecording();
        else stopRecording();
        setIsRecording(!isRecording);
    };

    useEffect(() => {
        if (isRecording) {
            const start = recordingStartTime ?? new Date();
            if (!recordingStartTime) setRecordingStartTime(start);
            timerRef.current = window.setInterval(() => {
                setRecordingDuration(
                    Math.max(
                        0,
                        Math.floor((Date.now() - start.getTime()) / 1000)
                    )
                );
            }, 1000);
            return () => {
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
            };
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
    }, [isRecording, recordingStartTime]);

    const totalFieldsUpdated = useMemo(() => {
        const obj = structuredOutput?.final ?? structuredOutput?.delta ?? {};
        return Object.keys(obj).length;
    }, [structuredOutput]);

    useEffect(() => {
        if (shouldLogNextStructured && structuredOutput) {
            // console.log("[manual] structuredOutput", structuredOutput);
            setShouldLogNextStructured(false);
        }
    }, [structuredOutput, shouldLogNextStructured]);

    return (
        <>
            <div className="mb-20">
                <Timeline
                    key={timelineResetKey}
                    transcriptFinal={transcriptFinal}
                    transcriptInterim={{
                        text: transcriptInterim.text,
                        confidence: transcriptInterim.confidence ?? 0.5,
                    }}
                    transcriptFinalPieces={transcriptFinalPieces}
                    isRecording={isRecording}
                    wordCount={
                        (transcriptFinal.text || "")
                            .split(/\s+/)
                            .filter(Boolean).length
                    }
                    recordingDuration={recordingDuration}
                    totalFieldsUpdated={totalFieldsUpdated}
                    structuredOutput={structuredOutput ?? null}
                    recordingStartTime={recordingStartTime}
                    canClear={Boolean(
                        transcriptFinal.text ||
                            (transcriptFinalPieces?.length ?? 0) > 0
                    )}
                    onClear={() => {
                        clearSession();
                        setRecordingStartTime(null);
                        setRecordingDuration(0);
                        setTimelineResetKey((k) => k + 1);
                    }}
                />
            </div>
            <Footer
                isRecording={isRecording}
                handleRec={handleRec}
                connectionStatus={connectionStatus}
                connect={connect}
                disconnect={disconnect}
                wordCount={
                    (transcriptFinal.text || "").split(/\s+/).filter(Boolean)
                        .length
                }
                recordingDuration={recordingDuration}
                canClear={Boolean(
                    transcriptFinal.text ||
                        (transcriptFinalPieces?.length ?? 0) > 0
                )}
                onClear={() => {
                    clearSession();
                    setRecordingStartTime(null);
                    setRecordingDuration(0);
                    setTimelineResetKey((k) => k + 1);
                }}
                onParseNow={() => {
                    setShouldLogNextStructured(true);
                    parseContentManually?.();
                }}
            />
        </>
    );
};

export default TranscriptManual;
