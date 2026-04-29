import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WasmAudioSource } from '../../src/audio/wasm-audio.js';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { AudioChunk } from '../../src/audio/interface.js';

vi.mock('node:child_process');

function mockSpawn(): { stdout: EventEmitter; stderr: EventEmitter; proc: EventEmitter & { kill: ReturnType<typeof vi.fn> } } {
	const stdout = new EventEmitter();
	const stderr = new EventEmitter();
	const proc = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
	proc.kill = vi.fn();
	Object.assign(proc, { stdout, stderr });
	return { stdout, stderr, proc };
}

describe('WasmAudioSource', () => {
	let audio: WasmAudioSource;

	beforeEach(() => {
		vi.clearAllMocks();
		audio = new WasmAudioSource();
	});

	afterEach(() => {
		audio.stop();
	});

	it('implements AudioSource interface', () => {
		expect(typeof audio.start).toBe('function');
		expect(typeof audio.stop).toBe('function');
		expect(typeof audio.on).toBe('function');
	});

	it('spawns ffmpeg with correct arguments on start', () => {
		const { proc } = mockSpawn();
		(proc.stdout as EventEmitter).on = vi.fn();
		proc.on = vi.fn();
		vi.mocked(spawn).mockReturnValue(proc as any);

		audio.start();

		expect(spawn).toHaveBeenCalledWith('ffmpeg', [
			'-f', 'dshow',
			'-i', 'audio=default',
			'-ac', '1',
			'-ar', '16000',
			'-f', 's16le',
			'pipe:1',
		], expect.any(Object));
	});

	it('emits chunk events when ffmpeg outputs data', () => {
		const { stdout, proc } = mockSpawn();
		Object.assign(proc, { stdout });
		vi.mocked(spawn).mockReturnValue(proc as any);

		const chunks: AudioChunk[] = [];
		audio.on('chunk', (c: AudioChunk) => chunks.push(c));

		audio.start();
		stdout.emit('data', Buffer.from([0x00, 0x00, 0xff, 0x7f])); // 1 sample of silence
		stdout.emit('data', Buffer.alloc(3200));

		expect(chunks.length).toBe(2);
		expect(chunks[0].data.length).toBe(4);
		expect(typeof chunks[0].timestamp).toBe('number');
	});

	it('emits error when ffmpeg exits with non-zero code', () => {
		const { proc, stdout } = mockSpawn();
		Object.assign(proc, { stdout });
		vi.mocked(spawn).mockReturnValue(proc as any);

		const errors: Error[] = [];
		audio.on('error', (e: Error) => errors.push(e));

		audio.start();
		proc.emit('exit', 1);

		expect(errors.length).toBe(1);
		expect(errors[0].message).toContain('ffmpeg 异常退出');
	});

	it('stop() kills ffmpeg and is idempotent', () => {
		const { proc, stdout } = mockSpawn();
		const mockKill = vi.fn();
		Object.assign(proc, { stdout, kill: mockKill });
		vi.mocked(spawn).mockReturnValue(proc as any);

		audio.start();
		expect(mockKill).not.toHaveBeenCalled();

		audio.stop();
		expect(mockKill).toHaveBeenCalled();

		// Idempotent: second stop does nothing
		expect(() => audio.stop()).not.toThrow();
	});

	it('start() is idempotent', () => {
		const { proc, stdout } = mockSpawn();
		Object.assign(proc, { stdout });
		proc.on = vi.fn();
		vi.mocked(spawn).mockReturnValue(proc as any);

		audio.start();
		audio.start(); // second call should be no-op

		expect(spawn).toHaveBeenCalledTimes(1);
	});

	it('emits error when ffmpeg spawn throws (ENOENT)', () => {
		vi.mocked(spawn).mockImplementation(() => {
			const err = new Error('spawn ffmpeg ENOENT');
			(err as any).code = 'ENOENT';
			throw err;
		});

		const errors: Error[] = [];
		audio.on('error', (e: Error) => errors.push(e));

		audio.start();

		expect(errors.length).toBe(1);
		expect(errors[0].message).toContain('ffmpeg 未找到');
	});

	it('does not emit error on clean exit (code 0)', () => {
		const { proc, stdout } = mockSpawn();
		Object.assign(proc, { stdout });
		vi.mocked(spawn).mockReturnValue(proc as any);

		const errors: Error[] = [];
		audio.on('error', (e: Error) => errors.push(e));

		audio.start();
		proc.emit('exit', 0);

		expect(errors.length).toBe(0);
	});

	it('stop/start cycle does not leak listeners or duplicate spawns', () => {
		const { proc, stdout } = mockSpawn();
		Object.assign(proc, { stdout });
		proc.on = vi.fn();
		vi.mocked(spawn).mockReturnValue(proc as any);

		// Cycle 1: start then stop
		audio.start();
		expect(spawn).toHaveBeenCalledTimes(1);
		audio.stop();
		expect(proc.kill).toHaveBeenCalledTimes(1);

		// Cycle 2: start again (should spawn a new proc)
		const { proc: proc2, stdout: stdout2 } = mockSpawn();
		Object.assign(proc2, { stdout: stdout2 });
		proc2.on = vi.fn();
		vi.mocked(spawn).mockReturnValue(proc2 as any);

		audio.start();
		expect(spawn).toHaveBeenCalledTimes(2);
		audio.stop();
		expect(proc2.kill).toHaveBeenCalledTimes(1);
	});
});
