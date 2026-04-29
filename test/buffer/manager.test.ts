import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BufferManager } from '../../src/buffer/manager.js';
import { SegmentStore } from '../../src/buffer/store.js';

describe('BufferManager', () => {
	let manager: BufferManager;
	let store: SegmentStore;

	beforeEach(async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-27T14:00:00Z'));
		store = await SegmentStore.create(':memory:');
		manager = new BufferManager(store, { windowMs: 8 * 60 * 60 * 1000, hotMs: 30 * 60 * 1000 });
	});

	afterEach(() => {
		manager.shutdown();
		store.close();
		vi.useRealTimers();
	});

	function makeSeg(text: string, offsetMs: number): import('../../src/types.js').TextSegment {
		return {
			id: text + offsetMs,
			text,
			timestamp: Date.now() + offsetMs,
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
		const now = Date.now();
		// Directly write to store to simulate archived data
		store.insertBatch([makeSeg('old', -60_000)]);
		// Push to hot buffer
		manager.push(makeSeg('recent', -1000));

		const results = manager.query(now - 120_000, now + 1000);
		expect(results).toHaveLength(2);
		expect(results[0].text).toBe('old');
		expect(results[1].text).toBe('recent');
	});

	it('flushes old segments from hot buffer to store after hotMs threshold', () => {
		const now = Date.now();
		// Push an old segment (31 minutes ago)
		manager.push(makeSeg('old', -31 * 60_000));

		// Push a new segment to trigger flush check
		manager.push(makeSeg('new', 0));

		// New data should be in hot buffer
		const hot = manager.query(now - 1000, now + 1000);
		expect(hot).toHaveLength(1);
		expect(hot[0].text).toBe('new');

		// Old data should be in store
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
