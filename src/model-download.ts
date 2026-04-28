import { join } from 'node:path';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { exec } from 'node:child_process';

export const SENSEVOICE_MODEL_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2';

export const SENSEVOICE_FILES = [
  'model.onnx',
  'tokens.txt',
];

/** Check if model files are already cached locally. */
export function isModelCached(model: string, modelsDir: string): boolean {
  const modelDir = join(modelsDir, model);
  return SENSEVOICE_FILES.every((f) => existsSync(join(modelDir, f)));
}

/** Return cached model path, or download if missing. Always returns a valid path or throws. */
export async function ensureModel(model: string, modelsDir: string): Promise<string> {
  const modelDir = join(modelsDir, model);

  if (isModelCached(model, modelsDir)) return modelDir;

  mkdirSync(modelDir, { recursive: true });

  const url = model === 'sensevoice' ? SENSEVOICE_MODEL_URL : null;
  if (!url) throw new Error(`未知模型: ${model}`);

  const tarPath = join(modelDir, 'model.tar.bz2');

  // Download
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载模型失败: ${response.status}`);
  const buf = Buffer.from(await response.arrayBuffer());
  await writeFile(tarPath, buf);

  // Extract (tar is available on Windows 10+ build 17063+)
  await new Promise<void>((resolve, reject) => {
    exec(`tar -xjf "${tarPath}" -C "${modelDir}" --strip-components=1`, (err) => {
      if (err) reject(new Error(`解压模型失败: ${err.message}`));
      else resolve();
    });
  });

  unlinkSync(tarPath);
  return modelDir;
}
