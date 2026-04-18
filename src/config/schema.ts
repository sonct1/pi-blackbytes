import { z } from "zod";

const SubAgentNameEnum = z.enum(["explore", "oracle", "librarian", "general"]);

export const BlackbytesConfigSchema = z
  .object({
    disabled_tools: z.array(z.string()).default([]),
    disabled_sub_agents: z.array(SubAgentNameEnum).default([]),
    hashline_edit: z.boolean().default(true),
    copilot_initiator_header: z.boolean().default(true),
    websearch: z
      .object({
        provider: z.enum(["exa", "tavily"]),
        exa_api_key: z.string().optional(),
        tavily_api_key: z.string().optional(),
      })
      .optional(),
    context7: z
      .object({
        api_key: z.string().optional(),
      })
      .optional(),
    sub_agents: z
      .record(
        z.string(),
        z.object({
          model: z.string().optional(),
          reasoningEffort: z.string().optional(),
          temperature: z.number().optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

export type BlackbytesConfig = z.infer<typeof BlackbytesConfigSchema>;

export function parseBlackbytesConfig(
  input: unknown,
): { ok: true; value: BlackbytesConfig } | { ok: false; errors: string[] } {
  const result = BlackbytesConfigSchema.safeParse(input);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });
  return { ok: false, errors };
}
