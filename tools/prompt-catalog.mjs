import { readFile } from 'node:fs/promises';

function extractBalanced(source, startIndex) {
    let depth = 0;
    let quote = null;
    for (let i = startIndex; i < source.length; i += 1) {
        const ch = source[i];
        if (quote) {
            if (ch === '\\') {
                i += 1;
                continue;
            }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            continue;
        }
        if (ch === '[' || ch === '{') depth += 1;
        else if (ch === ']' || ch === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(startIndex, i + 1);
        }
    }
    throw new Error('脚本里的括号没有配平');
}

function extractFieldArray(source, field) {
    const token = `${field}:`;
    const at = source.indexOf(token);
    if (at < 0) throw new Error(`脚本里找不到 ${field}`);
    const bracket = source.indexOf('[', at);
    if (bracket < 0) throw new Error(`${field} 不是数组`);
    return extractBalanced(source, bracket);
}

function eachObject(arrayText) {
    const objects = [];
    let depth = 0;
    let quote = null;
    let start = -1;
    for (let i = 0; i < arrayText.length; i += 1) {
        const ch = arrayText[i];
        if (quote) {
            if (ch === '\\') {
                i += 1;
                continue;
            }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            continue;
        }
        if (ch === '{') {
            if (depth === 0) start = i;
            depth += 1;
        } else if (ch === '}') {
            depth -= 1;
            if (depth === 0 && start >= 0) objects.push(arrayText.slice(start, i + 1));
        }
    }
    return objects;
}

