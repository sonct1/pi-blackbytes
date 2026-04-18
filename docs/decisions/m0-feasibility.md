# M0 Feasibility Decisions

## Q3: active-tools dynamism

**Decision: `dynamic: yes`**

**Chosen strategy:** Register all possible tools at startup, then use `pi.setActiveTools()` to narrow the active set dynamically throughout the session.

**Why the alternative was rejected:** Computing the enabled-set once at `session_start` and registering only that subset would work but is unnecessarily rigid. The Pi API fully supports post-init dynamism, so there is no technical reason to lock in the tool set at startup. The session_start-only strategy would also prevent future features like mode-based tool toggling (e.g., "Plan Mode" vs "Implementation Mode").

### Evidence

1. **GitHub Issue #1720** (landed March 2026): `pi.registerTool()` works after session init without requiring `/reload`. Tool registry and active tools refresh immediately.

2. **`dynamic-tools.ts` example extension**: Demonstrates registering tools inside command handlers at runtime.

3. **`tools.ts` example extension**: Provides a `/tools` UI to toggle tool visibility via `pi.setActiveTools()`.

### API Surface

| Method | Purpose |
|--------|---------|
| `pi.registerTool(definition)` | Add a new tool to the session (works post-init) |
| `pi.setActiveTools(toolNames[])` | Set which registered tools are visible to the LLM |
| `pi.getActiveTools()` | Get names of currently active tools |
| `pi.getAllTools()` | Get all registered tool definitions (active + inactive) |

### Implications for `resources_discover` and registration timing

- **Registration:** Register all BlackBytes tools during `session_start` (or `before_agent_start`). This is a one-time operation.
- **Activation:** Use `pi.setActiveTools()` to control which tools the LLM sees. Changes take effect immediately — the system prompt is rebuilt dynamically.
- **`resources_discover`:** Should expose all *registered* tools (via `pi.getAllTools()`), not just active ones. The enabled-set module (`M1.6`) controls activation separately.
- **Single source of truth:** `pi.setActiveTools()` governs both model visibility (system prompt) and invocation permission. No split between visible and invocable.

### Caveats

- Tool names must be unique session-wide.
- Tools not in the `setActiveTools` list are invisible to the LLM (removed from system prompt).
- On `session_fork` or `session_start`, dynamically registered tools may need re-registration depending on extension loading order. Listen for these events to restore state.

## Q2: header mutation

**Decision: `confirmed: no` (for `before_provider_request`)**

**Finding:** The `before_provider_request` hook only allows mutation of the **request body/payload** (e.g., `temperature`, `max_tokens`, `messages`), not HTTP headers. By the time this hook fires, headers are already set by the SDK client.

**Payload shape:**
```typescript
interface BeforeProviderRequestEvent {
  type: "before_provider_request";
  payload: unknown; // Provider-specific request body (Anthropic MessageCreateParams, OpenAI ChatCompletionCreateParams, etc.)
}
```

### Fallback: `pi.registerProvider`

Use `pi.registerProvider` to inject custom HTTP headers for a specific provider:

```typescript
pi.registerProvider("github-copilot", {
  headers: {
    "x-initiator": "agent"
  }
});
```

