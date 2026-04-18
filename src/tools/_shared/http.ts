/**
 * Shared HTTP client wrapper around native fetch.
 */

export interface HttpFetchOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  redactKeys?: string[];
}

export interface HttpSuccess {
  ok: true;
  status: number;
  data: unknown;
  headers: Headers;
}

export interface HttpError {
  ok: false;
  error: string;
  status?: number;
}

export type HttpResult = HttpSuccess | HttpError;

const DEFAULT_TIMEOUT_MS = 30000;

const ALWAYS_REDACTED = new Set(["authorization", "x-api-key", "api-key"]);

/**
 * Returns a copy of the headers object with sensitive values replaced by [REDACTED].
 */
export function redactHeaders(
  headers: Record<string, string>,
  redactKeys: string[] = [],
): Record<string, string> {
  const sensitiveKeys = new Set([...ALWAYS_REDACTED, ...redactKeys.map((k) => k.toLowerCase())]);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = sensitiveKeys.has(key.toLowerCase()) ? "[REDACTED]" : value;
  }
  return result;
}

/**
 * Redacts query parameter values matching sensitive keys.
 */
export function redactUrl(url: string, redactKeys: string[] = []): string {
  const sensitiveKeys = new Set([...ALWAYS_REDACTED, ...redactKeys.map((k) => k.toLowerCase())]);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  for (const [key] of parsed.searchParams.entries()) {
    if (sensitiveKeys.has(key.toLowerCase())) {
      parsed.searchParams.set(key, "[REDACTED]");
    }
  }
  return parsed.toString();
}

/**
 * Thin wrapper around native fetch with timeout, signal composition, and
 * discriminated result type.
 */
export async function httpFetch(opts: HttpFetchOptions): Promise<HttpResult> {
  const {
    url,
    headers,
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: callerSignal,
    redactKeys: _redactKeys,
  } = opts;

  let method = opts.method;
  if (!method) {
    method = body !== undefined ? "POST" : "GET";
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  const signals: AbortSignal[] = [timeoutController.signal];
  if (callerSignal) {
    signals.push(callerSignal);
  }
  const combinedSignal = AbortSignal.any(signals);

  const fetchInit: RequestInit = {
    method,
    headers,
    signal: combinedSignal,
  };

  if (body !== undefined) {
    fetchInit.body = JSON.stringify(body);
    if (!fetchInit.headers) {
      fetchInit.headers = { "Content-Type": "application/json" };
    } else if (!(fetchInit.headers as Record<string, string>)["Content-Type"]) {
      (fetchInit.headers as Record<string, string>)["Content-Type"] = "application/json";
    }
  }

  try {
    const response = await fetch(url, fetchInit);
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
      };
    }

    let data: unknown;
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return {
      ok: true,
      status: response.status,
      data,
      headers: response.headers,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    if (err instanceof DOMException && err.name === "AbortError") {
      if (timeoutController.signal.aborted) {
        return { ok: false, error: `Request timed out after ${timeoutMs}ms` };
      }
      return { ok: false, error: "Request was aborted" };
    }

    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Network error: ${message}` };
  }
}
