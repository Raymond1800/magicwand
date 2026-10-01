// ==UserScript==
// @name         Magicwand - 魔法图片编辑
// @namespace    https://magicwand.ai/
// @version      1.1.0
// @description  AI图片编辑油猴脚本，支持预置提示词和自定义编辑
// @author       Magicwand
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_deleteValue
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 脚本版本（与 userscript 头部保持一致）
    const SCRIPT_VERSION = '1.1.0';

    // ComfyUI 默认工作流配置（Qwen-Image-2.1 图像编辑：B18 基础版 + 解锁 UNet + NSFW LoRA）
    // 该组合已在目标服务器上通过 /upload/image → /prompt → /history → /view 全链路实测
    const COMFY_DEFAULTS = {
        unetName: 'qwen/REDQW21-UNLOCKED-v1-BF16-ComfyMCP-builtwithqwen.safetensors',
        clipName: 'qwen3vl_8b_int8_convrot.safetensors',
        clipType: 'qwen_image',
        vaeName: 'qwen_image_2.1_vae_bf16.safetensors',
        loraList: 'qwen/Qwen-Image-2.1 NSFW Image EditV2.safetensors@1.0\nqwen/Qwen-Image-2.1 NSFW Image EditV2.safetensors@0.8',
        steps: 25,               // Qwen-Image-2.1 参考默认步数
        cfg: 1,                  // 固定为 1（负向分支被忽略）
        samplerName: 'euler',
        scheduler: 'simple',
        refResolution: 1024,     // 参考图喂给文本编码器的分辨率（不影响出图尺寸）
        megapixels: 1.5,         // 出图像素预算，按原图比例缩放
        seedMode: 'random',      // 'random' | 'fixed'
        fixedSeed: 0,
        timeout: 300,            // 单张总超时（秒），排队繁忙时需要
        pollInterval: 1.5,       // 轮询 /history 间隔（秒）
        workflowTemplate: ''     // 非空时整份覆盖结构化配置（支持 %IMAGE% %PROMPT% %SEED% 等占位符）
    };

    // 配置默认值
    const DEFAULT_CONFIG = {
    comfyUrl: '',
    apiKey: '',
    ...COMFY_DEFAULTS,
    enabled: true,
    // 编辑提示词按 Qwen-Image-2.1 官方改写规范：短指令、只写要改的属性、一句保留、不用权重和质量词
    presetPrompts: [
        { name: '全裸', prompt: '脱掉图中女性的上衣、下装和内衣，让身体完全裸露。{decorator}保持人物身份、姿态、背景和光线与原图一致。' },
        { name: '绝顶颜', prompt: '只改变图中女性的表情：双眼上翻，舌头微微伸出，口水从嘴角和下巴滴落，脸颊潮红。{decorator}保持人物身份、服装、姿态、背景和光线与原图一致。' },
        { name: '碎衣', prompt: '把图中女性的外衣改成大幅撕裂的状态：衣物拉开、破口很大、边缘毛糙，破口处露出皮肤。{decorator}保持人物身份、姿态、背景和光线与原图一致。' },
        { name: '透视', prompt: '把图中女性的外衣改成极薄的半透明面料，衣褶和垂坠还在，里面的内衣和身体轮廓清楚可见。{decorator}保持人物身份、姿态、背景和光线与原图一致。' },
        { name: '黑内衣', prompt: '把图中女性的整套服装换成黑色三点式内衣、黑色过膝长袜和吊袜带。{decorator}保持人物身份、姿态、背景和光线与原图一致。' },
        { name: '红内衣', prompt: '把图中女性的整套服装换成红色三点式内衣、红色过膝长袜和吊袜带。{decorator}保持人物身份、姿态、背景和光线与原图一致。' },
        { name: '口交', prompt: '改为男性第一人称视角。图中女性正在给勃起的阴茎做深喉口交，脸上有白色精液并往下滴。{decorator}保持人物身份、背景和光线与原图一致。' },
        { name: '跪口', prompt: '图中女性跪在一名站立男性身前，上身前倾，双手放在他的大腿上，给他勃起的阴茎口交。男性双手轻扶她的头。{decorator}保持人物身份、背景和光线与原图一致。' },
        { name: '跨腿口', prompt: '改为向下看的第一人称视角：图中女性跪在观看者分开的双腿之间，上身伏在腿上，双手撑着大腿，给勃起的阴茎口交。画面只出现男性的小腹、阴茎和手，焦点在女性的脸和上半身。{decorator}保持人物身份与原图为同一人。' },
        { name: '骑乘', prompt: '图中女性跨坐在仰卧男性身上，面朝他，上身坐直，双膝弯曲，双手放在他胸口。男性躺着扶住她的腰，阴茎插入她的阴道。{decorator}保持人物身份、背景和光线与原图一致。' },
        { name: '传教', prompt: '图中女性平躺，双腿大幅分开。画面里只出现男性的阴茎和髋部，正在深入插入她的阴道。{decorator}保持人物身份、背景和光线与原图一致。' },
        { name: '后入', prompt: '图中女性呈严格侧身的四肢着地姿势，腰部下塌，臀部抬高，回头看向镜头。她身后的男性把阴茎完全插入她的阴道。{decorator}保持人物身份、背景和光线与原图一致。' },
        { name: '后入视', prompt: '改为从后侧略偏的第一人称视角：图中女性四肢着地，身体四分之三朝向镜头，腰部下塌，臀部后送，转头让脸清晰可见。画面只出现男性的阴茎、小腹和抓住她髋部的手，阴茎正在插入她的阴道。{decorator}保持人物身份与原图为同一人。' },
        { name: '互动握', prompt: '图中女性站立，身体微侧，头转向身旁一名高大的肌肉男性，双腿分开，看向镜头。她的一只手握住他勃起的阴茎。{decorator}保持人物身份、背景和光线与原图一致。' },
        { name: '互动吻', prompt: '图中女性站直，双腿微开，头侧开露出耳朵，看向镜头。一名高大的肌肉男性站在她身后，亲吻并轻咬她的耳垂，双手隔着上衣揉她的胸，他勃起的阴茎把裤裆顶起。{decorator}保持人物身份、背景和光线与原图一致。' },
        { name: '互动贴', prompt: '图中女性跪着，上身挺直，仰头看向镜头，嘴微张。一名高大的肌肉男性站在她面前，勃起的阴茎贴在她的脸颊旁，她的左手握住根部。{decorator}保持人物身份、背景和光线与原图一致。' },
        { name: '互动枕', prompt: '图中女性侧躺在床上，用一只肘支撑，头枕在手上，看向镜头。床边一名高大的肌肉男性把勃起的阴茎贴在她嘴边的脸颊上，她用手托住。{decorator}保持人物身份与原图为同一人。' },
        { name: '互动乳', prompt: '图中女性跪着，上身挺直，胸部向前。一名高大的肌肉男性站在她面前，用勃起的阴茎贴着她的胸部摩擦。{decorator}保持人物身份、背景和光线与原图一致。' },
        { name: '躺开', prompt: '脱掉图中女性的全部衣物。她平躺，双腿以M形大幅分开，膝盖向外弯曲，阴部完全露出并位于画面中央。{decorator}保持人物身份、背景和光线与原图一致。' },
        { name: '趴开', prompt: '脱掉图中女性的全部衣物。她面朝下，臀部高高抬起并正对镜头，双腿大幅分开，腰深陷，回头越过肩膀看向镜头。{decorator}保持人物身份、背景和光线与原图一致。' }
    ],
    testPrompts: [
        { name: '互动足交', prompt: '图中女性仰躺在床上，上身微微支起，看向镜头。一名高大的肌肉男性跪在她脚前，她用两只光脚夹住并套弄他勃起的阴茎，脚趾扣在柱身上。{decorator}保持人物身份与原图为同一人。' },
        { name: '互动69', prompt: '改为侧躺的69姿势：图中女性侧躺，一条腿高抬，含住男性勃起的阴茎。男性把脸埋在她两腿之间，舔她的阴部。{decorator}保持人物身份与原图为同一人。' },
        { name: '互动坐脸', prompt: '图中女性跨坐在男性脸上，双膝分在他头的两侧，臀部压低，阴部贴住他的嘴，她低头看向镜头。男性双手抓住她的大腿。{decorator}保持人物身份与原图为同一人。' },
        { name: '互动床边喉', prompt: '图中女性仰躺，头垂在床沿外面，给勃起的阴茎做深喉，喉咙微微鼓起。一名高大的肌肉男性站在床边，双手轻扶她的头。{decorator}保持人物身份与原图为同一人。' },
        { name: '互动后指', prompt: '图中女性站立，背贴着一名高大肌肉男性的胸口。他从身后抱住她，一只手揉她的胸，另一只手伸到两腿之间插入她的阴道，并亲吻她的脖子。她反手握住他勃起的阴茎。{decorator}保持人物身份、背景和光线与原图一致。' },
        { name: '互动腿磨', prompt: '图中女性面朝男性坐在他腿上，双腿大幅分开。她用阴部磨蹭他勃起的阴茎，阴茎夹在她的大腿之间。她的手放在他肩上，他的手放在她的腰上。{decorator}保持人物身份与原图为同一人。' },
        { name: '互动壁站', prompt: '图中女性站立前倾，双掌抵在竖直的墙面上，腰深陷，臀部后送。一名高大的肌肉男性从身后贴住她，一只手抓住她的髋，另一只手抓住她的肩，勃起的阴茎深入她的阴道。{decorator}保持人物身份与原图为同一人。' },
        { name: '互动侧勺', prompt: '图中女性侧躺，上面那条腿微抬并弯曲。一名高大的肌肉男性紧贴在她身后，一只手臂环住她并握住她的胸，勃起的阴茎插入她的阴道。{decorator}保持人物身份与原图为同一人。' },
        { name: '互动椅对', prompt: '图中女性跨坐在一名坐着的高大肌肉男性身上，面对面，双膝分在他髋部两侧。她的手放在他肩上，他的手抓住她的腰，阴茎完全插入她的阴道。{decorator}保持人物身份与原图为同一人。' },
        { name: '互动乳口', prompt: '图中女性跪直，胸部前挺，用双乳夹住一根勃起的阴茎，同时舔并含住顶端。一名高大的肌肉男性站在她面前。{decorator}保持人物身份、背景和光线与原图一致。' }
    ],
    customPrompts: [],
    decorators: [
        { name: '散衣', prompt: '她脱下的内衣、袜子和其他衣物散落在身体周围的地面上' },
        { name: '颜射', prompt: '她脸上有浓厚的精液，从嘴角和脸颊往下滴' },
        { name: '胸射', prompt: '她的胸部和乳沟上有浓厚的精液，正在往下滴' },
        { name: '内射', prompt: '她的阴部内外有浓厚的精液，并沿大腿往下滴' },
        { name: '汗', prompt: '她全身布满汗珠，皮肤湿亮' },
        { name: '油', prompt: '她全身涂满油，皮肤反光很强' },
        { name: '泪', prompt: '她脸上有快感的泪水，睫毛膏晕开，眼睛是湿的' },
        { name: '咬痕', prompt: '她的脖子、胸部、大腿和肩膀上有红色咬痕和吻痕' },
        { name: '掌印', prompt: '她的臀部、胸部和腰上有红色手印' },
        { name: '项圈', prompt: '她戴着黑色皮质项圈，项圈上有金属环和短链' },
        { name: '乳夹', prompt: '她的乳头夹着银色乳夹，乳夹连着细链向下拉' },
        { name: '跳蛋', prompt: '一根粉色跳蛋深深插入她的阴道，看得出正在振动' },
        { name: '假阳', prompt: '一根写实的假阳具插入她的阴道，底座露在外面' },
        { name: '肛塞', prompt: '一枚金属肛塞插入她的肛门，宝石底座露在外面' },
        { name: '破袜', prompt: '她穿着黑色过膝袜，袜子上有大片抽丝和破洞' },
        { name: '花妆', prompt: '她的妆花了，睫毛膏晕开，口红被抹开' },
        { name: '潮红', prompt: '她的脸、脖子和胸口有明显的情欲潮红' },
        { name: '湿', prompt: '她的阴部非常湿润，有爱液滴下' },
        { name: '潮吹', prompt: '她正在潮吹，液体喷出并四处滴落' },
        { name: '泌乳', prompt: '她的乳头正在溢奶，乳白色液滴在胸部' },
        { name: '鞭痕', prompt: '她的臀部和背上有浅红色鞭痕' },
        { name: '纹身', prompt: '她身上有临时书写的 "cumslut"、"property" 和心形符号' }
    ],
    rowNames: ['裸俯拍', '裸仰拍', '裸侧跪', '裸正面', '裸跪仰', '裸坐低', '裸翘臀', '裸靠俯', '裸扭站'],

    row1Prompts: [
        { prompt: '脱掉图中女性的全部衣物。她仰躺，镜头从正上方俯拍。{decorator}保持人物身份、背景和光线与原图一致。' },
        { prompt: '脱掉图中女性的全部衣物。她站直，镜头贴近地面向上仰拍。{decorator}保持人物身份、背景和光线与原图一致。' },
        { prompt: '脱掉图中女性的全部衣物。她跪在地上，身体转成严格的正侧面，与镜头成90度。{decorator}保持人物身份、背景和光线与原图一致。' },
        { prompt: '脱掉图中女性的全部衣物。她正面站立，面对镜头。{decorator}保持人物身份、背景和光线与原图一致。' },
        { prompt: '脱掉图中女性的全部衣物。她跪在地上，镜头从高处往下拍，她抬头看向镜头。{decorator}保持人物身份、背景和光线与原图一致。' },
        { prompt: '脱掉图中女性的全部衣物。她坐在高椅或桌沿上，镜头从很低的角度向上拍，双腿是画面主体。{decorator}保持人物身份与原图为同一人。' },
        { prompt: '脱掉图中女性的全部衣物。她四肢着地，臀部抬高并正对镜头，回头越过肩膀看向镜头。{decorator}保持人物身份、背景和光线与原图一致。' },
        { prompt: '脱掉图中女性的全部衣物。她呈四分之三侧面，上身前倾，靠在墙或栏杆上。{decorator}保持人物身份与原图为同一人。' },
        { prompt: '脱掉图中女性的全部衣物。她站立，重心落在一只脚上，身体形成对立平衡，镜头略微倾斜。{decorator}保持人物身份、背景和光线与原图一致。' }
    ],
    row2Prompts: [
        { prompt: '把图中女性的姿势改为仰躺，镜头从正上方俯拍，服装保持原样。{decorator}保持人物身份、背景和光线与原图一致。' },
        { prompt: '把图中女性的姿势改为站直，镜头贴近地面向上仰拍，服装保持原样。{decorator}保持人物身份、背景和光线与原图一致。' },
        { prompt: '把图中女性的姿势改为跪在地上的严格正侧面，身体与镜头成90度，服装保持原样。{decorator}保持人物身份、背景和光线与原图一致。' },
        { prompt: '把图中女性的姿势改为正面站立、面对镜头，服装保持原样。{decorator}保持人物身份、背景和光线与原图一致。' },
        { prompt: '把图中女性的姿势改为跪在地上，镜头从高处往下拍，她抬头看向镜头，服装保持原样。{decorator}保持人物身份、背景和光线与原图一致。' },
        { prompt: '把图中女性的姿势改为坐在高椅或桌沿上，镜头从很低的角度向上拍，双腿是画面主体，服装保持原样。{decorator}保持人物身份与原图为同一人。' },
        { prompt: '把图中女性的姿势改为四肢着地，臀部抬高并正对镜头，回头越过肩膀看向镜头，服装保持原样。{decorator}保持人物身份、背景和光线与原图一致。' },
        { prompt: '把图中女性的姿势改为四分之三侧面，上身前倾靠在墙或栏杆上，服装保持原样。{decorator}保持人物身份与原图为同一人。' },
        { prompt: '把图中女性的姿势改为站立，重心落在一只脚上，镜头略微倾斜，服装保持原样。{decorator}保持人物身份、背景和光线与原图一致。' }
    ]
};

    function getDefaultPresetPrompts() {
        return DEFAULT_CONFIG.presetPrompts.map((item) => ({ ...item }));
    }

    function buildDefaultConfig() {
        return {
            ...DEFAULT_CONFIG,
            presetPrompts: getDefaultPresetPrompts(),
            customPrompts: []
        };
    }

    // 旧版使用自建 MCP 的 /generate 接口，这里去掉接口路径，迁移为 ComfyUI 服务根地址
    let legacyUrlMigrated = false;

    function migrateLegacyConfig(config, savedConfig) {
        const savedUrl = typeof savedConfig.apiUrl === 'string' ? savedConfig.apiUrl.trim() : '';
        if (!config.comfyUrl && savedUrl) {
            config.comfyUrl = savedUrl.replace(/\/+generate\/?$/i, '').replace(/\/+$/, '');
            legacyUrlMigrated = true;
        }
        return config;
    }

    function clampNumber(value, fallback, min, max) {
        const num = Number(value);
        if (!Number.isFinite(num)) return fallback;
        return Math.min(max, Math.max(min, num));
    }

    // 获取配置
    function getConfig() {
        const saved = GM_getValue('magicwand_config', null);
        let savedConfig = {};
        if (saved) {
            try {
                savedConfig = JSON.parse(saved) || {};
            } catch (e) {
                savedConfig = {};
            }
        }

        const config = { ...buildDefaultConfig(), ...savedConfig };
        config.presetPrompts = getDefaultPresetPrompts();
        config.testPrompts = DEFAULT_CONFIG.testPrompts.map((item) => ({ ...item }));
        config.decorators = DEFAULT_CONFIG.decorators.map((item) => ({ ...item }));
        config.rowNames = DEFAULT_CONFIG.rowNames.slice();
        config.row1Prompts = DEFAULT_CONFIG.row1Prompts.map((item) => ({ ...item }));
        config.row2Prompts = DEFAULT_CONFIG.row2Prompts.map((item) => ({ ...item }));
        if (!Array.isArray(config.customPrompts)) {
            config.customPrompts = [];
        }
        if (!Array.isArray(config.customDecorators)) {
            config.customDecorators = [];
        }

        // 数值字段兜底，避免手工改坏配置导致 /prompt 校验失败
        config.steps = Math.round(clampNumber(config.steps, COMFY_DEFAULTS.steps, 1, 200));
        config.cfg = clampNumber(config.cfg, COMFY_DEFAULTS.cfg, 0.1, 20);
        config.refResolution = Math.round(clampNumber(config.refResolution, COMFY_DEFAULTS.refResolution, 0, 4096));
        config.megapixels = clampNumber(config.megapixels, COMFY_DEFAULTS.megapixels, 0.1, 16);
        config.fixedSeed = Math.round(clampNumber(config.fixedSeed, COMFY_DEFAULTS.fixedSeed, 0, Number.MAX_SAFE_INTEGER));
        config.timeout = Math.round(clampNumber(config.timeout, COMFY_DEFAULTS.timeout, 10, 3600));
        config.pollInterval = clampNumber(config.pollInterval, COMFY_DEFAULTS.pollInterval, 0.5, 10);
        config.seedMode = config.seedMode === 'fixed' ? 'fixed' : 'random';
        if (typeof config.comfyUrl !== 'string') config.comfyUrl = '';
        if (typeof config.workflowTemplate !== 'string') config.workflowTemplate = '';
        config.comfyUrl = config.comfyUrl.trim().replace(/\/+$/, '');

        return migrateLegacyConfig(config, savedConfig);
    }

    // 保存配置
    function saveConfig(config) {
        const configToSave = {
            comfyUrl: typeof config.comfyUrl === 'string' ? config.comfyUrl.trim().replace(/\/+$/, '') : '',
            apiKey: typeof config.apiKey === 'string' ? config.apiKey : '',
            unetName: typeof config.unetName === 'string' ? config.unetName.trim() : COMFY_DEFAULTS.unetName,
            clipName: typeof config.clipName === 'string' ? config.clipName.trim() : COMFY_DEFAULTS.clipName,
            clipType: typeof config.clipType === 'string' ? config.clipType.trim() : COMFY_DEFAULTS.clipType,
            vaeName: typeof config.vaeName === 'string' ? config.vaeName.trim() : COMFY_DEFAULTS.vaeName,
            loraList: typeof config.loraList === 'string' ? config.loraList : COMFY_DEFAULTS.loraList,
            steps: Math.round(clampNumber(config.steps, COMFY_DEFAULTS.steps, 1, 200)),
            cfg: clampNumber(config.cfg, COMFY_DEFAULTS.cfg, 0.1, 20),
            samplerName: typeof config.samplerName === 'string' && config.samplerName.trim() ? config.samplerName.trim() : COMFY_DEFAULTS.samplerName,
            scheduler: typeof config.scheduler === 'string' && config.scheduler.trim() ? config.scheduler.trim() : COMFY_DEFAULTS.scheduler,
            refResolution: Math.round(clampNumber(config.refResolution, COMFY_DEFAULTS.refResolution, 0, 4096)),
            megapixels: clampNumber(config.megapixels, COMFY_DEFAULTS.megapixels, 0.1, 16),
            seedMode: config.seedMode === 'fixed' ? 'fixed' : 'random',
            fixedSeed: Math.round(clampNumber(config.fixedSeed, COMFY_DEFAULTS.fixedSeed, 0, Number.MAX_SAFE_INTEGER)),
            timeout: Math.round(clampNumber(config.timeout, COMFY_DEFAULTS.timeout, 10, 3600)),
            pollInterval: clampNumber(config.pollInterval, COMFY_DEFAULTS.pollInterval, 0.5, 10),
            workflowTemplate: typeof config.workflowTemplate === 'string' ? config.workflowTemplate : '',
            enabled: typeof config.enabled === 'boolean' ? config.enabled : true,
            customPrompts: Array.isArray(config.customPrompts) ? config.customPrompts : [],
            customDecorators: Array.isArray(config.customDecorators) ? config.customDecorators : []
        };
        GM_setValue('magicwand_config', JSON.stringify(configToSave));
        // 返回一份与内存结构一致的配置，避免调用方再读一次存储
        return {
            ...buildDefaultConfig(),
            ...configToSave,
            presetPrompts: getDefaultPresetPrompts(),
            customPrompts: configToSave.customPrompts,
            customDecorators: configToSave.customDecorators
        };
    }

    // 全局状态
    const state = {
        config: getConfig(),
        processingImages: new Set(),
        activeJobs: new Map(),
        pinterestFloatBtn: null,
        pinterestTargetImg: null,
        pinterestHideTimer: null,
        pendingPinterestImages: new Map(),
        pendingPinterestTimer: null,
        videoFloatBtn: null,
        videoTarget: null,
        videoHideTimer: null,
        activeVideoCompare: null
    };

    function isPinterestHost() {
        return (window.location.hostname || '').includes('pinterest.com');
    }

    function isBlacklistedHost() {
        const host = (window.location.hostname || '').toLowerCase();
        return host === 'javbus.com' || host.endsWith('.javbus.com');
    }

    function markHostContext() {
        const host = window.location.hostname || '';
        if (host.includes('pinterest.com')) {
            document.documentElement.classList.add('mw-host-pinterest');
        }
    }

    // 注入样式
    function injectStyles() {
        GM_addStyle(`
            /* 魔法编辑按钮 */
            .mw-edit-btn {
                position: absolute;
                bottom: 8px;
                right: 8px;
                width: 32px;
                height: 32px;
                background: rgba(0, 0, 0, 0.6);
                border-radius: 6px;
                cursor: pointer;
                opacity: 0;
                transition: opacity 0.2s, transform 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
            }
            .mw-edit-btn:hover {
                opacity: 1 !important;
                transform: scale(1.1);
                background: rgba(99, 102, 241, 0.9);
            }
            .mw-edit-btn svg {
                width: 18px;
                height: 18px;
                fill: white;
            }
            .mw-container:hover .mw-edit-btn {
                opacity: 0.7;
            }
            .mw-host-pinterest .mw-edit-btn {
                left: 8px;
                right: auto;
                bottom: 8px;
                opacity: 0.7;
            }
            .mw-floating-btn {
                position: fixed !important;
                left: 0;
                top: 0;
                z-index: 2147483647 !important;
                opacity: 0;
                pointer-events: none;
            }
            .mw-floating-btn.show {
                opacity: 0.9;
                pointer-events: auto;
            }
            .mw-video-floating-btn {
                position: fixed !important;
                left: 0;
                top: 0;
                z-index: 2147483647 !important;
                opacity: 0;
                pointer-events: none;
            }
            .mw-video-floating-btn.show {
                opacity: 0.9;
                pointer-events: auto;
            }

            /* 编辑面板 */
            .mw-panel {
                position: absolute;
                background: white;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                padding: 12px;
                z-index: 10000;
                min-width: 240px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            .mw-panel-title {
                font-size: 13px;
                font-weight: 600;
                color: #333;
                margin-bottom: 10px;
            }
            .mw-preset-grid {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                margin-bottom: 10px;
            }
            .mw-preset-btn {
                padding: 4px 8px;
                background: #f3f4f6;
                border: 1px solid #e5e7eb;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                color: #374151;
                transition: all 0.2s;
            }
            .mw-preset-btn:hover {
                background: #6366f1;
                color: white;
                border-color: #6366f1;
            }
            .mw-test-grid {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                margin-bottom: 10px;
            }
            .mw-test-btn {
                padding: 4px 8px;
                background: #d1fae5;
                border: 1px solid #6ee7b7;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                color: #065f46;
                transition: all 0.2s;
            }
            .mw-test-btn:hover {
                background: #10b981;
                color: white;
                border-color: #059669;
            }
            .mw-decorator-row {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 4px;
                margin-bottom: 10px;
                padding: 6px 8px;
                background: #f0f9ff;
                border-radius: 6px;
            }
            .mw-decorator-label {
                font-size: 11px;
                color: #0369a1;
                font-weight: 500;
                margin-right: 4px;
            }
            .mw-decorator-btn {
                padding: 3px 8px;
                background: white;
                border: 1px solid #bae6fd;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                color: #0c4a6e;
                transition: all 0.2s;
            }
            .mw-decorator-btn:hover {
                background: #e0f2fe;
            }
            .mw-decorator-btn.selected {
                background: #0ea5e9;
                color: white;
                border-color: #0284c7;
            }
            .mw-number-grid {
                display: grid;
                grid-template-columns: repeat(9, 1fr);
                gap: 4px;
                margin-bottom: 8px;
            }
            .mw-number-btn {
                padding: 4px 2px;
                background: #fef3c7;
                border: 1px solid #fcd34d;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 600;
                color: #92400e;
                transition: all 0.2s;
                text-align: center;
                line-height: 1.2;
            }
            .mw-number-btn:hover {
                background: #f59e0b;
                color: white;
                border-color: #d97706;
            }
            .mw-input-area {
                display: none;
                margin-top: 10px;
            }
            .mw-input-area.show {
                display: block;
            }
            .mw-input {
                width: 100%;
                padding: 10px;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                font-size: 13px;
                box-sizing: border-box;
                outline: none;
            }
            .mw-input:focus {
                border-color: #6366f1;
            }
            .mw-actions-row {
                display: flex;
                gap: 8px;
                margin-top: 10px;
            }
            .mw-action-btn {
                flex: 1;
                padding: 8px;
                border-radius: 8px;
                font-size: 12px;
                cursor: pointer;
                border: none;
                transition: all 0.2s;
            }
            .mw-send-btn {
                background: #6366f1;
                color: white;
            }
            .mw-send-btn:hover {
                background: #4f46e5;
            }
            .mw-send-btn:disabled {
                background: #9ca3af;
                cursor: not-allowed;
            }
            .mw-cancel-btn {
                background: #f3f4f6;
                color: #374151;
            }
            .mw-cancel-btn:hover {
                background: #e5e7eb;
            }

            /* 加载状态 */
            .mw-loading {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 20px;
                color: #6b7280;
            }
            .mw-loading-cancel {
                margin-top: 4px;
                padding: 6px 12px;
                background: #f3f4f6;
                color: #374151;
                border: none;
                border-radius: 6px;
                font-size: 12px;
                cursor: pointer;
            }
            .mw-loading-cancel:hover {
                background: #e5e7eb;
            }
            .mw-spinner {
                width: 20px;
                height: 20px;
                border: 2px solid #e5e7eb;
                border-top-color: #6366f1;
                border-radius: 50%;
                animation: mw-spin 0.8s linear infinite;
            }
            @keyframes mw-spin {
                to { transform: rotate(360deg); }
            }

            /* 滑块对比容器 */
            .mw-compare-container {
                position: relative;
                display: inline-block;
                cursor: ew-resize;
                overflow: hidden;
            }
            .mw-compare-container img {
                display: block;
                max-width: none;
            }
            .mw-new-image {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
            }
            .mw-old-image {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                object-fit: inherit;
                clip-path: inset(0 50% 0 0);
            }
            .mw-slider-line {
                position: absolute;
                top: 0;
                bottom: 0;
                width: 2px;
                background: white;
                left: 50%;
                transform: translateX(-50%);
                box-shadow: 0 0 8px rgba(0,0,0,0.3);
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.2s;
            }
            .mw-compare-container:hover .mw-slider-line {
                opacity: 1;
            }
            .mw-slider-handle {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 40px;
                height: 40px;
                background: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.2s;
            }
            .mw-compare-container:hover .mw-slider-handle {
                opacity: 1;
            }
            .mw-slider-handle svg {
                width: 20px;
                height: 20px;
            }

            /* 对比操作按钮 */
            .mw-compare-actions {
                position: absolute;
                top: 8px;
                right: 8px;
                display: flex;
                gap: 6px;
                opacity: 0;
                transition: opacity 0.2s;
                z-index: 10;
            }
            .mw-compare-container:hover .mw-compare-actions {
                opacity: 1;
            }
            .mw-compare-action-btn {
                padding: 6px 12px;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                border: none;
                border-radius: 6px;
                font-size: 11px;
                cursor: pointer;
                transition: background 0.2s;
            }
            .mw-compare-action-btn:hover {
                background: rgba(99, 102, 241, 0.9);
            }

            /* 设置面板 */
            .mw-settings-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 100000;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .mw-settings-panel {
                background: white;
                border-radius: 16px;
                padding: 24px;
                width: 420px;
                max-height: 80vh;
                overflow-y: auto;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            .mw-settings-title {
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 20px;
                color: #111;
            }
            .mw-settings-group {
                margin-bottom: 20px;
            }
            .mw-settings-label {
                font-size: 13px;
                font-weight: 500;
                color: #374151;
                margin-bottom: 6px;
                display: block;
            }
            .mw-settings-input {
                width: 100%;
                padding: 10px 12px;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                font-size: 14px;
                box-sizing: border-box;
                outline: none;
            }
            .mw-settings-input:focus {
                border-color: #6366f1;
                box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
            }
            .mw-settings-hint {
                font-size: 11px;
                color: #9ca3af;
                margin-top: 4px;
            }
            .mw-prompts-list {
                max-height: 200px;
                overflow-y: auto;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
            }
            .mw-prompt-item {
                display: flex;
                align-items: center;
                padding: 10px 12px;
                border-bottom: 1px solid #f3f4f6;
            }
            .mw-prompt-item:last-child {
                border-bottom: none;
            }
            .mw-prompt-info {
                flex: 1;
            }
            .mw-prompt-name {
                font-size: 13px;
                font-weight: 500;
                color: #374151;
            }
            .mw-prompt-text {
                font-size: 11px;
                color: #9ca3af;
                margin-top: 2px;
            }
            .mw-prompt-delete {
                padding: 4px 8px;
                background: #fef2f2;
                color: #ef4444;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
            }
            .mw-add-prompt-btn {
                width: 100%;
                padding: 10px;
                background: #f3f4f6;
                border: 1px dashed #d1d5db;
                border-radius: 8px;
                cursor: pointer;
                font-size: 13px;
                color: #6b7280;
                margin-top: 10px;
            }
            .mw-add-prompt-btn:hover {
                background: #e5e7eb;
            }
            .mw-settings-footer {
                display: flex;
                gap: 10px;
                margin-top: 24px;
            }
            .mw-save-btn {
                flex: 1;
                padding: 12px;
                background: #6366f1;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                cursor: pointer;
            }
            .mw-save-btn:hover {
                background: #4f46e5;
            }
            .mw-close-btn {
                flex: 1;
                padding: 12px;
                background: #f3f4f6;
                color: #374151;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                cursor: pointer;
            }
            .mw-settings-section {
                font-size: 13px;
                font-weight: 600;
                color: #111827;
                margin: 24px 0 12px;
                padding-top: 12px;
                border-top: 1px solid #f3f4f6;
            }
            .mw-settings-textarea {
                width: 100%;
                min-height: 84px;
                padding: 10px 12px;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                font-size: 12px;
                line-height: 1.5;
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                box-sizing: border-box;
                outline: none;
                resize: vertical;
            }
            .mw-settings-textarea:focus {
                border-color: #6366f1;
                box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
            }
            .mw-settings-row {
                display: flex;
                gap: 10px;
            }
            .mw-settings-row .mw-settings-group {
                flex: 1;
            }
            .mw-test-btn {
                width: 100%;
                padding: 10px 12px;
                background: #eef2ff;
                color: #4338ca;
                border: 1px solid #c7d2fe;
                border-radius: 8px;
                font-size: 13px;
                cursor: pointer;
                margin-top: 10px;
            }
            .mw-test-btn:hover {
                background: #e0e7ff;
            }
            .mw-test-status {
                font-size: 12px;
                margin-top: 6px;
                word-break: break-all;
            }
            .mw-test-status.ok {
                color: #059669;
            }
            .mw-test-status.err {
                color: #dc2626;
            }
            .mw-test-status.pending {
                color: #6b7280;
            }

            /* 图片容器 */
            .mw-container {
                position: relative;
                display: contents;
            }

            /* 处理中状态 */
            .mw-processing-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(99, 102, 241, 0.3);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 9998;
                border-radius: 4px;
            }
            .mw-processing-overlay::before {
                content: '';
                width: 40px;
                height: 40px;
                border: 3px solid rgba(255, 255, 255, 0.3);
                border-top-color: white;
                border-radius: 50%;
                animation: mw-spin 0.8s linear infinite;
            }
            .mw-processing-text {
                color: white;
                font-size: 13px;
                font-weight: 500;
                margin-top: 10px;
                text-shadow: 0 1px 3px rgba(0,0,0,0.3);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            .mw-video-processing-overlay {
                position: fixed;
                border-radius: 8px;
                z-index: 10001;
                pointer-events: none;
            }
            .mw-video-compare-layer {
                position: fixed;
                z-index: 10001;
            }
            .mw-video-compare-layer .mw-compare-container {
                width: 100%;
                height: 100%;
            }
        `);
    }

    // 魔法棒SVG图标
    const MAGIC_WAND_SVG = `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a.84.84 0 0 0-1.19 0L3.29 17.17a.84.84 0 0 0 0 1.19l2.35 2.35a.84.84 0 0 0 1.19 0l9.89-9.89a.84.84 0 0 0 0-1.19l-2.35-2.34z"/>
    </svg>`;

    const ARROW_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 8L22 12L18 16"/>
        <path d="M6 8L2 12L6 16"/>
    </svg>`;

    // 创建编辑按钮
    function createEditButton(img, onClick) {
        const btn = document.createElement('div');
        btn.className = 'mw-edit-btn';
        btn.innerHTML = MAGIC_WAND_SVG;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof onClick === 'function') {
                onClick(e, btn);
                return;
            }
            if (!img) return;
            showEditPanel(img, btn);
        });
        return btn;
    }

    function hidePinterestFloatButton(immediate = false) {
        if (!state.pinterestFloatBtn) return;
        if (state.pinterestHideTimer) {
            clearTimeout(state.pinterestHideTimer);
            state.pinterestHideTimer = null;
        }

        const hide = () => {
            if (!state.pinterestFloatBtn) return;
            state.pinterestFloatBtn.classList.remove('show');
            state.pinterestTargetImg = null;
        };

        if (immediate) {
            hide();
            return;
        }

        state.pinterestHideTimer = setTimeout(hide, 120);
    }

    function ensurePinterestFloatButton() {
        if (!isPinterestHost()) return null;
        if (state.pinterestFloatBtn && document.body.contains(state.pinterestFloatBtn)) {
            return state.pinterestFloatBtn;
        }

        const btn = createEditButton(null);
        btn.classList.add('mw-floating-btn');
        btn.addEventListener('mouseenter', () => {
            if (state.pinterestHideTimer) {
                clearTimeout(state.pinterestHideTimer);
                state.pinterestHideTimer = null;
            }
            btn.classList.add('show');
        });
        btn.addEventListener('mouseleave', () => {
            hidePinterestFloatButton();
        });

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (state.pinterestTargetImg) {
                showEditPanel(state.pinterestTargetImg, btn);
            }
        });

        document.body.appendChild(btn);
        state.pinterestFloatBtn = btn;
        return btn;
    }

    function updatePinterestFloatButtonPosition(img) {
        const btn = ensurePinterestFloatButton();
        if (!btn || !img || !document.body.contains(img)) {
            hidePinterestFloatButton(true);
            return;
        }

        const rect = img.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 20) {
            hidePinterestFloatButton(true);
            return;
        }

        if (state.pinterestHideTimer) {
            clearTimeout(state.pinterestHideTimer);
            state.pinterestHideTimer = null;
        }

        const margin = 8;
        let left = rect.left + margin;
        let top = rect.bottom - 32 - margin;
        left = Math.max(4, Math.min(left, window.innerWidth - 36));
        top = Math.max(4, Math.min(top, window.innerHeight - 36));

        btn.style.left = `${Math.round(left)}px`;
        btn.style.top = `${Math.round(top)}px`;
        btn.classList.add('show');
        state.pinterestTargetImg = img;
    }

    function setupPinterestHoverButton() {
        if (!isPinterestHost()) return;

        ensurePinterestFloatButton();

        document.addEventListener('mouseover', (e) => {
            const container = e.target.closest ? e.target.closest('.mw-container') : null;
            if (!container) return;
            const img = container.querySelector('img');
            if (!img) return;
            updatePinterestFloatButtonPosition(img);
        }, true);

        document.addEventListener('mousemove', (e) => {
            const target = e.target;
            if (!target || !target.closest) return;
            const container = target.closest('.mw-container');
            if (!container) return;
            const img = container.querySelector('img');
            if (!img) return;
            if (state.pinterestTargetImg === img) return;
            updatePinterestFloatButtonPosition(img);
        }, true);

        document.addEventListener('mouseout', (e) => {
            const related = e.relatedTarget;
            if (related && state.pinterestFloatBtn && state.pinterestFloatBtn.contains(related)) return;
            const target = e.target;
            if (!target || !target.closest) return;
            if (target.closest('.mw-container')) {
                hidePinterestFloatButton();
            }
        }, true);

        const refreshPos = () => {
            if (state.pinterestTargetImg) {
                updatePinterestFloatButtonPosition(state.pinterestTargetImg);
            }
        };
        window.addEventListener('scroll', refreshPos, true);
        window.addEventListener('resize', refreshPos);
    }

    function isVideoElement(el) {
        return !!el && el.tagName === 'VIDEO';
    }

    function isProcessableVideo(video) {
        if (!isVideoElement(video)) return false;
        const rect = video.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 100) return false;
        if (video.readyState < 2) return false;
        if (video.ended) return false;
        if (!video.paused) return false;
        return true;
    }

    function findVideoAtPoint(x, y) {
        const elements = document.elementsFromPoint(x, y);
        return elements.find((el) => isProcessableVideo(el)) || null;
    }

    function hideVideoFloatButton(immediate = false) {
        if (!state.videoFloatBtn) return;
        if (state.videoHideTimer) {
            clearTimeout(state.videoHideTimer);
            state.videoHideTimer = null;
        }

        const hide = () => {
            if (!state.videoFloatBtn) return;
            state.videoFloatBtn.classList.remove('show');
            state.videoTarget = null;
        };

        if (immediate) {
            hide();
            return;
        }

        state.videoHideTimer = setTimeout(hide, 120);
    }

    function ensureVideoFloatButton() {
        if (state.videoFloatBtn && document.body.contains(state.videoFloatBtn)) {
            return state.videoFloatBtn;
        }

        const btn = createEditButton(null, () => {
            if (state.videoTarget) {
                showEditPanel(state.videoTarget, btn);
            }
        });
        btn.classList.add('mw-video-floating-btn');
        btn.addEventListener('mouseenter', () => {
            if (state.videoHideTimer) {
                clearTimeout(state.videoHideTimer);
                state.videoHideTimer = null;
            }
            btn.classList.add('show');
        });
        btn.addEventListener('mouseleave', () => {
            hideVideoFloatButton();
        });
        document.body.appendChild(btn);
        state.videoFloatBtn = btn;
        return btn;
    }

    function updateVideoFloatButtonPosition(video) {
        const btn = ensureVideoFloatButton();
        if (!btn || !video || !document.body.contains(video) || !isProcessableVideo(video)) {
            hideVideoFloatButton(true);
            return;
        }

        if (state.videoHideTimer) {
            clearTimeout(state.videoHideTimer);
            state.videoHideTimer = null;
        }

        const rect = video.getBoundingClientRect();
        const margin = 8;
        let left = rect.right - 32 - margin;
        let top = rect.bottom - 32 - margin;
        left = Math.max(4, Math.min(left, window.innerWidth - 36));
        top = Math.max(4, Math.min(top, window.innerHeight - 36));

        btn.style.left = `${Math.round(left)}px`;
        btn.style.top = `${Math.round(top)}px`;
        btn.classList.add('show');
        state.videoTarget = video;
    }

    function setupVideoHoverButton() {
        ensureVideoFloatButton();

        document.addEventListener('mousemove', (e) => {
            const video = findVideoAtPoint(e.clientX, e.clientY);
            if (!video) {
                hideVideoFloatButton();
                return;
            }
            updateVideoFloatButtonPosition(video);
        }, true);

        document.addEventListener('mouseout', (e) => {
            const related = e.relatedTarget;
            if (related && state.videoFloatBtn && state.videoFloatBtn.contains(related)) return;
            hideVideoFloatButton();
        }, true);

        document.addEventListener('play', (e) => {
            if (e.target && e.target === state.videoTarget) {
                hideVideoFloatButton(true);
            }
            if (state.activeVideoCompare && e.target && e.target === state.activeVideoCompare.video) {
                clearActiveVideoCompare();
            }
        }, true);

        const refreshPos = () => {
            if (state.videoTarget) {
                updateVideoFloatButtonPosition(state.videoTarget);
            }
            if (state.activeVideoCompare && typeof state.activeVideoCompare.updatePosition === 'function') {
                state.activeVideoCompare.updatePosition();
            }
        };

        window.addEventListener('scroll', refreshPos, true);
        window.addEventListener('resize', refreshPos);
    }

    function shouldTrackPendingImage(img) {
        if (!img || img.tagName !== 'IMG') return false;
        if (img.hasAttribute('data-magicwand-processed')) return false;
        if (img.closest('.mw-container') || img.closest('.mw-compare-container')) return false;
        if (!img.src || img.src.startsWith('data:image/svg')) return false;
        const rect = img.getBoundingClientRect();
        return img.width >= 100 || img.height >= 100 || rect.width >= 100 || rect.height >= 100;
    }

    function stopPendingPinterestProcessorIfIdle() {
        if (state.pendingPinterestImages.size === 0 && state.pendingPinterestTimer) {
            clearInterval(state.pendingPinterestTimer);
            state.pendingPinterestTimer = null;
        }
    }

    function runPendingPinterestProcessor() {
        const now = Date.now();

        state.pendingPinterestImages.forEach((expireAt, img) => {
            if (!img || !document.body.contains(img)) {
                state.pendingPinterestImages.delete(img);
                return;
            }
            if (img.hasAttribute('data-magicwand-processed') || img.closest('.mw-container')) {
                state.pendingPinterestImages.delete(img);
                return;
            }
            if (now > expireAt) {
                state.pendingPinterestImages.delete(img);
                return;
            }
            if (isProcessableImage(img)) {
                processImage(img);
                if (img.hasAttribute('data-magicwand-processed')) {
                    state.pendingPinterestImages.delete(img);
                }
            }
        });

        stopPendingPinterestProcessorIfIdle();
    }

    function ensurePendingPinterestProcessor() {
        if (state.pendingPinterestTimer) return;
        state.pendingPinterestTimer = setInterval(runPendingPinterestProcessor, 250);
    }

    function trackPendingPinterestImage(img) {
        if (!isPinterestHost()) return;
        if (!shouldTrackPendingImage(img)) return;
        state.pendingPinterestImages.set(img, Date.now() + 8000);
        ensurePendingPinterestProcessor();
    }

    function collectPendingPinterestImages(limit = 200) {
        if (!isPinterestHost()) return;
        const images = document.querySelectorAll('img');
        let count = 0;
        for (const img of images) {
            if (count >= limit) break;
            if (shouldTrackPendingImage(img) && !isProcessableImage(img)) {
                state.pendingPinterestImages.set(img, Date.now() + 8000);
                count += 1;
            }
        }
        if (count > 0) {
            ensurePendingPinterestProcessor();
        }
    }

    // 检查图片是否可处理
    function isProcessableImage(img) {
        if (img.width < 100 || img.height < 100) return false;
        if (img.hasAttribute('data-magicwand-processed')) return false;
        if (!img.src || img.src.startsWith('data:image/svg')) return false;
        const rect = img.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 100) return false;
        return true;
    }

    // 处理单个图片
    function processImage(img) {
        if (!isProcessableImage(img)) return false;
        if (img.closest('.mw-compare-container')) return false;
        if (img.closest('.mw-container')) return false;

        img.setAttribute('data-magicwand-processed', 'true');

        const imgStyle = window.getComputedStyle(img);
        const isAbsolute = imgStyle.position === 'absolute';

        const container = document.createElement('div');
        container.className = 'mw-container';
        
        if (isAbsolute) {
            container.style.cssText = `
                position: absolute;
                top: ${imgStyle.top};
                left: ${imgStyle.left};
                right: ${imgStyle.right};
                bottom: ${imgStyle.bottom};
                width: ${img.offsetWidth}px;
                height: ${img.offsetHeight}px;
            `;
            img.style.position = 'relative';
            img.style.top = 'auto';
            img.style.left = 'auto';
            img.style.right = 'auto';
            img.style.bottom = 'auto';
        }

        img.parentNode.insertBefore(container, img);
        container.appendChild(img);

        if (!isPinterestHost()) {
            const btn = createEditButton(img);
            container.appendChild(btn);
        }

        return true;
    }

    // 扫描页面所有图片
    function scanImages() {
        const images = document.querySelectorAll('img');
        images.forEach(processImage);
        if (isPinterestHost()) {
            collectPendingPinterestImages(160);
        }
    }

    // 设置MutationObserver监听新图片
    function setupObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.target && mutation.target.tagName === 'IMG') {
                    const done = processImage(mutation.target);
                    if (!done) {
                        trackPendingPinterestImage(mutation.target);
                    }
                    return;
                }
                mutation.addedNodes.forEach((node) => {
                    if (node.tagName === 'IMG') {
                        const done = processImage(node);
                        if (!done) {
                            trackPendingPinterestImage(node);
                        }
                    } else if (node.querySelectorAll) {
                        node.querySelectorAll('img').forEach((img) => {
                            const done = processImage(img);
                            if (!done) {
                                trackPendingPinterestImage(img);
                            }
                        });
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'srcset']
        });
    }

    function setupPinterestRouteRescan() {
        if (!isPinterestHost()) return;

        const triggerRescan = () => {
            [50, 350, 900, 1500, 3000, 6000].forEach((delay) => {
                setTimeout(() => {
                    scanImages();
                    collectPendingPinterestImages(240);
                }, delay);
            });
        };

        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function (...args) {
            const result = originalPushState.apply(this, args);
            triggerRescan();
            return result;
        };

        history.replaceState = function (...args) {
            const result = originalReplaceState.apply(this, args);
            triggerRescan();
            return result;
        };

        window.addEventListener('popstate', triggerRescan);
        window.addEventListener('hashchange', triggerRescan);
    }

    // 当前活动的面板
    let activePanel = null;
    let selectedDecorators = [];
    // 面板外部点击监听用捕获阶段，避免按钮处理器先改 DOM 导致误判为「面板外部」
    const OUTSIDE_CLICK_OPTIONS = { capture: true };

    function mergeDecoratorsWithPrompt(prompt, decorators) {
        if (!decorators || decorators.length === 0) {
            return prompt.replace(/\{decorator\}/g, '');
        }
        const useChinese = decorators.some((item) => /[\u4e00-\u9fff]/.test(item));
        const joiner = useChinese ? '。' : '. ';
        const merged = decorators.map((item) => String(item).replace(/[。.\s]+$/u, '')).join(joiner) + joiner;
        return prompt.replace(/\{decorator\}/g, merged);
    }

    // 创建编辑面板
    function createEditPanel(img, btn) {
        const panel = document.createElement('div');
        panel.className = 'mw-panel';
        const isVideoTarget = isVideoElement(img);

        const config = state.config;
        const allPrompts = [...config.presetPrompts, ...config.customPrompts];
        const allDecorators = [...(config.decorators || []), ...(config.customDecorators || [])];

        let numberGrid1Html = '<div class="mw-number-grid">';
        for (let i = 0; i < 9; i++) {
            const row1 = config.row1Prompts[i] || { prompt: '' };
            const row2 = config.row2Prompts[i] || { prompt: '' };
            const rowName = (config.rowNames && config.rowNames[i]) || (i + 1);
            numberGrid1Html += `<button class="mw-number-btn" data-index="${i}" data-prompt1="${encodeURIComponent(row1.prompt)}" data-prompt2="${encodeURIComponent(row2.prompt)}">${rowName}</button>`;
        }
        numberGrid1Html += '</div>';

        let decoratorHtml = '';
        if (allDecorators.length > 0) {
            decoratorHtml = '<div class="mw-decorator-row"><span class="mw-decorator-label">装饰:</span>';
            allDecorators.forEach((d, i) => {
                decoratorHtml += `<button class="mw-decorator-btn" data-decorator="${encodeURIComponent(d.prompt)}">${d.name}</button>`;
            });
            decoratorHtml += '</div>';
        }

        let html = `
            <div class="mw-panel-title">AI ${isVideoTarget ? '暂停帧' : '图片'}编辑</div>
            ${numberGrid1Html}
            ${decoratorHtml}
            <div class="mw-preset-grid">
        `;

        allPrompts.forEach((p, i) => {
            html += `<button class="mw-preset-btn" data-prompt="${encodeURIComponent(p.prompt)}">${p.name}</button>`;
        });
        html += `<button class="mw-preset-btn" data-custom="true">自定义...</button></div>`;

        const testPrompts = config.testPrompts || [];
        if (testPrompts.length > 0) {
            html += `<div class="mw-test-grid">`;
            testPrompts.forEach((p) => {
                html += `<button class="mw-test-btn" data-prompt="${encodeURIComponent(p.prompt)}">${p.name}</button>`;
            });
            html += `</div>`;
        }

        html += `
            <div class="mw-input-area">
                <input type="text" class="mw-input" placeholder="输入编辑指令...">
            </div>
            <div class="mw-actions-row">
                <button class="mw-action-btn mw-send-btn" disabled>发送</button>
                <button class="mw-action-btn mw-cancel-btn">取消</button>
            </div>
        `;

        panel.innerHTML = html;

        const inputArea = panel.querySelector('.mw-input-area');
        const input = panel.querySelector('.mw-input');
        const sendBtn = panel.querySelector('.mw-send-btn');
        const cancelBtn = panel.querySelector('.mw-cancel-btn');
        const presetBtns = panel.querySelectorAll('.mw-preset-btn');
        const testBtns = panel.querySelectorAll('.mw-test-btn');
        const numberBtns = panel.querySelectorAll('.mw-number-btn');
        const decoratorBtns = panel.querySelectorAll('.mw-decorator-btn');

        selectedDecorators = [];

        decoratorBtns.forEach(decBtn => {
            decBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const decoratorPrompt = decodeURIComponent(decBtn.dataset.decorator || '');
                if (decBtn.classList.contains('selected')) {
                    decBtn.classList.remove('selected');
                    selectedDecorators = selectedDecorators.filter(d => d !== decoratorPrompt);
                } else {
                    decBtn.classList.add('selected');
                    selectedDecorators.push(decoratorPrompt);
                }
            });
        });

        numberBtns.forEach(numBtn => {
            numBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const prompt1 = decodeURIComponent(numBtn.dataset.prompt1 || '');
                const prompt2 = decodeURIComponent(numBtn.dataset.prompt2 || '');
                if (prompt1 && prompt2) {
                    const mergedPrompt1 = mergeDecoratorsWithPrompt(prompt1, selectedDecorators);
                    const mergedPrompt2 = mergeDecoratorsWithPrompt(prompt2, selectedDecorators);
                    selectedDecorators = [];
                    sendDualEditRequest(img, mergedPrompt1, mergedPrompt2, panel, btn);
                } else {
                    showError(panel, '该编号提示词未配置完整');
                }
            });
        });

        // 预置按钮点击
        presetBtns.forEach(presetBtn => {
            presetBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (presetBtn.dataset.custom) {
                    inputArea.classList.add('show');
                    input.focus();
                    sendBtn.disabled = false;
                } else {
                    const prompt = decodeURIComponent(presetBtn.dataset.prompt);
                    const mergedPrompt = mergeDecoratorsWithPrompt(prompt, selectedDecorators);
                    selectedDecorators = [];
                    sendEditRequest(img, mergedPrompt, panel, btn);
                }
            });
        });

        // 测试按钮点击
        testBtns.forEach(testBtn => {
            testBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const prompt = decodeURIComponent(testBtn.dataset.prompt);
                const mergedPrompt = mergeDecoratorsWithPrompt(prompt, selectedDecorators);
                selectedDecorators = [];
                sendEditRequest(img, mergedPrompt, panel, btn);
            });
        });

        // 输入框事件
        input.addEventListener('input', () => {
            sendBtn.disabled = !input.value.trim();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && input.value.trim()) {
                const mergedPrompt = mergeDecoratorsWithPrompt(input.value.trim(), selectedDecorators);
                selectedDecorators = [];
                sendEditRequest(img, mergedPrompt, panel, btn);
            }
        });

        // 发送按钮
        sendBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (input.value.trim()) {
                const mergedPrompt = mergeDecoratorsWithPrompt(input.value.trim(), selectedDecorators);
                selectedDecorators = [];
                sendEditRequest(img, mergedPrompt, panel, btn);
            }
        });

        // 取消按钮
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectedDecorators = [];
            closePanel();
        });

        return panel;
    }

    // 发送双提示词编辑请求（并发生成两张图）
    async function sendDualEditRequest(img, prompt1, prompt2, panel, btn) {
        const config = state.config;

        if (!config.comfyUrl) {
            showError(panel, '请先配置 ComfyUI 服务器地址');
            return;
        }
        const isVideoTarget = isVideoElement(img);
        let imgKey = '';
        let imageBlob = null;
        let originalSrc = '';

        if (isVideoTarget) {
            if (!img.paused) {
                img.pause();
            }
            const roundedTime = Math.round((img.currentTime || 0) * 5) / 5;
            imgKey = `video:${location.host}:${roundedTime}:${(img.currentSrc || '').substring(0, 80)}`;
        } else {
            const imgSrc = getBestImageSrc(img);
            if (!imgSrc) {
                showError(panel, '无法获取图片地址');
                return;
            }
            imgKey = imgSrc.substring(0, 100);
        }

        if (state.processingImages.has(imgKey)) {
            return;
        }
        state.processingImages.add(imgKey);

        showLoading(panel, '正在上传图片...');
        const container = !isVideoTarget ? img.closest('.mw-container') : null;
        const processingOverlay = container ? showProcessingOverlay(container, '双图生成中...') : null;
        const videoOverlay = isVideoTarget ? buildVideoProcessingOverlay(img, '双图生成中...') : null;

        const jobKeys = [`${imgKey}#1`, `${imgKey}#2`];
        const jobs = jobKeys.map((key) => registerActiveJob(key));
        const makeHooks = (index) => ({
            onQueued: (promptId) => {
                jobs[index].promptId = promptId;
            },
            onTick: ({ elapsed, queueRemaining }) => {
                if (jobs.some((job) => job.token.cancelled)) return;
                updateProgress(`${index + 1}/2 ${formatProgressText(elapsed, queueRemaining)}`, panel, processingOverlay, videoOverlay);
            }
        });

        try {
            if (isVideoTarget) {
                imageBlob = await captureVideoFrame(img);
                originalSrc = URL.createObjectURL(imageBlob);
            } else {
                const imgSrc = getBestImageSrc(img);
                imageBlob = await fetchImage(imgSrc);
                originalSrc = img.src;
            }
            const [newImageBlob1, newImageBlob2] = await Promise.all([
                callComfyEdit(config, imageBlob, prompt1, jobs[0].token, makeHooks(0)),
                callComfyEdit(config, imageBlob, prompt2, jobs[1].token, makeHooks(1))
            ]);

            const newImageUrl1 = URL.createObjectURL(newImageBlob1);
            const newImageUrl2 = URL.createObjectURL(newImageBlob2);

            jobKeys.forEach(releaseActiveJob);
            closePanel();
            if (isVideoTarget) {
                showVideoCompareView(img, originalSrc, newImageUrl1, newImageUrl2, '双图对比', btn);
            } else {
                showCompareView(img, originalSrc, newImageUrl1, newImageUrl2, '双图对比', btn);
            }
        } catch (error) {
            if (error && error.cancelled) {
                closePanel();
                return;
            }
            // 一张失败时，把还在跑的兄弟任务一并取消，避免白占 GPU
            cancelActiveJobs();
            console.error('[Magicwand] 双图编辑失败:', error);
            showError(panel, error.message || '双图编辑失败，请重试');
        } finally {
            state.processingImages.delete(imgKey);
            jobKeys.forEach(releaseActiveJob);
            hideProcessingOverlay(processingOverlay);
            if (videoOverlay) {
                videoOverlay.destroy();
            }
        }
    }

    // 显示编辑面板
    function showEditPanel(img, btn) {
        if (activePanel) {
            activePanel.remove();
        }

        const panel = createEditPanel(img, btn);
        const imgRect = img.getBoundingClientRect();
        panel.style.position = 'fixed';
        panel.style.visibility = 'hidden';
        panel.style.top = '0px';
        panel.style.left = '0px';

        document.body.appendChild(panel);

        const panelRect = panel.getBoundingClientRect();
        const panelWidth = panelRect.width;
        const panelHeight = panelRect.height;
        const margin = 10;

        const maxLeft = Math.max(margin, window.innerWidth - panelWidth - margin);
        const left = Math.max(margin, Math.min(imgRect.left, maxLeft));

        const belowTop = imgRect.bottom + margin;
        const aboveTop = imgRect.top - panelHeight - margin;
        const canShowBelow = belowTop + panelHeight <= window.innerHeight - margin;
        const canShowAbove = aboveTop >= margin;

        let top;
        if (!canShowBelow && canShowAbove) {
            top = aboveTop;
        } else {
            const maxTop = Math.max(margin, window.innerHeight - panelHeight - margin);
            top = Math.max(margin, Math.min(belowTop, maxTop));
        }

        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.style.visibility = 'visible';
        activePanel = panel;

        // 点击外部关闭
        setTimeout(() => {
            document.addEventListener('click', handleOutsideClick, OUTSIDE_CLICK_OPTIONS);
        }, 0);
    }

    // 处理外部点击（捕获阶段：此时按钮还没被 innerHTML 替换移除，contains 判断才准确）
    function handleOutsideClick(e) {
        if (activePanel && !activePanel.contains(e.target) && !e.target.closest('.mw-edit-btn')) {
            closePanel();
        }
    }

    // 关闭面板（若有任务在跑，同时取消 ComfyUI 队列中的任务）
    function closePanel() {
        if (activePanel) {
            activePanel.remove();
            activePanel = null;
        }
        document.removeEventListener('click', handleOutsideClick, OUTSIDE_CLICK_OPTIONS);
        cancelActiveJobs();
    }

    // 显示加载状态（带取消按钮，点击即在 ComfyUI 侧撤销任务）
    function showLoading(panel, text) {
        panel.innerHTML = `
            <div class="mw-loading">
                <div class="mw-spinner"></div>
                <span>${text || '正在编辑图片...'}</span>
                <button class="mw-loading-cancel">取消生成</button>
            </div>
        `;
        const cancelBtn = panel.querySelector('.mw-loading-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                closePanel();
            });
        }
    }

    function shortenText(text, maxLength = 20) {
        const value = String(text || '');
        return value.length > maxLength ? `${value.substring(0, maxLength)}...` : value;
    }

    // 同步更新面板与遮罩上的进度文案
    function updateProgress(text, panel, processingOverlay, videoOverlay) {
        if (panel) {
            const label = panel.querySelector('.mw-loading span');
            if (label) label.textContent = text;
        }
        if (processingOverlay) {
            const label = processingOverlay.querySelector('.mw-processing-text');
            if (label) label.textContent = text;
        }
        if (videoOverlay && typeof videoOverlay.setText === 'function') {
            videoOverlay.setText(text);
        }
    }

    // 显示错误
    function showError(panel, message) {
        panel.innerHTML = `
            <div class="mw-panel-title" style="color: #ef4444;">出错了</div>
            <p style="font-size: 13px; color: #6b7280; margin-bottom: 12px;">${message}</p>
            <button class="mw-action-btn mw-cancel-btn" style="width: 100%;">关闭</button>
        `;
        panel.querySelector('.mw-cancel-btn').addEventListener('click', closePanel);
    }

    // 显示处理中遮罩
    function showProcessingOverlay(container, prompt) {
        const overlay = document.createElement('div');
        overlay.className = 'mw-processing-overlay';
        const label = document.createElement('span');
        label.className = 'mw-processing-text';
        label.textContent = shortenText(prompt);
        overlay.appendChild(label);
        container.appendChild(overlay);
        return overlay;
    }

    // 移除处理中遮罩
    function hideProcessingOverlay(overlay) {
        if (overlay && overlay.parentNode) {
            overlay.remove();
        }
    }

    function captureVideoFrame(video) {
        return new Promise((resolve, reject) => {
            try {
                if (!isVideoElement(video)) {
                    reject(new Error('当前目标不是视频'));
                    return;
                }
                const width = video.videoWidth || Math.max(1, Math.round(video.clientWidth));
                const height = video.videoHeight || Math.max(1, Math.round(video.clientHeight));
                if (width < 2 || height < 2) {
                    reject(new Error('视频帧尚未就绪，请稍后重试'));
                    return;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('暂停帧导出失败'));
                        return;
                    }
                    resolve(blob);
                }, 'image/png');
            } catch (error) {
                if (error && error.name === 'SecurityError') {
                    reject(new Error('该站点视频当前不支持直接取帧（跨域限制），请改为截图后编辑'));
                    return;
                }
                reject(error);
            }
        });
    }

    function buildVideoProcessingOverlay(video, prompt) {
        const overlay = document.createElement('div');
        overlay.className = 'mw-processing-overlay mw-video-processing-overlay';
        const label = document.createElement('span');
        label.className = 'mw-processing-text';
        label.textContent = shortenText(prompt);
        overlay.appendChild(label);
        document.body.appendChild(overlay);

        const updatePosition = () => {
            if (!video || !document.body.contains(video) || !overlay.parentNode) return;
            const rect = video.getBoundingClientRect();
            overlay.style.left = `${Math.round(rect.left)}px`;
            overlay.style.top = `${Math.round(rect.top)}px`;
            overlay.style.width = `${Math.round(rect.width)}px`;
            overlay.style.height = `${Math.round(rect.height)}px`;
        };

        const onMove = () => updatePosition();
        window.addEventListener('scroll', onMove, true);
        window.addEventListener('resize', onMove);
        updatePosition();

        return {
            overlay,
            setText: (text) => {
                label.textContent = text;
            },
            destroy: () => {
                window.removeEventListener('scroll', onMove, true);
                window.removeEventListener('resize', onMove);
                hideProcessingOverlay(overlay);
            }
        };
    }

    function getVideoCompareTarget(video) {
        if (!isVideoElement(video)) return null;
        if (!document.body.contains(video)) return null;
        const rect = video.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 20) return null;
        return rect;
    }

    function clearActiveVideoCompare() {
        if (state.activeVideoCompare && typeof state.activeVideoCompare.destroy === 'function') {
            state.activeVideoCompare.destroy();
        }
        state.activeVideoCompare = null;
    }

    // 发送编辑请求
    async function sendEditRequest(img, prompt, panel, btn) {
        const config = state.config;

        if (!config.comfyUrl) {
            showError(panel, '请先配置 ComfyUI 服务器地址');
            return;
        }
        const isVideoTarget = isVideoElement(img);
        let imgKey = '';
        let imageBlob = null;
        let originalSrc = '';

        if (isVideoTarget) {
            if (!img.paused) {
                img.pause();
            }
            const roundedTime = Math.round((img.currentTime || 0) * 5) / 5;
            imgKey = `video:${location.host}:${roundedTime}:${(img.currentSrc || '').substring(0, 80)}`;
        } else {
            const imgSrc = getBestImageSrc(img);
            if (!imgSrc) {
                showError(panel, '无法获取图片地址');
                return;
            }
            imgKey = imgSrc.substring(0, 100);
        }

        if (state.processingImages.has(imgKey)) {
            return;
        }
        state.processingImages.add(imgKey);

        showLoading(panel, '正在上传图片...');
        const container = !isVideoTarget ? img.closest('.mw-container') : null;
        const processingOverlay = container ? showProcessingOverlay(container, prompt) : null;
        const videoOverlay = isVideoTarget ? buildVideoProcessingOverlay(img, prompt) : null;

        const job = registerActiveJob(imgKey);

        try {
            if (isVideoTarget) {
                imageBlob = await captureVideoFrame(img);
                originalSrc = URL.createObjectURL(imageBlob);
            } else {
                const imgSrc = getBestImageSrc(img);
                imageBlob = await fetchImage(imgSrc);
                originalSrc = img.src;
            }
            const newImageBlob = await callComfyEdit(config, imageBlob, prompt, job.token, {
                onQueued: (promptId) => {
                    job.promptId = promptId;
                },
                onTick: ({ elapsed, queueRemaining }) => {
                    if (job.token.cancelled) return;
                    updateProgress(formatProgressText(elapsed, queueRemaining), panel, processingOverlay, videoOverlay);
                }
            });

            const newImageUrl = URL.createObjectURL(newImageBlob);
            releaseActiveJob(imgKey);
            closePanel();
            if (isVideoTarget) {
                showVideoCompareView(img, originalSrc, newImageUrl, originalSrc, prompt, btn);
            } else {
                showCompareView(img, originalSrc, newImageUrl, originalSrc, prompt, btn);
            }

        } catch (error) {
            if (error && error.cancelled) {
                closePanel();
                return;
            }
            console.error('[Magicwand] 编辑失败:', error);
            showError(panel, error.message || '编辑失败，请重试');
        } finally {
            state.processingImages.delete(imgKey);
            releaseActiveJob(imgKey);
            hideProcessingOverlay(processingOverlay);
            if (videoOverlay) {
                videoOverlay.destroy();
            }
        }
    }

    function getBestImageSrc(img) {
        const originalSrc = img.getAttribute('data-original-src');
        const currentSrc = img.currentSrc;
        const rawSrc = img.src;
        const candidates = [originalSrc, currentSrc, rawSrc];

        const normal = candidates.find((src) => src && !src.startsWith('blob:'));
        if (normal) return normal;

        return candidates.find(Boolean) || '';
    }

    // 获取图片Blob
    async function fetchImage(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'blob',
                timeout: 30000,
                onload: (response) => {
                    if (response.status === 200) {
                        resolve(response.response);
                    } else {
                        reject(new Error(`获取图片失败: ${response.status}`));
                    }
                },
                onerror: () => reject(new Error('网络请求失败')),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    // ==================== ComfyUI 直连客户端 ====================
    // 流程：POST /upload/image → POST /prompt → 轮询 GET /history/<id> → GET /view

    const COMFY_CLIENT_ID = `magicwand-${Math.random().toString(36).slice(2, 10)}`;

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function createCancelledError() {
        const error = new Error('任务已取消');
        error.cancelled = true;
        return error;
    }

    function safeJson(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    function randomSeed() {
        try {
            const buf = new Uint32Array(2);
            crypto.getRandomValues(buf);
            return (buf[0] * 0x200000 + (buf[1] >>> 11)) % Number.MAX_SAFE_INTEGER;
        } catch (e) {
            return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
        }
    }

    // 统一的 GM_xmlhttpRequest 封装：拼装服务根地址、可选鉴权、统一超时与网络错误
    function gmRequest(config, options) {
        const {
            method = 'GET',
            path,
            headers = {},
            data,
            responseType = 'text',
            timeoutMs = 60000
        } = options;
        const base = (config.comfyUrl || '').replace(/\/+$/, '');
        const requestHeaders = { ...headers };
        if (config.apiKey) {
            requestHeaders['Authorization'] = `Bearer ${config.apiKey}`;
        }
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: method,
                url: base + path,
                data: data,
                headers: requestHeaders,
                responseType: responseType,
                timeout: timeoutMs,
                onload: (response) => resolve(response),
                onerror: () => reject(new Error('网络请求失败，请检查 ComfyUI 地址是否可访问')),
                ontimeout: () => reject(new Error('网络请求超时'))
            });
        });
    }

    function parseJsonResponse(response, label) {
        const payload = safeJson(response.responseText);
        if (!payload) {
            throw new Error(`${label}返回内容无法解析（HTTP ${response.status}）`);
        }
        return payload;
    }

    // 把 ComfyUI 的 400 错误整理成人话（含出错节点与原始异常信息）
    function formatComfyError(payload, fallback) {
        if (!payload || typeof payload !== 'object') return fallback;
        const parts = [];
        if (payload.error && payload.error.message) {
            parts.push(payload.error.message);
            if (payload.error.details) parts.push(String(payload.error.details));
        }
        const nodeErrors = payload.node_errors || {};
        Object.keys(nodeErrors).forEach((nodeId) => {
            const info = nodeErrors[nodeId] || {};
            const classType = info.class_type ? ` [${info.class_type}]` : '';
            (info.errors || []).forEach((item) => {
                const message = (item && item.message) ? item.message : '校验失败';
                const details = (item && item.details) ? `（${item.details}）` : '';
                parts.push(`节点 ${nodeId}${classType}: ${message}${details}`);
            });
        });
        return parts.length ? parts.join('；') : fallback;
    }

    function formatProgressText(elapsed, queueRemaining) {
        const seconds = Math.max(0, Math.round(elapsed || 0));
        if (typeof queueRemaining === 'number' && queueRemaining > 0) {
            return `排队中（前面 ${queueRemaining} 个）· ${seconds}s`;
        }
        return `生成中 · ${seconds}s`;
    }

    // ---------- 工作流拼装 ----------

    // 每行一条：LoRA名称@强度
    function parseLoraList(loraList) {
        return String(loraList || '')
            .split('\n')
            .map((line) => line.trim())
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

    // Qwen-Image-2.1 图像编辑工作流（B18 基础版 + 解锁 UNet + LoRA 链）
    function buildComfyWorkflow(config, imageName, prompt, seed) {
        const workflow = {
            '4': {
                class_type: 'CLIPLoader',
                _meta: { title: '加载CLIP' },
                inputs: { clip_name: config.clipName, type: config.clipType || 'qwen_image', device: 'default' }
            },
            '13': {
                class_type: 'VAELoader',
                _meta: { title: '加载VAE' },
                inputs: { vae_name: config.vaeName }
            },
            '38': {
                class_type: 'LoadImage',
                _meta: { title: '待编辑原图' },
                inputs: { image: imageName }
            },
            '40': {
                class_type: 'ImageScaleToTotalPixels',
                _meta: { title: '按像素预算缩放' },
                inputs: { upscale_method: 'lanczos', megapixels: config.megapixels, resolution_steps: 1, image: ['38', 0] }
            },
            '41': {
                class_type: 'GetImageSize',
                _meta: { title: '获取尺寸' },
                inputs: { image: ['40', 0] }
            },
            '36': {
                class_type: 'EmptyLatentImage',
                _meta: { title: '空Latent' },
                inputs: { width: ['41', 0], height: ['41', 1], batch_size: 1 }
            },
            '37': {
                class_type: 'TextEncodeQwenImage21',
                _meta: { title: 'Qwen文本/参考图编码' },
                inputs: {
                    prompt: prompt,
                    negative_prompt: '',
                    resolution: config.refResolution,
                    clip: ['4', 0],
                    'images.image_1': ['40', 0],
                    vae: ['13', 0]
                }
            },
            '5': {
                class_type: 'UNETLoader',
                _meta: { title: '加载UNet' },
                inputs: { unet_name: config.unetName, weight_dtype: 'default' }
            },
            '25': {
                class_type: 'VAEDecode',
                _meta: { title: 'VAE解码' },
                inputs: { samples: ['23', 0], vae: ['13', 0] }
            },
            '9': {
                class_type: 'SaveImage',
                _meta: { title: '保存图像' },
                inputs: { filename_prefix: 'magicwand', images: ['25', 0] }
            }
        };

        // LoRA 链：UNETLoader → LoRA1 → LoRA2 → ... → ModelAttentionBackend → KSampler
        let modelRef = ['5', 0];
        parseLoraList(config.loraList).forEach((lora, index) => {
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
                seed: seed,
                steps: config.steps,
                cfg: config.cfg,
                sampler_name: config.samplerName,
                scheduler: config.scheduler,
                denoise: 1.0,
                model: ['39', 0],
                positive: ['37', 0],
                negative: ['37', 1],
                latent_image: ['36', 0]
            }
        };

        return workflow;
    }

    function jsonEscapeString(value) {
        return JSON.stringify(String(value)).slice(1, -1);
    }

    // 高级模板：字符串占位符写成 "%PROMPT%"，数字占位符写成 %STEPS%
    function renderWorkflowTemplate(template, variables) {
        let rendered = template;
        Object.keys(variables).forEach((name) => {
            const token = `%${name}%`;
            if (!rendered.includes(token)) return;
            const value = variables[name];
            const replacement = typeof value === 'number' ? String(value) : jsonEscapeString(value);
            rendered = rendered.split(token).join(replacement);
        });
        try {
            const parsed = JSON.parse(rendered);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('工作流必须是一个 JSON 对象');
            }
            return parsed;
        } catch (error) {
            throw new Error(`工作流模板解析失败：${error.message}`);
        }
    }

    function buildWorkflowForRequest(config, imageName, prompt, seed) {
        const template = (config.workflowTemplate || '').trim();
        if (!template) {
            return buildComfyWorkflow(config, imageName, prompt, seed);
        }
        return renderWorkflowTemplate(template, {
            IMAGE: imageName,
            PROMPT: prompt,
            SEED: seed,
            STEPS: config.steps,
            CFG: config.cfg,
            MEGAPIXELS: config.megapixels,
            REF_RESOLUTION: config.refResolution,
            UNET: config.unetName,
            CLIP: config.clipName,
            VAE: config.vaeName,
            FILENAME_PREFIX: 'magicwand'
        });
    }

    // ---------- 客户端预缩放（只影响上传体积，最终尺寸仍由工作流决定） ----------

    async function maybeDownscaleBlob(blob, megapixels) {
        const maxPixels = Math.max(1, Number(megapixels) || 1) * 2 * 1000000;
        try {
            if (typeof createImageBitmap !== 'function') return blob;
            const bitmap = await createImageBitmap(blob);
            const pixels = bitmap.width * bitmap.height;
            if (pixels <= maxPixels) {
                if (typeof bitmap.close === 'function') bitmap.close();
                return blob;
            }
            const scale = Math.sqrt(maxPixels / pixels);
            const width = Math.max(1, Math.round(bitmap.width * scale));
            const height = Math.max(1, Math.round(bitmap.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
            if (typeof bitmap.close === 'function') bitmap.close();
            const mime = (blob.type === 'image/jpeg' || blob.type === 'image/webp') ? 'image/jpeg' : 'image/png';
            const scaled = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.92));
            return scaled || blob;
        } catch (error) {
            console.warn('[Magicwand] 预缩放失败，改用原图上传:', error);
            return blob;
        }
    }

    // ---------- 接口调用 ----------

    function guessUploadExt(blob) {
        const type = (blob && blob.type) || '';
        if (type.indexOf('png') !== -1) return '.png';
        if (type.indexOf('webp') !== -1) return '.webp';
        if (type.indexOf('jpeg') !== -1 || type.indexOf('jpg') !== -1) return '.jpg';
        return '.png';
    }

    // FormData 不可用时的降级：手写 multipart/form-data 请求体
    async function buildMultipartBody(blob, filename) {
        const boundary = `----MagicwandBoundary${Math.random().toString(36).slice(2)}`;
        const encoder = new TextEncoder();
        const chunks = [
            encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${blob.type || 'image/png'}\r\n\r\n`),
            new Uint8Array(await blob.arrayBuffer()),
            encoder.encode('\r\n'),
            encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\ninput\r\n`),
            encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n`),
            encoder.encode(`--${boundary}--\r\n`)
        ];
        const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const body = new Uint8Array(total);
        let offset = 0;
        chunks.forEach((chunk) => {
            body.set(chunk, offset);
            offset += chunk.length;
        });
        return { body: body.buffer, contentType: `multipart/form-data; boundary=${boundary}` };
    }

    async function uploadImage(config, blob) {
        const filename = `mw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${guessUploadExt(blob)}`;
        const timeoutMs = Math.min(Math.max(60000, (config.timeout * 1000) / 2), 300000);
        let response;

        if (typeof FormData === 'function') {
            const formData = new FormData();
            formData.append('image', blob, filename);
            formData.append('type', 'input');
            formData.append('overwrite', 'true');
            response = await gmRequest(config, {
                method: 'POST',
                path: '/upload/image',
                data: formData,
                timeoutMs: timeoutMs
            });
        } else {
            console.warn('[Magicwand] FormData 不可用，降级为手写 multipart 上传');
            const fallback = await buildMultipartBody(blob, filename);
            response = await gmRequest(config, {
                method: 'POST',
                path: '/upload/image',
                data: fallback.body,
                headers: { 'Content-Type': fallback.contentType },
                timeoutMs: timeoutMs
            });
        }

        if (response.status !== 200) {
            throw new Error(formatComfyError(safeJson(response.responseText), `上传图片失败（HTTP ${response.status}）`));
        }
        const info = parseJsonResponse(response, '上传图片');
        if (!info.name) {
            throw new Error('上传图片失败：服务器未返回文件名');
        }
        return info.subfolder ? `${info.subfolder}/${info.name}` : info.name;
    }

    async function queuePrompt(config, workflow) {
        const response = await gmRequest(config, {
            method: 'POST',
            path: '/prompt',
            data: JSON.stringify({ prompt: workflow, client_id: COMFY_CLIENT_ID }),
            headers: { 'Content-Type': 'application/json' },
            timeoutMs: 30000
        });
        if (response.status !== 200) {
            throw new Error(formatComfyError(safeJson(response.responseText), `提交工作流失败（HTTP ${response.status}）`));
        }
        const payload = parseJsonResponse(response, '提交工作流');
        if (!payload.prompt_id) {
            throw new Error('提交工作流失败：服务器未返回 prompt_id');
        }
        return payload.prompt_id;
    }

    async function fetchQueueRemaining(config) {
        try {
            const response = await gmRequest(config, { method: 'GET', path: '/prompt', timeoutMs: 15000 });
            if (response.status !== 200) return null;
            const payload = safeJson(response.responseText);
            const remaining = payload && payload.exec_info ? payload.exec_info.queue_remaining : null;
            return typeof remaining === 'number' ? remaining : null;
        } catch (error) {
            return null;
        }
    }

    function collectOutputImages(outputs) {
        const images = [];
        Object.keys(outputs || {}).forEach((nodeId) => {
            const output = outputs[nodeId] || {};
            (output.images || []).forEach((image) => {
                if (image && image.filename) images.push(image);
            });
        });
        const outputImages = images.filter((image) => (image.type || 'output') === 'output');
        return outputImages.length ? outputImages : images;
    }

    function formatHistoryError(entry) {
        const status = (entry && entry.status) || {};
        const details = [];
        (status.messages || []).forEach((item) => {
            if (!Array.isArray(item)) return;
            const payload = item[1];
            if (!payload || typeof payload !== 'object') return;
            if (payload.exception_message) details.push(payload.exception_message);
            else if (payload.message) details.push(payload.message);
        });
        return details.length ? `生成失败：${details.join('；')}` : '生成失败，请查看 ComfyUI 控制台日志';
    }

    async function waitForResult(config, promptId, token, onTick) {
        const startedAt = Date.now();
        const timeoutMs = Math.max(10, config.timeout) * 1000;
        const pollMs = Math.max(500, config.pollInterval * 1000);

        while (true) {
            if (token && token.cancelled) throw createCancelledError();

            const response = await gmRequest(config, {
                method: 'GET',
                path: `/history/${encodeURIComponent(promptId)}`,
                timeoutMs: 30000
            });

            if (response.status === 200) {
                const history = safeJson(response.responseText) || {};
                const entry = history[promptId];
                if (entry) {
                    const status = entry.status || {};
                    if (status.status_str === 'error') {
                        throw new Error(formatHistoryError(entry));
                    }
                    if (status.completed) {
                        const images = collectOutputImages(entry.outputs);
                        if (images.length) return images[0];
                        throw new Error('生成已完成，但没有找到输出图片');
                    }
                }
            }

            if (Date.now() - startedAt > timeoutMs) {
                throw new Error(`等待超时（${config.timeout} 秒），ComfyUI 队列可能仍在处理，可在设置里调大超时时间`);
            }

            const queueRemaining = await fetchQueueRemaining(config);
            if (typeof onTick === 'function') {
                onTick({ elapsed: (Date.now() - startedAt) / 1000, queueRemaining: queueRemaining });
            }
            await sleep(pollMs);
        }
    }

    async function fetchOutputImage(config, imageInfo) {
        const query = new URLSearchParams({
            filename: imageInfo.filename,
            subfolder: imageInfo.subfolder || '',
            type: imageInfo.type || 'output'
        }).toString();
        const response = await gmRequest(config, {
            method: 'GET',
            path: `/view?${query}`,
            responseType: 'blob',
            timeoutMs: 120000
        });
        if (response.status !== 200 || !response.response) {
            throw new Error(`下载生成图失败（HTTP ${response.status}）`);
        }
        return response.response;
    }

    // 只删除自己的排队任务、只在自己任务运行时中断，避免影响同服务器的其他任务
    async function cancelPrompt(config, promptId) {
        if (!config.comfyUrl || !promptId) return;
        try {
            const response = await gmRequest(config, { method: 'GET', path: '/queue', timeoutMs: 15000 });
            if (response.status !== 200) return;
            const queue = safeJson(response.responseText) || {};
            const isPending = (queue.queue_pending || []).some((item) => Array.isArray(item) && item[1] === promptId);
            const isRunning = (queue.queue_running || []).some((item) => Array.isArray(item) && item[1] === promptId);
            if (isPending) {
                await gmRequest(config, {
                    method: 'POST',
                    path: '/queue',
                    data: JSON.stringify({ delete: [promptId] }),
                    headers: { 'Content-Type': 'application/json' },
                    timeoutMs: 15000
                });
            }
            if (isRunning) {
                await gmRequest(config, { method: 'POST', path: '/interrupt', timeoutMs: 15000 });
            }
        } catch (error) {
            console.warn('[Magicwand] 取消 ComfyUI 任务失败:', error);
        }
    }

    async function testComfyConnection(config) {
        const response = await gmRequest(config, { method: 'GET', path: '/system_stats', timeoutMs: 15000 });
        if (response.status !== 200) {
            throw new Error(`连接失败（HTTP ${response.status}），请确认填的是 ComfyUI 服务根地址`);
        }
        const stats = parseJsonResponse(response, '测试连接');
        const device = (stats.devices && stats.devices[0] && stats.devices[0].name) ? stats.devices[0].name : '未知设备';
        const version = (stats.system && stats.system.comfyui_version) ? stats.system.comfyui_version : '未知版本';
        return { version: version, device: device };
    }

    // ---------- 任务登记与取消 ----------

    function createCancelToken() {
        return { cancelled: false };
    }

    function registerActiveJob(key) {
        const job = { token: createCancelToken(), promptId: null };
        state.activeJobs.set(key, job);
        return job;
    }

    function releaseActiveJob(key) {
        state.activeJobs.delete(key);
    }

    function cancelActiveJobs() {
        if (state.activeJobs.size === 0) return;
        const jobs = Array.from(state.activeJobs.values());
        state.activeJobs.clear();
        jobs.forEach((job) => {
            job.token.cancelled = true;
            if (job.promptId) {
                cancelPrompt(state.config, job.promptId);
            }
        });
    }

    // ---------- 对外入口：一次完整的图片编辑 ----------

    async function callComfyEdit(config, imageBlob, prompt, token, hooks = {}) {
        const uploadBlob = await maybeDownscaleBlob(imageBlob, config.megapixels);
        if (token && token.cancelled) throw createCancelledError();

        const imageName = await uploadImage(config, uploadBlob);
        if (token && token.cancelled) throw createCancelledError();

        const seed = config.seedMode === 'fixed' ? Math.round(config.fixedSeed) : randomSeed();
        const workflow = buildWorkflowForRequest(config, imageName, prompt, seed);
        const promptId = await queuePrompt(config, workflow);

        if (typeof hooks.onQueued === 'function') {
            hooks.onQueued(promptId);
        }
        if (token && token.cancelled) {
            cancelPrompt(config, promptId);
            throw createCancelledError();
        }

        const imageInfo = await waitForResult(config, promptId, token, hooks.onTick);
        return fetchOutputImage(config, imageInfo);
    }

    // 显示对比视图
    function showCompareView(originalImg, originalSrc, newSrc, oldSrc, prompt, editBtn) {
        const container = originalImg.closest('.mw-container');
        if (!container) return;
        const isFloatingBtn = !!(editBtn && editBtn.classList && editBtn.classList.contains('mw-floating-btn'));

        const rect = originalImg.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(originalImg);
        const displayWidth = Math.max(1, Math.round(rect.width));
        const displayHeight = Math.max(1, Math.round(rect.height));
        const objectFit = computedStyle.objectFit || 'fill';
        const objectPosition = computedStyle.objectPosition || '50% 50%';

        originalImg.style.display = 'none';
        if (!isFloatingBtn && editBtn) {
            editBtn.style.display = 'none';
        } else {
            hidePinterestFloatButton(true);
        }

        const compareContainer = document.createElement('div');
        compareContainer.className = 'mw-compare-container';
        compareContainer.style.width = displayWidth + 'px';
        compareContainer.style.height = displayHeight + 'px';

        compareContainer.innerHTML = `
            <img class="mw-new-image" src="${newSrc}" style="object-fit: ${objectFit}; object-position: ${objectPosition};">
            <img class="mw-old-image" src="${oldSrc}" style="object-fit: ${objectFit}; object-position: ${objectPosition};">
            <div class="mw-slider-line"></div>
            <div class="mw-slider-handle">${ARROW_SVG}</div>
            <div class="mw-compare-actions">
                <button class="mw-compare-action-btn mw-restore-btn">恢复原图</button>
                <button class="mw-compare-action-btn mw-reedit-btn">重新编辑</button>
            </div>
        `;

        container.appendChild(compareContainer);

        const oldImage = compareContainer.querySelector('.mw-old-image');
        const sliderLine = compareContainer.querySelector('.mw-slider-line');
        const sliderHandle = compareContainer.querySelector('.mw-slider-handle');
        const restoreBtn = compareContainer.querySelector('.mw-restore-btn');
        const reeditBtn = compareContainer.querySelector('.mw-reedit-btn');

        // 滑块交互
        function updateSlider(x) {
            const rect = compareContainer.getBoundingClientRect();
            let percent = ((x - rect.left) / rect.width) * 100;
            percent = Math.max(0, Math.min(100, percent));

            oldImage.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
            sliderLine.style.left = `${percent}%`;
            sliderHandle.style.left = `${percent}%`;
        }

        compareContainer.addEventListener('mousemove', (e) => {
            updateSlider(e.clientX);
        });

        compareContainer.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) {
                updateSlider(e.touches[0].clientX);
            }
        });

        // 恢复原图
        restoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            compareContainer.remove();
            originalImg.style.display = '';
            if (!isFloatingBtn && editBtn) {
                editBtn.style.display = '';
            }
            originalImg.removeAttribute('data-original-src');
        });

        // 重新编辑
        reeditBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            compareContainer.remove();
            originalImg.style.display = '';
            if (!isFloatingBtn && editBtn) {
                editBtn.style.display = '';
            }
            showEditPanel(originalImg, editBtn);
        });

        // 保存原始src以便后续恢复
        originalImg.setAttribute('data-original-src', originalSrc);
    }

    function showVideoCompareView(video, originalSrc, newSrc, oldSrc, prompt, editBtn) {
        const rect = getVideoCompareTarget(video);
        if (!rect) return;
        clearActiveVideoCompare();
        hideVideoFloatButton(true);

        const computedStyle = window.getComputedStyle(video);
        const objectFit = computedStyle.objectFit || 'contain';
        const objectPosition = computedStyle.objectPosition || '50% 50%';

        const layer = document.createElement('div');
        layer.className = 'mw-video-compare-layer';
        document.body.appendChild(layer);

        const compareContainer = document.createElement('div');
        compareContainer.className = 'mw-compare-container';
        compareContainer.innerHTML = `
            <img class="mw-new-image" src="${newSrc}" style="object-fit: ${objectFit}; object-position: ${objectPosition};">
            <img class="mw-old-image" src="${oldSrc}" style="object-fit: ${objectFit}; object-position: ${objectPosition};">
            <div class="mw-slider-line"></div>
            <div class="mw-slider-handle">${ARROW_SVG}</div>
            <div class="mw-compare-actions">
                <button class="mw-compare-action-btn mw-restore-btn">恢复原画</button>
                <button class="mw-compare-action-btn mw-reedit-btn">重新编辑</button>
            </div>
        `;
        layer.appendChild(compareContainer);

        const oldImage = compareContainer.querySelector('.mw-old-image');
        const sliderLine = compareContainer.querySelector('.mw-slider-line');
        const sliderHandle = compareContainer.querySelector('.mw-slider-handle');
        const restoreBtn = compareContainer.querySelector('.mw-restore-btn');
        const reeditBtn = compareContainer.querySelector('.mw-reedit-btn');

        function updateSlider(x) {
            const currentRect = compareContainer.getBoundingClientRect();
            let percent = ((x - currentRect.left) / currentRect.width) * 100;
            percent = Math.max(0, Math.min(100, percent));
            oldImage.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
            sliderLine.style.left = `${percent}%`;
            sliderHandle.style.left = `${percent}%`;
        }

        compareContainer.addEventListener('mousemove', (e) => {
            updateSlider(e.clientX);
        });
        compareContainer.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) {
                updateSlider(e.touches[0].clientX);
            }
        });

        const updatePosition = () => {
            const currentRect = getVideoCompareTarget(video);
            if (!currentRect) {
                destroy();
                return;
            }
            layer.style.left = `${Math.round(currentRect.left)}px`;
            layer.style.top = `${Math.round(currentRect.top)}px`;
            layer.style.width = `${Math.round(currentRect.width)}px`;
            layer.style.height = `${Math.round(currentRect.height)}px`;
        };

        const onScrollOrResize = () => updatePosition();
        window.addEventListener('scroll', onScrollOrResize, true);
        window.addEventListener('resize', onScrollOrResize);

        const cleanupUrls = () => {
            if (newSrc && newSrc.startsWith('blob:')) {
                URL.revokeObjectURL(newSrc);
            }
            if (oldSrc && oldSrc.startsWith('blob:')) {
                URL.revokeObjectURL(oldSrc);
            }
            if (originalSrc && originalSrc.startsWith('blob:') && originalSrc !== oldSrc) {
                URL.revokeObjectURL(originalSrc);
            }
        };

        const destroy = () => {
            window.removeEventListener('scroll', onScrollOrResize, true);
            window.removeEventListener('resize', onScrollOrResize);
            if (layer.parentNode) {
                layer.remove();
            }
            cleanupUrls();
            if (state.activeVideoCompare && state.activeVideoCompare.layer === layer) {
                state.activeVideoCompare = null;
            }
        };

        restoreBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            destroy();
        });

        reeditBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            destroy();
            showEditPanel(video, editBtn || state.videoFloatBtn);
        });

        state.activeVideoCompare = {
            video,
            layer,
            updatePosition,
            destroy
        };

        updatePosition();
    }

    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // 显示设置面板
    function showSettingsPanel() {
        const config = state.config;
        const overlay = document.createElement('div');
        overlay.className = 'mw-settings-overlay';

        const allPrompts = [...config.presetPrompts, ...config.customPrompts];
        const allDecorators = [...(config.decorators || []), ...(config.customDecorators || [])];

        let promptsHtml = '';
        allPrompts.forEach((p, i) => {
            const isPreset = i < config.presetPrompts.length;
            promptsHtml += `
                <div class="mw-prompt-item" data-index="${i}" data-preset="${isPreset}">
                    <div class="mw-prompt-info">
                        <div class="mw-prompt-name">${p.name}</div>
                        <div class="mw-prompt-text">${p.prompt}</div>
                    </div>
                    ${!isPreset ? `<button class="mw-prompt-delete" data-index="${i - config.presetPrompts.length}">删除</button>` : ''}
                </div>
            `;
        });

        let decoratorsHtml = '';
        allDecorators.forEach((d, i) => {
            const isPreset = i < (config.decorators ? config.decorators.length : 0);
            decoratorsHtml += `
                <div class="mw-prompt-item" data-decorator-index="${i}" data-preset="${isPreset}">
                    <div class="mw-prompt-info">
                        <div class="mw-prompt-name">${d.name}</div>
                        <div class="mw-prompt-text">${d.prompt}</div>
                    </div>
                    ${!isPreset ? `<button class="mw-prompt-delete mw-decorator-delete" data-index="${i - (config.decorators ? config.decorators.length : 0)}">删除</button>` : ''}
                </div>
            `;
        });

        overlay.innerHTML = `
            <div class="mw-settings-panel">
                <div class="mw-settings-title">魔法编辑设置</div>

                <div class="mw-settings-group">
                    <label class="mw-settings-label">ComfyUI 服务器地址</label>
                    <input type="text" class="mw-settings-input mw-comfy-url" value="${escapeHtml(config.comfyUrl)}" placeholder="https://u741047-xxxx.westd.seetacloud.com:8443">
                    <div class="mw-settings-hint">填 ComfyUI 服务根地址（AutoDL 用 6006 端口、主机名 u 前缀，不要填 6008 控制面板或 /generate）</div>
                    <button class="mw-test-btn">测试连接</button>
                    <div class="mw-test-status"></div>
                </div>

                <div class="mw-settings-group">
                    <label class="mw-settings-label">API Key（可选）</label>
                    <input type="text" class="mw-settings-input mw-api-key" value="${escapeHtml(config.apiKey)}" placeholder="走反向代理/隧道需要鉴权时填写">
                </div>

                <div class="mw-settings-section">模型配置</div>

                <div class="mw-settings-group">
                    <label class="mw-settings-label">UNet 模型</label>
                    <input type="text" class="mw-settings-input mw-unet-name" value="${escapeHtml(config.unetName)}">
                </div>

                <div class="mw-settings-row">
                    <div class="mw-settings-group">
                        <label class="mw-settings-label">CLIP</label>
                        <input type="text" class="mw-settings-input mw-clip-name" value="${escapeHtml(config.clipName)}">
                    </div>
                    <div class="mw-settings-group">
                        <label class="mw-settings-label">VAE</label>
                        <input type="text" class="mw-settings-input mw-vae-name" value="${escapeHtml(config.vaeName)}">
                    </div>
                </div>

                <div class="mw-settings-group">
                    <label class="mw-settings-label">LoRA 列表（每行一条：名称@强度）</label>
                    <textarea class="mw-settings-textarea mw-lora-list"></textarea>
                    <div class="mw-settings-hint">按顺序串联后接入 ModelAttentionBackend；留空则不加载 LoRA</div>
                </div>

                <div class="mw-settings-section">生成参数</div>

                <div class="mw-settings-row">
                    <div class="mw-settings-group">
                        <label class="mw-settings-label">步数</label>
                        <input type="number" class="mw-settings-input mw-steps" min="1" max="200" value="${config.steps}">
                    </div>
                    <div class="mw-settings-group">
                        <label class="mw-settings-label">像素预算 (MP)</label>
                        <input type="number" class="mw-settings-input mw-megapixels" min="0.1" max="16" step="0.1" value="${config.megapixels}">
                    </div>
                </div>

                <div class="mw-settings-row">
                    <div class="mw-settings-group">
                        <label class="mw-settings-label">采样器</label>
                        <input type="text" class="mw-settings-input mw-sampler" value="${escapeHtml(config.samplerName)}">
                    </div>
                    <div class="mw-settings-group">
                        <label class="mw-settings-label">调度器</label>
                        <input type="text" class="mw-settings-input mw-scheduler" value="${escapeHtml(config.scheduler)}">
                    </div>
                </div>

                <div class="mw-settings-row">
                    <div class="mw-settings-group">
                        <label class="mw-settings-label">参考图分辨率</label>
                        <input type="number" class="mw-settings-input mw-ref-resolution" min="0" max="4096" step="32" value="${config.refResolution}">
                    </div>
                    <div class="mw-settings-group">
                        <label class="mw-settings-label">超时 (秒)</label>
                        <input type="number" class="mw-settings-input mw-timeout" min="10" max="3600" value="${config.timeout}">
                    </div>
                </div>

                <div class="mw-settings-group">
                    <label class="mw-settings-label">随机种子</label>
                    <select class="mw-settings-input mw-seed-mode">
                        <option value="random"${config.seedMode === 'random' ? ' selected' : ''}>每次随机</option>
                        <option value="fixed"${config.seedMode === 'fixed' ? ' selected' : ''}>固定</option>
                    </select>
                    <input type="number" class="mw-settings-input mw-fixed-seed" style="margin-top: 6px;" min="0" value="${config.fixedSeed}">
                    <div class="mw-settings-hint">仅「固定」模式使用该种子值</div>
                </div>

                <div class="mw-settings-section">高级</div>

                <div class="mw-settings-group">
                    <label class="mw-settings-label">工作流模板（可选，整份覆盖）</label>
                    <textarea class="mw-settings-textarea mw-workflow-template" style="min-height: 120px;"></textarea>
                    <div class="mw-settings-hint">留空则使用上面的结构化配置。内容为 ComfyUI API 格式 JSON；字符串占位符写 "%PROMPT%"、"%IMAGE%" 等，数字占位符写 %SEED%、%STEPS%、%MEGAPIXELS%、%CFG%、%REF_RESOLUTION%</div>
                </div>

                <div class="mw-settings-section">提示词</div>

                <div class="mw-settings-group">
                    <label class="mw-settings-label">预置提示词</label>
                    <div class="mw-prompts-list">${promptsHtml}</div>
                    <button class="mw-add-prompt-btn">+ 添加自定义提示词</button>
                </div>

                <div class="mw-settings-group">
                    <label class="mw-settings-label">装饰器效果</label>
                    <div class="mw-prompts-list mw-decorators-list">${decoratorsHtml}</div>
                    <button class="mw-add-prompt-btn mw-add-decorator-btn">+ 添加自定义装饰器</button>
                    <div class="mw-settings-hint">装饰器可与任意提示词组合使用</div>
                </div>

                <div class="mw-settings-footer">
                    <button class="mw-save-btn">保存设置</button>
                    <button class="mw-close-btn">关闭</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const comfyUrlInput = overlay.querySelector('.mw-comfy-url');
        const apiKeyInput = overlay.querySelector('.mw-api-key');
        const unetInput = overlay.querySelector('.mw-unet-name');
        const clipInput = overlay.querySelector('.mw-clip-name');
        const vaeInput = overlay.querySelector('.mw-vae-name');
        const loraTextarea = overlay.querySelector('.mw-lora-list');
        const stepsInput = overlay.querySelector('.mw-steps');
        const megapixelsInput = overlay.querySelector('.mw-megapixels');
        const samplerInput = overlay.querySelector('.mw-sampler');
        const schedulerInput = overlay.querySelector('.mw-scheduler');
        const refResolutionInput = overlay.querySelector('.mw-ref-resolution');
        const timeoutInput = overlay.querySelector('.mw-timeout');
        const seedModeSelect = overlay.querySelector('.mw-seed-mode');
        const fixedSeedInput = overlay.querySelector('.mw-fixed-seed');
        const templateTextarea = overlay.querySelector('.mw-workflow-template');
        const testBtn = overlay.querySelector('.mw-test-btn');
        const testStatus = overlay.querySelector('.mw-test-status');
        const addPromptBtn = overlay.querySelector('.mw-add-prompt-btn');
        const addDecoratorBtn = overlay.querySelector('.mw-add-decorator-btn');
        const saveBtn = overlay.querySelector('.mw-save-btn');
        const closeBtn = overlay.querySelector('.mw-close-btn');
        const promptsList = overlay.querySelector('.mw-prompts-list');
        const decoratorsList = overlay.querySelector('.mw-decorators-list');

        loraTextarea.value = config.loraList || '';
        templateTextarea.value = config.workflowTemplate || '';

        // 测试连接
        const setTestStatus = (text, stateName) => {
            testStatus.textContent = text;
            testStatus.className = `mw-test-status ${stateName || ''}`;
        };
        testBtn.addEventListener('click', async () => {
            const url = comfyUrlInput.value.trim();
            if (!url) {
                setTestStatus('请先填写 ComfyUI 服务器地址', 'err');
                return;
            }
            setTestStatus('正在连接...', 'pending');
            try {
                const info = await testComfyConnection({ ...config, comfyUrl: url, apiKey: apiKeyInput.value.trim() });
                setTestStatus(`连接成功：ComfyUI ${info.version} · ${info.device}`, 'ok');
            } catch (error) {
                setTestStatus(error.message || '连接失败', 'err');
            }
        });

        // 删除自定义提示词
        promptsList.addEventListener('click', (e) => {
            if (e.target.classList.contains('mw-prompt-delete')) {
                const index = parseInt(e.target.dataset.index);
                config.customPrompts.splice(index, 1);
                state.config = config;
                saveConfig(config);
                overlay.remove();
                showSettingsPanel();
            }
        });

        // 删除自定义装饰器
        decoratorsList.addEventListener('click', (e) => {
            if (e.target.classList.contains('mw-decorator-delete')) {
                const index = parseInt(e.target.dataset.index);
                if (!config.customDecorators) config.customDecorators = [];
                config.customDecorators.splice(index, 1);
                state.config = config;
                saveConfig(config);
                overlay.remove();
                showSettingsPanel();
            }
        });

        // 添加自定义提示词
        addPromptBtn.addEventListener('click', () => {
            const name = prompt('提示词名称:');
            if (!name) return;
            const promptText = prompt('提示词内容:');
            if (!promptText) return;

            config.customPrompts.push({ name, prompt: promptText });
            state.config = config;
            saveConfig(config);
            overlay.remove();
            showSettingsPanel();
        });

        // 添加自定义装饰器
        addDecoratorBtn.addEventListener('click', () => {
            const name = prompt('装饰器名称:');
            if (!name) return;
            const promptText = prompt('装饰器提示词:');
            if (!promptText) return;

            if (!config.customDecorators) config.customDecorators = [];
            config.customDecorators.push({ name, prompt: promptText });
            state.config = config;
            saveConfig(config);
            overlay.remove();
            showSettingsPanel();
        });

        // 保存
        saveBtn.addEventListener('click', () => {
            config.comfyUrl = comfyUrlInput.value.trim();
            config.apiKey = apiKeyInput.value.trim();
            config.unetName = unetInput.value.trim() || COMFY_DEFAULTS.unetName;
            config.clipName = clipInput.value.trim() || COMFY_DEFAULTS.clipName;
            config.vaeName = vaeInput.value.trim() || COMFY_DEFAULTS.vaeName;
            config.loraList = loraTextarea.value;
            config.steps = Number(stepsInput.value);
            config.megapixels = Number(megapixelsInput.value);
            config.samplerName = samplerInput.value.trim() || COMFY_DEFAULTS.samplerName;
            config.scheduler = schedulerInput.value.trim() || COMFY_DEFAULTS.scheduler;
            config.refResolution = Number(refResolutionInput.value);
            config.timeout = Number(timeoutInput.value);
            config.seedMode = seedModeSelect.value === 'fixed' ? 'fixed' : 'random';
            config.fixedSeed = Number(fixedSeedInput.value);
            config.workflowTemplate = templateTextarea.value.trim();
            // saveConfig 会做兜底与裁剪，并回传与内存结构一致的配置
            state.config = saveConfig(config);
            overlay.remove();
            alert('设置已保存');
        });

        // 关闭
        closeBtn.addEventListener('click', () => {
            overlay.remove();
        });

        // 点击背景关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
    }

    // 注册油猴菜单
    function registerMenu() {
        GM_registerMenuCommand('⚙️ 打开设置', showSettingsPanel);
        GM_registerMenuCommand(state.config.enabled ? '🔴 禁用脚本' : '🟢 启用脚本', () => {
            state.config.enabled = !state.config.enabled;
            saveConfig(state.config);
            location.reload();
        });
    }

    // 脚本入口
    console.log(`[Magicwand] 脚本已加载，版本 ${SCRIPT_VERSION}`);

    if (isBlacklistedHost()) {
        console.log('[Magicwand] 当前站点在黑名单中，已跳过初始化');
        return;
    }

    markHostContext();
    injectStyles();
    registerMenu();

    if (!state.config.enabled) {
        console.log('[Magicwand] 脚本已禁用');
        return;
    }

    if (legacyUrlMigrated) {
        console.warn('[Magicwand] 已从旧的 /generate 接口地址迁移配置，请到设置里确认 ComfyUI 服务器地址（AutoDL 用 6006 端口、主机名 u 前缀）');
    }

    if (!state.config.comfyUrl) {
        console.log('[Magicwand] 未配置 ComfyUI 服务器地址，请通过油猴菜单设置');
    }

    // 延迟扫描确保页面加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            scanImages();
            setupObserver();
            setupPinterestHoverButton();
            setupPinterestRouteRescan();
            setupVideoHoverButton();
        });
    } else {
        scanImages();
        setupObserver();
        setupPinterestHoverButton();
        setupPinterestRouteRescan();
        setupVideoHoverButton();
    }

    console.log('[Magicwand] 初始化完成');

})();
