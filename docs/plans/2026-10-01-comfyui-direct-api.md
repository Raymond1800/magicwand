# Magicwand 油猴脚本：从自建 MCP 改为直连 ComfyUI API

- 日期：2026-10-01
- 版本：1.0.11 → 1.1.0
- 目标：移除自建 `/generate` 中间层，脚本直接用 ComfyUI 原生 API 完成图片编辑

## 1. 背景与动机

改造前脚本只有一个可配置项 `apiUrl`，指向 `https://uu741047-<id>.westd.seetacloud.com:8443/generate`
——AutoDL **6008 端口**上的自建控制面板（MCP 封装），契约是 `multipart/form-data`（`ImageInput` + `prompt`），
返回图片二进制（见 `2026-02-19-magicwand-userscript-design.md`）。

问题：

- 中间层不透明，模型/工作流改动必须改服务端；
- 无法配置模型、LoRA、步数、像素预算等生成参数；
- 长任务（>60s）会撞脚本的 60s 超时，且关闭面板后任务仍在 GPU 上跑。

## 2. 结论：改用 ComfyUI 原生 API

```
POST {comfyUrl}/upload/image   multipart: image=<blob>, type=input, overwrite=true
                              → {name, subfolder, type}
POST {comfyUrl}/prompt         {prompt: <API格式工作流>, client_id}
                              → {prompt_id, number}；校验失败 400 {error, node_errors}
GET  {comfyUrl}/history/<id>   轮询；status.completed 后取 outputs[*].images[0]
GET  {comfyUrl}/prompt         {exec_info:{queue_remaining}}  → 排队数（进度显示）
GET  {comfyUrl}/view?filename&subfolder&type → 图片二进制
GET  {comfyUrl}/queue          判定自己的任务是 queue_pending 还是 queue_running
POST {comfyUrl}/queue          {delete:[prompt_id]} 删除排队中任务
POST {comfyUrl}/interrupt      中断正在执行的任务
```

全部经实测确认（服务器 `https://u741047-79000efa09bb.westd.seetacloud.com:8443`，ComfyUI 0.37.0，
`*.westd.seetacloud.com` 为 DigiCert 有效证书，油猴直连无自签名告警）。

## 3. 默认工作流：Qwen-Image-2.1 图像编辑

基础取自服务器上的 `B图像-Qwen编辑/B18-Qwen-Image-2.1基础版.json`，按「换解锁模型 + 加 NSFW LoRA」改造：

| 节点 | 取值 |
|------|------|
| `LoadImage` | 脚本上传后的文件名（B18 原文件里该节点被静音，是纯文生图用法；改造后启用） |
| `ImageScaleToTotalPixels` | `megapixels`（默认 1.5）、`lanczos` |
| `GetImageSize` → `EmptyLatentImage` | 由原图比例与像素预算自动推导出图尺寸 |
| `TextEncodeQwenImage21` | `prompt`、`negative_prompt:""`、`resolution:1024`、`clip`、`vae`、参考图输入 **`images.image_1`**（COMFY_AUTOGROW_V3，注意输入名带前缀） |
| `CLIPLoader` | `qwen3vl_8b_int8_convrot.safetensors`，`type=qwen_image` |
| `VAELoader` | `qwen_image_2.1_vae_bf16.safetensors` |
| `UNETLoader` | `qwen/REDQW21-UNLOCKED-v1-BF16-ComfyMCP-builtwithqwen.safetensors`（原 B18 用 `qwen/qwen_image_2.1_int8_convrot`） |
| `LoraLoaderModelOnly` ×2 | `qwen/Qwen-Image-2.1 NSFW Image EditV2.safetensors` @1.0 → 同文件 @0.8（与服务器历史里跑过的作业一致） |
| `ModelAttentionBackend` | `comfy kitchen attention`（Qwen 2.1 必须走这个后端） |
| `KSampler` | `steps=25`、`cfg=1`、`euler`/`simple`、`denoise=1` |
| `VAEDecode` → `SaveImage` | B18 原本是 `PreviewImage`，改为 `SaveImage` 才能用 `/view` 取图 |

> 注意：`TextEncodeQwenImage21` 的 `resolution` 只决定**参考图**喂给文本编码器的尺寸，不决定出图尺寸；
> 出图尺寸来自 `EmptyLatentImage`（本方案由原图推导）。

### 实测数据（同服务器，RTX 5090）

| 场景 | 结果 |
|------|------|
| 1080×1615 人像，中文提示词换装 | 身份/发型/姿态/背景保留，输出 1088×1632 |
| 冷启动（首次载 9B BF16 + LoRA） | 48s |
| 热机 25 步 1.0MP | 11s |
| 热机 25 步 1.5MP（默认） | 15~16s（含排队） |
| 排在他人 2 个任务之后 | 85s（说明共享队列下超时需 ≥300s） |

## 4. 代码改动

`magicwand.user.js`：

1. **配置**：`apiUrl` → `comfyUrl`，新增 `COMFY_DEFAULTS`（unetName / clipName / clipType / vaeName / loraList /
   steps / cfg / samplerName / scheduler / refResolution / megapixels / seedMode / fixedSeed / timeout /
   pollInterval / workflowTemplate）。`getConfig()` 做旧值迁移（去掉 `/generate` 路径段）与数值兜底，
   `saveConfig()` 落盘白名单同步扩展。
