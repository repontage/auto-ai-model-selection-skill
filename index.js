/**
 * Skill: Model Router
 *
 * Automatically classify tasks and route them to the best-suited AI model.
 *
 * Usage:
 *   import { ModelRouter } from "./skill-model-router/index.js";
 *
 *   const router = new ModelRouter({ preferredProviders: ["openai"], costMode: "budget" });
 *   const result = await router.send("Explain quantum computing");
 *   console.log(result.content);
 */

import { classifyTask, pickModel } from "./classifier.js";
import { routeRequest, routeStream } from "./router.js";
import { MODEL_REGISTRY, FALLBACK_CHAINS, DEFAULT_CONFIG } from "./config.js";

export class ModelRouter {
   /**
    * @param {object} options
    * @param {string[]} [options.preferredProviders]   - provider priority order
    * @param {string} [options.costMode]               - "budget" | "balanced" | "unlimited"
    * @param {string} [options.forceTier]              - override auto-classification: "fast" | "balanced" | "powerful"
    * @param {number} [options.maxRetries]             - retries per model before fallback
    * @param {number} [options.maxTokens]              - max output tokens
    * @param {number} [options.timeoutMs]              - per-request timeout
    * @param {number} [options.temperature]             - creativity level
    * @param {string[]} [options.excludeModels]         - model ids to never use
    */
   constructor(options = {}) {
    this.options = { ...DEFAULT_CONFIG, ...options };
    this._history = [];
    }

   /**
    * Send a task and get the response. Auto-classifies and routes.
    *
    * @param {string | object} task  - prompt string or { prompt, contextTokens, requiredCapabilities }
    * @param {Array<{role, content}>} [messages]   - if provided, skip classification, use as-is
    * @returns {Promise<{content, model, usage, classification, fallbacks}>}
    */
  async send(task, messages) {
    const classification = typeof task === "string"
      ? classifyTask({ prompt: task })
      : classifyTask(task);

     // Allow manual tier override
    if (this.options.forceTier) {
      classification.tier = this.options.forceTier;
      }

    const { model, reason } = pickModel(classification, {
      excludeModels: this.options.excludeModels,
      preferredProviders: this.options.preferredProviders,
      costMode: this.options.costMode,
      });

     // Build messages if not provided
    const finalMessages = messages ?? [{ role: "user", content: typeof task === "string" ? task : task.prompt }];

    // Route with fallback chain
    const tierChain = FALLBACK_CHAINS[classification.tier] ?? FALLBACK_CHAINS.balanced;
    const fallbackIds = tierChain.filter(id => id !== model.id);

    const config = {
      maxRetries: this.options.maxRetries,
      maxTokens: this.options.maxTokens,
      timeoutMs: this.options.timeoutMs,
      temperature: this.options.temperature,
      };

    const result = await routeRequest({ model, fallbackIds, messages: finalMessages, config });

    // Track history
    const entry = {
      task: typeof task === "string" ? task : task.prompt,
      classification,
      selectedModel: model.id,
      usedModel: result.model,
      fallbacks: result.fallbacks,
      usage: result.usage,
      timestamp: new Date().toISOString(),
      };
    this._history.push(entry);

    return {
      content: result.content,
      model: result.model,
      usage: result.usage,
      classification,
      fallbacks: result.fallbacks,
      reason,
      };
  }

   /**
    * Stream version — returns an async iterable of content chunks.
    */
  async stream(task) {
    const classification = typeof task === "string"
      ? classifyTask({ prompt: task })
      : classifyTask(task);

    if (this.options.forceTier) classification.tier = this.options.forceTier;

    const { model } = pickModel(classification, {
      excludeModels: this.options.excludeModels,
      preferredProviders: this.options.preferredProviders,
      costMode: this.options.costMode,
      });

    const tierChain = FALLBACK_CHAINS[classification.tier] ?? FALLBACK_CHAINS.balanced;
    const fallbackIds = tierChain.filter(id => id !== model.id);

    const messages = [{ role: "user", content: typeof task === "string" ? task : task.prompt }];

    const stream = routeStream({
      model,
      fallbackIds,
      messages,
      config: {
        maxRetries: this.options.maxRetries,
        maxTokens: this.options.maxTokens,
        timeoutMs: this.options.timeoutMs,
        temperature: this.options.temperature,
        },
      });

    return {
      classification,
      model,
      async *[Symbol.asyncIterator]() {
        for await (const chunk of stream) yield chunk;
        },
      };
  }

   /**
    * Batch-send multiple tasks. Each gets classified independently.
    */
  async batch(tasks) {
    const promises = tasks.map(task => this.send(task));
    return Promise.all(promises);
   }

   /** Get request history */
  getHistory() { return [...this._history]; }

   /** Clear history */
  clearHistory() { this._history = []; }

   /**
    * List all available models and tiers.
    */
  static listModels() {
    return MODEL_REGISTRY.map(m => ({
      id: m.id,
      tier: m.tier,
      provider: m.provider,
      contextWindow: m.contextWindow,
      costPer1MTokens: m.costPer1MTokens,
      capabilities: m.capabilities,
      }));
    }

   /**
    * Classify without sending — useful for debugging or logging.
    */
  static classify(task) {
    return typeof task === "string" ? classifyTask({ prompt: task }) : classifyTask(task);
    }
}

// Also export lower-level pieces for advanced use
export { classifyTask, pickModel } from "./classifier.js";
export { routeRequest, routeStream } from "./router.js";
export { MODEL_REGISTRY, PROVIDER_CONFIG, FALLBACK_CHAINS, DEFAULT_CONFIG } from "./config.js";
