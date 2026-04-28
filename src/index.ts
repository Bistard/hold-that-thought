#!/usr/bin/env node
import { Command } from 'commander';
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
  .name('htt')
  .description('Hold That Thought — 本地优先实时转录缓冲工具')
  .version('0.1.0');

program
  .command('start')
  .description('启动转录监听')
  .option('--window <duration>', '滚动窗口时长', '8h')
  .option('--hot <duration>', '热缓冲时长', '30m')
  .action(async (opts) => {
    const dataDir = join(homedir(), '.htt');
    mkdirSync(dataDir, { recursive: true });
    const dbPath = join(dataDir, 'transcripts.db');

    const windowMs = parseDuration(opts.window);
    const hotMs = parseDuration(opts.hot);

    const store = await SegmentStore.create(dbPath);
    const manager = new BufferManager(store, { windowMs, hotMs });

    startRepl(manager);
  });

program.parse();
