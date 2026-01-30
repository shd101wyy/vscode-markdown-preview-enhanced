# VSCode Markdown Preview Enhanced：预览“卡在加载中 / 预览空白”静态审计

> 范围：本仓库 `src/` 的 VSCode 扩展侧逻辑（PreviewProvider、事件监听、消息转发、Notebook 管理）。  
> 不包含：`crossnote` 内部实现（`engine.generateHTMLTemplateForPreview` / `engine.parseMD` 生成的 Webview 前端脚本与解析器细节），因此对 Webview 侧“Loading”UI 的具体状态机只能做推断。

## 1. 预览渲染链路（扩展侧）

典型流程（以 `PreviewMode.SinglePreview` 为例）：

1. 用户打开预览：`openPreview/openPreviewToTheSide` → `PreviewProvider.initPreview`
2. `initPreview` 调用 `engine.generateHTMLTemplateForPreview(...)` 并设置 `webview.html`
3. Webview 前端加载完成后，向扩展发消息 `_crossnote.webviewFinishLoading`
4. 扩展收到 `_crossnote.webviewFinishLoading` → `webviewFinishLoading` → `previewProvider.updateMarkdown(sourceUri)`
5. `updateMarkdown`：
   - `postMessageToPreview(... startParsingMarkdown ...)`（UI 进入“加载中”）
   - `engine.parseMD(...)`（解析 Markdown）
   - 若资源依赖变更：`refreshPreview` → `initPreview`（重新加载 iframe/模板）
   - 否则：`postMessageToPreview(... updateHtml ...)`（Webview 更新正文）

核心入口位置：

- `src/extension-common.ts`：`webviewFinishLoading`、`onDidChangeTextDocument`、`onDidChangeActiveTextEditor`
- `src/preview-provider.ts`：`initPreview`、`updateMarkdown`、`postMessageToPreview`、`getPreviews`

## 2. 高优先级风险点（与“第二个文档一直加载/预览空白”强相关）

### 2.1 单预览模式下，消息路由没有绑定“当前目标文档”，极易被旧请求污染

在 `PreviewMode.SinglePreview`：

- `PreviewProvider.getPreviews(sourceUri)` 只要单预览面板存在，就无条件返回 `[singlePreviewPanel]`（不校验 `sourceUri` 是否等于当前 `singlePreviewPanelSourceUriTarget`）。
- `PreviewProvider.isPreviewOn(sourceUri)` 在单预览模式也只要面板存在就返回 `true`。

结果：只要扩展侧任何地方触发了 `postMessageToPreview(sourceUri, ...)` / `updateMarkdown(sourceUri)`，消息都会发送到“当前这个唯一的面板”，不管它此刻展示的到底是哪一个文档。

这会制造非常典型的竞态场景：

- 你从文档 A 切到文档 B（`onDidChangeActiveTextEditor` 触发 `initPreview(B)`，面板开始加载 B）。
- A 的某个异步回调稍后才到（例如 Webview 前端仍在回调 `_crossnote.webviewFinishLoading(A)`，或 A 的 `onDidChangeTextDocument`、文件监听触发 `updateMarkdown(A)`）。
- 扩展向单一面板发送 `startParsingMarkdown`（UI 变“Loading”），随后解析 A 并发送 `updateHtml(A)`。
- 如果 Webview 前端在切换到 B 后按 `sourceUri` 做了过滤/忽略旧消息，则可能出现：**“Loading”已被打开，但对应的 `updateHtml` 被忽略** → **卡在加载中**。
- 如果 Webview 前端不做过滤，则会出现：**B 的预览被 A 的内容覆盖**（用户感知为“预览不对 / 空白 / 闪烁”）。

同类污染源非常多（均会在单预览模式下误投递到当前面板）：

- `src/extension-common.ts` 的 `onDidChangeTextDocument`（后台文档编辑也会触发）
- `src/file-watcher.ts` 的 `updatedNote/createdNote/deletedNote`
- 任何对 `postMessageToPreview(uri, ...)` 的调用（滚动同步、backlinks 等）

结论：**单预览模式需要“以当前 target 文档为准”的强约束，否则只要存在延迟/后台事件，就会出现偶现卡死或空白。**

### 2.2 缺少“渲染请求版本号/取消机制”，旧的 parse 结果会覆盖新的状态

`updateMarkdown` 内部是串行 await（先 `startParsingMarkdown` → 再 `parseMD` → 再 `updateHtml/refreshPreview`），但它本身可能被并发触发：

- Webview 加载完成回调触发一次
- Live update（`onDidChangeTextDocument` + debounce）触发多次
- 配置变化触发 `refreshAllPreviews`，间接触发 `initPreview` → Webview 再触发 loading 回调

如果在切换文档/刷新期间，旧的 `updateMarkdown(A)` 比新的 `updateMarkdown(B)` 更晚完成，就会出现“后完成的旧任务覆盖新任务”的问题。  
这类问题在单预览模式下尤为明显，因为目标面板只有一个。

### 2.3 `JSAndCssFiles` 变更判定可能不稳定，导致反复 `refreshPreview`（看起来像一直加载/空白）

`updateMarkdown` 里如果检测到 `JSAndCssFiles` 变化就 `refreshPreview(sourceUri)`，相当于强制重建 Webview 模板/iframe：

