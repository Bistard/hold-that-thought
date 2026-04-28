export interface AudioChunk {
  data: Buffer;
  timestamp: number;
}

export interface AudioSource {
  start(): void;
  stop(): void;
  on(event: 'chunk', listener: (chunk: AudioChunk) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
}
