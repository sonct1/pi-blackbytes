import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "../../types/pi.js";
import { type HttpFetchOptions, httpFetch } from "../_shared/http.js";
import { registerTool } from "../_shared/register-tool.js";

type FetchFn = (opts: HttpFetchOptions) => ReturnType<typeof httpFetch>;

export async function executeWebsearchFetch(
  params: { url: string; format?: "markdown" | "text" | "html"; timeout?: number },
  fetchFn: FetchFn = httpFetch,
): Promise<{ content: string }> {
  let { url } = params;
  // TODO: format parameter is accepted for API compatibility but not applied.
  // Direct HTTP fetch cannot convert HTML→markdown without a rendering library.
  const { timeout } = params;

  // Upgrade http:// to https://
  if (url.startsWith("http://")) {
    url = `https://${url.slice("http://".length)}`;
  }

  const result = await fetchFn({
    url,
    method: "GET",
    timeoutMs: timeout !== undefined ? timeout * 1000 : undefined,
  });

  if (!result.ok) {
    return { content: `Error fetching URL: ${result.error}` };
  }

  const text = typeof result.data === "string" ? result.data : JSON.stringify(result.data);
  return { content: text };
}

export function registerWebsearchFetchTool(pi: ExtensionAPI): void {
  registerTool(pi, "websearch_fetch", {
    name: "websearch_fetch",
    description:
      "Fetch content from a URL and return it as text. Automatically upgrades http:// to https://.",
    parameters: Type.Object({
      url: Type.String({ description: "The URL to fetch" }),
      format: Type.Optional(
        Type.Union([Type.Literal("markdown"), Type.Literal("text"), Type.Literal("html")], {
          description: "Desired output format (default: markdown)",
        }),
      ),
      timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (max 120)" })),
    }),
    execute: (params: { url: string; format?: "markdown" | "text" | "html"; timeout?: number }) =>
      executeWebsearchFetch(params),
  });
}
