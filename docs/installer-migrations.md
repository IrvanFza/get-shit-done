# Installer Migration Architecture

This document defines the migration layer for GSD installs and upgrades.
It is for contributors who need to retire files, move install surfaces,
rewrite runtime config, or preserve user data while changing how GSD is
installed.

After reading this document, a contributor should be able to add a new
installer migration without guessing which files are safe to remove or how
to protect local user changes.

## Problem

The installer already handles several upgrade behaviors:

- replacing GSD-managed command, skill, agent, hook, and engine files
- backing up locally modified managed files before replacement
- preserving known user-owned artifacts
- cleaning old hook files and hook registrations
- rewriting runtime-specific configuration formats
- rolling back some failed Codex installs

Those behaviors are currently distributed across install branches. That
works for isolated fixes, but it makes feature retirement risky. A future
change can remove a file from the package while leaving stale installed
copies behind, or delete a user-created file because it happens to live
inside a GSD-managed directory.

The migration layer exists to make upgrade behavior explicit, reviewed, and
repeatable.

## Design Goals

1. Protect user data by default.
2. Remove stale GSD-managed files when a feature is retired.
3. Make destructive actions visible before they run.
4. Record what happened so future installs do not re-run the same migration.
5. Give each runtime the same safety model, even when the concrete files differ.
6. Keep migration authoring small enough that contributors use it instead of
   adding another one-off cleanup block.

## Non-Goals

- This is not a general package manager.
- This is not a database migration system.
- This does not automatically infer every historical install layout.
- This does not remove arbitrary user files.
- This does not replace the existing install transforms in one step.

## Terms

**Managed file**

A file that GSD installed and recorded in the install manifest. Managed files
can be replaced automatically when unchanged. If changed locally, they must be
backed up or merged.

**User-owned file**

A file created or maintained by a user workflow or by the user directly. These
files must never be removed just because they sit under a GSD directory.

**Unknown file**

A file found under an install root that is not in the manifest and is not
classified as user-owned. Unknown files are preserved unless a migration
explicitly classifies them with evidence.

**Migration**

A versioned change set that can inspect the current install, produce a plan,
and apply that plan after safety checks pass.

**Plan**

A list of proposed filesystem and config actions. A plan is safe to show to a
user. It describes what will happen and why, without mutating disk.

**Journal**

A per-run record of applied actions and rollback data. It exists so failed
installs can restore the pre-run state where possible.

## State Files

The migration layer uses the existing file manifest and adds one install-state
record.

### File Manifest

The existing manifest remains the ownership baseline. It records the installed
GSD version, install mode, and hashes for distribution-owned files.

The invariant is strict:

- distribution-owned files are manifest-tracked
- user-owned files are preserved and omitted from manifest hashes
- a path cannot be both

### Install State

The installer writes an install-state file next to the manifest.

Required fields:

```json
{
  "schema": 1,
  "runtime": "codex",
  "scope": "global",
  "installed_version": "1.50.0",
  "install_mode": "full",
  "applied_migrations": [
    {
      "id": "2026-05-11-codex-hooks-layout",
      "package_version": "1.50.0",
      "checksum": "sha256:...",
      "applied_at": "2026-05-11T00:00:00.000Z"
    }
  ]
}
```

The checksum is calculated from the migration definition. If an applied
migration's checksum changes, the installer must warn and refuse to silently
re-run it. Fix-forward migrations should use a new migration id.

## Migration Record

Each migration exports a plain record plus pure planning logic.

Required fields:

```js
module.exports = {
  id: '2026-05-11-runtime-layout-example',
  title: 'Move legacy commands into runtime skills',
  introducedIn: '1.50.0',
  runtimes: ['claude', 'codex', 'gemini'],
  scopes: ['global', 'local'],
  destructive: true,
  plan(ctx) {
    return [];
  }
};
```

The `plan(ctx)` function receives an install context with runtime, scope,
target directory, previous manifest, install state, package manifest, and
filesystem helpers. It returns actions. It must not mutate disk.

Migrations may use helper predicates such as:

- `isManaged(relPath)`
- `isUserOwned(relPath)`
- `hashMatchesManifest(relPath)`
- `exists(relPath)`
- `readJson(relPath)`
- `readToml(relPath)`

## Action Types

Migrations produce a small set of action types. The executor owns mutation,
backup, rollback, and reporting.

### remove-managed

Remove a path only when it is known to be GSD-managed and unchanged from the
previous manifest, or when the migration provides a purpose-built detector for
an old GSD-owned shape.

Use for retired hooks, old generated agents, deprecated command files, and
stale runtime-specific generated artifacts.

### backup-and-remove

Back up a managed path before removal because the file differs from the
previous manifest. The user gets a clear report and can inspect the backup.

Use when a feature retires a managed file that users may have patched.

### move-managed

Move a managed path to a new managed path. If the source was locally modified,
the action becomes `backup-and-move` or a conflict.

Use for layout migrations such as command directories moving into skills.

### rewrite-config

Rewrite a structured config file through a parser or existing structural helper.
String replacement is only acceptable for narrowly-scoped marker blocks with
tests for line-ending and ordering variations.

Use for runtime config, hook registrations, feature flags, and generated
agent registration blocks.

