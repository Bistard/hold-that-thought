#!/usr/bin/env node
/**
 * Claude Code — PostToolUse hook (Edit | MultiEdit | Write)
 *
 * Resolves the edited file from stdin and formats it with Prettier when it
 * belongs to the current project. Unknown file types are ignored safely.
 *
 * Pure Node implementation for cross-platform consistency.
 */
import process from 'process';
import { execFileSync } from 'child_process';
import { platform } from 'os';
import { resolve } from 'path';

// Accumulate stdin — Claude Code pipes the hook payload as JSON.
let raw = '';
for await (const chunk of process.stdin) {
	raw += chunk;
}

let filePath;
try {
	filePath = JSON.parse(raw)?.tool_input?.file_path;
} catch (err) {
	process.stderr.write(`[format-after-edit] failed to parse stdin payload: ${err.message}\n`);
}

if (!filePath) {
	process.exit(0);
}

const cwd = process.cwd();
const abs = resolve(cwd, filePath);

// Guard: only format files that live inside the project root.
// Windows paths are case-insensitive, so compare after lowercasing.
const withinProject =
	platform() === 'win32'
		? abs.toLowerCase().startsWith(cwd.toLowerCase())
		: abs.startsWith(cwd + '/') || abs === cwd;

if (!withinProject) {
	process.exit(0);
}

try {
	execFileSync('pnpm', ['exec', 'prettier', '--write', '--ignore-unknown', `"${abs}"`], {
		stdio: 'ignore',
		cwd,
		shell: true,
	});
} catch (err) {
	process.stderr.write(`[format-after-edit] prettier failed on ${abs}: ${err.message}\n`);
}
