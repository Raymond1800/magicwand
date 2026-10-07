import { formatComfyError } from './comfy-workflow.mjs';

export class ComfyCancelled extends Error {
    constructor() {
        super('已取消');
        this.cancelled = true;
    }
}

function authHeaders(apiKey, extra = {}) {
    const headers = { ...extra };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    return headers;
}

async function readJson(response) {
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return { error: { message: text.slice(0, 300) } };
    }
}

export async function comfyFetch(server, apiKey, path, options = {}) {
    const base = String(server || '').replace(/\/+$/, '');
    const response = await fetch(`${base}${path}`, {
        method: options.method || 'GET',
        headers: authHeaders(apiKey, options.headers),
        body: options.body,
        signal: AbortSignal.timeout(options.timeoutMs || 20000)
    });
    return response;
}

export async function getSystemStats(server, apiKey) {
    const response = await comfyFetch(server, apiKey, '/system_stats', { timeoutMs: 15000 });
    const payload = await readJson(response);
    if (!response.ok) {
        throw new Error(`连接失败（HTTP ${response.status}）`);
    }
    const device = payload && payload.devices && payload.devices[0] ? payload.devices[0].name : '未知设备';
    const version = payload && payload.system ? payload.system.comfyui_version : '?';
    return { device, version };
}

export async function listLoras(server, apiKey) {
    const response = await comfyFetch(server, apiKey, '/models/loras', { timeoutMs: 30000 });
    const payload = await readJson(response);
    if (!response.ok || !Array.isArray(payload)) {
        throw new Error(`读取 LoRA 列表失败（HTTP ${response.status}）`);
    }
    return payload.map((item) => String(item && typeof item === 'object' ? (item.name || '') : item));
}

export async function uploadImage(server, apiKey, buffer, filename, mime) {
    const formData = new FormData();
    formData.append('image', new Blob([buffer], { type: mime || 'image/png' }), filename || 'upload.png');
    formData.append('type', 'input');
    formData.append('overwrite', 'true');
    const response = await comfyFetch(server, apiKey, '/upload/image', {
        method: 'POST',
        body: formData,
        timeoutMs: 60000
    });
    const payload = await readJson(response);
    if (!response.ok || !payload || !payload.name) {
        throw new Error(`上传失败（HTTP ${response.status}）：${formatComfyError(payload, '无返回')}`);
    }
    return payload.subfolder ? `${payload.subfolder}/${payload.name}` : payload.name;
}

export async function queuePrompt(server, apiKey, workflow, clientId) {
    const response = await comfyFetch(server, apiKey, '/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: clientId }),
        timeoutMs: 30000
    });
    const payload = await readJson(response);
    if (!response.ok || !payload || !payload.prompt_id) {
        throw new Error(`提交工作流失败：${formatComfyError(payload, `HTTP ${response.status}`)}`);
    }
    return payload;
}

export async function cancelJob(server, apiKey, promptId) {
    if (!promptId) return;
    try {
        const response = await comfyFetch(server, apiKey, '/queue', { timeoutMs: 15000 });
        if (!response.ok) return;
        const queue = await readJson(response) || {};
        const pending = (queue.queue_pending || []).some((item) => Array.isArray(item) && item[1] === promptId);
        const running = (queue.queue_running || []).some((item) => Array.isArray(item) && item[1] === promptId);
        if (pending) {
            await comfyFetch(server, apiKey, '/queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delete: [promptId] }),
                timeoutMs: 15000
            });
        }
        if (running) {
            await comfyFetch(server, apiKey, '/interrupt', { method: 'POST', timeoutMs: 15000 });
        }
    } catch (error) {
        console.warn('[preview] 取消任务失败:', error.message);
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForImage(server, apiKey, promptId, options = {}) {
    const deadline = Date.now() + (Number(options.timeoutSec) || 300) * 1000;
    const pollMs = Math.max(500, (Number(options.pollMs) || 1500));
    const startedAt = options.startedAt || Date.now();
    while (Date.now() < deadline) {
        if (options.shouldCancel && options.shouldCancel()) {
            await cancelJob(server, apiKey, promptId);
            throw new ComfyCancelled();
        }
        await sleep(pollMs);
        if (options.shouldCancel && options.shouldCancel()) {
            await cancelJob(server, apiKey, promptId);
            throw new ComfyCancelled();
        }
        const historyResponse = await comfyFetch(server, apiKey, `/history/${promptId}`);
        if (!historyResponse.ok) continue;
        const history = await readJson(historyResponse);
        const entry = history && history[promptId];
        if (!entry) {
            let queueRemaining = null;
            try {
                const queueResponse = await comfyFetch(server, apiKey, '/prompt');
                if (queueResponse.ok) {
                    const queuePayload = await readJson(queueResponse);
                    queueRemaining = queuePayload && queuePayload.exec_info ? queuePayload.exec_info.queue_remaining : null;
                }
            } catch {
                queueRemaining = null;
            }
            if (options.onTick) {
                options.onTick({ elapsed: (Date.now() - startedAt) / 1000, queueRemaining });
            }
            continue;
        }
        if (entry.status && entry.status.status_str === 'error') {
            throw new Error(`生成失败：${JSON.stringify(entry.status.messages || [])}`);
        }
        if (entry.status && entry.status.completed) {
            const images = Object.values(entry.outputs || {}).flatMap((output) => output.images || []);
            if (!images.length) throw new Error('生成完成但没有输出图片');
            return images[0];
        }
    }
    throw new Error(`等待超时（${options.timeoutSec || 300}s）`);
}

export async function downloadImage(server, apiKey, imageInfo) {
    const query = new URLSearchParams({
        filename: imageInfo.filename,
        subfolder: imageInfo.subfolder || '',
        type: imageInfo.type || 'output'
    });
    const response = await comfyFetch(server, apiKey, `/view?${query}`, { timeoutMs: 60000 });
    if (!response.ok) throw new Error(`下载结果失败：HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}
