import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "~/components/ui/dialog";
import { Info } from "lucide-react";

interface InfoDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function InfoDialog({ open, onOpenChange }: InfoDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[95vw] sm:max-w-[540px] bg-background/75 backdrop-blur-sm ">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 mb-6 text-primary">
                        <Info className="w-5 h-5" />
                        Voice Input Tips & Tricks
                    </DialogTitle>
                    <DialogDescription className="space-y-4">
                        <div className="space-y-2 text-left">
                            <h3 className="font-medium text-foreground">
                                Improving Accuracy
                            </h3>
                            <ul className="list-disc pl-4 space-y-1 text-sm text-foreground/50">
                                <li>Speak clearly and at a moderate pace</li>
                                <li>
                                    For unusual words or names, spell them out
                                </li>
                                <li>
                                    You can add a space between words by simply
                                    saying the word (e.g., "John Clark is spelt
                                    J O H N space C L A R K")
                                </li>
                                <li>Use natural pauses between words</li>
                                <li>
                                    Refer to form fields explicitly and then
                                    state their value (e.g., "the customer's
                                    name is John Smith")
                                </li>
                            </ul>
                        </div>
                        <div className="space-y-2 text-left">
                            <h3 className="font-medium text-foreground">
                                What you can do
                            </h3>
                            <ul className="list-disc pl-4 space-y-1 text-sm text-foreground/50">
                                <li>
                                    Use relative dates - memo knows what the
                                    current date and time is (e.g., "book it for
                                    two weeks from now")
                                </li>
                                <li>
                                    Correct yourself if you make a mistake
                                    without pausing the audio
                                </li>
                            </ul>
                        </div>
                        <div className="space-y-2 text-left">
                            <h3 className="font-medium text-foreground">
                                Troubleshooting
                            </h3>
                            <ul className="list-disc pl-4 space-y-1 text-sm text-foreground/50">
                                <li>
                                    Ensure your microphone is properly connected
                                    and has permissions enabled
                                </li>
                                <li>
                                    Check your internet connection for optimal
                                    performance
                                </li>
                                <li>Try speaking closer to your microphone</li>

                                <li>
                                    Reduce background noise for better results
                                </li>
                                <li>
                                    Check that you&apos;re connected in the
                                    floating menu before trying to record.
                                </li>
                            </ul>
                        </div>
                    </DialogDescription>
                </DialogHeader>
            </DialogContent>
        </Dialog>
    );
}
