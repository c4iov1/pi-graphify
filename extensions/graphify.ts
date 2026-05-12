import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Constants ───────────────────────────────────────────────
const OUTPUT_FOLDER = process.env.GRAPHIFY_OUT || "graphify-out";
const FLAG_NEEDS_UPDATE = path.join(OUTPUT_FOLDER, "needs_update");
const FILE_GRAPH = path.join(OUTPUT_FOLDER, "graph.json");
const FILE_WIKI = path.join(OUTPUT_FOLDER, "wiki", "index.md");
const FILE_REPORT = path.join(OUTPUT_FOLDER, "GRAPH_REPORT.md");
// Callflow HTML auto-detected via detectCallflow()

const CODE_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".cs", ".dart", ".ex", ".exs", ".go",
  ".java", ".jl", ".js", ".jsx", ".kt", ".kts", ".lua", ".luau",
  ".m", ".mjs", ".mm", ".php", ".ps1", ".py", ".r", ".rb", ".rs",
  ".scala", ".sql", ".sv", ".swift", ".svelte", ".ts", ".tsx", ".v", ".vue", ".zig",
  // 0.7.x additions
  ".groovy", ".gradle",        // Groovy/Spock (0.7.8)
  ".f", ".f90", ".f95", ".f03", ".f08",  // Fortran (0.7.2)
  ".pas", ".pp", ".dpr", ".dpk", ".lpr", ".inc", ".dfm", ".lfm", ".lpk", // Pascal/Delphi (0.7.12)
  ".qmd",                      // Quarto (0.7.9)
]);

// ─── Types ───────────────────────────────────────────────────
interface ArtifactSnapshot {
  graphExists: boolean;
  reportExists: boolean;
  wikiExists: boolean;
  needsUpdateExists: boolean;
  callflowExists: boolean;
  reportLocation: string;
  wikiLocation: string;
  graphLocation: string;
  needsUpdateLocation: string;
  callflowLocation: string;
}

interface WeavePayload {
  type: string;
  text?: string;
  [key: string]: any;
}

// ─── Helpers ─────────────────────────────────────────────────
function fileExists(target: string): boolean {
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
}

function normalizePath(raw?: string): string {
  if (!raw) return "";
  return raw.startsWith("@") ? raw.slice(1) : raw;
}

function isInsideOutputDir(candidate?: string): boolean {
  if (!candidate) return false;
  const prefix = OUTPUT_FOLDER.replace(/\\/g, "/") + "/";
  return normalizePath(candidate).replace(/\\/g, "/").includes(prefix);
}

function matchesGraphArtifact(candidate?: string): boolean {
  const cleaned = normalizePath(candidate).replace(/\\/g, "/");
  const dir = OUTPUT_FOLDER.replace(/\\/g, "/") + "/";
  return (
    cleaned.includes(dir + "GRAPH_REPORT.md") ||
    cleaned.includes(dir + "wiki/index.md") ||
    cleaned.includes(dir + "graph.json") ||
    cleaned.includes(dir + "needs_update") ||
    // 0.7.x: callflow HTML
    new RegExp(
      dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^/]+-callflow\\.html$"
    ).test(cleaned)
  );
}

function isDiscoveryCommand(cmd?: string): boolean {
  if (!cmd) return false;
  return /(^|\s)(rg|grep|find|fd|ls|tree)(\s|$)/.test(cmd);
}

function isRebuildTrigger(cmd?: string): boolean {
  if (!cmd) return false;
  // Commands that rebuild the graph (update AST/cache)
  // NOT included: export, global, uninstall, --version, --help, hook-check, serve
  return (
    /(^|\s)graphify\s+(update|watch|cluster-only|extract)\b/.test(cmd) ||
    cmd.includes("from graphify.watch import _rebuild_code") ||
    cmd.includes("python -m graphify.watch") ||
    cmd.includes("python3 -m graphify.watch") ||
    cmd.includes("python -m graphify.extract") ||
    cmd.includes("python3 -m graphify.extract")
  );
}

function isCodeFile(candidate?: string): boolean {
  if (!candidate || isInsideOutputDir(candidate)) return false;
  const ext = path.extname(normalizePath(candidate)).toLowerCase();
  return CODE_EXTENSIONS.has(ext);
}

function didModifyCode(tool: string, input: Record<string, any> | undefined): boolean {
  if ((tool === "write" || tool === "edit") && isCodeFile(input?.path)) return true;
  if (tool !== "bash") return false;
  
  const cmdStr = String(input?.command ?? "");
  if (isRebuildTrigger(cmdStr)) return false;
  
  const hasCodeTool = /(^|\s)(python|python3|node|npm|pnpm|yarn|bun|go|cargo|ruby|perl|sed|awk)\b/.test(cmdStr);
  const hasWriteFlag = /(>|>>|--write|-w\b|--fix\b|format|fmt|prettier|eslint|ruff|black|cargo\s+fmt|gofmt)/.test(cmdStr);
  
  return hasCodeTool && hasWriteFlag;
}

