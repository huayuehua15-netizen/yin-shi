# Cadence — 工程复盘

> 面向代码评审者的 90 秒导读：这个项目解决什么问题、做了什么取舍、哪一段代码最能体现工程质量、还有哪些明确的不足。

## 1. 项目要解决的问题

销售通话录音本身信息密度很高，但团队真正缺的不是「转写」，而是**可执行的教练反馈**：哪句话推进了交易、哪个异议被错过、下一步该问什么。Cadence 把这条链路做成一个可自托管的单一服务：

```
录音/文本 → 说话人分离逐字稿 → 情绪与互动曲线 → 框架化教练卡片 → 导出/跟进问答
```

它不是一个 CRUD 看板：转写、说话人切分、情绪打分、教练要点、时间戳跳转、导出格式、双语界面和键盘操作都要串起来，并且**在没有任何 API Key 的情况下也能完整跑通**。

## 2. 架构边界与取舍

| 取舍     | 选择                                        | 代价 / 理由                                                            |
| :------- | :------------------------------------------ | :--------------------------------------------------------------------- |
| 数据层   | 单机 JSON + 音频目录，不用数据库            | 演示与自托管零依赖；代价是水平扩展不在范围内，已写入 README 的 Roadmap |
| 进程模型 | 单个 Express 进程同时提供 API 与静态站点    | 省掉队列、会话存储、跨服务鉴权；代价是无法多实例共享写入               |
| AI 接入  | Gemini / OpenAI 兼容 / 本地确定性引擎三选一 | 本地引擎既是零密钥默认路径，也是远端 503 时的降级路径                  |
| 图表     | 手写 SVG + Catmull-Rom 平滑，不引图表库     | 少一个依赖、包体更小、可键盘与读屏操作；代价是交互能力有限             |
| 状态管理 | React 本地状态 + 一个类型化 API 客户端      | 项目规模不需要 Redux/Zustand；所有网络契约集中在一个文件               |

`server.ts` 负责路由与 Provider 编排，`server/store.ts` 负责持久化，`server/localAnalyzer.ts` 是纯函数式的本地分析引擎，`src/utils/*` 是可单测的分析与格式化逻辑，`src/api/client.ts` 是唯一的前端网络出口。

## 3. 一次真实的缺陷复盘：并发写入与半截文件

**现象。** 早期版本每次 `PATCH /api/calls/:id` 都是「读整个 `calls.json` → 改内存 → 覆盖写回」。两个请求并发时会出现两类问题：

1. **丢更新**：两个请求读到同一份快照，后写者覆盖前者的字段；
2. **半截文件**：进程在 `writeFile` 中途崩溃，`calls.json` 只剩半段 JSON，下一次读取直接抛错。

**修复。**

- 写入改为 **temp file + `rename`**：先写 `calls.json.<pid>.<uuid>.tmp`，成功后原子替换；`finally` 清理临时文件。
- 所有「读-改-写」通过 `serialize(key, task)` 进入**按文件串行的 Promise 队列**，同一时刻只有一个变更在跑。
- 读路径增加 **mtime 校验的缓存**，写后主动更新缓存，避免每次列表请求都重新解析 JSON。
- 损坏文件不再被静默覆盖，而是重命名为 `calls.json.corrupt-<timestamp>` 后重新播种，保留人工恢复的可能。
- 顺带修掉一个语义 bug：空数组 `[]` 曾被当成「文件不存在」而重新灌入示例数据，导致用户删光通话后示例又复活。

**验证。** `server/store.test.ts` 新增了四个针对性用例：并发 `addCallRecord` 不丢记录且不残留 `.tmp`、两个字段的并发更新都保留、空数组保持为空、损坏 JSON 被隔离后重新播种。这些用例不是形式化的覆盖率，而是对这个缺陷的直接回归保护。

```ts
// 同一文件的读-改-写串行化，避免两个 PATCH 互相覆盖
function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const result = previous.then(task, task);
  writeQueues.set(
    key,
    result.then(
      () => undefined,
      () => undefined
    )
  );
  return result;
}
```

还有一个不显眼但会咬人的坑：`addCallRecord` 在写锁内部调用 `readAllCalls`，而后者在文件不存在时也会申请同一把锁，形成自锁。修复方式是在进入写锁前先完成首次播种，锁内只做纯读写。这个问题同样有测试兜底。

### 3.1 另一类缺陷：SVG 被等比放大，吃掉了首屏

