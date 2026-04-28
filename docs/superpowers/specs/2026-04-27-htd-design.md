# Hold That Thought — v1 设计文档

## 概述

**Hold That Thought (htt)** 是一个本地优先的实时转录缓冲工具。持续监听音频输入，滚动保留最近 8 小时内容，支持按时间窗口导出。

- **技术栈**：Node.js 22 + pnpm + TypeScript (strict, ESM)
- **v1 目标**：跑通 监听→缓冲→导出 核心流程，STT 用 stdin mock，AI 总结预留接口
- **v2+ 保留**：DeepSeek API 总结、真实音频输入源、真实 STT 引擎

---

## 架构

分层单体，接口驱动。每个模块定义 TypeScript 接口，当前一个实现，未来可插拔。

```
src/
├── index.ts              # CLI 入口（htt start → REPL）
├── audio/
│   └── interface.ts      # AudioSource 接口
├── stt/
│   └── interface.ts      # SpeechToText 接口
│   └── stdin-stt.ts      # stdin 逐行读取实现（v1 mock）
├── buffer/
│   └── manager.ts        # BufferManager：协调内存热缓冲 + SQLite
│   └── store.ts          # SQLite 读写封装
│   └── schema.ts         # 建表语句
├── export/
│   └── exporter.ts       # 按时间窗口导出（txt / md）
├── summary/
│   └── interface.ts      # Summarizer 接口（v1 空壳）
├── repl/
│   └── repl.ts           # readline 交互式 REPL
└── types.ts              # TextSegment 等共享类型
```

**模块职责与接口：**

| 模块 | 职责 | 关键接口 |
|------|------|----------|
| `audio/interface` | 定义音频输入源契约 | `start()`, `stop()`, `on('chunk', cb)` |
| `stt/interface` | 定义语音→文字契约 | `transcribe(audioChunk) => TextSegment` |
| `stt/stdin-stt` | v1 mock：逐行读取 stdin | 实现 `SpeechToText`，每行 = 一个 segment |
| `buffer/manager` | 滚动窗口协调中心 | `push(segment)`, `query(start, end)` |
| `buffer/store` | SQLite 读写封装 | `insertBatch(segments)`, `query(start, end)`, `deleteOlderThan(ts)` |
| `export/exporter` | 时间窗口导出 | `export(segments, format) => string` |
| `summary/interface` | AI 总结预留 | `summarize(text) => string`（v1 抛 not implemented） |
| `repl/repl` | 交互式命令循环 | 管理 readline、分发命令、显示转录 |

---

## 数据模型

```ts
interface TextSegment {
  id: string;          // uuid
  text: string;        // 转录文本
  timestamp: number;   // UTC 毫秒
  speaker?: string;    // 说话人标签（v1 可选）
}
```

SQLite 表结构（`buffer/store.ts` 中的 schema）：

```sql
CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  speaker TEXT
);
CREATE INDEX IF NOT EXISTS idx_segments_timestamp ON segments(timestamp);
```

---

## 数据流

```
stdin 逐行输入
     │
┌────▼────┐
│ stdin-stt│  → 每行 → TextSegment
└─────────┘
     │
┌────▼──────────┐
│ BufferManager │
│               │
│ ┌───────────┐ │
│ │ 热缓冲     │ │  ← 内存 Deque（~30 min），按时间戳排序
│ │ (Deque)   │ │
│ └─────┬─────┘ │
│       │满 30min│
│ ┌─────▼─────┐ │
│ │  SQLite   │ │  ← 磁盘归档，保留 8 小时
│ └───────────┘ │
│       │定时清理│
└───────┬──────┘
        │ query(start, end)
   ┌────▼────┐
   │ export  │  → txt / md 格式化输出
   └─────────┘
```

**关键流程：**

1. **启动** (`htt start`)：初始化 SQLite 建表 → 从 DB 加载最近 8 小时数据到热缓冲 → 启动 stdin 监听 → 进入 REPL
2. **新文本到达**：`push(segment)` → 追加到热缓冲 Deque → 热缓冲中时间跨度超 30 分钟时，最旧部分批量 flush 到 SQLite
3. **过期清理**：每 10 分钟定时 → `DELETE FROM segments WHERE timestamp < now - 8h`
4. **导出** (`/export`)：`query(start, end)` → 从热缓冲 + SQLite 合并查询 → 按时间戳排序 → 格式化输出
5. **退出** (`/quit` 或 Ctrl+C)：flush 热缓冲全部到 SQLite → 关闭 DB 连接 → 退出

---

## CLI / REPL 设计

**启动命令：**

```
htt start [--window 8h] [--hot 30m]
```

**进入 REPL 后的体验：**

```
$ htt start

[14:05:32] 张：我们下午的会议定在三点...
[14:05:45] 李：好的，我把会议室定在三楼
[14:06:01] 张：记得带上方案书
...

> /export --from -30m --format md --output ./meeting.md
已导出最近 30 分钟内容到 meeting.md

> /status
热缓冲: 42 条 | DB: 10:05 ~ 14:06 | 覆盖 4h1m | DB 大小 1.2MB

> /help
可用命令:
  /export --from <time> --to <time> [--format txt|md] [--output <path>]
  /status
  /help
  /quit

> /quit
正在保存缓冲数据... 再见。
```

**命令说明：**

| 命令 | 参数 | 说明 |
|------|------|------|
| `/export` | `--from`, `--to` (默认 now), `--format` (txt\|md, 默认 txt), `--output` (可选，不传则打印到 stdout) | 导出指定时间窗口的转录内容 |
| `/status` | 无 | 显示热缓冲条目数、DB 时间范围、覆盖时长、DB 文件大小 |
| `/help` | 无 | 显示可用命令 |
| `/quit` | 无 | 优雅退出（Ctrl+C 等效） |

**时间参数格式：** 支持 `14:00`（今天）、`-30m`（相对偏移）、`10am`、`2026-04-27 14:30`。

**实现方式：** Node.js 原生 `readline` 模块，用 `readline.clearLine` / `cursorTo` 管理输入行与转录输出的布局。

---

## 依赖

**运行时（v1 最小集）：**

| 包 | 用途 |
|---|---|
| `better-sqlite3` | SQLite 同步读写 |
| `commander` | CLI 命令解析 |
| `chalk` | 终端彩色输出 |
| `uuid` | 生成 segment ID |

**开发依赖：**

| 包 | 用途 |
|---|---|
| `typescript` | 编译 |
| `vitest` | 测试 |
| `@types/better-sqlite3` | 类型 |
| `@types/uuid` | 类型 |
| `prettier` | 已有，代码格式化 |

---

## 测试策略

- **`buffer/manager.ts`**（单元测试，vitest）：push / flush 逻辑 / 合并查询（热+DB）/ 过期清理
- **`buffer/store.ts`**（单元测试）：insertBatch / query / deleteOlderThan
- **`export/exporter.ts`**（单元测试）：txt 格式 / md 格式输出验证
- **接口层不单独测**：`interface.ts` 是纯类型定义
- **v1 不做端到端测试**：stdin 交互式 REPL 成本高，手工验证

---

## 不做的（v1 out of scope）

- 真实音频采集（麦克风/系统音频）
- 真实 STT 引擎（Whisper 等）
- AI 总结（DeepSeek API 对接）
- 说话人识别
- 后台守护进程模式
- 配置文件（`~/.httrc` 等）
- 端到端集成测试
