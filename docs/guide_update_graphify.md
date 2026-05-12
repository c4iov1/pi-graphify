# Update Guide: pi-graphify ↔ graphify upstream

> **Purpose:** This document is a self-contained guide for AI agents. When given the instruction _"read `docs/guide_update_graphify.md` and update the extension"_, the agent should be able to execute the entire flow without additional prompts.

---

## TL;DR — What to do

1. Discover the current version supported by pi-graphify
2. Discover the latest version of graphify upstream
3. Read the CHANGELOG between the two versions
4. Apply changes to the 4 repository files
5. Run tests and validate

---

## Step 1 — Identify the current version

Read `skills/graphify/SKILL.md` and locate the line:

```
Requires graphify >= X.Y
```

This is the **minimum version currently supported** by pi-graphify. Note it as `CURRENT_VERSION`.

---

## Step 2 — Identify the latest graphify version

Check **one** of these sources (in order of preference):

1. **Repository CHANGELOG:** `https://raw.githubusercontent.com/safishamsi/graphify/v7/CHANGELOG.md`
2. **GitHub Releases:** `https://github.com/safishamsi/graphify/releases`
3. **PyPI:** `https://pypi.org/project/graphifyy/`

Note it as `LATEST_VERSION`. If `LATEST_VERSION == CURRENT_VERSION`, **stop here** — nothing to update.

---

## Step 3 — Read the CHANGELOG

Read the full graphify CHANGELOG and extract **only the entries between `CURRENT_VERSION` and `LATEST_VERSION`**. For each entry, classify it into one of these categories:

| Category | Impact on pi-graphify | Examples |
|---|---|---|
| **New language/format** | Add extension to `CODE_EXTENSIONS` in `graphify.ts` and to the table in `SKILL.md` | `.luau`, `.groovy`, `.sql` |
| **New CLI command** | Document in `SKILL.md` (CLI reference + workflow) and in `COMMAND_GUIDE.md` | `graphify extract`, `graphify global` |
| **New flag on existing command** | Add to command documentation in `SKILL.md` and `COMMAND_GUIDE.md` | `--dedup-llm`, `--force` |
| **New output artifact** | Update detection in `graphify.ts`, status badge, and documentation | `*-callflow.html` |
| **Artifact name/structure change** | Update paths and regex in `graphify.ts` | Directory renames |
| **New LLM backend** | Add to backends table in `SKILL.md` and `COMMAND_GUIDE.md` | Ollama, Bedrock |
| **Bug fix with no extension impact** | **Skip** — no change required | Internal Python fixes |
| **Change to graph.json structure** | Assess whether it affects anything in `graphify.ts` | New JSON fields |

---

## Step 4 — Apply changes

### 4.1 — `extensions/graphify.ts`

This is the most critical file. Check each area:

#### CODE_EXTENSIONS

The `CODE_EXTENSIONS` set defines which file extensions are considered "code" for staleness detection purposes (when the agent edits a code file, the graph is marked as stale).

- Compare the current set with the list of extensions that graphify upstream processes
- The canonical list is in the graphify README under "What files it handles"
- Add any new extension that exists upstream but not in the local set
- Keep the organization: base extensions in alphabetical order, new extensions with a version comment

#### Output artifacts

If graphify introduced **new artifacts** in the `graphify-out/` directory:

1. Update the `ArtifactSnapshot` interface — add `*Exists: boolean` and `*Location: string` fields
2. Update `snapshotArtifacts()` — detect the new artifact
3. Assess whether it should be added to `matchesGraphArtifact()` — graph files that the agent should be able to read without triggering a redirect
4. Assess whether it should be added to `chooseArtifact()` — if it's a preferred artifact for reading
5. Update `updateBadge()` — if it should appear in the status badge

#### Rebuild triggers

If graphify introduced **new commands that rebuild the graph**:

1. Update `isRebuildTrigger()` — add the regex pattern
2. Commands that do **NOT** rebuild the graph (export, serve, query, etc.) must **NOT** be triggers

#### GRAPHIFY_OUT