function readStringField(objectText, name) {
    const matched = objectText.match(new RegExp(`${name}:\\s*'((?:\\\\'|[^'])*)'`));
    return matched ? matched[1].replace(/\\'/g, "'") : '';
}

function parsePromptObjects(arrayText) {
    return eachObject(arrayText).map((objectText) => ({
        name: readStringField(objectText, 'name'),
        prompt: readStringField(objectText, 'prompt'),
        nude: /nude:\s*true/.test(objectText)
    })).filter((item) => item.prompt);
}

function parseStringArray(arrayText) {
    return [...arrayText.matchAll(/'([^']*)'/g)].map((match) => match[1]);
}

function readDefaultString(block, name) {
    const matched = block.match(new RegExp(`${name}:\\s*'((?:\\\\'|[^'])*)'`));
    if (!matched) throw new Error(`COMFY_DEFAULTS 缺少 ${name}`);
    return matched[1].replace(/\\'/g, "'");
}

function readDefaultNumber(block, name) {
    const matched = block.match(new RegExp(`${name}:\\s*(-?[0-9.]+)`));
    if (!matched) throw new Error(`COMFY_DEFAULTS 缺少 ${name}`);
    return Number(matched[1]);
}

export function mergeDecorators(prompt, decorators) {
    if (!decorators || decorators.length === 0) {
        return String(prompt || '').replace(/\{decorator\}/g, '');
    }
    const useChinese = decorators.some((item) => /[\u4e00-\u9fff]/.test(item));
    const joiner = useChinese ? '。' : '. ';
    const merged = decorators.map((item) => String(item).replace(/[。.\s]+$/u, '')).join(joiner) + joiner;
    return String(prompt || '').replace(/\{decorator\}/g, merged);
}

export function parseCatalog(source) {
    const presets = parsePromptObjects(extractFieldArray(source, 'presetPrompts'));
    const tests = parsePromptObjects(extractFieldArray(source, 'testPrompts'));
    const decorators = parsePromptObjects(extractFieldArray(source, 'decorators'));
    const rowNames = parseStringArray(extractFieldArray(source, 'rowNames'));
    const row1 = parsePromptObjects(extractFieldArray(source, 'row1Prompts'));
    const row2 = parsePromptObjects(extractFieldArray(source, 'row2Prompts'));
    const breakdownMatch = source.match(/const BREAKDOWN_PROMPT = '((?:\\'|[^'])*)'/);
    const sizeMatch = source.match(/const BREAKDOWN_OUTPUT_SIZE = (\d+)/);
    if (!breakdownMatch || !sizeMatch) throw new Error('脚本里找不到拆解提示词');
    const breakdownSize = Number(sizeMatch[1]);

    const defaultsStart = source.indexOf('const COMFY_DEFAULTS = {');
    if (defaultsStart < 0) throw new Error('脚本里找不到 COMFY_DEFAULTS');
    const defaultsBlock = extractBalanced(source, source.indexOf('{', defaultsStart));
    const defaults = {
        unetName: readDefaultString(defaultsBlock, 'unetName'),
        clipName: readDefaultString(defaultsBlock, 'clipName'),
        clipType: readDefaultString(defaultsBlock, 'clipType'),
        vaeName: readDefaultString(defaultsBlock, 'vaeName'),
        loraList: readDefaultString(defaultsBlock, 'loraList'),
        steps: readDefaultNumber(defaultsBlock, 'steps'),
        cfg: readDefaultNumber(defaultsBlock, 'cfg'),
        samplerName: readDefaultString(defaultsBlock, 'samplerName'),
        scheduler: readDefaultString(defaultsBlock, 'scheduler'),
        refResolution: readDefaultNumber(defaultsBlock, 'refResolution'),
        megapixels: readDefaultNumber(defaultsBlock, 'megapixels'),
        timeout: readDefaultNumber(defaultsBlock, 'timeout')
    };

    const edit = [];
    const interact = [];
    presets.forEach((item) => {
        const bucket = String(item.name).startsWith('互动') ? interact : edit;
        bucket.push(item);
    });
    tests.forEach((item) => interact.push(item));

    const poseCount = Math.min(rowNames.length, row1.length, row2.length);
    const pose = [];
    for (let i = 0; i < poseCount; i += 1) {
        pose.push({
            id: `pose:${i}:nude`,
            name: `${rowNames[i]} · 脱衣`,
            prompt: row1[i].prompt
        });
        pose.push({
            id: `pose:${i}:keep`,
            name: `${rowNames[i]} · 留衣`,
            prompt: row2[i].prompt
        });
    }

    const breakdown = {
        id: 'breakdown',
        name: '拆解',
        prompt: breakdownMatch[1].replace(/\\'/g, "'"),
        width: breakdownSize,
        height: breakdownSize
    };

    const groups = [
        { id: 'edit', title: '编辑', items: edit.map((item, index) => ({ id: `edit:${index}`, name: item.name, prompt: item.prompt })) },
        { id: 'interact', title: '互动', items: interact.map((item, index) => ({ id: `interact:${index}`, name: item.name, prompt: item.prompt })) },
        { id: 'pose', title: '姿势', items: pose },
        { id: 'breakdown', title: '拆解', items: [breakdown] }
    ];

    return {
        defaults,
        groups,
        decorators: decorators.map((item, index) => ({ id: `decorator:${index}`, name: item.name, prompt: item.prompt })),
        jobs: groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.id })))
    };
}

export async function loadCatalog(scriptPath) {
    const source = await readFile(scriptPath, 'utf8');
    return parseCatalog(source);
}

export function resolveJobs(catalog, jobIds, decoratorIds) {
    const selected = new Set(jobIds || []);
    const decorators = catalog.decorators
        .filter((item) => (decoratorIds || []).includes(item.id))
        .map((item) => item.prompt);
    return catalog.jobs
        .filter((job) => selected.has(job.id))
        .map((job) => ({
            id: job.id,
            group: job.group,
            name: job.name,
            prompt: job.group === 'breakdown' ? job.prompt : mergeDecorators(job.prompt, decorators),
            width: job.width || 0,
            height: job.height || 0,
            status: 'queued',
            file: '',
            error: '',
            seed: null,
            ms: 0
        }));
}
