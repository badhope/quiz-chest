# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)，格式基于
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

版本号唯一来源是 `package.json`，由 `node scripts/sync-version.mjs set <version>`
传播到 Tauri、Cargo 与 Android 构建清单。发布流程见 [docs/RELEASING.md](docs/RELEASING.md)。

## [2.4.0] - 2026-11-26

把 PDF 的文字层接进现有的题号模板导入。能复制出文字的 PDF 直接选文件，按 `1. 题干 / A. 选项 / 答案：B / 解析：…` 解析；扫描件没有文字层，明确走系统 OCR 后粘贴，不在安装包里塞几十 MB 的语言模型。

### Added

- `src/lib/pdfText.ts`：`extractPdfText` 动态加载 `pdfjs-dist`，按页读取文字层；`pdfItemsToLines` 处理 PDF 文本碎片的坐标、换行与词间距
- `parsePdfImport` 复用 `parseTextImport`，PDF 的页数截断、空页和字符截断进入预览提示；`detectFormat` 增加 `.pdf`
- 导入页接受 `.pdf`，读取时显示页码进度；扫描件直接提示「没有可提取的文字层」并给出系统 OCR 的替代路径
- 导入页增加 PDF 说明块：只读文字层、不做内置 OCR、单次最多 60 页
- `scripts/copy-pdf-assets.mjs` 把 pdfjs 的 CMaps、标准字体与 worker 复制到 `public/pdfjs/`；worker 以 `.js` 提供，避开 Android 本地资源对 `.mjs` MIME 的不确定性
- 单测新增 `pdfText.test.ts` 6 项；Web E2E 增加普通 PDF、CID 中文字体 PDF、扫描件三条；APK 资源 E2E 增加 PDF 导入

### Changed

- `ImportPage` 的文件读取改为 `File.arrayBuffer()` / `File.text()`，Excel、Word、PDF 共用一套异步错误处理，不再为每种格式各写一份 FileReader
- PWA 预缓存加入 `bcmap` 与 `pfb`，离线时 CMaps 和标准字体也能从缓存读取
- README、导入格式、竞品矩阵、跨平台验证与分发文档更新到 2.4.0

### Validation

- 全量单测 40 文件 / 264 项通过；statements 50.83% / branches 40.68% / functions 41.38% / lines 52.12%
- Web E2E 41 项通过（含 PDF 文字层、CID 中文 PDF、扫描件拒绝）；APK 资源 E2E 7 项通过（含 PDF 导入）
- `pnpm lint`、`pnpm typecheck`、`pnpm build` 通过；PWA precache 210 条 / 4713.84 KiB
- PDF 运行时新增约 3.7 MB（CMaps 1.7 MB、标准字体 0.8 MB、worker 1.3 MB），release APK 从 2.3.0 的 3,808,939 bytes 增至 5,913,131 bytes（5.6 MB），debug 包 7,112,542 bytes（6.8 MB）；这是文字层解析的代价，不包含 OCR
- release APK 5,913,131 bytes，SHA-256 `f0ad80f9bc89648fa4c1efed3023f29542cc0b332e596a90a67320bc01e3a803`；release AAB 5,786,356 bytes，SHA-256 `e4bb0368e19c774b89f090985394f00cf09a6edf69cf6dbe8e32903816864114`
- 无真机、无 KVM/adb；APK E2E 仍是浏览器加载 APK 内资源，不是真机验证

## [2.3.0] - 2026-11-26

把模拟考试从「倒计时 + 交卷」补成能结算的卷子。分数不靠正确率反推：单选 2 分、多选 3 分、判断 1 分、填空 2 分、简答 4 分，及格线为满分 60%，结果页给题型拆分。PDF/OCR 仍未做，留在路线图。

### Added

