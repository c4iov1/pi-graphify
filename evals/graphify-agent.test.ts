import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import graphifyPiExtension from "../extensions/graphify.ts";

type Handler = (event: any, ctx: any) => any | Promise<any>;

const REPORT_REL = path.join("graphify-out", "GRAPH_REPORT.md");
const WIKI_REL = path.join("graphify-out", "wiki", "index.md");
const GRAPH_REL = path.join("graphify-out", "graph.json");
const NEEDS_UPDATE_REL = path.join("graphify-out", "needs_update");

// Cross-platform path matcher: accepts both / and \\ separators
function pathPattern(segments: string[]): RegExp {
  return new RegExp(segments.join("[/\\\\]+"));
}

function makeProject(options: { report?: boolean; wiki?: boolean; graph?: boolean; needsUpdate?: boolean } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-graphify-eval-"));

  if (options.report) {
    const reportPath = path.join(dir, REPORT_REL);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, "# Graph report\n");
  }

  if (options.wiki) {
    const wikiPath = path.join(dir, WIKI_REL);
    fs.mkdirSync(path.dirname(wikiPath), { recursive: true });
    fs.writeFileSync(wikiPath, "# Wiki index\n");
  }

  if (options.graph) {
    const graphPath = path.join(dir, GRAPH_REL);
    fs.mkdirSync(path.dirname(graphPath), { recursive: true });
    fs.writeFileSync(graphPath, "{}\n");
  }

  if (options.needsUpdate) {
    const needsUpdatePath = path.join(dir, NEEDS_UPDATE_REL);
    fs.mkdirSync(path.dirname(needsUpdatePath), { recursive: true });
    fs.writeFileSync(needsUpdatePath, "non-code files changed\n");
  }

  return dir;
}

function mountExtension(cwd: string) {
  const handlers = new Map<string, Handler>();
  const commands = new Map<string, any>();
  const statusUpdates: Array<{ key: string; value: string | undefined }> = [];
  const notifications: Array<{ message: string; level: string }> = [];
  const sentMessages: Array<{ message: string; options?: any }> = [];

  graphifyPiExtension({
    on(name: string, handler: Handler) {
      handlers.set(name, handler);
    },
    registerCommand(name: string, command: any) {
      commands.set(name, command);
    },
    sendUserMessage(message: string, options?: any) {
      sentMessages.push({ message, options });
    },
  } as any);

  const ctx = {
    cwd,
    idle: true,
    isIdle() {
      return this.idle;
    },
    ui: {
      setStatus(key: string, value: string | undefined) {
        statusUpdates.push({ key, value });
      },
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
    },
  };

  async function call(name: string, event: any = {}) {
    const handler = handlers.get(name);
    assert.ok(handler, `expected ${name} handler to be registered`);
    return handler(event, ctx);
  }

  async function command(name: string, args = "") {
    const registered = commands.get(name);
    assert.ok(registered, `expected ${name} command to be registered`);
    return registered.handler(args, ctx);
  }

  return { call, command, commands, statusUpdates, notifications, sentMessages, ctx };
}

