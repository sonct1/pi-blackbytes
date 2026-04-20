import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "@sinclair/typebox";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { getEnabledSet } from "../config/enabled-set.js";
import { getLogger } from "../shared/logger.js";
import { type SubAgentDeclaration, defineSubAgent } from "./declaration.js";
import { resolveToolStrategy, validateToolNames } from "./delegable-tools.js";

// ---------------------------------------------------------------------------
// YAML schema
// ---------------------------------------------------------------------------

const YamlSubAgentSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .refine((n) => /^[a-z][a-z0-9_-]*$/.test(n), {
        message:
          "name must start with a lowercase letter and contain only lowercase letters, digits, hyphens, or underscores",
      }),
    description: z.string().min(1),
    system_prompt: z.string().min(1),
    allowed_tools: z.array(z.string()).optional(),
    denied_tools: z.array(z.string()).optional(),
    model: z.string().optional(),
    reasoning_effort: z.string().optional(),
  })
  .refine((d) => !(d.allowed_tools && d.denied_tools), {
    message: "allowed_tools and denied_tools are mutually exclusive",
  });

type YamlSubAgentInput = z.infer<typeof YamlSubAgentSchema>;

// ---------------------------------------------------------------------------
// Directory resolution
// ---------------------------------------------------------------------------

function resolveSubAgentDir(): string {
  const agentDir = process.env.PI_AGENT_DIR;
  if (agentDir) {
    return path.join(agentDir, "sub-agents");
  }
  return path.join(os.homedir(), ".pi", "agent", "sub-agents");
}

// ---------------------------------------------------------------------------
// Single-file parsing
// ---------------------------------------------------------------------------

function parseYamlFile(
  content: string,
): { ok: true; value: YamlSubAgentInput } | { ok: false; reason: string } {
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    return { ok: false, reason: `YAML syntax error: ${(err as Error).message}` };
  }

  const result = YamlSubAgentSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => {
      const p = i.path.length > 0 ? `${i.path.join(".")}: ` : "";
      return `${p}${i.message}`;
    });
    return { ok: false, reason: `Schema validation failed: ${issues.join("; ")}` };
  }

  return { ok: true, value: result.data };
}

// ---------------------------------------------------------------------------
// Tool validation
// ---------------------------------------------------------------------------

function validateYamlTools(input: YamlSubAgentInput): { ok: true } | { ok: false; reason: string } {
  const toolNames = input.allowed_tools ?? input.denied_tools;
  if (!toolNames || toolNames.length === 0) return { ok: true };

  const { unknown } = validateToolNames(toolNames);
  if (unknown.length > 0) {
    const field = input.allowed_tools ? "allowed_tools" : "denied_tools";
    return {
      ok: false,
      reason: `Unknown tool names in ${field}: ${unknown.join(", ")}`,
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Declaration conversion
// ---------------------------------------------------------------------------

type YamlAgentParams = { prompt: string };

const YAML_AGENT_PARAMETERS = Type.Object({
  prompt: Type.String({ description: "The task or question for this agent" }),
});

function toDeclaration(input: YamlSubAgentInput): SubAgentDeclaration<YamlAgentParams> {
  const toolStrategy = input.allowed_tools
    ? { kind: "allowlist" as const, tools: input.allowed_tools }
    : input.denied_tools
      ? { kind: "denylist" as const, tools: input.denied_tools }
      : undefined;

  const allowedTools: SubAgentDeclaration<YamlAgentParams>["allowedTools"] = toolStrategy
    ? toolStrategy.kind === "allowlist"
      ? toolStrategy.tools
      : () => resolveToolStrategy(toolStrategy, getEnabledSet().tools)
    : () => resolveToolStrategy({ kind: "all-except-delegates" }, getEnabledSet().tools);

  const modelOverrides =
    input.model || input.reasoning_effort
      ? () => ({
          model: input.model,
          reasoningEffort: input.reasoning_effort,
        })
      : undefined;

  return defineSubAgent<YamlAgentParams>({
    name: input.name,
    toolName: `delegate_${input.name}`,
    description: input.description,
    parameters: YAML_AGENT_PARAMETERS,
    systemPrompt: input.system_prompt,
    allowedTools,
    buildUserPrompt(params: YamlAgentParams) {
      return params.prompt;
    },
    resolveModelOverrides: modelOverrides,
  });
}

// ---------------------------------------------------------------------------
// Public loader
// ---------------------------------------------------------------------------

/**
 * Loads YAML sub-agent declarations from `$PI_AGENT_DIR/sub-agents/*.yaml`.
 * Invalid files are logged as warnings and skipped.
 * Returns only successfully validated declarations.
 */
export async function loadYamlDeclarations(): Promise<SubAgentDeclaration[]> {
  const logger = getLogger();
  const dir = resolveSubAgentDir();

  let entries: string[];
  try {
    const allEntries = await fs.readdir(dir);
    entries = allEntries.filter((e) => e.endsWith(".yaml") || e.endsWith(".yml")).sort();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      logger.debug("No sub-agents directory found, skipping YAML loading", { dir });
    } else {
      logger.warn("Failed to read sub-agents directory", { dir, code });
    }
    return [];
  }

  if (entries.length === 0) {
    logger.debug("No YAML sub-agent files found", { dir });
    return [];
  }

  const declarations: SubAgentDeclaration[] = [];

  for (const entry of entries) {
    const filePath = path.join(dir, entry);

    let content: string;
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch (err) {
      logger.warn("Failed to read YAML sub-agent file", {
        file: entry,
        error: (err as Error).message,
      });
      continue;
    }

    const parseResult = parseYamlFile(content);
    if (!parseResult.ok) {
      logger.warn("Skipping invalid YAML sub-agent file", {
        file: entry,
        reason: parseResult.reason,
      });
      continue;
    }

    const toolResult = validateYamlTools(parseResult.value);
    if (!toolResult.ok) {
      logger.warn("Skipping YAML sub-agent with invalid tools", {
        file: entry,
        reason: toolResult.reason,
      });
      continue;
    }

    declarations.push(toDeclaration(parseResult.value));
    logger.info("Loaded YAML sub-agent declaration", {
      name: parseResult.value.name,
      file: entry,
    });
  }

  return declarations;
}
