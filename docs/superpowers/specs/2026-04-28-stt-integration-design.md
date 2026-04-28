# STT Integration Design: Sherpa-ONNX 实时语音转文字

**日期:** 2026-04-28
**状态:** 待实现

## 动机

hold-that-thought v1 使用 stdin 输入模拟转录内容（键盘打字）。v2 需要接入真实音频源，实现"边说边转"的实时转录体验。

## 方案选择

选择 **Sherpa-ONNX + SenseVoice** 本地方案：
- RTX 4090 24GB 本地推理，零网络依赖，零 API 费用
- 原生 Node.js 绑定（`sherpa-onnx-node`），无需管理 Python 子进程
- SenseVoice 模型：中英混合识别、内置 VAD、自动标点
- 流式 ASR 是一等设计目标，不是后来补的功能

## 架构

```
WasmAudioSource ──▶ SherpaSTT ──▶ BufferManager ──▶ REPL/Export
  (naudiodon)      (sherpa-onnx)   (已有,不改)
      │                 │
  AudioChunk       TextSegment
 (PCM 16kHz)    (id/text/timestamp)
```

### 接口（已存在，不改）

```typescript
// src/stt/interface.ts
interface SpeechToText {
  start(): void;
  stop(): void;
  on(event: 'segment', listener: (s: TextSegment) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
}

// src/audio/interface.ts
interface AudioSource {
  start(): void;
  stop(): void;
  on(event: 'chunk', listener: (c: AudioChunk) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
}
```

## 音频捕获: WasmAudioSource

- 使用 `naudiodon`（PortAudio Node.js 绑定）通过 WASAPI 捕获麦克风
- 采样率: 16kHz, 单声道, 16bit PCM
- 缓冲区大小: ~100ms（约 3200 samples/chunk）
- 实现 `AudioSource` 接口，输出 `AudioChunk` 流

## STT 识别: SherpaSTT

- 使用 `sherpa-onnx-node` 的 `OnlineRecognizer`
- 模型: SenseVoice（中英混合）
- 实现 `SpeechToText` 接口
- 核心流程：`acceptWaveform(samples)` → 轮询 `getResult()` → 当 `isFinal` 时 emit `segment`
- 单句完成为单位输出 `TextSegment`（不输出中间结果，保持 BufferManager 数据干净）

## 启动流程变更

```
htt start [--window 8h] [--hot 30m] [--model sensevoice]
  ├── 创建 WasmAudioSource
  ├── 创建 SherpaSTT（加载模型,可能需要数秒）
  ├── 创建 BufferManager（已有）
  ├── 连接管线: AudioChunk → STT → TextSegment → BufferManager.push()
  └── 启动 REPL（仍然可用，支持手动输入补充）
```

## REPL 新增命令

| 命令 | 说明 |
|------|------|
| `/mic on` | 开启麦克风监听（启动默认开） |
| `/mic off` | 暂停麦克风监听 |
| 直接输入文字 | 保持现有行为，作为语音补充 |

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/audio/wasm-audio.ts` | 新增 | WasmAudioSource 实现 |
| `src/stt/sherpa-stt.ts` | 新增 | SherpaSTT 实现 |
| `src/index.ts` | 修改 | 连接音频→STT→BufferManager 管线 |
| `src/repl/repl.ts` | 修改 | 新增 /mic on/off 命令 |

## 依赖新增

| 包 | 用途 |
|----|------|
| `sherpa-onnx-node` | Sherpa-ONNX Node.js 绑定 |
| `naudiodon` | 跨平台音频捕获（PortAudio） |

## 模型文件

SenseVoice 模型需下载一次（~100MB），缓存在 `.htt/models/` 目录。首次运行自动下载。

## 非目标

- 系统音频（loopback）捕获 — 后续迭代
- 多说话人识别（speaker diarization）— v1 保持手动 `说话人：内容` 格式
- 实时中间结果展示 — 仅输出最终确认结果
