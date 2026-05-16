/**
 * Task Classifier
 *
 * Analyzes a task description (prompt + context) and returns:
 *          { tier, complexity, category, needsCapabilities }
 *
 * Rules of thumb:
 *     fast           → simple Q&A, formatting, short code snippets, greetings
 *     balanced       → medium coding, analysis, translation, summarization
 *     powerful       → deep reasoning, complex architecture, math, research
 */

import { MODEL_REGISTRY, FALLBACK_CHAINS } from "./config.js";

// Tier ordering for comparisons
const TIER_ORDER = { fast: 1, balanced: 2, powerful: 3 };

/** Clamp: return the higher of two tiers */
function maxTier(a, b) {
     return TIER_ORDER[a] >= TIER_ORDER[b] ? a : b;
}

// ── Keyword / pattern signatures per tier ──────────────────
const POWERFUL_SIGNALS = [
      /^(?:reason|deduce|prove|derive|theorem)/i,
      /algorithm\s+design|architecture|refactor/i,
      /(?:complex|difficult|hard|challenging|tricky|deep\s+think|chain\s*of\s*thought)/i,
      /(?:calculus|equation|differentiate|integral)/i,
      /(?:system\s+design|microservice|scalability|distributed|concurrency)/i,
      /(?:research|survey|literature|compare\s+and\s+analyze|meta\s*analysis)/i,
      /\bdebug\b.*\b(?:race|concurrent|deadlock|memory|performance|recursion)\b/i,
      /(?:security|vulnerability|exploit|audit)/i,
      /\d{3,}[\s-]*\b(?:line|page|token)\b/i,
      /(?:optimize\s+(?:performance|query|algorithm|complexity))/i,
];

const BALANCED_SIGNALS = [
      /(?:write|implement|create|build|generate|convert|translate)/i,
      /(?:explain|summarize|analyze|review|suggest|recommend)/i,
      /(?:function|class|component|api|endpoint|route)/i,
      /(?:test|spec|assert|unit\s*test|integration)/i,
      /(?:sql|database|schema|migration)/i,
      /(?:css|style|layout|responsive|design)/i,
      /(?:regex|parse|format|transform)/i,
      /(?:fix|resolve)/i,
];

