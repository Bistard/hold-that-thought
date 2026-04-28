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
