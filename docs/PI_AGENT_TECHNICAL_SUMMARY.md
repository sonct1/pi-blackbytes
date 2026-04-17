# Pi Coding Agent — Technical Architecture Summary

**Source:** badlogic/pi-mono `packages/coding-agent/docs/` + examples  
**Date:** April 2026  
**Scope:** Extensions, Packages, Settings, Skills systems

---

## 1. EXTENSIONS SYSTEM

### 1.1 Extension Discovery & Loading

**Locations (auto-discovered):**
- Global: `~/.pi/agent/extensions/*.ts`, `~/.pi/agent/extensions/*/index.ts`
- Project: `.pi/extensions/*.ts`, `.pi/extensions/*/index.ts`
- Settings: `extensions` array (file paths or directories)
- CLI: `-e ./path.ts` (temporary, single run)

**Reload:** `/reload` command hot-reloads extensions from auto-discovered locations.

**Security:** Extensions run with full system permissions; review before installing.

**Loading mechanism:** jiti (TypeScript loader) — no compilation needed.

**Source:** [extensions.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md) § Extension Locations

---

### 1.2 Extension Entry Point

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Subscribe to events
  pi.on("event_name", async (event, ctx) => { ... });
  
  // Register tools, commands, shortcuts, flags
  pi.registerTool({ ... });
  pi.registerCommand("name", { ... });
  pi.registerShortcut("ctrl+x", { ... });
  pi.registerFlag("my-flag", { ... });
}
```

**Available imports:**
- `@mariozechner/pi-coding-agent` — Extension types, events, utilities
- `@sinclair/typebox` — Schema definitions (Type.Object, Type.String, etc.)
- `@mariozechner/pi-ai` — StringEnum for Google-compatible enums
- `@mariozechner/pi-tui` — TUI components (Text, Container, etc.)
- Node.js built-ins (`node:fs`, `node:path`, etc.)
- npm dependencies (if package.json in extension dir)

**Source:** [extensions.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md) § Quick Start, Available Imports

---

### 1.3 Extension Styles

**Single file:**
```
~/.pi/agent/extensions/my-extension.ts
```

**Directory with index.ts:**
```
~/.pi/agent/extensions/my-extension/
├── index.ts        # Entry point
├── tools.ts
└── utils.ts
```

**Package with dependencies:**
```
~/.pi/agent/extensions/my-extension/
├── package.json    # Declares dependencies + pi entry points
├── package-lock.json
├── node_modules/
└── src/index.ts
```

**package.json format:**
```json
{
  "name": "my-extension",
  "dependencies": { "zod": "^3.0.0" },
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

**Source:** [extensions.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md) § Extension Styles

---

### 1.4 Event System

**Lifecycle flow:**
```
pi starts
  ├─► session_start { reason: "startup" }
  └─► resources_discover { reason: "startup" }

user sends prompt
  ├─► input (can intercept, transform, or handle)
  ├─► before_agent_start (can inject message, modify system prompt)
  ├─► agent_start
  ├─► message_start / message_update / message_end
  │
  │   turn (repeats while LLM calls tools)
  │   ├─► turn_start
  │   ├─► context (can modify messages)
  │   ├─► before_provider_request (can inspect/replace payload)
  │   ├─► after_provider_response (status + headers)
  │   │
  │   │   LLM responds, may call tools:
  │   │   ├─► tool_execution_start
  │   │   ├─► tool_call (can block)
  │   │   ├─► tool_execution_update
  │   │   ├─► tool_result (can modify)
  │   │   └─► tool_execution_end
  │   │
  │   └─► turn_end
  │
  └─► agent_end

/new, /resume, /fork, /compact, /tree, /model
  └─► session_before_* (can cancel)
  └─► session_shutdown
  └─► session_start { reason: "new" | "resume" | "fork" }

exit (Ctrl+C, SIGHUP, SIGTERM)
  └─► session_shutdown
```

**Source:** [extensions.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md) § Lifecycle Overview

---

### 1.5 Event Handlers

#### Resource Events

```typescript
pi.on("resources_discover", async (event, _ctx) => {
  // event.cwd, event.reason ("startup" | "reload")
  return {
    skillPaths: ["/path/to/skills"],
    promptPaths: ["/path/to/prompts"],
    themePaths: ["/path/to/themes"],
  };
});
```

#### Session Events

```typescript
pi.on("session_start", async (event, ctx) => {
  // event.reason: "startup" | "reload" | "new" | "resume" | "fork"
  // event.previousSessionFile: present for "new", "resume", "fork"
});

pi.on("session_before_switch", async (event, ctx) => {
  // event.reason: "new" | "resume"
  // event.targetSessionFile: for "resume"
  return { cancel: true };  // or undefined to allow
});

pi.on("session_before_fork", async (event, ctx) => {
  // event.entryId: ID of entry being forked from
  return { cancel: true, skipConversationRestore: true };
});

pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, signal } = event;
  return { cancel: true };
  // OR provide custom summary:
  return {
    compaction: {
      summary: "...",
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
    }
  };
});

pi.on("session_compact", async (event, ctx) => {
  // event.compactionEntry, event.fromExtension
});

pi.on("session_shutdown", async (_event, ctx) => {
  // Cleanup, save state
});
```

#### Agent Events

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  // event.prompt, event.images, event.systemPrompt
  return {
    message: {
      customType: "my-extension",
      content: "Additional context",
      display: true,
    },
    systemPrompt: event.systemPrompt + "\n\nExtra instructions...",
  };
});

