import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ensureModel, isModelCached, ZIPFORMER_MODEL_URL, ZIPFORMER_FILES } from './model-download.js';

describe('model-download', () => {
  const testDir = join(process.cwd(), '.htt', 'test-models');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('ZIPFORMER_MODEL_URL is a valid URL string', () => {
    expect(ZIPFORMER_MODEL_URL).toMatch(/^https:\/\//);
  });

  it('ZIPFORMER_FILES lists expected model files', () => {
    expect(ZIPFORMER_FILES.length).toBeGreaterThan(0);
    expect(ZIPFORMER_FILES).toContain('model.onnx');
    expect(ZIPFORMER_FILES).toContain('tokens.txt');
  });

  it('isModelCached returns true when model files exist', () => {
    const modelDir = join(testDir, 'zipformer-zh-small');
    mkdirSync(modelDir, { recursive: true });
    for (const f of ZIPFORMER_FILES) {
      writeFileSync(join(modelDir, f), 'dummy');
    }

    expect(isModelCached('zipformer-zh-small', testDir)).toBe(true);
  });

  it('isModelCached returns false when model not cached', () => {
    expect(isModelCached('zipformer-zh-small', testDir)).toBe(false);
  });

  it('isModelCached returns false when only partial files cached', () => {
    const modelDir = join(testDir, 'zipformer-zh-small');
    mkdirSync(modelDir, { recursive: true });
    // Only create one of the expected files
    writeFileSync(join(modelDir, ZIPFORMER_FILES[0]), 'dummy');

    expect(isModelCached('zipformer-zh-small', testDir)).toBe(false);
  });

  it('ensureModel returns cached path without downloading', async () => {
    const modelDir = join(testDir, 'zipformer-zh-small');
    mkdirSync(modelDir, { recursive: true });
    for (const f of ZIPFORMER_FILES) {
      writeFileSync(join(modelDir, f), 'dummy');
    }

    const path = await ensureModel('zipformer-zh-small', testDir);
    expect(path).toBe(modelDir);
  });

  it('ensureModel with unknown model name throws', async () => {
    await expect(ensureModel('unknown-model', testDir)).rejects.toThrow();
  });

  it('ensureModel rejects path traversal model names', async () => {
    await expect(ensureModel('../../../etc', testDir)).rejects.toThrow('非法模型名称');
  });
});