**Why this works:** `pi-ai` merges headers in order: built-in model headers → provider headers → request options. Calling `registerProvider` during extension init or `session_start` correctly applies headers to the first request (fix landed in v0.58.4, Issue #2291).

### Implementation rule for M3.4

1. **Do NOT use `before_provider_request`** for header injection — it is for payload transformations only.
2. **Use `pi.registerProvider("github-copilot", { headers: { "x-initiator": "agent" } })`** during extension initialization or `session_start`.
3. Headers set via `registerProvider` are static per-provider. Dynamic per-request headers are not currently supported.

### Caveats

- `registerProvider` sets static headers; no per-request dynamic header hook exists yet.
- Header values may be resolved as environment variable names by Pi — use literal strings that don't collide with common env var names.
- `before_provider_request` remains useful for body mutations (e.g., mapping `reasoningEffort` to provider-specific thinking/reasoning params for M3.6).

## Q1: nested-session execution

**Decision: programmatic `createAgentSession` (SDK path)**

**Chosen path:** Use `createAgentSession()` from `@mariozechner/pi-coding-agent` to spawn nested sessions in-process. This avoids subprocess startup overhead (~500ms-1s) and provides direct control over tool registration, cancellation, and event streaming.

**Rejected alternative:** `pi --mode rpc` subprocess. Higher startup cost, indirect cancellation (stdin message or SIGTERM), and tool allowlist enforcement via `--tools` CLI flag is less precise than programmatic registration.

**Fallback path:** If `createAgentSession` proves unstable or has version-compatibility issues, fall back to `pi --mode rpc --no-session` with JSONL streaming over stdout and `{ "type": "abort" }` on stdin for cancellation.

### API surface

```typescript
import { createAgentSession } from '@mariozechner/pi-coding-agent';

const { session } = await createAgentSession({
  cwd: process.cwd(),
  tools: allowedToolInstances, // Only pass permitted tools
  sessionManager: SessionManager.inMemory(), // Prevent child from persisting
});

// Prompt the child
await session.prompt(taskDescription);

// Cancel from parent
session.abort();
```

### Allowlist enforcement plan

Pass only the desired `Tool[]` instances to `createAgentSession({ tools })`. The child session will only have access to tools explicitly provided. Additionally, use `session.setActiveToolsByName(toolNames)` for dynamic narrowing if needed.

### Cancellation contract

The parent holds a reference to the child `AgentSession`. On parent abort, call `childSession.abort()` which propagates through the internal `AbortController` to all in-flight tool calls that accept `signal`.

### Streaming policy

Use `session.subscribe(listener)` to receive real-time events from the child. Events include `message_update`, `tool_execution_start/end`, `turn_end`, and `agent_end`. Proxy relevant events to the parent's UI via `ctx.ui` or `pi.sendCustomMessage` for user visibility.

### Startup/perf notes

- In-process sessions share the Node.js runtime — no cold start.
- Use `SessionManager.inMemory()` to avoid file I/O for child session persistence.
- Each child session has its own `Agent` instance and tool registry — no shared mutable state with parent.

## Q4: nested-session allowlist enforcement

**Decision: enforcement by tool registration omission + `beforeToolCall` interception**

**Enforcement mechanism:** The primary defense is registering only the allowed tools in the child session via `createAgentSession({ tools })`. As a secondary defense, attach a `beforeToolCall` hook on the child's `Agent` to deny any unexpected tool invocations.

**Prompt-only enforcement is NOT relied on.** Prompt text may reinforce the policy ("you only have access to X, Y, Z") but the runtime guarantee comes from tool registration and interception.

### Persona allowlist matrix

| Persona | Allowed Tools | Denied |
|---------|--------------|--------|
| `delegate_explore` | read, glob, grep, ast_grep_search | write, edit, bash, hashline_edit |
| `delegate_oracle` | read, glob, grep, ast_grep_search, webfetch (if enabled) | write, edit, bash, hashline_edit |
| `delegate_librarian` | read, glob, grep, ast_grep_search, webfetch, websearch, context7, grep_app | write, edit, bash |
| `delegate_general` | read, glob, grep, write, edit, bash, hashline_edit, ast_grep_search, ast_grep_replace | per parent policy |

### Violation behavior

When a child session attempts a tool not in its registry, the `Agent` loop emits a `tool_execution_end` event with `isError: true` and message `"Tool [name] is not available"`. The model receives this as a tool result error and should adapt.

If `beforeToolCall` intercepts a call, it returns `{ block: true, reason: "Tool [name] is not permitted for [persona] persona" }`. This surfaces as a structured error to the model.

```typescript
// Structured error shape returned to the model
{
  isError: true,
  content: "Tool [name] is not permitted for explore persona. Available tools: read, glob, grep, ast_grep_search"
}
```

### Limitations for M4

- Tool instances must be constructed or obtained from the parent's registry before passing to the child. Verify that tool constructors don't require session-specific context that would break isolation.
- MCP tools (websearch, context7, grep_app) may need special handling since they depend on MCP server connections — verify they can be shared across sessions or need separate initialization.

## Q5: delegate contract

**Decision: structured envelopes with explicit timeout and recursion guard**

### Success envelope

```typescript
interface DelegateSuccess {
  ok: true;
  content: string;       // Final text response from the child session
  details?: {
    toolCalls: number;    // Count of tool invocations
    duration: number;     // Wall-clock ms
    model: string;        // Model used by child
  };
}
```

### Failure envelope

```typescript
interface DelegateFailure {
  ok: false;
  error: {
    code: 'timeout' | 'aborted' | 'recursion_limit' | 'tool_denied' | 'internal';
    message: string;
    details?: unknown;
  };
}

type DelegateResult = DelegateSuccess | DelegateFailure;
```

### Cancellation propagation

The parent wraps the child session in an `AbortController`. When the parent's own signal fires, it calls `childSession.abort()`. The child's in-flight tool calls receive the abort signal and terminate. The parent then returns a `DelegateFailure` with `code: 'aborted'`.

### Default timeout

**5 minutes** (300,000 ms). Configurable per-persona via `sub_agents.<persona>.timeout` in the blackbytes config (future enhancement). On timeout, the parent calls `childSession.abort()` and returns `code: 'timeout'`.

### Environment inheritance

For programmatic sessions (in-process), `process.env` is shared. The following are explicitly set/overridden in the child:
- `PI_NESTED_DEPTH`: incremented from parent (default `0` → child gets `1`)
- `PI_PARENT_SESSION_ID`: set to parent's session ID for tracing
- Tool-specific env vars (API keys) are inherited naturally since the child runs in-process.

### Recursion guard

**Runtime enforcement via `PI_NESTED_DEPTH` environment variable:**
1. Before spawning a child, check `parseInt(process.env.PI_NESTED_DEPTH || '0')`.
2. If `depth >= 1` (maxDepth), immediately return `DelegateFailure` with `code: 'recursion_limit'` without creating a session.
3. When spawning, set `PI_NESTED_DEPTH = String(depth + 1)` in the child's environment.
4. Child sessions do NOT register `delegate_*` tools at all when `PI_NESTED_DEPTH >= 1`, providing defense-in-depth.

### Streaming vs buffered return

**Buffered.** The child session runs to completion (or timeout/abort), then the full transcript is summarized into the `content` field of the success envelope. Real-time streaming of child events to the parent UI is optional and handled separately via event proxying (not through the tool result).