function shouldIntercept(tool: string, input: Record<string, any> | undefined): boolean {
  if (tool === "grep" || tool === "find" || tool === "ls") return true;
  if (tool === "bash") return isDiscoveryCommand(input?.command);
  if (tool === "read") return !matchesGraphArtifact(input?.path);
  return false;
}

function injectNote(blocks: WeavePayload[], note: string): WeavePayload[] {
  if (!blocks?.length) return [{ type: "text", text: note }];

  const cloned = [...blocks];
  const idx = cloned.findIndex(b => b.type === "text");

  if (idx === -1) return [{ type: "text", text: note }, ...cloned];

  cloned[idx] = {
    ...cloned[idx],
    text: `${note}\n\n${cloned[idx].text ?? ""}`,
  };
  return cloned;
}

function detectCallflow(root: string): { exists: boolean; location: string } {
  // Callflow HTML: graphify-out/<project>-callflow.html
  // We glob for any *callflow.html in the output dir
  try {
    const dir = path.join(root, OUTPUT_FOLDER);
    if (!fileExists(dir)) return { exists: false, location: "" };
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry.endsWith("-callflow.html")) {
        return { exists: true, location: path.join(dir, entry) };
      }
    }
  } catch {
    // ignore
  }
  return { exists: false, location: "" };
}

function snapshotArtifacts(root: string): ArtifactSnapshot {
  const reportLoc = path.join(root, FILE_REPORT);
  const wikiLoc = path.join(root, FILE_WIKI);
  const graphLoc = path.join(root, FILE_GRAPH);
  const needsUpdateLoc = path.join(root, FLAG_NEEDS_UPDATE);
  const callflow = detectCallflow(root);

  return {
    graphExists: fileExists(graphLoc) || fileExists(reportLoc),
    reportExists: fileExists(reportLoc),
    wikiExists: fileExists(wikiLoc),
    needsUpdateExists: fileExists(needsUpdateLoc),
    callflowExists: callflow.exists,
    reportLocation: reportLoc,
    wikiLocation: wikiLoc,
    graphLocation: graphLoc,
    needsUpdateLocation: needsUpdateLoc,
    callflowLocation: callflow.location,
  };
}

function chooseArtifact(snap: ArtifactSnapshot): string {
  if (snap.wikiExists) return FILE_WIKI;
  if (snap.reportExists) return FILE_REPORT;
  return FILE_GRAPH;
}

