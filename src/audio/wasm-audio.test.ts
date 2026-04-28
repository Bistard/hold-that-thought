import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WasmAudioSource } from './wasm-audio.js';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { AudioChunk } from './interface.js';

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
});