pi.on("agent_start", async (_event, ctx) => {});
pi.on("agent_end", async (event, ctx) => {
  // event.messages
});

pi.on("turn_start", async (event, ctx) => {
  // event.turnIndex, event.timestamp
});

pi.on("turn_end", async (event, ctx) => {
  // event.turnIndex, event.message, event.toolResults
});

pi.on("message_start", async (event, ctx) => {
  // event.message
});

pi.on("message_update", async (event, ctx) => {
  // event.message, event.assistantMessageEvent
});

pi.on("message_end", async (event, ctx) => {
  // event.message
});

pi.on("context", async (event, ctx) => {
  // event.messages (deep copy, safe to modify)
  return { messages: filtered };
});

pi.on("before_provider_request", (event, ctx) => {
  // event.payload (provider-specific)
  // return modified payload or undefined
});

pi.on("after_provider_response", (event, ctx) => {
  // event.status, event.headers
});
```

#### Tool Events

```typescript
pi.on("tool_execution_start", async (event, ctx) => {
  // event.toolCallId, event.toolName, event.args
});

pi.on("tool_execution_update", async (event, ctx) => {
  // event.toolCallId, event.toolName, event.args, event.partialResult
});

pi.on("tool_execution_end", async (event, ctx) => {
  // event.toolCallId, event.toolName, event.result, event.isError
});

pi.on("tool_call", async (event, ctx) => {
  // event.toolName, event.toolCallId, event.input (mutable)
  if (event.input.command?.includes("rm -rf")) {
    return { block: true, reason: "Dangerous command" };
  }
});

pi.on("tool_result", async (event, ctx) => {
  // event.toolName, event.toolCallId, event.input
  // event.content, event.details, event.isError
  // Handlers chain like middleware; return partial patches
  return { content: [...], details: {...}, isError: false };
});
```

#### Model Events

```typescript
pi.on("model_select", async (event, ctx) => {
  // event.model, event.previousModel, event.source ("set" | "cycle" | "restore")
});
```

#### Input Events

```typescript
pi.on("input", async (event, ctx) => {
  // event.text (raw, before skill/template expansion)
  // event.images, event.source ("interactive" | "rpc" | "extension")
  
  // Transform: rewrite input
  if (event.text.startsWith("?quick "))
    return { action: "transform", text: `Respond briefly: ${event.text.slice(7)}` };
  
  // Handle: respond without LLM
  if (event.text === "ping") {
    ctx.ui.notify("pong", "info");
    return { action: "handled" };
  }
  
  return { action: "continue" };  // Default
});
```

#### User Bash Events

```typescript
pi.on("user_bash", (event, ctx) => {
  // event.command, event.excludeFromContext, event.cwd
  
  // Option 1: Provide custom operations (e.g., SSH)
  return { operations: remoteBashOps };
  
  // Option 2: Wrap pi's built-in local bash backend
  const local = createLocalBashOperations();
  return {
    operations: {
      exec(command, cwd, options) {
        return local.exec(`source ~/.profile\n${command}`, cwd, options);
      }
    }
  };
  
  // Option 3: Full replacement
  return { result: { output: "...", exitCode: 0, cancelled: false, truncated: false } };
});
```

**Source:** [extensions.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md) § Events

---

### 1.6 ExtensionContext

All handlers receive `ctx: ExtensionContext`.

```typescript
ctx.ui                    // UI methods (select, confirm, input, editor, notify, etc.)
ctx.hasUI                 // false in print/JSON mode, true in interactive/RPC
ctx.cwd                   // Current working directory
ctx.sessionManager        // Read-only session state (getEntries, getBranch, getLeafId)
ctx.modelRegistry         // Access to models and API keys
ctx.model                 // Current model
ctx.signal                // Current agent abort signal (undefined when idle)

