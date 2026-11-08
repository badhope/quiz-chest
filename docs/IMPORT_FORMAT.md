# 题库导入格式

题匣支持把自有题目导入为本地题库：数据只保存在本机的设备数据库（桌面端为 SQLite，Web 端为 IndexedDB），不上传、不注册。导入入口：侧边栏「我的题库」→「导入题库」，或直接访问 `/import`。

## 两种格式

| 格式 | 扩展名 | 适合 |
| --- | --- | --- |
| JSON | `.json` | 选项多于 4 个、需要带题库元数据、程序化导出 |
| CSV | `.csv` | 从 Excel / WPS / Google Sheets 导出，UTF-8 编码 |

单次最多 **2000 题**；题干重复的行会被跳过并提示。

## JSON 格式

顶层是一个对象：

```json
{
  "title": "前端面试冲刺",
  "subtitle": "跳槽复习",
  "description": "按面试真题整理",
  "exam": "前端面试",
  "level": "进阶",
  "durationMin": 30,
  "tags": ["JavaScript", "面试"],
  "questions": [
    {
      "type": "single",
      "stem": "typeof null 的结果是？",
      "options": ["\"null\"", "\"object\"", "\"undefined\"", "\"boolean\""],
      "answer": ["B"],
      "explanation": "typeof null 返回 object，判断 null 应使用 x === null。",
      "difficulty": 2,
      "tags": ["类型"]
    },
    {
      "type": "multiple",
      "stem": "下列哪些声明会创建块级作用域？",
      "options": ["var", "let", "const", "function"],
      "answer": "BC",
      "explanation": "let 与 const 是块级作用域，var 是函数作用域。",
      "difficulty": 1,
      "tags": ["作用域"]
    },
    {
      "type": "judge",
      "stem": "0.1 + 0.2 === 0.3 成立。",
      "options": ["正确", "错误"],
      "answer": "B",
      "explanation": "IEEE 754 浮点数存在精度误差，结果为 false。",
      "difficulty": 2,
      "tags": ["浮点数"]
    }
  ]
}
```

题目也接受简写：`options` 直接给数组（等价于 `optionA…optionF`），`answer` 给字母字符串或下标数组均可。

## CSV 格式

UTF-8 编码，首行表头，含逗号或换行的单元格用双引号包裹：

```csv
stem,optionA,optionB,optionC,optionD,answer,explanation,type,difficulty,tags
typeof null 的结果是？,"null","object","undefined","boolean",B,typeof null 返回 object,single,2,类型
下列哪些声明会创建块级作用域？,var,let,const,function,BC,"let 与 const 是块级作用域",multiple,1,作用域
0.1 + 0.2 === 0.3 成立。,正确,错误,,,B,浮点精度误差导致结果为 false,judge,2,浮点数
```

CSV 可以带一个可选的 `title` 列来命名题库；该列取第一行的非空值作为整份 CSV 的题库名。
若省略，则题库名落为「未命名题库」。

只有 5 列是必需的：`stem`、`optionA`、`optionB`、`answer`、`explanation`。
其余列缺省时使用默认值，因此最简 CSV 可以短到这样：

```csv
stem,optionA,optionB,answer,explanation
1+1 等于几,1,2,B,基础加法运算
```

`answer` 列支持多种常见写法，都会解析为同一组选项下标：

| 写法 | 解析结果 |
| --- | --- |
| `B` | `[1]` |
| `BC` | `[1, 2]` |
| `B;D` / `B,D` / `B、D` / `B/D` | `[1, 3]` |
| `1,3`（1 起始下标） | `[0, 2]` |

## 字段说明

