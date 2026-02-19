// ==UserScript==
// @name         Magicwand - 魔法图片编辑
// @namespace    https://magicwand.ai/
// @version      1.0.0
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
            { name: '人物动作编辑', prompt: '修改人物动作姿势' },
            { name: '人物穿着编辑', prompt: '修改人物服装穿着' },
            { name: '背景替换', prompt: '替换图片背景' }
        ],
        customPrompts: []
    };

    // 获取配置
    function getConfig() {
        const saved = GM_getValue('magicwand_config', null);
        if (saved) {
            try {
                return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
            } catch (e) {
                return DEFAULT_CONFIG;
            }
        }
        return DEFAULT_CONFIG;
    }

    // 保存配置
    function saveConfig(config) {
        GM_setValue('magicwand_config', JSON.stringify(config));
    }

    // 全局状态
    const state = {
        config: getConfig(),
        processingImages: new Set()
    };

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
            }
            .mw-compare-container img {
                display: block;
                max-width: none;
            }
            .mw-new-image {
                position: relative;
            }
            .mw-old-image {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                object-fit: cover;
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
    function createEditButton(img) {
        const btn = document.createElement('div');
        btn.className = 'mw-edit-btn';
        btn.innerHTML = MAGIC_WAND_SVG;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showEditPanel(img, btn);
        });
        return btn;
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
        if (!isProcessableImage(img)) return;
        if (img.closest('.mw-compare-container')) return;
        if (img.closest('.mw-container')) return;

        img.setAttribute('data-magicwand-processed', 'true');

        const container = document.createElement('div');
        container.className = 'mw-container';
        img.parentNode.insertBefore(container, img);
        container.appendChild(img);

        const btn = createEditButton(img);
        container.appendChild(btn);
    }

    // 扫描页面所有图片
    function scanImages() {
        const images = document.querySelectorAll('img');
        images.forEach(processImage);
    }

    // 设置MutationObserver监听新图片
    function setupObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.tagName === 'IMG') {
                        processImage(node);
                    } else if (node.querySelectorAll) {
                        node.querySelectorAll('img').forEach(processImage);
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // 脚本入口
    console.log('[Magicwand] 脚本已加载');
    injectStyles();
    scanImages();
    setupObserver();

})();
