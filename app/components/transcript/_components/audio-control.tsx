import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "~/components/ui/popover";
import { Mic, MicOff, Info, Settings } from "lucide-react";
import { motion } from "framer-motion";
import type { ConnStatus } from "~/lib/sdk";
import { InfoDialog } from "~/components/ui/info-dialog";

interface AudioControlProps {
    className?: string;
    isRecording: boolean;
    onRecordingToggle: () => void;
    connectionStatus: ConnStatus;
    onConnect: () => void;
    onDisconnect: () => void;
    /** Optional manual parse action for manual schema mode */
    onParseNow?: () => void;
}

export const AudioControl = ({
    className,
    isRecording,
    onRecordingToggle,
    connectionStatus,
    onConnect,

    onParseNow,
}: AudioControlProps) => {
    const [autoStartOnConnect, setAutoStartOnConnect] = useState(false);

    // Derived title for mic button based on connection and recording state
    const micButtonTitle =
        connectionStatus === "connected"
            ? isRecording
                ? "Stop Recording"
                : "Start Recording"
            : connectionStatus === "connecting"
              ? autoStartOnConnect
                  ? "Connecting… then starting"
                  : "Connecting…"
              : "Connect & Start Recording";

    // When we requested connect via mic, auto-start recording upon connect
    useEffect(() => {
        if (autoStartOnConnect && connectionStatus === "connected") {
            setAutoStartOnConnect(false);
            onRecordingToggle();
        }
        if (
            autoStartOnConnect &&
            (connectionStatus === "error" ||
                connectionStatus === "disconnected")
        ) {
            // keep flag; a subsequent successful connect will trigger start
        }
    }, [autoStartOnConnect, connectionStatus, onRecordingToggle]);

    const rootRef = useRef<HTMLDivElement | null>(null);

    return (
        <div ref={rootRef} className={cn("flex items-center p-0", className)}>
            {/* Recording Button */}
            <button
                onClick={() => {
                    if (connectionStatus === "connected") {
                        onRecordingToggle();
                        return;
                    }
                    if (connectionStatus === "connecting") {
                        // already connecting: ensure we start once connected
                        setAutoStartOnConnect(true);
                        return;
                    }
                    // disconnected/error → connect then auto-start
                    setAutoStartOnConnect(true);
                    onConnect();
                }}
                className={cn(
                    "relative cursor-pointer flex items-center gap-2 hover:bg-primary hover:text-primary-foreground text-foreground rounded-full transition-all duration-300 px-4 py-2",
                    isRecording &&
                        "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                )}
                title={micButtonTitle}
            >
                {/* Connection indicator dot overlay */}
                <motion.div
                    className={cn(
                        "absolute -top-1 -right-1 w-[10px] h-[10px] rounded-full border border-background",
                        connectionStatus === "connected"
                            ? "bg-green-500"
                            : connectionStatus === "connecting"
                              ? "bg-yellow-500"
                              : connectionStatus === "error"
                                ? "bg-red-500"
                                : "bg-yellow-500"
                    )}
                    animate={{
                        scale:
                            connectionStatus === "connected" ? [1, 1.2, 1] : 1,
                    }}
                    transition={{
                        repeat: connectionStatus === "connected" ? Infinity : 0,
                        duration: 2,
                    }}
                />

                <motion.div
                    animate={{
                        scale: isRecording ? [1, 1.1, 1] : 1,
                    }}
                    transition={{
                        repeat: isRecording ? Infinity : 0,
                        duration: 1.5,
                    }}
                >
                    {isRecording ? (
                        <div className="flex items-center gap-2">
                            <span className="text-md">Stop</span>
                            <MicOff className="w-4 h-4" />
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-md">Start</span>
                            <Mic className="w-4 h-4" />
                        </div>
                    )}
                </motion.div>
            </button>
            {/* Optional: Manual parse trigger (visible only when provided) */}
            {typeof onParseNow === "function" && (
                <>
                    <span className="px-2">|</span>
                    <Button
                        variant="ghost"
                        className="text-md rounded-full"
                        onClick={() => onParseNow?.()}
                        title="Parse current transcript now"
                    >
                        Check Fact!
                    </Button>
                </>
            )}

            {/* Connection Status icon removed; indicator moved to mic button */}
        </div>
    );
};
