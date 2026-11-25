# 跨端方案：一套代码，三端运行

本项目是纯前端单页应用（React 19 + TypeScript + Vite），构建产物是静态文件，因此可以用同一份代码分别封装成 Web、桌面应用和 Android App。

```
src/ + public/           一份源码
        │
        ├─ pnpm build ──────► dist/ ──► 任意静态托管（Web / PWA）
        ├─ Tauri 2 ────────► Windows / macOS / Linux 安装包
        └─ Capacitor 8 ────► Android APK / AAB（iOS 同理）
```

## 一、方案对比（为什么选 Tauri + Capacitor）

| 维度 | Tauri 2（桌面） | Capacitor 8（移动） | Electron | React Native / Flutter |
| --- | --- | --- | --- | --- |
| 复用本仓库 UI | 直接加载 `dist/`，零改动 | 直接加载 `dist/`，零改动 | 直接加载，零改动 | 需要重写 UI |
| 安装包体积 | 约 3–10 MB | 约 5–8 MB 壳 + WebView | 约 90–150 MB | 约 15–40 MB |
| 安卓支持 | 无 | 原生支持 | 无 | 支持 |
| 系统 WebView | 系统 WebView（Win: WebView2） | 系统 WebView | 自带 Chromium | 自绘引擎 |
| 学习成本 | 低（Rust 仅构建期） | 低（JS/TS） | 中 | 高 |
| 结论 | 桌面首选 | 安卓首选 | 体积过大 | 需重写，放弃 |

本仓库已内置 PWA（`vite-plugin-pwa`），所以第三条路线「浏览器安装到桌面/手机桌面」开箱即用，不需要任何额外构建。

## 二、Web / PWA（已完成）

```bash
pnpm install
pnpm build          # 产出 dist/
pnpm preview        # 本地预览 http://localhost:4173
```

部署时把 `dist/` 交给任意静态服务器即可。`dist/sw.js` 与 `dist/manifest.webmanifest` 已生成，浏览器访问后可「安装到桌面」或「添加到主屏幕」，离线可用。

注意：SPA 需要把未知路径回退到 `index.html`。Nginx 示例：

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

## 三、桌面端（Tauri 2）

状态：**已落地（Windows x64）**。仓库包含 `src-tauri/` 工程、Tauri 配置、图标与桌面构建脚本 `scripts/build-desktop.cmd`。本机已用 Visual Studio 2022 BuildTools + Rust MSVC 工具链验证。

前置：Rust 工具链（`rustup`）、Visual Studio C++ Build Tools、Windows WebView2（Win10/11 自带）、Node 20+。

首次初始化（新环境或重新生成时）：

```bash
pnpm add -D @tauri-apps/cli@2
pnpm tauri init
```

`src-tauri/tauri.conf.json` 关键配置：

```json
{
  "identifier": "com.tixing.offline.ai",
  "build": {
    "beforeBuildCommand": "pnpm build:native",
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "题小星 · TiXing",
        "width": 1280,
        "height": 860,
        "minWidth": 960,
        "minHeight": 640
      }
    ]
  },
  "bundle": {
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico", "icons/icon.icns"]
  }
}
```

打包命令：

```bash
pnpm desktop:dev             # 开发热更新（适合已配置好 MSVC 的终端）
pnpm desktop:build            # 产出安装包（同样需要 MSVC + WiX/NSIS）

# Windows / Git Bash 推荐：脚本自动注入 MSVC 环境
scripts/build-desktop.cmd --no-bundle  # 仅编译 tixing-desktop.exe
scripts/build-desktop.cmd              # 产出 NSIS/MSI 安装包
```

Windows 推荐在 Git Bash 中执行 `scripts/build-desktop.cmd`：脚本会自动查找 Visual Studio C++ Build Tools，注入正确的 MSVC 链接器，再调用本地 Tauri CLI，避免 Git Bash 自带 `link.exe` 抢占。

产物位置：`src-tauri/target/release/bundle/nsis/TiXing_<version>_x64-setup.exe`
与 `bundle/msi/TiXing_<version>_x64_en-US.msi`（MSI 需要 WiX 下载）。
二进制位于 `src-tauri/target/release/tixing-desktop.exe`（crate 名保留历史命名，
用户可见名称由 `tauri.conf.json` 的 `productName` 决定）。

桌面端注意事项：

