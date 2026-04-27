# Hold That Thought — v1 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个本地优先的实时转录缓冲 CLI 工具——stdin mock 输入，SQLite + 内存滚动窗口，交互式 REPL 支持按时间窗口导出。

**Architecture:** 分层单体，接口驱动。每个模块定义 TypeScript 接口 + 单一实现，未来可插拔。Node.js 22 + pnpm + TypeScript strict ESM + vitest 测试。

**Tech Stack:** TypeScript (strict, ESM), better-sqlite3, commander, chalk, uuid, vitest, readline (Node 原生)

---

### Task 1: 项目初始化

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: 初始化 package.json**

```bash
cd "P:\work\code\hold-that-thought" && pnpm init
```

- [ ] **Step 2: 覆盖 package.json 为完整配置**

```json
{
  "name": "hold-that-thought",
  "version": "0.1.0",
  "description": "本地优先的实时转录缓冲工具",
  "type": "module",
  "bin": {
    "htd": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc && node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "keywords": [],
  "author": "",
  "license": "MIT"
}
```

- [ ] **Step 3: 安装运行时依赖**

```bash
pnpm add better-sqlite3 commander chalk uuid
```

- [ ] **Step 4: 安装开发依赖**

```bash
pnpm add -D typescript vitest @types/better-sqlite3 @types/uuid @types/node
```

- [ ] **Step 5: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 6: 创建 vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 7: 验证构建链路**

```bash
mkdir -p src && echo 'console.log("htd");' > src/index.ts && pnpm build && node dist/index.js
```
Expected: 输出 `htd`

- [ ] **Step 8: 提交**

```bash
git add -A && git commit -m "chore: init project with TypeScript, vitest, dependencies"
```

---

### Task 2: 共享类型定义

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: 创建 src/types.ts**

```ts
export interface TextSegment {
  id: string;
  text: string;
  timestamp: number; // UTC milliseconds
  speaker?: string;
}

export interface ExportOptions {
  format: 'txt' | 'md';
  from: number;
  to: number;
}
```

- [ ] **Step 2: 验证编译**

```bash
pnpm typecheck
```
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/types.ts && git commit -m "feat: add shared type definitions"
```

---

### Task 3: AudioSource 接口

**Files:**
- Create: `src/audio/interface.ts`

- [ ] **Step 1: 创建 src/audio/interface.ts**

```ts
export interface AudioChunk {
  data: Buffer;
  timestamp: number;
}

