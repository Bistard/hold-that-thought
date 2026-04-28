import { describe, it, expect, vi } from 'vitest';
import { SherpaSTT } from './sherpa-stt.js';
import type { AudioSource, AudioChunk } from '../audio/interface.js';
import type { TextSegment } from '../types.js';

function createMockAudioSource(): AudioSource & { emitChunk(c: AudioChunk): void; emitError(e: Error): void } {
  const listeners: Record<string, Array<(...args: any[]) => void>> = {};
  return {
    start: vi.fn(),
    stop: vi.fn(),
    on(event: string, listener: (...args: any[]) => void) {
      (listeners[event] ??= []).push(listener);
    },
    emitChunk(chunk: AudioChunk) {
      listeners['chunk']?.forEach((fn) => fn(chunk));
    },
    emitError(err: Error) {
      listeners['error']?.forEach((fn) => fn(err));
    },
  };
}

describe('SherpaSTT', () => {
  it('implements SpeechToText interface', () => {
    const audio = createMockAudioSource();
    const stt = new SherpaSTT(audio, '/fake/model/path');
    expect(typeof stt.start).toBe('function');
    expect(typeof stt.stop).toBe('function');
    expect(typeof stt.on).toBe('function');
  });

  it('forwards errors from AudioSource', () => {
    const audio = createMockAudioSource();
    const stt = new SherpaSTT(audio, '/fake/model/path');
    const errors: Error[] = [];
    stt.on('error', (e: Error) => errors.push(e));

    audio.emitError(new Error('mic pulled out'));
    // initRecognizer may have already emitted an init error; forwarded error is last
    expect(errors.length).toBeGreaterThanOrEqual(1);
    const forwarded = errors.find((e) => e.message === 'mic pulled out');
    expect(forwarded).toBeDefined();
  });

  it('emits error when model files are not found', () => {
    const audio = createMockAudioSource();
    const errors: Error[] = [];
    const stt = new SherpaSTT(audio, '/nonexistent/model/path');
    stt.on('error', (e: Error) => errors.push(e));

    // initRecognizer runs synchronously in constructor, so errors should already be emitted
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBeTruthy();
  });

  it('does not emit segment when not started (running=false)', () => {
    const audio = createMockAudioSource();
    const stt = new SherpaSTT(audio, '/fake/model/path');
    const segments: TextSegment[] = [];
    stt.on('segment', (s) => segments.push(s));

    // Feed audio without starting STT
    const buf = Buffer.alloc(3200); // ~100ms of 16kHz 16-bit silence
    audio.emitChunk({ data: buf, timestamp: Date.now() });

    expect(segments.length).toBe(0);
  });
});
