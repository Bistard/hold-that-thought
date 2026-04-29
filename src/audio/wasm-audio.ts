import { spawn, type ChildProcess } from 'node:child_process';
import type { AudioSource, AudioChunk } from './interface.js';

export interface WasmAudioOptions {
  /** ffmpeg dshow audio device name. Use "default" for system default mic. */
  deviceName?: string;
  sampleRate?: number;
  channelCount?: number;
}

export class WasmAudioSource implements AudioSource {
  private listeners: Record<string, Array<(...args: any[]) => void>> = {};
  private ffmpeg: ChildProcess | null = null;
  private stopping = false;
  private opts: WasmAudioOptions;

  constructor(opts: WasmAudioOptions = {}) {
    this.opts = {
      deviceName: opts.deviceName ?? 'default',
      sampleRate: opts.sampleRate ?? 16000,
      channelCount: opts.channelCount ?? 1,
    };
  }

  start(): void {
    if (this.ffmpeg) return; // already started
    this.stopping = false;

    const args = [
      '-f', 'dshow',
      '-i', `audio=${this.opts.deviceName}`,
      '-ac', String(this.opts.channelCount),
      '-ar', String(this.opts.sampleRate),
      '-f', 's16le',
      'pipe:1',
    ];

    try {
      this.ffmpeg = spawn('ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (err) {
      this.emit('error', new Error(`ffmpeg 未找到: ${(err as Error).message}`));
      return;
    }

    this.ffmpeg.stdout!.on('data', (buf: Buffer) => {
      this.emit('chunk', {
        data: buf,
        timestamp: Date.now(),
      });
    });

    this.ffmpeg.on('error', (err) => {
      this.emit('error', new Error(`ffmpeg 启动失败: ${err.message}`));
    });

    this.ffmpeg.on('exit', (code) => {
      if (this.stopping) {
        this.stopping = false;
        this.ffmpeg = null;
        return;
      }
      if (code !== 0 && code !== null) {
        this.emit('error', new Error(`ffmpeg 异常退出 (code ${code})`));
      }
      this.ffmpeg = null;
    });
  }

  stop(): void {
    if (!this.ffmpeg) return;
    this.ffmpeg.stdout?.removeAllListeners();
    this.ffmpeg.removeAllListeners();
    this.stopping = true;
    this.ffmpeg.kill();
    this.ffmpeg = null;
  }

  on(event: 'chunk' | 'error', listener: (...args: any[]) => void): void {
    (this.listeners[event] ??= []).push(listener);
  }

  private emit(event: string, ...args: any[]): void {
    this.listeners[event]?.forEach((fn) => fn(...args));
  }
}
