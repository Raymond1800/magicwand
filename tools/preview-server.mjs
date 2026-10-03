#!/usr/bin/env node
/**
 * 本地提示词预览。
 * 从 magicwand.user.js 读取当前提示词，上传一张照片后串行调用 ComfyUI，并在页面上看结果。
 *
 *   node tools/preview-server.mjs
 *   node tools/preview-server.mjs --port 8765
 *
 * 只监听 127.0.0.1。结果在 tools/preview-out/，连接配置在 tools/preview-config.json。
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ComfyCancelled, cancelJob, downloadImage, getSystemStats, queuePrompt, uploadImage, waitForImage } from './comfy-client.mjs';
import { buildWorkflow, randomSeed } from './comfy-workflow.mjs';
import { loadCatalog, resolveJobs } from './prompt-catalog.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(root, '../magicwand.user.js');
const outRoot = path.join(root, 'preview-out');
const configPath = path.join(root, 'preview-config.json');
const pagePath = path.join(root, 'preview.html');

let catalog = null;
let active = null;

function stamp() {
    const date = new Date();
    const part = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}${part(date.getMonth() + 1)}${part(date.getDate())}-${part(date.getHours())}${part(date.getMinutes())}${part(date.getSeconds())}`;
}

function applyTls(insecure) {
    if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

function safeId(id) {
    if (!/^[\w-]+$/.test(String(id || ''))) throw new Error('无效的运行编号');
    return String(id);
}

function runDirectory(id) {
    const dir = path.resolve(outRoot, safeId(id));
    const parent = path.resolve(outRoot);
    if (dir !== parent && !dir.startsWith(parent + path.sep)) throw new Error('无效的运行编号');
    return dir;
}

function safeFile(name) {
    const base = path.basename(String(name || ''));
    if (!base || base === '.' || base === '..') throw new Error('无效的文件名');
    return base;
}

async function readConfig() {
    try {
        return JSON.parse(await readFile(configPath, 'utf8'));
    } catch {
        return {};
    }
}

async function writeConfig(config) {
    await writeFile(configPath, JSON.stringify(config, null, 2));
}

function imageContentType(file) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    return 'image/jpeg';
}

function settingsFrom(body, defaults) {
    return {
        server: String(body.server || '').trim().replace(/\/+$/, ''),
        apiKey: String(body.apiKey || ''),
        insecure: body.insecure == null ? true : Boolean(body.insecure),
        steps: Number(body.steps) || defaults.steps,
        megapixels: Number(body.megapixels) || defaults.megapixels,
        timeout: Number(body.timeout) || defaults.timeout,
        loraList: typeof body.loraList === 'string' ? body.loraList : defaults.loraList,
        unetName: String(body.unetName || defaults.unetName),
        clipName: String(body.clipName || defaults.clipName),
        vaeName: String(body.vaeName || defaults.vaeName)
    };
}

function workflowOptions(settings, imageName, job, seed) {
    return {
        imageName,
        prompt: job.prompt,
        seed,
        clipName: settings.clipName,
        clipType: catalog.defaults.clipType,
        vaeName: settings.vaeName,
        unetName: settings.unetName,
        megapixels: settings.megapixels,
        refResolution: catalog.defaults.refResolution,
        steps: settings.steps,
        cfg: catalog.defaults.cfg,
        samplerName: catalog.defaults.samplerName,
        scheduler: catalog.defaults.scheduler,
        loras: settings.loraList,
        width: job.width,
        height: job.height,
        filenamePrefix: 'magicwand-preview'
    };
}

async function writeManifest(run) {
    await writeFile(path.join(run.dir, 'manifest.json'), JSON.stringify(run.manifest, null, 2));
}

function summarize(manifest) {
    const jobs = manifest.jobs || [];
    return {
        id: manifest.id,
        createdAt: manifest.createdAt,
        total: jobs.length,
        done: jobs.filter((job) => job.status === 'done').length,
        failed: jobs.filter((job) => job.status === 'error' || job.status === 'cancelled' || job.status === 'interrupted').length,
        running: jobs.some((job) => job.status === 'running' || job.status === 'queued')
    };
}

async function listRuns() {
    let names = [];
    try {
        names = await readdir(outRoot);
    } catch {
        return [];
    }
    const runs = [];
    for (const name of names) {
        try {
            const manifest = JSON.parse(await readFile(path.join(outRoot, name, 'manifest.json'), 'utf8'));
            runs.push(summarize(manifest));
        } catch {
            // 跳过不完整目录
        }
    }
    runs.sort((a, b) => (a.id < b.id ? 1 : -1));
    return runs.slice(0, 20);
}

async function readManifest(id) {
    if (active && active.id === id) return active.manifest;
    const dir = runDirectory(id);
    return JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
}

async function settleInterrupted() {
    let names = [];
    try {
        names = await readdir(outRoot);
    } catch {
        return;
    }
    for (const name of names) {
        const manifestPath = path.join(outRoot, name, 'manifest.json');
        try {
            const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
            let changed = false;
            (manifest.jobs || []).forEach((job) => {
                if (job.status === 'queued' || job.status === 'running') {
                    job.status = 'interrupted';
                    job.error = '服务重启，这一张没有跑完';
                    changed = true;
                }
            });
            if (changed) await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        } catch {
            // 忽略坏目录
        }
    }
}

function fileNameFor(index, job, remoteName) {
    const ext = (String(remoteName || 'png').split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const label = String(job.name || 'image').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
    return `${String(index + 1).padStart(2, '0')}-${label}.${ext}`;
}

async function executeRun(run) {
    applyTls(run.settings.insecure);
    try {
        run.imageName = await uploadImage(run.settings.server, run.settings.apiKey, run.imageBuffer, run.filename, run.mime);
    } catch (error) {
        run.manifest.jobs.forEach((job) => {
            if (job.status === 'queued') {
                job.status = 'error';
                job.error = error.message;
            }
        });
        await writeManifest(run);
        active = null;
        return;
    }

    for (let index = 0; index < run.manifest.jobs.length; index += 1) {
        const job = run.manifest.jobs[index];
        if (run.cancelled) {
            if (job.status === 'queued') job.status = 'cancelled';
            continue;
        }
        job.status = 'running';
        job.elapsed = 0;
        const started = Date.now();
        const seed = randomSeed();
        job.seed = seed;
        await writeManifest(run);
        try {
            const workflow = buildWorkflow(workflowOptions(run.settings, run.imageName, job, seed));
            const queued = await queuePrompt(run.settings.server, run.settings.apiKey, workflow, `magicwand-preview-${randomUUID()}`);
            run.promptId = queued.prompt_id;
            const imageInfo = await waitForImage(run.settings.server, run.settings.apiKey, queued.prompt_id, {
                timeoutSec: run.settings.timeout,
                pollMs: 1500,
                startedAt: started,
                shouldCancel: () => run.cancelled,
                onTick(tick) {
                    job.elapsed = Math.round(tick.elapsed);
                    job.queueRemaining = tick.queueRemaining;
                }
            });
            const buffer = await downloadImage(run.settings.server, run.settings.apiKey, imageInfo);
            const file = fileNameFor(index, job, imageInfo.filename);
            await writeFile(path.join(run.dir, file), buffer);
            job.file = file;
            job.status = 'done';
            job.ms = Date.now() - started;
            console.log(`[preview] 完成 ${job.name} ${(job.ms / 1000).toFixed(1)}s`);
        } catch (error) {
            job.ms = Date.now() - started;
            if (error instanceof ComfyCancelled || error.cancelled || run.cancelled) {
                job.status = 'cancelled';
                job.error = '';
            } else {
                job.status = 'error';
                job.error = error.message || '生成失败';
                console.error(`[preview] 失败 ${job.name}: ${job.error}`);
            }
        } finally {
            if (run.promptId) {
                const promptId = run.promptId;
                run.promptId = '';
                if (run.cancelled) await cancelJob(run.settings.server, run.settings.apiKey, promptId);
            }
            await writeManifest(run);
        }
    }
    await writeManifest(run);
    active = null;
}

function extensionForMime(mime) {
    const value = String(mime || '');
    if (value.includes('png')) return 'png';
    if (value.includes('webp')) return 'webp';
    return 'jpg';
}

function decodeImage(payload) {
    const raw = String(payload.imageBase64 || '');
    const matched = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
    const mime = matched ? matched[1] : 'image/jpeg';
    const data = matched ? matched[2] : raw;
    if (!data) return null;
    const buffer = Buffer.from(data, 'base64');
    if (!buffer.length) return null;
    const ext = extensionForMime(mime);
    return { buffer, mime, filename: payload.filename || `source.${ext}`, sourceName: `source.${ext}` };
}

function sendJson(res, status, body) {
    const data = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(data)
    });
    res.end(data);
}

function readRequest(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > 40 * 1024 * 1024) {
                reject(Object.assign(new Error('请求过大'), { statusCode: 413 }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

async function startRun(settings, image, jobs) {
    if (active) {
        const error = new Error('已有一批任务在跑');
        error.statusCode = 409;
        throw error;
    }
    if (!settings.server) {
        const error = new Error('先填写 ComfyUI 地址');
        error.statusCode = 400;
        throw error;
    }
    if (!jobs.length) {
        const error = new Error('先选择至少一条提示词');
        error.statusCode = 400;
        throw error;
    }
    const id = stamp();
    const dir = runDirectory(id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, image.sourceName), image.buffer);
    const manifest = {
        id,
        createdAt: new Date().toISOString(),
        server: settings.server,
        source: image.sourceName,
        jobs
    };
    const run = {
        id,
        dir,
        settings,
        imageBuffer: image.buffer,
        filename: image.filename,
        mime: image.mime,
        imageName: '',
        promptId: '',
        cancelled: false,
        manifest
    };
    await writeManifest(run);
    active = run;
    executeRun(run).catch((error) => {
        console.error('[preview] 批次失败:', error);
        active = null;
    });
    return manifest;
}

async function handle(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    try {
        if (req.method === 'GET' && url.pathname === '/') {
            const page = await readFile(pagePath);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(page);
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/catalog') {
            sendJson(res, 200, {
                groups: catalog.groups,
                decorators: catalog.decorators,
                defaults: catalog.defaults,
                saved: settingsFrom(await readConfig(), catalog.defaults)
            });
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/runs') {
            sendJson(res, 200, { runs: await listRuns(), activeId: active ? active.id : '' });
            return;
        }
        const runMatch = url.pathname.match(/^\/api\/runs\/([\w-]+)(\/source|\/files\/([^/]+)|\/retry)?$/);
        if (req.method === 'GET' && runMatch && !runMatch[2]) {
            sendJson(res, 200, await readManifest(runMatch[1]));
            return;
        }
        if (req.method === 'GET' && runMatch && runMatch[2] === '/source') {
            const manifest = await readManifest(runMatch[1]);
            const file = path.join(runDirectory(runMatch[1]), safeFile(manifest.source));
            const body = await readFile(file);
            res.writeHead(200, { 'Content-Type': imageContentType(file), 'Cache-Control': 'no-store' });
            res.end(body);
            return;
        }
        if (req.method === 'GET' && runMatch && runMatch[3]) {
            const file = path.join(runDirectory(runMatch[1]), safeFile(decodeURIComponent(runMatch[3])));
            const body = await readFile(file);
            res.writeHead(200, { 'Content-Type': imageContentType(file), 'Cache-Control': 'no-store' });
            res.end(body);
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/test') {
            const body = JSON.parse((await readRequest(req)).toString('utf8') || '{}');
            const settings = settingsFrom(body, catalog.defaults);
            await writeConfig(settings);
            applyTls(settings.insecure);
            const stats = await getSystemStats(settings.server, settings.apiKey);
            sendJson(res, 200, stats);
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/runs') {
            const body = JSON.parse((await readRequest(req)).toString('utf8') || '{}');
            const settings = settingsFrom(body, catalog.defaults);
            await writeConfig(settings);
            const image = decodeImage(body);
            if (!image) {
                sendJson(res, 400, { error: '先选择一张照片' });
                return;
            }
            const jobs = resolveJobs(catalog, body.jobIds, body.decoratorIds);
            const manifest = await startRun(settings, image, jobs);
            sendJson(res, 200, manifest);
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/cancel') {
            if (!active) {
                sendJson(res, 200, { ok: true });
                return;
            }
            active.cancelled = true;
            await cancelJob(active.settings.server, active.settings.apiKey, active.promptId);
            sendJson(res, 200, { ok: true });
            return;
        }
        if (req.method === 'POST' && runMatch && runMatch[2] === '/retry') {
            const body = JSON.parse((await readRequest(req)).toString('utf8') || '{}');
            const previous = JSON.parse(await readFile(path.join(runDirectory(runMatch[1]), 'manifest.json'), 'utf8'));
            const wanted = new Set(Array.isArray(body.jobIds) && body.jobIds.length
                ? body.jobIds
                : previous.jobs.filter((job) => job.status === 'error' || job.status === 'cancelled' || job.status === 'interrupted').map((job) => job.id));
            const jobs = previous.jobs
                .filter((job) => wanted.has(job.id))
                .map((job) => ({
                    id: job.id,
                    group: job.group,
                    name: job.name,
                    prompt: job.prompt,
                    width: job.width || 0,
                    height: job.height || 0,
                    status: 'queued',
                    file: '',
                    error: '',
                    seed: null,
                    ms: 0
                }));
            if (!jobs.length) {
                sendJson(res, 400, { error: '没有失败、取消或中断的任务' });
                return;
            }
            const sourcePath = path.join(runDirectory(runMatch[1]), safeFile(previous.source));
            const buffer = await readFile(sourcePath);
            const saved = settingsFrom(await readConfig(), catalog.defaults);
            const manifest = await startRun(saved, {
                buffer,
                mime: previous.source.endsWith('.png') ? 'image/png' : (previous.source.endsWith('.webp') ? 'image/webp' : 'image/jpeg'),
                filename: previous.source,
                sourceName: previous.source
            }, jobs);
            sendJson(res, 200, manifest);
            return;
        }
        sendJson(res, 404, { error: '没有这个接口' });
    } catch (error) {
        const status = error.statusCode || 500;
        if (status >= 500) console.error('[preview]', error);
        sendJson(res, status, { error: error.message || '服务器错误' });
    }
}

async function main() {
    let port = 8765;
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === '--port') port = Number(args[++i]) || port;
    }
    catalog = await loadCatalog(scriptPath);
    await mkdir(outRoot, { recursive: true });
    await settleInterrupted();
    const counts = catalog.groups.map((group) => `${group.title} ${group.items.length}`).join('，');
    const server = http.createServer((req, res) => {
        handle(req, res);
    });
    server.listen(port, '127.0.0.1', () => {
        console.log(`[preview] http://127.0.0.1:${port}`);
        console.log(`[preview] ${counts}，装饰 ${catalog.decorators.length}`);
    });
}

main().catch((error) => {
    console.error(`[preview] ${error.message}`);
    process.exit(1);
});