ctx.isIdle()              // Check if agent is idle
ctx.abort()               // Abort current operation
ctx.hasPendingMessages()  // Check for queued messages
ctx.shutdown()            // Request graceful shutdown
ctx.getContextUsage()     // Returns { tokens: number } or undefined
ctx.compact(options)      // Trigger compaction (non-blocking)
ctx.getSystemPrompt()     // Get current effective system prompt
```

**Source:** [extensions.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md) § ExtensionContext

---

### 1.7 ExtensionCommandContext

Command handlers receive `ExtensionCommandContext` (extends `ExtensionContext`).

```typescript
pi.registerCommand("my-cmd", {
  handler: async (args, ctx) => {
    await ctx.waitForIdle();  // Wait for agent to finish streaming
    
    const result = await ctx.newSession({
      parentSession: ctx.sessionManager.getSessionFile(),
      setup: async (sm) => {
        sm.appendMessage({
          role: "user",
          content: [{ type: "text", text: "Context..." }],
          timestamp: Date.now(),
        });
      },
    });
    
    const forkResult = await ctx.fork("entry-id-123");
    
    const treeResult = await ctx.navigateTree("entry-id-456", {
      summarize: true,
      customInstructions: "Focus on error handling",
      replaceInstructions: false,
      label: "review-checkpoint",
    });
    
    const switchResult = await ctx.switchSession("/path/to/session.jsonl");
    
    await ctx.reload();  // Reload extensions, skills, prompts, themes
  },
});
```

**Source:** [extensions.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md) § ExtensionCommandContext

---

### 1.8 Custom Tools

#### Tool Registration

```typescript
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this tool does (shown to LLM)",
  promptSnippet: "List or add items in the project todo list",
  promptGuidelines: [
    "Use this tool for todo planning instead of direct file edits when the user asks for a task list."
  ],
  
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),
    text: Type.Optional(Type.String()),
  }),
  
  prepareArguments(args) {
    // Optional: compatibility shim before schema validation
    return args;
  },

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // Stream progress
    onUpdate?.({ content: [{ type: "text", text: "Working..." }] });

    return {
      content: [{ type: "text", text: "Done" }],
      details: { result: "..." },
    };
  },

  // Optional: Custom rendering
  renderCall(args, theme, context) { ... },
  renderResult(result, options, theme, context) { ... },
});
```

**Key points:**
- `promptSnippet` — one-line entry in "Available tools" section (optional)
- `promptGuidelines` — tool-specific bullets in "Guidelines" section (optional)
- Use `StringEnum` for string parameters (required for Google API compatibility)
- `prepareArguments` runs before schema validation (for legacy field folding)
- `execute` receives `signal` for abort-aware work (fetch, nested async)
- `onUpdate` for streaming progress
- Return `{ content: [...], details: {...} }`

#### File Mutation Queue

For tools that mutate files, participate in the same queue as built-in `edit` and `write`:

```typescript
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
  const absolutePath = resolve(ctx.cwd, params.path);

  return withFileMutationQueue(absolutePath, async () => {
    await mkdir(dirname(absolutePath), { recursive: true });
    const current = await readFile(absolutePath, "utf8");
    const next = current.replace(params.oldText, params.newText);
    await writeFile(absolutePath, next, "utf8");

    return {
      content: [{ type: "text", text: `Updated ${params.path}` }],
      details: {},
    };
  });
}
```

**Why:** Tool calls run in parallel by default. Without the queue, two tools can read the same old file, compute different updates, and one write overwrites the other.

#### Custom Rendering

```typescript
renderCall(args, theme, context) {
  // context.args, context.state, context.lastComponent
  // context.toolCallId, context.cwd, context.executionStarted, context.argsComplete
  // context.isPartial, context.expanded, context.showImages, context.isError
  // context.invalidate() — request rerender
  
  const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  let content = theme.fg("toolTitle", theme.bold("my_tool "));
  content += theme.fg("muted", args.action);
  text.setText(content);
  return text;
}

renderResult(result, { expanded, isPartial }, theme, context) {
  if (isPartial) {
    return new Text(theme.fg("warning", "Processing..."), 0, 0);
  }
  
  let text = theme.fg("success", "✓ Done");
  if (expanded && result.details?.items) {
    for (const item of result.details.items) {
      text += "\n  " + theme.fg("dim", item);
    }
  }
  return new Text(text, 0, 0);
}
```

**Theme colors:**
```typescript
theme.fg("toolTitle", text)   // Tool names
theme.fg("accent", text)      // Highlights
theme.fg("success", text)     // Success (green)
theme.fg("error", text)       // Errors (red)
theme.fg("warning", text)     // Warnings (yellow)
theme.fg("muted", text)       // Secondary text
theme.fg("dim", text)         // Tertiary text
theme.bold(text)
theme.italic(text)
theme.strikethrough(text)
```

**Keybinding hints:**
```typescript
import { keyHint } from "@mariozechner/pi-coding-agent";

renderResult(result, { expanded }, theme, context) {
  let text = theme.fg("success", "✓ Done");
  if (!expanded) {
    text += ` (${keyHint("app.tools.expand", "to expand")})`;
  }
  return new Text(text, 0, 0);
}
```

**Source:** [extensions.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md) § Custom Tools

---

### 1.9 Custom UI

#### Dialogs

```typescript
// Select from options
const choice = await ctx.ui.select("Pick one:", ["A", "B", "C"]);

// Confirm dialog
const ok = await ctx.ui.confirm("Delete?", "This cannot be undone");

// Text input
const name = await ctx.ui.input("Name:", "placeholder");

// Multi-line editor
const text = await ctx.ui.editor("Edit:", "prefilled text");

// Notification (non-blocking)
ctx.ui.notify("Done!", "info");  // "info" | "warning" | "error"
```

#### Timed Dialogs

```typescript
const confirmed = await ctx.ui.confirm(
  "Timed Confirmation",
  "This dialog will auto-cancel in 5 seconds. Confirm?",
  { timeout: 5000 }
);

// Or with AbortSignal for more control
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

const confirmed = await ctx.ui.confirm(
  "Timed Confirmation",
  "...",
  { signal: controller.signal }
);

clearTimeout(timeoutId);
if (controller.signal.aborted) {
  // Dialog timed out
}
```

#### Widgets, Status, Footer

```typescript
// Status in footer (persistent until cleared)
ctx.ui.setStatus("my-ext", "Processing...");
ctx.ui.setStatus("my-ext", undefined);  // Clear

// Working message (shown during streaming)
ctx.ui.setWorkingMessage("Thinking deeply...");
ctx.ui.setWorkingMessage();  // Restore default