test("agent eval: injects graphify guidance into the system prompt when a report exists", async () => {
  const cwd = makeProject({ report: true });
  const { call } = mountExtension(cwd);

  const result = await call("before_agent_start", { systemPrompt: "BASE" });

  assert.ok(result?.systemPrompt);
  assert.match(result.systemPrompt, /This project has a graphify knowledge graph at graphify-out\//);
  assert.match(result.systemPrompt, pathPattern(["graphify-out", "GRAPH_REPORT.md"]));
  assert.match(result.systemPrompt, /Prefer the graph summary before broad file searches\./);
  assert.match(result.systemPrompt, /graphify query/);
  assert.match(result.systemPrompt, /graphify path/);
  assert.match(result.systemPrompt, /graphify explain/);
  assert.match(result.systemPrompt, /graphify update \./);
});

test("agent eval: reminds on raw file reads and points the agent at GRAPH_REPORT first", async () => {
  const cwd = makeProject({ report: true });
  const { call } = mountExtension(cwd);

  await call("turn_start");
  const result = await call("tool_result", {
    toolName: "read",
    input: { path: "src/index.ts" },
    content: [{ type: "text", text: "raw file contents" }],
  });

  assert.ok(result?.content);
  assert.match(result.content[0].text, pathPattern(["Read graphify-out", "GRAPH_REPORT.md"]));
  assert.match(result.content[0].text, /before searching raw files/);
  assert.match(result.content[0].text, /raw file contents/);
});

test("agent eval: prefers the graph wiki over raw file navigation when wiki exists", async () => {
  const cwd = makeProject({ report: true, wiki: true });
  const { call } = mountExtension(cwd);

  await call("turn_start");
  const result = await call("tool_result", {
    toolName: "bash",
    input: { command: "rg -n auth src" },
    content: [{ type: "text", text: "search output" }],
  });

  assert.ok(result?.content);
  assert.match(result.content[0].text, pathPattern(["Read graphify-out", "wiki", "index.md"]));
  assert.doesNotMatch(result.content[0].text, pathPattern(["Read graphify-out", "GRAPH_REPORT.md"]));
});

test("agent eval: graph artifact reads are recognized and never trigger a graph-first redirect loop", async () => {
  const cwd = makeProject({ report: true, wiki: true, graph: true });
  const { call } = mountExtension(cwd);

  await call("turn_start");
  const reportRead = await call("tool_result", {
    toolName: "read",
    input: { path: REPORT_REL },
    content: [{ type: "text", text: "report" }],
  });
  const wikiRead = await call("tool_result", {
    toolName: "read",
    input: { path: WIKI_REL },
    content: [{ type: "text", text: "wiki" }],
  });
  const graphRead = await call("tool_result", {
    toolName: "read",
    input: { path: GRAPH_REL },
    content: [{ type: "text", text: "graph" }],
  });
  const atGraphRead = await call("tool_result", {
    toolName: "read",
    input: { path: `@${GRAPH_REL}` },
    content: [{ type: "text", text: "graph alias" }],
  });

  assert.ok(reportRead?.content);
  assert.match(reportRead.content[0].text, /Graph artifact inspected/);
  assert.equal(wikiRead, undefined);
  assert.equal(graphRead, undefined);
  assert.equal(atGraphRead, undefined);
});

test("agent eval: reminder fires once per turn and resets on the next turn", async () => {
  const cwd = makeProject({ report: true, graph: true });
  const { call } = mountExtension(cwd);

  await call("turn_start");
  const first = await call("tool_result", {
    toolName: "read",
    input: { path: "src/a.ts" },
    content: [{ type: "text", text: "a" }],
  });
  const second = await call("tool_result", {
    toolName: "read",
    input: { path: "src/b.ts" },
    content: [{ type: "text", text: "b" }],
  });

  assert.ok(first?.content);
  assert.equal(second, undefined);

  await call("turn_start");
  const third = await call("tool_result", {
    toolName: "read",
    input: { path: "src/c.ts" },
    content: [{ type: "text", text: "c" }],
  });

  assert.ok(third?.content);
  assert.match(third.content[0].text, pathPattern(["Read graphify-out", "GRAPH_REPORT.md"]));
});

test("agent eval: graph artifact reads add targeted follow-up guidance and suppress later graph-first reminders", async () => {
  const cwd = makeProject({ report: true, wiki: true });
  const { call } = mountExtension(cwd);

  await call("turn_start");
  const graphRead = await call("tool_result", {
    toolName: "read",
    input: { path: WIKI_REL },
    content: [{ type: "text", text: "wiki content" }],
  });
  const laterRawRead = await call("tool_result", {
    toolName: "read",
    input: { path: "src/router.ts" },
    content: [{ type: "text", text: "router code" }],
  });

  assert.ok(graphRead?.content);
  assert.match(graphRead.content[0].text, /Graph artifact inspected/);
  assert.match(graphRead.content[0].text, /read one targeted raw file/);
  assert.equal(laterRawRead, undefined);
});

test("agent eval: falls back to graph.json when it is the only graphify artifact", async () => {
  const cwd = makeProject({ graph: true });
  const { call, statusUpdates } = mountExtension(cwd);

  const promptResult = await call("before_agent_start", { systemPrompt: "BASE" });
  await call("session_start");
  await call("turn_start");
  const reminderResult = await call("tool_result", {
    toolName: "bash",
    input: { command: "find src -maxdepth 2 -type f" },
    content: [{ type: "text", text: "search output" }],
  });

  assert.match(promptResult.systemPrompt, pathPattern(["graphify-out", "graph.json first"]));
  assert.deepEqual(statusUpdates.at(-1), {
    key: "graphify",
    value: "graphify active · graph available",
  });
  assert.match(reminderResult.content[0].text, pathPattern(["Read graphify-out", "graph.json"]));
});

test("agent eval: session status shows graphify availability", async () => {
  const cwd = makeProject({ report: true, wiki: true });
  const { call, statusUpdates } = mountExtension(cwd);

  await call("session_start");

  assert.deepEqual(statusUpdates.at(-1), {
    key: "graphify",
    value: "graphify active · wiki + report available",
  });
});

test("agent eval: needs_update marks the graph stale in prompt, status, and reminders", async () => {
  const cwd = makeProject({ report: true, graph: true, needsUpdate: true });
  const { call, statusUpdates } = mountExtension(cwd);

  const promptResult = await call("before_agent_start", { systemPrompt: "BASE" });
  await call("session_start");
  await call("turn_start");
  const reminderResult = await call("tool_result", {
    toolName: "read",
    input: { path: "src/index.ts" },
    content: [{ type: "text", text: "raw" }],
  });

  assert.match(promptResult.systemPrompt, /needs_update/);
  assert.match(promptResult.systemPrompt, /graphify update \./);
  assert.deepEqual(statusUpdates.at(-1), {
    key: "graphify",
    value: "graphify active · report available · update recommended",
  });
  assert.match(reminderResult.content[0].text, /Graph may be stale/);
  assert.match(reminderResult.content[0].text, /graphify update \./);
});

test("agent eval: code edits mark graph stale and graphify update clears the status", async () => {
  const cwd = makeProject({ report: true, graph: true });
  const { call, statusUpdates } = mountExtension(cwd);

  await call("session_start");
  await call("turn_start");
  const editResult = await call("tool_result", {
    toolName: "edit",
    input: { path: "src/router.ts" },
    content: [{ type: "text", text: "edited" }],
  });

  assert.ok(editResult?.content);
  assert.match(editResult.content[0].text, /Code changed while a knowledge graph exists/);
  assert.deepEqual(statusUpdates.at(-1), {
    key: "graphify",
    value: "graphify active · report available · update recommended",
  });

  await call("tool_result", {
    toolName: "bash",
    input: { command: "graphify update ." },
    content: [{ type: "text", text: "updated" }],
  });

  assert.deepEqual(statusUpdates.at(-1), {
    key: "graphify",
    value: "graphify active · report available",
  });
});

test("agent eval: registers a native /graphify command that delegates to the skill", async () => {
  const cwd = makeProject({ report: true });
  const { command, sentMessages } = mountExtension(cwd);

  await command("graphify", "query auth flow");

  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].message, /Use the graphify skill now/);
  assert.match(sentMessages[0].message, /query auth flow/);
});

test("agent eval: busy /graphify command queues a follow-up", async () => {
  const cwd = makeProject({ report: true });
  const { command, sentMessages, notifications, ctx } = mountExtension(cwd);
  ctx.idle = false;

  await command("graphify", "update .");

  assert.equal(sentMessages.length, 1);
  assert.deepEqual(sentMessages[0].options, { deliverAs: "followUp" });
  assert.match(sentMessages[0].message, /update \./);
  assert.deepEqual(notifications.at(-1), {
    message: "Queued /graphify request as a follow-up",
    level: "info",
  });
});
