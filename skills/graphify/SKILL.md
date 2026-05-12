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

Requires graphify >= 0.7 (`graphify` CLI). Compatible with 0.5.x and 0.6.x for basic commands.

---

## Core honesty rules

- Do not dump the full `graph.json` unless it is small and genuinely required.
- Prefer wiki, report, or CLI query output over raw file searching.
- Never fabricate edges, file paths, or ownership from node labels alone.
- When an artifact provides an exact file path, use it directly. When it does not, run one narrow lookup before reading the file.
- When a graph is stale, say so explicitly and run or suggest `graphify update .`.
- Always cite which graph artifact was consulted and keep summaries brief.
- **API cost warning:** `graphify extract` uses paid LLM backends (Gemini, Claude, OpenAI) by default. Prefer free backends like Ollama when iterating, or use AST-only build commands (`graphify .`) which cost nothing.

---

## How the pi extension works

Installing graphify also registers a pi extension that makes graph awareness passive:

- When `graphify-out/GRAPH_REPORT.md` is present → pi reads it before broad file search
- When `graphify-out/wiki/index.md` is present → wiki is preferred for crawlable navigation
- When only `graphify-out/graph.json` exists → used as fallback map
- `/graphify ...` is registered as a pi command that hands off to this skill
- When `graphify-out/needs_update` is present or source files changed mid-session → agent is instructed to run `graphify update .`
- When `graphify-out/<project>-callflow.html` exists → callflow architecture page is available for visual navigation

### Artifact priority

For any architecture or codebase question in a project with existing graph output, consult artifacts in this order:

1. **`graphify-out/wiki/index.md`** — start here if present and sufficient
2. **`graphify-out/GRAPH_REPORT.md`** — god nodes and community topology
3. **`graphify-out/<project>-callflow.html`** — Mermaid call-flow diagrams grouped by community (0.7.x)
4. **`graphify-out/graph.json`** — fallback when wiki/report are absent or deep inspection is needed

---

## CLI reference

```bash
# ── Build ────────────────────────────────────────────────────────────────────
graphify .                                       # graph current directory
graphify ./raw                                   # graph a specific subfolder
graphify https://github.com/owner/repo           # clone repo and graph it
graphify https://github.com/owner/repo --branch main
graphify . --mode deep                           # richer semantic edge inference
graphify . --no-viz                              # skip HTML visualization (0.6.x)
graphify . --watch                               # auto-sync as files change (0.7.x)
graphify . --mcp                                 # start MCP stdio server inline (0.7.x)
graphify . --dedup-llm                           # LLM tiebreaker for ambiguous entities (0.7.5)
graphify check-update ./src                      # check if update is needed (0.7.x)

# ── Update ───────────────────────────────────────────────────────────────────
graphify update .                                # incremental update after edits
graphify . --update                              # skill-compatible update flag
graphify update . --force                        # bypass safety check / GRAPHIFY_FORCE=1 (0.6.5)
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

# ── Headless extract (0.7.3+) ────────────────────────────────────────────────
graphify extract ./docs                          # semantic extraction without IDE
graphify extract ./docs --backend gemini         # explicit backend
graphify extract ./docs --backend gemini --model gemini-3.1-pro-preview
graphify extract ./docs --backend ollama         # local inference (free)
graphify extract ./docs --backend bedrock        # AWS Bedrock via IAM
graphify extract ./docs --max-workers 16         # AST parallelism
graphify extract ./docs --token-budget 30000     # smaller chunks for small models
graphify extract ./docs --max-concurrency 2      # fewer parallel LLM calls
graphify extract ./docs --api-timeout 900        # longer HTTP timeout (default 600s)
graphify extract ./docs --no-cluster             # skip clustering
graphify extract ./docs --dedup-llm              # LLM tiebreaker for entities
graphify extract ./docs --google-workspace       # export GDrive before extraction
graphify extract ./docs --global --as myrepo     # extract + register into global graph

# ── Callflow export (0.7.13+) ────────────────────────────────────────────────
graphify export callflow-html                    # generate architecture HTML
graphify export callflow-html --max-sections 8   # cap architecture sections
graphify export callflow-html --output docs/arch.html

# ── Cross-project global graph (0.7.7+) ──────────────────────────────────────
graphify global add graphify-out/graph.json myrepo   # register into ~/.graphify/global.json
graphify global remove myrepo                         # unregister
graphify global list                                  # show registered repos
graphify global path                                  # print global graph location

# ── Query ────────────────────────────────────────────────────────────────────
graphify query "show the auth flow" --graph graphify-out/graph.json
graphify query "what connects DigestAuth to Response?" --dfs --budget 1500
graphify path  "AuthModule" "Database"  --graph graphify-out/graph.json
graphify explain "SwinTransformer"      --graph graphify-out/graph.json

# ── Ingest ───────────────────────────────────────────────────────────────────
graphify add https://example.com/post
graphify add https://example.com/post --author "Name" --contributor "You"
graphify add https://youtube.com/watch?v=...       # requires graphifyy[video]

# ── Automation ───────────────────────────────────────────────────────────────
graphify watch .                                 # or: python3 -m graphify.watch . --debounce 3
graphify hook install
graphify hook status
graphify hook uninstall

# ── Multi-repo ───────────────────────────────────────────────────────────────
graphify merge-graphs \
  repo1/graphify-out/graph.json \
  repo2/graphify-out/graph.json \
  --out graphify-out/cross-repo-graph.json

# ── Platform management ──────────────────────────────────────────────────────
graphify uninstall                               # remove from all platforms (0.7.11)
graphify uninstall --purge                       # also delete graphify-out/
graphify --version                               # print installed version (0.7.15)
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
Built at commit: <hash>                         # (0.7.0+ embedded in graph.json)
```

