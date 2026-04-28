export interface TextSegment {
  id: string;
  text: string;
  timestamp: number; // UTC milliseconds
  speaker?: string;
}

export interface ExportOptions {
  format: 'txt' | 'md';
  from: number;
  to: number;
}
