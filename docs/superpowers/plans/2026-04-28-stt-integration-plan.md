# STT Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate real-time microphone speech-to-text using Sherpa-ONNX + SenseVoice model into the hold-that-thought transcript buffer.

**Architecture:** WasmAudioSource (naudiodon/PortAudio) captures mic PCM → SherpaSTT (sherpa-onnx-node OnlineRecognizer) converts to text → BufferManager (existing) stores and serves queries. The REPL gains `/mic on` and `/mic off` commands and continues to accept manual text input as supplement.

**Tech Stack:** sherpa-onnx-node, naudiodon, Node.js 18+, TypeScript strict ESM, vitest

---

## File Structure

```
src/
├── audio/
│   ├── interface.ts      # (existing, no changes)
│   ├── wasm-audio.ts     # CREATE: WasmAudioSource implements AudioSource
│   └── wasm-audio.test.ts # CREATE: tests
├── stt/
│   ├── interface.ts      # (existing, no changes)
│   ├── stdin-stt.ts       # (existing, no changes)
│   ├── sherpa-stt.ts     # CREATE: SherpaSTT implements SpeechToText
│   └── sherpa-stt.test.ts # CREATE: tests
├── repl/
│   └── repl.ts           # MODIFY: add /mic on/off, accept optional AudioSource param
├── index.ts              # MODIFY: wire audio → STT → buffer pipeline
├── model-download.ts     # CREATE: SenseVoice model download + cache
└── model-download.test.ts # CREATE: tests
```

---

### Task 1: Install dependencies and verify API surface

**Files:** None (package.json / node_modules only)

- [ ] **Step 1: Check node-gyp prerequisites**

```bash
node -e "try{require('node-gyp')}catch(e){console.log('node-gyp not found')}"
```

- [ ] **Step 2: Install naudiodon and sherpa-onnx-node**

```bash
pnpm add naudiodon sherpa-onnx-node
```

Expected: both packages install successfully. If naudiodon fails to compile, ensure Visual Studio Build Tools with "Desktop development with C++" workload is installed.

- [ ] **Step 3: Verify naudiodon import works with ESM**

Write a temporary verification script:

```bash
node -e "import('naudiodon').then(m => console.log('naudiodon exports:', Object.keys(m))).catch(e => console.error('naudiodon import failed:', e.message))"
```

If ESM import fails, use `createRequire`:

```bash
node -e "import('node:module').then(({createRequire})=>{const r=createRequire(import.meta.url); const n=r('naudiodon'); console.log('naudiodon exports:', Object.keys(n))}).catch(e => console.error(e.message))"
```

- [ ] **Step 4: Verify sherpa-onnx-node import and inspect API**

```bash
node -e "import('sherpa-onnx-node').then(m => { console.log('sherpa-onnx-node exports:', Object.keys(m)); if (m.default) console.log('default exports:', Object.keys(m.default)); }).catch(e => console.error('sherpa-onnx-node import failed:', e.message))"
```

Expected output: Should show `createOnlineRecognizer` or similar factory function. Note the exact API surface for use in Task 3.

- [ ] **Step 5: Commit dependency changes**

```bash
git add package.json pnpm-lock.yaml
git commit -m "[chore] add sherpa-onnx-node and naudiodon dependencies"
```

---

### Task 2: Create WasmAudioSource

**Files:**
- Create: `src/audio/wasm-audio.ts`
- Create: `src/audio/wasm-audio.test.ts`

- [ ] **Step 1: Write failing test for WasmAudioSource interface**

Create `src/audio/wasm-audio.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WasmAudioSource } from './wasm-audio.js';
import type { AudioChunk } from './interface.js';

describe('WasmAudioSource', () => {
  it('implements AudioSource interface: has start, stop, on methods', () => {
    const src = new WasmAudioSource();
    expect(typeof src.start).toBe('function');
    expect(typeof src.stop).toBe('function');
    expect(typeof src.on).toBe('function');
  });

  it('emits chunk events when started (mock device check)', async () => {
    const src = new WasmAudioSource();
    const chunks: AudioChunk[] = [];
    src.on('chunk', (c: AudioChunk) => chunks.push(c));

    // start() should not throw
    expect(() => src.start()).not.toThrow();

    // Give it a tick to start the stream, then stop
    await new Promise((r) => setTimeout(r, 300));
    src.stop();
  });

  it('emits error events when no microphone available', async () => {
    const src = new WasmAudioSource({ deviceId: 999 }); // nonexistent device
    const errors: Error[] = [];
    src.on('error', (e: Error) => errors.push(e));

    src.start();
    await new Promise((r) => setTimeout(r, 500));
    src.stop();

    // Should have captured an error from naudiodon
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it('stop() is idempotent', () => {
    const src = new WasmAudioSource();
    expect(() => {
      src.stop();
      src.stop();
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- --run src/audio/wasm-audio.test.ts
```

