#!/usr/bin/env node
import { Command } from 'commander';
import { SegmentStore } from './buffer/store.js';
import { BufferManager } from './buffer/manager.js';
import { startRepl } from './repl/repl.js';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import chalk from 'chalk';
import { WasmAudioSource } from './audio/wasm-audio.js';
import { SherpaSTT } from './stt/sherpa-stt.js';
import { ensureModel } from './model-download.js';

function parseDuration(s: string): number {
  const match = s.match(/^(\d+)(h|m)$/);
  if (!match) throw new Error(`无法解析时长: ${s}`);
  const val = parseInt(match[1]);
  return match[2] === 'h' ? val * 3600_000 : val * 60_000;
}

const program = new Command();

program
  .name('htt')
  .description('Hold That Thought — 本地优先实时转录缓冲工具')
  .version('0.1.0');

program
  .command('start')
  .description('启动转录监听')
  .option('--window <duration>', '滚动窗口时长', '8h')
  .option('--hot <duration>', '热缓冲时长', '30m')
  .option('--model <name>', 'STT 模型名称', 'zipformer-zh-small')
  .action(async (opts) => {
    let manager: BufferManager | undefined;
    try {
      const baseDir = join(process.cwd(), '.htt');
      mkdirSync(baseDir, { recursive: true });

      const dbPath = join(baseDir, 'transcripts.db');
      const modelsDir = join(baseDir, 'models');
      const windowMs = parseDuration(opts.window);
      const hotMs = parseDuration(opts.hot);

      const store = await SegmentStore.create(dbPath);
      manager = new BufferManager(store, { windowMs, hotMs });

      console.log(chalk.dim('正在初始化音频和语音识别...'));
      console.log(chalk.dim('正在加载 STT 模型 (首次运行需下载 ~100MB)...'));
      const modelPath = await ensureModel(opts.model, modelsDir);

      const audioSource = new WasmAudioSource();
      const stt = new SherpaSTT(audioSource, modelPath);

      // Wire: STT segments → buffer
      stt.on('segment', (segment) => {
        manager!.push(segment);
        const time = new Date(segment.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
        const prefix = segment.speaker ? `${segment.speaker}：` : '';
        console.log(`[${time}] ${prefix}${segment.text}`);
      });

      stt.on('error', (err) => {
        console.error(chalk.red(`STT 错误: ${err.message}`));
      });

      // Start audio and STT
      audioSource.start();
      stt.start();

      startRepl(manager!, audioSource);
    } catch (err) {
      if (manager) manager.shutdown();
      console.error(chalk.red(`启动失败: ${(err as Error).message}`));
      process.exit(1);
    }
  });

program.parse();
