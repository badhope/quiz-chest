# 发布流程

本项目的版本管理目标是：**版本号只有一个来源，任何构建产物都能追溯到同一份
版本与同一棵提交树**。以下流程刻意保持精简，可完全在本地完成。

## 一、版本号唯一来源

`package.json` 的 `version` 是唯一真源。以下文件由脚本同步，禁止手工修改：

| 文件 | 字段 | 用途 |
| --- | --- | --- |
| `src-tauri/tauri.conf.json` | `version` | Tauri 安装包版本 |
| `src-tauri/Cargo.toml` | `version` | Rust crate 版本 |
| `android/app/build.gradle` | `versionName` / `versionCode` | Android 版本 |

`versionCode` 由 SemVer 确定性推导，不需要人工维护：

```
versionCode = major * 1_000_000 + minor * 1_000 + patch
```

因此 `1.2.3 → 1002003`，单调递增且永不复用。预发布版本（`1.2.3-rc.1`）
与对应正式版共享同一个 `versionCode`，仅 `versionName` 不同。

前端运行时通过 Vite `define` 注入 `__APP_VERSION__`，读取入口为
`src/lib/version.ts`，设置页展示的版本号即来源于此。

## 二、日常校验

```bash
node scripts/sync-version.mjs check
```

该检查已接入 `pnpm check`，作为门禁第一步。版本不一致会直接阻断构建。

## 三、发版步骤

```bash
# 1. 确认工作树干净、门禁全绿
git status --short
pnpm check

# 2. 升版本（选择语义正确的档位）
node scripts/sync-version.mjs set 1.1.0

# 3. 更新 CHANGELOG.md，把 Unreleased 内容移到新版本号下

# 4. 提交并打标签
git add -A
git commit -m "chore: release v1.1.0"
git tag -a v1.1.0 -m "v1.1.0"

# 5. 推送到唯一远程（项目只保留 GitHub；其他平台镜像已下线）
git push origin main --tags
```

## 三·五、构建产物

- **Web / PWA**：`pnpm build`，产物在 `dist/`；CI 还会额外跑 `pnpm build:native`，
  确认原生壳的 native mode 与 hash 路由资产能正常产出。
- **桌面**：`pnpm desktop:build`；Tauri `bundle.targets` 为 `all`，在哪个系统构建就产出该系统可用的安装包（Windows nsis/msi、macOS app/dmg、Linux deb/AppImage）。
- **Android**：`pnpm build:apk` 生成 debug APK 供验收。需要 JDK 21（Capacitor 8 的 Java 源码按 21 编译，JDK 17 会报 `invalid source release: 21`）与含 `platforms/android-36` 的 Android SDK；脚本会自动寻找常见安装目录，也可用 `JAVA_HOME` / `ANDROID_HOME` 指定。Release APK 需要先在 `android/keystore.properties` 填签名信息（模板见 `android/keystore.properties.example`）；该文件与 `*.jks` 已被 `.gitignore` 排除，禁止提交。

## 四、版本号档位约定

| 变更类型 | 档位 | 例子 |
| --- | --- | --- |
| 破坏性变更：导入包格式不兼容、存储结构需迁移 | major | 2.0.0 |
| 新功能：新增策略、新增导出格式、新页面 | minor | 1.1.0 |
| 修复：缺陷修正、文案与样式调整 | patch | 1.0.1 |

题库包格式（`tixing-bank`）与数据库 schema（桌面端 `tixing.db` 的 `meta.schema_version`，
Web 端 IndexedDB 的 `tixing` 库版本）都有独立版本号，它们的破坏性变更同样要求应用升 major。

## 五、不可变标识

以下标识属于**安装身份契约**，改名会导致老用户无法升级，任何时候都不得变更：

- Android `applicationId` / `namespace`：`com.tixing.offline.ai`
- Tauri `identifier`：`com.tixing.offline.ai`
- 数据库文件名：`tixing.db`（位于应用数据目录下，由 `identifier` 决定所在目录）
- Web 端 IndexedDB 库名：`tixing`
- 旧版迁移键：`tixing-store-v1`（仅用于一次性迁移旧数据，不再写入）
- 题库包标识：`format: "tixing-bank"`、扩展名 `.tixing.json`

品牌名（`题小星` / `TiXing`）属于展示层，可以自由调整；上面这些标识不属于展示层。
