# Installer Migration Module owns install-time upgrade safety

- **Status:** Accepted
- **Date:** 2026-05-11

We decided to introduce an explicit Installer Migration Module for install-time file moves, removals, config rewrites, and user-data preservation. Installer upgrade behavior must be represented as versioned migration records that produce a dry-run plan before applying changes.

## Decision

- Add an Installer Migration Module as the owner for upgrade migrations.
- Keep the existing installer materialization pipeline, but move cleanup and feature-retirement behavior into migration records over time.
- Track applied migrations in an install-state file next to the existing file manifest.
- Treat the existing file manifest as the managed-file ownership baseline.
- Treat user-owned artifacts as a single shared policy consumed by preservation and manifest writing.
- Require migrations to plan first, then apply through a shared executor that owns backup, rollback, and reporting.
- Default ambiguous or unknown files to preserve; destructive changes need managed-file evidence or explicit user choice.
- Support dry-run output using the same planner used by apply mode.

## Consequences

- Retiring features requires an explicit migration instead of a hidden cleanup block.
- The installer can remove stale GSD-owned artifacts without guessing about user files.
- Locally modified managed files get a consistent backup path before removal or replacement.
- Future rollback work can become runtime-neutral instead of Codex-specific.
- Migration authors must define ownership evidence, conflict behavior, runtime scope, and non-interactive behavior.
- The installer gains another state file, so tests must cover missing, legacy, and checksum-mismatch state.

## Scope

The first implementation should extract manifest/user-owned helpers, add install-state persistence, add migration planning, and port one existing orphan cleanup into the migration runner. It should not rewrite every runtime installer branch in the first pass.

The detailed module contract lives in `docs/installer-migrations.md`.
