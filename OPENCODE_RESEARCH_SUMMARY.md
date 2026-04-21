# OpenCode Agent Configuration - Executive Summary

## Quick Reference

### Agent Configuration Structure (Go Type)
```go
type Agent struct {
	Model           models.ModelID `json:"model"`           // Required: Model ID (e.g., "claude-3.7-sonnet")
	MaxTokens       int64          `json:"maxTokens"`       // Optional: Max output tokens (default: model-specific)
	ReasoningEffort string         `json:"reasoningEffort"` // Optional: "low", "medium", "high" (for reasoning models)
}
```

### JSON Configuration Example
```json
{
  "agents": {
    "coder": {
      "model": "claude-3.7-sonnet",
      "maxTokens": 5000,
      "reasoningEffort": "medium"
    },
    "task": {
      "model": "claude-3.7-sonnet",
      "maxTokens": 5000
    },
    "title": {
      "model": "claude-3.7-sonnet",
      "maxTokens": 80
    }
  }
}
```

---

## Key Findings

### 1. **Predefined Agent Types** (Not User-Extensible)
OpenCode uses **4 hardcoded agent types**:
- `coder` - Main agent with full tool access
- `task` - Sub-agent for delegated tasks
- `summarizer` - Conversation summarization
- `title` - Session title generation (always 80 tokens)

**Implication**: Users cannot define custom agents; only configure existing ones.

### 2. **Minimal Required Configuration**
Only **one field is required**: `model`

```json
{
  "agents": {
    "coder": { "model": "claude-3.7-sonnet" }
  }
}
```

All other fields have intelligent defaults:
- `maxTokens`: Derived from model's `DefaultMaxTokens` (validated against context window)
- `reasoningEffort`: Auto-set to "medium" for reasoning-capable models

### 3. **Model Selection Strategy**
OpenCode uses **provider priority ordering** to auto-select models:

1. GitHub Copilot (if token available)
2. Anthropic Claude (if API key available)
3. OpenAI GPT (if API key available)
4. Google Gemini
5. Groq
6. OpenRouter
7. AWS Bedrock
8. Azure OpenAI
9. Google Cloud VertexAI

**Implication**: If multiple providers are configured, Copilot takes precedence.

### 4. **Token Limit Validation**
- **Minimum**: 1 token
- **Maximum**: 50% of model's context window
- **Default**: Model-specific (e.g., 4096 fallback)
- **Title agent**: Always hardcoded to 80 tokens

### 5. **Reasoning Effort Support**
- **Supported by**: OpenAI (o1, o3 families) and Anthropic Claude
- **Valid values**: `"low"`, `"medium"`, `"high"`
- **Default**: `"medium"` (auto-set if model supports reasoning)
- **Ignored**: For models that don't support reasoning

### 6. **Configuration File Locations** (Searched in Order)
1. `$HOME/.opencode.json`
2. `$XDG_CONFIG_HOME/opencode/.opencode.json`
3. `./.opencode.json` (local directory)

### 7. **Provider Configuration**
```json
{
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-...",
      "disabled": false
    },
    "openai": {
      "apiKey": "sk-...",
      "disabled": false
    }
  }
}
```

