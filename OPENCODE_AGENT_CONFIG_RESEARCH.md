# OpenCode Agent Configuration Research

**Repository**: [opencode-ai/opencode](https://github.com/opencode-ai/opencode)  
**Commit**: [73ee493265acf15fcd8caab2bc8cd3bd375b63cb](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb)  
**Date**: April 2026

---

## Overview

OpenCode is a Go-based terminal AI coding agent that defines and configures agents through a **JSON configuration file** (`.opencode.json`). The system supports multiple predefined agents with different roles, each configurable with specific models, token limits, and reasoning parameters.

---

## Agent Definition Architecture

### 1. Agent Types (Predefined)

OpenCode defines **4 built-in agent types** as constants in the config package:

**Source**: [internal/config/config.go](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/internal/config/config.go#L37-L44)

```go
type AgentName string

const (
	AgentCoder      AgentName = "coder"
	AgentSummarizer AgentName = "summarizer"
	AgentTask       AgentName = "task"
	AgentTitle      AgentName = "title"
)
```

**Agent Roles**:
- **`coder`**: Main coding agent with full tool access
- **`task`**: Sub-agent for delegated search/analysis tasks
- **`summarizer`**: Handles conversation summarization
- **`title`**: Generates session titles (always limited to 80 tokens)

---

## Agent Configuration Schema

### 2. Type Definition

**Source**: [internal/config/config.go#L46-L51](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/internal/config/config.go#L46-L51)

```go
// Agent defines configuration for different LLM models and their token limits.
type Agent struct {
	Model           models.ModelID `json:"model"`
	MaxTokens       int64          `json:"maxTokens"`
	ReasoningEffort string         `json:"reasoningEffort"` // For openai models low,medium,high
}
```

### 3. JSON Schema Definition

**Source**: [opencode-schema.json](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/opencode-schema.json#L4-L109)

```json
{
  "definitions": {
    "agent": {
      "description": "Agent configuration",
      "properties": {
        "model": {
          "description": "Model ID for the agent",
          "type": "string",
          "enum": [
            "gpt-4.1",
            "gpt-4o",
            "gpt-4o-mini",
            "claude-3.7-sonnet",
            "claude-3.5-sonnet",
            "claude-3.5-haiku",
            "claude-3-opus",
            "claude-3-haiku",
            "gemini-2.5",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "o1",
            "o1-mini",
            "o1-pro",
            "o3",
            "o3-mini",
            "o4-mini",
            "bedrock.claude-3.7-sonnet",
            "azure.gpt-4.1",
            "azure.gpt-4o",
            "openrouter.claude-3.7-sonnet",
            "copilot.gpt-4o",
            "vertexai.gemini-2.5",
            "vertexai.gemini-2.5-flash"
            // ... and many more
          ]
        },
        "maxTokens": {
          "description": "Maximum tokens for the agent",
          "type": "integer",
          "minimum": 1
        },
        "reasoningEffort": {
          "description": "Reasoning effort for models that support it (OpenAI, Anthropic)",
          "type": "string",
          "enum": ["low", "medium", "high"]
        }
      },
      "required": ["model"],
      "type": "object"
    }
  }
}
```

---

## Configuration File Structure

### 4. Complete Configuration Example

**Source**: [README.md#Configuration File Structure](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/README.md#L140-L204)

```json
{
  "data": {
    "directory": ".opencode"
  },
  "providers": {
    "openai": {
      "apiKey": "your-api-key",
      "disabled": false
    },
    "anthropic": {
      "apiKey": "your-api-key",
      "disabled": false
    },
    "copilot": {
      "disabled": false
    },
    "groq": {
      "apiKey": "your-api-key",
      "disabled": false
    },
    "openrouter": {
      "apiKey": "your-api-key",
      "disabled": false
    }
  },
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
  },
  "shell": {
    "path": "/bin/bash",
    "args": ["-l"]
  },
  "mcpServers": {
    "example": {
      "type": "stdio",
      "command": "path/to/mcp-server",
      "env": [],
      "args": []
    }
  },
  "lsp": {
    "go": {
      "disabled": false,
      "command": "gopls"
    }
  },
  "debug": false,
  "debugLSP": false,
  "autoCompact": true
}
```

---

## Agent Configuration Details

### 5. Model Selection

**Source**: [internal/config/config.go#L253-L387](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/internal/config/config.go#L253-L387)

OpenCode uses a **provider priority order** to set default models:

1. **Copilot** (GitHub Copilot)
2. **Anthropic** (Claude)
3. **OpenAI** (GPT)
4. **Google Gemini**
5. **Groq**
6. **OpenRouter**
7. **AWS Bedrock**
8. **Azure OpenAI**
9. **Google Cloud VertexAI**

**Default Model Assignment**:
```go
// Copilot configuration
if key := viper.GetString("providers.copilot.apiKey"); strings.TrimSpace(key) != "" {
    viper.SetDefault("agents.coder.model", models.CopilotGPT4o)
    viper.SetDefault("agents.summarizer.model", models.CopilotGPT4o)
    viper.SetDefault("agents.task.model", models.CopilotGPT4o)
    viper.SetDefault("agents.title.model", models.CopilotGPT4o)
    return
}

// Anthropic configuration
if key := viper.GetString("providers.anthropic.apiKey"); strings.TrimSpace(key) != "" {
    viper.SetDefault("agents.coder.model", models.Claude4Sonnet)
    viper.SetDefault("agents.summarizer.model", models.Claude4Sonnet)
    viper.SetDefault("agents.task.model", models.Claude4Sonnet)
    viper.SetDefault("agents.title.model", models.Claude4Sonnet)
    return
}
```

### 6. Token Limits

**Source**: [internal/config/config.go#L536-L563](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/internal/config/config.go#L536-L563)

- **Default fallback**: `4096` tokens
- **Model-specific defaults**: Retrieved from `models.SupportedModels[modelID].DefaultMaxTokens`
- **Validation**: Max tokens cannot exceed **50% of model's context window**
- **Title agent override**: Always set to `80` tokens (hardcoded)

```go
// Override the max tokens for title agent
cfg.Agents[AgentTitle] = Agent{
    Model:     cfg.Agents[AgentTitle].Model,
    MaxTokens: 80,
}
```

### 7. Reasoning Effort

**Source**: [internal/config/config.go#L565-L603](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/internal/config/config.go#L565-L603)

- **Supported by**: OpenAI models (o1, o3 families) and Anthropic Claude models
- **Valid values**: `"low"`, `"medium"`, `"high"`
- **Default**: `"medium"` (when model supports reasoning)
- **Validation**: Ignored for models that don't support reasoning

```go
// Validate reasoning effort for models that support reasoning
if model.CanReason && provider == models.ProviderOpenAI || provider == models.ProviderLocal {
    if agent.ReasoningEffort == "" {
        updatedAgent := cfg.Agents[name]
        updatedAgent.ReasoningEffort = "medium"
        cfg.Agents[name] = updatedAgent
    }
}
```

---

## Agent Creation and Initialization

### 8. Agent Service Creation

**Source**: [internal/llm/agent/agent.go#L73-L111](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/internal/llm/agent/agent.go#L73-L111)

```go
type Service interface {
	pubsub.Suscriber[AgentEvent]
	Model() models.Model
	Run(ctx context.Context, sessionID string, content string, attachments ...message.Attachment) (<-chan AgentEvent, error)
	Cancel(sessionID string)
	IsSessionBusy(sessionID string) bool
	IsBusy() bool
	Update(agentName config.AgentName, modelID models.ModelID) (models.Model, error)
	Summarize(ctx context.Context, sessionID string) error
}

func NewAgent(
	agentName config.AgentName,
	sessions session.Service,
	messages message.Service,
	agentTools []tools.BaseTool,
) (Service, error) {
	agentProvider, err := createAgentProvider(agentName)
	if err != nil {
		return nil, err
	}
	// ... initialization
}
```

### 9. Provider Creation from Agent Config

**Source**: [internal/llm/agent/agent.go#L706-L758](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/internal/llm/agent/agent.go#L706-L758)

```go
func createAgentProvider(agentName config.AgentName) (provider.Provider, error) {
	cfg := config.Get()
	agentConfig, ok := cfg.Agents[agentName]
	if !ok {
		return nil, fmt.Errorf("agent %s not found", agentName)
	}
	model, ok := models.SupportedModels[agentConfig.Model]
	if !ok {
		return nil, fmt.Errorf("model %s not supported", agentConfig.Model)
	}

	providerCfg, ok := cfg.Providers[model.Provider]
	if !ok {
		return nil, fmt.Errorf("provider %s not supported", model.Provider)
	}

	maxTokens := model.DefaultMaxTokens
	if agentConfig.MaxTokens > 0 {
		maxTokens = agentConfig.MaxTokens
	}

	opts := []provider.ProviderClientOption{
		provider.WithAPIKey(providerCfg.APIKey),
		provider.WithModel(model),
		provider.WithSystemMessage(prompt.GetAgentPrompt(agentName, model.Provider)),
		provider.WithMaxTokens(maxTokens),
	}

	// Add reasoning effort for models that support it
	if model.Provider == models.ProviderOpenAI && model.CanReason {
		opts = append(opts,
			provider.WithOpenAIOptions(
				provider.WithReasoningEffort(agentConfig.ReasoningEffort),
			),
		)
	} else if model.Provider == models.ProviderAnthropic && model.CanReason && agentName == config.AgentCoder {
		opts = append(opts,
			provider.WithAnthropicOptions(
				provider.WithAnthropicShouldThinkFn(provider.DefaultShouldThinkFn),
			),
		)
	}

	agentProvider, err := provider.NewProvider(model.Provider, opts...)
	if err != nil {
		return nil, fmt.Errorf("could not create provider: %v", err)
	}

	return agentProvider, nil
}
```

---

## Configuration Loading and Validation

### 10. Configuration Loading Flow

**Source**: [internal/config/config.go#L128-L216](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/internal/config/config.go#L128-L216)

```go
func Load(workingDir string, debug bool) (*Config, error) {
	cfg = &Config{
		WorkingDir: workingDir,
		MCPServers: make(map[string]MCPServer),
		Providers:  make(map[models.ModelProvider]Provider),
		LSP:        make(map[string]LSPConfig),
	}

	configureViper()
	setDefaults(debug)

	// Read global config
	if err := readConfig(viper.ReadInConfig()); err != nil {
		return cfg, err
	}

	// Load and merge local config
	mergeLocalConfig(workingDir)

	setProviderDefaults()

	// Apply configuration to the struct
	if err := viper.Unmarshal(cfg); err != nil {
		return cfg, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	applyDefaultValues()

	// Validate configuration
	if err := Validate(); err != nil {
		return cfg, fmt.Errorf("config validation failed: %w", err)
	}

	// Override the max tokens for title agent
	cfg.Agents[AgentTitle] = Agent{
		Model:     cfg.Agents[AgentTitle].Model,
		MaxTokens: 80,
	}
	return cfg, nil
}
```

### 11. Configuration Validation

**Source**: [internal/config/config.go#L608-L641](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/internal/config/config.go#L608-L641)

```go
func Validate() error {
	if cfg == nil {
		return fmt.Errorf("config not loaded")
	}

	// Validate agent models
	for name, agent := range cfg.Agents {
		if err := validateAgent(cfg, name, agent); err != nil {
			return err
		}
	}

	// Validate providers
	for provider, providerCfg := range cfg.Providers {
		if providerCfg.APIKey == "" && !providerCfg.Disabled {
			logging.Warn("provider has no API key, marking as disabled", "provider", provider)
			providerCfg.Disabled = true
			cfg.Providers[provider] = providerCfg
		}
	}

	// Validate LSP configurations
	for language, lspConfig := range cfg.LSP {
		if lspConfig.Command == "" && !lspConfig.Disabled {
			logging.Warn("LSP configuration has no command, marking as disabled", "language", language)
			lspConfig.Disabled = true
			cfg.LSP[language] = lspConfig
		}
	}

	return nil
}
```

---

## Configuration File Locations

**Source**: [README.md#Configuration](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/README.md#L76-L82)

OpenCode searches for configuration in this order:

1. `$HOME/.opencode.json`
2. `$XDG_CONFIG_HOME/opencode/.opencode.json`
3. `./.opencode.json` (local directory)

**Viper Configuration**:
```go
viper.SetConfigName(".opencode")
viper.SetConfigType("json")
viper.AddConfigPath("$HOME")
viper.AddConfigPath(fmt.Sprintf("$XDG_CONFIG_HOME/%s", appName))
viper.AddConfigPath(fmt.Sprintf("$HOME/.config/%s", appName))
```

---

## Supported Models

### 12. Model Registry

**Source**: [internal/llm/models/models.go](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/internal/llm/models/models.go)

```go
type Model struct {
	ID                  ModelID       `json:"id"`
	Name                string        `json:"name"`
	Provider            ModelProvider `json:"provider"`
	APIModel            string        `json:"api_model"`
	CostPer1MIn         float64       `json:"cost_per_1m_in"`
	CostPer1MOut        float64       `json:"cost_per_1m_out"`
	CostPer1MInCached   float64       `json:"cost_per_1m_in_cached"`
	CostPer1MOutCached  float64       `json:"cost_per_1m_out_cached"`
	ContextWindow       int64         `json:"context_window"`
	DefaultMaxTokens    int64         `json:"default_max_tokens"`
	CanReason           bool          `json:"can_reason"`
	SupportsAttachments bool          `json:"supports_attachments"`
}
```

**Supported Providers**:
- OpenAI (gpt-4.1, gpt-4o, o1, o3 families)
- Anthropic (Claude 3.x, 4.x families)
- Google Gemini (2.0, 2.5 families)
- GitHub Copilot
- Groq (Llama, QWEN models)
- OpenRouter
- AWS Bedrock
- Azure OpenAI
- Google Cloud VertexAI

---

## Key Features

### 13. Agent Capabilities

1. **Tool Access**: Agents have access to tools like:
   - File operations (View, Glob, Grep)
   - Bash execution
   - LSP integration
   - MCP servers

2. **Session Management**: Each agent maintains:
   - Session ID
   - Message history
   - Token usage tracking
   - Cost calculation

3. **Dynamic Model Switching**:
   ```go
   func (a *agent) Update(agentName config.AgentName, modelID models.ModelID) (models.Model, error) {
       if a.IsBusy() {
           return models.Model{}, fmt.Errorf("cannot change model while processing requests")
       }
       if err := config.UpdateAgentModel(agentName, modelID); err != nil {
           return models.Model{}, fmt.Errorf("failed to update config: %w", err)
       }
       // ... recreate provider
   }
   ```

4. **Conversation Summarization**: Automatic summarization when approaching context limits

---

## Minimal Configuration Example

```json
{
  "agents": {
    "coder": {
      "model": "claude-3.7-sonnet",
      "maxTokens": 5000
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

**Note**: Provider API keys are loaded from environment variables by default.

---

## Comparison with Pi-Blackbytes

OpenCode's agent configuration differs from Pi-Blackbytes in several ways:

| Aspect | OpenCode | Pi-Blackbytes |
|--------|----------|---------------|
| **Agent Definition** | Predefined (coder, task, title, summarizer) | Dynamic sub-agents (explore, oracle, librarian, general) |
| **Configuration** | JSON file (`.opencode.json`) | JSON file (`~/.pi/agent/settings.json`) |
| **Model Selection** | Per-agent model assignment | Per-sub-agent model assignment |
| **Tool Access** | Built-in tools (file, bash, LSP) | Delegated tool access via MCP |
| **Reasoning Support** | Explicit `reasoningEffort` field | Implicit in model selection |
| **Token Limits** | Per-agent `maxTokens` | Per-sub-agent configuration |

---

## References

- **OpenCode Repository**: https://github.com/opencode-ai/opencode
- **Configuration Schema**: https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/opencode-schema.json
- **Config Package**: https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/internal/config/config.go
- **Agent Package**: https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/internal/llm/agent/agent.go
- **Models Package**: https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/internal/llm/models/models.go
