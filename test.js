/**
 * Test suite for skill-model-router
 */

import { classifyTask, pickModel } from "./classifier.js";
import { ModelRouter } from "./index.js";
import { MODEL_REGISTRY, FALLBACK_CHAINS } from "./config.js";

let passed = 0;
let failed = 0;

function assert(condition, label) {
    if (condition) {
    passed++;
    console.log(`   \u2713 ${label}`);
    } else {
    failed++;
    console.error(`   \u2717 ${label}`);
    }
}

console.log("Running tests...\n");

// ── Registry tests ──────────────────────────────────────────
console.log("Model Registry:");
assert(MODEL_REGISTRY.length > 10, `Registry has ${MODEL_REGISTRY.length} models (>10)`);
assert(MODEL_REGISTRY.some(m => m.provider === "openai"), "Has OpenAI models");
assert(MODEL_REGISTRY.some(m => m.provider === "anthropic"), "Has Anthropic models");
assert(MODEL_REGISTRY.some(m => m.provider === "groq"), "Has Groq models");
assert(MODEL_REGISTRY.some(m => m.provider === "ollama"), "Has Ollama models");
assert(MODEL_REGISTRY.some(m => m.tier === "fast"), "Has fast tier");
assert(MODEL_REGISTRY.some(m => m.tier === "balanced"), "Has balanced tier");
assert(MODEL_REGISTRY.some(m => m.tier === "powerful"), "Has powerful tier");

// ── Classification tests ────────────────────────────────────
console.log("\nClassifier:");

// Simple tasks → fast
assert(classifyTask({ prompt: "What is the capital of France?" }).tier === "fast",
    "Simple QA → fast");
assert(classifyTask({ prompt: "Hello, how are you?" }).tier === "fast",
    "Greeting → fast");
assert(classifyTask({ prompt: "Spell backwards: JavaScript" }).tier === "fast",
    "Simple task → fast");

// Medium tasks → balanced
assert(classifyTask({ prompt: "Write a Python function to parse CSV" }).tier === "balanced",
    "Medium coding → balanced");
assert(classifyTask({ prompt: "Summarize this article" }).tier === "balanced",
    "Summarization → balanced");
assert(classifyTask({ prompt: "Explain how React works" }).tier === "balanced",
    "Explanation → balanced");

// Complex tasks → powerful
assert(classifyTask({ prompt: "Design a distributed microservice architecture" }).tier === "powerful",
    "Architecture → powerful");
assert(classifyTask({ prompt: "Derive and prove the integral of x^2 * e^x" }).tier === "powerful",
    "Multi-signal math → powerful");
assert(classifyTask({ prompt: "Debug a race condition in concurrent code" }).tier === "powerful",
    "Race condition debug → powerful");
assert(classifyTask({ prompt: "Analyze this 500-line algorithm" }).tier === "powerful",
    "Large code analysis → powerful");
assert(classifyTask({ prompt: "Fix the bug", contextTokens: 60_000 }).tier === "powerful",
    "Large context → powerful");

// Category detection
assert(classifyTask({ prompt: "What is the capital?" }).category === "qa",
    "QA category detected");
assert(classifyTask({ prompt: "Write a function" }).category === "coding",
    "Coding category detected");
assert(classifyTask({ prompt: "Solve the integral" }).category === "math",
    "Math category detected");
assert(classifyTask({ prompt: "Design a system" }).category === "architecture",
    "Architecture category detected");

// Capabilities detection
const largeCtx = classifyTask({ prompt: "Summarize", contextTokens: 100_000 });
assert(largeCtx.needsCapabilities.includes("longContext"),
    "Large context → needs longContext capability");

const vision = classifyTask({ prompt: "Analyze this screenshot" });
assert(vision.needsCapabilities.includes("vision"),
    "Screenshot → needs vision capability");

// ── Model picking tests ─────────────────────────────────────
console.log("\nModel Picker:");

const picked1 = pickModel(classifyTask({ prompt: "What's 2+2?" }));
assert(picked1.model !== undefined, "Picks a model for simple task");
assert(picked1.model.tier === "fast", `Simple task picks fast model (got: ${picked1.model.tier})`);

const picked2 = pickModel(classifyTask({ prompt: "Design a distributed system" }), { preferredProviders: ["openai"] });
assert(picked2.model.provider === "openai", `Preferred provider respected (got: ${picked2.model.provider})`);

const picked3 = pickModel(classifyTask({ prompt: "Design a distributed system" }), { costMode: "budget" });
assert(picked3.model.costPer1MTokens.input <= 2, `Budget mode picks cheaper model (input cost: ${picked3.model.costPer1MTokens.input})`);

const picked4 = pickModel(classifyTask({ prompt: "Design" }), { excludeModels: ["gpt-4o"] });
assert(picked4.model.id !== "gpt-4o", "Excluded model not picked");

// ── Fallback chain tests ────────────────────────────────────
console.log("\nFallback Chains:");
assert(FALLBACK_CHAINS.fast.length >= 3, `Fast fallback chain ≥ 3 (got: ${FALLBACK_CHAINS.fast.length})`);
assert(FALLBACK_CHAINS.balanced.length >= 3, `Balanced fallback chain ≥ 3 (got: ${FALLBACK_CHAINS.balanced.length})`);
assert(FALLBACK_CHAINS.powerful.length >= 3, `Powerful fallback chain ≥ 3 (got: ${FALLBACK_CHAINS.powerful.length})`);

// ── ModelRouter API tests ───────────────────────────────────
console.log("\nModelRouter API:");
const router = new ModelRouter();
assert(typeof router.send === "function", "router.send is a function");
assert(typeof router.stream === "function", "router.stream is a function");
assert(typeof router.batch === "function", "router.batch is a function");
assert(typeof router.getHistory === "function", "router.getHistory is a function");
assert(typeof router.clearHistory === "function", "router.clearHistory is a function");
assert(router.getHistory().length === 0, "Fresh router has empty history");

const staticModels = ModelRouter.listModels();
assert(staticModels.length > 0, "ModelRouter.listModels() returns models");

const staticClass = ModelRouter.classify("Hello");
assert(staticClass !== undefined, "ModelRouter.classify() returns result");

// ── Summary ─────────────────────────────────────────────────
console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) process.exit(1);
