# skill-lint-action

> 在 CI 中验证 OpenClaw SKILL.md 文件。为 PR 添加行内错误标注。零配置。

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-skill--lint--action-0075ca?logo=github)](https://github.com/marketplace/actions/skill-lint-action) [![CI](https://github.com/effectorHQ/skill-lint-action/actions/workflows/ci.yml/badge.svg)](https://github.com/effectorHQ/skill-lint-action/actions) [![License: Apache 2.0](https://img.shields.io/badge/license-Apache-2.0-blue.svg)](./LICENSE)

**[English →](./README.md)**

---

## 它做什么

每次你打开一个涉及 `SKILL.md` 改动的 PR，这个 Action 会：

1. **发现** repo 中所有的 `SKILL.md` 文件
2. **验证** 它们是否符合 OpenClaw skill 规范
3. **标注** PR diff 的对应行——直接在 PR 里看到错误/警告，无需跳转
4. **发布摘要** 至 GitHub Actions job summary 标签页
5. **使构建失败** 如果发现错误（也可配置为警告同样失败）

它能捕获的问题类型：

| 规则 | 级别 | 示例 |
|------|------|------|
| `missing-name` | 🔴 错误 | `name:` 字段缺失 |
| `missing-description` | 🔴 错误 | `description:` 字段缺失 |
| `missing-openclaw-metadata` | ⚠️ 警告 | 无 `metadata.openclaw` 块 |
| `missing-emoji` | ⚠️ 警告 | `metadata.openclaw.emoji` 未设置（影响 ClawHub UI） |
| `description-too-short` | ⚠️ 警告 | description 少于 20 字符——影响搜索发现 |
| `missing-examples` | ⚠️ 警告 | 无 `## Examples` 或 `## Commands` 章节 |
| `install-missing-kind` | ⚠️ 警告 | install 条目缺少 `kind:`（brew/apt/manual） |
| `env-not-uppercase` | ⚠️ 警告 | 环境变量名不是 UPPER_CASE |
| `name-format` | ⚠️ 警告 | name 不是 kebab-case |

---

## 快速开始

在你的 skill repo 中添加 `.github/workflows/lint.yml`：

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
      - uses: effectorHQ/skill-lint-action@v1
```

就这些。打开一个修改了 `SKILL.md` 的 PR，你就能看到行内标注。

也可以使用 effectorHQ 的可复用 workflow，一行搞定：

```yaml
jobs:
  lint:
    uses: effectorHQ/.github/.github/workflows/reusable-skill-lint.yml@main
    with:
      fail-on-warnings: true
```

---

## 输入参数（Inputs）

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `path` | 否 | `.` | 搜索 SKILL.md 文件的路径，可以是目录或具体文件 |
| `fail-on-warnings` | 否 | `false` | 设为 `true` 时，有警告也会以 exit code 1 退出 |
| `glob` | 否 | `''` | 查找 SKILL.md 文件的 glob 模式，设置后会覆盖 `path` |
| `json` | 否 | `false` | 以 JSON 格式输出结果 |

## 输出参数（Outputs）

| 参数 | 说明 |
|------|------|
| `errors` | 发现的验证错误数量 |
| `warnings` | 发现的验证警告数量 |
| `files-checked` | 检查的 SKILL.md 文件数量 |

在下游 step 中使用输出：

```yaml
- name: Lint
  id: lint
  uses: effectorHQ/skill-lint-action@v1

- name: 只在 lint 通过后运行
  if: steps.lint.outputs.errors == '0'
  run: clawhub publish
```

---

## 使用场景

### 单 skill repo（基础）

```yaml
- uses: effectorHQ/skill-lint-action@v1
```

### 严格模式（警告也会失败）

```yaml
- uses: effectorHQ/skill-lint-action@v1
  with:
    fail-on-warnings: 'true'
```

### 包含多个 skills 的 monorepo

```yaml
- uses: effectorHQ/skill-lint-action@v1
  with:
    path: 'skills/'
```

### 发布前的质量门控

lint 通过后才触发 ClawHub 发布：

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: effectorHQ/skill-lint-action@v1
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

---

## 为什么用 Action 而不是 CLI？

[`skill-lint`](https://github.com/effectorHQ/skill-lint) 是独立的 CLI——在提交前本地运行。

`skill-lint-action` 封装了相同的规则，并额外提供：
- **PR 行内标注** — 错误直接出现在 diff 对应行，而不是只在日志里
- **Job 摘要** — 在 Actions summary 标签页有格式化的汇总表格
- **零配置** — 无需 `npm install`，无需配置，直接添加 Action 即可
- **输出参数** — 在下游 step 中使用 `steps.lint.outputs.errors`

推荐两个同时用：本地写 skill 时用 CLI，CI 里用 Action 做质量门控。

---

## 技术说明

- **零外部依赖** — 仅使用 Node.js 20 内置模块
- **无 Docker 开销** — 直接在 GitHub runner 上运行（启动快）
- **离线/企业环境可用** — lint 过程无网络请求
- `dist/index.js` 已提交且自包含——使用本 Action 无需构建步骤

---

## 贡献

欢迎 issue 和 PR。详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

核心验证规则在 `dist/index.js`（自包含）和对应源码 `src/` 中。添加新规则时，在两处都添加，并补充测试 fixture 和测试用例。

---

## 相关项目

- [`skill-lint`](https://github.com/effectorHQ/skill-lint) — 本 linter 的 CLI 版本
- [`plugin-template`](https://github.com/effectorHQ/plugin-template) — SKILL.md 起始模板
- [`cookbook`](https://github.com/effectorHQ/cookbook) — 可参考的示例 skills
- [ClawHub](https://clawhub.com) — 将验证通过的 skill 发布到注册中心

---

Apache License 2.0 — effectorHQ Contributors

## License

This project is currently licensed under the Apache 2.0 License 。