// Widget above editor (default)
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"]);
// Widget below editor
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"], { placement: "belowEditor" });
// Custom component
ctx.ui.setWidget("my-widget", (tui, theme) => new Text(theme.fg("accent", "Custom"), 0, 0));
ctx.ui.setWidget("my-widget", undefined);  // Clear

// Custom footer (replaces built-in footer entirely)
ctx.ui.setFooter((tui, theme) => ({
  render(width) { return [theme.fg("dim", "Custom footer")]; },
  invalidate() {},
}));
ctx.ui.setFooter(undefined);  // Restore built-in footer

// Terminal title
ctx.ui.setTitle("pi - my-project");

// Editor text
ctx.ui.setEditorText("Prefill text");
const current = ctx.ui.getEditorText();

// Paste into editor
ctx.ui.pasteToEditor("pasted content");

// Tool output expansion
const wasExpanded = ctx.ui.getToolsExpanded();
ctx.ui.setToolsExpanded(true);

// Custom editor (vim mode, emacs mode, etc.)
ctx.ui.setEditorComponent((tui, theme, keybindings) => new VimEditor(tui, theme, keybindings));
ctx.ui.setEditorComponent(undefined);  // Restore default

// Theme management
const themes = ctx.ui.getAllThemes();  // [{ name: "dark", path: "/..." | undefined }, ...]
const lightTheme = ctx.ui.getTheme("light");  // Load without switching
const result = ctx.ui.setTheme("light");  // Switch by name
if (!result.success) {
  ctx.ui.notify(`Failed: ${result.error}`, "error");
}
ctx.ui.setTheme(lightTheme!);  // Or switch by Theme object
ctx.ui.theme.fg("accent", "styled text");  // Access current theme
```

#### Custom Components

```typescript
import { Text, Component } from "@mariozechner/pi-tui";

const result = await ctx.ui.custom<boolean>((tui, theme, keybindings, done) => {
  const text = new Text("Press Enter to confirm, Escape to cancel", 1, 1);

  text.onKey = (key) => {
    if (key === "return") done(true);
    if (key === "escape") done(false);
    return true;
  };

  return text;
});

if (result) {
  // User pressed Enter
}
```

**Overlay mode (experimental):**
```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyOverlayComponent({ onClose: done }),
  {
    overlay: true,
    overlayOptions: { anchor: "top-right", width: "50%", margin: 2 },
    onHandle: (handle) => { /* handle.setHidden(true/false) */ }
  }
);
```

#### Custom Editor

```typescript
import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey } from "@mariozechner/pi-tui";

class VimEditor extends CustomEditor {
  private mode: "normal" | "insert" = "insert";

  handleInput(data: string): void {
    if (matchesKey(data, "escape") && this.mode === "insert") {
      this.mode = "normal";
      return;
    }
    if (this.mode === "normal" && data === "i") {
      this.mode = "insert";
      return;
    }
    super.handleInput(data);  // App keybindings + text editing
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((_tui, theme, keybindings) =>
      new VimEditor(theme, keybindings)
    );
  });
}
```

#### Message Rendering

```typescript
import { Text } from "@mariozechner/pi-tui";

pi.registerMessageRenderer("my-extension", (message, options, theme) => {
  const { expanded } = options;
  let text = theme.fg("accent", `[${message.customType}] `);
  text += message.content;

  if (expanded && message.details) {
    text += "\n" + theme.fg("dim", JSON.stringify(message.details, null, 2));
  }

  return new Text(text, 0, 0);
});

// Send custom message
pi.sendMessage({
  customType: "my-extension",
  content: "Status update",
  display: true,
  details: { ... },
});
```

**Source:** [extensions.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md) § Custom UI

---

### 1.10 Commands, Shortcuts, Flags

#### Commands

```typescript
pi.registerCommand("stats", {
  description: "Show session statistics",
  handler: async (args, ctx) => {
    const count = ctx.sessionManager.getEntries().length;
    ctx.ui.notify(`${count} entries`, "info");
  }
});

// With argument auto-completion
import type { AutocompleteItem } from "@mariozechner/pi-tui";

pi.registerCommand("deploy", {
  description: "Deploy to an environment",
  getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
    const envs = ["dev", "staging", "prod"];
    const items = envs.map((e) => ({ value: e, label: e }));
    const filtered = items.filter((i) => i.value.startsWith(prefix));
    return filtered.length > 0 ? filtered : null;
  },
  handler: async (args, ctx) => {
    ctx.ui.notify(`Deploying: ${args}`, "info");
  },
});

// Get available commands
const commands = pi.getCommands();
// Returns: { name, description?, source, sourceInfo: { path, source, scope, origin, baseDir? } }[]
```

**Multiple registrations:** If multiple extensions register the same command name, pi assigns numeric suffixes: `/review:1`, `/review:2`.

#### Shortcuts

```typescript
pi.registerShortcut("ctrl+shift+p", {
  description: "Toggle plan mode",
  handler: async (ctx) => {
    ctx.ui.notify("Toggled!");
  },
});
```

**Keybinding namespaces:**
- `app.*` — Coding-agent ids (e.g., `app.tools.expand`, `app.editor.external`)
- `tui.*` — Shared TUI ids (e.g., `tui.select.confirm`, `tui.select.cancel`)

#### Flags

```typescript
pi.registerFlag("plan", {
  description: "Start in plan mode",
  type: "boolean",
  default: false,
});