- `src/lib/exam.ts`：固定题型分值、`scoreExam` 结算、满分 60% 及格线；未作答按 0 分，不做负分
- `ExamResult` / `ExamTypeResult`：总分、满分、及格线、是否及格与按题型聚合；`HistoryEntry` 增加可选 `exam`
- 结果页增加 `ExamReport`：分数、及格线刻度、按题型得分条与「单选 2 分 / 多选 3 分…」口径说明
- 练习记录与题库详情显示模考得分；结果页用 `record` 参数定位本次记录，刷新后仍是同一场分数
- IndexedDB 与 SQLite 同步保存模考结果；桌面 schema v5 增加 `history.exam_json`，老记录读出为空，按普通练习展示
- 单测新增 `exam.test.ts` 5 项；Web E2E 新增模考计分闭环，APK 资源 E2E 新增同一条链路

### Changed

- `usePracticeSession.finish` 在 `mode === 'exam'` 时先结算再写入记录；结果页优先读取该记录的 `exam`，读不到才退回正确率
- 规范化文档口径：题小星 2.3.0 的模考不计排名、不做能力诊断，只回答「这场得了多少、过没过、哪类题丢分」
- README 中英文补齐模考结算说明与桌面/手机截图；竞品矩阵把「无及格线 / 分数报告」改为 2.3.0 能力

### Validation

- 全量单测 39 文件 / 258 项通过；statements 50.83% / branches 40.5% / functions 41.05% / lines 52.16%
- Web E2E 38 项通过；新增「模拟考试按题型赋分、判定及格线并保存模考记录」
- APK 资源 E2E 6 项通过；新增 APK 内模考结算
- `pnpm lint`、`pnpm typecheck`、`pnpm build` 通过；PWA precache 30 条 / 1583.61 KiB
- 本机 `cargo check` 通过；`cargo test` 仍因缺 GTK/WebKit 链接库无法链接，由 CI 执行
- APK/AAB 哈希见 `docs/DISTRIBUTION.md` 与 GitHub Release

## [2.2.0] - 2026-11-25

把题库题型从三种扩到五种。填空和简答不另起一套题，复用原来的题库、错题、练习记录和备份；旧数据不需要迁移。PDF/OCR 和模考计分不在这一版，仍按路线图单独做。

### Added

- `QuestionType` 增加 `fill` 与 `short`；`Question` 增加可选的 `answerText`、`keywords`，错题条目增加 `lastText`，续做会话增加 `textAnswers`
- `src/lib/quiz.ts`：`normalizeAnswerText` 做 NFKC、大小写、空白与常见标点归一化；填空命中任一可接受答案，简答要求全部判分关键词出现；无关键词时保留参考答案全等回退
- 练习链路：`QuestionCard` 为填空题渲染单行输入、为简答题渲染多行输入；`usePracticeSession` 的已答、判分、错题、自动保存、续做与交卷同时处理选项和文本
- 文本题判分文案不冒充语义评分：简答显示「关键词全部命中 / 关键词没覆盖全」，答错时列出「这次没写到：…」；填空多答案时展示可接受答案
- JSON / CSV 导入增加 `answerText`、`keywords`；文本模板增加 `【填空题】`、`【简答题】`、`参考答案：`、`关键词：`；简答题没有关键词会跳过并提示
- 题库编辑器支持填空/简答：文本答案用 `|` 分隔多个可接受值，简答关键词同样用 `|` 分隔，保存前走同一套校验
- 背题页、打印页、错题本、题库构成统计、导入结果统计与问小星协议同步识别文本题；错题 CSV 增加「最近作答」「错因」「笔记」列
- 新增测试：填空、简答、归一化、JSON/文本导入、编辑器、错题 CSV、含文本题的备份往返；E2E 新增填空/简答导入到作答与错题、编辑器保留文本题答案与关键词

### Changed

- README 中英文、导入格式文档、竞品路线图、开发记录更新到 2.2.0
- CSV 表头仍保留 `stem`、`optionA`、`optionB`、`answer`、`explanation` 五个基础列；文本题把选项与 `answer` 留空，避免旧 CSV 和旧工具链被破坏
- 题库详情与导入结果的题型统计按实际存在的题型显示，题库里没有填空/简答时不额外占位