### preserve-user

Declare that a path is user-owned and must survive surrounding directory
replacement. This action is informational in dry-run output and becomes a
copy-through or restore operation during apply.

Use for profile, preferences, hand-authored instructions, and future workflow
outputs.

### prompt-user

Stop non-interactive destructive migration and ask in interactive mode. The
prompt must present concrete choices such as preserve, back up, remove, or
move. The default is preserve.

Use when classification is ambiguous and guessing could lose data.

## Execution Flow

The installer runs migrations before materializing the new package payload.

1. Build install context.
2. Read prior manifest and install state.
3. Build a pre-run snapshot for paths that may be touched.
4. Discover pending migrations by runtime, scope, and applied state.
5. Ask each pending migration for a plan.
6. Merge plans and validate them.
7. Print the plan in dry-run form.
8. Apply safe non-interactive actions.
9. Prompt or stop for ambiguous actions.
10. Write the new package payload.
11. Write the new manifest and install state.
12. Report backups, preserved files, removed stale files, and skipped actions.

If any apply step fails, the executor uses the journal to restore modified
paths where possible. Rollback must never delete files that were not created
or modified by the current installer run.

## Dry Run

The migration runner supports a dry-run mode that prints the plan and exits
without changes.

Dry-run output groups actions by risk:

- will preserve
- will replace unchanged managed files
- will remove stale managed files
- will back up locally modified files
- needs user choice
- blocked

The same planner powers dry-run and apply. There must not be a separate
"preview-only" code path.

## Safety Policy

### Ownership

Never remove an unknown file. Unknown files are preserved unless a migration
contains a specific detector proving the file is a stale GSD artifact.

### Modification Detection

When a path is in the previous manifest:

- hash match means unchanged managed file
- hash mismatch means locally modified managed file
- missing means already removed by the user and should stay removed unless a
  migration explicitly needs to recreate it

### User-Owned Artifacts

User-owned artifacts are defined once and consumed by both preservation and
manifest-writing code. Adding a user-owned artifact requires a regression test
that proves it is preserved across reinstall and omitted from the manifest.

### Config Files

Runtime config is mixed ownership. GSD may own marker blocks, generated agent
sections, or hook entries, but it does not own the whole file unless the file
was created as a GSD-only file. Config migrations should remove or rewrite
only the owned portion.

### Rollback

Before applying a migration, the executor records enough data to restore:

- file bytes before overwrite
- directory membership before removing generated directories
- config bytes before structured rewrite
- paths created by the current run
- temporary files created by atomic writes

Rollback is best-effort but must be loud when incomplete.

## First-Time Baseline Migration

The first migration should classify an existing install rather than attempt
to fix every historical layout.

It should:

1. read the current manifest if present
2. scan known runtime install surfaces
3. classify files as managed, user-owned, or unknown
4. report stale GSD-looking files that are not in the current manifest
5. offer actions for ambiguous files instead of deleting them
6. write install state after successful classification

This baseline is the escape hatch for old installs that predate full migration
tracking. It gives the user a reviewable redistribution/removal plan without
requiring the installer to infer every past release transition perfectly.

## Authoring Workflow

When a feature removes or moves install artifacts, the PR must include:

1. a migration record
2. tests for dry-run plan output
3. tests for apply behavior
4. tests for locally modified managed files
5. tests for user-owned files near the changed path
6. an update to release notes if the migration affects user-visible install
   behavior

The author must answer these questions in the migration file:

- What old artifact or config shape is being retired?
- How do we prove it is GSD-owned?
- What happens if the user modified it?
- What happens if it is missing?
- What runtime and scope does it affect?
- Is the action safe in non-interactive install?

## Test Matrix

Every migration runner change should cover:

- fresh install with no prior state
- reinstall with matching manifest
- upgrade with pending migration
- locally modified managed file
- unknown file under a GSD directory
- user-owned file under a wiped directory
- failed apply with rollback
- global and local install scopes when applicable
- Windows path separators when paths are serialized
- CRLF input when config files are rewritten

## Implementation Sequence

1. Extract install ownership helpers around the manifest and user-owned artifact list.
2. Add install-state read/write helpers.
3. Add migration record discovery and checksum calculation.
4. Add planner-only dry-run support.
5. Add executor with journaled file actions.
6. Port orphaned hook/file cleanup into the first explicit migration.
7. Port one structured config rewrite into the migration runner.
8. Add the baseline classifier for existing installs.
9. Make new install-affecting PRs require migrations when artifacts are moved,
   renamed, or retired.

This sequence keeps the first implementation small: the existing installer
continues to materialize files, while the migration runner takes ownership of
cleanup, classification, and reviewable destructive changes.

## Prior Art

The design borrows from established upgrade systems:

- Flyway versioned migrations: ordered, once-only changes tracked by checksum.
- Flyway dry runs: preview planned mutations before applying them.
- Liquibase changesets and preconditions: declarative changes gated by current
  system state.
- Debian conffile policy: preserve local configuration and distinguish package
  ownership from user ownership.
- npm lifecycle scripts: useful as packaging context, but not sufficient as the
  migration mechanism because uninstall and upgrade context are limited.