// Check value
if (pi.getFlag("--plan")) {
  // Plan mode enabled
}
```

**Source:** [extensions.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md) § pi.registerCommand, pi.registerShortcut, pi.registerFlag

---

### 1.11 State Management

Store state in tool result `details` for proper branching support:

```typescript
export default function (pi: ExtensionAPI) {
  let items: string[] = [];

  // Reconstruct state from session
  pi.on("session_start", async (_event, ctx) => {
    items = [];
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "message" && entry.message.role === "toolResult") {
        if (entry.message.toolName === "my_tool") {
          items = entry.message.details?.items ?? [];
        }
      }
    }
  });

  pi.registerTool({
    name: "my_tool",
    // ...
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      items.push("new item");
      return {
        content: [{ type: "text", text: "Added" }],
        details: { items: [...items] },  // Store for reconstruction
      };
    },
  });
}
```

**Alternative:** Use `pi.appendEntry()` for extension-only state (not in LLM context):

```typescript
pi.appendEntry("my-state", { count: 42 });

// Restore on reload
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "my-state") {
      // Reconstruct from entry.data
    }
  }
});
```

**Source:** [extensions.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md) § State Management

---

### 1.12 Other ExtensionAPI Methods

```typescript
pi.on(event, handler)                           // Subscribe to events
pi.registerTool(definition)                     // Register custom tool
pi.registerCommand(name, options)               // Register command
pi.registerShortcut(shortcut, options)          // Register keyboard shortcut
pi.registerFlag(name, options)                  // Register CLI flag
pi.registerMessageRenderer(customType, renderer) // Custom message rendering
pi.registerProvider(name, config)               // Register/override model provider
pi.unregisterProvider(name)                     // Remove provider

pi.sendMessage(message, options?)               // Inject custom message
pi.sendUserMessage(content, options?)           // Send user message
pi.appendEntry(customType, data?)               // Persist extension state
pi.setSessionName(name)                         // Set session display name
pi.getSessionName()                             // Get session name
pi.setLabel(entryId, label)                     // Set/clear entry label
pi.exec(command, args, options?)                // Execute shell command

pi.getActiveTools() / pi.getAllTools()          // Get tool lists
pi.setActiveTools(names)                        // Enable/disable tools
pi.setModel(model)                              // Set current model
pi.getThinkingLevel() / pi.setThinkingLevel(level) // Manage thinking

pi.events                                       // Shared event bus for inter-extension communication
```

**Source:** [extensions.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md) § ExtensionAPI Methods

---

## 2. PACKAGES SYSTEM

### 2.1 Package Installation

```bash
pi install npm:@foo/bar@1.0.0
pi install git:github.com/user/repo@v1
pi install https://github.com/user/repo
pi install /absolute/path/to/package
pi install ./relative/path/to/package

pi remove npm:@foo/bar
pi list    # show installed packages
pi update  # update all non-pinned packages

# Try without installing (temporary)
pi -e npm:@foo/bar
pi -e git:github.com/user/repo

# Project-local install
pi install -l npm:@foo/bar  # writes to .pi/settings.json
```

**Scope:**
- Global: `~/.pi/agent/settings.json` (default)
- Project: `.pi/settings.json` (with `-l` flag)

**Source:** [packages.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/packages.md) § Install and Manage

---

### 2.2 Package Sources

#### npm

```
npm:@scope/pkg@1.2.3
npm:pkg
```

- Versioned specs are pinned and skipped by `pi update`
- Global installs use `npm install -g`
- Project installs go under `.pi/npm/`
- Set `npmCommand` in `settings.json` to use wrapper (e.g., `mise`, `asdf`)

#### git

```
git:github.com/user/repo@v1
git:git@github.com:user/repo@v1
https://github.com/user/repo@v1
ssh://git@github.com/user/repo@v1
```

- Without `git:` prefix, only protocol URLs accepted (`https://`, `http://`, `ssh://`, `git://`)
- With `git:` prefix, shorthand formats accepted
- HTTPS and SSH both supported
- SSH uses configured SSH keys automatically
- Refs pin the package and skip `pi update`
- Cloned to `~/.pi/agent/git/<host>/<path>` (global) or `.pi/git/<host>/<path>` (project)
- Runs `npm install` after clone/pull if `package.json` exists

#### Local Paths

```
/absolute/path/to/package
./relative/path/to/package
```

- Added to settings without copying
- Relative paths resolved against settings file location
- If file: loads as single extension
- If directory: loads resources using package rules

**Source:** [packages.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/packages.md) § Package Sources

---

### 2.3 Creating a Pi Package

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

**Paths:** Relative to package root. Arrays support glob patterns and `!exclusions`.

**Gallery metadata:**
```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "video": "https://example.com/demo.mp4",
    "image": "https://example.com/screenshot.png"
  }
}
```

- **video**: MP4 only. Autoplays on hover (desktop), fullscreen on click.
- **image**: PNG, JPEG, GIF, or WebP. Static preview.
- Video takes precedence if both set.

**Source:** [packages.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/packages.md) § Creating a Pi Package

---

### 2.4 Package Structure

#### Convention Directories

If no `pi` manifest, auto-discovers from:
- `extensions/` — `.ts` and `.js` files
- `skills/` — Recursively finds `SKILL.md` folders and top-level `.md` files
- `prompts/` — `.md` files
- `themes/` — `.json` files

