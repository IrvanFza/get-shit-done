---
type: Fixed
pr: 0
---

**Codex installer now emits canonical `[features].hooks` (not legacy `codex_hooks`)** — Codex's own source marks `codex_hooks` as a `legacy_key` ([codex-rs/features/src/legacy.rs](https://github.com/openai/codex/blob/main/codex-rs/features/src/legacy.rs)). The GSD installer was writing the deprecated key on every fresh install and reinstall, leaving deprecated config behind on Codex CLI ≥ 0.130.0. The installer now writes the canonical `[features].hooks = true` (section, root-dotted, and block-fallback forms), recognizes legacy `codex_hooks` as equivalent during reinstall, migrates it forward in-place, and strips either form on uninstall. User-owned preexisting `[features].hooks = true` lines are preserved untouched (per the #2760 defensive principle). Closes #3566.