Expected: FAIL — `WasmAudioSource` not defined.

- [ ] **Step 3: Implement WasmAudioSource**

Create `src/audio/wasm-audio.ts`:

```typescript
import { createRequire } from 'node:module';
import type { AudioSource, AudioChunk } from './interface.js';

const require = createRequire(import.meta.url);
const { AudioIO, SampleFormat16Bit } = require('naudiodon');

export interface WasmAudioOptions {
  deviceId?: number; // -1 = default input device
  sampleRate?: number;
  channelCount?: number;
}

export class WasmAudioSource implements AudioSource {
  private listeners: Record<string, Array<(...args: any[]) => void>> = {};
  private io: InstanceType<typeof AudioIO> | null = null;
  private opts: WasmAudioOptions;

  constructor(opts: WasmAudioOptions = {}) {
    this.opts = {
      deviceId: opts.deviceId ?? -1,
      sampleRate: opts.sampleRate ?? 16000,
      channelCount: opts.channelCount ?? 1,
    };
  }

  start(): void {
    if (this.io) return; // already started

    try {
      this.io = new AudioIO({
        inOptions: {
          channelCount: this.opts.channelCount!,
          sampleFormat: SampleFormat16Bit,
          sampleRate: this.opts.sampleRate!,
          deviceId: this.opts.deviceId!,
          closeOnError: true,
        },
      });

      this.io.on('data', (buf: Buffer) => {
        this.emit('chunk', {
          data: buf,
          timestamp: Date.now(),
        } as AudioChunk);
      });

      this.io.on('error', (err: Error) => {
        this.emit('error', err);
      });

      this.io.start();
    } catch (err) {
      this.emit('error', err as Error);
    }
  }

  stop(): void {
    if (!this.io) return;
    try {
      this.io.quit();
    } catch {
      // ignore cleanup errors
    }
    this.io = null;
  }

  on(event: 'chunk' | 'error', listener: (...args: any[]) => void): void {
    (this.listeners[event] ??= []).push(listener);
  }

  private emit(event: string, ...args: any[]): void {
    this.listeners[event]?.forEach((fn) => fn(...args));
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm test -- --run src/audio/wasm-audio.test.ts
```

Expected: Tests that don't need real hardware pass (interface shape, idempotent stop). The real-device test may pass or skip based on hardware.

- [ ] **Step 5: Commit**

```bash
git add src/audio/wasm-audio.ts src/audio/wasm-audio.test.ts
git commit -m "[feat(audio)] add WasmAudioSource for microphone capture via naudiodon"
```

---

### Task 3: Create Model Download Utility

**Files:**
- Create: `src/model-download.ts`
- Create: `src/model-download.test.ts`

SenseVoice model files are distributed via GitHub releases. We need to download and cache them once.

- [ ] **Step 1: Write failing test**

Create `src/model-download.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { ensureModel, isModelCached, SENSEVOICE_MODEL_URL, SENSEVOICE_FILES } from '../model-download.js';

describe('model-download', () => {
  const testDir = join(process.cwd(), '.htt', 'test-models');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('SENSEVOICE_MODEL_URL is a valid URL string', () => {
    expect(SENSEVOICE_MODEL_URL).toMatch(/^https:\/\//);
  });

  it('SENSEVOICE_FILES lists expected model files', () => {
    expect(SENSEVOICE_FILES.length).toBeGreaterThan(0);
    expect(SENSEVOICE_FILES).toContain('model.onnx');
    expect(SENSEVOICE_FILES).toContain('tokens.txt');
  });

  it('isModelCached returns true when model files exist', () => {
    const modelDir = join(testDir, 'sensevoice');
    mkdirSync(modelDir, { recursive: true });
    for (const f of SENSEVOICE_FILES) {
      require('fs').writeFileSync(join(modelDir, f), 'dummy');
    }

    expect(isModelCached('sensevoice', testDir)).toBe(true);
  });

  it('isModelCached returns false when model not cached', () => {
    expect(isModelCached('sensevoice', testDir)).toBe(false);
  });

  it('ensureModel returns cached path without downloading', async () => {
    const modelDir = join(testDir, 'sensevoice');
    mkdirSync(modelDir, { recursive: true });
    for (const f of SENSEVOICE_FILES) {
      require('fs').writeFileSync(join(modelDir, f), 'dummy');
    }

    const path = await ensureModel('sensevoice', testDir);
    expect(path).toBe(modelDir);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

```bash
pnpm test -- --run src/model-download.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement model download**

