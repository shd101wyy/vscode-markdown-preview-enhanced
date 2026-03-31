import {
  Notebook,
  NotebookConfig,
  ParserConfig,
  PreviewMode,
  PreviewTheme,
  getDefaultParserConfig,
  loadConfigsInDirectory,
} from 'crossnote';
import * as vscode from 'vscode';
import {
  MarkdownPreviewEnhancedConfig,
  PreviewColorScheme,
  getMPEConfig,
} from './config';
import FileWatcher from './file-watcher';
import { getAllPreviewProviders } from './preview-provider';
import {
  getWorkspaceFolderUri,
  globalConfigPath,
  isVSCodeWebExtension,
} from './utils';
import { wrapVSCodeFSAsApi } from './vscode-fs';

class NotebooksManager {
  private notebooks: Notebook[] = [];
  public systemColorScheme: 'light' | 'dark' = 'light';
  private fileWatcher: FileWatcher;
  private currentMPEConfig: MarkdownPreviewEnhancedConfig = MarkdownPreviewEnhancedConfig.getCurrentConfig();
  /** Cache of D2 renders: key = hash of (code + attrs), value = rendered SVG/error HTML */
  private d2Cache: Map<string, string> = new Map();

  constructor(private context: vscode.ExtensionContext) {
    this.fileWatcher = new FileWatcher(this.context, this);
  }

  public async getNotebook(uri: vscode.Uri): Promise<Notebook> {
    const workspaceFolderUri = getWorkspaceFolderUri(uri);

    // Check if workspaceUri.fsPath already exists in this.notebooks
    for (let i = 0; i < this.notebooks.length; i++) {
      if (this.notebooks[i].notebookPath.fsPath === workspaceFolderUri.fsPath) {
        return this.notebooks[i];
      }
    }
    // If not, create a new Notebook instance and push it to this.notebooks
    const notebook = await Notebook.init({
      notebookPath: workspaceFolderUri.toString(),
      fs: wrapVSCodeFSAsApi(workspaceFolderUri.scheme),
      config: {},
    });
    this.notebooks.push(notebook);
    notebook.updateConfig(await this.loadNotebookConfig(uri));
    return notebook;
  }

  public async updateNotebookConfig(
    uri: vscode.Uri,
    createWorkspaceConfigDirectoryIfNotExists: boolean = false,
  ) {
    const notebook = await this.getNotebook(uri);
    const config = await this.loadNotebookConfig(
      uri,
      createWorkspaceConfigDirectoryIfNotExists,
    );
    notebook.updateConfig(config);
  }

  private async loadNotebookConfig(
    uri: vscode.Uri,
    createWorkspaceConfigDirectoryIfNotExists: boolean = false,
  ): Promise<Partial<MarkdownPreviewEnhancedConfig>> {
    const notebook = await this.getNotebook(uri);

    // Global config
    let globalConfig: Partial<NotebookConfig> = {};
    if (!isVSCodeWebExtension()) {
      try {
        globalConfig = await loadConfigsInDirectory(
          globalConfigPath,
          notebook.fs,
          true,
        );
      } catch (error) {
        console.error(error);
      }
    }

    // Workspace config
    let workspaceConfig: Partial<NotebookConfig> = {};
    const workspaceConfigPath = vscode.Uri.joinPath(
      getWorkspaceFolderUri(uri),
      './.crossnote',
    );
    if (
      (await notebook.fs.exists(workspaceConfigPath.fsPath)) ||
      createWorkspaceConfigDirectoryIfNotExists
    ) {
      try {
        workspaceConfig = await loadConfigsInDirectory(
          workspaceConfigPath.fsPath,
          notebook.fs,
          createWorkspaceConfigDirectoryIfNotExists,
        );
      } catch (error) {
        console.error(error);
      }
    }

    // VSCode config
    const vscodeMPEConfig = MarkdownPreviewEnhancedConfig.getCurrentConfig();
    this.currentMPEConfig = vscodeMPEConfig;

    // Preview theme
    const previewTheme = this.getPreviewTheme(
      vscodeMPEConfig.previewTheme,
      vscodeMPEConfig.previewColorScheme,
    );

    return {
      ...vscodeMPEConfig,
      ...globalConfig,
      ...workspaceConfig,
      globalCss:
        (globalConfig.globalCss ?? '') + (workspaceConfig.globalCss ?? ''),
      previewTheme,
      ...(!isVSCodeWebExtension() && {
        parserConfig: createD2ParserConfig(
          (workspaceConfig.parserConfig ??
            globalConfig.parserConfig ??
            getDefaultParserConfig()) as ParserConfig,
          {
            d2Path: vscodeMPEConfig.d2Path || 'd2',
            d2Layout: vscodeMPEConfig.d2Layout || 'dagre',
            d2Theme: vscodeMPEConfig.d2Theme ?? 0,
            d2Sketch: vscodeMPEConfig.d2Sketch ?? false,
          },
          this.d2Cache,
        ),
      }),
    };
  }

