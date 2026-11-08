# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)，格式基于
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

版本号唯一来源是 `package.json`，由 `node scripts/sync-version.mjs set <version>`
传播到 Tauri、Cargo 与 Android 构建清单。发布流程见 [docs/RELEASING.md](docs/RELEASING.md)。

## [1.8.0] - 2026-11-08

企业采购常问的一条：改了题库能不能撤回。

### Added

- **题库历史版本与回滚。** 每次在编辑器里保存前，把「当前这份」自动压进历史
  （内容没变则不存，避免连续保存产生重复版本）。编辑器顶部显示历史列表，
  可以回滚到任意版本，也可以单独删除某份。
- 回滚本身也是覆盖，所以当前版本会先被存成新的历史——滚错了还能再滚回来。
- 保留策略：每个题库最多 20 份最历史版本，**前端与数据库两侧都强制**。
  快照含完整题目，只靠一处限制会在绕过调用时失效。
- 删除题库时历史版本一并清除，不留孤儿。
- 数据库 schema v3：新增 `bank_snapshots` 表（id / bank_id / saved_at /
  revision / bank JSON）。快照整条存 JSON 而不是拆表——它是某一刻的完整副本，
  拆表后字段一改要迁移两份结构，而快照本身不需要按字段查询。

### Fixed

- **快照 ID 用时间戳会互相覆盖。** 同一毫秒内的两次存档（改完立刻保存、
  或回滚时「先存档当前版本再写入」）时间戳相同，后一份会盖掉前一份，
  回滚时必然丢历史。改用 `{bankId}:r{revision}`，revision 在题库内单调递增。
  这条是测试间歇性失败抓出来的——单跑能过、整套跑必挂
- 测试里用固定 `setTimeout(0)` 等待异步落库，在高负载下会假失败。
  统一改为 `waitUntil` 轮询到条件成立

### Verified

- 真实 v2→v3 升级：本机既有的 v2 数据库（1 题库 / 1 题）在安装启动后
  `schema_version` 从 2 升到 3，`bank_snapshots` 表建好，题库与题目完整保留
- 门禁：171 单测 + cargo 8 + 主 E2E 16 + APK 运行时 4 + 依赖审计

## [1.7.0] - 2026-11-07

真实可用性收口：补上「离开就丢进度」与「图片题无法导入」两个会直接劝退用户的缺口。

### Added

- **断点续做。** 练习/考试/错题重练的进度实时落库（400ms 防抖），离开应用、
  切走页面、甚至进程被系统回收后重新打开都能接着做。首页显示「继续「XX」」，
  带已完成题数。恢复时逐位比对题目 ID，题库被编辑过就放弃恢复而不是错位套答案。
  交卷、重置学习数据、备份恢复都会清除未完成会话
- **题目配图。** 题干与选项都支持图片，导入新增 `image` / `optionImageA..F` 列。
  接受 `https://` 外链与 `data:image/...;base64` 内嵌（离线场景必须自包含）。
  其余协议（`javascript:` / `file:` 等）一律丢弃——题干图直接进 `<img src>`，
  放行脚本协议等于把导入文件变成执行入口
- 练习页配图渲染 + 打印样式（题干图 70mm、选项图 35mm 上限，不撑破分页）
- 数据库 schema v2：`questions` 表新增 `image`、`option_images` 两列，
  用 `ALTER TABLE` 增量升级，老库的题库/错题/记录全部保留

### Fixed

- **CSV 里的 data URI 被切成两列。** `data:image/png;base64,` 自带一个逗号，
  用户从 Excel 粘贴时不会加引号，于是图片列拿到前半截、base64 掉到下一列。
  现在会把被切断的 data URI 片段自动拼回，只影响图片列
- 自动保存与交卷竞态：防抖定时器可能在清除会话之后触发，把刚交的卷又写成
  「未完成」。交卷时先取消待执行定时器再清库
- `resetProgress` 未清除未完成会话（内存与数据库都漏），会导致「继续上次」
  指向一个已被清空进度的练习

### Verified

- 真实 v1→v2 升级：预置 v1 数据库（1 题库 / 1 题 / 深色主题）后安装启动，
  `schema_version` 1→2，数据完整保留，新列自动补齐