Ensure that `isInsideOutputDir()` and `matchesGraphArtifact()` use `OUTPUT_FOLDER` (which reads `process.env.GRAPHIFY_OUT`) instead of literal `"graphify-out/"` strings.

#### System prompt

If there are important new commands that the agent should know about, add them to the "New in X.Y" section of the prompt injected in `before_agent_start`.

### 4.2 — `skills/graphify/SKILL.md`

This is the document that the pi agent reads to know how to use graphify. It must reflect 100% of what the CLI offers.

- [ ] **Minimum version:** Update `Requires graphify >= X.Y` to the new version
- [ ] **CLI reference:** Add new commands/flags in the code block section
- [ ] **Languages table:** Add new file extensions
- [ ] **Backends table:** Add new LLM backends if any
- [ ] **Workflows:** Create a new workflow if there is an entirely new flow (pattern: sequential letter, I, J, K, ...)
- [ ] **Artifact priority:** Update if there is a new artifact in the fallback chain
- [ ] **Response patterns:** Update if there are new response formats
- [ ] **Honesty rules:** Update if there are new cost or security warnings

**Rule:** Keep the YAML frontmatter intact. Do not change `name:` or the `description:` structure.

### 4.3 — `docs/COMMAND_GUIDE.md`

- [ ] Add a section for each new CLI command
- [ ] Update flags for existing commands
- [ ] Update backends tables if needed
- [ ] Follow the pattern: title with command, code block, flags table, "When to use"

### 4.4 — `README.md`

- [ ] Update the "CLI quick reference" table with new commands
- [ ] Update "What happens when a graph exists" section if there are new artifacts
- [ ] Update the version in the title/badge if it's a major bump
- [ ] Update the badge status table if the badge format changed

---

## Step 5 — Validation

### 5.1 — Run existing tests

```bash
npm run evals
```

**All 12+ tests must pass.** If any test breaks, the most likely cause is:

- `matchesGraphArtifact()` or `isInsideOutputDir()` with altered regex/string that affects existing paths
- `updateBadge()` generating a different badge format than tests expect
- `chooseArtifact()` with new priority that changes the fallback order

### 5.2 — Validate package

```bash
npm run pack:check
```

### 5.3 — Assess new tests

For each new feature added to `graphify.ts`, consider whether a new test scenario is needed in `evals/graphify-agent.test.ts`. Test pattern:

```typescript
test("agent eval: <behavior description>", async () => {
  const cwd = makeProject({ /* required artifacts */ });
  const { call, statusUpdates } = mountExtension(cwd);

  // Simulate the event
  const result = await call("<event_name>", { /* payload */ });

  // Verify the result
  assert.ok(result?.content);
  assert.match(result.content[0].text, /<expected pattern>/);
});
```

---

## Step 6 — Document the update

Update `docs/TODO.md`:
- Mark completed tasks with `[x]`
- Update the reference version in the header

---

## Consistency Checklist

Before finishing, verify that all sources agree:

| Data point | graphify.ts | SKILL.md | COMMAND_GUIDE.md | README.md |
|---|---|---|---|---|
| Code extensions | `CODE_EXTENSIONS` | Languages table | — | — |
| CLI commands | — | CLI reference | Command sections | CLI quick reference |
| Output artifacts | `snapshotArtifacts()` | Artifact priority | — | "What happens" |
| LLM backends | — | Backends table | Backends table | — |
| Minimum version | — | `Requires graphify >= X.Y` | — | Badge/title |
| Status badge | `updateBadge()` | — | — | Status table |

If any column disagrees, fix it so all sources reflect the same information.

---

## Quick References

| Resource | URL |
|---|---|
| CHANGELOG | `https://raw.githubusercontent.com/safishamsi/graphify/v7/CHANGELOG.md` |
| README upstream | `https://github.com/safishamsi/graphify/blob/v7/README.md` |
| PyPI | `https://pypi.org/project/graphifyy/` |
| Releases | `https://github.com/safishamsi/graphify/releases` |
| ARCHITECTURE | `https://github.com/safishamsi/graphify/blob/v7/ARCHITECTURE.md` |
