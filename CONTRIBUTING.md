# Contributing to Cadence

Thank you for contributing to Cadence!

## Development Workflow

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Run tests & type checks**

   ```bash
   npm test
   npm run lint
   ```

3. **Run local dev server**

   ```bash
   npm run dev
   ```

## Guidelines

- Keep business logic (analytics, formatting, validation) in pure modules under `src/utils/` or `server/` with matching `*.test.ts` unit tests using `node:test`.
- Keep Gemini API calls strictly server-side in `server.ts`. Never expose `GEMINI_API_KEY` to client code.
- Ensure `npm test`, `npm run lint`, and `npm run build` pass cleanly before opening a pull request.

## Git Commit 规范（中文标签）

推荐在提交代码时使用统一的中文方括号标签，保持仓库历史清晰易读：

- `[新增]` 新增功能、接口或组件（例：`[新增] 支持简体中文与 English 双语切换`）
- `[修复]` / `[bug]` 修复缺陷或异常处理（例：`[修复] 修复切换通话时转录筛选状态残留`）
- `[更新]` 功能优化、交互调整或配置更新（例：`[更新] 优化情绪曲线坐标轴文字大小`）
- `[重构]` 代码结构整理与模块化拆分（例：`[重构] 抽离零密钥本地分析引擎模块`）
- `[文档]` README、贡献指南与部署文档更新（例：`[文档] 补充 Docker 自托管与双语说明`）
- `[测试]` 补充或更新自动化测试（例：`[测试] 新增本地存储路径安全单元测试`）

可配置本地 Git 使用仓库模板：

```bash
git config commit.template .gitmessage
```
