import { Theme, useTheme } from "remix-themes";
import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useEffect, useState } from "react";
import clsx from "clsx";

const ModeButtons = [
    { mode: "light", icon: <Sun className="h-4 w-4" /> },
    { mode: "dark", icon: <Moon className="h-4 w-4" /> },
    { mode: "system", icon: <Monitor className="h-4 w-4" /> },
] as const;

type Props = {
    direction?: "vertical" | "horizontal";
};

export function ModeToggleDashboard() {
    const [theme, setTheme] = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return null;
    }

    function handleSetTheme(mode: "light" | "dark" | "system") {
        switch (mode) {
            case "light":
                setTheme(Theme.LIGHT);
                break;
            case "dark":
                setTheme(Theme.DARK);
                break;
            case "system":
                // if theme is set to null, system theme will be used
                setTheme(null);
                break;
            default:
                setTheme(null);
        }
    }

    const modeMapping = (mode: "light" | "dark" | "system") => {
        return mode === "light" || mode === "dark" ? mode : null;
    };

    return (
        <div className={`flex items-center justify-between`}>
            <span className="text-sm text-foreground">Theme</span>
            <div>
                {ModeButtons.map((item) => (
                    <Button
                        key={item.mode}
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSetTheme(item.mode)}
                        className={`h-8 w-8 transition-all duration-300 rounded-full ${
                            theme === modeMapping(item.mode)
                                ? "bg-primary/75 text-foreground hover:bg-primary/25 hover:text-foreground"
                                : "text-foreground/50 hover:text-foreground hover:bg-primary/50"
                        }`}
                    >
                        {item.icon}
                        <span className="sr-only">Toggle {item.mode} mode</span>
                    </Button>
                ))}
            </div>
        </div>
    );
}

export function ModeToggle({ direction = "horizontal" }: Props) {
    const [theme, setTheme] = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return null;
    }

    function handleSetTheme(mode: "light" | "dark" | "system") {
        switch (mode) {
            case "light":
                setTheme(Theme.LIGHT);
                break;
            case "dark":
                setTheme(Theme.DARK);
                break;
            case "system":
                // if theme is set to null, system theme will be used
                setTheme(null);
                break;
            default:
                setTheme(null);
        }
    }

    const modeMapping = (mode: "light" | "dark" | "system") => {
        return mode === "light" || mode === "dark" ? mode : null;
    };

    return (
        <div
            className={`flex max-w-fit items-center gap-x-[1px] p-0.5 bg-background border rounded-full ${
                direction === "vertical" ? "flex-col gap-y-0.5" : "flex-row"
            }`}
        >
            {ModeButtons.map((item) => (
                <Button
                    key={item.mode}
                    variant="ghost"
                    size="icon"
                    onClick={() => handleSetTheme(item.mode)}
                    className={clsx(
                        "h-6 w-6 transition-all duration-300 rounded-full bg-background text-primary hover:bg-background/70 hover:text-primary hover:scale-105 cursor-pointer",
                        theme === modeMapping(item.mode) &&
                            "bg-primary text-primary-foreground hover:bg-primary/70 hover:text-primary-foreground hover:scale-105 cursor-pointer"
                    )}
                >
                    {item.icon}
                    <span className="sr-only">Toggle {item.mode} mode</span>
                </Button>
            ))}
        </div>
    );
}
