import type {
    ServerMsg,
    TranscriptMsg,
    StructuredOutputMsg,
} from "../types/transcriptTypes";
import { useAppStore } from "../state/store";

export function handleServerMsg(msg: ServerMsg) {
    const store = useAppStore.getState();
    if (msg.type === "transcript") {
        store.applyTranscript(msg as TranscriptMsg);
    } else if (msg.type === "structured_output") {
        store.applyStructuredOutput(msg as StructuredOutputMsg);
    }
}

export function connect(url: string) {
    const es = new EventSource(url);
    es.onmessage = (e) => {
        try {
            const msg = JSON.parse(e.data) as ServerMsg;
            handleServerMsg(msg);
        } catch (err) {}
    };
    return () => es.close();
}