### Fixed

- 题库详情的题型摘要原来写死「单选、多选、判断共 N 题」，文本题库会显示错题型；改为按实际题型拼接，如「填空、简答共 2 题」
- 已提交的文本题输入框仍用弱化颜色，看起来像占位提示；改为保持正文色，并保留禁用态背景

### Known limits

- 简答按关键词全命中判分，不理解否定、语序或同义表达；页面明确写的是关键词命中，不是老师评分
- 无真机、无 KVM/adb；Android 仍只做 APK 资源级 E2E，截图来自浏览器渲染
- PDF/OCR 与模考分数报告尚未开始

### Validation

- 全量单测 38 文件 / 253 项通过；statements 50.57% / branches 41.06% / functions 41.02% / lines 51.86%
- Web / PWA E2E 37 项通过；新增两条文本题链路
- APK 资源 E2E 5 项通过；新增一条「APK 内导入并作答填空题」
- `pnpm lint`、`pnpm build` 通过；Web PWA precache 30 条 / 1576.89 KiB
- APK 3,807,207 bytes；SHA-256 `99cf43895349ef5ed4241b1092c311eaade0c3a9ab4c1298e329c4178592d0ce`；versionCode 2002000
- AAB 3,662,690 bytes；SHA-256 `d0d23c8aab8f59255a5210243f77e2bc4192f0578e405da9c37b45d734cebbf6`；签名校验通过
- 无真机、无 KVM/adb；截图来自浏览器渲染，系统返回键、分享面板与状态栏仍未设备实测

## [2.1.0] - 2026-11-25

把自有题库的闭环从「Excel / CSV / JSON 导入 + 做题」补到「Word / TXT / Markdown 导入 → 练习或背题 → 错题标错因、写笔记 → 看见未来 7 天复习量」。不是追考试宝的题型数量，也不引入题库交易、课程、排名或账号云同步。

### Added

- `src/lib/docxText.ts`：只解压 `.docx` 的 `word/document.xml`，抽正文段落、tab 与换行；限制解压后大小，不引入 mammoth
- `src/lib/textImport.ts`：题号模板解析，支持单选、多选、判断，`答案：A、D`、判断题自动补「正确/错误」、缺解析占位、重复题干跳过、单次 2000 题上限
- 导入页支持 `.docx` / `.txt` / `.md` 文件、文本模板下载与直接粘贴；`detectFormat` 与内容识别同步扩展
- `src/pages/StudyPage.tsx` 与 `/study/:collectionId`：背题模式，显示/收起答案、上一题/下一题、打乱、收藏、键盘左右/空格/Enter；不判分、不写历史、不写错题、不占 FSRS
- 错题本新增四类错因（概念没懂 / 方法不对 / 粗心 / 时间不够）与 200 字题目笔记，`useAppStore.updateWrongMeta` 即时落库
- 错题本新增未来 7 天 FSRS 到期预测，逾期题归入今天；`dueForecast` 与 `ERROR_REASON_LABELS` 可复用
- `docs/COMPETITORS.md`：考试宝 / 粉笔 / Anki / Quizlet 能力矩阵、2.1.0 取舍与 P1-P3 缺口
- `textImport.test.ts` 6 项、`review.test.ts` 3 项；E2E 新增文本导入、Word 文档导入、背题模式、错因与笔记持久化

### Changed

- `ImportFormat` 扩展为 `json | csv | xlsx | docx | text`；导入页文案从「粘贴 JSON」改为「粘贴题库内容」
- 题库详情增加「背题模式」入口；底部导航将 `/study` 归入「题库」
- 备份 schema 的错题条目接受可选 `reason` / `note`，旧备份仍可读；备份测试断言元信息可往返
- README 中英文、导入格式文档、信息架构与桌面/手机截图更新到 2.1.0

### Fixed

