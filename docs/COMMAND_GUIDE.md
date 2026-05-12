# Command Reference Guide

Every command below assumes the `graphify` CLI is installed. If not:

```bash
pip install graphifyy
# or
uv tool install graphifyy
```

---

## `graphify .` — Build Graph

Build a knowledge graph for the current directory (or a target folder).

```bash
graphify .                         # current directory
graphify ./src                     # specific subfolder
graphify . --mode deep             # richer semantic edges (slower)
graphify . --directed              # preserve edge direction
```

**Flags:**

| Flag | Effect |
|---|---|
| `--mode deep` | Extracts richer inferred semantic edges at the cost of more time |
| `--directed` | Preserves edge direction in the output `graph.json` |
| `--wiki` | Writes a crawlable wiki to `graphify-out/wiki/index.md` |
| `--obsidian` | Exports to Obsidian format (`--obsidian-dir ~/vault`) |
| `--svg` | Writes `graph.svg` for visual inspection |
| `--graphml` | Writes `graph.graphml` for external tools |
| `--neo4j` | Writes `cypher.txt` for Neo4j import |

**When to use:** First time exploring a codebase, after a large refactor, or when setting up a new project for graph-based agent assistance.

---

## `graphify update .` — Incremental Update

Safe incremental update after code changes. Faster than a full rebuild because it reuses existing graph data and only re-processes modified files.

```bash
graphify update .
graphify . --update                    # alternative syntax
```

**When to use:** After editing code files in a session where a graph already exists. The extension detects staleness and prompts you to run this.

---

## `graphify cluster-only` — Recluster

Re-run community detection on the existing graph without re-extracting nodes or edges.

```bash
graphify cluster-only
graphify . --cluster-only              # alternative syntax
```

**When to use:** After adjusting clustering parameters or when the graph structure changed but node extraction is still valid.

---

## `graphify query` — Semantic Query

Ask natural-language questions about the codebase. The query traverses extracted and inferred graph edges to return relevant subgraphs.

```bash
graphify query "show the auth flow" --graph graphify-out/graph.json
graphify query "what connects DigestAuth to Response?" --graph graphify-out/graph.json
graphify query "find all modules depending on CacheStore" --graph graphify-out/graph.json
graphify query "explain the payment pipeline" --dfs --budget 1500
```

**Flags:**

| Flag | Effect |
|---|---|
| `--dfs` | Depth-first traversal (vs default breadth-first) |
| `--budget N` | Max nodes to traverse (default: 1000) |

**When to use:** Instead of `grep` for relationship questions. The graph has already extracted cross-module connections — let it answer directly.

---

## `graphify path` — Find Paths

Find shortest paths between two nodes in the graph. Useful for tracing data flow, dependency chains, or call graphs.

```bash
graphify path "AuthModule" "Database" --graph graphify-out/graph.json
graphify path "PaymentController" "QueueWorker" --graph graphify-out/graph.json
```

**When to use:** Understanding how two seemingly unrelated components connect, or tracing an indirect dependency.

---

## `graphify explain` — Explain Node

Get a detailed explanation of a single node — its role, connections, and significance in the graph.

```bash
graphify explain "SwinTransformer" --graph graphify-out/graph.json
graphify explain "DigestAuth" --graph graphify-out/graph.json
```

**When to use:** When you need to understand what a specific module or component does and how it fits into the architecture.

---

## `graphify clone` — Clone & Graph Remote Repo

Clone a public GitHub repository and build a graph for it in one step. Clones are cached at `~/.graphify/repos/<owner>/<repo>`.

```bash
graphify clone https://github.com/owner/repo
graphify clone https://github.com/owner/repo --branch feature-x
```

**When to use:** Analyzing an unfamiliar open-source project without manually cloning it first.

---

## `graphify merge-graphs` — Cross-Repository Merge

Merge graphs from multiple repositories into a single cross-repo graph. Nodes carry repo metadata so answers can distinguish origins.

```bash
graphify merge-graphs \
  repo-a/graphify-out/graph.json \
  repo-b/graphify-out/graph.json \
  --out graphify-out/cross-repo-graph.json
```

**When to use:** Microservice architectures, monorepo-with-subprojects, or any scenario where code lives across multiple repositories.

---

## `graphify watch .` — Continuous Watching

Watch the file system for changes and auto-rebuild the graph on every edit. Uses a debounce to avoid thrashing on bulk saves.

```bash
graphify watch .
python3 -m graphify.watch . --debounce 3   # 3-second debounce
```

**When to use:** Long agentic editing sessions where you want the graph to stay fresh without manual `update` commands.

---

## `graphify add <url>` — Ingest External Content

Fetch a URL (article, documentation, paper, video) into the corpus and rebuild the graph. The content is indexed alongside source code.

```bash
graphify add https://arxiv.org/abs/1706.03762
graphify add https://example.com/article --author "Name" --contributor "You"
```

**Note:** Video/audio transcription requires `pip install 'graphifyy[video]'`. Office/PDF extras may similarly need additional optional dependencies.

**When to use:** Adding external documentation, research papers, or API references to the knowledge graph so the agent can reason about them alongside code.

---

## `graphify serve` — MCP Server

Start an MCP (Model Context Protocol) stdio server for repeated structured graph queries. Preferred over reading `graph.json` directly when the graph is large or many queries are expected.

```bash
python -m graphify.serve graphify-out/graph.json
```

**Exposed tools:** `query_graph`, `get_node`, `get_neighbors`, `get_community`, `god_nodes`, `graph_stats`, `shortest_path`

**When to use:**
- The user will ask many graph questions in one session
- `graph.json` is too large to read directly
- Tool-level node/edge lookup is more reliable than text search

---

## `graphify hook` — Git Hooks

Install or check git hooks that auto-refresh the graph on post-commit and post-checkout.

```bash
graphify hook install      # install hooks
graphify hook status       # check if hooks are installed
graphify hook uninstall    # remove hooks
```

**When to use:** Teams where graph freshness across commits matters, or CI pipelines that consume graph artifacts.
