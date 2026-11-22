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
  "identifier": "com.tiyu.questionbank",
  "build": {
    "beforeBuildCommand": "pnpm build:native",
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "题匣 · QuizChest",
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
scripts/build-desktop.cmd --no-bundle  # 仅编译 tiyu-desktop.exe
scripts/build-desktop.cmd              # 产出 NSIS/MSI 安装包
```

Windows 推荐在 Git Bash 中执行 `scripts/build-desktop.cmd`：脚本会自动查找 Visual Studio C++ Build Tools，注入正确的 MSVC 链接器，再调用本地 Tauri CLI，避免 Git Bash 自带 `link.exe` 抢占。

产物位置：`src-tauri/target/release/bundle/nsis/QuizChest_<version>_x64-setup.exe`
与 `bundle/msi/QuizChest_<version>_x64_en-US.msi`（MSI 需要 WiX 下载）。
二进制位于 `src-tauri/target/release/tiyu-desktop.exe`（crate 名保留历史命名，
用户可见名称由 `tauri.conf.json` 的 `productName` 决定）。

桌面端注意事项：

1. 原生壳构建时执行 `pnpm build:native`（Vite 的 `native` 模式，见 `src/App.tsx`），改用 `HashRouter` 并关闭 PWA，避免本地静态服务器缺少 SPA 回退导致深层路由 404。Web 部署保持默认的 `BrowserRouter`。
2. 本地数据存于设备上的 SQLite 数据库文件（`src-tauri/src/db.rs`，Rust `rusqlite` + bundled SQLite），路径为系统应用数据目录下的 `com.tiyu.questionbank/quizchest.db`。卸载是否保留该目录由系统与用户决定，长期留档仍应使用设置页的完整备份。
3. 想加系统托盘、开机启动、自动更新，均在 `src-tauri` 内配置，不影响前端代码。

## 四、Android（Capacitor 8）

前置（本机已按此路径安装）：

| 组件 | 路径 | 版本 |
| --- | --- | --- |
| Android SDK | `C:\Dev\android-sdk` | cmdline-tools 12.0 / platform 35 + 36 / build-tools 35.0.0 |
| JDK | `C:\Dev\jdk-21` | OpenJDK 21.0.2 |
| Gradle | `C:\Dev\gradle-8.14.3\gradle-8.14.3` | 8.14.3（镜像下载） |
| Gradle 用户目录 | `C:\Dev\gradle-home` | 含阿里云镜像 init 脚本 |

构建命令（本机实测通过）：

```bash
export ANDROID_HOME='C:\Dev\android-sdk'
export JAVA_HOME='C:\Dev\jdk-21'
export GRADLE_USER_HOME='C:\Dev\gradle-home'
pnpm build:native
npx cap sync android
cd android && "C:/Dev/gradle-8.14.3/gradle-8.14.3/bin/gradle" assembleDebug --no-daemon
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`（约 4.4 MB），已复制到
`artifacts/quizchest-<version>-debug.apk`（当前为 `quizchest-1.8.0-debug.apk`）。

`app/build.gradle` 中的 `versionName` / `versionCode` 由 `scripts/sync-version.mjs`
统一维护，`versionCode` 按 `major*1_000_000 + minor*1_000 + patch` 推导，
不要手工修改。完整发布流程见 [RELEASING.md](RELEASING.md)。

> 注意：`gradle/wrapper/gradle-wrapper.properties` 默认指向 services.gradle.org，本机网络不可达；因此实际构建使用本地 Gradle 8.14.3，并设置 `GRADLE_USER_HOME` 到短路径（避免 Windows 长路径与 JVM 内存问题）。`org.gradle.jvmargs` 控制在 1024m，否则 16 GB 内存机器上 daemon 会 OOM。

```bash
pnpm add @capacitor/core@8 @capacitor/android@8
pnpm add -D @capacitor/cli@8
npx cap init "题匣" "com.tiyu.questionbank" --web-dir dist
pnpm build:native
npx cap add android
npx cap sync android
npx cap open android
```

`capacitor.config.ts`：

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tiyu.questionbank',
  appName: '题匣',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#f4f0e7',
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

移动端注意事项：

1. 顶部状态栏与底部手势区：已在 `src/styles/layout.css`、`practice.css` 使用 `env(safe-area-inset-bottom)` 预留安全区。
2. Android 返回键默认会退出应用。需要「返回上一页」时安装 `@capacitor/app`，监听 `backButton` 事件并调用 `history.back()`。
3. Android 应用在 `android/app/src/main/AndroidManifest.xml` 保持 `android:allowBackup="false"`，并用 `android/app/src/main/res/xml/backup_rules.xml` 覆盖旧版备份规则；Android 12+ 通过 `android/app/src/main/res/xml/data_extraction_rules.xml` 对 `cloud-backup` 与 `device-transfer` 均排除 `domain="root"`。题库可通过题库包导出/导入迁移；该题库包不包含错题、成绩和收藏等学习状态。
4. 若后续接后端，需要在 `capacitor.config.ts` 的 `server.allowNavigation` 里放行 API 域名，或改用 `@capacitor/http`。
5. 状态栏配色可用 `@capacitor/status-bar` 跟随主题切换。

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
| 裸内容 | `VITE_BARE_CONTENT=1` | 内置示例题库在**构建期**被摇掉，产物里不存在任何示例题干 |

```bash
VITE_BARE_CONTENT=1 VITE_BRAND_NAME="某某内训" pnpm build
```

裸内容构建的验证方式不是看界面，而是看产物：`grep 匀速直线运动 dist/assets/*.js`
应无匹配。实测主 bundle 从 450,935 字节降到 395,315 字节（约 −54 KB）。
设置页在裸内容构建下不再展示「显示示例题库」开关，改为说明当前为无内置内容构建。
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
旧版 `localStorage`（`tiyu-store-v1`）在数据库为空时自动迁移并删除旧键。

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
| Windows 桌面（NSIS） | `QuizChest_1.8.0_x64-setup.exe` (2.96 MiB) | **真实 v2→v3 升级**：本机既有 v2 库（1 题库 / 1 题）在安装启动后 `schema_version` 2→3，`bank_snapshots` 表创建成功，题库与题目完整保留 |
| Windows 桌面（MSI） | `QuizChest_1.8.0_x64_en-US.msi` (5.04 MiB) | 构建成功，未单独安装验证 |
| Android（debug） | `quizchest-1.8.0-debug.apk` (4.4 MB) | `versionCode=1008000`；`verify-apk` 通过；Pixel 5 视口 4 条运行时 E2E 全通过 |

### v1.7.0 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Windows 桌面（NSIS） | `QuizChest_1.7.0_x64-setup.exe` (2.94 MiB) | 静默安装注册 `QuizChest 1.7.0`；**真实 v1→v2 升级**：预置 v1 库（1 题库 / 1 题 / theme=dark）后启动，`schema_version` 从 1 升到 2，题库与题目完整保留，`image` / `option_images` 列自动补齐并取默认值 |
| Windows 桌面（MSI） | `QuizChest_1.7.0_x64_en-US.msi` (5.02 MiB) | 构建成功，未单独安装验证 |
| Android（debug） | `quizchest-1.7.0-debug.apk` (4.4 MB) | `versionCode=1007000`；`verify-apk` 通过；Pixel 5 视口 4 条运行时 E2E 全通过 |

### v1.6.0 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Windows 桌面（NSIS） | `QuizChest_1.6.0_x64-setup.exe` (2.94 MiB) | 静默安装注册 `QuizChest 1.6.0`；安装目录启动建出 9 张表；静默卸载清零 |
| Windows 桌面（MSI） | `QuizChest_1.6.0_x64_en-US.msi` (5.01 MiB) | 构建成功，未单独安装验证 |
| Android（debug） | `quizchest-1.6.0-debug.apk` (4.4 MB) | `versionCode=1006000`；`verify-apk` 通过；Pixel 5 视口 4 条运行时 E2E 全通过 |

依赖安全：`pnpm check` 内含 `scripts/audit-deps.mjs --strict`，运行时依赖漏洞 0。
仅构建期依赖（vite-plugin-pwa / typescript-eslint 的传递依赖）剩 2 moderate + 1 low，
无可用升级路径，记录在案不影响产物。

### v1.5.0 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Windows 桌面（NSIS） | `QuizChest_1.5.0_x64-setup.exe` (3.07 MiB) | 静默安装注册 `QuizChest 1.5.0`；安装目录启动建出 9 张表；静默卸载清零 |
| Windows 桌面（MSI） | `QuizChest_1.5.0_x64_en-US.msi` (5.13 MiB) | 构建成功，未单独安装验证 |
| Android（debug） | `quizchest-1.5.0-debug.apk` (4.6 MB) | `versionCode=1005000`；`verify-apk` 通过；Pixel 5 视口下 4 条运行时 E2E（`pnpm test:e2e:apk`）跑在 APK 真实资源上全部通过 |

Android 运行时验证的原理：宿主无硬件虚拟化，模拟器不可用；改为解包 APK 内
`assets/public/` 的真实产物，由本地 HTTP 服务按原生壳同样的方式（hash 路由）
供出，Playwright 以 Pixel 5 视口驱动 Chromium 完成导入 → 持久化 → 答题 →
错题本全链路。验证对象是 APK 本身，不是 dist/。

### v1.4.0 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Windows 桌面（NSIS） | `QuizChest_1.4.0_x64-setup.exe` (2.94 MiB) | 静默安装后注册表出现 `QuizChest 1.4.0`；从安装目录启动建出 9 张表；静默卸载后安装目录与注册表项清零，用户数据目录保留 |
| Windows 桌面（MSI） | `QuizChest_1.4.0_x64_en-US.msi` (5.00 MiB) | 构建成功，未单独安装验证 |
| Android（debug） | `quizchest-1.4.0-debug.apk` (4.4 MB) | `versionName=1.4.0`、`versionCode=1004000`；`verify-apk.mjs` 通过（453 条目、4 个引用资源全部存在、无 `sw.js`）；解包后由 WebView 加载真实资源，hash 路由与 IndexedDB 均正常 |

APK 资源完整性检查已成为构建步骤：`pnpm build:apk` 会在同步后自动跑
`scripts/verify-apk.mjs`，缺少 JS/CSS 或混入 PWA 产物都会直接失败。

### v1.3.1 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Windows 桌面（NSIS） | `QuizChest_1.3.1_x64-setup.exe` (2.93 MiB) | 构建成功；二进制内含 `db_load` / `db_rebuild` 命令与 `schema_version` 标记 |
| Windows 桌面（MSI） | `QuizChest_1.3.1_x64_en-US.msi` (5.01 MiB) | 构建成功，未单独安装验证 |
| Android（debug） | `quizchest-1.3.1-debug.apk` (4.4 MB) | `package=com.tiyu.questionbank`、`versionName=1.3.1`、`versionCode=1003001`；APK 内 `assets/public` 含 12 个条目，无 `sw.js` |

桌面端实测（1.3.1 构建，真实进程 + 真实数据库文件）：

| 场景 | 结果 |
| --- | --- |
| 全新启动 | 生成 `quizchest.db`，9 张表齐备，`meta.schema_version=1` |
| 写入与跨进程保留 | 切换深色主题后 `settings.theme=dark`，结束进程重启仍为 `dark` |
| 数据库文件损坏 | 进程不再闪退，窗口正常创建并显示「无法打开本地数据库 / 数据库文件无法读取（可能已损坏）」 |
| 损坏后恢复 | 点「重建空库」→ 原文件改名为 `quizchest.broken-<时间戳>.db` 保留（内容原样），新库建出 9 张表，界面恢复正常 |

### v1.3.0 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Windows 桌面（NSIS） | `QuizChest_1.3.0_x64-setup.exe` (2.93 MiB) | 构建成功；`tiyu-desktop.exe` 内含 `db_load` / `db_replace_all` 命令与 `schema_version` 标记，证明数据层已打进二进制 |
| Windows 桌面（MSI） | `QuizChest_1.3.0_x64_en-US.msi` (4.99 MiB) | 构建成功，未单独安装验证 |
| Android（debug） | `quizchest-1.3.0-debug.apk` (4.4 MB) | `package=com.tiyu.questionbank`、`versionName=1.3.0`、`versionCode=1003000`；APK 内 `assets/public` 含 12 个条目，无 `sw.js`（native 模式已关闭 PWA） |

桌面端数据层实测（1.3.0 构建）：启动后生成
`%APPDATA%\com.tiyu.questionbank\quizchest.db`；切换深色主题后 `settings.theme=dark`
落库；结束进程重启仍为深色；顺序练习答错一题后 `wrong_book` 记录
`gaokao-physics-1 | wrong_count=1`；交卷后 `history` 与 `daily` 各新增一行。

### v1.2.0 验证记录

| 端 | 产物 | 已核验 |
| --- | --- | --- |
| Windows 桌面（NSIS） | `QuizChest_1.2.0_x64-setup.exe` (2.16 MB) | 安装包 `ProductName=QuizChest`、`FileVersion=1.2.0`；`tiyu-desktop.exe` 实际启动，窗口标题「题匣 · QuizChest」，首页完整渲染 |
| Windows 桌面（MSI） | `QuizChest_1.2.0_x64_en-US.msi` (3.12 MB) | 构建成功，未单独安装验证 |
| Android（debug） | `quizchest-1.2.0-debug.apk` (4.35 MB) | `package=com.tiyu.questionbank`、`versionName=1.2.0`、`versionCode=1002000`、`application-label=题匣`；APK 内 `assets/public` 含 12 个条目（index.html、全部 JS/CSS、图标），bundle 内含 `1.2.0` 与备份功能标记 |

Android 模拟器在本宿主不可用（嵌套虚拟化无 VT-x），因此未做真机/模拟器内运行验证；
改为解包 APK 校验资源完整性与元数据。
