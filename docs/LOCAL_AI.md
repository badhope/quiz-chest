# 本地 AI 接入边界

题小星当前**没有内置大模型**。首页的「小星建议」是 `src/lib/coach.ts` 里的本地规则引擎，不联网，也不需要模型文件。

这份文档只写“如果以后接本地模型，应该怎么接”，不是已经完成的功能清单。

## 为什么先不塞模型

- APK 里塞一个几 GB 的 GGUF/ONNX 模型，安装包和首次启动都会失控。
- Android 各厂商对后台进程、内存和存储的限制不一样，模型加载失败会让整个练习流程不可用。
- 判分、错题归档、FSRS 调度必须可复现；把这三件事交给模型，出错后很难解释。

所以顺序是：先把离线题库和学情引擎做稳，再把模型当成可选的解析增强。

## 建议的接入形态

```
题目 + 学生答案
      │
      ▼
LocalTutorProvider（接口）
      ├─ DisabledProvider    默认，返回题库自带解析
      ├─ LoopbackProvider    http://127.0.0.1:<port>/v1/chat/completions
      └─ DeviceProvider      以后接 Android 端推理 SDK
```

约束：

1. **只允许 loopback。** endpoint 只接受 `127.0.0.1` 或 `localhost`，不要允许用户填公网地址；否则“离线”就成了摆设。
2. **用户显式开启。** 默认关闭；设置页要写清楚“题目会发给本机模型进程”，不能偷偷发。
3. **超时和降级。** 请求超时 8 秒，失败直接回到题库自带解析，不要卡住答题页。
4. **不传整库。** 只传当前题目、选项、正确答案、已有解析和用户选择；不要传历史记录或备份。
5. **输出转义。** 模型返回的 Markdown/HTML 必须按纯文本或受控 Markdown 渲染，不能直接 `dangerouslySetInnerHTML`。
6. **不记录题目内容。** 调试日志只记耗时、模型名、错误码，不记 prompt 和题干。

## 桌面端（Ollama / llama.cpp）

```bash
# Ollama 默认监听 127.0.0.1:11434
ollama pull qwen2.5:3b
ollama run qwen2.5:3b
```

请求示例：

```http
POST http://127.0.0.1:11434/v1/chat/completions
Content-Type: application/json

{
  "model": "qwen2.5:3b",
  "messages": [
    { "role": "system", "content": "你是题小星的解析助手，只解释当前题目，不要改判分。" },
    { "role": "user", "content": "题干……\n正确答案……\n学生选择……\n请用三句话解释为什么。" }
  ],
  "temperature": 0.2,
  "stream": false
}
```

实操坑：

- `127.0.0.1` 和 `localhost` 在部分系统上解析到 IPv6，Ollama 只监听 IPv4 时会连不上；优先写 `127.0.0.1`。
- 模型第一次加载会等几十秒，别把首次请求的超时设成 2 秒。
- 3B/7B 模型在 8GB 内存机器上会明显挤占浏览器；桌面端可以让用户在设置里手动卸载模型。
- `stream: true` 适合做逐字讲解，但要处理中断和页面切换；第一版建议非流式。

## Android 端

Android 上没有“默认就能跑的 Ollama”。要么：

1. 用户自己装一个本地推理 App，暴露 `127.0.0.1` 的 HTTP 端口；
2. 应用内集成 llama.cpp / MNN / ONNX Runtime 的 AAR，把模型放到应用私有目录；
3. 不接模型，继续用本地学情引擎。

无论哪种，都要注意：

- Android 9 以后默认禁止 cleartext HTTP；`127.0.0.1` 也需要 network security config 或改用 HTTPS/本地 socket。
- WebView 的 CSP 当前是 `default-src 'self'`，接 loopback 时要单独放行 `connect-src http://127.0.0.1:*`，不要顺手放开整个 `http:`。
- 低端机加载 1.5B 以上模型容易 OOM；先做“模型不可用”的降级提示，再谈效果。
- 模型文件不要进 APK/AAB；放 `filesDir` 或用户选择的目录，并提供删除入口。
- 飞行模式下测一遍完整链路，确认没有偷偷走网络。

## 不建议做的事

- 不要用模型自动改正确答案或自动判分。
- 不要把错题本、备份、账号 token 塞进 prompt。
- 不要用“AI 讲解”作为默认路径；先保证题库自带解析能看。
- 不要在未验证的机型上宣称“已适配本地大模型”。

## 当前状态

截至 2026-11-24，本仓库只有 `src/lib/coach.ts` 的本地学情建议，没有 `LocalTutorProvider` 实现，也没有模型文件。README 里不把“离线 AI”写成“已经内置大模型”。
