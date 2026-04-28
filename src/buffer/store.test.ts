import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SegmentStore } from './store.js';

const TEST_DB = ':memory:';

describe('SegmentStore', () => {
  let store: SegmentStore;

  beforeEach(async () => {
    store = await SegmentStore.create(TEST_DB);
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
