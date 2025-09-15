export interface FunctionCallReceived {
    name: string;
    args: { [name: string]: any };
}

export type Word = {
    text: string;
    start: number;
    end: number;
    confidence?: number;
    punctuatedWord?: string;
    speaker?: string;
    speakerConfidence?: number;
};

export type PhraseDisplay = {
    start: number;
    end: number;
    confidence?: number;
    speaker?: string;
    textNorm?: string;
    textMasked?: string;
};

export type Turn = {
    id?: string;
    speaker: string;
    start: number;
    end: number;
    words?: Word[];
    confidence?: number;
    final?: boolean;
};

export interface FunctionDraftDataReceived {
    draftId: string;
    name: string;
    args: { [key: string]: any };
    similarityScore: number;
    status:
        | "pending_confirmation"
        | "confirmed_by_llm"
        | "awaiting_potential_update";
    timestamp: string;
}

export interface TranscriptMsg {
    type: "transcript";
    text: string;
    final: boolean;
    confidence?: number;
    stability?: number;
    words?: Word[];
    turns?: Turn[]; // diarisation
    channel?: number;
    phrasesDisplay?: PhraseDisplay[];
}

export interface StructuredOutputMsg {
    type: "structured_output";
    rev: number;
    delta: { [key: string]: any };
    final: { [key: string]: any };
}

export interface DraftMsg {
    type: "function_draft_extracted";
    data: FunctionDraftDataReceived;
}
export interface AckMsg {
    type: "ack";
    wsSessionId: string;
}
export interface SessionEndMsg {
    type: "session_end";
}
export interface ConfigUpdateAckMsg {
    type: "config_update_ack";
    success: boolean;
    message?: string;
}

export type ServerMsg =
    | TranscriptMsg
    | { type: "functions"; functions: FunctionCallReceived[] }
    | DraftMsg
    | AckMsg
    | SessionEndMsg
    | ConfigUpdateAckMsg
    | StructuredOutputMsg
    | { type: "error"; err: string };
