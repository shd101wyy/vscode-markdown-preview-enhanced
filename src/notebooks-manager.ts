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
  private currentMPEConfig: MarkdownPreviewEnhancedConfig = MarkdownPreviewEnhancedConfig.getCurrentConfig();

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
    try {
      workspaceConfig = await loadConfigsInDirectory(
        workspaceConfigPath.fsPath,
        notebook.fs,
        createWorkspaceConfigDirectoryIfNotExists,
      );
    } catch (error) {
      console.error(error);
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
      // delete associations from editorAssociations
      newEditorAssociations = Object.fromEntries(
        Object.entries(editorAssociations).filter(([key]) => {
          return !markdownFileExtensions.find((ext) => {
            return key.endsWith(ext);
          });
        }),
      );
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
