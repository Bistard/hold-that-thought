# hold-that-thought

不再错过刚刚那句重要的话 / Never lose the last important thing someone just said.

本地优先的实时转录缓冲工具。持续监听、滚动保留最近 8 小时内容，支持按时间窗口导出与总结。

## 安装

```bash
git clone https://github.com/Bistard/hold-that-thought.git
cd hold-that-thought
pnpm install
pnpm build
```

## 使用

```bash
# 启动转录监听
htd start

# 自定义窗口和热缓冲时长
htd start --window 4h --hot 15m
```

启动后进入交互式 REPL，直接输入文本作为转录内容：

```
$ htd start

[14:05:32] 张：我们下午的会议定在三点...
[14:05:45] 李：好的，我把会议室定在三楼

> /status
热缓冲: 2 条 | DB: 14:05:32 ~ 14:05:45 | 覆盖 0m

> /export --from -30m --format md --output meeting.md
已导出 2 条记录到 meeting.md

> /quit
正在保存缓冲数据... 再见。
```

### REPL 命令

| 命令 | 说明 |
|------|------|
| `/export --from <time> --to <time> [--format txt\|md] [--output <path>]` | 导出指定时间窗口 |
| `/status` | 查看缓冲状态 |
| `/help` | 显示帮助 |
| `/quit` | 退出（Ctrl+C 等效） |

### 时间格式

支持多种时间表达方式：

- 相对偏移：`-30m`（30 分钟前）、`-2h`（2 小时前）、`-1h30m`
- 钟点时间：`14:00`、`09:30`
- 上下午：`10am`、`3pm`
- 完整日期：`2026-04-27 14:30`

## 技术栈

- **运行时**：Node.js 18+ / TypeScript (strict, ESM)
- **存储**：sql.js (WASM SQLite)，数据文件位于 `~/.htd/transcripts.db`
- **交互**：Node 原生 readline

## 开发

```bash
pnpm install        # 安装依赖
pnpm build          # 编译 TypeScript
pnpm test           # 运行测试
pnpm typecheck      # 类型检查
```

## 路线图

- [x] v1：stdin mock 转录 + SQLite 滚动窗口 + REPL 导出
- [ ] v2：接入真实音频输入源（麦克风/系统音频）
- [ ] v2：接入真实 STT 引擎（Whisper 等）
- [ ] v2：DeepSeek API AI 总结