`viewBox="0 0 760 236"` 配 `class="w-full h-auto"`，在 1440 宽的容器里会被等比放大到约 419px 高；加上标题、图例与里程碑，整张卡片接近 500px —— 首屏 60% 被一张图占掉，逐字稿和教练卡全被推到折叠线以下。

修复不是简单写死高度：`preserveAspectRatio="none"` 会把线宽和文字横向拉扁。正确做法是用 `ResizeObserver` 测量容器宽度，把 `viewBox` 的宽度当成真实像素，配合固定 200px 高度做 1:1 映射。线宽、字号、刻度全部保持原样，同时首屏能露出逐字稿的前两轮和教练卡结论。

## 4. 健壮性与安全清单

- **上传**：扩展名 + MIME 双重校验，25 MB 上限，文件名白名单化，磁盘路径再做 `path.basename` 与目录前缀校验，阻断路径穿越。
- **音频流**：自己实现 HTTP `Range`（206 / 416），支持播放器拖动进度，不依赖额外中间件。
- **Provider 降级**：Gemini / OpenAI 兼容接口返回 503 或 `UNAVAILABLE` 时自动回落到本地引擎，而不是把错误抛给前端。
- **API 契约**：未知 `/api/*` 返回 JSON 404，而不是落进 SPA 的 `index.html`；错误统一为 `{ error }`。
- **响应头**：`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`、`X-Request-Id`，API 一律 `no-store`。
- **生命周期**：`SIGINT` / `SIGTERM` 关闭监听并等待在途请求，10 秒兜底退出，适配容器编排。

明确没做的：**没有鉴权层**。这是面向单租户演示的设计，README 与 SECURITY.md 都写清楚了：对公网暴露真实客户录音前必须挂一层认证反向代理。

## 5. 前端工程

- **类型化 API 客户端**：`src/api/client.ts` 把前端依赖的全部端点收口到一个 `request<T>()`，统一 `ApiError`（含 `status` 与 `offline` 标记），组件里不再出现 `fetch` + `response.ok` + `as` 的重复三元组。
- **严格类型**：`strict: true`、`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`，零错误。
- **Hooks 质量**：修复了 `useEffect` 依赖缺失、闭包引用未声明函数、无意义初始赋值等问题；`rules-of-hooks` 与 `exhaustive-deps` 作为 ESLint 错误/警告保留。
- **可访问性**：对话框 `aria-modal` + 焦点陷阱（`useDialogFocus`）、Tab 在首尾循环、关闭后焦点归还触发者、图表 `aria-label`、快捷键在输入框内自动抑制、`prefers-reduced-motion` 降级。
- **包体**：Vite `manualChunks` 拆出 React 与图标 vendor，入口从 ~345 kB 降到 ~121 kB（gzip 32 kB），部署后应用壳可长期缓存。

## 6. 后端重构：把 1300 行拆成 10 个模块

最初所有后端逻辑都堆在 `server.ts`：三套 Provider 适配、响应归一化、六组路由、静态托管和优雅关闭。1300 行的问题不是"写不下"，而是**任何改动都要先读完一屏无关代码**——这也是面试里"讲讲你的架构"最容易被追问的软肋。

拆分只遵守两条原则：

1. **按变化原因分层，不按文件长度切。** `config`（环境探测与能力判定）、`analysis/normalize`（模型输出的统一修缮）、`analysis/{gemini,openai}`（两种协议）、`routes/{calls,analysis}`（资源边界）、`app`（组装与中间件顺序）。
2. **行为零变化。** 拆分前先让 `npm run verify` 全绿，拆完逐字核对路由注册顺序与中间件链；11 项 smoke 契约检查原样通过，构建产物字节数未变（`index-*.js` 124.17 kB / gzip 33.40 kB），证明没有夹带功能改动。

结果是 `server.ts` 从 1300 行降到 34 行，只留 boot / listen / SIGTERM 优雅关闭。第一轮拆分后最大的模块是 317 行的 `routes/analysis.ts`，于是 1.3.1 又按端点把它拆成 `transcribe` / `analyzeCall` / `coachChat` 三个文件，最长的只剩 150 行；同时把散在三条路由里的「503 降级」收成一个 `withLocalFallback()` 策略，配 5 个用例。

重构顺带暴露了一个真实的测试盲区：`normalizeParsedAnalysis` 是所有 Provider 输出的必经之路，却没有任何单元测试。补了 7 个用例（垃圾输入、越界时间戳、乱序时间线、空 transcript、模型自带 `speakerLabel`、`nextStepRecommendation` 保留、空对象兜底），行覆盖率 92.11% → 92.51%，分支 79.43% → 80.00%。

