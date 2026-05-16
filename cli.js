#!/usr/bin/env node
/**
 * CLI: model-router
 *
 * Usage:
 *   node cli.js "Explain quantum computing"               # auto-classify + send
 *   node cli.js --tier powerful "Design a microservice"
 *   node cli.js --provider openai "Write a function"
 *   node cli.js --budget "Summarize this article"
 *   node cli.js --list                                     # list models
 *   node cli.js --classify "Debug a race condition"        # classify only, no send
 *   node cli.js --stream "Tell me a story"                # streaming output
 */

import { ModelRouter } from "./index.js";
import { MODEL_REGISTRY } from "./config.js";

const BOOLEAN_FLAGS = new Set(["list", "classify", "stream", "budget"]);

const args = process.argv.slice(2);

// ── Parse flags ────────────────────────────────────────────
const flags = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
    const key = args[i].slice(2);
    if (BOOLEAN_FLAGS.has(key)) {
      flags[key] = true;
     } else {
      const next = args[i + 1];
      flags[key] = next && !next.startsWith("--") ? (args[++i] ?? "true") : "true";
        }
      } else {
    positional.push(args[i]);
      }
}

const prompt = positional.join(" ");

// ── Commands ────────────────────────────────────────────────
if (flags.list) {
    console.log("\n   ╭────────────────────────────── Skill: Model Router ──────────────────────────────╮");
  console.log("   │                                                                               │");

  for (const tier of ["fast", "balanced", "powerful"]) {
    console.log(`   │   【${tier.toUpperCase().padEnd(8)}】                                                    │`);
    const tierModels = MODEL_REGISTRY.filter(m => m.tier === tier);
    for (const m of tierModels) {
      const costLabel = m.costPer1MTokens.input === 0 ? "free" : `$${m.costPer1MTokens.input}/M`;
      const caps = m.capabilities.slice(0, 3).join(" · ");
      console.log(`   │    ${m.id.padEnd(30)} ${m.provider.padEnd(12)} ${String(m.contextWindow / 1000).padStart(4)}k ctx   ${costLabel.padStart(8)}   ${caps}   │`);
          }
    console.log("   │");
       }

  console.log("   │                                                                               │");
  console.log("   ╰──────────────────────────────────────────────────────────────────────────────╯\n");
  process.exit(0);
}

if (flags.classify) {
    if (!prompt) {
    console.error("  Error: --classify needs a prompt. Example: node cli.js --classify \"Debug a race condition\"\n");
    process.exit(1);
      }
  const result = ModelRouter.classify(prompt);
  console.log(`\n  Prompt:     "${prompt}"`);
  console.log(`  Tier:       ${result.tier}`);
  console.log(`  Complexity: ${result.complexity}/10`);
  console.log(`  Category:   ${result.category}`);
  console.log(`  Capabilities: ${result.needsCapabilities.join(", ") || "none"}`);

      // Show suggested model
  const { pickModel } = await import("./classifier.js");
  const { model } = pickModel(result);
  console.log(`  Suggested:  ${model.id} (${model.provider})`);
  console.log();
  process.exit(0);
}

if (!prompt) {
    console.log(`
Usage:
  node cli.js "Your task description"
  node cli.js --tier <fast|balanced|powerful> "Your task"
  node cli.js --provider <openai|anthropic|groq|ollama> "Your task"
  node cli.js --budget "Your task"
  node cli.js --stream "Your task"
  node cli.js --list
  node cli.js --classify "Your task"

Examples:
  node cli.js "Explain quantum entanglement"
  node cli.js --tier powerful "Design a distributed cache system"
  node cli.js --provider ollama "Write a quick bash script"
  node cli.js --budget "Summarize this article: ..."
  node cli.js --stream "Tell me a story about space"
`);
    process.exit(1);
}

// ── Build router ────────────────────────────────────────────
const router = new ModelRouter({
     forceTier: flags.tier !== "true" ? flags.tier : undefined,
     preferredProviders: flags.provider && flags.provider !== "true" ? [flags.provider] : undefined,
     costMode: flags.budget ? "budget" : undefined,
     maxTokens: flags.maxtokens && flags.maxtokens !== "true" ? parseInt(flags.maxtokens) : undefined,
});

// ── Stream mode ─────────────────────────────────────────────
if (flags.stream) {
    const stream = await router.stream(prompt);
    process.stdout.write(`\n  Model: ${stream.model.id} (${stream.classification.tier})\n  `);
    for await (const chunk of stream) process.stdout.write(chunk);
    console.log("\n");
    process.exit(0);
}

// ── Normal mode ─────────────────────────────────────────────
try {
    const start = Date.now();
    const result = await router.send(prompt);
    const elapsed = Date.now() - start;

    console.log(`\n  Model:      ${result.model}`);
    console.log(`  Tier:       ${result.classification.tier}`);
    console.log(`  Category:   ${result.classification.category}`);
    console.log(`  Fallbacks: ${result.fallbacks}`);
    if (result.usage) {
    console.log(`  Tokens:     ${result.usage.total_tokens ?? "?"} (input: ${result.usage.prompt_tokens ?? "?"}, output: ${result.usage.completion_tokens ?? "?"})`);
          }
    console.log(`  Time:       ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`\n  ${result.content}\n`);
    } catch (err) {
    console.error(`\n  Error: ${err.message}\n`);
    process.exit(1);
      }
