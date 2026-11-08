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

# 5. 推送到所有远程
git push gitee-badhope main --tags
git push gitcode-badhope main --tags
```

## 四、版本号档位约定

| 变更类型 | 档位 | 例子 |
| --- | --- | --- |
| 破坏性变更：导入包格式不兼容、存储结构需迁移 | major | 2.0.0 |
| 新功能：新增策略、新增导出格式、新页面 | minor | 1.1.0 |
| 修复：缺陷修正、文案与样式调整 | patch | 1.0.1 |

题库包格式（`tiyu-bank`）与数据库 schema（桌面端 `quizchest.db` 的 `meta.schema_version`，
Web 端 IndexedDB 的 `quizchest` 库版本）都有独立版本号，它们的破坏性变更同样要求应用升 major。

## 五、不可变标识

以下标识属于**安装身份契约**，改名会导致老用户无法升级，任何时候都不得变更：

- Android `applicationId` / `namespace`：`com.tiyu.questionbank`
- Tauri `identifier`：`com.tiyu.questionbank`
- 数据库文件名：`quizchest.db`（位于应用数据目录下，由 `identifier` 决定所在目录）
- Web 端 IndexedDB 库名：`quizchest`
- 旧版迁移键：`tiyu-store-v1`（仅用于一次性迁移旧数据，不再写入）
- 题库包标识：`format: "tiyu-bank"`、扩展名 `.tiyu.json`

品牌名（`题匣` / `QuizChest`）属于展示层，可以自由调整；上面这些标识不属于展示层。
