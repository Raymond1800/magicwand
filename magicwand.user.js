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

    // 脚本入口
    console.log('[Magicwand] 脚本已加载');

})();
