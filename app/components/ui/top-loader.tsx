import { useEffect, useState } from "react";
import { useNavigation } from "react-router";
import { cn } from "~/lib/utils";

export function TopLoader() {
    const navigation = useNavigation();
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        if (
            navigation.state === "loading" ||
            navigation.state === "submitting"
        ) {
            setIsLoading(true);
            setProgress(0);

            // Simulate progress
            const interval = setInterval(() => {
                setProgress((prev) => {
                    if (prev >= 90) {
                        clearInterval(interval);
                        return 90;
                    }
                    return prev + 10;
                });
            }, 100);

            return () => clearInterval(interval);
        } else {
            // Complete the progress bar
            setProgress(100);
            const timeout = setTimeout(() => {
                setIsLoading(false);
                setProgress(0);
            }, 200);

            return () => clearTimeout(timeout);
        }
    }, [navigation.state]);

    if (!isLoading && progress === 0) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-50">
            <div
                className={cn(
                    "h-1 bg-primary transition-all duration-300 ease-out",
                    isLoading ? "w-full" : "w-0"
                )}
                style={{
                    width: `${progress}%`,
                    transition: isLoading
                        ? "width 0.3s ease-out"
                        : "width 0.2s ease-out",
                }}
            />
        </div>
    );
}
