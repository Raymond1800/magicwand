# AGENTS.md

Guide for agentic coding agents operating in this repository.

## Project Overview

This is a Tampermonkey/Greasemonkey userscript for AI-powered image editing on web pages. The script detects images on any webpage, injects edit buttons, and allows users to edit images via a ComfyUI API with slider comparison between original and edited images.

**Tech Stack**: Pure JavaScript (ES6+), Tampermonkey API (GM_*), CSS, no build system or external dependencies.

## Build/Lint/Test Commands

This project has no build system, package manager, or automated tests. All verification is manual:

```bash
# Syntax check (optional)
node --check magicwand.user.js

# Install in browser
# 1. Open Tampermonkey extension → Create new script
# 2. Paste magicwand.user.js content → Save
# 3. Test on any webpage with images (100x100px minimum)
```

**Manual Testing**: Verify magic wand button appears on image hover, edit panel displays, API calls work, slider comparison functions.

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
const DEFAULT_CONFIG = {
    apiUrl: '',           // string: ComfyUI API endpoint
    apiKey: '',           // string: Optional auth token
    enabled: true,        // boolean: Script enabled state
    presetPrompts: [],    // Array<{name: string, prompt: string}>
    customPrompts: []     // Array<{name: string, prompt: string}>
};
```

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
- Set appropriate timeouts (30s for fetch, 60s for API calls)

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
- Use Sets for tracking unique items

```javascript
const state = {
    config: getConfig(),
    processingImages: new Set()
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
├── docs/
│   └── plans/           # Implementation plans and design docs
└── AGENTS.md            # This file
```

## Important Notes

- Chinese is used for UI text and comments - maintain this for consistency
- The script runs on all websites (`@match *://*/*`)
- Images must be at least 100x100px to be processed
- API expects `multipart/form-data` with `ImageInput` and `prompt` fields
