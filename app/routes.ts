import {
    type RouteConfig,
    route,
    index,
    layout,
} from "@react-router/dev/routes";

export default [
    // Marketing layout with all marketing routes
    layout("routes/_mkt.tsx", [
        index("routes/_mkt._index.tsx"),
        route("discussion", "routes/_mkt.discussion.tsx"),
        route("debate", "routes/_mkt.debate.tsx"),
        route("data-driven", "routes/_mkt.data-driven.tsx"),
        route("manual", "routes/_mkt.manual.tsx"),
    ]),

    // Action routes (no layout)
    route("action/set-theme", "routes/action.set-theme.ts"),

    // Schma specific
    route("action/schma-token", "routes/action.schma-token.tsx"),
    route("action/schma-batch", "routes/action.schma-batch.tsx"),
    route("action/schma-batch-status", "routes/action.schma-batch-status.tsx"),
    route("action/schma-batch-jobs", "routes/action.schma-batch-jobs.tsx"),

    // API
    route("action/factcheck", "routes/action.factcheck.ts"),

    // Root route redirects to marketing home
    index("routes/index.tsx"),

    // 403 error route
    route("403", "routes/403.tsx"),
] satisfies RouteConfig;
