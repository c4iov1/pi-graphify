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

type EvalFile = {
  path: string;
  content: string;
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
  files: EvalFile[];
};

type ToolRecord = {
  toolName: string;
  input: Record<string, unknown> | undefined;
};

type ClassifiedToolRecord = ToolRecord & {
  classification: "graph" | "raw" | "neutral";
  normalizedPath?: string;
};

type ScenarioResult = {
  id: string;
  description: string;
  pass: boolean;
  preferredHit: boolean;
  acceptedHit: boolean;
  requiredReadsHit: boolean;
  requiredRawReadsAfterGraphHit: boolean;
  expectedAnswerHit: boolean;
  reason: string;
  firstDecisive?: ClassifiedToolRecord;
  firstGraph?: ClassifiedToolRecord;
  firstRaw?: ClassifiedToolRecord;
  toolCalls: ClassifiedToolRecord[];
  assistantText: string;
  assistantStopReason?: string;
  assistantErrorMessage?: string;
  cwd: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const scenariosDir = path.join(repoRoot, "evals", "scenarios");
const graphifyExtensionPath = path.join(repoRoot, "extensions", "graphify.ts");
const outputDir = path.join(repoRoot, "evals", "results");

function parseArgs(argv: string[]) {
  const options: {
    model?: string;
    scenario?: string;
    dryRun: boolean;
    json: boolean;
  } = {
    dryRun: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--scenario") options.scenario = argv[i + 1];
    else if (arg === "--model") options.model = argv[i + 1];
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node --experimental-strip-types evals/run-live.ts [options]

Options:
  --model provider/id   Exact model to use. Defaults to PI_EVAL_MODEL or first available model.
  --scenario id         Run a single scenario by id.
  --json                Print machine-readable JSON summary.
  --dry-run             Validate scenarios and config without invoking a model.
  -h, --help            Show this help.

Environment:
  PI_EVAL_MODEL         Default model in provider/id form.
`);
}

function normalizePath(value?: string): string {
  if (!value) return "";
  return value.replace(/^@/, "").replaceAll("\\", "/");
}

function isGraphArtifactPath(value?: string): boolean {
  const normalized = normalizePath(value);
  return (
    normalized === "graphify-out/GRAPH_REPORT.md" ||
    normalized === "graphify-out/wiki/index.md" ||
    normalized === "graphify-out/graph.json"
  );
}

function isSearchLikeBash(command: string | undefined): boolean {
  if (!command) return false;
  return /(^|\s)(rg|grep|find|fd|ls|tree)(\s|$)/.test(command);
}

function classifyToolCall(record: ToolRecord): ClassifiedToolRecord {
  if (record.toolName === "read") {
    const normalizedPath = normalizePath(String(record.input?.path ?? ""));
    return {
      ...record,
      normalizedPath,
      classification: isGraphArtifactPath(normalizedPath) ? "graph" : "raw",
    };
  }

  if (record.toolName === "bash") {
    const command = String(record.input?.command ?? "");
    if (
      command.includes("graphify-out/GRAPH_REPORT.md") ||
      command.includes("graphify-out/wiki/index.md") ||
      command.includes("graphify-out/graph.json")
    ) {
      return { ...record, classification: "graph" };
    }
    if (isSearchLikeBash(command)) {
      return { ...record, classification: "raw" };
    }
  }

  return { ...record, classification: "neutral" };
}

function loadScenarios(filterId?: string): Scenario[] {
  const files = fs.readdirSync(scenariosDir).filter((file) => file.endsWith(".json")).sort();
  const scenarios = files.map((file) => {
    const fullPath = path.join(scenariosDir, file);
    return JSON.parse(fs.readFileSync(fullPath, "utf8")) as Scenario;
  });
  return filterId ? scenarios.filter((scenario) => scenario.id === filterId) : scenarios;
}

function writeScenarioFiles(cwd: string, scenario: Scenario) {
  for (const file of scenario.files) {
    const fullPath = path.join(cwd, file.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content);
  }
}

function matchesAcceptedRead(record: ClassifiedToolRecord, scenario: Scenario): boolean {
  if (record.toolName !== "read") return false;
  const normalized = normalizePath(record.normalizedPath);
  return scenario.acceptedFirstReads.includes(normalized);
}

function matchesPreferredRead(record: ClassifiedToolRecord, scenario: Scenario): boolean {
  if (!scenario.preferredFirstRead) return false;
  if (record.toolName !== "read") return false;
  return normalizePath(record.normalizedPath) === normalizePath(scenario.preferredFirstRead);
}

function getReadPaths(toolCalls: ClassifiedToolRecord[]): string[] {
  return toolCalls
    .filter((record) => record.toolName === "read" && record.normalizedPath)
    .map((record) => normalizePath(record.normalizedPath));
}

function hasAllRequiredReads(toolCalls: ClassifiedToolRecord[], scenario: Scenario): boolean {
  if (!scenario.requiredReads || scenario.requiredReads.length === 0) return true;
  const readPaths = new Set(getReadPaths(toolCalls));
  return scenario.requiredReads.every((requiredPath) => readPaths.has(normalizePath(requiredPath)));
}

function hasRequiredRawReadsAfterGraph(toolCalls: ClassifiedToolRecord[], scenario: Scenario): boolean {
  if (!scenario.requiredRawReadsAfterGraph || scenario.requiredRawReadsAfterGraph.length === 0) return true;

  const firstGraphIndex = toolCalls.findIndex((record) => record.classification === "graph");
  if (firstGraphIndex === -1) return false;

  const laterReads = new Set(
    toolCalls
      .slice(firstGraphIndex + 1)
      .filter((record) => record.toolName === "read" && record.normalizedPath)
      .map((record) => normalizePath(record.normalizedPath)),
  );

  return scenario.requiredRawReadsAfterGraph.every((requiredPath) => laterReads.has(normalizePath(requiredPath)));
}

function hasExpectedAnswerContent(assistantText: string, scenario: Scenario): boolean {
  if (!scenario.expectedAnswerIncludes || scenario.expectedAnswerIncludes.length === 0) return true;
  const normalizedText = assistantText.toLowerCase();
  return scenario.expectedAnswerIncludes.every((snippet) => normalizedText.includes(snippet.toLowerCase()));
}

function evaluateScenario(
  scenario: Scenario,
  records: ToolRecord[],
  assistantText: string,
  cwd: string,
  assistantStopReason?: string,
  assistantErrorMessage?: string,
): ScenarioResult {
  const toolCalls = records.map(classifyToolCall);
  const firstDecisive = toolCalls.find((record) => record.classification !== "neutral");
  const firstGraph = toolCalls.find((record) => record.classification === "graph");
  const firstRaw = toolCalls.find((record) => record.classification === "raw");

  const acceptedHit = !!firstDecisive && firstDecisive.classification === "graph" && matchesAcceptedRead(firstDecisive, scenario);
  const preferredHit = !!firstDecisive && firstDecisive.classification === "graph" && matchesPreferredRead(firstDecisive, scenario);
  const requiredReadsHit = hasAllRequiredReads(toolCalls, scenario);
  const requiredRawReadsAfterGraphHit = hasRequiredRawReadsAfterGraph(toolCalls, scenario);
  const expectedAnswerHit = hasExpectedAnswerContent(assistantText, scenario);

  let reason = "";
  if (!firstDecisive) {
    reason = "No decisive tool call observed before the turn ended.";
  } else if (firstDecisive.classification === "raw") {
    reason = `First decisive tool call was raw ${firstDecisive.toolName}, not a graph artifact.`;
  } else if (!acceptedHit) {
    reason = "First graph artifact read was not one of the accepted graphify entrypoints for this scenario.";
  } else if (!requiredReadsHit) {
    reason = "Scenario-specific required reads were not all observed in the trace.";
  } else if (!requiredRawReadsAfterGraphHit) {
    reason = "Scenario required targeted raw reads after graph inspection, but they were not observed.";
  } else if (!expectedAnswerHit) {
    reason = "Assistant answer did not include the scenario's expected grounding details.";
  } else if (scenario.preferredFirstRead && !preferredHit) {
    reason = `Accepted graph artifact was used first, but preferred target ${scenario.preferredFirstRead} was not chosen.`;
  } else {
    reason = "First decisive tool call used an accepted graphify artifact before raw repo inspection, and scenario-specific checks passed.";
  }

  return {
    id: scenario.id,
    description: scenario.description,
    pass: acceptedHit && requiredReadsHit && requiredRawReadsAfterGraphHit && expectedAnswerHit,
    preferredHit,
    acceptedHit,
    requiredReadsHit,
    requiredRawReadsAfterGraphHit,
    expectedAnswerHit,
    reason,
    firstDecisive,
    firstGraph,
    firstRaw,
    toolCalls,
    assistantText,
    assistantStopReason,
    assistantErrorMessage,
    cwd,
  };
}

async function resolveModel(modelSelector?: string) {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const availableModels = await modelRegistry.getAvailable();

  if (availableModels.length === 0) {
    throw new Error(
      "No available pi models found. Configure an API key for a supported provider or pass --model provider/id once available.",
    );
  }

  const selector = modelSelector ?? process.env.PI_EVAL_MODEL;
  const model = selector
    ? availableModels.find((candidate) => `${candidate.provider}/${candidate.id}` === selector)
    : availableModels[0];

  if (!model) {
    const available = availableModels.map((candidate) => `${candidate.provider}/${candidate.id}`).join(", ");
    throw new Error(`Requested model ${selector} is not available. Available models: ${available}`);
  }

  return { authStorage, modelRegistry, model };
}

async function runScenario(scenario: Scenario, deps: { authStorage: AuthStorage; modelRegistry: ModelRegistry; model: any }) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `graphify-live-${scenario.id}-`));
  const agentDir = path.join(cwd, ".pi-agent");
  fs.mkdirSync(agentDir, { recursive: true });
  writeScenarioFiles(cwd, scenario);

  const toolRecords: ToolRecord[] = [];
  let assistantText = "";

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    additionalExtensionPaths: [graphifyExtensionPath],
    extensionFactories: [
      (pi) => {
        pi.on("tool_call", async (event) => {
          toolRecords.push({
            toolName: event.toolName,
            input: event.input ? JSON.parse(JSON.stringify(event.input)) : undefined,
          });
          return undefined;
        });
      },
    ],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
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
    tools: ["read", "bash"],
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false, maxRetries: 0 },
    }),
  });

  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      assistantText += event.assistantMessageEvent.delta;
    }
  });

  let assistantStopReason: string | undefined;
  let assistantErrorMessage: string | undefined;

  try {
    await session.prompt(scenario.prompt);
    const lastMessage = session.messages.at(-1) as { stopReason?: string; errorMessage?: string } | undefined;
    assistantStopReason = lastMessage?.stopReason;
    assistantErrorMessage = lastMessage?.errorMessage;
  } finally {
    unsubscribe();
    session.dispose();
  }

  return evaluateScenario(scenario, toolRecords, assistantText, cwd, assistantStopReason, assistantErrorMessage);
}

function printHumanSummary(results: ScenarioResult[], modelLabel: string) {
  console.log(`graphify live evals · model ${modelLabel}`);
  for (const result of results) {
    const status = result.pass ? "PASS" : "FAIL";
    const first = result.firstDecisive
      ? `${result.firstDecisive.toolName}${result.firstDecisive.normalizedPath ? `:${result.firstDecisive.normalizedPath}` : ""}`
      : "none";
    console.log(`- ${status} ${result.id} · first decisive: ${first}`);
    console.log(`  ${result.reason}`);
    if (result.assistantErrorMessage) {
      console.log(`  model error: ${result.assistantErrorMessage}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const scenarios = loadScenarios(options.scenario);

  if (scenarios.length === 0) {
    throw new Error(options.scenario ? `No scenario found for id ${options.scenario}` : "No eval scenarios found.");
  }

  if (options.dryRun) {
    const payload = {
      ok: true,
      scenarios: scenarios.map((scenario) => ({
        id: scenario.id,
        description: scenario.description,
        acceptedFirstReads: scenario.acceptedFirstReads,
        preferredFirstRead: scenario.preferredFirstRead,
        requiredReads: scenario.requiredReads,
        requiredRawReadsAfterGraph: scenario.requiredRawReadsAfterGraph,
        expectedAnswerIncludes: scenario.expectedAnswerIncludes,
      })),
    };
    if (options.json) console.log(JSON.stringify(payload, null, 2));
    else console.log(`Validated ${scenarios.length} live eval scenario(s).`);
    return;
  }

  const deps = await resolveModel(options.model);
  const modelLabel = `${deps.model.provider}/${deps.model.id}`;
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    results.push(await runScenario(scenario, deps));
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const summary = {
    model: modelLabel,
    passed: results.filter((result) => result.pass).length,
    failed: results.filter((result) => !result.pass).length,
    results,
  };
  fs.writeFileSync(path.join(outputDir, "last-live.json"), JSON.stringify(summary, null, 2));

  if (options.json) console.log(JSON.stringify(summary, null, 2));
  else printHumanSummary(results, modelLabel);

  if (results.some((result) => !result.pass)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Live eval runner failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
