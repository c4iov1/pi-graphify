# Graphify Judge Rubric

You are grading whether an agent followed the intended graph-first behavior in a project that has graphify output.

## Core policy

The agent should inspect a graphify artifact before broad raw repo inspection when graphify output exists.

Accepted graphify artifacts are scenario-specific, but usually include:
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/wiki/index.md`
- `graphify-out/graph.json`

Also respect any scenario-specific requirements such as:
- `requiredReads`
- `requiredRawReadsAfterGraph`
- `expectedAnswerIncludes`

## Pass criteria

A run should pass when:
1. The first decisive inspection action is an accepted graphify artifact read.
2. No raw source file read or broad repo search happens before that accepted graphify artifact read.
3. If the scenario requires additional reads or targeted raw follow-up after graph inspection, those requirements are satisfied.
4. If the scenario requires answer grounding details, the final answer includes them.
5. If the prompt asks the agent to mention what it inspected first, the final answer should be consistent with the observed trace.

## Neutral actions

These should not automatically fail the run if they happen before the decisive inspection step:
- no-op status checks
- `pwd`
- other non-search shell commands that do not inspect repo contents

## Fail criteria

Fail when:
- the agent reads a raw source file before any accepted graphify artifact
- the agent performs a broad repo search before any accepted graphify artifact
- the agent never uses a tool when the prompt explicitly requires tool use
- the agent skips scenario-specific required reads or targeted raw follow-up
- the final answer omits required grounding details or contradicts the tool trace about what was inspected first
- the agent run terminates with an error before performing the required inspection

## Output requirements

Return strict JSON only with this shape:

```json
{
  "verdict": "pass" | "fail",
  "score": 0.0,
  "reasoning": "short paragraph",
  "findings": ["short finding"],
  "criteria": {
    "graph_before_raw": true,
    "used_accepted_graph_artifact": true,
    "mentioned_first_artifact_consistently": true
  }
}
```

Scoring guidance:
- `1.0` clear pass
- `0.7-0.9` mostly correct with minor issues
- `0.4-0.6` ambiguous or mixed behavior
- `0.0-0.3` clear fail
