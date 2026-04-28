import { createRequire } from 'node:module';
import type { SpeechToText } from './interface.js';
import type { TextSegment } from '../types.js';
import type { AudioSource, AudioChunk } from '../audio/interface.js';
import { generateId } from '../id.js';

const require = createRequire(import.meta.url);

export class SherpaSTT implements SpeechToText {
  private listeners: Record<string, Array<(...args: any[]) => void>> = {};
  private recognizer: any = null;
  private stream: any = null;
  private running = false;

  constructor(audioSource: AudioSource, modelPath: string) {
    this.initRecognizer(modelPath);

    audioSource.on('chunk', (chunk: AudioChunk) => {
      if (!this.running || !this.recognizer || !this.stream) return;
      this.processChunk(chunk);
    });

    audioSource.on('error', (err: Error) => {
      this.emit('error', err);
    });
  }

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  on(event: 'segment' | 'error', listener: (...args: any[]) => void): void {
    (this.listeners[event] ??= []).push(listener);
  }

  private initRecognizer(modelPath: string): void {
    try {
      const sherpa = require('sherpa-onnx-node');

      this.recognizer = new sherpa.OnlineRecognizer({
        modelConfig: {
          senseVoice: {
            model: modelPath + '/model.onnx',
            tokens: modelPath + '/tokens.txt',
            useInverseTextNormalization: true,
          },
        },
        enableEndpoint: true,
        rule1MinTrailingSilence: 2.4,
        rule2MinTrailingSilence: 1.2,
        rule3MinUtteranceLength: 20.0,
      });

      this.stream = this.recognizer.createStream();
    } catch (err) {
      // Model files not available — recognizer stays null.
      // start/stop/on still work; segments just won't be emitted.
      this.emit('error', err as Error);
    }
  }

  private processChunk(chunk: AudioChunk): void {
    const buf = chunk.data;
    const samples = new Float32Array(buf.length / 2);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = buf.readInt16LE(i * 2) / 32768;
    }

    this.stream.acceptWaveform({ samples, sampleRate: 16000 });

    while (this.recognizer.isReady(this.stream)) {
      this.recognizer.decode(this.stream);
      const result = this.recognizer.getResult(this.stream);
      if (result.is_final && result.text) {
        this.emit('segment', {
          id: generateId(),
          text: result.text,
          timestamp: Date.now(),
        } as TextSegment);
      }
      this.recognizer.reset(this.stream);
    }
  }

  private emit(event: string, ...args: any[]): void {
    this.listeners[event]?.forEach((fn) => fn(...args));
  }
}
