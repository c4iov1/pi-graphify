---
name: graphify
description: >
  Build, update, query, and explore graphify knowledge graphs inside pi.
  Activate for architecture questions, /graphify commands, GRAPH_REPORT.md,
  graph.json, wiki navigation, graph freshness checks, clone/merge operations,
  MCP access, or converting code/docs/papers/images/audio/video into a
  persistent graph structure.
---

# graphify — pi skill reference

Requires graphify >= 0.5 (`graphify` CLI).

---

## Core honesty rules

- Do not dump the full `graph.json` unless it is small and genuinely required.
- Prefer wiki, report, or CLI query output over raw file searching.
- Never fabricate edges, file paths, or ownership from node labels alone.
- When an artifact provides an exact file path, use it directly. When it does not, run one narrow lookup before reading the file.
- When a graph is stale, say so explicitly and run or suggest `graphify update .`.
- Always cite which graph artifact was consulted and keep summaries brief.

---

## How the pi extension works

Installing graphify also registers a pi extension that makes graph awareness passive:

- When `graphify-out/GRAPH_REPORT.md` is present → pi reads it before broad file search
- When `graphify-out/wiki/index.md` is present → wiki is preferred for crawlable navigation
- When only `graphify-out/graph.json` exists → used as fallback map
- `/graphify ...` is registered as a pi command that hands off to this skill
- When `graphify-out/needs_update` is present or source files changed mid-session → agent is instructed to run `graphify update .`

### Artifact priority

For any architecture or codebase question in a project with existing graph output, consult artifacts in this order:

1. **`graphify-out/wiki/index.md`** — start here if present and sufficient
2. **`graphify-out/GRAPH_REPORT.md`** — god nodes and community topology
3. **`graphify-out/graph.json`** — fallback when wiki/report are absent or deep inspection is needed

---

## CLI reference

```bash
# ── Build ────────────────────────────────────────────────────────────────────
graphify .                                       # graph current directory
graphify ./raw                                   # graph a specific subfolder
graphify https://github.com/owner/repo           # clone repo and graph it
graphify https://github.com/owner/repo --branch main
graphify . --mode deep                           # richer semantic edge inference

# ── Update ───────────────────────────────────────────────────────────────────
graphify update .                                # incremental update after edits
graphify . --update                              # skill-compatible update flag
graphify cluster-only                            # recluster without re-extracting
graphify . --cluster-only

# ── Export formats ───────────────────────────────────────────────────────────
graphify . --directed                            # preserve edge direction in graph.json
graphify . --wiki                                # generate graphify-out/wiki/
graphify . --obsidian --obsidian-dir ~/vaults/project
graphify . --svg
graphify . --graphml
graphify . --neo4j                               # write cypher.txt
graphify . --neo4j-push bolt://localhost:7687

# ── Query ────────────────────────────────────────────────────────────────────
graphify query "show the auth flow" --graph graphify-out/graph.json
graphify query "what connects DigestAuth to Response?" --dfs --budget 1500
graphify path  "AuthModule" "Database"  --graph graphify-out/graph.json
graphify explain "SwinTransformer"      --graph graphify-out/graph.json

# ── Ingest ───────────────────────────────────────────────────────────────────
graphify add https://example.com/post
graphify add https://example.com/post --author "Name" --contributor "You"
graphify . --mcp                                 # start MCP stdio server

# ── Automation ───────────────────────────────────────────────────────────────
graphify watch .                                 # or: python3 -m graphify.watch . --debounce 3
graphify hook install
graphify hook status

# ── Multi-repo ───────────────────────────────────────────────────────────────
graphify merge-graphs \
  repo1/graphify-out/graph.json \
  repo2/graphify-out/graph.json \
  --out graphify-out/cross-repo-graph.json
```

---

## Response patterns

### After build / update

```
Built/updated the graph at graphify-out/.
Read graphify-out/GRAPH_REPORT.md.
Top god nodes: ...
Surprising connections: ...
Suggested follow-up questions: ...
```

### After query / path / explain

```
Queried graphify-out/graph.json with `graphify query ...`.
Relevant nodes/edges: ...
Source files cited by the graph: ...
Confidence caveat: EXTRACTED vs INFERRED/AMBIGUOUS where relevant.
```

---

## Workflows

### A — Fresh build

Use when no `graphify-out/` exists or the user explicitly requests a graph.

```bash
graphify .
```