- 门禁：164 单测（0 unhandled errors）+ cargo 7 + 主 E2E 15 + APK 运行时 4 + 依赖审计

## [1.6.0] - 2026-11-07

企业级收口：把「看起来能用」的地方补成「失败也说得清」。

### Security

- **移除 xlsx（SheetJS）。** npm 上的 `xlsx` 停在 0.18.5，带 2 个 high 漏洞
  （原型污染 GHSA-4r6h-8v6p-xvw6、ReDoS GHSA-5pgg-2g8v-p4x9），修复版只在
  SheetJS 自家 CDN 发布，进不了正常依赖链。改为 `fflate`（8KB、零依赖、无已知
  漏洞）+ 自写极简 xlsx 读取器（`src/services/xlsxReader.ts`）：解 zip、读
  sharedStrings 与 sheet1 的 XML。题库导入只需要行列文本，不需要公式重算、
  日期格式、合并单元格
- 新增 `scripts/audit-deps.mjs` 并接入 `pnpm check`：本机 registry 指向 npmmirror，
  没有 npm 的 audit 端点，`pnpm audit` 默认直接报错；脚本显式走官方 registry，
  并区分运行时依赖与仅构建期依赖，运行时出现 high/critical 即失败
- 运行时依赖漏洞：0。仅构建期（vite-plugin-pwa / typescript-eslint 的传递依赖）
  剩 2 moderate + 1 low，无可用升级路径，已记录

### Fixed

- **保存结果谎报成功。** `persist()` 原本是即发即忘：编辑器点「保存修改」、
  设置页点「恢复备份」时，界面在落库完成前就显示「已保存/恢复成功」，
  磁盘满或权限不足时会误报。现在这两个操作 `await` 落库结果，失败显示
  具体原因并保留界面上的改动可重试
- **未处理的 Promise rejection。** 上一条改动的中间版本让 `persist` 对所有
  写操作 reject，导致 40 条 `Uncaught (in promise)` 刷满控制台（收藏、改主题
  这些即发即忘的调用点没人 await）。现在默认不 reject、只写 `persistenceError`，
  只有用户明确等待结果的两个操作 `rethrow`。测试里 `Errors` 从 40 降到 0
- 编辑器一次渲染全部题目：1000 题时有上万个输入控件，页面会卡死。
  改为分批渲染（每批 50 题，可继续加载），保存仍然处理全部题目
- 备份恢复缺少文件体积上限：`readAsText` + `JSON.parse` 整体读入内存，
  误选巨型文件会卡死。加 50MB 上限并给出明确提示

### Added

- xlsx 读取器 11 项测试（真实 zip 结构、XML 实体解码、空白行跳过、
  非 zip 字节、缺工作表、端到端导入）
- 保存语义 2 项测试：落库失败必须 reject、数据层未就绪必须 reject
  （把 `persist` 改回即发即忘时这两条会失败，已反证）

## [1.5.0] - 2026-11-07

### Added

- **Excel(.xlsx/.xls) 直接导入。** 教师的题库大多在 Excel 里。新增独立的
  `src/services/xlsxImport.ts`，用 SheetJS 读工作表后走与 CSV 完全相同的
  `parseRows` 行管线——表头校验、逐题校验、重名跳过只有一份实现。
  xlsx 包约 400KB，走动态 import 拆成独立 chunk，只有真正选了 Excel 文件才加载
- **题库编辑器。** 导入的题库新增「编辑题库」入口（`/edit/:id`）：改题库名称、
  所属考试、描述、每题的题型、题干、选项数量与内容、答案、解析。
  校验复用导入器同一套规则（`buildQuestionSeed`），解析少于 4 字符、
  答案超界、判断题选项数不对都会被拦下。刻意不提供增删与调序：
  题目 ID 是 `{题库ID}-{序号}`，错题本按 ID 引用，增删会让记录串题。
  保存沿用原 ID 与 `importedAt` 整库覆盖
- **APK 运行时自动化验证。** 新增 `scripts/serve-apk-assets.mjs`（解包 APK 真实
  资源并由本地 HTTP 服务）与 `playwright.apk.config.ts`（Pixel 5 视口），
  4 条 E2E 跑在 APK 内容上：启动渲染、导入跨刷新持久化、答错进错题本、
  设置页驱动标识。`pnpm test:e2e:apk` 一键运行
