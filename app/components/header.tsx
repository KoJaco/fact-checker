import { Menu } from "lucide-react";
import { Button } from "~/components/ui/button";
import { ModeToggle } from "~/components/mode-toggle";
import { Container } from "./ui/container";

export default function Header() {
    return (
        <header className="w-full border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
            <Container>
                <div className="h-[70px] flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                        <Menu className="h-4 w-4" />
                        <span className="text-sm font-semibold">
                            Fact Checker
                        </span>
                    </div>
                    <ModeToggle />
                </div>
            </Container>
        </header>
    );
}
