#!/usr/bin/env node
/**
 * Claude Code — Multi-hook notification dispatcher
 *
 * Supports Notification, Stop, and StopFailure hooks.
 * Identifies the hook via --hook-type CLI arg or payload.hook_event_name,
 * then dispatches a native OS notification with a context-aware Chinese message.
 */
import process from "process";
import { execFileSync } from "child_process";
import { platform } from "os";
import { basename } from "path";

const os = platform();

// ---------------------------------------------------------------------------
// 1. Parse CLI arg for explicit hook type
// ---------------------------------------------------------------------------
const hookTypeIndex = process.argv.indexOf("--hook-type");
const cliHookType =
    hookTypeIndex !== -1 ? process.argv[hookTypeIndex + 1] : null;

// ---------------------------------------------------------------------------
// 2. Read and parse the hook payload from stdin
// ---------------------------------------------------------------------------
let payload = {};

if (!process.stdin.isTTY) {
    let raw = "";
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
// 3. Determine the effective hook type
// ---------------------------------------------------------------------------
const hookEventName = payload.hook_event_name || "";
const effectiveHook =
    cliHookType ||
    (hookEventName === "Stop" ? "stop" : null) ||
    (hookEventName === "StopFailure" ? "stop_failure" : null) ||
    (payload.notification_type ? "notification" : null);

// ---------------------------------------------------------------------------
// 4. Build the reason message
// ---------------------------------------------------------------------------
const NOTIFICATION_REASON = {
    permission_prompt: "需要权限审批",
    idle_prompt: "等待你的输入",
    elicitation_dialog: "需要你的响应",
    elicitation_complete: "任务已完成",
    elicitation_response: "已收到响应",
    auth_success: "认证成功",
};

const STOP_REASON = {
    end_turn: "任务完成",
    max_tokens: "已达输出上限",
    tool_deferred: "工具调用完成",
    stop_sequence: "触发停止序列",
};

const ERROR_LABEL = {
    rate_limit: "API 限流",
    authentication_failed: "认证失败",
    billing_error: "计费错误",
    server_error: "服务端错误",
    invalid_request: "无效请求",
    max_output_tokens: "输出超长",
    unknown: "未知错误",
};

let reason;
let contextPrefix = "";
if (effectiveHook === "stop") {
    reason = STOP_REASON[payload.stop_reason] || "任务完成";
    const details = payload.stop_reason_details;
    if (details) {
        if (payload.stop_reason === "max_tokens" && details.token_count) {
            reason += ` (限制: ${details.token_count})`;
        } else if (
            payload.stop_reason === "tool_deferred" &&
            details.tool_name
        ) {
            reason += ` (${details.tool_name})`;
        }
    }
} else if (effectiveHook === "stop_failure") {
    const label =
        ERROR_LABEL[payload.error_type] || payload.error_type || "未知错误";
    if (payload.error) {
        reason =
            payload.error.length > 100
                ? payload.error.slice(0, 100) + "…"
                : payload.error;
        contextPrefix = label;
    } else {
        reason = `${label}，任务中断`;
    }
} else if (effectiveHook === "notification") {
    const typeLabel =
        NOTIFICATION_REASON[payload.notification_type] ||
        payload.notification_type;
    if (payload.body) {
        reason =
            payload.body.length > 100
                ? payload.body.slice(0, 100) + "…"
                : payload.body;
    } else if (payload.title) {
        reason = payload.title;
    } else {
        reason = typeLabel;
    }
} else {
    reason = "Claude Code";
}

// ---------------------------------------------------------------------------
// 5. Build compact session info line
// ---------------------------------------------------------------------------
const HOOK_CATEGORY = {
    notification: "通知",
    stop: "停止",
    stop_failure: "出错",
};
const category = HOOK_CATEGORY[effectiveHook] || "";

const projectName = payload.cwd ? basename(payload.cwd) : "";
const shortId = payload.session_id ? payload.session_id.slice(0, 8) : "";
const agentTag = payload.agent_type || "";
const sessionInfo = [
    category,
    contextPrefix,
    agentTag,
    projectName,
    shortId ? `(${shortId})` : "",
]
    .filter(Boolean)
    .join(" · ");

const body = sessionInfo;

// ---------------------------------------------------------------------------
// 6. Helpers to escape text for platform-specific consumers
// ---------------------------------------------------------------------------
function escAppleScript(text) {
    return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}

function escXml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

// ---------------------------------------------------------------------------
// 7. Dispatch native notification
// ---------------------------------------------------------------------------
try {
	const title = escXml(reason);
    if (os === "win32") {
        const toastBody = escXml(sessionInfo);

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
        execFileSync(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-Command", toastScript],
            {
                stdio: "pipe",
            },
        );
    } else if (os === "darwin") {
        const safeBody = escAppleScript(body);
        execFileSync(
            "osascript",
            [
                "-e",
                `display notification "${safeBody}" with title "${title}" sound name "default"`,
            ],
            { stdio: "pipe" },
        );
    } else {
        execFileSync(
            "notify-send",
            ["--expire-time=5000", "--urgency=normal", title, body],
            { stdio: "pipe" },
        );
    }
} catch (err) {
    process.stderr.write(
        `[notify-when-attention] OS notification failed: ${err.message}\n`,
    );
}
