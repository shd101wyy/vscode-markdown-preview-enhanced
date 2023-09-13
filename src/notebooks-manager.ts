import { Notebook, PreviewTheme, loadConfigsInDirectory } from 'crossnote';
import * as vscode from 'vscode';
import { MarkdownPreviewEnhancedConfig, PreviewColorScheme } from './config';
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
  public config: MarkdownPreviewEnhancedConfig;
  public systemColorScheme: 'light' | 'dark' = 'light';
  private fileWatcher: FileWatcher;

  constructor(private context: vscode.ExtensionContext) {
    this.config = MarkdownPreviewEnhancedConfig.getCurrentConfig();
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
      config: { ...this.config },
    });
    this.notebooks.push(notebook);

    // Check if ${workspaceDir}/.crossnote directory exists
    // If not, then use the global config.
    const crossnoteDir = vscode.Uri.joinPath(
      workspaceFolderUri,
      './.crossnote',
    );
    if (
      !(await notebook.fs.exists(crossnoteDir.fsPath)) &&
      !isVSCodeWebExtension()
    ) {
      try {
        const globalConfig = await loadConfigsInDirectory(
          globalConfigPath,
          notebook.fs,
          true,
        );
        notebook.updateConfig(globalConfig);
      } catch (error) {
        console.error(error);
      }
    }

    return notebook;
  }

  public setSystemColorScheme(colorScheme: 'light' | 'dark') {
    if (this.systemColorScheme !== colorScheme) {
      this.systemColorScheme = colorScheme;
      if (
        this.config.previewColorScheme === PreviewColorScheme.systemColorScheme
      ) {
        this.updateConfiguration(true);
      }
    }
  }

  public updateConfiguration(forceUpdate = false) {
    const newConfig = MarkdownPreviewEnhancedConfig.getCurrentConfig();
    if (forceUpdate || !this.config.isEqualTo(newConfig)) {
      const previewProviders = getAllPreviewProviders();
      // if `singlePreview` setting is changed, close all previews.
      if (this.config.singlePreview !== newConfig.singlePreview) {
        previewProviders.forEach((provider) => {
          provider.closeAllPreviews(this.config.singlePreview);
        });

        this.config = newConfig;
      } else {
        this.config = newConfig;

        const previewTheme = this.getPreviewTheme(
          newConfig.previewTheme,
          newConfig.previewColorScheme,
        );
        this.notebooks.forEach((notebook) => {
          notebook.updateConfig({ ...newConfig, previewTheme });
        });
        // update all generated md documents
        previewProviders.forEach((provider) => {
          provider.refreshAllPreviews();
        });
      }
    }
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
