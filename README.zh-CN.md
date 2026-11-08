# 题匣 · QuizChest

**真正属于你自己的本地题库。**

导入自有题库，离线练习、限时模拟考、错题重练、查看学习曲线——不注册、不联网、不上传。

[English](README.md) · [简体中文](README.zh-CN.md)

<p align="center">
  <img src="docs/screenshots/home.webp" alt="题匣首页" width="900">
</p>

## 它能做什么

题匣只围绕一件事设计：**题库不该被困在别人的平台里。** 你给一份 JSON 或 CSV，
一秒内变成可练、可考、可统计的完整题库，数据始终留在本机。

| | |
| --- | --- |
| **导入格式够宽容** | 支持 Excel（.xlsx）、JSON、CSV 与可移植的 `.tiyu.json` 题库包；同一条行管线逐题校验，确认后才入库。 |
| **三条找题路径** | 跟目标路线走、按领域逐层钻取，或交给策略自动配题。 |
| **完整练习闭环** | 单选、多选、判断；练习模式即时批改，考试模式倒计时并到时自动交卷。 |
| **做错的题不会丢** | 答错自动进错题本，错题重练答对后自动移出。 |
| **导错了能改** | 导入的题库可直接编辑：题干、选项、答案、解析就地修改，题目编号保持稳定，错题引用不断。 |
| **改错了能撤回** | 每次保存前自动存档旧版本，可回滚到最近 20 个版本中的任意一个；回滚本身也能再撤回。 |
| **离开也能接着做** | 答题进度实时落库，中途关掉应用，首页会提示「继续上次」，直接回到原来那道题。 |
| **题目能带图** | 图表题、几何题、阅读理解都能用：支持题干配图与选项配图（外链或内嵌 data URI）。 |
| **数据能说明问题** | 连续打卡、正确率走势、领域分布与近 7 天作答量。 |
| **能印出真正的卷子** | 组好卷直接打印：A4 版式、姓名与得分栏、可选附带答案与解析，打印时自动隐藏导航。 |
| **一套代码跑三端** | Web/PWA、桌面端（Tauri 2）、安卓（Capacitor 8），共用同一份数据模型。 |

## 界面截图

<table>
<tr>
<td width="50%"><img src="docs/screenshots/catalog.webp" alt="题库总览"><br><sub><b>题库总览</b> — 领域树、学段筛选、题库卡片</sub></td>
<td width="50%"><img src="docs/screenshots/practice.webp" alt="答题页面"><br><sub><b>答题</b> — 即时判分并展示解析</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/stats.webp" alt="学习统计"><br><sub><b>学习统计</b> — 作答量、正确率走势、领域分布</sub></td>
<td width="50%"><img src="docs/screenshots/settings.webp" alt="设置与备份"><br><sub><b>设置与备份</b> — 完整备份、恢复与偏好设置</sub></td>
</tr>
</table>

## 快速开始

