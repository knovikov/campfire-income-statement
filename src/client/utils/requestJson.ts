/** Read an API response and give both screens the same HTTP/JSON error handling. */
export async function requestJson<T>(
  url: string,
  signal?: AbortSignal,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { ...options, signal });
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error("Unable to read the server response. Please try again.");
  }

  const error =
    typeof result === "object" && result !== null && "error" in result
      ? result.error
      : undefined;
  if (!response.ok || typeof error === "string") {
    throw new Error(
      typeof error === "string"
        ? error
        : `Unable to load data (HTTP ${response.status}).`,
    );
  }
  // The server owns the response contract; this helper only checks transport errors.
  return result as T;
}