#### Dependencies

**Runtime dependencies:** `dependencies` in `package.json`.

**Peer dependencies (bundled by pi):**
```json
{
  "peerDependencies": {
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-agent-core": "*",
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*",
    "@sinclair/typebox": "*"
  }
}
```

**Bundled dependencies (for nested pi packages):**
```json
{
  "dependencies": {
    "shitty-extensions": "^1.0.1"
  },
  "bundledDependencies": ["shitty-extensions"],
  "pi": {
    "extensions": ["extensions", "node_modules/shitty-extensions/extensions"],
    "skills": ["skills", "node_modules/shitty-extensions/skills"]
  }
}
```

**Source:** [packages.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/packages.md) § Dependencies

---

### 2.5 Package Filtering

```json
{
  "packages": [
    "npm:simple-pkg",
    {
      "source": "npm:my-package",
      "extensions": ["extensions/*.ts", "!extensions/legacy.ts"],
      "skills": [],
      "prompts": ["prompts/review.md"],
      "themes": ["+themes/legacy.json"]
    }
  ]
}
```

**Syntax:**
- Omit key to load all of that type
- `[]` to load none
- `!pattern` to exclude
- `+path` to force-include exact path
- `-path` to force-exclude exact path

**Source:** [packages.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/packages.md) § Package Filtering

---

## 3. SETTINGS SYSTEM

### 3.1 Settings Files

| Location | Scope |
|----------|-------|
| `~/.pi/agent/settings.json` | Global (all projects) |
| `.pi/settings.json` | Project (current directory) |

Project settings override global settings. Nested objects are merged.

**Source:** [settings.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/settings.md) § Settings

---

### 3.2 Model & Thinking

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "defaultThinkingLevel": "medium",
  "hideThinkingBlock": false,
  "thinkingBudgets": {
    "minimal": 1024,
    "low": 4096,
    "medium": 10240,
    "high": 32768
  }
}
```

**Thinking levels:** `"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"`, `"xhigh"`

---

### 3.3 UI & Display

```json
{
  "theme": "dark",
  "quietStartup": false,
  "collapseChangelog": false,
  "enableInstallTelemetry": true,
  "doubleEscapeAction": "tree",
  "treeFilterMode": "default",
  "editorPaddingX": 0,
  "autocompleteMaxVisible": 5,
  "showHardwareCursor": false
}
```

**doubleEscapeAction:** `"tree"`, `"fork"`, or `"none"`  
**treeFilterMode:** `"default"`, `"no-tools"`, `"user-only"`, `"labeled-only"`, `"all"`

---

### 3.4 Compaction

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

---

### 3.5 Branch Summary

```json
{
  "branchSummary": {
    "reserveTokens": 16384,
    "skipPrompt": false
  }
}
```

---

### 3.6 Retry

```json
{
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "baseDelayMs": 2000,
    "maxDelayMs": 60000
  }
}
```

When provider requests retry delay longer than `maxDelayMs`, request fails immediately instead of waiting silently.

---

### 3.7 Message Delivery

```json
{
  "steeringMode": "one-at-a-time",
  "followUpMode": "one-at-a-time",
  "transport": "sse"
}
```

**steeringMode / followUpMode:** `"all"` or `"one-at-a-time"`  
**transport:** `"sse"`, `"websocket"`, or `"auto"`

---

### 3.8 Terminal & Images

```json
{
  "terminal": {
    "showImages": true,
    "clearOnShrink": false
  },
  "images": {
    "autoResize": true,
    "blockImages": false
  }
}
```

---

### 3.9 Shell

```json
{
  "shellPath": "/bin/bash",
  "shellCommandPrefix": "shopt -s expand_aliases",
  "npmCommand": ["mise", "exec", "node@20", "--", "npm"]
}
```

**npmCommand:** Used for all npm operations (lookup, install, uninstall, etc.). Argv-style entries.

---

### 3.10 Sessions

```json
{
  "sessionDir": ".pi/sessions"
}
```

Accepts absolute or relative paths. CLI flag `--session-dir` takes precedence.

---

### 3.11 Model Cycling

```json
{
  "enabledModels": ["claude-*", "gpt-4o", "gemini-2*"]
}
```

Model patterns for Ctrl+P cycling (same format as `--models` CLI flag).

---

### 3.12 Markdown

```json
{
  "markdown": {
    "codeBlockIndent": "  "
  }
}
```

---

### 3.13 Resources

```json
{
  "packages": [
    "npm:@foo/bar@1.0.0",
    "git:github.com/user/repo@v1",
    {
      "source": "npm:my-package",
      "skills": ["brave-search", "transcribe"],
      "extensions": []
    }
  ],
  "extensions": [
    "/path/to/local/extension.ts",
    "/path/to/local/extension/dir"
  ],
  "skills": [
    "/path/to/skills"
  ],
  "prompts": [
    "/path/to/prompts"
  ],
  "themes": [
    "/path/to/themes"
  ],
  "enableSkillCommands": true
}
```

**Arrays support:**
- Glob patterns: `"extensions/*.ts"`
- Exclusions: `"!extensions/legacy.ts"`
- Force-include: `"+path/to/file"`
- Force-exclude: `"-path/to/file"`

**Source:** [settings.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/settings.md) § All Settings

---

## 4. SKILLS SYSTEM

### 4.1 Skill Discovery

Pi loads skills from:
- Global: `~/.pi/agent/skills/`, `~/.agents/skills/`
- Project: `.pi/skills/`, `.agents/skills/` (in cwd and ancestors up to git root)
- Packages: `skills/` directories or `pi.skills` entries in `package.json`
- Settings: `skills` array with files or directories
- CLI: `--skill <path>` (repeatable, additive even with `--no-skills`)

**Discovery rules:**
- In `~/.pi/agent/skills/` and `.pi/skills/`: direct root `.md` files are individual skills
- In all skill locations: directories containing `SKILL.md` are discovered recursively
- In `~/.agents/skills/` and project `.agents/skills/`: root `.md` files are ignored

**Disable discovery:** `--no-skills` (explicit `--skill` paths still load)

**Source:** [skills.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/skills.md) § Locations

---

### 4.2 Skill Structure

```
my-skill/
├── SKILL.md              # Required: frontmatter + instructions
├── scripts/              # Helper scripts
│   └── process.sh
├── references/           # Detailed docs loaded on-demand
│   └── api-reference.md
└── assets/
    └── template.json