一个刻意的取舍：没有引入 DI 容器。Provider 是**函数 + 运行时环境探测**，不是需要注入的类；为了"看起来架构化"多加一层 `Container`，只会让 `getGeminiClient()` 多绕两跳。`registerCallRoutes(app)` 已经把依赖收敛到参数上，够用即可。

## 7. 测试策略

60 个单测用例、行覆盖率约 91.9%，11 项 API 契约检查与 13 项浏览器交互检查：

| 层                          | 覆盖内容                                                            |
| :-------------------------- | :------------------------------------------------------------------ |
| `server/store`              | CRUD、原子写、并发、损坏隔离、空数组语义、路径穿越                  |
| `server/localAnalyzer`      | 说话人切分、情绪分类、教练卡片结构、追问回复                        |
| `server/analysis/normalize` | 垃圾输入兜底、分数与时间戳夹紧、时间线排序、空 transcript、字段保留 |
| `server/analysis/fallback`  | 503 / UNAVAILABLE 降级到本地引擎，鉴权与校验错误照常抛出不吞掉      |
| `src/api/client`            | 响应解包、JSON/multipart 分支、离线与错误映射                       |
| `src/utils`                 | 话术比例、互动摘要、对话指标、导出格式、快捷键解析、i18n 字典完整性 |
| `src/utils/focus`           | Tab/Shift+Tab 在对话框边界循环、逃逸后拉回                          |
| `scripts/e2e.mjs`           | 生产构建下的真实交互：入库、搜索、书签、删除、概览、焦点、断点      |

**刻意没测什么：** React 组件的像素快照、真实 Provider 的网络调用（需要密钥且不稳定）。浏览器级
流程曾是一条明确的欠账，1.4.0 用 `scripts/e2e.mjs` 补上：它起生产构建 + 临时数据目录，用真实
Chrome 跑 13 项检查 —— 首屏渲染、粘贴文本入库并回读 API、库搜索与清空、书签 PATCH 落盘、书签
筛选、下一步状态落盘、删除后 PATCH 返回 404、团队概览与下一步追踪、快捷键对话框的焦点陷阱、
六档视口（1440→390）无横向溢出、移动抽屉、控制台零错误与零 5xx。CI 里独立成一个 job。

仍然不做像素级回归：视觉靠 `capture-docs.mjs` 的固定视口截图人工比对，而不是自动 diff。理由是
字体与抗锯齿在不同机器上必然有差异，自动 diff 会变成噪声门禁。另外，`scripts/smoke.mjs` 继续用
真实进程 + 临时数据目录跑 11 项 API 契约检查（静态托管、资源可达、健康检查、CRUD 往返、零密钥
分析链路、JSON 404、路径穿越拒绝、请求 ID 回显）。

## 8. 已知不足与下一步

1. ~~`server.ts` 仍然偏大~~ 已在 1.3.0 拆成 `config` / `analysis` / `routes` / `app`，1.3.1 再把路由按端点拆开、把 503 降级收成 `withLocalFallback()`，入口只剩 34 行、最长文件 150 行。下一步是给 `store.ts` 定义正式接口，让 JSON 文件与 SQLite 成为可替换适配器。
2. ~~没有浏览器级 E2E~~ 已在 1.4.0 补上 `scripts/e2e.mjs`：13 项真实交互检查进 CI 独立 job。仍未覆盖的是像素级视觉回归（有意不做，字体渲染跨机不稳定）与真实 Provider 的联网调用。
3. 持久化是单进程语义。若要多实例，需要换成 SQLite/Postgres 或对象存储，并保持 `store.ts` 的接口不变。
4. 没有流式转写，长音频只能等整段完成；这需要 Provider 侧的流式 API 与前端增量渲染配合。
5. 没有账号体系与团队多租户；演示场景够用，但不是产品形态。

## 9. 如果重来一次

- 会先定义 `Store` 接口再写实现，让「JSON 文件」和「SQLite」成为可替换的适配器，而不是把文件语义泄漏到路由层。
- 会把「Provider 降级」抽成显式的策略对象（`analyzeWithFallback`），而不是在三个分支里各写一次 `if (msg.includes('503'))`。
- 会在第一次提交就接入 ESLint 与 `package-lock.json`，避免后期一次性格式化产生大 diff。

---

相关文档：[README](../README.md) · [贡献指南](../CONTRIBUTING.md) · [安全策略](../SECURITY.md) · [变更记录](../CHANGELOG.md)