  public setSystemColorScheme(colorScheme: 'light' | 'dark') {
    if (this.systemColorScheme !== colorScheme) {
      this.systemColorScheme = colorScheme;
      if (
        getMPEConfig<PreviewColorScheme>('previewColorScheme') ===
        PreviewColorScheme.systemColorScheme
      ) {
        this.updateAllNotebooksConfig();
      }
    }
  }

  public async updateWorkbenchEditorAssociationsBasedOnPreviewMode() {
    const workbenchConfig = vscode.workspace.getConfiguration('workbench');
    const previewMode = getMPEConfig<PreviewMode>('previewMode');
    const markdownFileExtensions = getMPEConfig<string[]>(
      'markdownFileExtensions',
    ) ?? ['.md'];
    const editorAssociations =
      workbenchConfig.get<{ [key: string]: string }>('editorAssociations') ??
      {};
    let newEditorAssociations = { ...editorAssociations };
    if (previewMode === PreviewMode.PreviewsOnly) {
      const associations: { [key: string]: string } = {};
      markdownFileExtensions.forEach((ext) => {
        associations[`*${ext}`] = 'markdown-preview-enhanced';
      });
      // Add associations to editorAssociations
      newEditorAssociations = { ...editorAssociations, ...associations };
    } else {
      // delete associations from editorAssociations if exists and value is 'markdown-preview-enhanced'
      markdownFileExtensions.forEach((ext) => {
        if (editorAssociations[`*${ext}`] === 'markdown-preview-enhanced') {
          delete newEditorAssociations[`*${ext}`];
        }
      });
    }

    if (
      JSON.stringify(newEditorAssociations) !==
      JSON.stringify(editorAssociations)
    ) {
      await workbenchConfig.update(
        'editorAssociations',
        newEditorAssociations,
        vscode.ConfigurationTarget.Global,
      );
    }
  }

  public async updateAllNotebooksConfig() {
    const previewProviders = getAllPreviewProviders();
    await this.updateWorkbenchEditorAssociationsBasedOnPreviewMode();
    const newMPEConfig = MarkdownPreviewEnhancedConfig.getCurrentConfig();

    // If previewMode changed, close all previews.
    if (this.currentMPEConfig.previewMode !== newMPEConfig.previewMode) {
      previewProviders.forEach((provider) => {
        provider.closeAllPreviews(this.currentMPEConfig.previewMode);
      });
    }

    // Clear D2 cache when config changes (e.g. d2Path/d2Layout/d2Theme/d2Sketch may have changed)
    if (
      this.currentMPEConfig.d2Path !== newMPEConfig.d2Path ||
      this.currentMPEConfig.d2Layout !== newMPEConfig.d2Layout ||
      this.currentMPEConfig.d2Theme !== newMPEConfig.d2Theme ||
      this.currentMPEConfig.d2Sketch !== newMPEConfig.d2Sketch
    ) {
      this.d2Cache.clear();
    }

    // Update all notebooks config
    await Promise.all(
      this.notebooks.map(async (notebook) => {
        const config = await this.loadNotebookConfig(notebook.notebookPath);
        notebook.updateConfig(config);
      }),
    );

    // Refresh all previews
    previewProviders.forEach((provider) => {
      provider.refreshAllPreviews();
    });

    this.currentMPEConfig = newMPEConfig;
  }

  private getPreviewThemeByLightOrDark(
    theme: PreviewTheme,
    color: 'light' | 'dark',
  ): PreviewTheme {
    switch (theme) {
      case 'atom-dark.css':
      case 'atom-light.css': {
        return color === 'light' ? 'atom-light.css' : 'atom-dark.css';
      }
      case 'github-dark.css':
      case 'github-light.css': {
        return color === 'light' ? 'github-light.css' : 'github-dark.css';
      }
      case 'one-light.css':
      case 'one-dark.css': {
        return color === 'light' ? 'one-light.css' : 'one-dark.css';
      }
      case 'solarized-light.css':
      case 'solarized-dark.css': {
        return color === 'light' ? 'solarized-light.css' : 'solarized-dark.css';
      }
      default: {
        return theme;
      }
    }
  }

