---
name: my-skill
description: "Manage GitHub repos via the gh CLI: list PRs, create issues, check CI status. Use when you need to interact with GitHub repositories directly."
metadata:
  openclaw:
    emoji: 🐙
    requires:
      bins:
        - gh
      env:
        - GITHUB_TOKEN
    install:
      - id: brew
        kind: brew
        formula: gh
        bins:
          - gh
        label: "Install GitHub CLI (brew)"
      - id: apt
        kind: apt
        package: gh
        bins:
          - gh
        label: "Install GitHub CLI (apt)"
---

## Purpose

Manage GitHub repositories without leaving OpenClaw.

## Setup

Run `gh auth login` then verify with `gh auth status`.

## Commands

List open PRs:
```
gh pr list --state open
```

## Examples

Check if CI passed on latest PR:
```
gh pr checks $(gh pr list --limit 1 --json number -q '.[0].number')
```
