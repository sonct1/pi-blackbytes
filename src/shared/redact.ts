/**
 * Centralized secret redaction utility.
 *
 * Single source of truth for redaction patterns, merging coverage from
 * the former `general-safety-overlay.ts` and `runner.ts` implementations.
 * Every redaction call in the codebase goes through `redactSecrets()`.
 */

/**
 * Ordered [pattern, replacement] pairs applied in sequence.
 * Patterns err on the side of false positives to avoid leaking real secrets.
 */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // 1. Uppercase/mixed KEY=value or KEY:value patterns; preserves key name.
  [
    /(\b[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|KEY)[A-Z0-9_]*\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s'",}]+)/gi,
    "$1[REDACTED]",
  ],
  // 2. JSON/colon "key": value patterns (quoted or bare key); preserves key.
  [
    /((?:"[^"]*(?:api[_-]?key|token|secret|password|credential|key)[^"]*"|'[^']*(?:api[_-]?key|token|secret|password|credential|key)[^']*'|\b[A-Za-z0-9_-]*(?:api[_-]?key|token|secret|password|credential|key)[A-Za-z0-9_-]*\b)\s*:\s*)(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
    "$1[REDACTED]",
  ],
  // 3. Bearer token header; preserves "Bearer " prefix.
  [/(Bearer\s+)[A-Za-z0-9._~+\-/=]+/gi, "$1[REDACTED]"],
  // 4. Well-known credential token prefixes (sk-, ghp-, xox*, etc.).
  [/\b(?:sk|pk|ghp|gho|ghu|ghs|github_pat|xox[baprs])[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]"],
];

/** Replace obvious secret-shaped substrings with a redaction marker. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