export interface AudioSource {
  start(): void;
  stop(): void;
  on(event: 'chunk', listener: (chunk: AudioChunk) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
}
```

- [ ] **Step 2: 验证编译**

```bash
pnpm typecheck
```
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/audio/interface.ts && git commit -m "feat: add AudioSource interface"
```

---

### Task 4: SpeechToText 接口 + stdin 实现

**Files:**
- Create: `src/stt/interface.ts`
- Create: `src/stt/stdin-stt.ts`

- [ ] **Step 1: 创建 src/stt/interface.ts**

```ts
import type { TextSegment } from '../types.js';

export interface SpeechToText {
  start(): void;
  stop(): void;
  on(event: 'segment', listener: (segment: TextSegment) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
}
```

- [ ] **Step 2: 创建 src/stt/stdin-stt.ts**

```ts
import { createInterface } from 'node:readline';
import { v4 as uuid } from 'uuid';
import type { SpeechToText } from './interface.js';
import type { TextSegment } from '../types.js';

export class StdinSTT implements SpeechToText {
  private rl = createInterface({ input: process.stdin });
  private listeners: Record<string, Array<(...args: any[]) => void>> = {};

  start(): void {
    this.rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const segment: TextSegment = {
        id: uuid(),
        text: trimmed,
        timestamp: Date.now(),
      };
      this.emit('segment', segment);
    });
  }

  stop(): void {
    this.rl.close();
  }

  on(event: 'segment' | 'error', listener: (...args: any[]) => void): void {
    (this.listeners[event] ??= []).push(listener);
  }

  private emit(event: string, ...args: any[]): void {
    this.listeners[event]?.forEach((fn) => fn(...args));
  }
}
```

- [ ] **Step 3: 验证编译**

```bash
pnpm typecheck
```
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add src/stt/interface.ts src/stt/stdin-stt.ts && git commit -m "feat: add SpeechToText interface and stdin mock implementation"
```

---

### Task 5: Summarizer 接口（v1 空壳）

**Files:**
- Create: `src/summary/interface.ts`

- [ ] **Step 1: 创建 src/summary/interface.ts**

```ts
export interface Summarizer {
  summarize(text: string): Promise<string>;
}
```

- [ ] **Step 2: 验证编译**

```bash
pnpm typecheck
```
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/summary/interface.ts && git commit -m "feat: add Summarizer interface stub for v2"
```

---

### Task 6: SQLite Store

**Files:**
- Create: `src/buffer/schema.ts`
- Create: `src/buffer/store.ts`
- Create: `src/buffer/store.test.ts`

- [ ] **Step 1: 创建 src/buffer/schema.ts**

```ts
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  speaker TEXT
);
CREATE INDEX IF NOT EXISTS idx_segments_timestamp ON segments(timestamp);
`;
```

- [ ] **Step 2: 写 store 的失败测试 — 创建 src/buffer/store.test.ts**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { SegmentStore } from './store.js';

const TEST_DB = ':memory:';

describe('SegmentStore', () => {
  let store: SegmentStore;

  beforeEach(() => {
    store = new SegmentStore(TEST_DB);
  });

  afterEach(() => {
    store.close();
  });

  it('insertBatch inserts segments and query retrieves them', () => {
    const now = Date.now();
    const segments = [
      { id: 'a', text: 'hello', timestamp: now - 1000, speaker: 'Alice' },
      { id: 'b', text: 'world', timestamp: now },
    ];

    store.insertBatch(segments);

    const results = store.query(now - 2000, now + 1000);
    expect(results).toHaveLength(2);
    expect(results[0].text).toBe('hello');
    expect(results[1].text).toBe('world');
  });

  it('query respects time range boundaries', () => {
    const now = Date.now();
    store.insertBatch([
      { id: 'a', text: 'old', timestamp: now - 5000 },
      { id: 'b', text: 'mid', timestamp: now - 3000 },
      { id: 'c', text: 'new', timestamp: now - 1000 },
    ]);

    const results = store.query(now - 3500, now - 500);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.text)).toEqual(['mid', 'new']);
  });

  it('deleteOlderThan removes old records', () => {
    const now = Date.now();
    store.insertBatch([
      { id: 'a', text: 'old', timestamp: now - 10_000 },
      { id: 'b', text: 'new', timestamp: now },
    ]);

    const deleted = store.deleteOlderThan(now - 5000);
    expect(deleted).toBe(1);

    const results = store.query(0, now + 1000);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('b');
  });

  it('query returns empty array when no matches', () => {
    const results = store.query(0, 1000);
    expect(results).toEqual([]);
  });

  it('getTimeRange returns correct min/max', () => {
    const now = Date.now();
    store.insertBatch([
      { id: 'a', text: 'first', timestamp: now - 5000 },
      { id: 'b', text: 'last', timestamp: now },
    ]);

    const range = store.getTimeRange();
    expect(range).not.toBeNull();
    expect(range!.min).toBe(now - 5000);
    expect(range!.max).toBe(now);
  });

  it('getTimeRange returns null for empty store', () => {
    expect(store.getTimeRange()).toBeNull();
  });

  it('dbSize returns a number', () => {
    store.insertBatch([{ id: 'a', text: 'test', timestamp: Date.now() }]);
    expect(typeof store.dbSize()).toBe('number');
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
pnpm test -- --run
```
Expected: FAIL — SegmentStore not found

- [ ] **Step 4: 实现 SegmentStore — 创建 src/buffer/store.ts**

```ts
import Database from 'better-sqlite3';
import type { TextSegment } from '../types.js';
import { SCHEMA } from './schema.js';

export class SegmentStore {
  private db: Database.Database;
  private insertStmt: Database.Statement;
  private queryStmt: Database.Statement;
  private deleteStmt: Database.Statement;
  private rangeStmt: Database.Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);

    this.insertStmt = this.db.prepare(
      'INSERT OR REPLACE INTO segments (id, text, timestamp, speaker) VALUES (@id, @text, @timestamp, @speaker)',
    );
    this.queryStmt = this.db.prepare(
      'SELECT id, text, timestamp, speaker FROM segments WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC',
    );
    this.deleteStmt = this.db.prepare(
      'DELETE FROM segments WHERE timestamp < ?',
    );
    this.rangeStmt = this.db.prepare(
      'SELECT MIN(timestamp) as min, MAX(timestamp) as max FROM segments',
    );
  }

  insertBatch(segments: TextSegment[]): void {
    const insert = this.db.transaction((items: TextSegment[]) => {
      for (const s of items) {
        this.insertStmt.run({ id: s.id, text: s.text, timestamp: s.timestamp, speaker: s.speaker ?? null });
      }
    });
    insert(segments);
  }

  query(from: number, to: number): TextSegment[] {
    return this.queryStmt.all(from, to) as TextSegment[];
  }

  deleteOlderThan(timestamp: number): number {
    const result = this.deleteStmt.run(timestamp);
    return result.changes;
  }

  getTimeRange(): { min: number; max: number } | null {
    const row = this.rangeStmt.get() as { min: number | null; max: number | null } | undefined;
    if (!row || row.min === null || row.max === null) return null;
    return { min: row.min, max: row.max };
  }

  dbSize(): number {
    return this.db.pragma('page_count', { simple: true }) as number;
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
pnpm test -- --run
```
Expected: 7/7 PASS

- [ ] **Step 6: 提交**

```bash
git add src/buffer/schema.ts src/buffer/store.ts src/buffer/store.test.ts && git commit -m "feat: add SQLite segment store with CRUD operations"
```

---

### Task 7: Buffer Manager

**Files:**
- Create: `src/buffer/manager.ts`
- Create: `src/buffer/manager.test.ts`

- [ ] **Step 1: 写 manager 的失败测试 — 创建 src/buffer/manager.test.ts**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BufferManager } from './manager.js';
import { SegmentStore } from './store.js';
import type { TextSegment } from '../types.js';