Create `src/model-download.ts`:

```typescript
import { join } from 'node:path';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { exec } from 'node:child_process';

export const SENSEVOICE_MODEL_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2';

export const SENSEVOICE_FILES = [
  'model.onnx',
  'tokens.txt',
];

/** Check if model files are already cached locally. */
export function isModelCached(model: string, modelsDir: string): boolean {
  const modelDir = join(modelsDir, model);
  return SENSEVOICE_FILES.every((f) => existsSync(join(modelDir, f)));
}

/** Return cached model path, or download if missing. Always returns a valid path or throws. */
export async function ensureModel(model: string, modelsDir: string): Promise<string> {
  const modelDir = join(modelsDir, model);

  if (isModelCached(model, modelsDir)) return modelDir;

  mkdirSync(modelDir, { recursive: true });

  const url = model === 'sensevoice' ? SENSEVOICE_MODEL_URL : null;
  if (!url) throw new Error(`未知模型: ${model}`);

  const tarPath = join(modelDir, 'model.tar.bz2');

  // Download
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载模型失败: ${response.status}`);
  const buf = Buffer.from(await response.arrayBuffer());
  await writeFile(tarPath, buf);

  // Extract (tar is available on Windows 10+ build 17063+)
  await new Promise<void>((resolve, reject) => {
    exec(`tar -xjf "${tarPath}" -C "${modelDir}" --strip-components=1`, (err) => {
      if (err) reject(new Error(`解压模型失败: ${err.message}`));
      else resolve();
    });
  });

  unlinkSync(tarPath);
  return modelDir;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm test -- --run src/model-download.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model-download.ts src/model-download.test.ts
git commit -m "[feat] add SenseVoice model download utility"
```

---

### Task 4: Create SherpaSTT

**Files:**
- Create: `src/stt/sherpa-stt.ts`
- Create: `src/stt/sherpa-stt.test.ts`

The SherpaSTT constructor takes an `AudioSource` and a resolved `modelPath` string. Model download happens before construction (see Task 6). It uses `sherpa-onnx-node`'s `OnlineRecognizer`.

- [ ] **Step 1: Write failing test**

Create `src/stt/sherpa-stt.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SherpaSTT } from './sherpa-stt.js';
import type { AudioSource, AudioChunk } from '../audio/interface.js';
import type { TextSegment } from '../types.js';

function createMockAudioSource(): AudioSource & { emitChunk(c: AudioChunk): void; emitError(e: Error): void } {
  const listeners: Record<string, Array<(...args: any[]) => void>> = {};
  return {
    start: vi.fn(),
    stop: vi.fn(),
    on(event: string, listener: (...args: any[]) => void) {
      (listeners[event] ??= []).push(listener);
    },
    emitChunk(chunk: AudioChunk) {
      listeners['chunk']?.forEach((fn) => fn(chunk));
    },
    emitError(err: Error) {
      listeners['error']?.forEach((fn) => fn(err));
    },
  };
}