  public getEditorColorScheme(): 'light' | 'dark' {
    if (
      [
        vscode.ColorThemeKind.Light,
        vscode.ColorThemeKind.HighContrastLight,
      ].find((themeKind) => {
        return vscode.window.activeColorTheme.kind === themeKind;
      })
    ) {
      return 'light';
    } else {
      return 'dark';
    }
  }

  private getPreviewTheme(
    theme: PreviewTheme,
    colorScheme: PreviewColorScheme,
  ): PreviewTheme {
    if (colorScheme === PreviewColorScheme.editorColorScheme) {
      return this.getPreviewThemeByLightOrDark(
        theme,
        this.getEditorColorScheme(),
      );
    } else if (colorScheme === PreviewColorScheme.systemColorScheme) {
      return this.getPreviewThemeByLightOrDark(theme, this.systemColorScheme);
    } else {
      return theme;
    }
  }

  public async refreshNoteRelations(noteFilePath: string) {}

  public async getNoteBacklinks(
    noteUri: vscode.Uri,
    forceRefreshingNotes: boolean = false,
  ) {
    const notebook = await this.getNotebook(noteUri);

    if (forceRefreshingNotes) {
      await notebook.refreshNotes({
        dir: '.',
        includeSubdirectories: true,
        refreshRelations: true,
      });
    } else {
      await notebook.refreshNotesIfNotLoaded({
        dir: '.',
        includeSubdirectories: true,
      });
    }
    this.fileWatcher.startFileWatcher();
    const backlinks = await notebook.getNoteBacklinks(noteUri.fsPath);
    return backlinks.map((backlink) => {
      return {
        note: backlink.note,
        references: backlink.references,
        referenceHtmls: backlink.referenceHtmls,
      };
    });
  }
}

export default NotebooksManager;

// ---------------------------------------------------------------------------
// D2 diagram rendering helpers
// ---------------------------------------------------------------------------

interface D2RenderOptions {
  d2Path: string;
  d2Layout: string;
  d2Theme: number;
  d2Sketch: boolean;
}

/**
 * Render a single D2 diagram source string to SVG (or an error HTML block).
 * Writes temp files, shells out to the `d2` CLI, then cleans up.
 */
/**
 * Returned when d2 is not installed — signals the caller to leave the
 * original code block in place rather than showing an error.
 */
const D2_NOT_FOUND = Symbol('D2_NOT_FOUND');

