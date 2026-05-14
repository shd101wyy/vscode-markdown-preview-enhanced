import {
  Notebook,
  NotebookConfig,
  PreviewMode,
  PreviewTheme,
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
  private currentMPEConfig: MarkdownPreviewEnhancedConfig =
    MarkdownPreviewEnhancedConfig.getCurrentConfig();

  private failedNotebookPaths: Set<string> = new Set();

  constructor(private context: vscode.ExtensionContext) {
    this.fileWatcher = new FileWatcher(this.context, this);
  }

  public async getNotebook(uri: vscode.Uri): Promise<Notebook> {
    const workspaceFolderUri = getWorkspaceFolderUri(uri);

    // Check if workspaceUri already exists in this.notebooks
    for (let i = 0; i < this.notebooks.length; i++) {
      if (
        this.notebooks[i].notebookPath.toString() ===
        workspaceFolderUri.toString()
      ) {
        return this.notebooks[i];
      }
    }
    // If not, create a new Notebook instance and push it to this.notebooks
    const notebookPathStr = workspaceFolderUri.toString();
    if (this.failedNotebookPaths.has(notebookPathStr)) {
      throw new Error(
        `Notebook initialization previously failed for: ${notebookPathStr}`,
      );
    }

    let notebook: Notebook;
    try {
      notebook = await Notebook.init({
        notebookPath: notebookPathStr,
        fs: wrapVSCodeFSAsApi(
          workspaceFolderUri.scheme,
          workspaceFolderUri.authority,
        ),
        config: {},
      });
    } catch (error) {
      this.failedNotebookPaths.add(notebookPathStr);
      throw error;
    }
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
        // Global config always lives on the same machine where the extension
        // host runs, regardless of whether the workspace is on a remote host
        // (WSL/SSH). Using notebook.fs here would inherit the workspace's
        // authority and misroute the URI (e.g. file://wsl.localhost/C:/...),
        // which silently drops the user's ~/.crossnote customizations.
        const localFs = wrapVSCodeFSAsApi('file', '');
        globalConfig = await loadConfigsInDirectory(
          globalConfigPath,
          localFs,
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

  public async refreshNoteRelations(_noteFilePath: string) {}

  public async getNoteBacklinks(
    noteUri: vscode.Uri,
    forceRefreshingNotes: boolean = false,
  ) {
    const notebook = await this.getNotebook(noteUri);

    if (forceRefreshingNotes) {
      // User clicked "refresh backlinks": walk the workspace and
      // re-tokenize only files whose on-disk mtime has advanced past
      // the recorded value (or that we've never seen).  Same end
      // state as `refreshNotes` on a cold cache, dramatically cheaper
      // on a warm one because the file watcher has been keeping the
      // indices in sync.
      await notebook.refreshNotesIncremental({
        dir: '.',
        includeSubdirectories: true,
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

  /**
   * Resolve the notebook for a context URI (active editor / preview),
   * make sure its notes are loaded, and return notes that mention the
   * given `#tag`.  Backed by crossnote's TagReferenceMap so the
   * lookup is O(notes-using-tag), not a full workspace scan.
   */
  public async getNotesReferringToTag(contextUri: vscode.Uri, tag: string) {
    const notebook = await this.getNotebook(contextUri);
    await notebook.refreshNotesIfNotLoaded({
      dir: '.',
      includeSubdirectories: true,
    });
    this.fileWatcher.startFileWatcher();
    return notebook.getNotesReferringToTag(tag);
  }

  /**
   * Every `#tag` mentioned anywhere in the notebook (case-folded).
   * Used by the editor-side autocomplete so users can pick an
   * existing tag instead of re-typing it.
   */
  public async getAllTags(contextUri: vscode.Uri): Promise<string[]> {
    const notebook = await this.getNotebook(contextUri);
    await notebook.refreshNotesIfNotLoaded({
      dir: '.',
      includeSubdirectories: true,
    });
    this.fileWatcher.startFileWatcher();
    return notebook.getAllTags();
  }

  /**
   * Every Markdown file in the notebook, returned as `{ uri, relativePath }`.
   * Sourced from the notebook's already-loaded `notes` map (which the
   * file watcher keeps current), so we avoid the per-keystroke
   * `vscode.workspace.findFiles('**\/*.md', …)` workspace scan that
   * note-name autocomplete used to do.
   *
   * Cold call: pays for `refreshNotesIfNotLoaded` (workspace scan +
   * full markdown-it parse for each note) on first hit, but only
   * once.  Warm calls are O(notes) iteration over an in-memory map.
   */
  public async getMarkdownFiles(
    contextUri: vscode.Uri,
  ): Promise<Array<{ uri: vscode.Uri; relativePath: string }>> {
    const notebook = await this.getNotebook(contextUri);
    await notebook.refreshNotesIfNotLoaded({
      dir: '.',
      includeSubdirectories: true,
    });
    this.fileWatcher.startFileWatcher();
    const root = vscode.Uri.parse(notebook.notebookPath.toString());
    return Object.keys(notebook.notes).map((relativePath) => ({
      uri: vscode.Uri.joinPath(root, relativePath),
      relativePath,
    }));
  }
}

export default NotebooksManager;