1. 原生壳构建时执行 `pnpm build:native`（Vite 的 `native` 模式，见 `src/App.tsx`），改用 `HashRouter` 并关闭 PWA，避免本地静态服务器缺少 SPA 回退导致深层路由 404。Web 部署保持默认的 `BrowserRouter`。
2. 本地数据存于设备上的 SQLite 数据库文件（`src-tauri/src/db.rs`，Rust `rusqlite` + bundled SQLite），路径为系统应用数据目录下的 `com.tixing.offline.ai/tixing.db`。卸载是否保留该目录由系统与用户决定，长期留档仍应使用设置页的完整备份。
3. 想加系统托盘、开机启动、自动更新，均在 `src-tauri` 内配置，不影响前端代码。

## 四、Android（Capacitor 8）

前置：JDK 21、Android SDK（`platforms/android-36` + `build-tools;36.0.0`）。Capacitor 8 的 Java 源码按 21 编译，JDK 17 会报 `invalid source release: 21`。

```bash
export ANDROID_HOME=/path/to/android-sdk
export JAVA_HOME=/path/to/jdk-21
pnpm build:apk
```

`pnpm build:apk` 会依次执行 native 前端构建、`cap sync android`、Gradle
`assembleDebug`，把 `android/app/build/outputs/apk/debug/app-debug.apk` 复制到
`artifacts/tixing-<version>-debug.apk`，再跑资源完整性校验。SDK 与 JDK 未显式指定时，
脚本会在 `~/android-sdk`、`~/Android/Sdk`、`/usr/lib/android-sdk` 等常见目录里寻找；
JDK 21 也会在 `~/tools` 与 `/usr/lib/jvm` 下探测。

产物约 4.4 MB。Linux 云主机与 Windows 本机均已实测通过；Windows 也可继续使用
`android/gradlew.bat` 或本地 Gradle 8.14.3。

`app/build.gradle` 中的 `versionName` / `versionCode` 由 `scripts/sync-version.mjs`
统一维护，`versionCode` 按 `major*1_000_000 + minor*1_000 + patch` 推导，
不要手工修改。完整发布流程见 [RELEASING.md](RELEASING.md)。

> 注意：`gradle/wrapper/gradle-wrapper.properties` 默认指向 services.gradle.org，本机网络不可达；因此实际构建使用本地 Gradle 8.14.3，并设置 `GRADLE_USER_HOME` 到短路径（避免 Windows 长路径与 JVM 内存问题）。`org.gradle.jvmargs` 控制在 1024m，否则 16 GB 内存机器上 daemon 会 OOM。

```bash
pnpm add @capacitor/core@8 @capacitor/android@8
pnpm add -D @capacitor/cli@8
npx cap init "题小星" "com.tixing.offline.ai" --web-dir dist
pnpm build:native
npx cap add android
npx cap sync android
npx cap open android
```

