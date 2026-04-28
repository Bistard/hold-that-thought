import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ensureModel, isModelCached, SENSEVOICE_MODEL_URL, SENSEVOICE_FILES } from './model-download.js';

describe('model-download', () => {
  const testDir = join(process.cwd(), '.htt', 'test-models');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('SENSEVOICE_MODEL_URL is a valid URL string', () => {
    expect(SENSEVOICE_MODEL_URL).toMatch(/^https:\/\//);
  });

  it('SENSEVOICE_FILES lists expected model files', () => {
    expect(SENSEVOICE_FILES.length).toBeGreaterThan(0);
    expect(SENSEVOICE_FILES).toContain('model.onnx');
    expect(SENSEVOICE_FILES).toContain('tokens.txt');
  });

  it('isModelCached returns true when model files exist', () => {
    const modelDir = join(testDir, 'sensevoice');
    mkdirSync(modelDir, { recursive: true });
    for (const f of SENSEVOICE_FILES) {
      writeFileSync(join(modelDir, f), 'dummy');
    }

    expect(isModelCached('sensevoice', testDir)).toBe(true);
  });

  it('isModelCached returns false when model not cached', () => {
    expect(isModelCached('sensevoice', testDir)).toBe(false);
  });

  it('ensureModel returns cached path without downloading', async () => {
    const modelDir = join(testDir, 'sensevoice');
    mkdirSync(modelDir, { recursive: true });
    for (const f of SENSEVOICE_FILES) {
      writeFileSync(join(modelDir, f), 'dummy');
    }

    const path = await ensureModel('sensevoice', testDir);
    expect(path).toBe(modelDir);
  });
});
