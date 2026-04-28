import type { TextSegment } from '../types.js';

export interface SpeechToText {
  start(): void;
  stop(): void;
  on(event: 'segment', listener: (segment: TextSegment) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
}
