import type { TextSegment, ExportOptions } from '../types.js';

function ts(ms: number): string {
	return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false });
}

function tsDate(ms: number): string {
	return new Date(ms).toLocaleDateString('zh-CN');
}

export function exportTranscript(segments: TextSegment[], opts: ExportOptions): string {
	if (segments.length === 0) return '';

	if (opts.format === 'md') {
		let out = '## 转录导出\n\n';
		out += `> ${tsDate(opts.from)} ${ts(opts.from)} — ${ts(opts.to)}\n\n`;
		for (const s of segments) {
			const speaker = s.speaker ? `**${s.speaker}**：` : '';
			out += `- *${ts(s.timestamp)}* ${speaker}${s.text}\n`;
		}
		return out;
	}

	// txt format
	let out = `转录导出  ${tsDate(opts.from)} ${ts(opts.from)} — ${ts(opts.to)}\n`;
	out += `${'─'.repeat(50)}\n\n`;
	for (const s of segments) {
		const speaker = s.speaker ? `${s.speaker}：` : '';
		out += `[${ts(s.timestamp)}] ${speaker}${s.text}\n`;
	}
	return out;
}
