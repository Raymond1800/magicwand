#!/usr/bin/env node
/**
 * ComfyUI 直连冒烟测试（与 magicwand.user.js 使用同一套工作流结构）
 *
 * 用途：换服务器 / 换模型 / 升级 ComfyUI 之后，30 秒内自检
 * 「上传图片 → 提交工作流 → 轮询历史 → 下载结果」全链路是否正常。
 *
 * 用法：
 *   node tools/comfyui-smoke.mjs --server https://host:8443
 *   node tools/comfyui-smoke.mjs --server https://host:8443 --image ./photo.jpg \
 *        --prompt "把她的上衣换成红色" --steps 25 --megapixels 1.5
 *
 * 依赖：Node 18+（内置 fetch / FormData / Blob），无第三方依赖。
 * 注意：这里的工作流结构需要与 magicwand.user.js 的 buildComfyWorkflow() 保持一致。
 */

import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';

// 无参数时使用的占位图（512x768 示意人像），仅用于验证链路是否通畅
const PLACEHOLDER_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAgAAAAMAAgMAAAAvYTfdAAAACVBMVEXryK88WozIPDxGFNJMAAAEGklEQVR42u3cwW1rNxAF0NHC' +
    'Jfx+XIIWflq8EtSPS/BCqjIBggD5gRNx6KEGTzhc2+AB53JkWCRjax4BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAHBwQPw5fvUB3uOv0QX4e/4fCaJi/p8I5n/1/I/54/R8wEf8Nt6eDnj/HRDPBvxrAeaXIIoWYHoJomgBppcgqhZg' +
    'dgmiagFmlyB+3gN+1gvmAPHt+PU0wMf3gLenAd6/B8TTAP8x/1QNoq4CczWIwgpM1SAKKzBVgyiswFQNoqgLTfeiqIzATAiiMgIz' +
    'IYjKCMyEICojMBOCKI3ARAiiNAITIYjSCEyEIEojMBGC4wH+P4P5FEZtBvMpjNoM5lN4OMD5EeC0GPAog+kUHg7wcP7sNojiDKZT' +
    'eDTA+THg9NqAx5sguw2OBhiYP7kPDwb4GAG8vTLgPAI4vTJgZBcm9yFAlLeBZCMAiPI+lOxEAMcCnMcAJ4DXBYx9FOQ+DAAAAHI/' +
    'HPV/EAAAAAAAAAAA+JMMAOBYAP+gAPCPSgBfWPQDfG3XDvDltQMMDrE4yOQwmwON/WdKHevtP1ntcHv7/YL+GxYuubTfM2q/adV/' +
    '16z9tl37fcP2G5f9d07bb9223ztuv3ndf/e8/fZ9+/sD/S8wtL9B0f4KR/87JO0vsbS/RdP/Gk/7e0T9LzK1v0nV/ypX+7tk/S+z' +
    '9b9N1/8639b+PmHFAAAAAAAAAAAASALuA+NzIeB+LxekANcxwH0VYB+c/35bBLgPj88lgH0ccFsCuI4D7isAl8T8968FgD0DuC0A' +
    'ZCqQqEEsqUCiBrGkAokaxJoKjNcg6rtQrhcdBnDJAr6KAXsWcCsGZDM4nMLDANLzj6YwFmVwOIVHAex5wO21APlNMLoNAGJVGxht' +
    'BACxqg+NdiKAgwD2GcANAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAACgEHCZAXwBvBJgmwF8AlQCrhOADaASsK/qxIcBXFb1ocMAtlVtYBhwXbQJjgPYF22CYcBlUQaHAduiDB4IcF2TwXHAviaD' +
    '44DLmgyOA5I12OoB+5IKJACXJRVIAFI12FYA9hUVyAC2+i6UBOwLFiAFGE7BtgqwlRcgC9jK588C6gcAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAH6czp9hqwBIcAAAAAElFTkSu' +
    'QmCC';

