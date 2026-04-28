import * as readline from 'node:readline';
import { writeFileSync } from 'node:fs';
import { generateId } from '../id.js';
import { BufferManager } from '../buffer/manager.js';
import { exportTranscript } from '../export/exporter.js';
import type { TextSegment } from '../types.js';
import chalk from 'chalk';

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false });
}

function parseTime(input: string): number {
  const relMatch = input.match(/^([+-])(\d+)(h|m)(?:(\d+)m)?$/);
  if (relMatch) {
    let ms = 0;
    if (relMatch[3] === 'h') ms += parseInt(relMatch[2]) * 3600_000;
    else ms += parseInt(relMatch[2]) * 60_000;
    if (relMatch[4]) ms += parseInt(relMatch[4]) * 60_000;
    const sign = relMatch[1] === '-' ? -1 : 1;
    return Date.now() + sign * ms;
  }

  const timeMatch = input.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const d = new Date();
    d.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
    return d.getTime();
  }

  const ampmMatch = input.match(/^(\d{1,2})(am|pm)$/i);
  if (ampmMatch) {
    const d = new Date();
    let h = parseInt(ampmMatch[1]);
    if (ampmMatch[2].toLowerCase() === 'pm' && h !== 12) h += 12;
    if (ampmMatch[2].toLowerCase() === 'am' && h === 12) h = 0;
    d.setHours(h, 0, 0, 0);
    return d.getTime();
  }

  const fullMatch = input.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (fullMatch) {
    return new Date(`${fullMatch[1]}T${fullMatch[2].padStart(2, '0')}:${fullMatch[3]}:00`).getTime();
  }

  throw new Error(`无法解析时间: ${input}`);
}

function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
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

export function startRepl(manager: BufferManager): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  console.log(chalk.dim('Hold That Thought — 实时转录缓冲已启动'));
  console.log(chalk.dim('直接输入文本作为转录内容，以 / 开头为命令，输入 /help 查看帮助'));
  console.log(chalk.dim('Ctrl+C 退出'));
  console.log('');

  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed.startsWith('/')) {
      handleCommand(trimmed, manager, rl);
    } else {
      // Treat as transcript input
      const segment: TextSegment = {
        id: generateId(),
        text: trimmed,
        timestamp: Date.now(),
      };

      // Parse "speaker：text" pattern
      const speakerMatch = trimmed.match(/^(.+?)：(.+)/);
      if (speakerMatch) {
        segment.speaker = speakerMatch[1];
        segment.text = speakerMatch[2];
      }

      manager.push(segment);
      const time = formatTime(segment.timestamp);
      const prefix = segment.speaker ? `${segment.speaker}：` : '';
      console.log(`[${time}] ${prefix}${segment.text}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.yellow('\n正在保存缓冲数据...'));
    manager.shutdown();
    console.log(chalk.green('再见。'));
    process.exit(0);
  });

  rl.prompt();
}

function handleCommand(input: string, manager: BufferManager, rl: readline.Interface): void {
  const parts = input.slice(1).split(/\s+/);
  const cmd = parts[0];

  switch (cmd) {
    case 'export': {
      const args = parseArgs(parts.slice(1));
      const now = Date.now();
      const from = args.from ? parseTime(args.from) : now - 30 * 60_000;
      const to = args.to ? parseTime(args.to) : now;

      if (from > to) {
        console.log(chalk.red('错误: --from 不能晚于 --to'));
        return;
      }

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
      const range = manager.getTimeRange();
      const dbStr = range
        ? `${formatTime(range.min)} ~ ${formatTime(range.max)}`
        : '空';
      const coverage = range ? formatDuration(range.max - range.min) : '0m';
      console.log(`热缓冲: ${hot} 条 | DB: ${dbStr} | 覆盖 ${coverage}`);
      break;
    }
    case 'help':
      console.log(
        [
          '可用命令:',
          '  /export --from <time> --to <time> [--format txt|md] [--output <path>]',
          '  /status                        查看缓冲状态',
          '  /help                          显示帮助',
          '  /quit                          退出',
          '',
          '时间格式: 14:00 | -30m | -1h | 10am | 3pm | "2026-04-27 14:30"',
        ].join('\n'),
      );
      break;
    case 'quit':
      rl.close();
      break;
    default:
      console.log(chalk.red(`未知命令: /${cmd}，输入 /help 查看可用命令`));
  }
}
