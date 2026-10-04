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
├── magicwand.user.js      # Main userscript (single file)
├── tools/
│   ├── comfyui-smoke.mjs  # ComfyUI 直连冒烟测试（Node 18+）
│   ├── comfy-workflow.mjs # 与脚本同构的工作流，冒烟测试和本地预览共用
│   ├── comfy-client.mjs   # 上传、提交、轮询、下载
│   ├── prompt-catalog.mjs # 从 magicwand.user.js 读出提示词分组
│   ├── preview-server.mjs # 本地批量预览，启动时读目录
│   └── preview.html
├── docs/
│   └── plans/             # Implementation plans and design docs
└── AGENTS.md              # This file
```

`tools/preview-config.json` 和 `tools/preview-out/` 是本地运行产物，已 gitignore。

## Important Notes

- Chinese is used for UI text and comments - maintain this for consistency
- The script runs on all websites (`@match *://*/*`)
- Images must be at least 100x100px to be processed
- 图片编辑走 ComfyUI 原生 API（`/upload/image` → `/prompt` → `/history` → `/view`），不再有自建 MCP `/generate` 中间层
- `comfyUrl` 必须是 ComfyUI 服务根地址；AutoDL 上 ComfyUI 在 **6006 端口（主机名 `u` 前缀）**，6008 端口（`uu` 前缀）是控制面板，填错会 404
- 默认工作流为 Qwen-Image-2.1 图像编辑（B18 基础版 + 解锁 UNet + 一条 NSFW Image Edit LoRA @1.0），模型名随服务器变化，可在设置面板或「高级 → 工作流模板」里替换
- 点击的图片会上传到所配置的 ComfyUI 服务器，设置面板里已明示
- 改内置提示词时沿用下一节「提示词优化」：先对出图判断是哪一种失败，只改那一句，同一工作流复检出图后再写回脚本

## 提示词优化

这一轮改的是姿势、互动和足交。出图模型一直是脚本里的 Qwen-Image-2.1 编辑工作流，没有换成别的模型。后面优化一条提示词，按这个顺序做。

### 循环

1. 只改和出图对不上的那一句。用户点名效果好的条目保持原句。
2. 用用户给出的原图，走 `tools/comfy-workflow.mjs` 的 `buildWorkflow`，与脚本同构：25 步、euler/simple、cfg 1、1.5 百万像素、默认那一条 Edit LoRA。出图比例跟着原图走。竖图上不要把身体写成横贯画面，那个写法会和画布打架，身体会塌成站立或挤在一角。
3. 整组预览用 `node tools/preview-server.mjs`。目录在进程启动时从 `magicwand.user.js` 读入，改完提示词要重启，刷新页面不会重读。单条反复试也用这一套上传、提交、轮询、下载。
4. 看局部裁图，尤其是手、脚和多出来的躯干。断肢、多指、接不上的手腕，裁开才看得出来。
5. 一张图的构图站住之后，换一个种子再出一张。两张都过，才把测过的那句写回脚本。调试用的文本里不写 `{decorator}`，否则这几个字会原样送进模型。写回脚本时，`{decorator}` 放在身份句前面。
6. 写回后跑 `node --check magicwand.user.js`。

### 写法

- 短中文祈使句。人物身份用 `<image1>`，不重写五官。画面里新增的男人写成「中国男人」，不写高大、肌肉。
- 用一句肯定的空间顺序把身体排开：这是谁的身体，部位从哪里连到哪里，在画面的哪一侧。cfg 为 1，否定句约束不住，还会把被否定的东西画出来。
- 镜头或姿势一定会改掉的属性，不要写进保留句。机位变化时，身份句用「人物身份以<image1>为准，面部结构和发型保持不变」。
- 只改服装或表情的局部编辑，可以继续锁姿态、背景和光线。
- 不写 SD 权重和画质词。画面里要出现的文字用 ASCII 双引号，引号两侧留空格。拆解按钮的提示词保持它现有的字符串。

### 这轮对过出图的失败，以及改法

