import type { TextSegment } from '../types.js';
import type { SegmentStore } from './store.js';

export interface TimeRange {
  min: number;
  max: number;
}

export interface BufferOptions {
  windowMs: number;
  hotMs: number;
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

    // Merge and deduplicate (hot buffer takes precedence over DB for same id)
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
      this.store.save();
    }
  }

  private flushAll(): void {
    if (this.hot.length > 0) {
      this.store.insertBatch(this.hot);
      this.hot = [];
      this.store.save();
    }
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.options.windowMs;
    this.store.deleteOlderThan(cutoff);
    this.store.save();
  }
}
