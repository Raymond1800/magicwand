import { randomBytes } from 'node:crypto';

// 与 magicwand.user.js 的 buildComfyWorkflow 保持同一节点结构。
// 浏览器脚本不能 import，改这里时要同步改脚本里的同名拼装。

export function parseLoraList(loraList) {
    const lines = Array.isArray(loraList) ? loraList : String(loraList || '').split('\n');
    return lines
        .map((line) => String(line || '').trim())
        .filter(Boolean)
        .map((line) => {
            const at = line.lastIndexOf('@');
            if (at <= 0) return { name: line, strength: 1 };
            const strength = Number(line.slice(at + 1));
            return {
                name: line.slice(0, at).trim(),
                strength: Number.isFinite(strength) ? strength : 1
            };
        })
        .filter((item) => item.name);
}

export function randomSeed() {
    return Number(randomBytes(8).readBigUInt64BE() >> 12n);
}

export function formatComfyError(payload, fallback) {
    if (!payload || typeof payload !== 'object') return fallback;
    const parts = [];
    if (payload.error && payload.error.message) parts.push(payload.error.message);
    if (payload.error && payload.error.details) parts.push(String(payload.error.details));
    Object.keys(payload.node_errors || {}).forEach((nodeId) => {
        const info = payload.node_errors[nodeId] || {};
        const classType = info.class_type ? ` [${info.class_type}]` : '';
        (info.errors || []).forEach((item) => {
            const message = item && item.message ? item.message : '校验失败';
            const details = item && item.details ? `（${item.details}）` : '';
            parts.push(`节点 ${nodeId}${classType}: ${message}${details}`);
        });
    });
    return parts.length ? parts.join('；') : fallback;
}

function latentSizeInputs(width, height) {
    const w = Number(width);
    const h = Number(height);
    if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
        return { width: Math.round(w), height: Math.round(h), batch_size: 1 };
    }
    return null;
}

export function buildWorkflow(options) {
    const loras = parseLoraList(options.loras ?? options.loraList ?? '');
    const workflow = {
        '4': {
            class_type: 'CLIPLoader',
            _meta: { title: '加载CLIP' },
            inputs: { clip_name: options.clipName, type: options.clipType || 'qwen_image', device: 'default' }
        },
        '13': {
            class_type: 'VAELoader',
            _meta: { title: '加载VAE' },
            inputs: { vae_name: options.vaeName }
        },
        '38': {
            class_type: 'LoadImage',
            _meta: { title: '待编辑原图' },
            inputs: { image: options.imageName }
        },
        '40': {
            class_type: 'ImageScaleToTotalPixels',
            _meta: { title: '按像素预算缩放' },
            inputs: {
                upscale_method: 'lanczos',
                megapixels: options.megapixels,
                resolution_steps: 1,
                image: ['38', 0]
            }
        },
        '41': {
            class_type: 'GetImageSize',
            _meta: { title: '获取尺寸' },
            inputs: { image: ['40', 0] }
        },
        '36': {
            class_type: 'EmptyLatentImage',
            _meta: { title: '空Latent' },
            inputs: latentSizeInputs(options.width, options.height) || { width: ['41', 0], height: ['41', 1], batch_size: 1 }
        },
        '37': {
            class_type: 'TextEncodeQwenImage21',
            _meta: { title: 'Qwen文本/参考图编码' },
            inputs: {
                prompt: options.prompt,
                negative_prompt: '',
                resolution: options.refResolution,
                clip: ['4', 0],
                'images.image_1': ['40', 0],
                vae: ['13', 0]
            }
        },
        '5': {
            class_type: 'UNETLoader',
            _meta: { title: '加载UNet' },
            inputs: { unet_name: options.unetName, weight_dtype: 'default' }
        },
        '25': {
            class_type: 'VAEDecode',
            _meta: { title: 'VAE解码' },
            inputs: { samples: ['23', 0], vae: ['13', 0] }
        },
        '9': {
            class_type: 'SaveImage',
            _meta: { title: '保存图像' },
            inputs: { filename_prefix: options.filenamePrefix || 'magicwand', images: ['25', 0] }
        }
    };

    let modelRef = ['5', 0];
    loras.forEach((lora, index) => {
        const nodeId = `lora_${index}`;
        workflow[nodeId] = {
            class_type: 'LoraLoaderModelOnly',
            _meta: { title: `LoRA ${index + 1}` },
            inputs: { lora_name: lora.name, strength_model: lora.strength, model: modelRef }
        };
        modelRef = [nodeId, 0];
    });

    workflow['39'] = {
        class_type: 'ModelAttentionBackend',
        _meta: { title: '注意力后端' },
        inputs: { attention: 'comfy kitchen attention', model: modelRef }
    };
    workflow['23'] = {
        class_type: 'KSampler',
        _meta: { title: 'K采样器' },
        inputs: {
            seed: options.seed,
            steps: options.steps,
            cfg: options.cfg,
            sampler_name: options.samplerName,
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
