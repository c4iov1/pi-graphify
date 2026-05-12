import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

type LiveResult = {
  id: string;
  pass: boolean;
  preferredHit: boolean;
  acceptedHit: boolean;
  requiredReadsHit?: boolean;
  requiredRawReadsAfterGraphHit?: boolean;
  expectedAnswerHit?: boolean;
  reason: string;
  firstDecisive?: {
    toolName: string;
    normalizedPath?: string;
  };
};

type LiveSummary = {
  model: string;
  passed: number;
  failed: number;
  results: LiveResult[];
};

type JudgeResult = {
  id: string;
  pass: boolean;
  score: number;
  reasoning: string;
};

type JudgeSummary = {
  judgeModel: string;
  inputModel: string;
  passed: number;
  failed: number;
  judgments: JudgeResult[];
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const resultsDir = path.join(repoRoot, "evals", "results");
const livePath = path.join(resultsDir, "last-live.json");
const judgePath = path.join(resultsDir, "last-judge.json");
const reportPath = path.join(resultsDir, "last-report.md");

function parseArgs(argv: string[]) {
  return {
    json: argv.includes("--json"),
  };
}

function loadJson<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function icon(value: boolean | undefined) {
  if (value === undefined) return "—";
  return value ? "✅" : "❌";
}

function summarizeCounts(results: Array<{ pass: boolean }>) {
  return `${results.filter((result) => result.pass).length}/${results.length}`;
}

function buildMarkdown(live?: LiveSummary, judge?: JudgeSummary) {
  const liveResults = live?.results ?? [];
  const judgeById = new Map((judge?.judgments ?? []).map((item) => [item.id, item]));

  const lines: string[] = [];
  lines.push("# Graphify Eval Report");
  lines.push("");
  if (live) lines.push(`- Live model: \`${live.model}\``);
  if (judge) lines.push(`- Judge model: \`${judge.judgeModel}\``);
  lines.push(`- Live pass rate: ${summarizeCounts(liveResults)}`);
  if (judge) lines.push(`- Judge pass rate: ${summarizeCounts(judge.judgments)}`);
  lines.push("");
  lines.push("## Leaderboard");
  lines.push("");
  lines.push("| Scenario | Live | Judge | Score | First decisive | Required reads | Raw follow-up | Answer grounding |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");

  for (const result of liveResults) {
    const judgeResult = judgeById.get(result.id);
    const first = result.firstDecisive
      ? `${result.firstDecisive.toolName}${result.firstDecisive.normalizedPath ? `:${result.firstDecisive.normalizedPath}` : ""}`
      : "none";
    lines.push(
      `| ${result.id} | ${icon(result.pass)} | ${judgeResult ? icon(judgeResult.pass) : "—"} | ${judgeResult ? judgeResult.score : "—"} | ${first} | ${icon(result.requiredReadsHit)} | ${icon(result.requiredRawReadsAfterGraphHit)} | ${icon(result.expectedAnswerHit)} |`,
    );
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  for (const result of liveResults) {
    const judgeResult = judgeById.get(result.id);
    lines.push(`### ${result.id}`);
    lines.push(`- Live: ${result.reason}`);
    if (judgeResult) lines.push(`- Judge: ${judgeResult.reasoning}`);
    lines.push("");
  }

  return lines.join("\n");
}

function printCompactSummary(live?: LiveSummary, judge?: JudgeSummary) {
  const liveResults = live?.results ?? [];
  const judgeById = new Map((judge?.judgments ?? []).map((item) => [item.id, item]));

  console.log("graphify eval leaderboard");
  for (const result of liveResults) {
    const judgeResult = judgeById.get(result.id);
    const first = result.firstDecisive?.normalizedPath ?? result.firstDecisive?.toolName ?? "none";
    console.log(
      `${result.id.padEnd(24)} live ${result.pass ? "PASS" : "FAIL"} · judge ${judgeResult ? (judgeResult.pass ? "PASS" : "FAIL") : "—"} · first ${first}`,
    );
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const live = loadJson<LiveSummary>(livePath);
  const judge = loadJson<JudgeSummary>(judgePath);

  if (!live && !judge) {
    throw new Error("No eval results found. Run live and/or judge evals first.");
  }

  const markdown = buildMarkdown(live, judge);
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(reportPath, markdown);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          reportPath,
          liveModel: live?.model,
          judgeModel: judge?.judgeModel,
          livePassRate: live ? summarizeCounts(live.results) : undefined,
          judgePassRate: judge ? summarizeCounts(judge.judgments) : undefined,
        },
        null,
        2,
      ),
    );
  } else {
    printCompactSummary(live, judge);
    console.log(`\nWrote ${path.relative(repoRoot, reportPath)}`);
  }
}

main();