- `.docx` 文件虽然能抽出文本，却在确认阶段被 `detectFormat` 当成不支持格式拒绝；`runParse` 现在接受文本覆盖格式，Word 导入真正走通
- 粘贴文本时内部文件名使用 `.text` 后缀，导致 `detectFormat` 返回空并报「仅支持」；改为生成 `.txt` 名称
- `recordWrong` 用 `...entry` 覆盖旧错题条目，会把已有 `reason` / `note` 抹掉；改为 `...existing, ...entry`
- E2E 错因用例误用 Testing Library 的 `getByDisplayValue`，改为 Playwright 的 textarea `toHaveValue`

### Validation

- `pnpm lint`、`pnpm build` 通过；Web PWA precache 30 条，约 1565.04 KiB
- 全量单测 38 文件 / 246 项通过；Web E2E 35 项通过；新增 4 条 E2E（文本粘贴、Word 文档、背题、错因笔记刷新）
- 无真机、无 KVM/adb；Android 仍只做资源级 E2E，不能写成真机验证

## [2.0.4] - 2026-11-25

内置题库从“能打开”补到“能直接练”。不是把题量数字堆高，而是把重复题、同一句换个说法再问一遍的填充题清掉，再把每个题库补到至少 20 道可连续练习的题。

### Added

- `src/data/questions/deepen.ts`：新增 228 道补充题，覆盖 32 个题库，按概念、应用和辨析补足题型与难度
- 每个题库至少 20 题、32 个题库共 641 题；新增题干去重、题型混合、选项不重复、解析和标签完整性检查
- `quiz.test.ts` 增加“同一题库不重复题干”用例，题库下限从 460 道 / 每库 12 题提高到 640 道 / 每库 20 题

### Changed

- 题库详情与题库卡片不再标“示例题库 / 非正式教材”，改为“内置题库 · 入门可用”；设置页同步改名
- 设置页说明改为“32 个内置题库每库至少 20 题，打开就能练”，删除“只有 6-7 题，仅演示结构”的旧文案
- 题库详情补一句“可以先做一半，退出后进度会保留”，把 20 题库的使用方式说清楚
- README 中英文题库总量更新为 641 道、每库至少 20 题；首页、题库总览、答题、统计、设置与手机端截图重新拍摄

### Fixed

- 清理 50 道重复或同义题，包括微积分、概率、四级、会计、施工管理、日语、算法、网络、地理、艺术等题库中的成对重复
- 题库合并阶段增加题干归一化去重，避免以后补充题再次把同一道题塞进同一题库

## [2.0.3] - 2026-11-25

把「AI 刷题助手」里缺的本地讲解模块补上。不是再加一个刷题页，而是让答题解析区能接用户自己的本机模型，同时守住「题目不出本机」的边界。

### Added

- `src/lib/tutor/`：`config.ts`、`protocol.ts`、`transport.ts` 与统一导出。默认关闭，只接受 `127.0.0.1` / `localhost` / `::1`，拒绝公网、局域网、账号信息和非 http(s) 端点
- 答题解析区「问小星」入口与弹层：题库解析先行，本机模型回答可追问；支持「只给提示」「换一种说法」，对话只在内存中保留，换题或关闭即清空
- 设置页「本地 AI 讲解」分组：开关、接口地址、模型名、保存与测试连接；测试只发固定探测文本，不发送题目
- `AppSettings.tutor` 与备份 schema 字段；旧备份缺少该字段时自动补默认值，不改变其他设置
- `android/app/src/main/res/xml/network_security_config.xml`：只为本机回环开 cleartext HTTP，其他明文请求仍按 Android 默认拒绝
- `e2e/tutor.spec.ts`：3 项端到端测试，覆盖默认关闭不发请求、只发当前题与追问消息顺序、HTTP 500 降级
- `src/lib/tutor/tutor.test.ts`：17 项单测，覆盖端点校验、prompt 边界、响应解析、超时/错误降级、连接测试与旧设置归一化

### Changed