需要 **Node 20.19+ 或 22.12+**，包管理器使用 **pnpm**。

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # 生产构建，含 PWA manifest 与 Service Worker
pnpm preview      # 预览 dist/，http://localhost:4173
```

### 三端构建

```bash
pnpm build                  # Web / PWA，把 dist/ 部署到任意静态托管
pnpm desktop:build          # 桌面安装包，需要 Rust 与 MSVC
pnpm build:native && npx cap sync android   # 再在 android/ 里用 Gradle 构建
```

原生壳使用 hash 路由并关闭 Service Worker，Web 构建使用浏览器 history 路由。
三端共用同一套数据层接口（`src/services/repository.ts`），底下换引擎不换调用方。

## 导入格式

最快的方式是只写 5 个必需列的 CSV：

```csv
title,stem,optionA,optionB,optionC,optionD,answer,explanation,type
小学数学,一个数的 3 倍减去 12 等于 18，这个数是多少,8,10,12,14,B,设该数为 x，则 3x - 12 = 18,single
小学数学,下列哪些是偶数,1,2,3,4,B;D,能被 2 整除的整数是偶数,multiple
```

答案支持 `B`、`BC`、`B;D`、`B,D`、`B、D`、`B/D`，也支持从 1 开始的下标如 `1,3`。
必填列只有 `stem`、`optionA`、`optionB`、`answer`、`explanation`。

完整字段说明见 [docs/IMPORT_FORMAT.md](docs/IMPORT_FORMAT.md)。

## 你的数据在哪

题匣在设备上自带一个数据库，不需要服务器，数据也不经过网络：

| 运行形态 | 数据库引擎 | 位置 |
| --- | --- | --- |
| 桌面（Tauri 2） | SQLite（Rust `rusqlite`） | 系统应用数据目录 `com.tiyu.questionbank/quizchest.db` |
| Web / PWA / Android（Capacitor） | IndexedDB | 浏览器站点数据 `quizchest` |

桌面端的数据库是一个标准 SQLite 文件，可以用任何 SQLite 工具直接打开查看。
设置页「本地数据库」一栏会显示当前实际使用的驱动与完整路径。

**清理浏览器数据或卸载应用前请先备份。** 设置页的「完整备份与恢复」会导出一个 JSON 文件，
包含全部题库、错题、收藏、练习记录、组卷历史与设置；在任意设备导入即可完整还原。

数据库不可用（隐私模式、权限受限）时，题匣会用内存维持本次会话可用并明确提示，
不会静默丢数据。旧版本的 `localStorage` 数据会在首次启动时自动迁移进数据库并清理旧键。

## 内置示例内容

应用自带 7 个领域、20 个学段、32 个题库、195 道题，**仅用于演示产品结构**。
每个示例题库都带标注且只有 6–7 题，不是备考材料。可在设置中隐藏后导入自己的题库。

当前版本有意不包含账号体系、云端同步、后台管理与在线题库服务。

## 架构

```
src/
├─ data/        分类体系、示例题库、题目种子、数据记录类型
├─ services/    数据层：SQLite / IndexedDB / 内存实现与环境选择
├─ lib/         判分、统计、导入导出、策略、组卷
├─ hooks/       会话状态、计时器、品牌、Service Worker、数据层状态
├─ store/       Zustand 状态 + 启动 hydrate 与异步落库
├─ components/  布局、答题器、图表、基础 UI
├─ pages/       路由页面
└─ styles/      设计变量、布局、页面与练习样式
```

几个值得知道的设计取舍：

- **逻辑与渲染分离。** 所有会话规则集中在 `usePracticeSession`，
  `PracticeRunner` 只负责把状态映射成界面，因此练习流程可以在无浏览器环境下单测。
- **数据层可替换。** 页面只依赖 `src/services/repository.ts` 的接口，
  桌面走 SQLite、Web 走 IndexedDB，换引擎不改页面。
- **落库失败必须可见。** 写操作先更新内存保证界面响应，失败时把错误写入
  `persistenceError` 并在设置页显示，不会假装保存成功。
- **故障被隔离。** 路由级 `ErrorBoundary` 保证单个页面崩了不会拖垮整个外壳。
- **图表懒加载。** ECharts 只在 `/stats` 加载，首屏包体保持在 gzip 约 138 kB。

## 质量门禁

```bash
pnpm check        # 版本 → 类型 → lint → 单测 → 构建 → cargo test → 依赖审计
pnpm test:e2e     # Playwright，真实浏览器，关键链路
pnpm test:e2e:apk # Playwright 跑在 APK 真实资源上，Pixel 5 视口
```

`pnpm check` 覆盖题库完整性、判分、会话统计、策略配题、导入导出往返、CSV 导出、
两个数据层驱动、store 落库、对话框焦点管理与练习组件行为；末尾还会跑
`cargo test` 验证 Rust 数据层（无 cargo 的环境会明确跳过并打印原因），
以及 `scripts/audit-deps.mjs`——运行时依赖出现 high/critical 漏洞即失败，
仅构建期的工具链告警单独列出，因为它们不会进入交付产物。

`pnpm test:e2e` 用真实 Chromium 驱动 dev server，验证单测覆盖不到的链路：
导入的题库刷新后仍从 IndexedDB 读得到、答错进错题本而答对不进、交卷生成记录、
备份在重置后能完整恢复。它要起服务且约 25 秒，因此不放进 `pnpm check`，CI 两步都跑。

## 项目管理

- 版本号：遵循 [SemVer](https://semver.org/lang/zh-CN/)，唯一来源为 `package.json`，
  由 `scripts/sync-version.mjs` 传播到各构建清单。
- 变更历史：[CHANGELOG.md](CHANGELOG.md)。
- 发布流程：[docs/RELEASING.md](docs/RELEASING.md)。
- 贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md)。
- 安全策略：[SECURITY.md](SECURITY.md)。

## 许可证

[MIT](LICENSE)
