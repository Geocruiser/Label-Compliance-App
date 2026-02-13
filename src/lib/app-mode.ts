const APP_MODE = (process.env.NEXT_PUBLIC_APP_MODE ?? "demo").toLowerCase();

export const isDemoMode = APP_MODE !== "api";

