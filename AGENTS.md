# AGENTS.md

Guide for agentic coding agents operating in this repository.

## Project Overview

This is a Tampermonkey/Greasemonkey userscript for AI-powered image editing on web pages. The script detects images on any webpage, injects edit buttons, and allows users to edit images via a ComfyUI API with slider comparison between original and edited images.

**Tech Stack**: Pure JavaScript (ES6+), Tampermonkey API (GM_*), CSS, no build system or external dependencies.

## Build/Lint/Test Commands

This project has no build system, package manager, or automated tests. Verification:

```bash
# Syntax check
node --check magicwand.user.js

# ComfyUI 直连冒烟测试（Node 18+，无依赖）：验证
# 上传图片 → 提交工作流 → 轮询历史 → 下载结果 全链路
node tools/comfyui-smoke.mjs --server https://host:8443
node tools/comfyui-smoke.mjs --server https://host:8443 --image ./photo.jpg \
     --prompt "把她的上衣换成红色" --megapixels 1.5 --out out.png

# Install in browser
# 1. Open Tampermonkey extension → Create new script
# 2. Paste magicwand.user.js content → Save
# 3. Test on any webpage with images (100x100px minimum)
```

**Manual Testing**: Verify magic wand button appears on image hover, edit panel displays, API calls work, slider comparison functions, and that closing the panel mid-generation cancels the ComfyUI job (check `GET /queue`).

## Code Style Guidelines

### Structure

- Single IIFE pattern with `'use strict';` at top
- Order: Configuration → State → Styles → Helper Functions → Core Logic → Initialization

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Variables/Functions | camelCase | `activePanel`, `createEditButton()` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_CONFIG`, `MAGIC_WAND_SVG` |
| CSS classes | kebab-case with `mw-` prefix | `mw-edit-btn`, `mw-panel` |
| Data attributes | `data-magicwand-` prefix | `data-magicwand-processed` |

### Formatting

- **Indentation**: 4 spaces (no tabs)
- **Strings**: Template literals for multi-line HTML/CSS, single quotes otherwise
- **CSS**: Inline via `GM_addStyle()` with 4-space indentation

### Imports

No imports - all dependencies are Tampermonkey APIs declared in userscript header:

```javascript
// @grant GM_addStyle
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_registerMenuCommand
// @grant GM_xmlhttpRequest
// @grant GM_deleteValue
// @connect *
```

### Types and Data Structures

No TypeScript. Use JSDoc-style comments for complex objects:

```javascript
// 结构化参数（COMFY_DEFAULTS），决定脚本在代码里拼装的 Qwen-Image-2.1 编辑工作流
const DEFAULT_CONFIG = {
    comfyUrl: '',         // string: ComfyUI 服务根地址，如 https://host:8443（不是 /generate）
    apiKey: '',           // string: Optional auth token（反向代理/隧道鉴权）
    unetName: '',         // string: UNet 模型文件名
    clipName: '',         // string: CLIP 模型文件名（type=qwen_image）
    vaeName: '',          // string: VAE 模型文件名
    loraList: '',         // string: 多行「名称@强度」，按顺序串联
    steps: 25,            // number: 采样步数
    megapixels: 1.5,      // number: 出图像素预算（按原图比例）
    seedMode: 'random',   // 'random' | 'fixed'
    timeout: 300,         // number: 单张总超时（秒）
    workflowTemplate: '', // string: 非空则整份覆盖结构化工作流（%PROMPT% 等占位符）
    enabled: true,        // boolean: Script enabled state
    presetPrompts: [],    // Array<{name: string, prompt: string}>
    customPrompts: []     // Array<{name: string, prompt: string}>
};
```

### ComfyUI 调用契约（v1.1+ 直连，无中间层）

```
POST {comfyUrl}/upload/image   multipart: image=<blob>, type=input, overwrite=true
                              → {name, subfolder, type}
POST {comfyUrl}/prompt         {prompt: <API格式工作流>, client_id}
                              → {prompt_id, number}；失败 400 {error, node_errors}
