import type { AudioSource, AudioChunk } from './interface.js';

export interface WasmAudioOptions {
  deviceId?: number;
  sampleRate?: number;
  channelCount?: number;
}

// Minimal stub — replaced by Task 2 when naudiodon is available.
export class WasmAudioSource implements AudioSource {
  private listeners: Record<string, Array<(...args: any[]) => void>> = {};

  constructor(_opts: WasmAudioOptions = {}) {}

  start(): void {
    this.emit('error', new Error('naudiodon 尚未编译，麦克风不可用'));
  }

  stop(): void {}

  on(event: 'chunk' | 'error', listener: (...args: any[]) => void): void {
    (this.listeners[event] ??= []).push(listener);
  }

  private emit(event: string, ...args: any[]): void {
    this.listeners[event]?.forEach((fn) => fn(...args));
  }
}