2. **客户端模块**（替换原 `callEditAPI`）：`gmRequest` / `uploadImage`（FormData，缺失时降级手写 multipart）/
   `queuePrompt` / `waitForResult` / `fetchOutputImage` / `cancelPrompt` / `testComfyConnection` /
   `formatComfyError`（把 `node_errors` 拼成中文可读错误）。
3. **工作流拼装**：`buildComfyWorkflow()` 按配置生成；`buildWorkflowForRequest()` 在 `workflowTemplate` 非空时
   改用 `renderWorkflowTemplate()` 渲染高级模板（字符串占位符需带引号，数字占位符不带）。
4. **调用方**：`sendEditRequest` / `sendDualEditRequest` 改用 `callComfyEdit`，进度文案实时显示
   `排队中（前面 N 个）· 12s` / `生成中 · 34s`；`state.activeJobs` 登记任务，关闭面板或取消时
   `cancelPrompt`（先 `GET /queue` 判定，pending 才 delete、running 才 interrupt，避免误伤同服务器他人任务）。
5. **客户端预缩放**：源图 > 2×像素预算时先用 canvas 缩小再上传，减少上传体积（最终尺寸仍由工作流决定）。
6. **设置面板**：服务器地址（含「测试连接」按钮，回显版本+显卡）、API Key、模型配置（UNET/CLIP/VAE/LoRA 列表）、
   生成参数（步数/像素预算/采样器/调度器/参考图分辨率/超时/种子模式）、高级（整份工作流模板 textarea）。

`tools/comfyui-smoke.mjs`（新增）：Node 18+ 无依赖冒烟脚本，复刻同一套工作流结构，
`node tools/comfyui-smoke.mjs --server https://host:8443` 即可验证 上传→提交→轮询→下载 全链路，
用于换服务器/换模型后的快速自检。

## 5. 验证记录

- `node --check magicwand.user.js`、`node --check tools/comfyui-smoke.mjs` 通过。
- 冒烟脚本对真实服务器实跑通过（连接 → 上传 → 提交 → 15s 出图 → 下载 744KB）。
- **用户脚本本体**（不是副本）在 Node 里以 GM 桩加载后跑 16 项断言，全部通过：
  LoRA 解析、模板字符串转义/数字类型/非法 JSON 报错、工作流引用完整性、LoRA 链顺序、K采样器接线、
  参考图接线、尺寸来源、模板覆盖生效、测试连接、真实出图（15.6s / 1.7MB / 10 次进度回调）、
  **提交后立刻取消队列中不再有该任务**、错误信息可读、旧配置迁移。
- **真实浏览器验证**（headless Chrome + CDP，页面内注入 GM 桩后运行 `magicwand.user.js` 本体）：
  脚本加载（版本 1.1.0）、识别图片并注入按钮、设置面板全部字段默认值正确、
  「测试连接」返回 `连接成功：ComfyUI 0.37.0 · cuda:0 NVIDIA GeForce RTX 5090`、
  面板内提示词输入 → 发送 → 进度文案实时变化（`正在上传图片...` → `排队中（前面 1 个）· 5s/9s/14s`）→
  滑块对比视图出现且渲染正确；运行中点击面板外部 → 队列 `running` 由 1 变 0（真取消生效）。

### 浏览器验证中发现并修掉的一个真 bug

原先所有面板内按钮的 click 都会冒泡到 `document` 的「点击面板外部关闭」监听器。
而按钮处理器会**同步**用 `showLoading()` 替换 `panel.innerHTML`，导致被点的按钮已经从 DOM 上摘除，
此时 `activePanel.contains(e.target)` 变成 `false` → 监听器误判为「点击了面板外部」→ `closePanel()`。

- 改造前后果：面板在点击预设词后立刻消失（加载文案看不见），但请求仍在跑，结果照常显示；
- 加上「关闭面板即取消任务」后，后果升级为**任务被立刻取消、什么也不出**。

修复（两处一起做，互为保险）：

1. 面板内所有按钮（编号/装饰器/预置/测试/发送/取消）统一 `e.preventDefault(); e.stopPropagation();`，事件不再冒泡到 `document`；
2. `handleOutsideClick` 改为**捕获阶段**监听（`{ capture: true }`），在任何按钮处理器改动 DOM 之前就完成「是否在面板内」的判断；
3. 顺手把加载视图改成竖排（spinner + 文案 + 「取消生成」按钮），进度文案现在真正可见，取消也有明确入口。

## 6. 迁移与运维

- 首次加载会自动把旧 `apiUrl` 的 `/generate` 路径去掉存成 `comfyUrl`，并在控制台提示确认地址。
- **6008 → 6006 的主机名差异无法自动推断**（`uu741047-…` → `u741047-…`），必须人工在设置里改成
  ComfyUI 的 6006 地址后用「测试连接」自证。
- 服务器换实例/换模型后，若 `/prompt` 返回 400，错误提示会指出出错节点与原异常信息；
  模型名可在设置面板改，结构不同则用「高级 → 工作流模板」整份替换，并先跑 `tools/comfyui-smoke.mjs`。

## 7. 已知取舍

- 双图（9 宫格按钮）仍是两个独立 `/prompt` 任务，服务端串行执行，热机约 2×15s；
  如后续要更快，可改为「单 job 双采样器 + 两个 SaveImage」。
- 未使用 WebSocket 进度（`GM_xmlhttpRequest` 不支持 WS，页面 CSP 也可能拦截），只轮询 `/history` 与 `/prompt`。
- 取消仅在「面板关闭/取消」时触发；若用户通过 `showEditPanel` 直接打开另一张图的面板，前一个任务会继续跑完。
