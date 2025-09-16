import { useEffect, useMemo, useRef, useState } from "react";
import { Timeline } from "./_components/timeline";
import { useSchma } from "~/lib/sdk/useSchma";
import type { ClientConfig, GenaiSchema } from "~/lib/sdk";
import { AudioControl } from "./_components/audio-control";
import { structuredOutputConfigLoose } from "./schemas/schema-loose";
import { structuredOutputConfigTight } from "./schemas/schema-tight";
import { structuredOutputConfigBurstAfterSilence } from "./schemas/schema-flexible";
import Footer from "./shared/footer";

type Props = {
    apiUrl: string;
};

export type StructuredItem = {
    key: string;
    title: string;
    description: string;
    schema: GenaiSchema;
};

export type StructuredGroup = {
    parsingGuide: string;
    items: StructuredItem[];
};

export const TranscriptTight = ({ apiUrl }: Props) => {
    // Stable config (connection primitives + initial structured config)
    const clientConfig: ClientConfig = useMemo(
        () => ({
            apiUrl: apiUrl,
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
            // structuredOutputConfig: structuredOutputConfigLoose,
            structuredOutputConfig: structuredOutputConfigTight,
            // structuredOutputConfig: structuredOutputConfigBurstAfterSilence,
            redactionConfig: {
                disablePhi: true,
            },
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
    } = useSchma({ config: clientConfig });

    const [isRecording, setIsRecording] = useState(false);
    const [timelineResetKey, setTimelineResetKey] = useState(0);
    const [recordingStartTime, setRecordingStartTime] = useState<Date | null>(
        null
    );
    const [recordingDuration, setRecordingDuration] = useState(0);
    const timerRef = useRef<number | null>(null);
    const handleRec = () => {
        if (!isRecording) startRecording();
        else stopRecording();
        setIsRecording(!isRecording);
    };

    // console.log("structuredOutput", structuredOutput);

    // Manage timer for transcript duration and event timestamps
    useEffect(() => {
        if (isRecording) {
            const start = recordingStartTime ?? new Date();
            if (!recordingStartTime) setRecordingStartTime(start);
            // tick every second
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
            // Keep the clock (do not reset) until clear is called
        }
    }, [isRecording, recordingStartTime]);

    const totalFieldsUpdated = useMemo(() => {
        const obj = structuredOutput?.final ?? structuredOutput?.delta ?? {};
        return Object.keys(obj).length;
    }, [structuredOutput]);

    return (
        <>
            <div className="mb-20">
                <Timeline
                    key={timelineResetKey}
                    transcriptFinal={transcriptFinal}
                    transcriptInterim={{
                        text: transcriptInterim.text,
                        confidence: transcriptInterim.confidence ?? 0.5,
                        // words: transcriptInterim.words,
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
                wordCount={undefined}
                recordingDuration={undefined}
                canClear={undefined}
                onClear={undefined}
            />
        </>
    );
};