const DEFAULTS = {
    prompt: '把她的上衣换成红色蕾丝内衣，保留脸、发型、身材、姿态、背景、光线和构图完全不变，写实摄影。',
    steps: 25,
    megapixels: 1.5,
    unet: 'qwen/REDQW21-UNLOCKED-v1-BF16-ComfyMCP-builtwithqwen.safetensors',
    clip: 'qwen3vl_8b_int8_convrot.safetensors',
    clipType: 'qwen_image',
    vae: 'qwen_image_2.1_vae_bf16.safetensors',
    loras: [
        'qwen/Qwen-Image-2.1 NSFW Image EditV2.safetensors@1.0'
    ],
    refResolution: 1024,
    sampler: 'euler',
    scheduler: 'simple',
    cfg: 1,
    timeout: 300,
    out: 'comfyui-smoke-output.png'
};

function printUsage() {
    console.log(`ComfyUI 直连冒烟测试

用法:
  node tools/comfyui-smoke.mjs --server https://host:8443 [选项]

选项:
  --server <url>        ComfyUI 服务根地址（也可用环境变量 COMFYUI_SERVER）
  --image <path>        输入图片（可选，默认使用内置占位图）
  --prompt <text>       编辑提示词
  --steps <n>           采样步数（默认 ${DEFAULTS.steps}）
  --megapixels <n>      像素预算（默认 ${DEFAULTS.megapixels}）
  --unet <name>         UNet 模型（默认 ${DEFAULTS.unet}）
  --clip <name>         CLIP 模型（默认 ${DEFAULTS.clip}）
  --vae <name>          VAE 模型（默认 ${DEFAULTS.vae}）
  --lora <name@strength> LoRA，可重复（默认与 userscript 相同）
  --no-lora             不加载任何 LoRA
  --ref-resolution <n>  TextEncodeQwenImage21 的参考图分辨率（默认 ${DEFAULTS.refResolution}）
  --timeout <seconds>   总超时（默认 ${DEFAULTS.timeout}）
  --out <path>          输出文件（默认 ${DEFAULTS.out}）
  --insecure            跳过 TLS 证书校验（自签名证书时使用）
  -h, --help            显示帮助`);
}

function parseArgs(argv) {
    const options = {
        server: process.env.COMFYUI_SERVER || '',
        image: '',
        prompt: DEFAULTS.prompt,
        steps: DEFAULTS.steps,
        megapixels: DEFAULTS.megapixels,
        unet: DEFAULTS.unet,
        clip: DEFAULTS.clip,
        clipType: DEFAULTS.clipType,
        vae: DEFAULTS.vae,
        loras: [...DEFAULTS.loras],
        refResolution: DEFAULTS.refResolution,
        sampler: DEFAULTS.sampler,
        scheduler: DEFAULTS.scheduler,
        cfg: DEFAULTS.cfg,
        timeout: DEFAULTS.timeout,
        out: DEFAULTS.out,
        insecure: false
    };
    const args = argv.slice(2);
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        const next = () => {
            i += 1;
            return args[i];
        };
        switch (arg) {
            case '--server': options.server = next(); break;
            case '--image': options.image = next(); break;
            case '--prompt': options.prompt = next(); break;
            case '--steps': options.steps = Number(next()); break;
            case '--megapixels': options.megapixels = Number(next()); break;
            case '--unet': options.unet = next(); break;
            case '--clip': options.clip = next(); break;
            case '--vae': options.vae = next(); break;
            case '--lora': options.loras.push(next()); break;
            case '--no-lora': options.loras = []; break;
            case '--ref-resolution': options.refResolution = Number(next()); break;
            case '--timeout': options.timeout = Number(next()); break;
            case '--out': options.out = next(); break;
            case '--insecure': options.insecure = true; break;
            case '-h':
            case '--help': options.help = true; break;
            default:
                if (arg.startsWith('--lora=')) options.loras.push(arg.slice(7));
                else {
                    console.error(`未知参数: ${arg}`);
                    options.help = true;
                }
        }
    }
    if (options.loras.length > DEFAULTS.loras.length) {
        // 用户显式传了 --lora 时，丢弃内置默认值
        options.loras = options.loras.filter((item, index) => index >= DEFAULTS.loras.length);
    }
    return options;
}

function parseLoraList(loraList) {
    return loraList
        .map((line) => String(line || '').trim())
        .filter(Boolean)
        .map((line) => {
            const at = line.lastIndexOf('@');
            if (at <= 0) return { name: line, strength: 1 };
            const strength = Number(line.slice(at + 1));
            return { name: line.slice(0, at).trim(), strength: Number.isFinite(strength) ? strength : 1 };
        });
}

