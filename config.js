/**
 * Configuration: model tiers, provider settings, and fallback chains.
 *
 * Three performance tiers:
 *   - fast    → small, sub-second local or cheap cloud models
 *   - balanced → mid-size general-purpose models
 *   - powerful → large, reasoning-heavy models
 *
 * Each model entry carries:
 *   - id:      provider-agnostic identifier
 *   - tier:    fast | balanced | powerful
 *   - provider: openai | anthropic | openrouter | ollama | together | groq
 *   - apiId:   the actual model name sent to the API
 *   - contextWindow: max context tokens
 *   - costPer1MTokens: { input, output } in USD
 *   - capabilities: reasoning, coding, longContext, vision, functionCalling
 */

export const MODEL_REGISTRY = [
  // ── OpenAI ─────────────────────────────────────────────
  {
    id: "gpt-4o-mini",
    tier: "fast",
    provider: "openai",
    apiId: "gpt-4o-mini",
    contextWindow: 128_000,
    costPer1MTokens: { input: 0.15, output: 0.60 },
    capabilities: ["coding", "functionCalling"],
  },
  {
    id: "gpt-4o",
    tier: "balanced",
    provider: "openai",
    apiId: "gpt-4o",
    contextWindow: 128_000,
    costPer1MTokens: { input: 2.50, output: 10.00 },
    capabilities: ["reasoning", "coding", "longContext", "vision", "functionCalling"],
  },
  {
    id: "o3-mini",
    tier: "powerful",
    provider: "openai",
    apiId: "o3-mini",
    contextWindow: 200_000,
    costPer1MTokens: { input: 1.10, output: 4.40 },
    capabilities: ["reasoning", "coding", "longContext"],
  },
  {
    id: "o4-mini",
    tier: "powerful",
    provider: "openai",
    apiId: "o4-mini",
    contextWindow: 200_000,
    costPer1MTokens: { input: 1.10, output: 4.40 },
    capabilities: ["reasoning", "coding", "longContext", "vision", "functionCalling"],
  },

  // ── Anthropic ────────────────────────────────────────────
  {
    id: "claude-haiku",
    tier: "fast",
    provider: "anthropic",
    apiId: "claude-haiku-2-20240813",
    contextWindow: 200_000,
    costPer1MTokens: { input: 0.80, output: 4.00 },
    capabilities: ["coding", "functionCalling"],
  },
  {
    id: "claude-sonnet",
    tier: "balanced",
    provider: "anthropic",
    apiId: "claude-sonnet-4-20250514",
    contextWindow: 200_000,
    costPer1MTokens: { input: 3.00, output: 15.00 },
    capabilities: ["reasoning", "coding", "longContext", "vision", "functionCalling"],
  },
  {
    id: "claude-opus",
    tier: "powerful",
    provider: "anthropic",
    apiId: "claude-opus-4-20250514",
    contextWindow: 200_000,
    costPer1MTokens: { input: 15.00, output: 75.00 },
    capabilities: ["reasoning", "coding", "longContext", "vision", "functionCalling"],
  },

  // ── Groq (ultra-fast inference) ─────────────────────────
  {
    id: "groq-llama-3.3-70b",
    tier: "fast",
    provider: "groq",
    apiId: "llama-3.3-70b-versatile",
    contextWindow: 128_000,
    costPer1MTokens: { input: 0.59, output: 0.79 },
    capabilities: ["coding", "functionCalling"],
  },
  {
    id: "groq-llama-4-maverick",
    tier: "balanced",
    provider: "groq",
    apiId: "meta-llama/llama-4-maverick",
    contextWindow: 128_000,
    costPer1MTokens: { input: 0.60, output: 0.60 },
    capabilities: ["reasoning", "coding"],
  },
  {
    id: "groq-llama-4-scout",
    tier: "fast",
    provider: "groq",
    apiId: "meta-llama/llama-4-scout",
    contextWindow: 128_000,
    costPer1MTokens: { input: 0.20, output: 0.30 },
    capabilities: ["coding"],
  },

  // ── OpenRouter (aggregator — many models) ────────────────
  {
    id: "openrouter-qwen3-coder",
    tier: "balanced",
    provider: "openrouter",
    apiId: "qwen/qwen3-coder:free",
    contextWindow: 128_000,
    costPer1MTokens: { input: 0, output: 0 },
    capabilities: ["coding"],
  },
  {
    id: "openrouter-deepseek-r1",
    tier: "powerful",
    provider: "openrouter",
    apiId: "deepseek/deepseek-r1:free",
    contextWindow: 128_000,
    costPer1MTokens: { input: 0, output: 0 },
    capabilities: ["reasoning", "coding"],
  },

  // ── Ollama (local) ───────────────────────────────────────
  {
    id: "ollama-qwen3.6-30b",
    tier: "fast",
    provider: "ollama",
    apiId: "qwen3.6:30b",
    contextWindow: 32_000,
    costPer1MTokens: { input: 0, output: 0 },
    capabilities: ["coding"],
  },
  {
    id: "ollama-llama3.3-70b",
    tier: "balanced",
    provider: "ollama",
    apiId: "llama3.3:70b",
    contextWindow: 128_000,
    costPer1MTokens: { input: 0, output: 0 },
    capabilities: ["reasoning", "coding"],
  },
  {
    id: "ollama-command-r-plus",
    tier: "balanced",
    provider: "ollama",
    apiId: "command-r-plus",
    contextWindow: 128_000,
    costPer1MTokens: { input: 0, output: 0 },
    capabilities: ["reasoning", "coding", "longContext"],
  },
];

// Provider API base URLs and auth key env-var names
export const PROVIDER_CONFIG = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    chatPath: "/chat/completions",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com",
    envKey: "ANTHROPIC_API_KEY",
    chatPath: "/v1/messages",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api",
    envKey: "OPENROUTER_API_KEY",
    chatPath: "/v1/chat/completions",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY",
    chatPath: "/chat/completions",
  },
  ollama: {
    baseUrl: "http://localhost:11434",
    envKey: null, // no key needed for local
    chatPath: "/v1/chat/completions",
  },
};

// Fallback chains per tier: if the preferred model fails, try next in list
export const FALLBACK_CHAINS = {
  fast: ["gpt-4o-mini", "claude-haiku", "groq-llama-4-scout", "ollama-qwen3.6-30b"],
  balanced: ["gpt-4o", "claude-sonnet", "groq-llama-4-maverick", "ollama-llama3.3-70b"],
  powerful: ["o4-mini", "claude-opus", "o3-mini", "openrouter-deepseek-r1"],
};

// Default config values
export const DEFAULT_CONFIG = {
  preferredTier: "balanced",    // fast | balanced | powerful
  maxRetries: 2,
  timeoutMs: 60_000,
  temperature: 0.7,
  stream: false,
};

// Quick helper: find model by id
export function findModelById(id) {
  return MODEL_REGISTRY.find(m => m.id === id);
}

// Quick helper: models by tier
export function modelsByTier(tier) {
  return MODEL_REGISTRY.filter(m => m.tier === tier);
}