```

**SKILL.md format:**
````markdown
---
name: my-skill
description: What this skill does and when to use it. Be specific.
---

# My Skill

## Setup

Run once before first use:
```bash
cd /path/to/skill && npm install
```

## Usage

```bash
./scripts/process.sh <input>
```
````

**Relative paths:** Use relative paths from skill directory:
```markdown
See [the reference guide](references/REFERENCE.md) for details.
```

---

### 4.3 Skill Frontmatter

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Max 64 chars. Lowercase a-z, 0-9, hyphens. Must match parent directory. |
| `description` | Yes | Max 1024 chars. What the skill does and when to use it. |
| `license` | No | License name or reference to bundled file. |
| `compatibility` | No | Max 500 chars. Environment requirements. |
| `metadata` | No | Arbitrary key-value mapping. |
| `allowed-tools` | No | Space-delimited list of pre-approved tools (experimental). |
| `disable-model-invocation` | No | When `true`, skill is hidden from system prompt. Users must use `/skill:name`. |

**Name rules:**
- 1-64 characters
- Lowercase letters, numbers, hyphens only
- No leading/trailing hyphens
- No consecutive hyphens
- Must match parent directory name

**Valid:** `pdf-processing`, `data-analysis`, `code-review`  
**Invalid:** `PDF-Processing`, `-pdf`, `pdf--processing`

---

### 4.4 Skill Commands

```bash
/skill:brave-search           # Load and execute the skill
/skill:pdf-tools extract      # Load skill with arguments
```

Arguments after the command are appended to the skill content as `User: <args>`.

**Toggle skill commands:**
```json
{
  "enableSkillCommands": true
}
```

---

### 4.5 Skill Validation

Pi validates against Agent Skills standard. Most issues produce warnings but still load:
- Name doesn't match parent directory
- Name exceeds 64 characters or contains invalid characters
- Name starts/ends with hyphen or has consecutive hyphens
- Description exceeds 1024 characters

**Exception:** Skills with missing description are not loaded.

Name collisions warn and keep the first skill found.

**Source:** [skills.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/skills.md) § Skills

---

## 5. CONCRETE EXAMPLES

### 5.1 Permission Gate (tool_call interception)

**File:** [permission-gate.ts](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/examples/extensions/permission-gate.ts)

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const dangerousPatterns = [
    /\brm\s+(-rf?|--recursive)/i,
    /\bsudo\b/i,
    /\b(chmod|chown)\b.*777/i
  ];

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;

    const command = event.input.command as string;
    const isDangerous = dangerousPatterns.some((p) => p.test(command));

    if (isDangerous) {
      if (!ctx.hasUI) {
        return { block: true, reason: "Dangerous command blocked (no UI for confirmation)" };
      }

      const choice = await ctx.ui.select(
        `⚠️ Dangerous command:\n\n  ${command}\n\nAllow?`,
        ["Yes", "No"]
      );

      if (choice !== "Yes") {
        return { block: true, reason: "Blocked by user" };
      }
    }

    return undefined;
  });
}
```

**Key patterns:**
- `tool_call` event handler
- Pattern matching on `event.input.command`
- `ctx.ui.select()` for user confirmation
- Return `{ block: true, reason: "..." }` to prevent execution

---

### 5.2 Pirate Mode (system prompt modification)