- 版本升到 `2.0.3`，Android `versionName=2.0.3`、`versionCode=2000003`
- 答题解析头部加入讲解入口，320px 下保持 44px 入口热区，弹层在 320×568 视口内 `x=10,y=8,w=300,h=552`，无横向溢出
- Android 原生壳走 `CapacitorHttp`，避开 WebView CORS 与 mixed-content；Web 端仍走 `fetch`，需要本机服务允许 CORS
- README 中英文的「AI」段落改为两套能力：本地学情规则 `小星建议` 与可选本机模型 `问小星`；新增手机讲题截图
- `docs/LOCAL_AI.md` 从设计草案改为已实现说明，写明 45 秒超时、纯文本输出、不传图片/题库/历史、Android 限制与真机验收缺口

### Fixed

- 追问消息顺序错误：初版把追问塞进题目上下文，导致 `assistant` 回答出现在 `user` 追问之前。现在固定为 `system → 题目上下文 → 历史 → 新追问`，E2E 校验 4 条消息的角色顺序
- 旧备份缺少 `tutor` 字段时可能只剩部分设置；`normalizeSnapshot` 与 `SettingsSchema` 均已补默认值

## [2.0.2] - 2026-11-25

手机端冲突修复与 Android 环境适配版。重点不是把桌面截图缩小，而是把 320px 窄屏、
刘海安全区、软键盘、系统返回键和 WebView 文件导出逐项改成真实可用，并补了手机专项
E2E。

### Added

- `src/styles/mobile.css`：900 / 560 / 380px 与横屏 `max-height:520px` 的移动适配层，
  统一 44px 触控热区、安全区、底栏、练习顶栏/操作栏、搜索/交卷/分享弹层与导入设置布局
- `src/hooks/useAndroidBackButton.ts`：Android 原生返回键监听；优先关搜索、侧栏、
  对话框、答题卡、练习退出确认，最后才走 WebView 历史和 `App.exitApp()`
- `src/lib/platform.ts`：`isNativeMobile()` 与 `syncSystemChrome(theme)`，同步
  `theme-color` 和 Capacitor `SystemBars` 明暗图标
- `@capacitor/filesystem@8`、`@capacitor/share@8`：原生壳导出改为写缓存后打开系统
  保存/分享面板
- `e2e/mobile.spec.ts`：11 项手机专项测试，覆盖 320/390 窄屏、触控尺寸、答题卡遮罩、
  交卷框定位、搜索缩视口、模拟刘海、导入 MIME 与手机导出
- `src/lib/download.native.test.ts`：2 项原生导出单测，验证缓存路径、系统分享参数和
  失败返回
- `scripts/capture-mobile-screenshots.mjs` 与 `pnpm capture:mobile`：390×844 触控视口
  截图脚本

### Changed

- `index.html` viewport 增加 `viewport-fit=cover`、`interactive-widget=resizes-content`
  与 Apple Web App meta
- `capacitor.config.ts` 接入 Capacitor 8 内置 `SystemBars`：`style: LIGHT`、
  `insetsHandling: css`、`initialViewportFitValueHint: cover`
- `AndroidManifest.xml` 的 Activity 增加 `android:windowSoftInputMode="adjustResize"`；
  `styles.xml` 使用透明状态栏/导航栏、`shortEdges` 刘海模式、splash 后主题，关闭
  系统栏对比度蒙层和 `forceDarkAllowed`，避免 WebView 被系统自动反色
- 导出链路统一到 `src/lib/download.ts`：浏览器走 blob + `a[download]`；原生壳走
  `Filesystem.writeFile(Directory.Cache/exports)` + `Share.share`，并把结果返回给
  设置页、题库详情和分享弹层
- 导入 input 接受 Android 常见的 `.xlsx/.csv/.json` MIME；读取后清空 `value`，修正
  文件后可以重新选择同一路径
- PWA manifest `orientation` 改为 `any`，shortcuts 修正到
  `/catalog`、`/review?tab=wrong`、`/records?tab=stats`