`capacitor.config.ts`：

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tixing.offline.ai',
  appName: '题小星',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#f4f0e7',
  },
  plugins: {
    // Capacitor 8 内置插件：刘海/手势区尺寸以 --safe-area-inset-* 交给页面。
    SystemBars: {
      style: 'LIGHT',
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
}

export default config
```

构建 APK：

```bash
cd android
./gradlew assembleDebug          # 调试包：app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease          # 上架包：app/build/outputs/bundle/release/app-release.aab
```

日常改动后的同步流程：`pnpm build:native && npx cap sync android`。

### 手机端适配（2.0.2 收口）

这一层不是“把桌面页面缩小”，而是按真实触控和原生壳行为单独处理：

1. **窄屏布局**：`src/styles/mobile.css` 在 900 / 560 / 380px 和横屏
   `max-height:520px` 下重排。320×568、390×844 巡检时 `documentElement.scrollWidth`
   等于视口宽度；题库页只有 `.tree-nav` 按设计横向滚动。主按钮、答题卡格子和底栏
   保持至少 44px 热区。
2. **安全区**：`tokens.css` 定义 `--safe-top/right/bottom/left`，
   `var(--safe-area-inset-*, env(safe-area-inset-*, 0px))`；`SystemBars` 用 `css`
   模式注入原生变量，旧 WebView 的 `env()` 缺陷由插件兜底。顶栏、侧栏、底部导航、
   存储提示、练习顶栏、搜索/分享/交卷弹层都接同一组变量。
3. **系统栏**：`src/lib/platform.ts` 的 `syncSystemChrome(theme)` 在主题切换时同步
   `theme-color` 和 `SystemBars` 明暗图标；不额外安装 `@capacitor/status-bar`。
   `styles.xml` 使用透明状态栏/导航栏、`shortEdges` 刘海模式，关闭系统栏对比度
   蒙层和 Android 10+ 的 `forceDarkAllowed`，避免系统深色把 WebView 自动反色。
4. **软键盘**：`AndroidManifest.xml` 的 Activity 使用
   `android:windowSoftInputMode="adjustResize"`，`index.html` viewport 带
   `interactive-widget=resizes-content`；固定定位的搜索/分享面板在键盘压矮视口后
   仍留在屏内。输入框统一至少 16px，避免 iOS/WebView 聚焦自动放大。
5. **Android 返回键**：`src/hooks/useAndroidBackButton.ts` 只在 Android 原生壳监听
   `backButton`。`AppShell` 的优先级是：搜索弹层 → 侧栏 → 任意 Radix Dialog（发
   Escape）→ 答题卡抽屉 → 练习退出确认 → WebView 历史 → `App.exitApp()`。
6. **文件导入导出**：导入 input 接受 `.xlsx/.csv/.json/.tixing.json` 常见 MIME，
   读取后清空 `value`，同一路径修正后可以重选。导出统一走
   `src/lib/download.ts`：浏览器用 blob + `a[download]`；Android 原生壳动态加载
   `@capacitor/filesystem` 写 `Directory.Cache/exports/`，再调 `@capacitor/share`
   打开系统保存/分享面板，并把失败原因返回给设置页或题库详情页。
7. **PWA**：manifest 的 `orientation` 为 `any`，允许横屏/分屏重排；shortcuts 指向
   `/catalog`、`/review?tab=wrong`、`/records?tab=stats`。

### 本地 AI 讲解（2.0.3）

- 设置页的「本地 AI 讲解」默认关闭。端点只接受回环地址，HTTP 走 `CapacitorHttp`
  原生通道，不经过 WebView 的 CORS/mixed-content。
- `network_security_config.xml` 只为 `127.0.0.1`、`localhost`、`::1` 开
  `cleartextTrafficPermitted`；其他明文请求仍按 Android 默认拒绝。
- APK 不带模型权重。用户需要自己安装本地推理 App 并暴露 OpenAI 兼容端口，或后续
  集成 llama.cpp / MNN 的 AAR；当前没有内置推理 SDK。
- 浏览器/桌面端仍由本机服务的 CORS 决定；应用不会代理，也不会把题目发到公网。

验证分两层：`pnpm test:e2e` 的 37 项浏览器测试（含 11 项手机专项与 3 项本地 AI 专项）覆盖
320/390 视口、44px 热区、答题卡遮罩、交卷框定位、搜索缩视口、模拟刘海、导入
MIME 与手机导出；`pnpm build:apk:release` + `pnpm verify:apk` 负责 Android 编译、
资源和签名。真机上的系统分享面板、硬件返回键、状态栏图标仍需要在目标机型上抽测，
浏览器 E2E 不能替代这一层。

2.2.0 验证记录：

| 检查项 | 结果 |
| --- | --- |
| 全量单测 | 38 文件 / 253 项通过；statements 50.57% / branches 41.06% / functions 41.02% / lines 51.86% |
| Web / PWA E2E | 37 项通过；含填空/简答从文本导入到作答与错题、编辑器保留文本题答案与关键词 |
| APK 资源 E2E | 5 项通过；加载 APK 内 `assets/public`，新增 APK 内导入并作答填空题 |
| Lint / typecheck / Web build | 通过；PWA precache 30 条（1576.76 KiB） |
| Rust | 本机未跑通：缺 GTK/WebKit 开发库链接库（libgdk-3、libsoup-3.0 等）；CI 的 ubuntu 环境会执行 `cargo test` |
| APK | 3,807,151 bytes；SHA-256 `fe26a49fa21007419eda27d5a3b08d758ecfdd1c4b445f507a249ec0cb29f8cc`；versionCode 2002000 |
| AAB | 3,662,626 bytes；SHA-256 `043e1b5acf835c7a3d5fa55008958ffdc1961afea32604285fd4da7e242f7c39`；签名校验通过 |
| 真机 | 无 KVM、无 adb 设备；截图与 E2E 均来自浏览器，不是真机截图 |

2.1.0 验证记录：

| 检查项 | 结果 |
| --- | --- |
| 全量单测 | 38 文件 / 246 项通过；statements 49.98% / branches 41.1% / functions 40.72% / lines 51.33% |
| Web / PWA E2E | 35 项通过；含文本粘贴、Word 文档、背题、错因笔记刷新四条新增用例 |
| APK 资源 E2E | 4 项通过；加载 APK 内 `assets/public`，覆盖启动、IndexedDB 持久化、错题与设置页 |
| Lint / typecheck / Web build | 通过；PWA precache 30 条（1565.04 KiB） |
| Rust | 未重跑；沿用 2.0.3 的环境限制记录（缺少 GTK/WebKit 开发库链接 symlink） |
| APK | 3,803,559 bytes；SHA-256 `add9903d13f3e49445899a660741757e428372798498c0384c71114cba55e0cc`；versionCode 2001000 |
| AAB | 3,659,044 bytes；SHA-256 `41c78d74fb917dd64f3368c293fa8c07b109573b0ff0e30bc05311072621525f`；签名校验通过 |
| 真机 | 无 KVM、无 adb 设备；截图与 E2E 均来自浏览器，不是真机截图 |

2.0.4 验证记录：

| 检查项 | 结果 |
| --- | --- |
| 全量单测 | 36 文件 / 237 项通过；statements 50.04% / branches 40.73% / functions 41.86% / lines 51.13% |
| 题库完整性 | 32 个题库 / 641 道题；每库至少 20 题，同库与跨库规范化题干均无重复，题型不少于两种 |
| Web / PWA E2E | 31 项通过（17 项主链路 + 11 项手机专项 + 3 项本地 AI 专项） |
| APK 资源 E2E | 4 项通过；首页断言“32 个题库 · 641 道题”，并覆盖 IndexedDB 持久化、错题与交卷 |
| Lint / typecheck / Web build | 通过；PWA precache 29 条（1543.44 KiB） |
| Rust | 未重跑；本机缺少 GTK/WebKit 开发库链接 symlink，沿用 2.0.3 的环境限制记录 |
| APK | 3,795,807 bytes；SHA-256 `3e6991340f2f69af3116b8e2292a0f4cac4b18e60c16b42e262277f6356763e4`；versionCode 2000004 |
| AAB | 3,649,201 bytes；SHA-256 `021719a4d131dff2d0b5ce87c0f0b8ac88e0c6b41fbbef3bb6fa577e59562d6d`；签名校验通过 |
| 真机 | 无 KVM、无 adb 设备；截图与 E2E 均来自浏览器，不是真机截图，系统返回键、分享面板与状态栏仍未设备实测 |

2.0.3 验证记录：

| 检查项 | 结果 |
| --- | --- |
| 全量单测 | 36 文件 / 235 项通过；statements 49.87% / branches 40.73% / functions 41.7% / lines 50.95% |
| Web / PWA E2E | 31 项通过（17 项主链路 + 11 项手机专项 + 3 项本地 AI 专项） |
| APK 资源 E2E | 4 项通过（Pixel 5 视口，加载 APK 内 `assets/public`） |
| Lint / typecheck / Web build | 通过；PWA precache 29 条 |
| Rust | 未通过：当前环境缺少 GTK/WebKit 开发库的链接 symlink，`cargo test` 链接阶段失败；这是环境缺库，不是本轮单测断言失败，发布记录不写成 Rust 通过 |
| APK | 3,778,531 bytes；SHA-256 `00c37c86841a212bce176a2c0664943b30633caa155f5dc53832931aef75bd07` |
| AAB | 3,631,935 bytes；SHA-256 `11f9ca3b171b5bf37fa560052f562f4f68bbf1d4ec87c688c66bca05d97a0711` |
| 真机 | 无 KVM、无 adb 设备，未安装到真实手机；本地模型真机回环、系统返回键、分享面板与状态栏图标未做设备实测 |

2.0.2 验证记录：


| 检查项 | 结果 |
| --- | --- |
| 全量单测 | 35 文件 / 218 项通过；statements 50.83% / branches 40.14% / functions 42.24% / lines 51.9% |
| Web / PWA E2E | 28 项通过（17 项主链路 + 11 项手机专项） |
| APK 资源 E2E | 4 项通过（像素 5 视口，加载 APK 内 `assets/public`） |
| Rust | `cargo test` 14 项通过 |
| 依赖审计 | 0 条（运行时 0、仅构建期 0） |
| APK | 3,770,747 bytes；SHA-256 `ac0f7f279841f24578696026ff1f3744cf7234cf6458a3504da9e9c0c570e687` |
| AAB | 3,624,040 bytes；SHA-256 `494ce3d94e2e50cb87bac0b0830efe9eed58a6795b913059ecadd4a32c491f96` |
| 真机 | 无 KVM、无 adb 设备，未安装到真实手机；系统分享面板/返回键/状态栏图标未做设备实测 |

移动截图用 `pnpm capture:mobile` 重新生成到临时目录，源图为 780×1688
（390×844 @2x），再转成 `docs/screenshots/mobile-*.webp`。

> 已知限制：`window.print()` 在 Android WebView 中不保证打开系统打印面板，
> 「打印试卷」目前按桌面浏览器能力设计；手机端可以用题库包/CSV 导出后到桌面打印。

### 数据备份策略

`android/app/src/main/AndroidManifest.xml` 保持 `android:allowBackup="false"`，并用
`android/app/src/main/res/xml/backup_rules.xml` 覆盖旧版备份规则；Android 12+ 通过
`android/app/src/main/res/xml/data_extraction_rules.xml` 对 `cloud-backup` 与
`device-transfer` 均排除 `domain="root"`。题库可通过题库包导出/导入迁移；完整备份
（JSON）才包含错题、成绩和收藏等学习状态。

若后续接后端，需要在 `capacitor.config.ts` 的 `server.allowNavigation` 里放行 API
域名，或改用 `@capacitor/http`。


## 五、iOS（可选，同一套 Capacitor 工程）

```bash
pnpm add @capacitor/ios@8
npx cap add ios
npx cap open ios
```

需要 macOS + Xcode 才能编译，代码与安卓完全共用。

## 六、白标与裸内容构建

面向企业内训、学校、出版方的分发形态。两个维度独立可组合：

| 变体 | 开启方式 | 效果 |
| --- | --- | --- |
| 白标 | `VITE_BRAND_NAME` / `VITE_BRAND_EN` / `VITE_BRAND_MARK` / `VITE_BRAND_ACCENT` / `VITE_BRAND_FOOTER` | 替换产品名、英文名、标志字、主色与页脚文案（见 `src/lib/brand.ts`） |
| 裸内容 | `VITE_BARE_CONTENT=1` | 内置题库在**构建期**被摇掉，产物里不存在任何内置题干 |

```bash
VITE_BARE_CONTENT=1 VITE_BRAND_NAME="某某内训" pnpm build
```

裸内容构建的验证方式不是看界面，而是看产物：`grep 匀速直线运动 dist/assets/*.js`
应无匹配。实测主 bundle 从 450,935 字节降到 395,315 字节（约 −54 KB）。
设置页在裸内容构建下不再展示「显示内置题库」开关，改为说明当前为无内置内容构建。
分类树（领域 / 学段）保留，导入的题库仍需按它归类。

## 七、数据层与后端演进

当前架构是「设备内数据库 + 本地优先」，不是纯静态前端：

- 题库内容：静态 TypeScript 数据（`src/data/`），构建期打包，离线可用。
- 学习数据：设备内数据库，统一经 `src/services/repository.ts` 的 `Repository` 接口读写。

| 运行形态 | 驱动 | 实现 |
| --- | --- | --- |
| 桌面（Tauri 2） | `sqlite` | `src-tauri/src/db.rs`，17 个 `invoke` 命令，表 `banks/questions/favorites/wrong_book/history/daily/papers/settings/meta` |
| Web / PWA | `indexeddb` | `src/services/indexedDbRepository.ts`，对象仓库与 SQLite 表一一对应 |
| Android（Capacitor） | `indexeddb` | 与 Web 同一实现；WebView 内的 IndexedDB 是持久化数据库 |
| 测试 / 极端降级 | `memory` | `src/services/dataLayer.ts`，仅本次会话 |

启动流程：`src/Root.tsx` 先 `hydrate()` 从数据库加载，成功后才渲染路由；失败给出重试出口。
写操作先更新内存让界面立即响应，再异步落库；失败写入 `persistenceError` 并在设置页显示。
旧版浏览器 `localStorage` 数据不再自动迁移；需要旧数据时先用旧版导出完整备份，再到新版恢复。

后续若要接真正的服务端（多端同步、教师端批量导入）：

1. 在 `Repository` 之外加一层同步服务，组件与 store 仍只依赖现有接口。
2. 桌面端已有的 `db_*` 命令可复用为本地缓存；冲突解决放在同步层，不改页面。
3. 服务端接入后 `useAppStore` 无需回退到 persist，内存态与数据库的职责边界已经切开。

## 八、质量门禁

```bash
pnpm check         # 版本 + 类型 + lint + vitest + 构建 + cargo test
pnpm test:e2e      # Playwright：真实 Chromium 驱动关键链路（约 25 秒）
```

`cargo test` 覆盖 `src-tauri/src/db.rs` 的 SQL 与迁移路径；无 cargo 的环境会打印
跳过原因，不会假装通过。E2E 需要 dev server 与浏览器，因此独立成一条命令，
CI 里两步都会执行。

Web、桌面与安卓共用前端质量门禁，但 Web 验证不能替代原生端验证。桌面与安卓还需分别构建并在对应环境检查路由、WebView、系统返回键、状态栏及数据持久化等行为。

### v1.8.0 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Windows 桌面（NSIS） | `TiXing_1.8.0_x64-setup.exe` (2.96 MiB) | **真实 v2→v3 升级**：本机既有 v2 库（1 题库 / 1 题）在安装启动后 `schema_version` 2→3，`bank_snapshots` 表创建成功，题库与题目完整保留 |
| Windows 桌面（MSI） | `TiXing_1.8.0_x64_en-US.msi` (5.04 MiB) | 构建成功，未单独安装验证 |
| Android（debug） | `tixing-1.8.0-debug.apk` (4.4 MB) | `versionCode=1008000`；`verify-apk` 通过；Pixel 5 视口 4 条运行时 E2E 全通过 |

### v1.7.0 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Windows 桌面（NSIS） | `TiXing_1.7.0_x64-setup.exe` (2.94 MiB) | 静默安装注册 `TiXing 1.7.0`；**真实 v1→v2 升级**：预置 v1 库（1 题库 / 1 题 / theme=dark）后启动，`schema_version` 从 1 升到 2，题库与题目完整保留，`image` / `option_images` 列自动补齐并取默认值 |
| Windows 桌面（MSI） | `TiXing_1.7.0_x64_en-US.msi` (5.02 MiB) | 构建成功，未单独安装验证 |
| Android（debug） | `tixing-1.7.0-debug.apk` (4.4 MB) | `versionCode=1007000`；`verify-apk` 通过；Pixel 5 视口 4 条运行时 E2E 全通过 |

### v1.6.0 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Windows 桌面（NSIS） | `TiXing_1.6.0_x64-setup.exe` (2.94 MiB) | 静默安装注册 `TiXing 1.6.0`；安装目录启动建出 9 张表；静默卸载清零 |
| Windows 桌面（MSI） | `TiXing_1.6.0_x64_en-US.msi` (5.01 MiB) | 构建成功，未单独安装验证 |
| Android（debug） | `tixing-1.6.0-debug.apk` (4.4 MB) | `versionCode=1006000`；`verify-apk` 通过；Pixel 5 视口 4 条运行时 E2E 全通过 |

依赖安全：`pnpm check` 内含 `scripts/audit-deps.mjs --strict`，运行时依赖漏洞 0。
仅构建期依赖（vite-plugin-pwa / typescript-eslint 的传递依赖）剩 2 moderate + 1 low，
无可用升级路径，记录在案不影响产物。

### v1.5.0 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Windows 桌面（NSIS） | `TiXing_1.5.0_x64-setup.exe` (3.07 MiB) | 静默安装注册 `TiXing 1.5.0`；安装目录启动建出 9 张表；静默卸载清零 |
| Windows 桌面（MSI） | `TiXing_1.5.0_x64_en-US.msi` (5.13 MiB) | 构建成功，未单独安装验证 |
| Android（debug） | `tixing-1.5.0-debug.apk` (4.6 MB) | `versionCode=1005000`；`verify-apk` 通过；Pixel 5 视口下 4 条运行时 E2E（`pnpm test:e2e:apk`）跑在 APK 真实资源上全部通过 |

Android 运行时验证的原理：宿主无硬件虚拟化，模拟器不可用；改为解包 APK 内
`assets/public/` 的真实产物，由本地 HTTP 服务按原生壳同样的方式（hash 路由）
供出，Playwright 以 Pixel 5 视口驱动 Chromium 完成导入 → 持久化 → 答题 →
错题本全链路。验证对象是 APK 本身，不是 dist/。

### v1.4.0 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Windows 桌面（NSIS） | `TiXing_1.4.0_x64-setup.exe` (2.94 MiB) | 静默安装后注册表出现 `TiXing 1.4.0`；从安装目录启动建出 9 张表；静默卸载后安装目录与注册表项清零，用户数据目录保留 |
| Windows 桌面（MSI） | `TiXing_1.4.0_x64_en-US.msi` (5.00 MiB) | 构建成功，未单独安装验证 |
| Android（debug） | `tixing-1.4.0-debug.apk` (4.4 MB) | `versionName=1.4.0`、`versionCode=1004000`；`verify-apk.mjs` 通过（453 条目、4 个引用资源全部存在、无 `sw.js`）；解包后由 WebView 加载真实资源，hash 路由与 IndexedDB 均正常 |

APK 资源完整性检查已成为构建步骤：`pnpm build:apk` 会在 Gradle 编译后自动跑
`scripts/verify-apk.mjs`，缺少 JS/CSS 或混入 PWA 产物都会直接失败。

### v2.0.1 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Android（release APK） | `tixing-2.0.1-release.apk` (3,665,720 bytes) | Linux + JDK 21 + Android SDK 36 实际编译；`aapt dump badging` 包名 `com.tixing.offline.ai`、`versionName=2.0.1`、`versionCode=2000001`；`verify-apk` 通过（459 条目、4 个引用资源、14 个 JS、1 个 CSS）；`apksigner` 通过，证书 DN `CN=TiXing`，SHA-256 `98e19402…999e`；SHA-256 `a5ecd23b…a810` |
| Android（release AAB） | `tixing-2.0.1-release.aab` (3,519,637 bytes) | `bundleRelease` + `jarsigner -verify` 通过；证书 DN 与 APK 一致；SHA-256 `586e1400…34bf` |
| Web / 桌面测试 | `dist/`、`src-tauri/` | `pnpm check` 通过：版本五项、typecheck、lint、34 个测试文件 / 216 项、Web build、`cargo test` 14 项、依赖审计 0 条；`pnpm test:e2e` 17 项通过 |
| 内置题库 | `src/data/questions/` | 32 个题库全部有题，共 641 道；`quiz.test.ts` 校验每库至少 20 题、总数至少 640 道，并检查同库题干不重复 |

本轮只改题库与界面统计，不改题库包格式、数据库 schema 和包名。2.0.0 用户可覆盖升级。

### v2.0.0 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Android（release APK） | `tixing-2.0.0-release.apk` (3.5 MB) | Linux + JDK 21 + Android SDK 36 实际编译；`aapt dump badging` 包名 `com.tixing.offline.ai`、`versionName=2.0.0`、`versionCode=2000000`；`verify-apk` 通过（459 条目、4 个引用资源、14 个 JS、1 个 CSS）；`apksigner` 通过，证书 DN `CN=TiXing`，SHA-256 `98e19402…999e` |
| Android（release AAB） | `tixing-2.0.0-release.aab` (3.4 MB) | `bundleRelease` + `jarsigner -verify` 通过；`keytool -printcert` 的 DN 与指纹和 APK 一致 |
| Web / 桌面测试 | `dist/`、`src-tauri/` | `pnpm test` 34 个文件、216 项；`pnpm test:e2e` 17 项；`cargo test` 14 项；typecheck、lint、Web build 通过；本机未打 Tauri 安装包 |

本轮 APK/AAB 使用重新生成的 release 证书，旧证书和 1.9.1 产物已移到仓库外的 `backups/`。

### v1.9.1 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Android（release APK） | `tixing-1.9.1-release.apk` (3.5 MB) | Linux + JDK 21.0.9 + Android SDK 36 实际编译；`versionName=1.9.1`、`versionCode=1009001`；`verify-apk` 通过（459 条目、4 个引用资源、14 个 JS、1 个 CSS）；`apksigner verify --print-certs` 通过，证书 SHA-256 `faf20b56…1ef5` |
| Android（release AAB） | `tixing-1.9.1-release.aab` (3.3 MB) | `bundleRelease` + `jarsigner -verify` 通过；用于 Google Play / 支持 AAB 的商店 |
| 桌面（Tauri） | 未打包 | 本机安装 webkit2gtk 后 `cargo check`、`cargo test`（14 项，含局域网 HTTP 文件服务）与 `tauri build --no-bundle` 通过；未在本机打 AppImage/deb 包 |

未做 Android 真机/模拟器运行时安装验证：宿主没有硬件虚拟化，也没有连接真机。APK 的 Web 资源已由 `verify-apk` 校验，签名已由 `apksigner` 校验；运行时长链路仍以主 E2E 的 Android 资源加载场景为准。

### v1.9.0 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Android（debug） | `tixing-1.9.0-debug.apk` (4.4 MB) | Linux + JDK 21.0.9 + Android SDK 36 实际编译成功；`versionName=1.9.0`、`versionCode=1009000`；`verify-apk` 通过（462 条目、4 个引用资源、14 个 JS、1 个 CSS，无 PWA 残留）。未在模拟器跑运行时 E2E |

### v1.3.1 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Windows 桌面（NSIS） | `TiXing_1.3.1_x64-setup.exe` (2.93 MiB) | 构建成功；二进制内含 `db_load` / `db_rebuild` 命令与 `schema_version` 标记 |
| Windows 桌面（MSI） | `TiXing_1.3.1_x64_en-US.msi` (5.01 MiB) | 构建成功，未单独安装验证 |
| Android（debug） | `tixing-1.3.1-debug.apk` (4.4 MB) | `package=com.tixing.offline.ai`、`versionName=1.3.1`、`versionCode=1003001`；APK 内 `assets/public` 含 12 个条目，无 `sw.js` |

桌面端实测（1.3.1 构建，真实进程 + 真实数据库文件）：

| 场景 | 结果 |
| --- | --- |
| 全新启动 | 生成 `tixing.db`，9 张表齐备，`meta.schema_version=1` |
| 写入与跨进程保留 | 切换深色主题后 `settings.theme=dark`，结束进程重启仍为 `dark` |
| 数据库文件损坏 | 进程不再闪退，窗口正常创建并显示「无法打开本地数据库 / 数据库文件无法读取（可能已损坏）」 |
| 损坏后恢复 | 点「重建空库」→ 原文件改名为 `tixing.broken-<时间戳>.db` 保留（内容原样），新库建出 9 张表，界面恢复正常 |

### v1.3.0 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Windows 桌面（NSIS） | `TiXing_1.3.0_x64-setup.exe` (2.93 MiB) | 构建成功；`tixing-desktop.exe` 内含 `db_load` / `db_replace_all` 命令与 `schema_version` 标记，证明数据层已打进二进制 |
| Windows 桌面（MSI） | `TiXing_1.3.0_x64_en-US.msi` (4.99 MiB) | 构建成功，未单独安装验证 |
| Android（debug） | `tixing-1.3.0-debug.apk` (4.4 MB) | `package=com.tixing.offline.ai`、`versionName=1.3.0`、`versionCode=1003000`；APK 内 `assets/public` 含 12 个条目，无 `sw.js`（native 模式已关闭 PWA） |

桌面端数据层实测（1.3.0 构建）：启动后生成
`%APPDATA%\com.tixing.offline.ai\tixing.db`；切换深色主题后 `settings.theme=dark`
落库；结束进程重启仍为深色；顺序练习答错一题后 `wrong_book` 记录
`gaokao-physics-1 | wrong_count=1`；交卷后 `history` 与 `daily` 各新增一行。

### v1.2.0 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Windows 桌面（NSIS） | `TiXing_1.2.0_x64-setup.exe` (2.16 MB) | 安装包 `ProductName=TiXing`、`FileVersion=1.2.0`；`tixing-desktop.exe` 实际启动，窗口标题「题小星 · TiXing」，首页完整渲染 |
| Windows 桌面（MSI） | `TiXing_1.2.0_x64_en-US.msi` (3.12 MB) | 构建成功，未单独安装验证 |
| Android（debug） | `tixing-1.2.0-debug.apk` (4.35 MB) | `package=com.tixing.offline.ai`、`versionName=1.2.0`、`versionCode=1002000`、`application-label=题小星`；APK 内 `assets/public` 含 12 个条目（index.html、全部 JS/CSS、图标），bundle 内含 `1.2.0` 与备份功能标记 |

Android 模拟器在本宿主不可用（嵌套虚拟化无 VT-x），因此未做真机/模拟器内运行验证；
改为解包 APK 校验资源完整性与元数据。
