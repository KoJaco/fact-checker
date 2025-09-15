import { AudioControl } from "../_components/audio-control";

const footer = ({
    isRecording,
    handleRec,
    connectionStatus,
    connect,
    disconnect,

    onParseNow,
}: {
    isRecording: boolean;
    handleRec: () => void;
    connectionStatus: "disconnected" | "connecting" | "connected" | "error";
    connect: () => void;
    disconnect: () => void;
    wordCount?: number;
    recordingDuration?: number;
    canClear?: boolean;
    onClear?: () => void;
    onParseNow?: () => void;
}) => {
    return (
        <div className="fixed bottom-10 left-0 right-0 px-4">
            <div className="mx-auto w-full flex items-center justify-center gap-3">
                <div className="flex bg-background gap-x-2 border shadow-xl rounded-full px-4 py-1">
                    <AudioControl
                        isRecording={isRecording}
                        onRecordingToggle={handleRec}
                        connectionStatus={connectionStatus}
                        onConnect={connect}
                        onDisconnect={disconnect}
                        onParseNow={onParseNow}
                    />
                </div>
            </div>
        </div>
    );
};

export default footer;