GET  {comfyUrl}/history/<id>   轮询；status.completed 后取 outputs[*].images[0]
GET  {comfyUrl}/prompt         {exec_info:{queue_remaining}} 用于显示排队数
GET  {comfyUrl}/view?filename&subfolder&type → 图片二进制
GET  {comfyUrl}/queue          判定自己的任务是 pending 还是 running
POST {comfyUrl}/queue          {delete:[prompt_id]} 删除排队任务
POST {comfyUrl}/interrupt      中断当前正在执行的任务
```

工作流细节（默认结构化配置）：`LoadImage → ImageScaleToTotalPixels(%MEGAPIXELS%) → GetImageSize → EmptyLatentImage`，
参考图同时接 `TextEncodeQwenImage21.images.image_1`（注意这个输入名带前缀，来自 COMFY_AUTOGROW_V3）；
`UNETLoader → LoraLoaderModelOnly×N → ModelAttentionBackend(comfy kitchen attention) → KSampler(euler/simple, cfg=1)`。
改模型清单时同步更新 `tools/comfyui-smoke.mjs` 的同名函数。

### Error Handling

- Wrap JSON parsing in try-catch with fallback to defaults
- Use async/await with try-catch for API calls
- Show user-friendly error messages in UI, log details to console
- Always clean up state in `finally` blocks

```javascript
try {
    const imageBlob = await fetchImage(imgSrc);
} catch (error) {
    console.error('[Magicwand] Error:', error);
    showError(panel, error.message || 'Operation failed');
} finally {
    state.processingImages.delete(imgKey);
}
```

### DOM Manipulation

- Use `document.createElement()` for new elements
- Use `innerHTML` for building complex static HTML only
- Always prevent event propagation on interactive elements:

```javascript
btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
});
```

- Clean up event listeners when removing elements

### CSS Conventions

- Prefix all classes with `mw-` to avoid collisions
- z-index hierarchy: Base (normal) → Edit button (9999) → Panels (10000) → Settings overlay (100000)

### Logging

Prefix all console logs with `[Magicwand]`:

```javascript
console.log('[Magicwand] Script loaded, version 1.0.0');
```

### Async Operations

- Use `GM_xmlhttpRequest` wrapped in Promises for cross-origin requests
- JSON 接口统一用 `responseType: 'text'` + `JSON.parse`（避开 Tampermonkey 的 `json` 兼容性差异）；只有取图/上传用 blob
- 长任务（ComfyUI 出图）用轮询 `GET /history/<prompt_id>`，超时默认 300s（共享队列可能排队），并支持取消

```javascript
function fetchImage(url) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: 'blob',
            timeout: 30000,
            onload: (response) => { ... },
            onerror: () => reject(new Error('Network error')),
            ontimeout: () => reject(new Error('Request timeout'))
        });
    });
}
```

### State Management

- Keep global state minimal in a single `state` object
- Persist configuration via `GM_setValue`/`GM_getValue`
- Use Sets for tracking unique items，用 Map 登记进行中的 ComfyUI 任务以便取消

```javascript
const state = {
    config: getConfig(),
    processingImages: new Set(),
    activeJobs: new Map()   // imgKey -> { token: {cancelled}, promptId }
};
```

## Commit Message Format

```
feat: description     # New feature
fix: description      # Bug fix
refactor: description # Code refactoring
docs: description     # Documentation
style: description    # Formatting only
```

## File Organization

```
magicwand/
├── magicwand.user.js    # Main userscript (single file)
├── tools/
│   └── comfyui-smoke.mjs # ComfyUI 直连冒烟测试（Node 18+，与脚本同构工作流）
├── docs/
│   └── plans/           # Implementation plans and design docs
└── AGENTS.md            # This file
```

## Important Notes

- Chinese is used for UI text and comments - maintain this for consistency
- The script runs on all websites (`@match *://*/*`)
- Images must be at least 100x100px to be processed
- 图片编辑走 ComfyUI 原生 API（`/upload/image` → `/prompt` → `/history` → `/view`），不再有自建 MCP `/generate` 中间层
- `comfyUrl` 必须是 ComfyUI 服务根地址；AutoDL 上 ComfyUI 在 **6006 端口（主机名 `u` 前缀）**，6008 端口（`uu` 前缀）是控制面板，填错会 404
- 默认工作流为 Qwen-Image-2.1 图像编辑（B18 基础版 + 解锁 UNet + 一条 NSFW Image Edit LoRA @1.0），模型名随服务器变化，可在设置面板或「高级 → 工作流模板」里替换
- 点击的图片会上传到所配置的 ComfyUI 服务器，设置面板里已明示
