# Changelog

## v2.0.0 — 2026-03-19

### Changed
- Parser migrated to `@effectorhq/core/skill` — eliminates hand-rolled SKILL.md parser from the action bundle
- `src/main.js` now imports from `@effectorhq/core`; `dist/index.js` is built by `esbuild` (bundled, self-contained)
- Action description updated: removed "OpenClaw" branding
- Package version bumped to 2.0.0

---

## v1.0.0 — 2026-03-05

### Added
- Initial release of `skill-lint-action`
- Validates `name`, `description`, `metadata.openclaw` structure
- Inline PR annotations via GitHub Actions workflow commands
- GitHub Actions job summary table
- `errors`, `warnings`, `files-checked` outputs
- `fail-on-warnings` input for strict mode
- `path` input for targeting specific directories or files
- `json` input for machine-readable output
- Zero external dependencies — Node.js 20 built-ins only
- 16 validation rules across errors, warnings, and info levels
- Automatic SKILL.md discovery (recursive directory walk)
- Works in monorepos (multiple SKILL.md files per repo)