function buildWorkflow(options, imageName, prompt, seed) {
    const workflow = {
        '4': {
            class_type: 'CLIPLoader',
            inputs: { clip_name: options.clip, type: options.clipType, device: 'default' }
        },
        '13': { class_type: 'VAELoader', inputs: { vae_name: options.vae } },
        '38': { class_type: 'LoadImage', inputs: { image: imageName } },
        '40': {
            class_type: 'ImageScaleToTotalPixels',
            inputs: { upscale_method: 'lanczos', megapixels: options.megapixels, resolution_steps: 1, image: ['38', 0] }
        },
        '41': { class_type: 'GetImageSize', inputs: { image: ['40', 0] } },
        '36': {
            class_type: 'EmptyLatentImage',
            inputs: { width: ['41', 0], height: ['41', 1], batch_size: 1 }
        },
        '37': {
            class_type: 'TextEncodeQwenImage21',
            inputs: {
                prompt: prompt,
                negative_prompt: '',
                resolution: options.refResolution,
                clip: ['4', 0],
                'images.image_1': ['40', 0],
                vae: ['13', 0]
            }
        },
        '5': { class_type: 'UNETLoader', inputs: { unet_name: options.unet, weight_dtype: 'default' } },
        '25': { class_type: 'VAEDecode', inputs: { samples: ['23', 0], vae: ['13', 0] } },
        '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'magicwand-smoke', images: ['25', 0] } }
    };

    let modelRef = ['5', 0];
    parseLoraList(options.loras).forEach((lora, index) => {
        const nodeId = `lora_${index}`;
        workflow[nodeId] = {
            class_type: 'LoraLoaderModelOnly',
            inputs: { lora_name: lora.name, strength_model: lora.strength, model: modelRef }
        };
        modelRef = [nodeId, 0];
    });

    workflow['39'] = {
        class_type: 'ModelAttentionBackend',
        inputs: { attention: 'comfy kitchen attention', model: modelRef }
    };
    workflow['23'] = {
        class_type: 'KSampler',
        inputs: {
            seed: seed,
            steps: options.steps,
            cfg: options.cfg,
            sampler_name: options.sampler,
            scheduler: options.scheduler,
            denoise: 1.0,
            model: ['39', 0],
            positive: ['37', 0],
            negative: ['37', 1],
            latent_image: ['36', 0]
        }
    };
    return workflow;
}

function formatComfyError(payload, fallback) {
    if (!payload || typeof payload !== 'object') return fallback;
    const parts = [];
    if (payload.error && payload.error.message) parts.push(payload.error.message);
    Object.keys(payload.node_errors || {}).forEach((nodeId) => {
        const info = payload.node_errors[nodeId] || {};
        (info.errors || []).forEach((item) => {
            parts.push(`节点 ${nodeId}${info.class_type ? ` [${info.class_type}]` : ''}: ${item.message}${item.details ? `（${item.details}）` : ''}`);
        });
    });
    return parts.length ? parts.join('；') : fallback;
}

