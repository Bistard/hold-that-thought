#!/usr/bin/env node
/**
 * Claude Code — Notification hook
 *
 * Fired by the `Notification` event. Reads the JSON payload from stdin to
 * determine the notification reason and dispatches a native OS notification
 * with a context-aware Chinese message.
 */
import process from 'process';
import { execFileSync } from 'child_process';
import { platform } from 'os';
import { basename } from 'path';

const os = platform();

// ---------------------------------------------------------------------------
// 1. Read and parse the hook payload from stdin
// ---------------------------------------------------------------------------
let payload = {};

if (!process.stdin.isTTY) {
	let raw = '';
	for await (const chunk of process.stdin) {
		raw += chunk;
	}
	try {
		payload = JSON.parse(raw);
	} catch {
		// Invalid JSON — proceed with defaults
	}
}

// ---------------------------------------------------------------------------
// 2. Map notification_type to a compact Chinese reason
// ---------------------------------------------------------------------------
const REASON_MAP = {
	permission_prompt: '需要权限审批',
	idle_prompt: '等待你的输入',
	elicitation_dialog: '需要你的响应',
	elicitation_complete: '任务已完成',
	elicitation_response: '已收到响应',
	auth_success: '认证成功',
};

const reason = REASON_MAP[payload.notification_type] || `Claude Code (${payload.notification_type})`;

// ---------------------------------------------------------------------------
// 3. Build compact session info line
// ---------------------------------------------------------------------------
const projectName = payload.cwd ? basename(payload.cwd) : '';
const shortId = payload.session_id ? payload.session_id.slice(0, 8) : '';
const sessionInfo = [projectName, shortId ? `(${shortId})` : '']
	.filter(Boolean)
	.join(' · ');

const body = [reason, sessionInfo].filter(Boolean).join('\n');

// ---------------------------------------------------------------------------
// 4. Helpers to escape text for platform-specific consumers
// ---------------------------------------------------------------------------
function escAppleScript(text) {
	return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function escXml(text) {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// 5. Dispatch native notification
// ---------------------------------------------------------------------------
try {
	if (os === 'win32') {
		const title = escXml('Claude Code');
		const toastBody = escXml(
			[reason, sessionInfo].filter(Boolean).join(' — '),
		);

		const toastScript =
			`try {` +
			`  [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime];` +
			`  [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime];` +
			`  $xml = '<toast><visual><binding template="ToastText02"><text id="1">${title}</text><text id="2">${toastBody}</text></binding></visual></toast>';` +
			`  $doc = [Windows.Data.Xml.Dom.XmlDocument]::new();` +
			`  $doc.LoadXml($xml);` +
			`  $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code');` +
			`  $toast = [Windows.UI.Notifications.ToastNotification]::new($doc);` +
			`  $notifier.Show($toast)` +
			`} catch {` +
			`  [void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');` +
			`  [void][System.Windows.Forms.MessageBox]::Show('${toastBody}', '${title}')` +
			`}`;
		execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', toastScript], {
			stdio: 'pipe',
		});
	} else if (os === 'darwin') {
		const safeReason = escAppleScript(reason);
		const safeBody = escAppleScript(body);
		execFileSync(
			'osascript',
			[
				'-e',
				`display notification "${safeBody}" with title "Claude Code" subtitle "${safeReason}" sound name "default"`,
			],
			{ stdio: 'pipe' },
		);
	} else {
		execFileSync(
			'notify-send',
			['--expire-time=5000', '--urgency=normal', 'Claude Code', body],
			{ stdio: 'pipe' },
		);
	}
} catch (err) {
	process.stderr.write(`[notify-when-attention] OS notification failed: ${err.message}\n`);
}
