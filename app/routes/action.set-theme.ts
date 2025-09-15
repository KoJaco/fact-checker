import { createThemeAction } from "remix-themes";

import { themeSessionResolver } from "~/resources/sessions.server";

export const action = createThemeAction(themeSessionResolver);
