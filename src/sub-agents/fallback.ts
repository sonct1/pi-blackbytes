/**
 * Conservative model fallback for read-only sub-agents.
 *
 * Eligibility is determined at snapshot time (`AgentSnapshot.fallbackEligible`).
 * Only `provider_or_model_unavailable` failures trigger a retry. This failure
 * kind is emitted by the runner when the provider/model rejects the request
 * before any model output is produced (auth errors, rate limits, model-not-found),
 * making retries safe from a side-effect perspective.
 *
 * All attempts share a single budget window derived from `runOpts.timeoutMs`.
 * Each attempt receives `remaining = budgetEnd - now()` so no single attempt
 * can silently absorb the entire budget.
 */

import type { AgentSnapshot } from "./snapshot.js";
import type { DelegateFailureKind, DelegateResult, RunNestedPiOptions } from "./types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AttemptSummary {
  /** Model identifier for this attempt; `undefined` means the host default. */
  model: string | undefined;
  /** Outcome: "success", or the DelegateFailureKind on failure. */
  status: "success" | DelegateFailureKind;
  /** Whether this attempt was eligible for a retry (i.e. retriable failure kind). */
  retriable: boolean;
  /** Wall-clock duration of this attempt in milliseconds. */
  durationMs: number;
}

export interface FallbackResult extends DelegateResult {
  /** Summary of every model attempt made, in order. */
  attemptedModels: AttemptSummary[];
}

export interface ExecuteWithFallbackOptions {
  /** Frozen agent snapshot; used to resolve fallback eligibility and model chain. */
  snapshot: AgentSnapshot;
  /**
   * Base run options. `model` and `timeoutMs` are overridden per-attempt;
   * all other fields are forwarded unchanged.
   */
  runOpts: RunNestedPiOptions;
  /**
   * Injected runner function — pure dependency injection for testability.
   * Callers pass `(o) => runNestedPi(o, spawnFn)`.
   */
  runner: (opts: RunNestedPiOptions) => Promise<DelegateResult>;
  /** Clock function for deterministic testing. Defaults to `Date.now`. */
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Minimum remaining budget before we skip an attempt.
 * Avoids launching a nested-Pi session that would immediately time out.
 */
const MIN_REMAINING_MS = 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a compact human-readable summary of all attempts.
 * Example: "gpt-4o (provider_or_model_unavailable, 2.1s); claude-opus-4 (success, 4.3s)"
 */
export function formatAttempts(attempts: AttemptSummary[]): string {
  return attempts
    .map((a) => {
      const model = a.model ?? "(host model)";
      const dur = `${(a.durationMs / 1000).toFixed(1)}s`;
      return `${model} (${a.status}, ${dur})`;
    })
    .join("; ");
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Execute a nested-Pi invocation with optional model fallback for read-only agents.
 *
 * Behaviour:
 * - If the snapshot is NOT fallbackEligible OR has no fallback models → single
 *   attempt with the primary model, no retry loop.
 * - Otherwise: iterates [primary, ...fallbackModels]. On each attempt a fresh
 *   `remaining` budget is computed. If remaining < MIN_REMAINING_MS the loop
 *   stops early and the last failure is returned (last-failure approach; budget
 *   exhaustion is not surfaced as a distinct failure kind to keep things simple).
 * - Only `provider_or_model_unavailable` failures continue the loop; every
 *   other failure kind causes an immediate return (no retry).
 * - On all-fail, the `details` field of the last failure is augmented with a
 *   compact "Attempted models: ..." line.
 */
export async function executeWithFallback(
  opts: ExecuteWithFallbackOptions,
): Promise<FallbackResult> {
  const { snapshot, runOpts, runner, now = Date.now } = opts;

  // -------------------------------------------------------------------------
  // Fast path: no fallback applicable
  // -------------------------------------------------------------------------
  const fallbackModels = snapshot.fallbackModels ?? [];
  if (!snapshot.fallbackEligible || fallbackModels.length === 0) {
    const start = now();
    const result = await runner({ ...runOpts, model: snapshot.model });
    const durationMs = now() - start;
    const status: AttemptSummary["status"] = result.success
      ? "success"
      : (result.failureKind ?? "failed");
    return {
      ...result,
      attemptedModels: [{ model: snapshot.model, status, retriable: false, durationMs }],
    };
  }

  // -------------------------------------------------------------------------
  // Fallback loop
  // -------------------------------------------------------------------------
  const models: Array<string | undefined> = [snapshot.model, ...fallbackModels];
  const budgetMs = runOpts.timeoutMs ?? 300_000;
  const budgetEnd = now() + budgetMs;
  const attemptedModels: AttemptSummary[] = [];
  let lastResult: DelegateResult | undefined;

  for (const model of models) {
    const remaining = budgetEnd - now();
    if (remaining <= MIN_REMAINING_MS) {
      // Budget exhausted before this attempt. If we already have a prior
      // result, fall through and return it. Otherwise synthesize a
      // controlled timeout failure so the caller never sees a runtime throw.
      if (!lastResult) {
        return {
          success: false,
          content: "Nested Pi timed out before first attempt",
          details: `Insufficient fallback budget before first attempt (${remaining}ms remaining; minimum ${MIN_REMAINING_MS}ms required). Increase \`timeoutMs\` or remove fallback models.`,
          failureKind: "timed_out",
          attemptedModels,
        };
      }
      break;
    }

    const start = now();
    const result = await runner({ ...runOpts, model, timeoutMs: remaining });
    const durationMs = now() - start;

    if (result.success) {
      attemptedModels.push({ model, status: "success", retriable: false, durationMs });
      return { ...result, attemptedModels };
    }

    const isRetriable = result.failureKind === "provider_or_model_unavailable";
    attemptedModels.push({
      model,
      status: result.failureKind ?? "failed",
      retriable: isRetriable,
      durationMs,
    });
    lastResult = result;

    if (!isRetriable) {
      // Non-retriable failure (timed_out, cancelled, failed, etc.) — stop immediately.
      break;
    }
  }

  // -------------------------------------------------------------------------
  // All attempts failed — augment details with attempt summary
  // -------------------------------------------------------------------------
  const attemptSummary = `Attempted models: ${formatAttempts(attemptedModels)}`;
  const finalResult = lastResult!;

  return {
    ...finalResult,
    details: finalResult.details ? `${finalResult.details}\n${attemptSummary}` : attemptSummary,
    attemptedModels,
  };
}