- 若 `JSAndCssFiles` 的顺序不稳定（同一组文件但顺序不同）
- 若其内容包含随机 query/hash、临时路径、或某些插件每次 parse 都会插入不同资源

则会触发：

`parseMD` → 发现资源变化 → `refreshPreview` → Webview 重新加载 → `_crossnote.webviewFinishLoading` → `updateMarkdown` → …

用户侧表现为：预览反复 reload、长期停留在 Loading、或短暂白屏。

## 3. 次优先级风险点（会加重“偶现空白/不同步”）

### 3.1 `postMessageToPreview` 只给 `preview.visible === true` 的面板发消息

这在多预览模式下会导致后台面板长期不更新；当用户切换回去时看到的是旧状态甚至“Loading”状态。  
在单预览模式下通常影响较小，但在“面板未激活/被遮挡”的边界情况下仍可能造成状态不同步。

### 3.2 Web 扩展环境的资源根配置存在可疑点

在 `isVSCodeWebExtension()` 分支中，`utility.setCrossnoteBuildDirectory` 可能是 `https://.../out/`。  
但 `initPreview` 仍把它塞进 `localResourceRoots`：`vscode.Uri.file(utility.getCrossnoteBuildDirectory())`。  
`localResourceRoots` 期望本地 file Uri，这里用 URL 字符串构造 file Uri 行为可疑，可能造成 Webview 资源加载异常（进而白屏或无法触发 `_crossnote.webviewFinishLoading`）。

是否真实触发取决于 Web 扩展打包方式与 `crossnote` 侧资源引用方式，但属于值得重点验证的隐患。

## 4. 建议的排查与观测（优先做，能快速定位“偶现”）

1. 增加扩展侧日志（建议 OutputChannel）记录：

   - 时间戳、`sourceUri`、当前 `singlePreviewPanelSourceUriTarget`、触发源（webviewFinishLoading / onDidChangeTextDocument / refreshAllPreviews）
   - 每次 `updateMarkdown` 分配递增 `renderRequestId`
   - `startParsingMarkdown` / `updateHtml` / `refreshPreview` 是否成对出现

2. 增加 Webview 前端错误回传（需要在 `crossnote` 模板里做，或在模板 head 注入）：

   - `window.onerror` / `unhandledrejection` 将错误 `postMessage` 回扩展
   - 记录收到的 `sourceUri` 与当前页面状态（是否忽略旧消息）

3. 针对“切换第二个文档卡 Loading”做最小复现脚本：
   - 打开 A 预览
   - 立刻切换到 B（连续快速切换更容易触发）
   - 同时让 A 有后台事件（编辑 A、保存、触发文件 watcher）
   - 观察日志里是否出现 `updateMarkdown(A)` 在 `initPreview(B)` 之后仍在向面板发 `startParsingMarkdown`

## 5. 修复建议（按收益/风险排序）

### 5.1 单预览模式：只允许“当前 target 文档”驱动面板（强烈建议）

在扩展侧增加硬性约束，至少满足之一：

- `getPreviews(sourceUri)` 在单预览模式下仅当 `sourceUri.fsPath === singlePreviewPanelSourceUriTarget.fsPath` 时才返回面板；否则返回 `null`。
- 或者在 `postMessageToPreview` / `updateMarkdown` 开头：若单预览且 `sourceUri` 不等于 target，则直接 `return`（或仅允许少数全局消息通过）。

这可以从根上消除“旧文档异步事件污染当前预览”的竞态。

### 5.2 引入 `renderRequestId` / 可取消的渲染任务（建议）

思路：每个面板（或每个 `sourceUri`）维护一个递增版本号：

- `updateMarkdown` 开始时记录本次 id
- `parseMD` 完成后若 id 不是最新，则丢弃结果，不再发送 `updateHtml` / `refreshPreview`

这样即使有并发触发，也能保证“最后一次请求赢”。

### 5.3 稳定化 `JSAndCssFiles` 比较（建议）

在比较前做规范化：

- 去重、排序、过滤明显的易变项（如带时间戳 query）
- 用稳定的 key（例如只比较 pathname + hash 或只比较集合）判断是否需要 `refreshPreview`

避免无意义的反复 reload。

### 5.4 处理后台面板更新策略（视需求）

如果希望后台面板也保持新内容：

- 不要用 `preview.visible` 作为唯一条件；或为不可见面板缓存“待更新”的最后一条消息，切换可见时补发。

### 5.5 Web 扩展资源根（若你需要支持 web 版，建议专项验证）

核对 `localResourceRoots` 与 `crossnoteBuildDirectory` 的使用是否符合 VSCode Webview 约束，必要时区分：

- 本地打包资源（file）
- 远程 CDN 资源（https，受 CSP/allowlist 影响）

## 6. 审计结论

从扩展侧代码看，“第二个文档一直加载 / 预览偶现空白”最符合的根因是：

- **单预览模式下，消息/渲染任务没有绑定当前目标文档，导致旧文档的异步任务（webviewFinishLoading、live update、file watcher 等）污染当前面板**；
- 再叠加 **缺少渲染请求版本控制** 与 **资源依赖变更判定可能不稳定**，使得问题呈现为“偶发、难复现、与切换/刷新/后台事件强相关”。
