import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";

type ToolRecord = {
  toolName: string;
  input?: Record<string, unknown>;
  classification?: string;
  normalizedPath?: string;
};

type LiveScenarioResult = {
  id: string;
  description: string;
  reason: string;
  pass: boolean;
  preferredHit: boolean;
  acceptedHit: boolean;
  toolCalls: ToolRecord[];
  assistantText: string;
  assistantStopReason?: string;
  assistantErrorMessage?: string;
};

type LiveSummary = {
  model: string;
  passed: number;
  failed: number;
  results: LiveScenarioResult[];
};

type Scenario = {
  id: string;
  description: string;
  prompt: string;
  acceptedFirstReads: string[];
  preferredFirstRead?: string;
  requiredReads?: string[];
  requiredRawReadsAfterGraph?: string[];
  expectedAnswerIncludes?: string[];
};

type JudgeDecision = {
  verdict: "pass" | "fail";
  score: number;
  reasoning: string;
  findings: string[];
  criteria: {
    graph_before_raw: boolean;
    used_accepted_graph_artifact: boolean;
    mentioned_first_artifact_consistently: boolean;
  };
};

type JudgeResult = {
  id: string;
  pass: boolean;
  score: number;
  reasoning: string;
  findings: string[];
  criteria: JudgeDecision["criteria"];
  rawOutput: string;
  judgeModel: string;
  judgeErrorMessage?: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const scenariosDir = path.join(repoRoot, "evals", "scenarios");
const defaultInputPath = path.join(repoRoot, "evals", "results", "last-live.json");
const defaultOutputPath = path.join(repoRoot, "evals", "results", "last-judge.json");
const rubricPath = path.join(repoRoot, "evals", "judge-rubric.md");

function parseArgs(argv: string[]) {
  const options: {
    input: string;
    model?: string;
    json: boolean;
    dryRun: boolean;
  } = {
    input: defaultInputPath,
    json: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") options.input = argv[i + 1];
    else if (arg === "--model") options.model = argv[i + 1];
    else if (arg === "--json") options.json = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node --experimental-strip-types evals/run-judge.ts [options]

Options:
  --input path          Live eval result JSON to judge. Default: evals/results/last-live.json
  --model provider/id   Judge model. Defaults to PI_JUDGE_MODEL or PI_EVAL_MODEL.
  --json                Print machine-readable JSON summary.
  --dry-run             Validate inputs and rubric without invoking a judge model.
  -h, --help            Show this help.
`);
}

function loadLiveSummary(inputPath: string): LiveSummary {
  return JSON.parse(fs.readFileSync(inputPath, "utf8")) as LiveSummary;
}

function loadScenarios(): Map<string, Scenario> {
  const files = fs.readdirSync(scenariosDir).filter((file) => file.endsWith(".json")).sort();
  const scenarios = files.map((file) => {
    const fullPath = path.join(scenariosDir, file);
    return JSON.parse(fs.readFileSync(fullPath, "utf8")) as Scenario;
  });
  return new Map(scenarios.map((scenario) => [scenario.id, scenario]));
}

function normalizeJsonResponse(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/, "").trim();
  }
  return trimmed;
}

function buildJudgePrompt(rubric: string, scenario: Scenario, result: LiveScenarioResult): string {
  return [
    rubric,
    "",
    "## Scenario",
    JSON.stringify(scenario, null, 2),
    "",
    "## Live run result to judge",
    JSON.stringify(result, null, 2),
    "",
    "Judge this run against the rubric.",
    "Return strict JSON only, with no markdown fences and no extra prose.",
  ].join("\n");
}

async function resolveJudgeModel(modelSelector?: string) {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const availableModels = await modelRegistry.getAvailable();

  if (availableModels.length === 0) {
    throw new Error("No available pi models found for judge evaluation.");
  }

  const selector = modelSelector ?? process.env.PI_JUDGE_MODEL ?? process.env.PI_EVAL_MODEL;
  const model = selector
    ? availableModels.find((candidate) => `${candidate.provider}/${candidate.id}` === selector)
    : availableModels[0];

  if (!model) {
    const available = availableModels.map((candidate) => `${candidate.provider}/${candidate.id}`).join(", ");
    throw new Error(`Requested judge model ${selector} is not available. Available models: ${available}`);
  }

  return { authStorage, modelRegistry, model };
}

async function judgeOne(
  scenario: Scenario,
  result: LiveScenarioResult,
  rubric: string,
  deps: { authStorage: AuthStorage; modelRegistry: ModelRegistry; model: any },
): Promise<JudgeResult> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `graphify-judge-${result.id}-`));
  const agentDir = path.join(cwd, ".pi-agent");
  fs.mkdirSync(agentDir, { recursive: true });

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "You are a strict evaluation judge. Output JSON only.",
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd,
    agentDir,
    model: deps.model,
    thinkingLevel: "off",
    authStorage: deps.authStorage,
    modelRegistry: deps.modelRegistry,
    resourceLoader,
    tools: [],
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false, maxRetries: 0 },
    }),
  });

  let rawOutput = "";
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      rawOutput += event.assistantMessageEvent.delta;
    }
  });

  let judgeErrorMessage: string | undefined;
  try {
    await session.prompt(buildJudgePrompt(rubric, scenario, result));
    const lastMessage = session.messages.at(-1) as { errorMessage?: string } | undefined;
    judgeErrorMessage = lastMessage?.errorMessage;
  } finally {
    unsubscribe();
    session.dispose();
  }

  const normalized = normalizeJsonResponse(rawOutput);
  let parsed: JudgeDecision;
  try {
    parsed = JSON.parse(normalized) as JudgeDecision;
  } catch (error) {
    throw new Error(
      `Judge output was not valid JSON for scenario ${result.id}: ${error instanceof Error ? error.message : String(error)}\nRaw output: ${rawOutput}\nJudge error: ${judgeErrorMessage ?? "none"}`,
    );
  }

  return {
    id: result.id,
    pass: parsed.verdict === "pass",
    score: parsed.score,
    reasoning: parsed.reasoning,
    findings: parsed.findings,
    criteria: parsed.criteria,
    rawOutput,
    judgeModel: `${deps.model.provider}/${deps.model.id}`,
    judgeErrorMessage,
  };
}

function printHumanSummary(judgments: JudgeResult[]) {
  console.log("graphify llm-judge evals");
  for (const judgment of judgments) {
    const status = judgment.pass ? "PASS" : "FAIL";
    console.log(`- ${status} ${judgment.id} · score ${judgment.score}`);
    console.log(`  ${judgment.reasoning}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rubric = fs.readFileSync(rubricPath, "utf8");
  const scenarios = loadScenarios();

  if (!fs.existsSync(options.input)) {
    if (options.dryRun) {
      const payload = {
        ok: true,
        input: options.input,
        inputExists: false,
        rubricBytes: rubric.length,
        scenarios: [...scenarios.keys()],
      };
      if (options.json) console.log(JSON.stringify(payload, null, 2));
      else console.log(`Validated judge runner config for ${scenarios.size} scenario(s); no live input found at ${options.input}.`);
      return;
    }
    throw new Error(`Input live eval file not found: ${options.input}`);
  }

  const liveSummary = loadLiveSummary(options.input);

  if (options.dryRun) {
    const payload = {
      ok: true,
      input: options.input,
      inputExists: true,
      liveCases: liveSummary.results.map((result) => result.id),
      missingScenarios: liveSummary.results.filter((result) => !scenarios.has(result.id)).map((result) => result.id),
    };
    if (options.json) console.log(JSON.stringify(payload, null, 2));
    else console.log(`Validated judge inputs for ${liveSummary.results.length} live eval result(s).`);
    return;
  }

  const deps = await resolveJudgeModel(options.model);
  const judgments: JudgeResult[] = [];

  for (const result of liveSummary.results) {
    const scenario = scenarios.get(result.id);
    if (!scenario) {
      throw new Error(`No scenario metadata found for live result ${result.id}`);
    }
    judgments.push(await judgeOne(scenario, result, rubric, deps));
  }

  const summary = {
    judgeModel: `${deps.model.provider}/${deps.model.id}`,
    inputModel: liveSummary.model,
    passed: judgments.filter((judgment) => judgment.pass).length,
    failed: judgments.filter((judgment) => !judgment.pass).length,
    judgments,
  };

  fs.mkdirSync(path.dirname(defaultOutputPath), { recursive: true });
  fs.writeFileSync(defaultOutputPath, JSON.stringify(summary, null, 2));

  if (options.json) console.log(JSON.stringify(summary, null, 2));
  else printHumanSummary(judgments);

  if (judgments.some((judgment) => !judgment.pass)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Judge eval runner failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