const FAST_SIGNALS = [
      /^(?:hello|hi|hey)/i,
      /^(?:what'\s*s|who|when|where)/i,
      /(?:what\s+is|how\s+do|define)/i,
      /(?:capitalize|lowercase|uppercase|reverse)/i,
      /(?:quick|simple|easy|one\s*liner)/i,
];

// Task categories
const CATEGORIES = [
   { name: "coding",         pattern: /(?:code|implement|function|class|bug|debug|refactor|algorithm|script)/i },
   { name: "writing",        pattern: /(?:write|essay|article|blog|story|poem|translate|summarize)/i },
   { name: "analysis",       pattern: /(?:analyze|compare|review|audit|evaluate|assess)/i },
   { name: "math",           pattern: /(?:math|calculate|equation|formula|solve|integral|matrix|derivative)/i },
   { name: "creative",       pattern: /(?:creative|story|poem|dialogue|improvise|role\s*play)/i },
   { name: "research",       pattern: /(?:research|investigate|survey|explore|find\s+out)/i },
   { name: "architecture",   pattern: /(?:architecture|design|pattern|system\s*design|scalab)/i },
   { name: "qa",             pattern: /^(?:what|how|why|when|who)/i },
];

/**
 * Classify a task and return a structured profile.
 */
export function classifyTask(task) {
    const prompt = task.prompt ?? "";
    const contextTokens = task.contextTokens ?? 0;

     // ── 1. Score tier signals ───────────────────────────────
  let powerfulScore = 0;
  for (const sig of POWERFUL_SIGNALS) {
    powerfulScore += (prompt.match(sig) ?? []).length;
       }

  let balancedScore = 0;
  for (const sig of BALANCED_SIGNALS) {
    balancedScore += (prompt.match(sig) ?? []).length;
      }

  let fastScore = 0;
  for (const sig of FAST_SIGNALS) {
    fastScore += (prompt.match(sig) ?? []).length;
      }

     // ── 2. Determine tier ──────────────────────────────────
    // Start with context-based floor
  let contextTier = "fast";
  if (contextTokens > 50_000) contextTier = "powerful";
  else if (contextTokens > 10_000) contextTier = "balanced";

     // Signal-based tier
  let signalTier = "fast";
  if (powerfulScore >= 2) signalTier = "powerful";
  else if (powerfulScore >= 1) {
    if (fastScore === 0) signalTier = "powerful";
    else signalTier = "balanced";
      }
  else if (balancedScore >= 1 && fastScore === 0) signalTier = "balanced";

     // Final tier = max of context and signal tiers
  let tier = maxTier(contextTier, signalTier);

     // ── 3. Detect category ──────────────────────────────────
  let category = "general";
  let categoryScore = 0;
  for (const { name, pattern } of CATEGORIES) {
    const matches = (prompt.match(pattern) ?? []).length;
    if (matches > categoryScore) {
      categoryScore = matches;
      category = name;
        }
      }

     // ── 4. Compute complexity (0–10) ───────────────────────
  let complexity = Math.min(10,
    fastScore * 0.5 +
    balancedScore * 1.5 +
    powerfulScore * 3 +
    Math.min(3, contextTokens / 20_000) +
      (task.requiredCapabilities?.length ?? 0) * 0.5
      );

     // ── 5. Detect needed capabilities ──────────────────────
  const needsCapabilities = [];
  if (/reason|think\s*(?:deep|step)/i.test(prompt)) needsCapabilities.push("reasoning");
  if (/code|implement|function|bug|debug/i.test(prompt)) needsCapabilities.push("coding");
  if (/image|vision|picture|photo|screenshot/i.test(prompt)) needsCapabilities.push("vision");
  if (contextTokens > 40_000) needsCapabilities.push("longContext");
  if (/tool|function|call|api\s*(?:call|invoke)/i.test(prompt)) needsCapabilities.push("functionCalling");

  return { tier, complexity: Math.round(complexity * 10) / 10, category, needsCapabilities };
}

/**
 * Pick the best model for a classification result.
 */
export function pickModel(profile, options = {}) {
     const chain = FALLBACK_CHAINS[profile.tier] ?? FALLBACK_CHAINS.balanced;

     // Filter candidates
  const candidates = [...chain].filter(id => {
    if (options.excludeModels?.includes(id)) return false;
    const m = MODEL_REGISTRY.find(x => x.id === id);
    if (!m) return false;
    for (const cap of profile.needsCapabilities) {
       if (!m.capabilities.includes(cap)) return false;
         }
    return true;
      });

     // Reorder by provider preference
  if (options.preferredProviders) {
    candidates.sort((a, b) => {
      const mA = MODEL_REGISTRY.find(m => m.id === a);
      const mB = MODEL_REGISTRY.find(m => m.id === b);
      const ia = options.preferredProviders.indexOf(mA?.provider ?? "");
      const ib = options.preferredProviders.indexOf(mB?.provider ?? "");
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        });
      }

     // Cost-based reordering
  if (options.costMode === "budget") {
    candidates.sort((a, b) => {
      const mA = MODEL_REGISTRY.find(m => m.id === a);
      const mB = MODEL_REGISTRY.find(m => m.id === b);
      return (mA?.costPer1MTokens.input ?? 0) - (mB?.costPer1MTokens.input ?? 0);
        });
      }

  const chosenId = candidates[0] ?? chain[0];
  const model = MODEL_REGISTRY.find(m => m.id === chosenId);

  return {
      model,
      reason: `Tier: ${profile.tier} | Complexity: ${profile.complexity}/10 | Category: ${profile.category} | Needs: ${profile.needsCapabilities.join(", ") || "none"}`,
        };
}
