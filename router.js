/**
 * Router Engine
 *
 * Takes a classified task, picks a model, and dispatches the request
 * to the appropriate provider API. Handles retries and fallbacks.
 */

import { PROVIDER_CONFIG, MODEL_REGISTRY, DEFAULT_CONFIG } from "./config.js";

const TIMEOUT_MS = 60_000;

// ── Provider dispatchers ───────────────────────────────────

/** OpenAI-compatible format (OpenAI, Groq, OpenRouter, Ollama) */
async function sendOpenAICompatible(provider, model, messages, config) {
  const cfg = PROVIDER_CONFIG[provider];
  const url = `${cfg.baseUrl}${cfg.chatPath}`;

   // Provider-specific headers
  const headers = {
    "Content-Type": "application/json",
    ...(cfg.envKey ? { Authorization: `Bearer ${process.env[cfg.envKey]}` } : {}),
  };

   // OpenRouter extras
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/agent/skill-model-router";
    headers["X-Title"] = "Skill Model Router";
   }

  const body = JSON.stringify({
    model: model.apiId,
    messages,
    temperature: config.temperature ?? DEFAULT_CONFIG.temperature,
    max_tokens: config.maxTokens,
    ...(config.stream ? { stream: true } : {}),
   });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout (${config.timeoutMs ?? TIMEOUT_MS}ms) for ${provider}:${model.apiId}`)),
      config.timeoutMs ?? TIMEOUT_MS
    )
  );

  const fetchPromise = fetch(url, { method: "POST", headers, body });
  const response = await Promise.race([fetchPromise, timeout]);

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`API error ${response.status} from ${provider}: ${errBody.slice(0, 200)}`);
   }

  const data = await response.json();

  // OpenRouter wraps choices differently sometimes
  const content = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.content;
  const usage = data.usage ?? null;
  const finishReason = data.choices?.[0]?.finish_reason;

  return { content: content ?? "", usage, finishReason, model: model.id };
}

/** Anthropic Messages API */
async function sendAnthropic(provider, model, messages, config) {
  const cfg = PROVIDER_CONFIG[provider];
  const url = `${cfg.baseUrl}${cfg.chatPath}`;

  // Convert messages to Anthropic format
  // Anthropic uses a system message + messages array
  let system = undefined;
  const anthropicMessages = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system = msg.content; // Anthropic system is a top-level field
      continue;
     }
    anthropicMessages.push({ role: msg.role, content: msg.content });
   }

  const body = JSON.stringify({
    model: model.apiId,
    system,
    messages: anthropicMessages,
    temperature: config.temperature ?? DEFAULT_CONFIG.temperature,
    max_tokens: config.maxTokens ?? 4096,
   });

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": process.env[cfg.envKey],
    "anthropic-version": "2023-06-01",
   };

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout (${config.timeoutMs ?? TIMEOUT_MS}ms) for ${provider}:${model.apiId}`)),
      config.timeoutMs ?? TIMEOUT_MS
    )
  );

  const fetchPromise = fetch(url, { method: "POST", headers, body });
  const response = await Promise.race([fetchPromise, timeout]);

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`API error ${response.status} from ${provider}: ${errBody.slice(0, 200)}`);
   }

  const data = await response.json();

  return {
    content: data.content?.[0]?.text ?? "",
    usage: data.usage ?? null,
    finishReason: data.stop_reason,
    model: model.id,
   };
}

// Provider → dispatcher map
const DISPATCHERS = {
  openai: sendOpenAICompatible,
  groq: sendOpenAICompatible,
  openrouter: sendOpenAICompatible,
  ollama: sendOpenAICompatible,
  anthropic: sendAnthropic,
};

/**
 * Send a request with automatic fallback.
 *
 * @param {object} args
 * @param {object} args.model        - model object from registry
 * @param {string[]} args.fallbackIds - fallback chain (model ids to try next)
 * @param {Array<{role, content}>} args.messages   - chat messages
 * @param {object} args.config       - extra config overrides
 *
 * @returns {{ content, usage, finishReason, model, fallbacks: number }}
 */
export async function routeRequest({ model, fallbackIds, messages, config = {} }) {
  const maxRetries = config.maxRetries ?? 2;
  const fallbacks = [...fallbackIds];
  let attempts = [];
  let lastError;

   // Try primary model
  for (let retry = 0; retry <= maxRetries; retry++) {
    try {
      const dispatcher = DISPATCHERS[model.provider];
      if (!dispatcher) throw new Error(`No dispatcher for provider: ${model.provider}`);

      const result = await dispatcher(model.provider, model, messages, config);
      return { ...result, fallbacks: attempts.length };
     } catch (err) {
      lastError = err;
      attempts.push({ model: model.id, error: err.message });

      if (retry < maxRetries) {
        // Retry same model before escalating
        await new Promise(r => setTimeout(r, 1000 * (retry + 1))); // backoff
        continue;
       }
      break;
     }
   }

   // Walk the fallback chain
  for (const fallbackId of fallbacks) {
    const fallbackModel = MODEL_REGISTRY.find(m => m.id === fallbackId);
    if (!fallbackModel) continue;

    for (let retry = 0; retry <= maxRetries; retry++) {
      try {
        const dispatcher = DISPATCHERS[fallbackModel.provider];
        if (!dispatcher) continue;

        const result = await dispatcher(fallbackModel.provider, fallbackModel, messages, config);
        return { ...result, fallbacks: attempts.length + 1 };
       } catch (err) {
        lastError = err;
        attempts.push({ model: fallbackModel.id, error: err.message });
        break; // move to next fallback immediately
       }
     }
   }

  throw new Error(`All models failed. Attempts: ${JSON.stringify(attempts)}. Last error: ${lastError.message}`);
}

/**
 * Stream version — returns an AsyncIterable.
 * Only supported for OpenAI-compatible providers (streaming SSE).
 */
export async function* routeStream({ model, fallbackIds, messages, config = {} }) {
  const cfg = { ...config, stream: true };
  const fallbacks = [...fallbackIds];

   // Try primary model
  try {
    const result = await streamOpenAICompatible(model.provider, model, messages, cfg);
    for await (const chunk of result) yield chunk;
    return;
   } catch {
     // fall through to fallbacks
   }

   // Fallback
  for (const fallbackId of fallbacks) {
    const m = MODEL_REGISTRY.find(x => x.id === fallbackId);
    if (!m) continue;
    try {
      const result = await streamOpenAICompatible(m.provider, m, messages, cfg);
      for await (const chunk of result) yield chunk;
      return;
     } catch {
      continue;
     }
   }

  throw new Error("All streaming models failed");
}

async function* streamOpenAICompatible(provider, model, messages, config) {
  const cfg = PROVIDER_CONFIG[provider];
  const url = `${cfg.baseUrl}${cfg.chatPath}`;

  const headers = {
    "Content-Type": "application/json",
    ...(cfg.envKey ? { Authorization: `Bearer ${process.env[cfg.envKey]}` } : {}),
   };

  const body = JSON.stringify({
    model: model.apiId,
    messages,
    temperature: config.temperature ?? DEFAULT_CONFIG.temperature,
    stream: true,
   });

  const response = await fetch(url, { method: "POST", headers, body });

  if (!response.ok) {
    throw new Error(`Stream error ${response.status} from ${provider}`);
   }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]") continue;

      try {
        const json = JSON.parse(trimmed.slice(6));
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
       } catch {
        // skip malformed chunk
       }
     }
   }
}
