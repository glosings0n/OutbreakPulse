/**
 * Turns raw Firebase AI Logic error messages into one short sentence a health worker can act on.
 * The full message stays available to testers (tooltip, System page), never as the only signal.
 */
export function describeAiError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("429") || m.includes("resource_exhausted") || m.includes("quota") || m.includes("credits")) {
    return "The cloud model is over its usage quota.";
  }
  if (m.includes("app check") || m.includes("appcheck") || m.includes("app-check")) {
    return "The app could not prove it is genuine (App Check).";
  }
  if (m.includes("403") || m.includes("permission")) {
    return "The cloud model refused the request.";
  }
  if (m.includes("network") || m.includes("failed to fetch") || m.includes("offline")) {
    return "The cloud model could not be reached.";
  }
  if (m.includes("json") || m.includes("parse") || m.includes("schema")) {
    return "The model answer could not be read.";
  }
  return "AI analysis failed.";
}