// ─── Main Extension ──────────────────────────────────────────
export default function createGraphifyExtension(pi: ExtensionAPI) {
  let snapshot = snapshotArtifacts(process.cwd());
  let alreadyWarned = false;
  let sawGraph = false;
  let gaveFileHint = false;
  let gaveUpdateHint = false;
  let sessionHadChanges = false;

  const stalenessNote = (): string => {
    if (snapshot.needsUpdateExists || sessionHadChanges) {
      return " Graph may be stale because files changed; after inspecting it, run `graphify update .` before relying on modified areas.";
    }
    return "";
  };

  const buildReminder = (): string => {
    const pick = chooseArtifact(snapshot);
    return `graphify: Knowledge graph exists. Read ${pick} for god nodes and community structure before searching raw files.${stalenessNote()}`;
  };

  const updateBadge = (ctx: any) => {
    if (!snapshot.graphExists) {
      ctx.ui.setStatus("graphify", undefined);
      return;
    }

    const parts: string[] = [];
    if (snapshot.wikiExists) parts.push("wiki + report");
    else if (snapshot.reportExists) parts.push("report");
    else parts.push("graph");
    if (snapshot.callflowExists) parts.push("callflow");
    const label = parts.join(" · ");

    const warning = stalenessNote()
      ? " · update recommended"
      : "";

    ctx.ui.setStatus("graphify", `graphify active · ${label} available${warning}`);
  };

  // ── Event: turn_start ──
  pi.on("turn_start", async () => {
    alreadyWarned = false;
    sawGraph = false;
    gaveFileHint = false;
    gaveUpdateHint = false;
  });

  // ── Event: session_start ──
  pi.on("session_start", async (_evt, ctx) => {
    snapshot = snapshotArtifacts(ctx.cwd);
    alreadyWarned = false;
    sessionHadChanges = false;
    updateBadge(ctx);
  });

  // ── Command: /graphify ──
  pi.registerCommand("graphify", {
    description: "Run the graphify skill workflow (build, update, query, path, explain, clone, merge, MCP).",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      
      if (!ctx.isIdle()) {
        pi.sendUserMessage(`Use the graphify skill for this follow-up: ${trimmed || "."}`, { 
          deliverAs: "followUp" 
        });
        ctx.ui.notify("Queued /graphify request as a follow-up", "info");
        return;
      }
      
      pi.sendUserMessage(`Use the graphify skill now. User arguments: ${trimmed || "."}`);
    },
  });

  // ── Event: before_agent_start ──
  pi.on("before_agent_start", async (evt, ctx) => {
    snapshot = snapshotArtifacts(ctx.cwd);
    if (!snapshot.graphExists) return;

    const best = chooseArtifact(snapshot);
    const instructions = [
      "## graphify",
      "",
      `This project has a graphify knowledge graph at ${OUTPUT_FOLDER}/.`,
      "",
      "Rules:",
      `- Before answering architecture or codebase questions, read ${best} first.`,
      `- If ${FILE_WIKI} exists, navigate it instead of reading raw files when it is sufficient.`,
      `- If ${FILE_REPORT} exists, use it for god nodes and community structure.`,
      "- Prefer the graph summary before broad file searches.",
      "- For cross-module or relationship questions such as \"how does X relate to Y\", prefer `graphify query`, `graphify path`, or `graphify explain` over grep because those commands traverse EXTRACTED and INFERRED graph edges.",
      "- If the task asks for the next implementation file, debugging follow-up, or code confirmation, use the graph artifact to choose one targeted raw file and read it before answering.",
      "- Never invent a source path from a component name. If the graph artifact gives an exact path, use that exact path. If it does not, do one narrow lookup to find the existing path and then read it before answering.",
      "- After you have inspected a graph artifact this turn, do not go back and re-orient with broad raw searches unless the graph artifacts were insufficient.",
      `- If ${FLAG_NEEDS_UPDATE} exists or code files changed in this session, tell the user the graph may be stale and run \`graphify update .\` before relying on modified areas.`,
      "",
      "New in 0.7.x:",
      "- `graphify extract <path>` — headless LLM extraction for CI (no IDE needed). Costs API credits on paid backends.",
      "- `graphify export callflow-html` — generates a Mermaid architecture/call-flow HTML page from the graph.",
      "- `graphify global add/remove/list/path` — cross-project global graph in ~/.graphify/global.json.",
      "- Callflow HTML auto-regenerates on every `graphify watch` rebuild and post-commit hook if the file already exists.",
      "- `graphify uninstall [--purge]` — remove graphify from all platforms.",
    ].join("\n");

    return {
      systemPrompt: `${evt.systemPrompt}\n\n${instructions}`,
    };
  });

  // ── Event: tool_result ──
  pi.on("tool_result", async (evt, ctx) => {
    snapshot = snapshotArtifacts(ctx.cwd);
    const payload = evt.input as Record<string, any> | undefined;

    // Rebuild detected → reset and refresh
    if (evt.toolName === "bash" && isRebuildTrigger(payload?.command)) {
      sessionHadChanges = false;
      updateBadge(ctx);
      return;
    }

    // Code was modified → warn about staleness
    if (snapshot.graphExists && didModifyCode(evt.toolName, payload)) {
      sessionHadChanges = true;
      updateBadge(ctx);
      
      if (!gaveUpdateHint) {
        gaveUpdateHint = true;
        return {
          content: injectNote(
            evt.content as WeavePayload[],
            "graphify: Code changed while a knowledge graph exists. Run `graphify update .` after this edit before relying on graph answers about modified areas.",
          ),
        };
      }
    }

    if (!snapshot.graphExists) return;

    // User read a graph artifact → suggest reading one real file next
    const readArtifact = evt.toolName === "read" && matchesGraphArtifact(payload?.path);
    
    if (readArtifact) {
      sawGraph = true;
      if (gaveFileHint) return;
      gaveFileHint = true;

      return {
        content: injectNote(
          evt.content as WeavePayload[],
          `graphify: Graph artifact inspected. If the task asks for implementation confirmation, the next file to debug, or code ownership, now read one targeted raw file chosen from the graph before answering. Use an exact path from the graph when available; otherwise do one narrow lookup for the real path. Avoid broad raw searches and do not invent file paths from component names.${stalenessNote()}`,
        ),
      };
    }

    // Generic reminder if user hasn't seen graph yet
    if (sawGraph || alreadyWarned) return;
    if (!shouldIntercept(evt.toolName, payload)) return;

    alreadyWarned = true;
    return {
      content: injectNote(
        evt.content as WeavePayload[],
        buildReminder(),
      ),
    };
  });
}