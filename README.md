# Auto AI Model Selection Skill

**Automatically select and route to the best AI model based on task complexity.**

Originally ported from OpenClobo and Hermes Agent model-switching logic.

## Quick Start

```bash
git clone https://github.com/repontage/auto-ai-model-selection-skill.git
cd auto-ai-model-selection-skill
# No dependencies needed — requires Node.js v22+
```

### Node.js API

```js
import { ModelRouter } from "./index.js";

const router = new ModelRouter({
  preferredProviders: ["openai"],
  costMode: "balanced",
});

// Auto-classify task → pick model → send request
const result = await router.send("Write a Python function to parse CSV files");
console.log(result.content);
console.log(result.model);           // e.g. "gpt-4o"
console.log(result.classification.tier);      // "balanced"
console.log(result.fallbacks);       // 0 = succeeded on first try
```

### CLI

```bash
node cli.js "Explain quantum computing"                # auto-classify + send
node cli.js --tier powerful "Design a microservice"    # force tier
node cli.js --provider ollama "Write bash script"      # specify provider
node cli.js --budget "Summarize this article"          # prefer cheaper models
node cli.js --stream "Tell me a story"                # streaming output
node cli.js --list                                      # list all models
node cli.js --classify "Debug race condition"           # classify only
```

### Streaming API

```js
const stream = await router.stream("Tell me a long story");
console.log(`Model: ${stream.model.id} (${stream.classification.tier})`);
for await (const chunk of stream) process.stdout.write(chunk);
```

### Batch Processing

```js
const results = await router.batch([
     { prompt: "What is 2+2?" },
     { prompt: "Design a distributed cache system" },
     { prompt: "Summarize this article", contextTokens: 15000 },
]);
results.forEach(r => console.log(`${r.model} → ${r.classification.tier}: ${r.content.slice(0, 80)}`));
```

## Environment Variables

| Variable | Provider | Required? |
|----------|----------|-----------|
| `OPENAI_API_KEY` | OpenAI (GPT-4o, O3, O4) | ✅ If using OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic (Claude) | ✅ If using Anthropic |
| `GROQ_API_KEY` | Groq (Llama series) | ✅ If using Groq |
| `OPENROUTER_API_KEY` | OpenRouter (aggregator) | ✅ If using OpenRouter |
| *(none)* | Ollama (local) | ❌ Runs locally |

```bash
export OPENAI_API_KEY="sk-proj-..."
# or
cp .env.example .env
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `preferredProviders` | `undefined` | Provider priority array, e.g. `["openai", "anthropic"]` |
| `costMode` | `"balanced"` | `"budget"` / `"balanced"` / `"unlimited"` — cost priority for model selection |
| `forceTier` | `undefined` | `"fast"` / `"balanced"` / `"powerful"` — override auto-classification |
| `maxRetries` | `2` | Max retries per model before falling back |
| `maxTokens` | `undefined` | Max output tokens |
| `timeoutMs` | `60000` | Request timeout (ms) |
| `temperature` | `0.7` | Creativity (0.0 – 1.0) |
| `excludeModels` | `[]` | Model IDs to never use |

## Model Registry

| Tier | Model | Provider | Context | Cost (input/1M) | Capabilities |
|------|-------|----------|---------|-----------------|--------------|
| **fast** | `gpt-4o-mini` | OpenAI | 128k | $0.15 | coding, functionCalling |
|   | `claude-haiku` | Anthropic | 200k | $0.80 | coding, functionCalling |
|   | `groq-llama-3.3-70b` | Groq | 128k | $0.59 | coding, functionCalling |
|   | `groq-llama-4-scout` | Groq | 128k | $0.20 | coding |
|   | `ollama-qwen3.6-30b` | Ollama | 32k | free | coding |
| **balanced** | `gpt-4o` | OpenAI | 128k | $2.50 | reasoning, coding, longContext, vision, functionCalling |
|   | `claude-sonnet` | Anthropic | 200k | $3.00 | reasoning, coding, longContext, vision, functionCalling |
|   | `groq-llama-4-maverick` | Groq | 128k | $0.60 | reasoning, coding |
|   | `openrouter-qwen3-coder` | OpenRouter | 128k | free | coding |
|   | `ollama-llama3.3-70b` | Ollama | 128k | free | reasoning, coding |
|   | `ollama-command-r-plus` | Ollama | 128k | free | reasoning, coding, longContext |
| **powerful** | `o4-mini` | OpenAI | 200k | $1.10 | reasoning, coding, longContext, vision, functionCalling |
|   | `claude-opus` | Anthropic | 200k | $15.00 | reasoning, coding, longContext, vision, functionCalling |
|   | `o3-mini` | OpenAI | 200k | $1.10 | reasoning, coding, longContext |
|   | `openrouter-deepseek-r1` | OpenRouter | 128k | free | reasoning, coding |

## Auto-Classification Rules

| Tier | Use Cases | Examples |
|------|-----------|----------|
| **fast** | Simple Q&A, formatting, short code snippets, greetings | "What's the capital of France?", "capitalize this string" |
| **balanced** | Medium coding, analysis, translation, summarization, explanation | "Write a Python function", "Summarize this article" |
| **powerful** | Deep reasoning, complex architecture, math, research, debugging | "Design a distributed system", "Debug a race condition" |

The classifier detects these keyword signals:

- **Powerful**: `reason`, `architecture`, `microservice`, `debug race condition`, `500-line`, `optimize performance`
- **Balanced**: `write`, `implement`, `summarize`, `function`, `css`, `debug`
- **Fast**: `hello`, `what's`, `capitalize`, `quick`, `simple`

Context tokens ≤ 10k → `fast`, > 50k → auto-promote to `powerful`.

## Fallback Chains

When the preferred model fails, the router automatically tries the next model in the same tier:

- **fast**: `gpt-4o-mini` → `claude-haiku` → `groq-llama-4-scout` → `ollama-qwen3.6-30b`
- **balanced**: `gpt-4o` → `claude-sonnet` → `groq-llama-4-maverick` → `ollama-llama3.3-70b`
- **powerful**: `o4-mini` → `claude-opus` → `o3-mini` → `openrouter-deepseek-r1`

## Advanced Usage

### Adding Custom Models

```js
import { MODEL_REGISTRY } from "./config.js";

MODEL_REGISTRY.push({
   id: "my-custom-model",
   tier: "balanced",
   provider: "openrouter",
   apiId: "your-vendor/your-model",
   contextWindow: 128_000,
   costPer1MTokens: { input: 0.50, output: 1.00 },
   capabilities: ["coding", "reasoning"],
});
```

### Classification Only (No Request Sent)

```js
import { ModelRouter } from "./index.js";

const classification = ModelRouter.classify("Design a microservice for e-commerce");
console.log(classification);
// { tier: "powerful", complexity: 7.5, category: "architecture", needsCapabilities: [] }
```

### Provider-Conditional Routing

```js
// Prefer local Ollama first, fall back to OpenAI
const localFirst = new ModelRouter({
   preferredProviders: ["ollama", "openai"],
   costMode: "budget",
});
```

## Project Structure

```
├── config.js              Model registry, provider config, fallback chains
├── classifier.js          Task auto-classifier
├── router.js              API router (retry + fallback + streaming)
├── index.js               ModelRouter class (main API)
├── cli.js                 Command-line tool
├── test.js                Test suite (41 tests)
├── package.json
├── .gitignore
├── .env.example
└── README.md
```

## Testing

```bash
node test.js
```

41 tests covering model registry, classifier, model picker, fallback chains, and API surface.

## License

Apache 2.0 — [LICENSE](LICENSE)
