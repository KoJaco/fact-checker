import { useSearchParams, Link, useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import {
    AlertTriangle,
    Shield,
    ArrowLeft,
    Home,
    Users,
    Settings,
} from "lucide-react";

export default function ForbiddenPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const from = searchParams.get("from") || "/dashboard";
    const entity = searchParams.get("entity") || "resource";
    const action = searchParams.get("action") || "access";

    const getEntityDisplayName = (entity: string) => {
        switch (entity) {
            case "account":
                return "Account Settings";
            case "users":
                return "User Management";
            case "roles":
                return "Role Management";
            case "permissions":
                return "Permission Management";
            case "billing":
                return "Billing & Usage";
            case "apps":
                return "Applications";
            case "sessions":
                return "Sessions";
            case "schemas":
                return "Schemas";
            case "system":
                return "System Access";
            default:
                return entity.charAt(0).toUpperCase() + entity.slice(1);
        }
    };

    const getActionDisplayName = (action: string) => {
        switch (action) {
            case "create":
                return "create";
            case "retrieve":
                return "view";
            case "update":
                return "modify";
            case "delete":
                return "delete";
            case "requires_owner_access":
                return "requires owner-level access";
            case "requires_admin_access":
                return "requires admin-level access";
            case "requires_user_access":
                return "requires user-level access";
            default:
                return action;
        }
    };

    const getSafeNavigationOptions = () => {
        const options = [
            { name: "Dashboard", href: "/dashboard", icon: Home },
            { name: "Your Apps", href: "/dashboard/apps", icon: Settings },
        ];

        // Add account-related options if the user has basic access
        if (entity !== "account" || action !== "retrieve") {
            options.push({
                name: "Account Overview",
                href: "/dashboard/account",
                icon: Users,
            });
        }

        return options;
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <Card className="border-destructive/50">
                    <CardHeader className="text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                            <Shield className="h-8 w-8 text-destructive" />
                        </div>
                        <CardTitle className="text-2xl font-bold text-destructive">
                            Access Denied
                        </CardTitle>
                        <CardDescription className="text-base">
                            {entity === "system"
                                ? `This page ${getActionDisplayName(action)}.`
                                : `You don't have permission to ${getActionDisplayName(action)} ${getEntityDisplayName(entity)}.`}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="bg-muted/50 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-muted-foreground mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-sm font-medium">
                                        What happened?
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {entity === "system"
                                            ? "You tried to access a page that requires higher privileges than your current role."
                                            : "You tried to access a page or perform an action that requires higher privileges than your current role."}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <p className="text-sm font-medium">
                                Where would you like to go?
                            </p>
                            <div className="space-y-2">
                                {getSafeNavigationOptions().map((option) => {
                                    const Icon = option.icon;
                                    return (
                                        <Button
                                            key={option.href}
                                            asChild
                                            variant="outline"
                                            className="w-full justify-start"
                                        >
                                            <Link to={option.href}>
                                                <Icon className="h-4 w-4 mr-2" />
                                                {option.name}
                                            </Link>
                                        </Button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="pt-4 border-t">
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => navigate(-1)}
                            >
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Go Back
                            </Button>
                        </div>

                        <div className="text-center">
                            <p className="text-xs text-muted-foreground">
                                If you believe this is an error, please contact
                                your account administrator.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