// ComfyUI 的 seed 是 64 位整数，这里取 52 位保证 JS Number 精度不丢
function randomSeed() {
    return Number(randomBytes(8).readBigUInt64BE() >> 12n);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readInputImage(imagePath) {
    if (imagePath) {
        const buffer = await readFile(imagePath);
        const ext = imagePath.toLowerCase().endsWith('.jpg') || imagePath.toLowerCase().endsWith('.jpeg') ? 'jpeg' : 'png';
        return { buffer, filename: imagePath.split('/').pop(), type: `image/${ext}` };
    }
    return {
        buffer: Buffer.from(PLACEHOLDER_PNG_BASE64, 'base64'),
        filename: 'magicwand-smoke-placeholder.png',
        type: 'image/png'
    };
}

async function main() {
    const options = parseArgs(process.argv);
    if (options.help) {
        printUsage();
        process.exit(options.help && !options.server ? 0 : 1);
    }
    if (!options.server) {
        console.error('缺少 --server（或环境变量 COMFYUI_SERVER）\n');
        printUsage();
        process.exit(1);
    }
    if (options.insecure) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        console.warn('已跳过 TLS 证书校验（--insecure）');
    }

    const server = options.server.replace(/\/+$/, '');
    const startedAt = Date.now();

    // 1) 连通性
    const statsResponse = await fetch(`${server}/system_stats`);
    if (!statsResponse.ok) {
        throw new Error(`连接 ${server}/system_stats 失败：HTTP ${statsResponse.status}`);
    }
    const stats = await statsResponse.json();
    const device = stats.devices && stats.devices[0] ? stats.devices[0].name : '未知设备';
    console.log(`[1/5] 连接成功：ComfyUI ${stats.system ? stats.system.comfyui_version : '?'} · ${device}`);

    // 2) 上传
    const input = await readInputImage(options.image);
    const formData = new FormData();
    formData.append('image', new Blob([input.buffer], { type: input.type }), input.filename);
    formData.append('type', 'input');
    formData.append('overwrite', 'true');
    const uploadResponse = await fetch(`${server}/upload/image`, { method: 'POST', body: formData });
    const uploadPayload = await uploadResponse.json().catch(() => null);
    if (!uploadResponse.ok || !uploadPayload || !uploadPayload.name) {
        throw new Error(`上传失败（HTTP ${uploadResponse.status}）：${JSON.stringify(uploadPayload)}`);
    }
    const imageName = uploadPayload.subfolder ? `${uploadPayload.subfolder}/${uploadPayload.name}` : uploadPayload.name;
    console.log(`[2/5] 上传成功：${imageName}`);

    // 3) 提交
    const workflow = buildWorkflow(options, imageName, options.prompt, randomSeed());
    const promptResponse = await fetch(`${server}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: `magicwand-smoke-${randomUUID()}` })
    });
    const promptPayload = await promptResponse.json().catch(() => null);
    if (!promptResponse.ok || !promptPayload || !promptPayload.prompt_id) {
        throw new Error(`提交工作流失败：${formatComfyError(promptPayload, `HTTP ${promptResponse.status}`)}`);
    }
    const promptId = promptPayload.prompt_id;
    console.log(`[3/5] 已提交：${promptId}（前面还有 ${promptPayload.number || 0} 个任务）`);

    // 4) 轮询
    const deadline = Date.now() + options.timeout * 1000;
    let imageInfo = null;
    while (Date.now() < deadline) {
        await sleep(2000);
        const historyResponse = await fetch(`${server}/history/${promptId}`);
        if (!historyResponse.ok) continue;
        const history = await historyResponse.json();
        const entry = history[promptId];
        if (!entry) {
            const queueResponse = await fetch(`${server}/prompt`);
            if (queueResponse.ok) {
                const queuePayload = await queueResponse.json();
                const remaining = queuePayload.exec_info ? queuePayload.exec_info.queue_remaining : null;
                process.stdout.write(`\r[4/5] 等待中 ${Math.round((Date.now() - startedAt) / 1000)}s，队列剩余 ${remaining}   `);
            }
            continue;
        }
        if (entry.status && entry.status.status_str === 'error') {
            throw new Error(`生成失败：${JSON.stringify(entry.status.messages || [])}`);
        }
        if (entry.status && entry.status.completed) {
            const images = Object.values(entry.outputs || {}).flatMap((output) => output.images || []);
            if (!images.length) throw new Error('生成完成但没有输出图片');
            imageInfo = images[0];
            break;
        }
    }
    console.log('');
    if (!imageInfo) {
        throw new Error(`等待超时（${options.timeout}s）`);
    }
    console.log(`[4/5] 生成完成，用时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s：${imageInfo.filename}`);

    // 5) 下载
    const query = new URLSearchParams({
        filename: imageInfo.filename,
        subfolder: imageInfo.subfolder || '',
        type: imageInfo.type || 'output'
    });
    const viewResponse = await fetch(`${server}/view?${query}`);
    if (!viewResponse.ok) {
        throw new Error(`下载结果失败：HTTP ${viewResponse.status}`);
    }
    const buffer = Buffer.from(await viewResponse.arrayBuffer());
    await writeFile(options.out, buffer);
    console.log(`[5/5] 已保存：${options.out}（${(buffer.length / 1024).toFixed(0)} KB）`);
    console.log(`冒烟测试通过，总耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
    console.error(`\n冒烟测试失败：${error.message}`);
    process.exit(1);
});
