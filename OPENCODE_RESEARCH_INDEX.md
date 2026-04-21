# OpenCode Agent Configuration Research - Complete Index

**Research Date**: April 20, 2026  
**Repository**: [opencode-ai/opencode](https://github.com/opencode-ai/opencode)  
**Commit**: [73ee493265acf15fcd8caab2bc8cd3bd375b63cb](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb)

---

## 📚 Research Documents

This research package contains **3 comprehensive documents** analyzing how OpenCode defines and configures agents:

### 1. **OPENCODE_RESEARCH_SUMMARY.md** (Executive Summary)
**Size**: 7.4 KB | **Sections**: 15  
**Best for**: Quick reference, key findings, design patterns

**Contents**:
- Quick reference schema
- 7 key findings
- Supported models list
- Configuration loading flow
- Validation rules
- Comparison with Pi-Blackbytes
- Design patterns
- Key takeaways

**Start here** if you want a high-level overview.

---

### 2. **OPENCODE_AGENT_CONFIG_RESEARCH.md** (Comprehensive Analysis)
**Size**: 17 KB | **Sections**: 13  
**Best for**: Deep understanding, complete reference

**Contents**:
- Overview of OpenCode architecture
- Agent types (predefined)
- Configuration schema (Go type + JSON)
- Complete configuration file structure
- Agent configuration details (model selection, token limits, reasoning effort)
- Agent creation and initialization
- Configuration loading and validation
- Configuration file locations
- Supported models registry
- Key features and capabilities
- Minimal configuration example
- Comparison with Pi-Blackbytes
- References

**Read this** for complete understanding of the system.

---

### 3. **OPENCODE_CODE_REFERENCES.md** (Code Permalinks)
**Size**: 17 KB | **Sections**: 14  
**Best for**: Implementation reference, exact code locations

**Contents**:
- 14 key code sections with:
  - File path
  - Line numbers
  - GitHub permalink
  - Full code snippet

**Sections covered**:
1. Agent type definitions
2. Agent configuration struct
3. Main config struct
4. Configuration loading
5. Viper configuration setup
6. Provider default selection
7. Agent validation
8. Agent service interface
9. Agent creation
10. Provider creation from agent config
11. Model struct definition
12. JSON schema definition
13. Configuration example in README
14. Configuration validation

**Use this** when you need exact code locations and permalinks.

---

## 🎯 Quick Navigation

### By Use Case

**I want to understand the overall architecture**
→ Read: OPENCODE_RESEARCH_SUMMARY.md (sections 1-3)

**I need to implement agent configuration in Pi-Blackbytes**
→ Read: OPENCODE_AGENT_CONFIG_RESEARCH.md (sections 2-7)

**I need to find specific code**
→ Use: OPENCODE_CODE_REFERENCES.md (search by section number)

**I want to compare with Pi-Blackbytes**
→ Read: OPENCODE_RESEARCH_SUMMARY.md (Comparison table)

**I need validation rules**
→ Read: OPENCODE_RESEARCH_SUMMARY.md (Validation Rules section)

---

## 📋 Key Findings Summary

### Agent Configuration Structure
```go
type Agent struct {
	Model           models.ModelID `json:"model"`           // Required
	MaxTokens       int64          `json:"maxTokens"`       // Optional
	ReasoningEffort string         `json:"reasoningEffort"` // Optional
}
```

### Predefined Agent Types
- `coder` - Main agent with full tool access
- `task` - Sub-agent for delegated tasks
- `summarizer` - Conversation summarization
- `title` - Session title generation (always 80 tokens)

### Configuration File Locations
1. `$HOME/.opencode.json`
2. `$XDG_CONFIG_HOME/opencode/.opencode.json`
3. `./.opencode.json` (local directory)

### Provider Priority Order
1. GitHub Copilot
2. Anthropic Claude
3. OpenAI GPT
4. Google Gemini
5. Groq
6. OpenRouter
7. AWS Bedrock
8. Azure OpenAI
9. Google Cloud VertexAI

### Token Limit Validation
- **Minimum**: 1 token
- **Maximum**: 50% of model's context window
- **Default**: Model-specific (4096 fallback)
- **Title agent**: Always 80 tokens

### Reasoning Effort Support
- **Supported by**: OpenAI (o1, o3) and Anthropic Claude
- **Valid values**: "low", "medium", "high"
- **Default**: "medium" (auto-set if model supports reasoning)

---

## 🔗 Direct Links to Source Code

### Configuration Package
- [internal/config/config.go](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/internal/config/config.go) - 980 lines
  - Agent struct (lines 46-51)
  - Config struct (lines 83-97)
  - Load function (lines 128-216)
  - Validation (lines 474-606, 608-641)

### Agent Package
- [internal/llm/agent/agent.go](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/internal/llm/agent/agent.go) - 758 lines
  - Service interface (lines 48-57)
  - NewAgent function (lines 73-111)
  - createAgentProvider function (lines 706-758)

### Models Package
- [internal/llm/models/models.go](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/internal/llm/models/models.go) - 98 lines
  - Model struct (lines 10-23)
  - SupportedModels registry

### Schema & Documentation
- [opencode-schema.json](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/opencode-schema.json) - 425 lines
- [README.md](https://github.com/opencode-ai/opencode/blob/73ee493265acf15fcd8caab2bc8cd3bd375b63cb/README.md) - 700 lines

---

## 📊 Comparison: OpenCode vs Pi-Blackbytes

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

## 🎓 Design Patterns to Learn

### 1. Configuration as Code
- JSON schema validates all configurations
- Type-safe Go structs ensure correctness
- Viper library handles multi-source config merging

### 2. Provider Abstraction
- Each provider implements `provider.Provider` interface
- Agent doesn't know provider details
- Easy to add new providers

### 3. Lazy Initialization
- Agents created on-demand
- Providers initialized when agent is created
- Config validation happens at load time

### 4. Graceful Degradation
- Missing API keys → provider disabled (warning logged)
- Unsupported model → fallback to default (warning logged)
- Invalid reasoning effort → set to "medium" (warning logged)

---

## 📝 Configuration Examples

### Minimal Configuration
```json
{
  "agents": {
    "coder": { "model": "claude-3.7-sonnet" }
  }
}
```

### Full Configuration
```json
{
  "data": { "directory": ".opencode" },
  "providers": {
    "anthropic": { "apiKey": "sk-ant-...", "disabled": false },
    "openai": { "apiKey": "sk-...", "disabled": false }
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
  "shell": { "path": "/bin/bash", "args": ["-l"] },
  "debug": false,
  "autoCompact": true
}
```

---

## 🔍 Validation Rules

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

## 🚀 Key Takeaways for Pi-Blackbytes

1. **Predefined agents are simpler** than dynamic sub-agents but less flexible
2. **JSON configuration is straightforward** - easy to validate and document
3. **Provider priority ordering** is a good pattern for auto-selection
4. **Reasoning effort as explicit field** is clearer than implicit model selection
5. **Token limit validation** (max 50% of context window) prevents issues
6. **Graceful degradation** with warnings is better than hard failures
7. **Lazy initialization** reduces startup time and complexity
8. **Type-safe structs** with JSON tags ensure correctness

---

## 📞 Questions to Answer

**Q: Can users define custom agents in OpenCode?**  
A: No, only 4 predefined agents (coder, task, summarizer, title) can be configured.

**Q: What's the minimum required configuration?**  
A: Just `agents.coder.model` - everything else has intelligent defaults.

**Q: How does OpenCode choose which model to use?**  
A: Provider priority order (Copilot → Claude → GPT → Gemini → ...) based on available API keys.

**Q: What happens if I set invalid token limits?**  
A: OpenCode validates and adjusts automatically (max 50% of context window).

**Q: Can I use different models for different agents?**  
A: Yes, each agent (coder, task, summarizer, title) can have its own model.

**Q: How are API keys loaded?**  
A: From config file first, then environment variables (env vars take precedence).

---

## 📚 Additional Resources

- **OpenCode Official Site**: https://opencode.ai/
- **OpenCode GitHub**: https://github.com/opencode-ai/opencode
- **OpenCode Documentation**: https://open-code.ai/docs
- **Viper Config Library**: https://github.com/spf13/viper
- **JSON Schema Spec**: https://json-schema.org/

---

## 📄 Document Statistics

| Document | Size | Lines | Sections |
|----------|------|-------|----------|
| OPENCODE_RESEARCH_SUMMARY.md | 7.4 KB | 262 | 15 |
| OPENCODE_AGENT_CONFIG_RESEARCH.md | 17 KB | 586 | 13 |
| OPENCODE_CODE_REFERENCES.md | 17 KB | 560 | 14 |
| **Total** | **41.4 KB** | **1,408** | **42** |

---

## 🎯 Next Steps

1. **Review** OPENCODE_RESEARCH_SUMMARY.md for overview
2. **Study** OPENCODE_AGENT_CONFIG_RESEARCH.md for details
3. **Reference** OPENCODE_CODE_REFERENCES.md for implementation
4. **Compare** with Pi-Blackbytes architecture
5. **Design** similar patterns for Pi-Blackbytes if applicable

---

**Research completed**: April 20, 2026  
**Repository state**: Latest commit 73ee493265acf15fcd8caab2bc8cd3bd375b63cb  
**Status**: ✅ Complete and verified