### 题库元数据（仅 JSON，均可省略）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `title` | string | 未命名题库 | 题库名，同时决定题库 ID |
| `subtitle` | string | 导入题库 | 一句话简介 |
| `description` | string | — | 题库详情页描述 |
| `exam` | string | 同 title | 考试/用途标签 |
| `level` | `入门` / `进阶` / `挑战` | 入门 | 难度档位 |
| `durationMin` | number | 10 | 模拟考试限时（分钟），1-300 |
| `tags` | string[] | — | 考点标签 |
| `accent` | `#RRGGBB` | 自动分配 | 主题色 |
| `icon` | string | book | 图标键（见 taxonomy） |

### 题目字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `stem` | 是 | 题干，重复题干跳过 |
| `options` / `optionA`…`optionF` | 是 | 至少 2 个选项；JSON 可用 `options` 数组，CSV 用列 |
| `answer` | 是 | 字母（`B` 或 `BC`）或下标数组（`[1]`、`[1,2]`） |
| `explanation` | 是 | 解析，至少 4 个字符 |
| `type` | 否 | `single`（默认）/ `multiple` / `judge` |
| `difficulty` | 否 | 1/2/3，默认 2 |
| `tags` | 否 | 分号或竖线分隔（CSV），JSON 用数组 |

### 校验规则（逐行报错，不整批拒绝）

- `single` / `judge` 只允许一个答案；`judge` 必须恰好 2 个选项。
- `multiple` 允许 2-6 个答案字母。
- 答案字母超出选项范围会报「答案 X 超出选项范围」。
- 缺题干、缺答案、选项不足 2 个、解析过短都会定位到行号。
- 通过校验的行正常导入，问题行在预览页逐条列出，可返回修改或确认导入。

## 数据存储与删除

- 导入的题库存放在设备数据库：桌面端写入 `banks` / `questions` 表，Web 端写入 IndexedDB 的同名对象仓库。
- 旧版本的 `localStorage` 数据（键 `tiyu-store-v1`）会在首次启动时自动迁移进数据库并清理旧键。
- 删除题库：「我的题库」→ 题库卡「删除」。学习记录不随之删除，但题目引用会失效。
- 「设置 → 显示示例题库」可隐藏内置示例内容，只显示你自己的题库。

## 题匣题库包（tiyu-bank）

当前包版本为 **v2**。旧版 v1 包可直接导入，应用会在预览时自动迁移并提示版本升级；高于当前版本的包会被拒绝，防止字段静默丢失。

从「我的题库」导出的文件使用 `.tiyu.json` 扩展名，包顶层包含：

```json
{
  "format": "tiyu-bank",
  "version": 2,
  "exportedAt": "2026-10-31T00:00:00.000Z",
  "bank": { "title": "我的题库", "questions": [] }
}
```

当前支持 `version: 1` 和 `version: 2`：

- v1 导入时自动补齐 v2 默认字段，并在预览页显示升级提示。
- 高于当前版本的包会拒绝导入，避免静默丢字段。
- 普通 JSON 导入与 `tiyu-bank` 包导入走不同校验路径。

## 白标配置

白标部署不需要修改源码。支持编译期环境变量和运行时全局配置；运行时配置优先级更高。

| 配置 | 环境变量 | 默认 |
| --- | --- | --- |
| 产品名 | `VITE_BRAND_NAME` | 题匣 |
| 英文副标题 | `VITE_BRAND_EN` | QuizChest |
| Logo 字符 | `VITE_BRAND_MARK` | 题 |
| 主色 | `VITE_BRAND_ACCENT` | `#a8442a` |
| 浅色背景 | `VITE_BRAND_ACCENT_SOFT` | `#f3e3dc` |
| 页脚文案 | `VITE_BRAND_FOOTER` | 导入自有题库 · 离线练习 · 数据留在本机 |

运行时注入示例：

```html
<script>
  window.__TIYU_BRAND__ = {
    productName: '教研通',
    productEn: 'JIAOYAN',
    logoMark: '研',
    accent: '#1F7A5C',
    accentSoft: '#DFF0E8',
    footerNote: '内部培训专用'
  }
</script>
```