- 移动底栏归属修正：`/collection`、`/edit`、`/compose`、`/print` 归「题库」；
  `/goals`、`/goal` 归「策略」；`/result` 归「档案」；「设置」只匹配 `/settings`
- 版本升到 `2.0.2`，Android `versionName=2.0.2`、`versionCode=2000002`

### Fixed

- 交卷确认框实际不在屏幕内：`pages.css` 的 `position: fixed` 被后导入的
  `practice.css` 相对定位反压；改为完整的 fixed 居中、移动端按安全区限宽限高
- 搜索弹层在手机端被桌面固定定位规则打散，底部越出 568px 视口；移动端改为
  `top/bottom + 安全区` 的固定面板，页脚留在面板底部
- 320px 答题顶栏副标题换行挤压标题、sticky 进度条被顶栏遮住；小屏隐藏副标题、
  标题单行省略、进度条改回文档流
- 答题操作按钮在首屏看不到；移动端改为横向 sticky 底栏，两枚按钮各占一半并预留
  底部安全区
- 答题卡抽屉没有遮罩、背景可误触；新增全屏遮罩、打开时锁 body 滚动、格子按
  44px 自适应
- 320px 题库工具条被压成两列；搜索框和导入按钮改为纵向铺满
- 导入 textarea 等 class 选择器仍为 11.5px，聚焦会触发 iOS/WebView 放大；统一显式
  覆盖为 `max(16px, 1em)`
- 题库总览标题在 390px 下只剩一个「库」字独占一行；窄屏按语义断成两行
- `panel-in` / `share-in` 动画的 `transform` 覆盖弹层自身定位；改为独立
  `translate` / `scale` 属性
- Android WebView 中 `a[download]` 可能静默失败；原生壳不再依赖它
- 剪贴板 API 不可用时口令复制失败；增加 textarea + `execCommand('copy')` 兜底

### Verification

- 全量质量门禁逐项通过（与 `pnpm check` 同口径）：版本五项、typecheck、lint、
  35 个测试文件 / 218 项、Web build、`cargo test` 14 项、依赖审计 0 条
- 单测覆盖率：statements 50.83%、branches 40.14%、functions 42.24%、lines 51.9%，
  均高于 40 / 32 / 40 / 32 的项目阈值
- `pnpm test:e2e`：28 项通过（原 17 项 + 手机专项 11 项）
- `pnpm test:e2e:apk`：4 项通过，直接加载 2.0.2 APK 内的 `assets/public` 资源
- Android APK/AAB 使用 JDK 21 + SDK 36 实际编译；`verify-apk`、`apksigner`、
  `jarsigner` 全部通过

### Known

- 当前宿主没有硬件虚拟化，未做 Android 模拟器/真机安装。系统分享面板、硬件返回键、
  状态栏图标和 `SystemBars` CSS inset 的最终表现仍需目标机型抽测
- `window.print()` 在 Android WebView 中不保证打开系统打印面板；打印试卷仍按桌面
  浏览器能力设计

## [2.0.1] - 2026-11-24

内置题库补齐版。2.0.0 的 32 个分类里有 13 个是 0 题空壳，这次把每个题库都填到至少
12 题，并给首页和题库总览加了总量显示。

### Added

- `src/data/questions/extra.ts`：按 collection id 追加题目，原有题目 ID 不变；
  `src/data/index.ts` 在运行时合并基础种子与补充种子
- 32 个题库全部有题，共 463 道；K12、大学、职业证书、语言、编程、公共基础、通识
  七个领域都能直接开练
- 首页路径二和题库总览显示「32 个题库 · 463 道题」，不再是只有分类没有题量
- README 增加「内置题库」说明；`quiz.test.ts` 的下限提高到 460 道 / 每库 12 题

### Changed

- 版本升到 `2.0.1`，Android `versionCode=2000001`
- 重拍首页、题库总览、练习、统计、设置五张 README 截图，截图数字与新题库一致
- 截图脚本不再假设题库只有 6 题，改为做到「完成练习」出现再提交