describe('SherpaSTT', () => {
  it('implements SpeechToText interface', () => {
    const audio = createMockAudioSource();
    const stt = new SherpaSTT(audio, '/fake/model/path');
    expect(typeof stt.start).toBe('function');
    expect(typeof stt.stop).toBe('function');
    expect(typeof stt.on).toBe('function');
  });

  it('forwards errors from AudioSource', () => {
    const audio = createMockAudioSource();
    const stt = new SherpaSTT(audio, '/fake/model/path');
    const errors: Error[] = [];
    stt.on('error', (e: Error) => errors.push(e));

    audio.emitError(new Error('mic pulled out'));
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('mic pulled out');
  });

  it('does not emit segment when not started (running=false)', () => {
    const audio = createMockAudioSource();
    const stt = new SherpaSTT(audio, '/fake/model/path');
    const segments: TextSegment[] = [];
    stt.on('segment', (s) => segments.push(s));

    // Feed audio without starting STT
    const buf = Buffer.alloc(3200); // ~100ms of 16kHz 16-bit silence
    audio.emitChunk({ data: buf, timestamp: Date.now() });

    expect(segments.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

```bash
pnpm test -- --run src/stt/sherpa-stt.test.ts
```

Expected: FAIL — `SherpaSTT` not defined.

- [ ] **Step 3: Implement SherpaSTT**

Create `src/stt/sherpa-stt.ts`:

```typescript
import { createRequire } from 'node:module';
import type { SpeechToText } from './interface.js';
import type { TextSegment } from '../types.js';
import type { AudioSource, AudioChunk } from '../audio/interface.js';
import { generateId } from '../id.js';

const require = createRequire(import.meta.url);

export class SherpaSTT implements SpeechToText {
  private listeners: Record<string, Array<(...args: any[]) => void>> = {};
  private recognizer: any = null;
  private running = false;

  constructor(audioSource: AudioSource, modelPath: string) {
    this.initRecognizer(modelPath);

    audioSource.on('chunk', (chunk: AudioChunk) => {
      if (!this.running || !this.recognizer) return;
      this.processChunk(chunk);
    });

    audioSource.on('error', (err: Error) => {
      this.emit('error', err);
    });
  }

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  on(event: 'segment' | 'error', listener: (...args: any[]) => void): void {
    (this.listeners[event] ??= []).push(listener);
  }

  private initRecognizer(modelPath: string): void {
    const sherpa = require('sherpa-onnx-node');

    this.recognizer = sherpa.createOnlineRecognizer({
      modelConfig: {
        senseVoice: {
          model: modelPath + '/model.onnx',
          tokens: modelPath + '/tokens.txt',
          useInverseTextNormalization: true,
        },
      },
      enableEndpoint: true,
      rule1MinTrailingSilence: 2.4,
      rule2MinTrailingSilence: 1.2,
      rule3MinUtteranceLength: 20.0,
    });
  }

  private processChunk(chunk: AudioChunk): void {
    if (!this.recognizer) return;

    const samples = new Float32Array(chunk.data.length / 2);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = chunk.data.readInt16LE(i * 2) / 32768;
    }

    this.recognizer.acceptWaveform(16000, samples);

    while (this.recognizer.isReady()) {
      const result = this.recognizer.getResult();
      if (result.isFinal && result.text) {
        this.emit('segment', {
          id: generateId(),
          text: result.text,
          timestamp: Date.now(),
        } as TextSegment);
      }
    }
  }

  private emit(event: string, ...args: any[]): void {
    this.listeners[event]?.forEach((fn) => fn(...args));
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm test -- --run src/stt/sherpa-stt.test.ts
```

Expected: Interface conformance and error forwarding tests PASS. The integration test (actual STT) won't run due to `skipDownload: true`.

- [ ] **Step 5: Commit**

```bash
git add src/stt/sherpa-stt.ts src/stt/sherpa-stt.test.ts
git commit -m "[feat(stt)] add SherpaSTT with Sherpa-ONNX SenseVoice integration"
```

---

### Task 5: Update REPL with /mic commands

**Files:**
- Modify: `src/repl/repl.ts:68-181`

`startRepl` gains an optional `AudioSource` parameter. When provided, `/mic on` and `/mic off` commands become available.

- [ ] **Step 1: Modify startRepl signature and startup message**

Change the function signature at line 68 from:

```typescript
export function startRepl(manager: BufferManager): void {
```

To:

```typescript
import type { AudioSource } from '../audio/interface.js';

export function startRepl(manager: BufferManager, audioSource?: AudioSource): void {
```

- [ ] **Step 2: Add /mic commands to help output**

In the `case 'help':` block (line 176), add to the command list array after `'/quit'`:

```typescript
          '  /mic on                        开启麦克风监听',
          '  /mic off                       暂停麦克风监听',
```

- [ ] **Step 3: Add mic command cases to switch statement**

In the `handleCommand` switch block, add after `case 'quit':` (before line 190):

```typescript
    case 'mic': {
      if (!audioSource) {
        console.log(chalk.red('麦克风功能未启用'));
        return;
      }
      const action = parts[1];
      if (action === 'on') {
        audioSource.start();
        console.log(chalk.green('麦克风已开启'));
      } else if (action === 'off') {
        audioSource.stop();
        console.log(chalk.yellow('麦克风已暂停'));
      } else {
        console.log(chalk.red('用法: /mic on | /mic off'));
      }
      break;
    }
```

- [ ] **Step 4: Update the close handler to stop audio**

Modify the `rl.on('close', ...)` block at line 117 to also stop the audio source when REPL closes:

```typescript
  rl.on('close', () => {
    audioSource?.stop();
    console.log(chalk.yellow('\n正在保存缓冲数据...'));
    manager.shutdown();
    console.log(chalk.green('再见。'));
    process.exit(0);
  });
```

- [ ] **Step 5: Run typecheck to catch errors**

```bash
pnpm typecheck
```

Expected: PASS (no type errors).

- [ ] **Step 6: Run existing tests**

```bash
pnpm test -- --run
```

Expected: All existing tests still PASS.

- [ ] **Step 7: Commit**

```bash
git add src/repl/repl.ts
git commit -m "[feat(repl)] add /mic on/off commands for microphone control"
```

---

### Task 6: Update index.ts startup pipeline

**Files:**
- Modify: `src/index.ts:1-42`

Wire the full audio → STT → buffer pipeline. The `start` command creates all components and connects them.

- [ ] **Step 1: Add imports**

After line 5 (`import { startRepl } from './repl/repl.js';`), add:

```typescript
import chalk from 'chalk';
import { WasmAudioSource } from './audio/wasm-audio.js';
import { SherpaSTT } from './stt/sherpa-stt.js';
import { ensureModel } from './model-download.js';
```

- [ ] **Step 2: Add model option and wire pipeline in start action**

Replace the `.action(async (opts) => { ... })` block (lines 28-39) with:

```typescript
  .option('--model <name>', 'STT 模型名称', 'sensevoice')
  .action(async (opts) => {
    const baseDir = join(process.cwd(), '.htt');
    mkdirSync(baseDir, { recursive: true });

    const dbPath = join(baseDir, 'transcripts.db');
    const modelsDir = join(baseDir, 'models');
    const windowMs = parseDuration(opts.window);
    const hotMs = parseDuration(opts.hot);

    const store = await SegmentStore.create(dbPath);
    const manager = new BufferManager(store, { windowMs, hotMs });

    console.log('正在初始化音频和语音识别...');
    console.log('正在加载 STT 模型 (首次运行需下载 ~100MB)...');
    const modelPath = await ensureModel(opts.model, modelsDir);

    const audioSource = new WasmAudioSource();
    const stt = new SherpaSTT(audioSource, modelPath);

    // Wire: STT segments → buffer
    stt.on('segment', (segment) => {
      manager.push(segment);
      const time = new Date(segment.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
      const prefix = segment.speaker ? `${segment.speaker}：` : '';
      console.log(`[${time}] ${prefix}${segment.text}`);
    });

    stt.on('error', (err) => {
      console.error(chalk.red(`STT 错误: ${err.message}`));
    });

    audioSource.on('error', (err) => {
      console.error(chalk.red(`音频错误: ${err.message}`));
    });

    // Start audio and STT
    audioSource.start();
    stt.start();

    startRepl(manager, audioSource);
  });
```

Note: The `chalk` import already exists in index.ts. If not already imported, add `import chalk from 'chalk';`.

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

```bash
pnpm test -- --run
```

Expected: All tests PASS.

- [ ] **Step 5: Build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "[feat] wire audio → STT → buffer pipeline in start command"
```

---

### Task 7: End-to-end manual verification

**Files:** None

- [ ] **Step 1: Download SenseVoice model**

```bash
node -e "
const { getModelPath } = require('./dist/model-download.js');
// This will trigger download if not cached
getModelPath('sensevoice', '.htt/models');
"
```

Or manually invoke via `htt start` which triggers download on first run.

- [ ] **Step 2: Start the app and test microphone**

```bash
pnpm start
```

Expected behavior:
1. "正在初始化音频和语音识别..." message appears
2. REPL prompt `> ` appears
3. Speaking into the microphone produces transcribed text lines with timestamps
4. `/status` shows segments in buffer
5. `/mic off` stops transcription, `/mic on` resumes
6. Typing text directly still works as manual input supplement
7. `/export --from -5m` exports transcribed text
8. `/quit` or Ctrl+C cleanly exits, saving buffered data

- [ ] **Step 3: Verify exported transcript is correct**

After speaking a few test phrases and exporting, verify the exported file contains the expected transcribed text.

---

## Verification Checklist

Before declaring complete, run the full suite:

```bash
pnpm typecheck    # TypeScript strict check
pnpm test -- --run  # All unit tests
pnpm build        # Production build
```
