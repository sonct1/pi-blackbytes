import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createLogger } from "../shared/logger.js";
import { type BlackbytesConfig, parseBlackbytesConfig } from "./schema.js";

const logger = createLogger();

function resolveSettingsPath(): string {
  const agentDir = process.env.PI_AGENT_DIR;
  if (agentDir) {
    return path.join(agentDir, "settings.json");
  }
  return path.join(os.homedir(), ".pi", "agent", "settings.json");
}

function getDefaults(): BlackbytesConfig {
  const result = parseBlackbytesConfig({});
  if (result.ok) return result.value;
  // parseBlackbytesConfig({}) should always succeed with all-defaults schema
  return {} as BlackbytesConfig;
}

export async function loadBlackbytesConfig(): Promise<BlackbytesConfig> {
  const settingsPath = resolveSettingsPath();

  let raw: string;
  try {
    raw = await fs.readFile(settingsPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      logger.warn("Settings file not found, using defaults", { path: settingsPath });
    } else {
      logger.warn("Failed to read settings file, using defaults", { path: settingsPath, code });
    }
    return getDefaults();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.warn("Malformed JSON in settings file, using defaults", { path: settingsPath });
    return getDefaults();
  }

  if (typeof parsed !== "object" || parsed === null || !("blackbytes" in parsed)) {
    logger.warn("Missing 'blackbytes' key in settings, using defaults", { path: settingsPath });
    return getDefaults();
  }

  const blackbytesRaw = (parsed as Record<string, unknown>).blackbytes;
  const result = parseBlackbytesConfig(blackbytesRaw);

  if (!result.ok) {
    logger.warn("Invalid blackbytes config, using defaults", { errors: result.errors });
    return getDefaults();
  }

  logger.info("Loaded blackbytes config", { path: settingsPath });
  return result.value;
}
