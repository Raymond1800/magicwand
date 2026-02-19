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

    // 当前活动的面板
    let activePanel = null;

    // 创建编辑面板
    function createEditPanel(img, btn) {
        const panel = document.createElement('div');
        panel.className = 'mw-panel';

        const config = state.config;
        const allPrompts = [...config.presetPrompts, ...config.customPrompts];

        let html = `
            <div class="mw-panel-title">AI 图片编辑</div>
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

    // 显示编辑面板
    function showEditPanel(img, btn) {
        if (activePanel) {
            activePanel.remove();
        }

        const panel = createEditPanel(img, btn);
        const container = img.closest('.mw-container');

        // 计算位置
        const imgRect = img.getBoundingClientRect();
        panel.style.position = 'fixed';
        panel.style.top = `${imgRect.bottom + 10}px`;
        panel.style.left = `${Math.max(10, Math.min(imgRect.left, window.innerWidth - 260))}px`;

        document.body.appendChild(panel);
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

    // 发送编辑请求
    async function sendEditRequest(img, prompt, panel, btn) {
        const config = state.config;

        if (!config.apiUrl) {
            showError(panel, '请先配置API端点地址');
            return;
        }

        const imgSrc = img.getAttribute('data-original-src') || img.src;
        const imgKey = imgSrc.substring(0, 100);

        if (state.processingImages.has(imgKey)) {
            return;
        }
        state.processingImages.add(imgKey);

        showLoading(panel);
        const container = img.closest('.mw-container');
        const processingOverlay = container ? showProcessingOverlay(container, prompt) : null;

        try {
            const imageBlob = await fetchImage(imgSrc);
            const newImageBlob = await callEditAPI(imageBlob, prompt, config);

            const newImageUrl = URL.createObjectURL(newImageBlob);
            const originalSrc = img.src;

            closePanel();
            showCompareView(img, originalSrc, newImageUrl, prompt, btn);

        } catch (error) {
            console.error('[Magicwand] 编辑失败:', error);
            showError(panel, error.message || '编辑失败，请重试');
        } finally {
            state.processingImages.delete(imgKey);
            hideProcessingOverlay(processingOverlay);
        }
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
    function showCompareView(originalImg, originalSrc, newSrc, prompt, editBtn) {
        const container = originalImg.closest('.mw-container');
        if (!container) return;

        originalImg.style.display = 'none';
        editBtn.style.display = 'none';

        const compareContainer = document.createElement('div');
        compareContainer.className = 'mw-compare-container';

        const rect = originalImg.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(originalImg);

        compareContainer.style.width = originalImg.width + 'px';
        compareContainer.style.height = originalImg.height + 'px';

        compareContainer.innerHTML = `
            <img class="mw-new-image" src="${newSrc}" style="width: ${originalImg.width}px; height: ${originalImg.height}px; object-fit: ${computedStyle.objectFit || 'fill'};">
            <img class="mw-old-image" src="${originalSrc}" style="object-fit: ${computedStyle.objectFit || 'fill'};">
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
            editBtn.style.display = '';
            originalImg.removeAttribute('data-original-src');
        });

        // 重新编辑
        reeditBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            compareContainer.remove();
            originalImg.style.display = '';
            editBtn.style.display = '';
            showEditPanel(originalImg, editBtn);
        });

        // 保存原始src以便后续恢复
        originalImg.setAttribute('data-original-src', originalSrc);
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
    console.log('[Magicwand] 脚本已加载，版本 1.0.0');

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
        });
    } else {
        scanImages();
        setupObserver();
    }

    console.log('[Magicwand] 初始化完成');

})();