### After query / path / explain

```
Queried graphify-out/graph.json with `graphify query ...`.
Relevant nodes/edges: ...
Source files cited by the graph: ...
Confidence caveat: EXTRACTED vs INFERRED/AMBIGUOUS where relevant.
In 0.7.x cross-file calls with explicit imports are EXTRACTED (promoted from INFERRED).
```

### After callflow export

```
Generated graphify-out/<project>-callflow.html.
Opens in any browser — Mermaid diagrams grouped by community.
```

---

## Languages and file types

| Type | Extensions | Requirements |
|---|---|---|
| Code (AST, local) | `.py .ts .js .jsx .tsx .mjs .go .rs .java .c .cpp .h .hpp .rb .cs .kt .scala .php .swift .lua .luau .zig .ps1 .ex .exs .m .mm .jl .vue .svelte .groovy .gradle .dart .v .sv .sql .f .f90 .f95 .f03 .f08 .pas .pp .dpr .dpk .lpr .inc .dfm .lfm .lpk .r .qmd` | None (tree-sitter) |
| Docs | `.md .mdx .qmd .html .txt .rst .yaml .yml` | Semantic pass-through |
| Office | `.docx .xlsx` | `graphifyy[office]` |
| Google Workspace | `.gdoc .gsheet .gslides` | `graphifyy[google]` + `gws auth` |
| PDFs | `.pdf` | Semantic pass-through |
| Images | `.png .jpg .webp .gif` | Semantic pass-through |
| Video / Audio | `.mp4 .mov .mp3 .wav` | `graphifyy[video]` |
| YouTube / URLs | any video URL | `graphifyy[video]` |

Code extraction is local (tree-sitter, no API calls). Everything else uses the agent's model or headless LLM backend.

---

## Workflows

### A — Fresh build

Use when no `graphify-out/` exists or the user explicitly requests a graph.