- Excel 导入 7 项测试（真实字节解析、数字不被浮点化、空工作簿、行号定位）、
  编辑流程 2 项测试、编辑器与 Excel 导入各 1 条浏览器 E2E

### Changed

- 导入器抽出 `parseRows` 统一行管线，`parseImportCsv` 变成「文本 → 行 → 管线」
- E2E 的 IndexedDB 读取助手抽取到 `e2e/helpers.ts`，两套配置共用

### Fixed

- `serve-apk-assets.mjs` 初版踩了 `unzip "assets/public/*"` 只展开一级目录的老坑：
  index.html 解出来了但 `assets/` 子目录缺失，SPA 回退把 JS 请求也回成 HTML，
  页面白屏且无任何报错。改为解整个 APK 并注释说明原因

### Verified

- Windows 安装包：静默安装注册 `QuizChest 1.5.0` → 安装目录启动建出 9 张表 →
  静默卸载清零（用户数据保留）
- APK（`versionCode=1005000`）：`verify-apk` 通过；Pixel 5 视口下 4 条运行时
  E2E 全部通过

## [1.4.0] - 2026-11-07

### Added

- **打印试卷。** 组卷页新增「打印试卷」，进入独立打印页：A4 卷面、姓名与得分栏、
  带缩进的选项列表、可选附带答案与解析。屏幕上可先预览再打印或存为 PDF。
  打印时自动隐藏导航、工具栏与深色主题，题目之间不允许跨页断开
- **裸内容构建。** `VITE_BARE_CONTENT=1` 让内置示例题库在构建期被摇掉，
  产物里不存在任何示例题干。实测主 bundle 从 450,935 降到 395,315 字节。
  设置页在该构建下不再显示「显示示例题库」开关，改为说明当前为无内置内容构建
- 打印页 3 条 E2E：卷面不含答案、可切换答案与解析、打印样式确实隐藏导航与工具栏
- `scripts/verify-apk.mjs`：校验 APK 内 `index.html` 引用的每个 JS/CSS 都真实存在、
  不含 PWA 残留（`sw.js` / workbox）、至少各有一个 JS 与 CSS

### Fixed

- **APK 装到手机上会白屏。** 上一版 `artifacts/` 里的 APK 只有 6 个条目，
  `index.html` 引用的 `/assets/index-*.js` 根本不在包里——`cap sync` 复制的是
  被 Web 构建覆盖过的 `dist/`。已重建成原生构建（12 个条目，无 `sw.js`），
  并把 `verify-apk.mjs` 接进 `pnpm build:apk`，坏包会在打包时就失败
- 裸内容构建下设置页仍显示「内置 32 个示例题库」，与实际内容不符

### Verified

- Windows 安装包完整流程：静默安装 → 注册表出现 `QuizChest 1.4.0` 与卸载项 →
  从安装目录启动 → 建出 9 张表的数据库 → 静默卸载 → 安装目录与注册表项清零 →
  用户数据目录保留（重装后数据仍在）
- Android：模拟器在嵌套虚拟化宿主上仍不可用（无 VT-x），改用解包 APK 内真实资源
  由 WebView 加载的方式验证——hash 路由正常、IndexedDB 建出 7 个对象仓库、
  导入题库后刷新仍保留

## [1.3.1] - 2026-11-07

本轮为发布前的完整审计：修掉 5 个真实缺陷，全部补了会失败的回归测试。

### Fixed

- **数据库损坏会导致应用闪退。** `db::open()` 的失败从 `setup()` 里冒泡出去，
  窗口根本建不起来，用户看到的是进程消失；`Root.tsx` 里那张「可以重试」的错误页
  永远显示不出来。现在打开失败会存进状态、窗口照常创建，前端展示错误页
- **错误页没有恢复入口。** 唯一能恢复数据的设置页在数据库打不开时进不去，
  提示语却写着「请用备份文件恢复」，等于死路。错误页现在提供「重试 / 重建空库 /
  从备份文件恢复」三条出口
- **损坏的数据库无法重建。** 新增 `db_rebuild` 命令：把损坏文件改名隔离
  （不删除，用户仍可尝试抢救），删除附属 WAL/SHM，再建一个空库
