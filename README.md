# Auto AI Model Selection Skill

**Task complexity에 따라 AI 모델을 자동으로 선택하고 라우팅하는 JavaScript 라이브러리입니다.**

OpenClobo, Hermes Agent 등에서 사용하는 모델 자동 전환 기능을 오픈소스로 재구성했습니다.

## Quick Start

```bash
git clone https://github.com/repontage/auto-ai-model-selection-skill.git
cd auto-ai-model-selection-skill
# package.json의 의존성 없음 — Node.js v22+ 만 필요
```

### Node.js API

```js
import { ModelRouter } from "./index.js";

const router = new ModelRouter({
  preferredProviders: ["openai"],
  costMode: "balanced",
});

// 자동으로 작업 분류 → 적합한 모델 선택 → API 호출
const result = await router.send("Write a Python function to parse CSV files");
console.log(result.content);
console.log(result.model);        // e.g. "gpt-4o"
console.log(result.classification.tier);   // "balanced"
console.log(result.fallbacks);    // 0 = 첫 시도에서 성공
```

### CLI

```bash
node cli.js "Explain quantum computing"              # 자동 분류 + 발송
node cli.js --tier powerful "Design a microservice"  # tier 강제
node cli.js --provider ollama "Write bash script"    # provider 지정
node cli.js --budget "Summarize this article"        # 저가 모델 우선
node cli.js --stream "Tell me a story"              # 스트리밍
node cli.js --list                                    # 모델 목록
node cli.js --classify "Debug race condition"         # 분류만 확인
```

### 스트리밍 API

```js
const stream = await router.stream("Tell me a long story");
console.log(`Model: ${stream.model.id} (${stream.classification.tier})`);
for await (const chunk of stream) process.stdout.write(chunk);
```

### 배치 처리

```js
const results = await router.batch([
  { prompt: "What is 2+2?" },
  { prompt: "Design a distributed cache system" },
  { prompt: "Summarize this article", contextTokens: 15000 },
]);
results.forEach(r => console.log(`${r.model} → ${r.classification.tier}: ${r.content.slice(0, 80)}`));
```

## 환경 변수

| Variable | Provider | 필수? |
|----------|----------|-------|
| `OPENAI_API_KEY` | OpenAI (GPT-4o, O3, O4) | ✅ 선택한 provider에 따라 |
| `ANTHROPIC_API_KEY` | Anthropic (Claude) | ✅ 선택한 provider에 따라 |
| `GROQ_API_KEY` | Groq (Llama 시리즈) | ✅ 선택한 provider에 따라 |
| `OPENROUTER_API_KEY` | OpenRouter (aggregator) | ✅ 선택한 provider에 따라 |
| *(없음)* | Ollama (local) | ❌ 로컬 실행 |

