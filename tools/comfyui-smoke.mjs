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
 * 工作流拼装在 tools/comfy-workflow.mjs，需与 magicwand.user.js 的 buildComfyWorkflow() 保持一致。
 */

import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { buildWorkflow, randomSeed } from './comfy-workflow.mjs';
import { downloadImage, getSystemStats, queuePrompt, uploadImage, waitForImage } from './comfy-client.mjs';

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

    const stats = await getSystemStats(server);
    console.log(`[1/5] 连接成功：ComfyUI ${stats.version} · ${stats.device}`);

    const input = await readInputImage(options.image);
    const seed = randomSeed();
    let imageName = '';
    const uploadedName = await uploadImage(server, '', input.buffer, input.filename, input.type);
    imageName = uploadedName;
    console.log(`[2/5] 上传成功：${imageName}`);

    const workflow = buildWorkflow({
        imageName,
        prompt: options.prompt,
        seed,
        clipName: options.clip,
        clipType: options.clipType,
        vaeName: options.vae,
        unetName: options.unet,
        megapixels: options.megapixels,
        refResolution: options.refResolution,
        steps: options.steps,
        cfg: options.cfg,
        samplerName: options.sampler,
        scheduler: options.scheduler,
        loras: options.loras,
        filenamePrefix: 'magicwand-smoke'
    });
    const promptPayload = await queuePrompt(server, '', workflow, `magicwand-smoke-${randomUUID()}`);
    console.log(`[3/5] 已提交：${promptPayload.prompt_id}（前面还有 ${promptPayload.number || 0} 个任务）`);

    const imageInfo = await waitForImage(server, '', promptPayload.prompt_id, {
        timeoutSec: options.timeout,
        pollMs: 2000,
        startedAt,
        onTick({ elapsed, queueRemaining }) {
            process.stdout.write(`\r[4/5] 等待中 ${Math.round(elapsed)}s，队列剩余 ${queueRemaining}   `);
        }
    });
    console.log('');
    console.log(`[4/5] 生成完成，用时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s：${imageInfo.filename}`);

    const buffer = await downloadImage(server, '', imageInfo);
    await writeFile(options.out, buffer);
    console.log(`[5/5] 已保存：${options.out}（${(buffer.length / 1024).toFixed(0)} KB）`);
    console.log(`冒烟测试通过，总耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
    console.error(`\n冒烟测试失败：${error.message}`);
    process.exit(1);
});
