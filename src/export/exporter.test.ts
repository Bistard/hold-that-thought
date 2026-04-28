import { describe, it, expect } from 'vitest';
import { exportTranscript } from './exporter.js';
import type { TextSegment } from '../types.js';

const SEG_A: TextSegment = { id: '1', text: '大家好', timestamp: 1745760000000, speaker: '张' };
const SEG_B: TextSegment = { id: '2', text: '今天讨论项目进度', timestamp: 1745760005000 };
const SEG_C: TextSegment = { id: '3', text: '好的，我先汇报', timestamp: 1745760010000, speaker: '李' };
const sample = [SEG_A, SEG_B, SEG_C];

describe('exportTranscript', () => {
  it('exports to txt format with timestamps', () => {
    const result = exportTranscript(sample, { format: 'txt', from: 0, to: Date.now() });
    expect(result).toContain('21:20:00');
    expect(result).toContain('张：大家好');
    expect(result).toContain('21:20:05');
    expect(result).toContain('今天讨论项目进度');
    expect(result).toContain('21:20:10');
    expect(result).toContain('李：好的，我先汇报');
  });

  it('exports to markdown format', () => {
    const result = exportTranscript(sample, { format: 'md', from: 0, to: Date.now() });
    expect(result).toContain('## 转录导出');
    expect(result).toContain('**张**');
    expect(result).toContain('大家好');
  });

  it('returns empty string for empty segments', () => {
    const result = exportTranscript([], { format: 'txt', from: 0, to: Date.now() });
    expect(result).toBe('');
  });

  it('txt includes date in header', () => {
    const result = exportTranscript(sample, { format: 'txt', from: 1745760000000, to: 1745760100000 });
    expect(result).toContain('2025/4/27');
  });
});
