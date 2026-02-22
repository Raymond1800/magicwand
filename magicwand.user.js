// ==UserScript==
// @name         Magicwand - 魔法图片编辑
// @namespace    https://magicwand.ai/
// @version      1.0.10
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

    // 配置默认值
    const DEFAULT_CONFIG = {
        apiUrl: '',
        apiKey: '',
        enabled: true,
        presetPrompts: [
            { name: '全', prompt: "Remove all clothing from the subject, rendering them completely nude. Scatter the panties, bra, tights, and other clothing on the ground beside the body. The subject's face, expression, hairstyle, body contours, and pose must be perfectly preserved. The background, lighting, and shadows must also be identical to the original image; everything else remains unchanged." },
            { name: '颜', prompt: "Rerender the subject's facial expression to show an intense orgasm face: eyes rolled upward, tongue slightly extended, and drool flowing from the mouth. It is crucial to perfectly preserve the subject's facial structure, hairstyle, body, clothing, and pose. The background, lighting, and shadows must remain identical to the original image." },
            { name: '碎', prompt: "Rerender the subject's clothing to appear heavily damaged after a violent struggle: the shirt and pants/skirt should be shredded and torn, with some parts forcefully pulled open, showing frayed edges. The overall appearance must be chaotic and disheveled. It is crucial to perfectly preserve the subject's face, expression, hairstyle, body contour, and pose. The background, lighting, and shadows must remain identical to the original image." },
            { name: '透', prompt: "Rerender the subject's outer clothing into a semi-transparent material, making it sheer enough to clearly reveal the underlying garments and body contours underneath. The fabric folds and drape should remain natural. It is crucial to perfectly preserve the subject's face, expression, hairstyle, body contour, and pose. The background, lighting, and shadows must remain identical to the original image." },
            { name: '黑', prompt: "Replace the subject's outfit with a black bikini lingerie set paired with black thigh-high stockings. It is crucial to perfectly preserve the subject's face, expression, hairstyle, body contour, and pose. The background, lighting, and shadows must remain identical to the original image." },
            { name: '红', prompt: "Replace the subject's outfit with a red bikini lingerie set paired with red thigh-high stockings. It is crucial to perfectly preserve the subject's face, expression, hairstyle, body contour, and pose. The background, lighting, and shadows must remain identical to the original image." },
            { name: '口', prompt: "change to pov from man view. the subject is sucking a penis, doing a blowjob. trnsparent white liquid over her face and drops.The background, lighting, and shadows must also be identical to the original image; everything else remains unchanged." },
            { name: 'M', prompt: "Change subject's pose to Missionary position, sexual activity, Male penis inserted into female genital area, subject is positioned on her back, legs spread wide apart, with her hands resting on her inner thighs, holding her legs open. The man outside the screen is inserting into the woman's genitals. The character's appearance and expression must remain strictly unchanged. The background, lighting, and shadows must also be identical to the original image; everything else remains unchanged." }
        ],
        customPrompts: [],
        row1Prompts: [
            { prompt: 'Remove all clothing from the subject, leaving them lying on their back as seen from a high angle looking directly down. Scatter the panties, bra, tights, and other clothing on the ground beside the body. Their pose should be open and inviting. Critically, maintain the original face, hair, and identity without any change. The surrounding environment must stay identical. Angle: Top-down view, emphasizing the form on a flat plane.' },
            { prompt: 'Remove all clothing from the subject. From a dramatic low angle looking up, the person is standing tall and confidently. Scatter the panties, bra, tights, and other clothing on the ground beside the body. This perspective should make them look powerful. It is essential to preserve their exact facial features and expression. Do not alter the background or lighting. Angle: Worm\'s-eye view, creating a sense of dominance and height.' },
            { prompt: 'Remove all clothing from the subject, leaving them in a side profile view, kneeling gracefully on the floor. Scatter the panties, bra, tights, and other clothing on the ground beside the body. Their body should be turned exactly 90 degrees from the camera to highlight their silhouette. The character\'s face and identity must be perfectly preserved. Keep all other parts of the image unchanged. Angle: Strict side view, focusing on the outline and curves of the body.' },
            { prompt: 'Remove all clothing from the subject, leaving them in a direct frontal view, standing with a powerful and alluring stance facing the camera. Scatter the panties, bra, tights, and other clothing on the ground beside the body. Ensure their face, hair, and unique identity are not altered in any way. The background must remain exactly as it is. Angle: Eye-level, head-on shot, creating a direct and engaging connection.' },
            { prompt: 'Remove all clothing from the subject. Depict the person from a high camera angle, looking down as they kneel on the ground, and looking up seductively towards the camera. Scatter the panties, bra, tights, and other clothing on the ground beside the body. It is absolutely essential to keep the facial identity identical to the original. Do not modify the rest of the scene. Angle: High-angle view, creating a dynamic of looking down upon the subject.' },
            { prompt: 'Remove all clothing from the subject, leaving them sitting on the edge of a high chair or table, captured from a very low angle. Scatter the panties, bra, tights, and other clothing on the ground beside the body. Their legs should be the focus of the composition. Preserve the person\'s face and hair perfectly. The environment must not be changed. Angle: Very low angle, accentuating the length of the body and creating a provocative mood.' },
            { prompt: 'Remove all clothing from the subject, leaving them positioned in a prone pose (on their stomach or hands and knees) with their buttocks raised and aimed directly at the camera. Scatter the panties, bra, tights, and other clothing on the ground beside the body. They should be looking back over their shoulder, making seductive eye contact with the viewer. The camera\'s focus must be sharply locked on their hips and buttocks, making this the clearest and most detailed area of the image. It is absolutely critical to preserve the person\'s face, hair, and identity without any changes. The background and lighting must also remain identical.' },
            { prompt: 'Remove all clothing from the subject, leaving them in a three-quarters view, leaning forward against a wall or railing. Scatter the panties, bra, tights, and other clothing on the ground beside the body. Their body is angled to the camera to create depth and show form. Do not alter the subject\'s face or unique features. The background must stay the same. Angle: A dynamic angle between front and side, often considered most flattering for form.' },
            { prompt: 'Remove all clothing from the subject. Using a slight dutch angle to make the scene feel more dynamic, the character is in a standing contrapposto pose, with their weight shifted to one foot. Scatter the panties, bra, tights, and other clothing on the ground beside the body. The camera tilt should add a sense of unease or excitement. The facial features, expression, and all background elements must be perfectly preserved. Angle: Tilted camera, adding an artistic and dynamic feel to a classic pose.' }
        ],
        row2Prompts: [
            { prompt: 'Adjust the subject\'s pose to lying on their back as seen from a high angle looking directly down. Their pose should be open and inviting. Critically, maintain the original face, hair, and identity without any change. The surrounding environment must stay identical. Angle: Top-down view, emphasizing the form on a flat plane.' },
            { prompt: 'Adjust the subject\'s pose to standing tall and confidently. From a dramatic low angle looking up, this perspective should make them look powerful. It is essential to preserve their exact facial features and expression. Do not alter the background or lighting. Angle: Worm\'s-eye view, creating a sense of dominance and height.' },
            { prompt: 'Adjust the subject\'s pose to a side profile view, kneeling gracefully on the floor. Their body should be turned exactly 90 degrees from the camera to highlight their silhouette. The character\'s face and identity must be perfectly preserved. Keep all other parts of the image unchanged. Angle: Strict side view, focusing on the outline and curves of the body.' },
            { prompt: 'Adjust the subject\'s pose to a direct frontal view, standing with a powerful and alluring stance facing the camera. Ensure their face, hair, and unique identity are not altered in any way. The background must remain exactly as it is. Angle: Eye-level, head-on shot, creating a direct and engaging connection.' },
            { prompt: 'Adjust the subject\'s pose to kneeling on the ground, looking up seductively towards the camera from a high camera angle. It is absolutely essential to keep the facial identity identical to the original. Do not modify the rest of the scene. Angle: High-angle view, creating a dynamic of looking down upon the subject.' },
            { prompt: 'Adjust the subject\'s pose to sitting on the edge of a high chair or table, captured from a very low angle. Their legs should be the focus of the composition. Preserve the person\'s face and hair perfectly. The environment must not be changed. Angle: Very low angle, accentuating the length of the body and creating a provocative mood.' },
            { prompt: 'Adjust the subject\'s pose to a prone pose (on their stomach or hands and knees) with their buttocks raised and aimed directly at the camera. They should be looking back over their shoulder, making seductive eye contact with the viewer. The camera\'s focus must be sharply locked on their hips and buttocks, making this the clearest and most detailed area of the image. It is absolutely critical to preserve the person\'s face, hair, and identity without any changes. The background and lighting must also remain identical.' },
            { prompt: 'Adjust the subject\'s pose to a three-quarters view, leaning forward against a wall or railing. Their body is angled to the camera to create depth and show form. Do not alter the subject\'s face or unique features. The background must stay the same. Angle: A dynamic angle between front and side, often considered most flattering for form.' },
            { prompt: 'Adjust the subject\'s pose to a standing contrapposto pose, with their weight shifted to one foot. Using a slight dutch angle to make the scene feel more dynamic, the camera tilt should add a sense of unease or excitement. The facial features, expression, and all background elements must be perfectly preserved. Angle: Tilted camera, adding an artistic and dynamic feel to a classic pose.' }
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

    // 获取配置
    function getConfig() {
        const saved = GM_getValue('magicwand_config', null);
        if (saved) {
            try {
                const savedConfig = JSON.parse(saved);
                const config = { ...buildDefaultConfig(), ...savedConfig };
                config.presetPrompts = getDefaultPresetPrompts();
                if (!Array.isArray(config.customPrompts)) {
                    config.customPrompts = [];
                }
                return config;
            } catch (e) {
                return buildDefaultConfig();
            }
        }
        return buildDefaultConfig();
    }

    // 保存配置
    function saveConfig(config) {
        const configToSave = {
            apiUrl: typeof config.apiUrl === 'string' ? config.apiUrl : '',
            apiKey: typeof config.apiKey === 'string' ? config.apiKey : '',
            enabled: typeof config.enabled === 'boolean' ? config.enabled : true,
            customPrompts: Array.isArray(config.customPrompts) ? config.customPrompts : []
        };
        GM_setValue('magicwand_config', JSON.stringify(configToSave));
    }

    // 全局状态
    const state = {
        config: getConfig(),
        processingImages: new Set(),
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
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 8px;
                margin-bottom: 10px;
            }
            .mw-preset-btn {
                padding: 8px 12px;
                background: #f3f4f6;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                cursor: pointer;
                font-size: 12px;
                color: #374151;
                transition: all 0.2s;
            }
            .mw-preset-btn:hover {
                background: #6366f1;
                color: white;
                border-color: #6366f1;
            }
            .mw-number-grid {
                display: grid;
                grid-template-columns: repeat(9, 1fr);
                gap: 4px;
                margin-bottom: 8px;
            }
            .mw-number-btn {
                padding: 6px 4px;
                background: #fef3c7;
                border: 1px solid #fcd34d;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                color: #92400e;
                transition: all 0.2s;
                text-align: center;
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
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 20px;
                color: #6b7280;
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

            /* 图片容器 */
            .mw-container {
                position: relative;
                display: inline-block;
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

    // 创建编辑面板
    function createEditPanel(img, btn) {
        const panel = document.createElement('div');
        panel.className = 'mw-panel';
        const isVideoTarget = isVideoElement(img);

        const config = state.config;
        const allPrompts = [...config.presetPrompts, ...config.customPrompts];

        let numberGrid1Html = '<div class="mw-number-grid">';
        for (let i = 0; i < 9; i++) {
            const row1 = config.row1Prompts[i] || { prompt: '' };
            const row2 = config.row2Prompts[i] || { prompt: '' };
            numberGrid1Html += `<button class="mw-number-btn" data-index="${i}" data-prompt1="${encodeURIComponent(row1.prompt)}" data-prompt2="${encodeURIComponent(row2.prompt)}">${i + 1}</button>`;
        }
        numberGrid1Html += '</div>';

        let html = `
            <div class="mw-panel-title">AI ${isVideoTarget ? '暂停帧' : '图片'}编辑</div>
            ${numberGrid1Html}
            <div class="mw-preset-grid">
        `;

        allPrompts.forEach((p, i) => {
            html += `<button class="mw-preset-btn" data-prompt="${encodeURIComponent(p.prompt)}">${p.name}</button>`;
        });
        html += `<button class="mw-preset-btn" data-custom="true">自定义...</button></div>`;
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
        const numberBtns = panel.querySelectorAll('.mw-number-btn');

        numberBtns.forEach(numBtn => {
            numBtn.addEventListener('click', () => {
                const prompt1 = decodeURIComponent(numBtn.dataset.prompt1 || '');
                const prompt2 = decodeURIComponent(numBtn.dataset.prompt2 || '');
                if (prompt1 && prompt2) {
                    sendDualEditRequest(img, prompt1, prompt2, panel, btn);
                } else {
                    showError(panel, '该编号提示词未配置完整');
                }
            });
        });

        // 预置按钮点击
        presetBtns.forEach(presetBtn => {
            presetBtn.addEventListener('click', () => {
                if (presetBtn.dataset.custom) {
                    inputArea.classList.add('show');
                    input.focus();
                    sendBtn.disabled = false;
                } else {
                    const prompt = decodeURIComponent(presetBtn.dataset.prompt);
                    sendEditRequest(img, prompt, panel, btn);
                }
            });
        });

        // 输入框事件
        input.addEventListener('input', () => {
            sendBtn.disabled = !input.value.trim();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && input.value.trim()) {
                sendEditRequest(img, input.value.trim(), panel, btn);
            }
        });

        // 发送按钮
        sendBtn.addEventListener('click', () => {
            if (input.value.trim()) {
                sendEditRequest(img, input.value.trim(), panel, btn);
            }
        });

        // 取消按钮
        cancelBtn.addEventListener('click', () => {
            closePanel();
        });

        return panel;
    }

    // 发送双提示词编辑请求（并发生成两张图）
    async function sendDualEditRequest(img, prompt1, prompt2, panel, btn) {
        const config = state.config;

        if (!config.apiUrl) {
            showError(panel, '请先配置API端点地址');
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

        showLoading(panel);
        const container = !isVideoTarget ? img.closest('.mw-container') : null;
        const processingOverlay = container ? showProcessingOverlay(container, '双图生成中...') : null;
        const videoOverlay = isVideoTarget ? buildVideoProcessingOverlay(img, '双图生成中...') : null;

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
                callEditAPI(imageBlob, prompt1, config),
                callEditAPI(imageBlob, prompt2, config)
            ]);

            const newImageUrl1 = URL.createObjectURL(newImageBlob1);
            const newImageUrl2 = URL.createObjectURL(newImageBlob2);

            closePanel();
            if (isVideoTarget) {
                showVideoCompareView(img, originalSrc, newImageUrl1, newImageUrl2, '双图对比', btn);
            } else {
                showCompareView(img, originalSrc, newImageUrl1, newImageUrl2, '双图对比', btn);
            }
        } catch (error) {
            console.error('[Magicwand] 双图编辑失败:', error);
            showError(panel, error.message || '双图编辑失败，请重试');
        } finally {
            state.processingImages.delete(imgKey);
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
            document.addEventListener('click', handleOutsideClick);
        }, 0);
    }

    // 处理外部点击
    function handleOutsideClick(e) {
        if (activePanel && !activePanel.contains(e.target) && !e.target.closest('.mw-edit-btn')) {
            closePanel();
        }
    }

    // 关闭面板
    function closePanel() {
        if (activePanel) {
            activePanel.remove();
            activePanel = null;
        }
        document.removeEventListener('click', handleOutsideClick);
    }

    // 显示加载状态
    function showLoading(panel) {
        panel.innerHTML = `
            <div class="mw-loading">
                <div class="mw-spinner"></div>
                <span>正在编辑图片...</span>
            </div>
        `;
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
        overlay.innerHTML = `<span class="mw-processing-text">${prompt.substring(0, 20)}${prompt.length > 20 ? '...' : ''}</span>`;
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
        overlay.innerHTML = `<span class="mw-processing-text">${prompt.substring(0, 20)}${prompt.length > 20 ? '...' : ''}</span>`;
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

        if (!config.apiUrl) {
            showError(panel, '请先配置API端点地址');
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

        showLoading(panel);
        const container = !isVideoTarget ? img.closest('.mw-container') : null;
        const processingOverlay = container ? showProcessingOverlay(container, prompt) : null;
        const videoOverlay = isVideoTarget ? buildVideoProcessingOverlay(img, prompt) : null;

        try {
            if (isVideoTarget) {
                imageBlob = await captureVideoFrame(img);
                originalSrc = URL.createObjectURL(imageBlob);
            } else {
                const imgSrc = getBestImageSrc(img);
                imageBlob = await fetchImage(imgSrc);
                originalSrc = img.src;
            }
            const newImageBlob = await callEditAPI(imageBlob, prompt, config);

            const newImageUrl = URL.createObjectURL(newImageBlob);
            closePanel();
            if (isVideoTarget) {
                showVideoCompareView(img, originalSrc, newImageUrl, originalSrc, prompt, btn);
            } else {
                showCompareView(img, originalSrc, newImageUrl, originalSrc, prompt, btn);
            }

        } catch (error) {
            console.error('[Magicwand] 编辑失败:', error);
            showError(panel, error.message || '编辑失败，请重试');
        } finally {
            state.processingImages.delete(imgKey);
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

    // 调用编辑API
    async function callEditAPI(imageBlob, prompt, config) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('ImageInput', imageBlob, 'image.png');
            formData.append('prompt', prompt);

            const headers = {};
            if (config.apiKey) {
                headers['Authorization'] = `Bearer ${config.apiKey}`;
            }

            GM_xmlhttpRequest({
                method: 'POST',
                url: config.apiUrl,
                data: formData,
                headers: headers,
                responseType: 'blob',
                timeout: 60000,
                onload: (response) => {
                    if (response.status === 200) {
                        resolve(response.response);
                    } else {
                        try {
                            const error = JSON.parse(response.responseText);
                            reject(new Error(error.error || error.detail || '服务器错误'));
                        } catch {
                            reject(new Error(`服务器错误: ${response.status}`));
                        }
                    }
                },
                onerror: () => reject(new Error('网络请求失败')),
                ontimeout: () => reject(new Error('请求超时，图片可能较大'))
            });
        });
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

    // 显示设置面板
    function showSettingsPanel() {
        const config = state.config;

        const overlay = document.createElement('div');
        overlay.className = 'mw-settings-overlay';

        const allPrompts = [...config.presetPrompts, ...config.customPrompts];

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

        overlay.innerHTML = `
            <div class="mw-settings-panel">
                <div class="mw-settings-title">魔法编辑设置</div>

                <div class="mw-settings-group">
                    <label class="mw-settings-label">API 端点地址</label>
                    <input type="text" class="mw-settings-input mw-api-url" value="${config.apiUrl}" placeholder="https://example.com/generate">
                    <div class="mw-settings-hint">ComfyUI服务的generate接口地址</div>
                </div>

                <div class="mw-settings-group">
                    <label class="mw-settings-label">API Key（可选）</label>
                    <input type="text" class="mw-settings-input mw-api-key" value="${config.apiKey}" placeholder="如需认证请填写">
                </div>

                <div class="mw-settings-group">
                    <label class="mw-settings-label">预置提示词</label>
                    <div class="mw-prompts-list">${promptsHtml}</div>
                    <button class="mw-add-prompt-btn">+ 添加自定义提示词</button>
                </div>

                <div class="mw-settings-footer">
                    <button class="mw-save-btn">保存设置</button>
                    <button class="mw-close-btn">关闭</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const apiUrlInput = overlay.querySelector('.mw-api-url');
        const apiKeyInput = overlay.querySelector('.mw-api-key');
        const addPromptBtn = overlay.querySelector('.mw-add-prompt-btn');
        const saveBtn = overlay.querySelector('.mw-save-btn');
        const closeBtn = overlay.querySelector('.mw-close-btn');
        const promptsList = overlay.querySelector('.mw-prompts-list');

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

        // 保存
        saveBtn.addEventListener('click', () => {
            config.apiUrl = apiUrlInput.value.trim();
            config.apiKey = apiKeyInput.value.trim();
            state.config = config;
            saveConfig(config);
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
    console.log('[Magicwand] 脚本已加载，版本 1.0.4');

    markHostContext();
    injectStyles();
    registerMenu();

    if (!state.config.enabled) {
        console.log('[Magicwand] 脚本已禁用');
        return;
    }

    if (!state.config.apiUrl) {
        console.log('[Magicwand] 未配置API端点，请通过油猴菜单设置');
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
