#!/usr/bin/env node
/**
 * Claude Code — Notification hook
 *
 * Fired by the `Notification` event. Dispatches a native OS alert so the
 * user knows Claude needs their attention.
 */
import process from 'process';
import { execFileSync } from 'child_process';
import { platform } from 'os';

const os = platform();

const displayText = 'Claude Code needs your attention';

try {
	if (os === 'win32') {
		// Try native toast notification (bottom-right) first
		const toastScript =
			`try {` +
			`  [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime];` +
			`  [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime];` +
			`  $xml = '<toast><visual><binding template="ToastText02"><text id="1">Claude Code</text><text id="2">${displayText}</text></binding></visual></toast>';` +
			`  $doc = [Windows.Data.Xml.Dom.XmlDocument]::new();` +
			`  $doc.LoadXml($xml);` +
			`  $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code');` +
			`  $toast = [Windows.UI.Notifications.ToastNotification]::new($doc);` +
			`  $notifier.Show($toast)` +
			// If the above fails, fall back to a MessageBox alert.
			`} catch {` +
			`  [void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');` +
			`  [void][System.Windows.Forms.MessageBox]::Show('${displayText}', 'Claude Code')` +
			`}`;
		execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', toastScript], {
			stdio: 'ignore',
		});
	} else if (os === 'darwin') {
		execFileSync(
			'osascript',
			['-e', `display notification "${displayText}" with title "Claude Code"`],
			{ stdio: 'ignore' },
		);
	} else {
		// Linux — best-effort via notify-send; silently ignored if unavailable.
		execFileSync('notify-send', ['Claude Code', `${displayText}`], {
			stdio: 'ignore',
		});
	}
} catch (err) {
	process.stderr.write(`[notify-when-attention] OS notification failed: ${err.message}\n`);
}