**保留句把机位锁死。** 俯拍看起来仍是站着的人，背后是墙；仰拍不是贴着地面从脚往上。保留句锁了背景、身体比例和光线，和机位要改的东西对着干。改法是先写身体在画面里的朝向、镜头放在哪里，再写近处大、远处小。背景写成这个机位看得到的面：俯拍是身下的床或地板，仰拍是头顶的天花板或天空。脱衣和留衣成对改。俯拍、仰拍用户看过出图后，同一写法用在跪仰、坐低、翘臀。侧跪、正面、靠俯、扭站没有这层冲突，保持原句。

**阴茎没有主人，就长出第二具男性身体。** 互动贴、足交、床边喉、后指里，阴茎先作为单独的物体出现，点名的那个男人被放到了别处，模型就给阴茎另长一具躯干。改法是先放好这一个男人，阴茎从他的小腹长出，手上的动作也标明是他的手，位置排成一条不会叠到一起的线。床边喉改成侧面：肩和胸留在床垫上，脖子弯过床沿，头垂向地板；男人站在地板上、她的头顶外侧，两只脚都踩在地板上。`tools/preview-out/20261003-210229/02-互动床边喉.png` 和这句一致。

**位置词在腿折叠之后会塌成同一个地方。** 「面向她的头」「站在床边」「两脚之间」在腿弯起来以后，头那一侧和脚那一侧变成同一处，「两脚之间」就画成插入胯部。竖构图里写「头在上、脚在下」，会被读成这个人站着。既要求膝盖伸直、又要求脚掌对着镜头时，脚会平放在小腹上，阴茎指向骨盆。

**半身肖像的先验会留下来。** 原图是脸大、居中、户外背景时，除非新句子把脸在画面里缩小，并把身体四周写成床，否则脸和室外背景还在。

**足交在竖图上能站住的几何。** 镜头在床尾，正对两只脚掌。脸在画面最上方。膝盖弯向胸口，两只脚掌在画面下半、对着镜头，从左右夹住阴茎，脚心和脚趾都贴着柱身。阴茎从画面最底边那一名男人的小腹长出，顶端停在两只脚掌之间、朝向镜头，他的小腹贴着两只脚后跟。这个男人的头在镜头后面，画面里只有他的小腹。用户确认这版构图可以之后，后面只改手。

**手要有落点，而且手腕得连到肩膀。** 句子里不写手时，前臂消失在抬起的膝盖后面，袖口像是断的（`tools/preview-out/20261003-213532/01-互动足交.png`）。手掌摊在髋部旁边的床单上时，床单上会多一只接不到肩膀的手。改成握住同侧小腿时，每条小腿上出现两只手，腿并拢，阴茎被抬到脚掌上方。能站住的句子是：两只手掌放在肩膀外侧、和肩膀齐平，掌心向下，五指并拢，手腕连着从肩膀伸出来的前臂。两个种子的出图在 `tools/preview-out/footjob-debug/v7.png` 和 `v7b.png`：手都落在锁骨上，手指完整，前臂连着肩膀，足交的几何还在。句子写的是床单，模型稳定画成锁骨。以这两张出图为准，不要为了和字面一致再换成一句没有出过图的说法。这条没有锁服装，有的种子留着上衣，有的种子脱掉。

**传教的平躺输给了半身肖像。** 原句只写「平躺，双腿大幅分开」，又锁了身体比例、背景和光线。出图是上身坐直、脸大居中，和骑乘一样。插入那句是对的，保留「画面最下边只出现一名中国男人的阴茎和髋部」。改成镜头贴近床面，从<image1>中女性张开的双膝之间看向她的脸；后背、肩膀和后脑贴着白色床单；胯在下半、离镜头近，头在上半、脸比胯小。种子 21004301、21004302 的出图在 `tools/preview-out/missionary-debug/`：两张都是仰卧，阴茎从最下边的髋部插入。这两张还没有第一处的 `<image1>中女性`，是用户要求补上的，躺姿和插入没有再出图。