- **删除题库留下孤儿数据。** 错题与收藏没有外键，删库时只级联了题目，
  设置页的计数会把已无对应题目的行也算进去。SQLite 与 IndexedDB 两端都补了清理
- **导出文件名的日期差一天。** `exporter.ts` 与 `library.ts` 用
  `toISOString().slice(0, 10)`（UTC），东八区晚上 8 点后导出的包日期会落到第二天。
  统一改用本地时区的 `dateKey`
- **`lastCollectionId` 空串被当成有效值。** 存储层用 `''` 表示「无」，
  读回来却是 `Some("")`，导致首页「接着上次」指向一个不存在的题库

### Changed

- `recordWrong` 去掉 `replace` 参数：自增逻辑原本在 store、SQLite、IndexedDB
  三处各写一遍，实际只有 store 那条路径生效。现在只在 store 算一次，
  仓储层按整条记录写入，重试也不会翻倍
- `dateStamp` 原先在 `csvExport.ts` 与 `backup.ts` 各有一份实现，合并到 `lib/quiz.ts`

### Added

- 启动错误页 3 项测试（错误展示、三个出口、重试触发重新加载）
- 删除题库清理错题与收藏的 Rust 测试 + IndexedDB 测试 + E2E
- 损坏数据库识别与隔离重建的 Rust 测试（校验隔离文件内容原样保留）
- 导出文件名使用本地日期的回归测试

### Build

- 三端产物按 1.3.1 重建：NSIS 2.93 MiB、MSI 5.01 MiB、Android APK 4.4 MB
  （`versionCode=1003001`），`artifacts/` 下旧 1.3.0 文件已清理
- 真机路径验证：全新启动建库、主题写入并跨进程保留、损坏库显示错误页并能
  通过「重建空库」恢复使用

## [Unreleased]

### Added

- 模态对话框的焦点陷阱 `src/hooks/useDialogFocus.ts`：打开时焦点移入、Tab/Shift+Tab
  在框内循环、Esc 关闭、关闭后焦点还原。接入搜索框、交卷确认框与通用 `Modal`
- 该 hook 的 6 项 jsdom 测试，覆盖循环、外逃拉回、Esc 与焦点还原
- Playwright E2E（`e2e/critical-paths.spec.ts`）：导入落库并跨刷新保留、
  答错进错题本而答对不进、交卷生成记录、收藏同步、备份导出→重置→恢复、
  搜索框 Esc 关闭、Tab 不逃出模态框、删除题库清理关联数据。
  `pnpm test:e2e` 单独运行，CI 已接入
- 数据库迁移测试 3 项：全新库达到当前版本、已存在的 v1 库重复迁移不清空数据、
  未来版本的库被明确拒绝而不是降级

### Changed

- `migrate()` 改为逐步升级 + 每步独立事务，并新增「库版本高于应用」的显式报错。
  之前用 `IF NOT EXISTS` 一并建表，无法表达未来的增量迁移，也无法阻止老版本
  打开新库后静默写坏数据

### Fixed

- 搜索框页脚写着「Esc 关闭」，但代码只在 AppShell 监听 Escape，组件自身没有处理；
  现已由焦点陷阱统一接管
- 焦点陷阱初版用 `offsetParent !== null` 判断可见性，在 jsdom 里恒为 null 导致
  所有元素被滤掉、陷阱完全失效（测试暴露的真实缺陷），改用 `checkVisibility()`
  并保留不依赖布局的回退判断

## [1.3.0] - 2026-11-06

### Changed

- **存储层从 localStorage 换成设备内数据库。** 桌面端（Tauri）改用 Rust
  `rusqlite` 直连 SQLite，数据库文件位于系统应用数据目录的
  `com.tiyu.questionbank/quizchest.db`；Web / PWA / Android 改用 IndexedDB。
  三端共用 `src/services/repository.ts` 的 `Repository` 接口，页面代码不感知引擎
- 应用启动改为先 `hydrate()` 加载数据库再渲染路由，加载失败给出重试出口而非白屏
- 写操作先更新内存再异步落库；落库失败写入 `persistenceError` 并在设置页显示，
  不再静默丢写
- 设置页新增「本地数据库」一栏，显示当前驱动与数据库真实路径

### Added