```bash
graphify .
graphify . --dedup-llm     # with LLM entity tiebreaker
graphify . --no-viz        # skip HTML, just report + JSON
graphify . --watch         # build + watch for changes
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
- **Built at commit** (0.7.0+)

Do not reproduce the full report unless the user asks for it.

**Note:** Since 0.7.5, every build runs automatic entity deduplication (MinHash/LSH + Jaro-Winkler) — near-duplicate entities are collapsed before clustering. The `--dedup-llm` flag adds an LLM tiebreaker for ambiguous pairs.

---

### B — Existing graph → answer graph-first

1. Determine which artifacts are present: `wiki/index.md`, `GRAPH_REPORT.md`, `*-callflow.html`, `graph.json`
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

Since 0.7.5, `--update` is incremental with semantic cache by content hash — unchanged files cost zero LLM tokens on repeat runs. `graphify . --update` is the older equivalent flag.

Force an update even when the graph would shrink (e.g. after large deletions):

```bash
graphify update . --force
GRAPHIFY_FORCE=1 graphify update .
```

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

Cite source files and line locations from the command output when available. In 0.7.x, cross-file calls with explicit imports are marked EXTRACTED (promoted from INFERRED) — confidence is higher than in 0.5.x/0.6.x.

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
pip install 'graphifyy[video]'
```

Office and PDF parsing may require additional packages as well.
If a command reports a missing optional dependency, relay the exact install hint from the error to the user.

---

### G — MCP server

For sessions with many structured graph queries, use the MCP server instead of loading `graph.json` into context.

```bash
python -m graphify.serve graphify-out/graph.json

# Register with Kimi Code:
kimi mcp add --transport stdio graphify -- python -m graphify.serve graphify-out/graph.json
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

Since 0.7.13, callflow HTML auto-regenerates on every watch rebuild and post-commit hook if the file already exists (opt-in by existence, zero config).

For commit-based freshness:

```bash
graphify hook install     # register post-commit / post-checkout hooks
graphify hook status      # (also sets up git merge driver for graph.json since 0.7.0)
graphify hook uninstall
```

---

### I — Headless extract (CI/CD, no IDE)

Use `graphify extract` when the agent has no IDE session or you want to pre-extract documentation, images, and media before the session starts. Unlike `graphify .` (AST-only), this runs semantic LLM extraction on non-code files.

```bash
graphify extract ./docs                          # auto-detect backend
graphify extract ./docs --backend gemini         # explicit backend
graphify extract ./docs --backend ollama         # free, local
graphify extract ./docs --backend bedrock        # AWS IAM
```

**Backends and env vars:**

| Backend | Env var | Extra |
|---|---|---|
| Gemini | `GEMINI_API_KEY` / `GOOGLE_API_KEY` | `graphifyy[gemini]` |
| Claude | `ANTHROPIC_API_KEY` | baked in |
| OpenAI | `OPENAI_API_KEY` | `graphifyy[openai]` |
| Kimi | `MOONSHOT_API_KEY` | `graphifyy[kimi]` |
| Ollama | `OLLAMA_BASE_URL` (default `http://localhost:11434`) | `graphifyy[ollama]` |
| Bedrock | AWS credential chain | `graphifyy[bedrock]` |

**Cost warning:** Gemini, Claude, OpenAI, and Kimi are paid APIs. Ollama runs locally for free. Bedrock charges per-token through AWS. Always mention cost implications before running.

Since 0.7.5, repeated `graphify extract` runs are incremental — only changed files are re-extracted, and semantic results are cached by content hash.

---

### J — Cross-project global graph

Register multiple project graphs into a single global graph at `~/.graphify/global.json`. Useful for microservice architectures or monorepos.

```bash
graphify global add graphify-out/graph.json myrepo     # register
graphify global add path/to/other/graph.json other-repo
graphify global list                                    # show all
graphify global path                                    # print path
graphify global remove myrepo                           # unregister
```

Or register during extraction:

```bash
graphify extract ./docs --global --as myrepo
```

Node IDs are prefixed with `<repo>::` to prevent silent collisions across projects.

---

### K — Callflow architecture export

Generate a self-contained Mermaid call-flow HTML page from the graph, grouped by community:

```bash
graphify export callflow-html
graphify export callflow-html --max-sections 8
graphify export callflow-html --output docs/arch.html
```

The output is a standalone HTML file at `graphify-out/<project>-callflow.html`. It features interactive zoom/pan diagrams, call detail tables, and graph report highlights. Opens in any browser.

Since 0.7.13, callflow auto-regenerates on every `graphify watch` rebuild and post-commit hook if the file already exists.
---
