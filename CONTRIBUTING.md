# Contributing to Cadence

Thanks for taking the time to contribute. This document covers the local workflow,
the quality gate every change must pass, and the conventions used in this repository.

## Development workflow

1. **Install dependencies** (Node 20.19+; the repo pins 22 in `.nvmrc`)

   ```bash
   npm ci
   ```

2. **Start the dev server** — Express + Vite middleware with HMR

   ```bash
   npm run dev
   ```

3. **Make the change**, then run the full gate:

   ```bash
   npm run verify   # format check → ESLint + tsc → tests → production build
   ```

4. **Commit** with the repository's message template (see below) and open a pull
   request using the PR template.

## Quality gate

Every pull request must pass the same checks that CI runs on Node 20, 22, and 24:

| Command                 | What it guarantees                                    |
| :---------------------- | :---------------------------------------------------- |
| `npm run format:check`  | Prettier formatting (run `npm run format` to fix)     |
| `npm run lint`          | ESLint 10 flat config + `tsc --noEmit` in strict mode |
| `npm test`              | `node:test` unit suites                               |
| `npm run build`         | Production Vite bundle                                |
| `npm run test:coverage` | Coverage report (informational, not a hard threshold) |

## Guidelines

- Keep business logic (analytics, formatting, validation, persistence) in pure
  modules under `src/utils/` or `server/`, with a matching `*.test.ts` suite using
  `node:test`.
- **All network access goes through `src/api/client.ts`.** Do not call `fetch` directly
  from components; extend the client and its contract tests instead.
- Keep provider SDK calls server-side only. Never expose `GEMINI_API_KEY`,
  `OPENAI_API_KEY`, or any transcript data to client code beyond what the API
  deliberately returns.
- The Zero-Key Local mode must keep working for every feature. A change that only
  works with a hosted provider is incomplete.
- Persisted state must go through `server/store.ts`; never write `calls.json` directly.
- Add accessible names (`aria-label`, visible focus states) to new interactive UI,
  and keep both English and Chinese strings in `src/i18n/translations.ts`.
- Regenerate README screenshots with `node scripts/capture-docs.mjs` when the UI
  changes visibly (requires a running dev server and Chrome).

## Git commit convention（中文标签）

提交信息使用统一的方括号标签，保持历史清晰、便于检索：

- `[新增]` 新增功能、接口或组件（例：`[新增] 支持简体中文与 English 双语切换`）
- `[修复]` / `[bug]` 修复缺陷或异常处理（例：`[修复] 修复切换通话时转录筛选状态残留`）
- `[更新]` 功能优化、交互调整或依赖升级（例：`[更新] 优化情绪曲线坐标轴文字大小`）
- `[重构]` 不改变外部行为的结构整理（例：`[重构] 抽离零密钥本地分析引擎模块`）
- `[文档]` README、贡献指南与部署文档（例：`[文档] 补充 Docker 自托管与双语说明`）
- `[测试]` 补充或更新自动化测试（例：`[测试] 新增并发写入回归用例`）

启用本地模板：

```bash
git config commit.template .gitmessage
```

## Reporting bugs and security issues

- Functional defects: use the **Bug report** issue form and include a minimal
  reproduction plus the provider mode you ran.
- Vulnerabilities: **do not open a public issue** — use GitHub's private advisory
  flow described in [SECURITY.md](./SECURITY.md).

## Code of conduct

Participation in this project is governed by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
