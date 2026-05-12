# pi-graphify

**Knowledge graphs, always-on for pi coding agents (graphify 0.7.x ready).**

`pi-graphify` is a Pi extension and skill package that brings knowledge-graph-first reasoning into [pi](https://github.com/earendil-works/pi) coding sessions. It wraps [graphify](https://github.com/safishamsi/graphify) — a Python knowledge graph engine — making graph awareness an automatic part of every agent turn.

Instead of hunting through raw files, your agent consults a pre-built knowledge graph: community structure, god nodes, cross-module relationships — all at the agent's fingertips.

## Why pi-graphify?

Coding agents are powerful, but they tend to over-`grep`. When facing an unfamiliar codebase, the default instinct is broad raw search, which burns tokens and misses architectural context. `pi-graphify` changes that:

- **Graph-first prompts** — the extension injects graph guidance into the agent's system prompt when `graphify-out/` exists
- **Smart artifact routing** — wiki over report over raw `graph.json`, depending on what's available
- **Stale graph detection** — warns when code changes in-session or `needs_update` is present
- **Cross-module queries** — prefers `graphify query`, `graphify path`, `graphify explain` over grep for relationship questions
- **Native `/graphify` command** — registered as a first-class Pi command, delegates to the skill

## Quick install

```bash
# From npm (published package)
pi install npm:pi-graphify

```

Graphify itself is a Python CLI. If you don't have it yet:

```bash
pip install graphifyy
# or
uv tool install graphifyy
```

## How it works

### The extension (`extensions/graphify.ts`)

The extension hooks into pi's lifecycle to make graph awareness automatic:

| Hook | What it does |
| --- | --- |
| `before_agent_start` | Injects graph-first rules into the system prompt |
| `tool_result` | Reminds the agent before raw reads/search; detects code edits to flag staleness |
| `turn_start` | Resets per-turn reminder state to prevent spamming |
| `session_start` | Refreshes graph state and sets the UI status indicator |

The status indicator in pi's UI shows:

| State | Indicator |
| --- | --- |
| No graph | *(hidden)* |
| Wiki + report available | `graphify active · wiki + report available` |
| Report only | `graphify active · report available` |
| graph.json only | `graphify active · graph available` |
| Callflow available | `graphify active · report · callflow available` |
| Stale (needs_update) | `graphify active · report available · update recommended` |

### The skill (`skills/graphify/SKILL.md`)

A comprehensive Agent Skill that documents build, update, query, path, explain, clone, merge, MCP, and safety workflows. Activated via:

```text
/skill:graphify .
/skill:graphify update .
/skill:graphify query "show the auth flow"
```

### The command

```text
/graphify .
/graphify update .
/graphify query "show the auth flow"
/graphify path "AuthModule" "Database"
/graphify explain "DigestAuth"
/graphify https://github.com/owner/repo
```

## What happens when a graph exists

1. The agent reads `graphify-out/wiki/index.md` first (if present) — it's crawlable and structured
2. Falls back to `graphify-out/GRAPH_REPORT.md` for god nodes and community structure
3. Falls back to `graphify-out/<project>-callflow.html` (0.7.13+) for Mermaid call-flow diagrams grouped by community
4. Falls back to `graphify-out/graph.json` when nothing else exists
5. Uses graph edges to pick one targeted raw file — never invents paths from labels
6. For "how does X relate to Y" questions, runs `graphify query` / `graphify path` / `graphify explain` instead of grep
7. If code changed during the session, recommends `graphify update .` before trusting graph answers about modified areas

## CLI quick reference

| Command | Purpose |
|---|---|
| `graphify .` | Build graph for current directory |
| `graphify update .` | Safe incremental update after edits |
| `graphify extract <path>` | Headless LLM extraction for CI (0.7.3+) |
| `graphify export callflow-html` | Generate architecture call-flow HTML (0.7.13+) |
| `graphify query` | Natural-language query against the graph |
| `graphify path` | Find shortest paths between nodes |
| `graphify explain` | Explain a specific node's role |
| `graphify clone` | Clone a remote repo and build its graph |
| `graphify merge-graphs` | Merge graphs from multiple repos |
| `graphify global` | Cross-project global graph (0.7.7+) |
| `graphify watch` | Auto-rebuild on file changes |
| `graphify add` | Ingest external content (URLs, docs, media) |
| `graphify serve` | Start an MCP server for repeated queries |
| `graphify hook` | Install git hooks for auto-refresh |
| `graphify uninstall` | Remove graphify from all platforms (0.7.11+) |

See the **[full command guide](docs/COMMAND_GUIDE.md)** for detailed usage, flags, and examples.

## Project structure

```
extensions/graphify.ts          # Pi extension (always-on hooks)
skills/graphify/SKILL.md        # Agent Skill (workflow docs)
docs/COMMAND_GUIDE.md           # Detailed command reference
evals/                          # Automated eval suite
```

## Evals

Deterministic and LLM-driven evals verify graph-first behavior, staleness detection, redirect-loop prevention, and command delegation.

```bash
npm run evals              # deterministic tests
npm run evals:live         # model-in-the-loop live evals
npm run evals:judge        # LLM-as-judge scoring
npm run evals:full         # full pipeline
```

## Maintainer

Maintained by [@c4iov1](https://github.com/c4iov1).

## License

MIT — see [LICENSE](LICENSE).
