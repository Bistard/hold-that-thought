export interface Summarizer {
  summarize(text: string): Promise<string>;
}