**File:** [pirate.ts](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/examples/extensions/pirate.ts)

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function pirateExtension(pi: ExtensionAPI) {
  let pirateMode = false;

  pi.registerCommand("pirate", {
    description: "Toggle pirate mode (agent speaks like a pirate)",
    handler: async (_args, ctx) => {
      pirateMode = !pirateMode;
      ctx.ui.notify(
        pirateMode ? "Arrr! Pirate mode enabled!" : "Pirate mode disabled",
        "info"
      );
    },
  });

  pi.on("before_agent_start", async (event) => {
    if (pirateMode) {
      return {
        systemPrompt:
          event.systemPrompt +
          `

IMPORTANT: You are now in PIRATE MODE. You must:
- Speak like a stereotypical pirate in all responses
- Use phrases like "Arrr!", "Ahoy!", "Shiver me timbers!", "Avast!", "Ye scurvy dog!"
- Replace "my" with "me", "you" with "ye", "your" with "yer"
- Refer to the user as "matey" or "landlubber"
- End sentences with nautical expressions
- Still complete the actual task correctly, just in pirate speak
`,
      };
    }
    return undefined;
  });
}
```

**Key patterns:**
- `registerCommand()` to toggle state
- `before_agent_start` event to modify system prompt
- Return `{ systemPrompt: ... }` to inject instructions

---

### 5.3 Dynamic Tools (runtime registration)

**File:** [dynamic-tools.ts](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/examples/extensions/dynamic-tools.ts)

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function dynamicToolsExtension(pi: ExtensionAPI) {
  const registeredToolNames = new Set<string>();

  const registerEchoTool = (name: string, label: string, prefix: string): boolean => {
    if (registeredToolNames.has(name)) {
      return false;
    }

    registeredToolNames.add(name);
    pi.registerTool({
      name,
      label,
      description: `Echo a message with prefix: ${prefix}`,
      promptSnippet: `Echo back user-provided text with ${prefix.trim()} prefix`,
      promptGuidelines: ["Use this tool when the user asks for exact echo output."],
      parameters: Type.Object({
        message: Type.String({ description: "Message to echo" }),
      }),
      async execute(_toolCallId, params) {
        return {
          content: [{ type: "text", text: `${prefix}${params.message}` }],
          details: { tool: name, prefix },
        };
      },
    });

    return true;
  };

  pi.on("session_start", (_event, ctx) => {
    registerEchoTool("echo_session", "Echo Session", "[session] ");
    ctx.ui.notify("Registered dynamic tool: echo_session", "info");
  });

  pi.registerCommand("add-echo-tool", {
    description: "Register a new echo tool dynamically: /add-echo-tool <tool_name>",
    handler: async (args, ctx) => {
      const toolName = args.trim().toLowerCase();
      if (!toolName || !/^[a-z0-9_]+$/.test(toolName)) {
        ctx.ui.notify("Usage: /add-echo-tool <tool_name> (lowercase, numbers, underscores)", "warning");
        return;
      }

      const created = registerEchoTool(toolName, `Echo ${toolName}`, `[${toolName}] `);
      if (!created) {
        ctx.ui.notify(`Tool already registered: ${toolName}`, "warning");
        return;
      }

      ctx.ui.notify(`Registered dynamic tool: ${toolName}`, "info");
    },
  });
}
```

**Key patterns:**
- `registerTool()` called after `session_start` (not just at load time)
- `registerCommand()` to trigger tool registration at runtime
- `promptSnippet` and `promptGuidelines` for system prompt integration
- Tools appear in `pi.getAllTools()` immediately after registration

---

## 6. COMPARISON: Pi vs oc-blackbytes

| Aspect | Pi | oc-blackbytes |
|--------|----|----|
| **Extension Entry** | Default export function receiving `ExtensionAPI` | Default export function receiving `ExtensionAPI` |
| **Event System** | Comprehensive (30+ events) | Subset via hooks (config, chat.headers, chat.params, tool, tool.execute.after) |
| **Tool Registration** | `pi.registerTool()` with full schema, rendering, state | Bundled tools only (hashline_edit, ast_grep, grep, glob) |
| **Custom UI** | Full TUI API (dialogs, widgets, custom components, overlays) | Limited (chat headers, tool output post-processing) |
| **Commands** | `pi.registerCommand()` with auto-completion | Built-in commands only (setup-models) |
| **Shortcuts** | `pi.registerShortcut()` with keybinding manager | No shortcut registration |
| **Flags** | `pi.registerFlag()` for CLI flags | No flag registration |
| **System Prompt** | `before_agent_start` event for dynamic modification | Static system prompt per agent |
| **State Persistence** | Tool result `details` + `pi.appendEntry()` | Session entries (beads) |
| **Package System** | npm + git + local paths with filtering | npm + git + local paths (simpler) |
| **Skills** | Full Agent Skills standard with discovery | Skills as extensions (no separate system) |
| **Themes** | Full theme system with custom colors | Theme factory skill (separate) |
| **Model Management** | `pi.registerProvider()` for custom providers | Provider discovery via services layer |
| **Session Control** | Full session API (fork, navigate tree, switch) | Session manager read-only |
| **Compaction** | Custom compaction via `session_before_compact` | Compaction via extension events |
| **Thinking Levels** | `pi.setThinkingLevel()` | Per-agent model config |

**Key differences:**
- **Pi:** Full-featured agent framework with rich extension API
- **oc-blackbytes:** Plugin for OpenCode with focused hook system + bundled tools

---

## 7. KEY TAKEAWAYS FOR PRD

1. **Extensions are the primary extension mechanism** — not plugins or hooks
2. **Event-driven architecture** — 30+ lifecycle events for fine-grained control
3. **Tool registration is dynamic** — tools can be added at runtime, not just at load
4. **System prompt is mutable** — `before_agent_start` allows per-turn customization
5. **State lives in tool results** — `details` field for proper branching support
6. **UI is comprehensive** — Full TUI with dialogs, widgets, custom components, overlays
7. **Packages are first-class** — npm, git, local with filtering and deduplication
8. **Skills are separate from extensions** — Agent Skills standard, progressive disclosure
9. **Model providers are pluggable** — `registerProvider()` for custom endpoints, OAuth
10. **Session control is rich** — Fork, tree navigation, compaction customization