Before a large or potentially slow build, gauge corpus size first:

```bash
find . -maxdepth 3 -type f | wc -l
find . -maxdepth 3 -type d \( -name node_modules -o -name .git -o -name dist -o -name build \) \
  -prune -o -type f -print | head -50
```

If the corpus is enormous, ask the user which subfolder to target. Honor `.graphifyignore` for exclusions.

After building, read `graphify-out/GRAPH_REPORT.md` and surface only:

- **God Nodes**
- **Surprising Connections**
- **Suggested Questions**

Do not reproduce the full report unless the user asks for it.

---

### B — Existing graph → answer graph-first

1. Determine which artifacts are present: `wiki/index.md`, `GRAPH_REPORT.md`, `graph.json`
2. Read the best available artifact **before** reaching for grep or find
3. Use graph edges to select targeted raw files — only when implementation confirmation is needed
4. For cross-module or relationship questions, prefer CLI traversal over grep:
   ```bash
   graphify query   "QUESTION"  --graph graphify-out/graph.json
   graphify path    "A" "B"     --graph graphify-out/graph.json
   graphify explain "NODE"      --graph graphify-out/graph.json
   ```
5. If the graph genuinely lacks the information, say so — never invent nodes, edges, or file paths

---

### C — Update after code changes

When source files changed during the session or `graphify-out/needs_update` is present:

```bash
graphify update .
```

Prefer `update` over a full rebuild — it reuses prior extraction data and only reprocesses modified files. `graphify . --update` is the older equivalent flag.

For topology-only changes (no re-extraction needed):

```bash
graphify cluster-only
graphify . --cluster-only
```

---

### D — Query, path, explain

Let the graph traverse relationships instead of using grep.

```bash
graphify query   "show the auth flow"              --graph graphify-out/graph.json
graphify path    "AuthModule"    "Database"        --graph graphify-out/graph.json
graphify explain "DigestAuth"                      --graph graphify-out/graph.json
```

Cite source files and line locations from the command output when available.

---

### E — Remote clone and cross-repo graphs

One-step clone + graph for any public repository:

```bash
graphify clone https://github.com/owner/repo
graphify clone https://github.com/owner/repo --branch feature-x
```

Clones land in `~/.graphify/repos/<owner>/<repo>` and are reused across calls.
When a user runs `/graphify https://github.com/owner/repo`, resolve the local path and treat it as the corpus.

Multi-repo analysis:

```bash
graphify clone https://github.com/owner/repo-a
graphify clone https://github.com/owner/repo-b

graphify ~/.graphify/repos/owner/repo-a
graphify ~/.graphify/repos/owner/repo-b

graphify merge-graphs \
  ~/.graphify/repos/owner/repo-a/graphify-out/graph.json \
  ~/.graphify/repos/owner/repo-b/graphify-out/graph.json \
  --out graphify-out/cross-repo-graph.json
```

Merged nodes carry repo metadata so answers can distinguish which codebase each part belongs to.

---

### F — Ingest URLs and media

Pull external content into the corpus:

```bash
graphify add https://arxiv.org/abs/1706.03762
graphify add https://example.com/article --author "Author" --contributor "Your Name"
graphify add https://youtube.com/watch?v=...    # requires video extras
```

Video and audio transcription require optional dependencies:

```bash
pip install 'graphify[video]'
```

Office and PDF parsing may require additional packages as well.
If a command reports a missing optional dependency, relay the exact install hint from the error to the user.

---

### G — MCP server

For sessions with many structured graph queries, use the MCP server instead of loading `graph.json` into context.

```bash
python -m graphify.serve graphify-out/graph.json
```

Available tools: `query_graph`, `get_node`, `get_neighbors`, `get_community`, `god_nodes`, `graph_stats`, `shortest_path`

**Use MCP when:**
- Multiple graph questions are expected in one session
- `graph.json` is too large to read directly
- Tool-level node/edge lookup is more precise than text search

**Use CLI when:**
- A single focused answer is sufficient

---

### H — Watch mode and git hooks

Keep the graph fresh automatically during long editing sessions:

```bash
graphify watch .
```

Source changes trigger automatic rebuilds. Non-source edits write `graphify-out/needs_update` instead, signaling that a manual update is needed.

For commit-based freshness:

```bash
graphify hook install     # register post-commit / post-checkout hooks
graphify hook status
graphify hook uninstall
```
---