**Note**: API keys can also be set via environment variables (takes precedence):
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`
- `GITHUB_TOKEN` (for Copilot)

---

## Supported Models (Sample)

### OpenAI
- gpt-4.1, gpt-4.1-mini, gpt-4.1-nano
- gpt-4o, gpt-4o-mini
- gpt-4.5-preview
- o1, o1-mini, o1-pro
- o3, o3-mini, o4-mini

### Anthropic
- claude-4-sonnet, claude-4-opus
- claude-3.7-sonnet, claude-3.5-sonnet, claude-3.5-haiku
- claude-3-opus, claude-3-haiku

### Google
- gemini-2.5, gemini-2.5-flash
- gemini-2.0-flash, gemini-2.0-flash-lite

### Others
- AWS Bedrock: `bedrock.claude-3.7-sonnet`
- Azure: `azure.gpt-4.1`, `azure.gpt-4o`
- OpenRouter: `openrouter.claude-3.7-sonnet`
- GitHub Copilot: `copilot.gpt-4o`
- VertexAI: `vertexai.gemini-2.5`

---

## Configuration Loading Flow

```
1. Load defaults (debug mode, shell, etc.)
2. Read global config file (~/.opencode.json)
3. Merge local config (./.opencode.json)
4. Load provider API keys from environment variables
5. Set default models based on available providers
6. Unmarshal JSON into Config struct
7. Validate all agents, providers, LSP configs
8. Override title agent maxTokens to 80
9. Return validated config
```

---

## Agent Initialization

When an agent is created:

```go
func createAgentProvider(agentName config.AgentName) (provider.Provider, error) {
    // 1. Get agent config from cfg.Agents[agentName]
    // 2. Look up model in models.SupportedModels[agentConfig.Model]
    // 3. Get provider config from cfg.Providers[model.Provider]
    // 4. Create provider with:
    //    - API key
    //    - Model info
    //    - System prompt (agent-specific)
    //    - Max tokens
    //    - Reasoning effort (if supported)
    // 5. Return initialized provider
}
```

---

## Validation Rules

### Agent Validation
- ✅ Model must exist in `SupportedModels`
- ✅ Provider for model must be configured
- ✅ Provider must have API key (or be disabled)
- ✅ MaxTokens must be > 0 and ≤ 50% of context window
- ✅ ReasoningEffort must be "low", "medium", or "high" (if model supports reasoning)

### Provider Validation
- ✅ If no API key and not disabled → mark as disabled with warning
- ✅ Disabled providers are skipped

### LSP Validation
- ✅ If no command and not disabled → mark as disabled with warning

---

## Comparison: OpenCode vs Pi-Blackbytes

| Feature | OpenCode | Pi-Blackbytes |
|---------|----------|---------------|
| **Agent Definition** | Predefined (4 types) | Dynamic (explore, oracle, librarian, general) |
| **Config Format** | JSON (`.opencode.json`) | JSON (`~/.pi/agent/settings.json`) |
| **Agent Extensibility** | ❌ No custom agents | ✅ Custom sub-agents via delegation |
| **Model per Agent** | ✅ Yes | ✅ Yes |
| **Reasoning Support** | ✅ Explicit `reasoningEffort` | ✅ Implicit in model |
| **Token Limits** | ✅ Per-agent `maxTokens` | ✅ Per-sub-agent |
| **Tool Access** | Built-in (file, bash, LSP) | Delegated via MCP |
| **Provider Priority** | ✅ Ordered (Copilot → Claude → GPT) | ✅ Configurable |

---

## Design Patterns

### 1. **Configuration as Code**
- JSON schema validates all configurations
- Type-safe Go structs ensure correctness
- Viper library handles multi-source config merging

### 2. **Provider Abstraction**
- Each provider implements `provider.Provider` interface
- Agent doesn't know provider details
- Easy to add new providers

### 3. **Lazy Initialization**
- Agents created on-demand
- Providers initialized when agent is created
- Config validation happens at load time

### 4. **Graceful Degradation**
- Missing API keys → provider disabled (warning logged)
- Unsupported model → fallback to default (warning logged)
- Invalid reasoning effort → set to "medium" (warning logged)

---

## Files to Reference

| File | Purpose |
|------|---------|
| `internal/config/config.go` | Config struct, loading, validation |
| `internal/llm/agent/agent.go` | Agent service, provider creation |
| `internal/llm/models/models.go` | Model registry, metadata |
| `opencode-schema.json` | JSON schema for validation |
| `README.md` | Configuration examples, setup |

---

## Key Takeaways for Pi-Blackbytes

1. **Predefined agents are simpler** than dynamic sub-agents but less flexible
2. **JSON configuration is straightforward** - easy to validate and document
3. **Provider priority ordering** is a good pattern for auto-selection
4. **Reasoning effort as explicit field** is clearer than implicit model selection
5. **Token limit validation** (max 50% of context window) prevents issues
6. **Graceful degradation** with warnings is better than hard failures

