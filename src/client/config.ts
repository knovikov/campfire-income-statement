// Build-time UI exposure only. The API is always available; this is not authorization.
export const ENABLE_ACCOUNT_DRILLDOWN =
  import.meta.env.VITE_ENABLE_ACCOUNT_DRILLDOWN === "true";