- 旧版 `localStorage` 数据（`tiyu-store-v1`）在数据库为空时一次性迁移，成功后删除旧键
- 桌面数据层 17 个 `invoke` 命令与 2 个 Rust 测试（快照往返、删库级联）
- IndexedDB 仓储 11 项测试，覆盖跨连接持久化、历史/组卷裁剪、整库替换与 5MB 以上容量
- store 与数据库联动 5 项测试，覆盖 hydrate、真实落库、失败上报与错题累计
- 导入单文件体积上限 20MB，超限直接拒绝并提示，避免大文件阻塞主线程
- 同名题库导入时明确选择「覆盖原题库」或「新建副本」，不再靠随机 ID 静默产生副本
- 质量门禁新增 `cargo test`；CI 安装 Rust 工具链与 Tauri 系统依赖后同样执行

### Fixed

- 「每日一练」文案声称按「遗忘曲线」配题，但 `buildDailyPlan` 实际只按各领域
  正确率加权，无时间维度。文案已改为如实描述
- 界面多处仍写「保存在本机浏览器」，与新的设备数据库不符

## [1.2.0] - 2026-11-03

### Added

- 完整备份与恢复：设置页可导出包含全部题库、错题、收藏、练习记录、组卷历史与设置
  的 JSON 备份包；导入时逐项结构校验，损坏数据整体拒绝而不是部分导入
- 备份往返、格式校验、版本拒绝等 7 项测试

### Fixed

- 设置页数据概览 6 项指标塞进 5 列网格，末行出现空白占位格
  （改为自适应列数，移动端回落 3 列 / 2 列）

### Build

- 用 1.2.0 重新构建三端产物：NSIS 安装包、MSI 安装包与 Android debug APK，
  产物名已统一为 `QuizChest_<version>_*` / `quizchest-<version>-debug.apk`，
  `artifacts/` 下的旧品牌文件已清理

## [1.1.0] - 2026-11-02

### Added

- 版本号单一来源与跨清单同步工具 `scripts/sync-version.mjs`，纳入质量门禁第一步
- 本地存储容错层：配额耗尽或隐私模式下降级为内存存储，并在界面上提示
  （探测区分「空间不足」与「完全不可用」，两种情况给出不同提示）
- 路由级错误边界，单个页面异常不再导致整站白屏
- 练习流程组件测试 8 项，以及存储、版本、导入容错等测试，全套 109 项
- 双语 README（英文为主）、界面截图、CI 工作流与仓库治理文档
  （CONTRIBUTING / SECURITY / Issue 与 PR 模板）

### Changed

- `PracticeRunner` 由 589 行单体拆分为 `usePracticeSession` 会话 hook
  与 `QuestionCard` / `AnswerCard` / `SubmitDialog` 三个展示组件
- CSV 导入放宽为 5 个必需列（`stem`、`optionA`、`optionB`、`answer`、`explanation`），
  其余列缺省走默认值；新增可选 `title` 列命名题库
- 答案列支持 `B`、`BC`、`B;D`、`B,D`、`B、D`、`B/D` 与 1 起始数字下标；
  未加引号的 `B,D` 自动修复
- 直接粘贴内容按首字符嗅探 JSON / CSV，不再强制按 JSON 解析

### Fixed

- 自定义组卷（`/compose-run`）进入答题后仍渲染侧边栏，破坏全屏练习布局
- 移动端答题卡抽屉开关缺失，无法查看答题卡与跳题
- 移动端底部导航 6 个条目挤进 5 列网格，「统计」溢出到第二行
- 粘贴 CSV 内容校验失败且无任何反馈
- Tauri 安装包名称仍为旧品牌「题屿」

## [1.0.0] - 2026-11-01

### Added

- 本地优先题库应用：导入 JSON/CSV/`tiyu-bank` 题库包
- 三条找题路径：目标路线、领域目录、四种练习策略
- 练习闭环：单选/多选/判断、限时模拟考、错题重练
- 学习数据：错题本、收藏、练习记录、统计图表、自定义组卷与组卷历史
- 跨端构建：Web/PWA、Tauri 桌面端、Capacitor Android
- 白标配置、浅深主题、大字号、键盘作答

[Unreleased]: https://github.com/badhope/quiz-chest/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/badhope/quiz-chest/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/badhope/quiz-chest/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/badhope/quiz-chest/releases/tag/v1.0.0
