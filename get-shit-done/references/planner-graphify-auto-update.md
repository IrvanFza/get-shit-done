# Planner — Graphify Auto-Update Awareness

> Loaded by `gsd-planner` and `gsd-phase-researcher` inside the `<step name="load_graph_context">` block, after the existing `graphify status` staleness check. Surfaces the most recent auto-update state from `.planning/graphs/.last-build-status.json`, the file written by the bundled `hooks/gsd-graphify-update.sh` PostToolUse hook (opt-in via `graphify.auto_update`, default `false` — issue #3347).

## Why this exists

The graph at `.planning/graphs/graph.json` is consumed automatically (every `gsd-planner` and `gsd-phase-researcher` step) but produced manually (one `/gsd:graphify build` per session at best). Without auto-update, the producer-consumer gap silently widens with every commit. The existing `stale: true` annotation tells the consumer the mtime is old; it cannot tell the consumer whether the auto-build hook has been running, just failed, or is in flight.

When `graphify.auto_update: true`, the hook writes a status file synchronously before detaching and rewrites it on completion. This reference instructs the planner to read that file and surface the state inline with the existing staleness note.

## The status file

`.planning/graphs/.last-build-status.json`:

```json
{
  "ts": "2026-05-15T14:02:23Z",
  "status": "running" | "ok" | "failed",
  "exit_code": null | <int>,
  "duration_ms": null | <int>,
  "head_at_build": "<commit-sha>",
  "graphify_version": null | "<version>"
}
```

The hook writes `status: "running"` synchronously **before** detach, so the next planner invocation can see the in-flight signal even if `graphify update .` has not finished. The detached `hooks/lib/gsd-graphify-rebuild.sh` rewrites the file to `ok` or `failed` on completion (with `exit_code` and `duration_ms`).

## Read the file

```bash
test -f .planning/graphs/.last-build-status.json && cat .planning/graphs/.last-build-status.json
```

If the file is absent, the operator either hasn't opted in to `graphify.auto_update` or hasn't yet performed a HEAD-advancing git op since enabling it. The annotation below is a no-op in that case.

## Format the annotation

Combine the status with the current `HEAD` sha when relevant. The first matching case wins:

| Status | `head_at_build` vs current HEAD | Annotation |
|--------|----------------------------------|------------|
| `running` | (any) | "Graph auto-rebuild in flight (started `{ts}`); treat semantic relationships as approximate until rebuild completes." |
| `failed` | (any) | "Graph auto-rebuild FAILED at `{ts}` (exit `{exit_code}`); the planning context below is from the prior build. Run `/gsd:graphify build` to retry manually." |
| `ok` | matches | (silent — graph is current at the current HEAD) |
| `ok` | differs | "Graph last rebuilt at `{ts}` for commit `{head_at_build[:7]}`; current HEAD has advanced — treat semantic relationships as approximate." |
| (file missing) | n/a | (silent — fall back to the existing `stale: true` annotation only) |

Get the current HEAD with `git rev-parse HEAD`.

## Interaction with the existing staleness note

If both the existing `stale: true` mtime check AND the auto-update annotation are non-silent, present them on the same line, ordered: auto-update state first, mtime staleness second. Example:

> "Graph auto-rebuild FAILED at 2026-05-15T14:02:23Z (exit 1); the planning context below is from the prior build. Run `/gsd:graphify build` to retry manually. (Existing graph is 36h old — treat semantic relationships as approximate.)"

## Opt-in reminder

The auto-update mechanism is opt-in (`graphify.auto_update: false` by default per issue #3347). Users who haven't opted in will never produce this file, and every annotation above is a no-op. The existing `stale: true` annotation continues to be the only signal.
