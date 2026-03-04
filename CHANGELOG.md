# Changelog

## [1.0.0] — 2026-03-05

### Added
- Initial release of skill-lint-action
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
- 4 example workflow files (basic, strict, monorepo, pre-publish)