async function renderD2ToSvg(
  code: string,
  opts: D2RenderOptions,
): Promise<string | typeof D2_NOT_FOUND> {
  // critical path (they are still polyfilled, but never actually called
  // because we guard with isVSCodeWebExtension() before calling this).
  const os = await import('os');
  const fs = await import('fs');
  const path = await import('path');
  const crypto = await import('crypto');
  const { execFile } = await import('child_process');

  const id = crypto.randomBytes(8).toString('hex');
  const tmpIn = path.join(os.tmpdir(), `d2-${id}.d2`);
  const tmpOut = path.join(os.tmpdir(), `d2-${id}.svg`);

  try {
    await fs.promises.writeFile(tmpIn, code, 'utf8');
    await new Promise<void>((resolve, reject) => {
      const args = [
        `--theme=${opts.d2Theme}`,
        `--layout=${opts.d2Layout}`,
        ...(opts.d2Sketch ? ['--sketch'] : []),
        tmpIn,
        tmpOut,
      ];
      execFile(
        opts.d2Path,
        args,
        { windowsHide: true, shell: true },
        (err, _stdout, stderr) => {
          if (err) {
            // Attach the original error code so callers can detect ENOENT
            const wrapped = new Error(stderr || err.message) as Error & { code?: string };
            wrapped.code = (err as NodeJS.ErrnoException).code;
            reject(wrapped);
          } else {
            resolve();
          }
        },
      );
    });
    return await fs.promises.readFile(tmpOut, 'utf8');
  } catch (err: any) {
    // d2 binary not found — caller will fall back to original code block.
    // With shell:true on Windows, cmd.exe exits with code 1 and prints
    // "is not recognized..." instead of an ENOENT from the OS.
    const msg: string = err?.message ?? String(err);
    const isNotFound =
      err?.code === 'ENOENT' ||
      /not recognized as an internal or external command/i.test(msg) ||
      /not found/i.test(msg) ||
      /cannot find/i.test(msg) ||
      /No such file or directory/i.test(msg);
    if (isNotFound) return D2_NOT_FOUND;
    const escaped = msg.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre class="language-text"><code>D2 error: ${escaped}</code></pre>`;
  } finally {
    try {
      const fs2 = await import('fs');
      fs2.promises.unlink(tmpIn).catch(() => undefined);
      fs2.promises.unlink(tmpOut).catch(() => undefined);
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Decode HTML entities in a code element's text content.
 */
function htmlDecodeCode(encoded: string): string {
  return encoded
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<\/?code[^>]*>/g, '') // strip <code> wrapper added by cheerio
    .trim();
}

/**
 * Parse per-block D2 attributes from the fence info string after "d2".
 * Accepted syntax (space-separated):  layout=elk  theme=200  sketch  no-sketch
 */
function parseD2BlockAttrs(
  attrs: string,
  defaults: D2RenderOptions,
): D2RenderOptions {
  let d2Layout = defaults.d2Layout;
  let d2Theme = defaults.d2Theme;
  let d2Sketch = defaults.d2Sketch;
  for (const part of attrs.split(/\s+/)) {
    if (part.startsWith('layout=')) {
      d2Layout = part.slice('layout='.length) || d2Layout;
    } else if (part.startsWith('theme=')) {
      const n = parseInt(part.slice('theme='.length), 10);
      if (!Number.isNaN(n)) d2Theme = n;
    } else if (part === 'sketch') {
      d2Sketch = true;
    } else if (part === 'no-sketch') {
      d2Sketch = false;
    }
  }
  return { d2Path: defaults.d2Path, d2Layout, d2Theme, d2Sketch };
}

/**
 * Find all <pre data-role="codeBlock" data-info="d2...">…</pre> blocks in
 * the rendered HTML, render each with the d2 CLI, replace with SVG div.
 *
 * crossnote's markdown-it renderer emits code fences as:
 *   <pre data-role="codeBlock" data-info="d2 {attrs}" ...>HTML-encoded code</pre>
 * (no nested <code> element).
 *
 * Per-block overrides are parsed from the data-info attribute which contains
 * the raw fence info string, e.g. "d2 layout=elk theme=200 sketch".
 */
async function renderD2InHtml(
  html: string,
  opts: D2RenderOptions,
  cache: Map<string, string>,
): Promise<string> {
  // Match <pre ... data-info="d2" ...> or data-info="d2 ..."
  const re =
    /<pre\b([^>]*\bdata-info="(d2(?:\s[^"]*)?)"[^>]*)>([\s\S]*?)<\/pre>/g;

  const matches: Array<{
    match: string;
    dataInfo: string;
    rawCode: string;
    index: number;
  }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    matches.push({
      match: m[0],
      dataInfo: m[2],
      rawCode: htmlDecodeCode(m[3]),
      index: m.index,
    });
  }

  if (matches.length === 0) return html;

  // Render all diagrams in parallel.
  const rendered = await Promise.all(
    matches.map(async ({ dataInfo, rawCode }) => {
      // Parse per-block overrides from the fence info string after "d2".
      const attrs = dataInfo.slice(2).trim(); // remove leading "d2"
      const renderOpts = parseD2BlockAttrs(attrs, opts);
      const cacheKey = `${renderOpts.d2Layout}:${renderOpts.d2Theme}:${renderOpts.d2Sketch}:${rawCode}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey)!;
      const svg = await renderD2ToSvg(rawCode, renderOpts);
      if (svg !== D2_NOT_FOUND) cache.set(cacheKey, svg);
      return svg;
    }),
  );

  // Replace from back to front to preserve earlier indices.
  let result = html;
  for (let i = matches.length - 1; i >= 0; i--) {
    const { match, index } = matches[i];
    // D2_NOT_FOUND means d2 is not installed — leave the original block
    if (rendered[i] === D2_NOT_FOUND) continue;
    const svg = rendered[i] as string;
    result =
      result.slice(0, index) +
      `<div class="d2-diagram">${svg}</div>` +
      result.slice(index + match.length);
  }
  return result;
}

/**
 * Wrap an existing ParserConfig to add D2 rendering.
 * All work is done in onDidParseMarkdown so we operate on the final HTML
 * (crossnote's transformMarkdown strips HTML comments, making any
 * onWillParseMarkdown placeholder approach impossible).
 */
function createD2ParserConfig(
  existing: ParserConfig,
  opts: D2RenderOptions,
  cache: Map<string, string>,
): ParserConfig {
  return {
    onWillParseMarkdown: existing.onWillParseMarkdown,
    onDidParseMarkdown: async (html: string) => {
      const base = await existing.onDidParseMarkdown(html);
      return renderD2InHtml(base, opts, cache);
    },
  };
}