### Fixed

- 补齐 `calculus`、`probability`、`cet4`、`accounting`、`pharmacist`、`japanese`、
  `algorithms`、`sql`、`network`、`verbal`、`quantitative`、`essay`、`arts`
  13 个空题库
- `linear-algebra`、`teacher-cert`、`construction-law`、`toefl-listening`、
  `life-science`、`ts-types` 题量不足 12 的题库一并补齐

## [2.0.0] - 2026-11-24

题小星品牌迁移版。安装身份、题库包格式和数据库名都换了，不能当普通升级覆盖安装。

### Added

- 首页「小星建议」：本地学情引擎，按历史正确率、错题到期和今日进度给出练习入口，
  不联网、不调用大模型（`src/lib/coach.ts`）
- 导入兼容 Windows 编辑器留下的 UTF-8 BOM；CSV 未加引号的 `B,D` 答案、被逗号切开的
  data URI 继续走修复管线
- `docs/DEVLOG.md` 记录真实迁移过程和已知限制；`docs/LOCAL_AI.md` 写清本地模型接入边界

### Changed

- 仓库、根目录、Android `applicationId`、Java 包、Capacitor `appId`、Tauri `identifier`
  统一改为题小星命名
- 版本升到 `2.0.0`，Android `versionCode=2000000`
- 题库包标识改为 `tixing-bank`，扩展名 `.tixing.json`；加密包改为
  `tixing-bank-encrypted`，扩展名 `.tixing.enc.json`
- 数据库文件名改为 `tixing.db`，IndexedDB 库名改为 `tixing`
- 设置 setter 收口为 `updateSettings(patch)`，减少六份重复的 `set + persist`
- 每日一练先排除最近做过的题，题库不够时再回填，避免回填把最近题又抽回来
- 错题排序固定为到期优先、到期组内按错误次数降序

### Removed

- 旧版 `localStorage` 一次性迁移和 `useStorageHealth`。新安装身份不继承旧数据，
  需要旧数据时先用旧版导出完整备份，再到新版恢复

### Fixed

- 修复题库快照注释里的旧 ID 格式，实际 ID 为 `${bankId}:r${revision}`
- 修复导入模块里错位的注释块，`repairUnquotedAnswer` 的说明不再挂到 data URI 修复函数上
- 统计页累计时长不足一分钟时显示「不到 1 分钟」，不再显示容易误解的「0 分钟」
- 首页建议的标题与提示顺序统一：有到期错题时先清错题，再提薄弱领域
- README 五张界面图改为当前 2.0 构建实际运行截图，替换 1.9.1 旧素材
- release 证书重新生成，证书 DN 与 SHA-256 不再带旧品牌；旧 keystore 离线备份

## [1.9.1] - 2026-11-24

把「本地题库工具」补成可以分发、可以分享、扛得住大题库的工作台。

### Added

- **Android release 分发链路。** 新增 `pnpm build:apk:release` 与
  `pnpm build:aab:release`：Gradle 读取 `android/keystore.properties` 签名，
  产物归档到 `artifacts/`；构建结束自动跑 `apksigner` / `jarsigner` 验签。
  debug 构建仍走 `pnpm build:apk`，不碰签名材料
- **加密题库包。** 导出 `.tixing.enc.json`：PBKDF2-SHA256（310,000 次）派生
  AES-256-GCM 密钥，每个包独立 salt/IV；版本、KDF 参数与算法名进入 AAD，
  篡改信封会直接解密失败。导入页识别加密包后要求输入口令，解密完仍走同一套
  valibot 校验
- **局域网一次性分享。** 桌面端从题库详情生成 20 位口令，起一个只监听局域网的
  临时 HTTP 服务（随机路径 token、10 分钟自动退出），手机扫码下载加密包；
  不引入账号、云和中继。口令与文件分开传递
