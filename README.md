# skill-lint-action

> Validate OpenClaw SKILL.md files in CI. Annotate PRs with inline errors. Zero config.

[![CI](https://github.com/OpenClawHQ/skill-lint-action/actions/workflows/ci.yml/badge.svg)](https://github.com/OpenClawHQ/skill-lint-action/actions)

---

## What it does

Every time you open a PR that touches a `SKILL.md`, this action:

1. **Finds** all `SKILL.md` files in your repository
2. **Validates** them against the OpenClaw skill spec
3. **Annotates** your PR diff with inline error/warning comments — no context switching
4. **Posts a summary** to the GitHub Actions job summary tab
5. **Fails the build** if errors are found (configurable for warnings too)

The kind of things it catches:

| Rule | Level | Example |
|------|-------|---------|
| `missing-name` | 🔴 Error | `name:` field is absent |
| `missing-description` | 🔴 Error | `description:` field is absent |
| `missing-openclaw-metadata` | ⚠️ Warning | No `metadata.openclaw` block |
| `missing-emoji` | ⚠️ Warning | `metadata.openclaw.emoji` not set (used in ClawHub UI) |
| `description-too-short` | ⚠️ Warning | Description under 20 chars — hurts discovery |
| `missing-examples` | ⚠️ Warning | No `## Examples` or `## Commands` section |
| `missing-setup` | ⚠️ Warning | Has `requires` but no `## Setup` section |
| `install-missing-kind` | ⚠️ Warning | Install entry missing `kind:` (brew/apt/manual) |
| `env-not-uppercase` | ⚠️ Warning | Env var name isn't UPPER_CASE |
| `name-format` | ⚠️ Warning | Name isn't kebab-case |

---

## Quickstart

Add this file to your skill repo as `.github/workflows/lint.yml`:

```yaml
name: Lint Skill

on:
  push:
    branches: [main]
    paths:
      - '**/SKILL.md'
  pull_request:
    paths:
      - '**/SKILL.md'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: OpenClawHQ/skill-lint-action@v1
```

That's it. Open a PR with a `SKILL.md` change and you'll see inline annotations.

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `path` | No | `.` | Path to search for SKILL.md files. Can be a directory or a specific file. |
| `fail-on-warnings` | No | `false` | Exit with code 1 if any warnings are found (not just errors). |
| `glob` | No | `''` | Glob pattern to find SKILL.md files. Overrides `path` when set. |
| `json` | No | `false` | Output results as JSON instead of human-readable text. |

## Outputs

| Output | Description |
|--------|-------------|
| `errors` | Number of validation errors found |
| `warnings` | Number of validation warnings found |
| `files-checked` | Number of SKILL.md files checked |

Use outputs to conditionally run downstream steps:

```yaml
- name: Lint
  id: lint
  uses: OpenClawHQ/skill-lint-action@v1

- name: Only runs if lint passed
  if: steps.lint.outputs.errors == '0'
  run: clawhub publish
```

---

## Usage patterns

### Single skill repo (basic)

```yaml
- uses: OpenClawHQ/skill-lint-action@v1
```

### Single skill repo (strict — fail on warnings too)

```yaml
- uses: OpenClawHQ/skill-lint-action@v1
  with:
    fail-on-warnings: 'true'
```

### Monorepo with multiple skills

```yaml
- uses: OpenClawHQ/skill-lint-action@v1
  with:
    path: 'skills/'
```

### Specific file

```yaml
- uses: OpenClawHQ/skill-lint-action@v1
  with:
    path: 'skills/my-skill/SKILL.md'
```

### Pre-publish gate

Lint must pass before releasing to ClawHub:

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: OpenClawHQ/skill-lint-action@v1
        with:
          fail-on-warnings: 'true'

  publish:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - run: clawhub publish
        env:
          CLAWHUB_TOKEN: ${{ secrets.CLAWHUB_TOKEN }}
```

See `examples/workflows/` for complete workflow files.

---

## Why a GitHub Action vs the CLI?

[`skill-lint`](https://github.com/OpenClawHQ/skill-lint) is the standalone CLI — run it locally before committing.

`skill-lint-action` wraps the same rules and adds:
- **Inline PR annotations** — errors appear directly on the diff line, not just in logs
- **Job summary** — a formatted table in the Actions summary tab
- **Zero setup** — no `npm install` step, no config, just add the action
- **Outputs** — use `steps.lint.outputs.errors` in downstream steps

Use both: CLI locally while writing, Action in CI as the gate.

---

## Technical notes

- **Zero external dependencies** — uses only Node.js 20 built-ins
- **No Docker overhead** — runs directly on the GitHub runner (fast startup)
- **Works offline/in enterprise** — no network calls during linting
- `dist/index.js` is committed and self-contained — no build step required to use this action

---

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

The core validation rules live in `dist/index.js` (self-contained) and the corresponding source in `src/`. If you're adding a new rule, add it in both places and add a test fixture + test case.

---

## Related

- [`skill-lint`](https://github.com/OpenClawHQ/skill-lint) — the CLI version of this linter
- [`plugin-template`](https://github.com/OpenClawHQ/plugin-template) — SKILL.md starter template
- [`cookbook`](https://github.com/OpenClawHQ/cookbook) — example skills you can reference
- [ClawHub](https://clawhub.com) — publish your validated skill to the registry

---

MIT License — OpenClawHQ Contributors
