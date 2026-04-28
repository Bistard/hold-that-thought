import { join, resolve, sep } from 'node:path';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

export const ZIPFORMER_MODEL_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-small-ctc-zh-2025-04-01.tar.bz2';

export const ZIPFORMER_FILES = [
  'model.onnx',
  'tokens.txt',
];

/** Check if model files are already cached locally. */
export function isModelCached(model: string, modelsDir: string): boolean {
  const modelDir = join(modelsDir, model);
  return ZIPFORMER_FILES.every((f) => existsSync(join(modelDir, f)));
}

/** Validate model name does not traverse outside modelsDir and is a known model. */
function validateModel(model: string, modelsDir: string): void {
  const resolved = join(resolve(modelsDir), model);
  if (!resolved.startsWith(resolve(modelsDir) + sep)) {
    throw new Error(`非法模型名称: ${model}`);
  }
}

/** Look up the download URL for a known model name. */
function modelUrl(model: string): string | null {
  if (model === 'zipformer-zh-small') return ZIPFORMER_MODEL_URL;
  return null;
}

// In-flight promise map to prevent race conditions on concurrent ensureModel calls
const inFlight = new Map<string, Promise<string>>();

/** Return cached model path, or download if missing. Always returns a valid path or throws. */
export async function ensureModel(model: string, modelsDir: string): Promise<string> {
  validateModel(model, modelsDir);
  const modelDir = join(modelsDir, model);

  if (inFlight.has(modelDir)) return inFlight.get(modelDir)!;

  const promise = doEnsureModel(model, modelsDir);
  inFlight.set(modelDir, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(modelDir);
  }
}

async function doEnsureModel(model: string, modelsDir: string): Promise<string> {
  const modelDir = join(modelsDir, model);

  // Validate model name → URL lookup before any I/O
  const url = modelUrl(model);
  if (!url) throw new Error(`未知模型: ${model}`);

  // Check if cached
  if (isModelCached(model, modelsDir)) return modelDir;

  mkdirSync(modelDir, { recursive: true });

  const tarPath = join(modelDir, 'model.tar.bz2');

  try {
    // Download
    const response = await fetch(url);
    if (!response.ok) throw new Error(`下载模型失败: ${response.status}`);
    const buf = Buffer.from(await response.arrayBuffer());
    await writeFile(tarPath, buf);

    // Extract (tar is available on Windows 10+ build 17063+)
    await new Promise<void>((resolve, reject) => {
      const child = spawn('tar', ['-xjf', tarPath, '-C', modelDir, '--strip-components=1']);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`tar exited with code ${code}`));
      });
      child.on('error', reject);
    });
  } finally {
    // Clean up downloaded tar file even on failure
    if (existsSync(tarPath)) {
      unlinkSync(tarPath);
    }
  }

  return modelDir;
}