- **大题库检索索引。** 搜索框改为倒排索引：中文二元组、英文/数字前缀，
  查询取交集后再用原文 `includes` 精确过滤；按题库数组引用缓存，题库版本不变
  时复用索引。搜索框加 `useDeferredValue`，输入不被全量扫描拖慢
- **渐进渲染。** 题库总览/领域页首屏只挂 48 张卡片，接近底部再追加；
  配合 `content-visibility: auto` 跳过视口外布局与绘制。没有用固定行高虚拟化：
  卡片高度随标题/标签变化，硬裁会掉字
- **统计页跟随题库快照。** 导入/删除题库后，领域分布不再停留在旧数据

### Changed

- 版本升到 `1.9.1`（Android `versionCode=1009001`）。Web、桌面、Android 共用
  同一份 `package.json` 版本源
- 搜索结果的「所属题库」改从完整题库表取标题，不再只查前 6 个命中题库

### Fixed

- 清空收藏/错题/记录、删除题库改为先 `await` 仓储成功再清内存；三种仓储的
  `deleteBank` 级联清理题库快照
- 题库查询缓存、策略生成单次快照、首页/统计 `useMemo`，避免每次渲染重建数组
- GitHub Actions 升到 v7/v6，CI 增加 `pnpm build:native`；pnpm overrides 迁到
  `pnpm-workspace.yaml`，依赖审计 0 条
- `pnpm build:apk` 之前只同步不编译；新脚本自动探测 JDK21 / Android SDK、
  执行 Gradle、归档并校验资源完整性
- 领域页 Hook 顺序、`CatalogPage` 每 render 全量过滤、`DomainPage` 汇总重复计算

### Verified

- 单元测试：34 个文件、216 项通过（含加密包 6 项、搜索索引 6 项、渐进渲染 2 项）
- Rust：`cargo test` 14 项通过（含 HTTP 文件服务 200/404、路径 token、文件名净化）
- Android：release APK 459 条目、`apksigner` 验签通过；AAB `jarsigner` 验签通过
- 构建：`tsc -b`、`eslint .`、`pnpm build:native`、`pnpm build` 通过
- E2E：17 项通过（含加密包下载→重新导入时强制输入口令）

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

- Windows 安装包：静默安装注册 `TiXing 1.5.0` → 安装目录启动建出 9 张表 →
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

- Windows 安装包完整流程：静默安装 → 注册表出现 `TiXing 1.4.0` 与卸载项 →
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
  `com.tixing.offline.ai/tixing.db`；Web / PWA / Android 改用 IndexedDB。
  三端共用 `src/services/repository.ts` 的 `Repository` 接口，页面代码不感知引擎
- 应用启动改为先 `hydrate()` 加载数据库再渲染路由，加载失败给出重试出口而非白屏
- 写操作先更新内存再异步落库；落库失败写入 `persistenceError` 并在设置页显示，
  不再静默丢写
- 设置页新增「本地数据库」一栏，显示当前驱动与数据库真实路径

### Added

- 旧版 `localStorage` 数据（`tixing-store-v1`）在数据库为空时一次性迁移，成功后删除旧键
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
  产物名已统一为 `TiXing_<version>_*` / `tixing-<version>-debug.apk`，
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
- Tauri 安装包名称仍为旧品牌「题小星」

## [1.0.0] - 2026-11-01

### Added

- 本地优先题库应用：导入 JSON/CSV/`tixing-bank` 题库包
- 三条找题路径：目标路线、领域目录、四种练习策略
- 练习闭环：单选/多选/判断、限时模拟考、错题重练
- 学习数据：错题本、收藏、练习记录、统计图表、自定义组卷与组卷历史
- 跨端构建：Web/PWA、Tauri 桌面端、Capacitor Android
- 白标配置、浅深主题、大字号、键盘作答

[Unreleased]: https://github.com/badhope/ti-xing-offline-ai-practice/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/badhope/ti-xing-offline-ai-practice/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/badhope/ti-xing-offline-ai-practice/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/badhope/ti-xing-offline-ai-practice/releases/tag/v1.0.0