```bash
export OPENAI_API_KEY="sk-proj-..."
# or
cp .env.example .env
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `preferredProviders` | `undefined` | Provider 우선순위 배열: `["openai", "anthropic"]` |
| `costMode` | `"balanced"` | `"budget"` / `"balanced"` / `"unlimited"` — 모델 선택 비용 우선순위 |
| `forceTier` | `undefined` | `"fast"` / `"balanced"` / `"powerful"` — 자동 분류 무시 |
| `maxRetries` | `2` | 모델 당 최대 재시도 횟수 |
| `maxTokens` | `undefined` | 최대 출력 토큰 |
| `timeoutMs` | `60000` | 요청 타임아웃 (ms) |
| `temperature` | `0.7` | 창의성 조절 (0.0 ~ 1.0) |
| `excludeModels` | `[]` | 제외할 모델 ID 목록 |

## 모델 목록

| Tier | Model | Provider | Context | Cost (input) | Capabilities |
|------|-------|----------|---------|--------------|--------------|
| **fast** | `gpt-4o-mini` | OpenAI | 128k | $0.15/M | coding, functionCalling |
| | `claude-haiku` | Anthropic | 200k | $0.80/M | coding, functionCalling |
| | `groq-llama-3.3-70b` | Groq | 128k | $0.59/M | coding, functionCalling |
| | `groq-llama-4-scout` | Groq | 128k | $0.20/M | coding |
| | `ollama-qwen3.6-30b` | Ollama | 32k | free | coding |
| **balanced** | `gpt-4o` | OpenAI | 128k | $2.50/M | reasoning, coding, longContext, vision, functionCalling |
| | `claude-sonnet` | Anthropic | 200k | $3.00/M | reasoning, coding, longContext, vision, functionCalling |
| | `groq-llama-4-maverick` | Groq | 128k | $0.60/M | reasoning, coding |
| | `openrouter-qwen3-coder` | OpenRouter | 128k | free | coding |
| | `ollama-llama3.3-70b` | Ollama | 128k | free | reasoning, coding |
| | `ollama-command-r-plus` | Ollama | 128k | free | reasoning, coding, longContext |
| **powerful** | `o4-mini` | OpenAI | 200k | $1.10/M | reasoning, coding, longContext, vision, functionCalling |
| | `claude-opus` | Anthropic | 200k | $15.00/M | reasoning, coding, longContext, vision, functionCalling |
| | `o3-mini` | OpenAI | 200k | $1.10/M | reasoning, coding, longContext |
| | `openrouter-deepseek-r1` | OpenRouter | 128k | free | reasoning, coding |

## 자동 분류 기준

| Tier | 사용 사례 | 예시 |
|------|----------|------|
| **fast** | 단순 Q&A, 서식 변환, 짧은 코드, 인사 | "What's the capital of France?", "capitalize this string" |
| **balanced** | 중간 코딩, 분석, 번역, 요약, 설명 | "Write a Python function", "Summarize this article", "How does React work?" |
| **powerful** | 깊은 추론, 복잡 아키텍처, 수학, 연구, 디버깅 | "Design a distributed system", "Debug a race condition", "Derive the integral" |

분류기는 다음과 같은 신호를 감지합니다:

- **Powerful 신호**: `reason`, `architecture`, `microservice`, `debug race condition`, `500-line`, `optimize performance` 등
- **Balanced 신호**: `write`, `implement`, `summarize`, `function`, `css`, `debug` 등
- **Fast 신호**: `hello`, `what's`, `capitalize`, `quick`, `simple` 등

문맥 토큰이 10k 이하면 `fast`, 50k 초과면 `powerful`으로 자동 승격됩니다.

## Fallback 체인

선호 모델이 실패하면 같은 티어의 다음 모델로 자동으로 전환됩니다:

- **fast**: `gpt-4o-mini` → `claude-haiku` → `groq-llama-4-scout` → `ollama-qwen3.6-30b`
- **balanced**: `gpt-4o` → `claude-sonnet` → `groq-llama-4-maverick` → `ollama-llama3.3-70b`
- **powerful**: `o4-mini` → `claude-opus` → `o3-mini` → `openrouter-deepseek-r1`

## 고급 사용법

### 커스텀 모델 추가

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

### 분류만 확인

```js
import { ModelRouter } from "./index.js";

const classification = ModelRouter.classify("Design a microservice for e-commerce");
console.log(classification);
// { tier: "powerful", complexity: 7.5, category: "architecture", needsCapabilities: [] }
```

### Provider 조건부 라우팅

```js
// 로컬 Ollama 우선, 실패하면 OpenAI로 폴백
const localFirst = new ModelRouter({
  preferredProviders: ["ollama", "openai"],
  costMode: "budget",
});
```

## 프로젝트 구조

```
├── config.js          # 모델 레지스트리, Provider 설정, Fallback 체인
├── classifier.js      # 작업 자동 분류기
├── router.js          # API 라우터 (재시도 + Fallback + 스트리밍)
├── index.js           # ModelRouter 클래스 (메인 API)
├── cli.js             # 명령줄 도구
├── test.js            # 테스트 스위트
├── package.json
├── .gitignore
├── .env.example
└── README.md
```

## 테스트

```bash
node test.js
```

41개 테스트 — 모델 레지스트리, 분류기, 모델 선택기, Fallback 체인, API 검증.

## License

MIT — [LICENSE](LICENSE)