**互动握的手留在包带上。** 原句只写「她的一只手握住他勃起的阴茎」。出图里这只手继续抓包带，阴茎悬在包旁边，或者换成男人自己的手去握。站立、看镜头和保留句没动。阴茎从他的小腹长出，伸到她髋前。她靠近他这一侧的那一只手握住中段，掌心包住柱身，五指并拢，手腕连着从她肩膀垂下来的前臂。他的两只手垂在他自己的大腿外侧。种子 21004101、21004102 的出图在 `tools/preview-out/grip-debug/`：都是她的手握住，手腕接进袖口，阴茎连着他的小腹。21004101 的拳头旁边还留着原图的包带。以这两张为准。

**后入的侧身输给了竖图。** 原句是「严格侧身的四肢着地」，又锁了身体比例、背景和光线。出图留在户外，男人变成没有头的躯干。参考构图是镜头在脸前，脸近且大，俯卧，臀在远处抬高，男人跪在臀后，阴茎从他的小腹进入。写回的句子是床垫上的镜头、近处大脸、远处小臀、白色床单。种子 21004406 在 `tools/preview-out/rear-debug/v3-21004406.png`：后背连着臀，阴茎从他的小腹进入臀缝。同一句的 21004405 把后脑叠进臀缝。用户看过这版，要求写回，说比原来好。不要为了消掉叠头再重写。

**互动69在竖图上两头叠在一起。** 新原图是 `tools/preview-out/20261003-221732/source.jpg`，户外半身。旧句出图 `07-互动69.png`：她嘴里一根阴茎，他嘴里又一根，腿叠在中间。侧面斜线会挤进一个角。俯拍加白色床单能去掉户外背景。种子 21004209（`tools/preview-out/69-debug/v5-21004209.png`）是同一句里过的那张：他的脚和小腹在右上，阴茎从这一个小腹进入她的嘴，她的手握住；他的头在画面底边，夹在她两条大腿中间，嘴贴着阴部。同一句的 21004210 在他头旁边又长出一根阴茎。把脸写到「画面下半中央」，脸会贴上阴茎。两张没有都过。用户要求去掉，已从 testPrompts 删除，不要加回去。

### 已经按这个方案改过的条目

没有新的出图问题，就不要把这些句子再重写一遍。

- 姿势：俯拍、仰拍、跪仰、坐低、翘臀。脱衣和留衣都改了。侧跪、正面、靠俯、扭站保持原句。
- 传教改过，见上面的出图。骑乘没有改。
- 后入改过，见上面的出图。用户点名这版比侧身原句好。
- 后入视改过。视角跟 `05-pov-rear.png`：镜头是身后男人的眼睛，臀在画面下半离镜头近，脸在上半回头，他的小腹在画面最下边，前臂从左右下角伸入按住她的臀。用户要求留原场景，句子写「她面朝的深处仍是<image1>里的环境」，不写床。种子 21004501、21004502 在 `tools/preview-out/pov-rear-debug/`，户外还在。把她的手肘写到肩外地面上时，21004503 多出一只接不到前臂的手。不要为了这只手再改句。
- 互动里按「一个男人、阴茎从他的小腹长出」改过的：贴、后指、床边喉、握。床边喉和握有出图对照，见上面的预览图。贴和后指用的是同一句式，还没有单独复检。
- 互动里按同一空间顺序改过、还没有逐张复检出图的：坐脸、腿磨、壁站、侧勺、椅对、乳口。
- 互动69已从 testPrompts 删除，不要加回去。
- 这轮没有改句：互动吻、互动枕、互动乳。其中枕、乳是用户认定效果好的。
- 足交用上面的床尾构图，加上肩膀高度的那句手。

### 再遇到一条对不上的提示词

先裁图，判断是机位被保留句锁死、长出第二个人、位置词塌缩、竖图被读成站立，还是手没有落点或手腕断开。只改对应的那一句，用同一张原图和同一条工作流出图。两张种子都过，再写回脚本。不要把整组提示词改成另一种文风。
