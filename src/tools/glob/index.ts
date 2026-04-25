import { stat } from "node:fs/promises";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import fg from "fast-glob";
import { TOOL_NAMES } from "../../config/resource-metadata.js";
import { registerTool } from "../_shared/register-tool.js";
import { type TextToolResult, textResult } from "../_shared/text-result.js";

const DISPLAY_LIMIT = 25;
const TIMEOUT_MS = 60_000;

interface GlobParams {
  pattern: string;
  path?: string;
}

export async function executeGlob(params: GlobParams): Promise<TextToolResult> {
  const { pattern, path: cwd } = params;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      const t = setTimeout(() => {
        reject(new Error("glob timed out after 60s"));
      }, TIMEOUT_MS);
      t.unref?.();
    });

    const globPromise = fg(pattern, {
      cwd: cwd ?? process.cwd(),
      absolute: true,
      onlyFiles: true,
      followSymbolicLinks: false,
    });

    const matches: string[] = await Promise.race([globPromise, timeoutPromise]);

    // Sort by mtime descending (most recent first), then keep the rendered output compact.
    const withMtime = await Promise.all(
      matches.map(async (file) => {
        try {
          const s = await stat(file);
          return { file, mtime: s.mtimeMs };
        } catch {
          return { file, mtime: 0 };
        }
      }),
    );
    withMtime.sort((a, b) => b.mtime - a.mtime);

    if (withMtime.length === 0) {
      return textResult("(no matches)");
    }

    const displayed = withMtime.slice(0, DISPLAY_LIMIT).map((x) => x.file);
    const basePath = cwd ?? process.cwd();
    const header = [
      `Found ${withMtime.length} file${withMtime.length === 1 ? "" : "s"}.`,
      `Pattern: ${pattern}`,
      `Base path: ${basePath}`,
      `Showing newest ${displayed.length} of ${withMtime.length}.`,
    ];

    if (withMtime.length > DISPLAY_LIMIT) {
      header.push(
        `Omitted ${withMtime.length - DISPLAY_LIMIT} older match(es); narrow pattern/path for more.`,
      );
    }

    return textResult(`${header.join("\n")}\n\n${displayed.join("\n")}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return textResult(`Error: ${message}`);
  }
}

export function registerGlobTool(pi: ExtensionAPI): void {
  registerTool(pi, TOOL_NAMES.GLOB, {
    name: TOOL_NAMES.GLOB,
    promptSnippet: "Fast file pattern matching with glob patterns like **/*.ts",
    description:
      "Fast file pattern matching. Supports glob patterns like **/*.js or src/**/*.ts. Returns a compact status summary with the newest matching file paths (display-limited).",
    parameters: Type.Object({
      pattern: Type.String({
        description: "Glob pattern (e.g. **/*.ts, src/**/*.js)",
      }),
      path: Type.Optional(
        Type.String({
          description: "Base directory to search in (defaults to cwd)",
        }),
      ),
    }),
    execute: executeGlob,
  });
}