describe('BufferManager', () => {
  let manager: BufferManager;
  let store: SegmentStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T14:00:00Z'));
    store = new SegmentStore(':memory:');
    manager = new BufferManager(store, { windowMs: 8 * 60 * 60 * 1000, hotMs: 30 * 60 * 1000 });
  });

  afterEach(() => {
    manager.shutdown();
    store.close();
    vi.useRealTimers();
  });

  function makeSeg(text: string, offsetSec: number): TextSegment {
    return {
      id: text + offsetSec,
      text,
      timestamp: Date.now() + offsetSec * 1000,
    };
  }

  it('push adds segment to hot buffer', () => {
    const seg = makeSeg('hello', 0);
    manager.push(seg);
    const results = manager.query(Date.now() - 1000, Date.now() + 1000);
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('hello');
  });

  it('query merges hot buffer and store results', () => {
    const old = makeSeg('old', -60_000);
    const recent = makeSeg('recent', -1000);

    // 直接写入 store 模拟归档数据
    store.insertBatch([old]);
    // push 到热缓冲
    manager.push(recent);

    const results = manager.query(Date.now() - 120_000, Date.now() + 1000);
    expect(results).toHaveLength(2);
    expect(results[0].text).toBe('old');
    expect(results[1].text).toBe('recent');
  });

  it('flushes old segments from hot buffer to store after hotMs threshold', () => {
    const now = Date.now();
    // 先 push 一个旧数据
    manager.push(makeSeg('old', -31 * 60_000)); // 31 分钟前

    // push 新数据触发 flush 检查
    manager.push(makeSeg('new', 0));

    // 新数据在热缓冲
    const hot = manager.query(now - 1000, now + 1000);
    expect(hot).toHaveLength(1);
    expect(hot[0].text).toBe('new');

    // 旧数据应该已经在 store 中（通过 flush）
    const stored = store.query(0, now + 1000);
    expect(stored).toHaveLength(1);
    expect(stored[0].text).toBe('old');
  });

  it('hotCount returns number of segments in hot buffer', () => {
    manager.push(makeSeg('a', 0));
    manager.push(makeSeg('b', 1000));
    expect(manager.hotCount()).toBe(2);
  });

  it('shutdown flushes all hot segments to store', () => {
    manager.push(makeSeg('a', 0));
    manager.push(makeSeg('b', 1000));

    manager.shutdown();

    const results = store.query(0, Date.now() + 5000);
    expect(results).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test -- --run
```
Expected: FAIL — BufferManager not found

- [ ] **Step 3: 实现 BufferManager — 创建 src/buffer/manager.ts**

```ts
import type { TextSegment } from '../types.js';
import type { SegmentStore } from './store.js';

export interface TimeRange { min: number; max: number }

interface BufferOptions {
  windowMs: number; // total retention window, default 8h
  hotMs: number;    // hot buffer retention before flush to DB, default 30min
}

export class BufferManager {
  private hot: TextSegment[] = [];
  private store: SegmentStore;
  private options: BufferOptions;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(store: SegmentStore, options: BufferOptions) {
    this.store = store;
    this.options = options;
    this.cleanupTimer = setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  push(segment: TextSegment): void {
    this.hot.push(segment);
    this.maybeFlush();
  }

  query(from: number, to: number): TextSegment[] {
    const fromDb = this.store.query(from, to);
    const fromHot = this.hot.filter((s) => s.timestamp >= from && s.timestamp <= to);

    // 合并并去重（热缓冲覆盖同 id 的 DB 记录）
    const dbIds = new Set(fromDb.map((s) => s.id));
    const merged = [...fromDb, ...fromHot.filter((s) => !dbIds.has(s.id))];
    merged.sort((a, b) => a.timestamp - b.timestamp);
    return merged;
  }

  hotCount(): number {
    return this.hot.length;
  }

  getTimeRange(): TimeRange | null {
    return this.store.getTimeRange();
  }

  shutdown(): void {
    clearInterval(this.cleanupTimer);
    this.flushAll();
  }

  private maybeFlush(): void {
    if (this.hot.length < 2) return;
    const oldest = this.hot[0].timestamp;
    const newest = this.hot[this.hot.length - 1].timestamp;
    if (newest - oldest < this.options.hotMs) return;

    const cutoff = newest - this.options.hotMs;
    const toFlush: TextSegment[] = [];
    while (this.hot.length > 0 && this.hot[0].timestamp < cutoff) {
      toFlush.push(this.hot.shift()!);
    }
    if (toFlush.length > 0) {
      this.store.insertBatch(toFlush);
    }
  }

  private flushAll(): void {
    if (this.hot.length > 0) {
      this.store.insertBatch(this.hot);
      this.hot = [];
    }
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.options.windowMs;
    this.store.deleteOlderThan(cutoff);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test -- --run
```
Expected: 12/12 PASS (7 store + 5 manager)

- [ ] **Step 5: 提交**

```bash
git add src/buffer/manager.ts src/buffer/manager.test.ts && git commit -m "feat: add BufferManager with hot buffer + SQLite coordination"
```

---

### Task 8: Exporter（导出模块）

**Files:**
- Create: `src/export/exporter.ts`
- Create: `src/export/exporter.test.ts`

- [ ] **Step 1: 写 exporter 的失败测试 — 创建 src/export/exporter.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { exportTranscript } from './exporter.js';
import type { TextSegment } from '../types.js';

const sample: TextSegment[] = [
  { id: '1', text: '大家好', timestamp: 1745760000000, speaker: '张' },
  { id: '2', text: '今天讨论项目进度', timestamp: 1745760005000 },
  { id: '3', text: '好的，我先汇报', timestamp: 1745760010000, speaker: '李' },
];

describe('exportTranscript', () => {
  it('exports to txt format with timestamps', () => {
    const result = exportTranscript(sample, { format: 'txt', from: 0, to: Date.now() });
    expect(result).toContain('[14:40:00] 张：大家好');
    expect(result).toContain('[14:40:05] 今天讨论项目进度');
    expect(result).toContain('[14:40:10] 李：好的，我先汇报');
  });

  it('exports to markdown format', () => {
    const result = exportTranscript(sample, { format: 'md', from: 0, to: Date.now() });
    expect(result).toContain('## 转录导出');
    expect(result).toContain('**张**');
    expect(result).toContain('大家好');
    expect(result).toContain('*14');
  });

  it('returns empty string for empty segments', () => {
    const result = exportTranscript([], { format: 'txt', from: 0, to: Date.now() });
    expect(result).toBe('');
  });

  it('txt includes export time range info', () => {
    const result = exportTranscript(sample, { format: 'txt', from: 1745760000000, to: 1745760100000 });
    expect(result).toContain('2026-04-27');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test -- --run
```
Expected: FAIL — exportTranscript not found

- [ ] **Step 3: 实现 exporter — 创建 src/export/exporter.ts**

```ts
import type { TextSegment, ExportOptions } from '../types.js';

function ts(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

function tsDate(ms: number): string {
  return new Date(ms).toLocaleDateString('zh-CN');
}

export function exportTranscript(segments: TextSegment[], opts: ExportOptions): string {
  if (segments.length === 0) return '';

  if (opts.format === 'md') {
    let out = '## 转录导出\n\n';
    out += `> ${tsDate(opts.from)} ${ts(opts.from)} — ${ts(opts.to)}\n\n`;
    for (const s of segments) {
      const speaker = s.speaker ? `**${s.speaker}**：` : '';
      out += `- *${ts(s.timestamp)}* ${speaker}${s.text}\n`;
    }
    return out;
  }

  // txt format
  let out = `转录导出  ${tsDate(opts.from)} ${ts(opts.from)} — ${ts(opts.to)}\n`;
  out += `${'─'.repeat(50)}\n\n`;
  for (const s of segments) {
    const speaker = s.speaker ? `${s.speaker}：` : '';
    out += `[${ts(s.timestamp)}] ${speaker}${s.text}\n`;
  }
  return out;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test -- --run
```
Expected: 16/16 PASS (7 store + 5 manager + 4 exporter)

- [ ] **Step 5: 提交**

```bash
git add src/export/exporter.ts src/export/exporter.test.ts && git commit -m "feat: add transcript exporter with txt and markdown formats"
```

---

### Task 9: REPL 交互式界面

**Files:**
- Create: `src/repl/repl.ts`

- [ ] **Step 1: 创建 src/repl/repl.ts**

```ts
import * as readline from 'node:readline';
import { writeFileSync } from 'node:fs';
import { BufferManager } from '../buffer/manager.js';
import { exportTranscript } from '../export/exporter.js';
import chalk from 'chalk';

function parseTime(input: string): number {
  // 相对时间偏移: -30m, -1h, -2h30m
  const relMatch = input.match(/^-(\d+)(m|h)(?:(\d+)m)?$/);
  if (relMatch) {
    let ms = 0;
    if (relMatch[2] === 'h') ms += parseInt(relMatch[1]) * 3600_000;
    else ms += parseInt(relMatch[1]) * 60_000;
    if (relMatch[3]) ms += parseInt(relMatch[3]) * 60_000;
    return Date.now() + ms;
  }

  // HH:MM (today)
  const timeMatch = input.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const d = new Date();
    d.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
    return d.getTime();
  }

  // "10am", "3pm"
  const ampmMatch = input.match(/^(\d{1,2})(am|pm)$/i);
  if (ampmMatch) {
    const d = new Date();
    let h = parseInt(ampmMatch[1]);
    if (ampmMatch[2].toLowerCase() === 'pm' && h !== 12) h += 12;
    if (ampmMatch[2].toLowerCase() === 'am' && h === 12) h = 0;
    d.setHours(h, 0, 0, 0);
    return d.getTime();
  }

  // 完整日期时间: 2026-04-27 14:30
  const fullMatch = input.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (fullMatch) {
    return new Date(`${fullMatch[1]}T${fullMatch[2].padStart(2, '0')}:${fullMatch[3]}:00`).getTime();
  }

  throw new Error(`无法解析时间: ${input}`);
}

export function startRepl(manager: BufferManager): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  console.log(chalk.dim('Hold That Thought — 实时转录缓冲已启动'));
  console.log(chalk.dim('输入 /help 查看命令，Ctrl+C 退出'));
  console.log('');

  // 拦截 stdin 行：如果以 / 开头则是命令，否则是转录文本
  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed.startsWith('/')) {
      handleCommand(trimmed, manager);
    }
    // 不以 / 开头的行已在 StdinSTT 中处理为转录输入
    // 这里不需额外处理，因为 StdinSTT 和 REPL 共享同一个 stdin

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.yellow('\n正在保存缓冲数据...'));
    manager.shutdown();
    console.log(chalk.green('再见。'));
  });

  rl.prompt();
}

function handleCommand(input: string, manager: BufferManager): void {
  const parts = input.slice(1).split(/\s+/);
  const cmd = parts[0];

  switch (cmd) {
    case 'export': {
      const args = parseArgs(parts.slice(1));
      const now = Date.now();
      const from = args.from ? parseTime(args.from) : now - 30 * 60_000;
      const to = args.to ? parseTime(args.to) : now;
      const format = (args.format === 'md' ? 'md' : 'txt') as 'txt' | 'md';

      const segments = manager.query(from, to);
      const output = exportTranscript(segments, { format, from, to });

      if (args.output) {
        writeFileSync(args.output, output, 'utf-8');
        console.log(chalk.green(`已导出 ${segments.length} 条记录到 ${args.output}`));
      } else {
        console.log(output);
      }
      break;
    }
    case 'status': {
      const hot = manager.hotCount();
      const ts = manager.getTimeRange();
      const dbStr = ts ? `${new Date(ts.min).toLocaleTimeString('zh-CN', { hour12: false })} ~ ${new Date(ts.max).toLocaleTimeString('zh-CN', { hour12: false })}` : '空';
      const coverage = ts ? formatDuration(ts.max - ts.min) : '0m';
      console.log(`热缓冲: ${hot} 条 | DB: ${dbStr} | 覆盖 ${coverage}`);
      break;
    }
    case 'help':
      console.log(
        [
          '可用命令:',
          '  /export --from <time> --to <time> [--format txt|md] [--output <path>]',
          '  /status',
          '  /help',
          '  /quit',
          '',
          '时间格式: 14:00 | -30m | -1h | 10am | 3pm | "2026-04-27 14:30"',
        ].join('\n'),
      );
      break;
    case 'quit':
      process.exit(0);
      break;
    default:
      console.log(chalk.red(`未知命令: /${cmd}，输入 /help 查看可用命令`));
  }
}

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      result[key] = val;
    }
  }
  return result;
}

function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}
```

- [ ] **Step 2: 验证编译**

```bash
pnpm typecheck
```
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/repl/repl.ts && git commit -m "feat: add interactive REPL with export/status/help commands"
```

---

### Task 10: CLI 入口

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: 创建 src/index.ts**

```ts
#!/usr/bin/env node
import { Command } from 'commander';
import { StdinSTT } from './stt/stdin-stt.js';
import { SegmentStore } from './buffer/store.js';
import { BufferManager } from './buffer/manager.js';
import { startRepl } from './repl/repl.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

function parseDuration(s: string): number {
  const match = s.match(/^(\d+)(h|m)$/);
  if (!match) throw new Error(`无法解析时长: ${s}`);
  const val = parseInt(match[1]);
  return match[2] === 'h' ? val * 3600_000 : val * 60_000;
}

const program = new Command();

program
  .name('htd')
  .description('Hold That Thought — 本地优先实时转录缓冲工具')
  .version('0.1.0');

program
  .command('start')
  .description('启动转录监听')
  .option('--window <duration>', '滚动窗口时长', '8h')
  .option('--hot <duration>', '热缓冲时长', '30m')
  .action((opts) => {
    const dataDir = join(homedir(), '.htd');
    mkdirSync(dataDir, { recursive: true });
    const dbPath = join(dataDir, 'transcripts.db');

    const windowMs = parseDuration(opts.window);
    const hotMs = parseDuration(opts.hot);

    const stt = new StdinSTT();
    const store = new SegmentStore(dbPath);
    const manager = new BufferManager(store, { windowMs, hotMs });

    stt.on('segment', (seg) => {
      const time = new Date(seg.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
      const prefix = seg.speaker ? `${seg.speaker}：` : '';
      console.log(`[${time}] ${prefix}${seg.text}`);
      manager.push(seg);
    });

    stt.on('error', (err) => {
      console.error('STT 错误:', err.message);
    });

    stt.start();
    startRepl(manager);
  });

program.parse();
```

- [ ] **Step 2: 构建并验证**

```bash
pnpm build && node dist/index.js --help
```
Expected: 显示 commander 自动生成的帮助信息

```bash
node dist/index.js start --help
```
Expected: 显示 start 命令选项

- [ ] **Step 3: 提交**

```bash
git add src/index.ts && git commit -m "feat: add CLI entry point with start command"
```

---

### Task 11: 手动集成验证

- [ ] **Step 1: 构建项目**

```bash
pnpm build
```

- [ ] **Step 2: 启动 REPL 并输入几条测试文本**

```bash
echo "张：大家早上好" | timeout 2 node dist/index.js start 2>&1 || true
```
Expected: 看到 `[时间] 张：大家早上好` 的输出

- [ ] **Step 3: 验证 /status 命令**

```bash
printf "test line 1\ntest line 2\n/status\n/quit\n" | node dist/index.js start
```
Expected: 看到热缓冲和 DB 状态

- [ ] **Step 4: 验证导出功能**

```bash
printf "张：测试第一句\n李：测试第二句\n/export --from -5m --format md\n/quit\n" | node dist/index.js start
```
Expected: 看到 markdown 格式的导出输出

- [ ] **Step 5: 验证数据持久化**

```bash
printf "persist test\n/quit\n" | node dist/index.js start && printf "test again\n/status\n/quit\n" | node dist/index.js start
```
Expected: 第二次启动时 DB 状态显示有旧数据

- [ ] **Step 6: 最终提交**

```bash
git add -A && git commit -m "chore: finalize v1 implementation"
```
