import { useEffect, useState } from "react";

export function getCommonPrefix(str1: string, str2: string) {
    let i = 0;
    const len = Math.min(str1.length, str2.length);
    while (i < len && str1[i] === str2[i]) {
        i++;
    }
    return str1.slice(0, i);
}

// Custom hook for incremental interim transcript update
export function useIncrementalInterimTranscript(
    newTranscript: string,
    stability: number,
    threshold = 0.9
) {
    // The cumulative transcript built so far
    const [cumulativeTranscript, setCumulativeTranscript] = useState("");

    useEffect(() => {
        // Only update if stability is high enough.
        if (stability >= threshold && newTranscript) {
            // Get the common prefix between the cumulative transcript and the new interim result.
            const common = getCommonPrefix(cumulativeTranscript, newTranscript);

            if (newTranscript.length > common.length) {
                setCumulativeTranscript(newTranscript);
            }
        }
    }, [newTranscript, stability, cumulativeTranscript, threshold]);

    return cumulativeTranscript;
}
