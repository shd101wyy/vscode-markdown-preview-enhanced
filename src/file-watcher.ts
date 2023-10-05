import * as vscode from 'vscode';
import { getMPEConfig } from './config';
import NotebooksManager from './notebooks-manager';
import { getAllPreviewProviders } from './preview-provider';

export default class FileWatcher {
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  constructor(
    private context: vscode.ExtensionContext,
    private notebooksManager: NotebooksManager,
  ) {}

  public startFileWatcher() {
    if (this.fileWatcher) {
      return;
    }

    const markdownFileExtensions =
      getMPEConfig<string[]>('markdownFileExtensions') ?? [];
    const glob: string = `**/*.{${markdownFileExtensions
      .map((ext) => ext.replace(/^\./, ''))
      .join(',')}}`;

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(glob);

    this.fileWatcher.onDidChange(async (uri) => {
      const notebook = await this.notebooksManager.getNotebook(uri);
      await notebook.getNote(uri.fsPath, true); // Refresh note relation

      const previewProviders = getAllPreviewProviders();
      previewProviders.forEach((provider) => {
        provider.postMessageToPreview(uri, {
          command: 'updatedNote',
          sourceUri: uri.toString(),
        });
      });
    });

    this.fileWatcher.onDidCreate(async (uri) => {
      const notebook = await this.notebooksManager.getNotebook(uri);
      await notebook.getNote(uri.fsPath, true); // Refresh note relation

      const previewProviders = getAllPreviewProviders();
      previewProviders.forEach((provider) => {
        provider.postMessageToPreview(uri, {
          command: 'createdNote',
          sourceUri: uri.toString(),
        });
      });
    });

    this.fileWatcher.onDidDelete(async (uri) => {
      const notebook = await this.notebooksManager.getNotebook(uri);
      await notebook.deleteNote(uri.fsPath, true); // Refresh note relation

      const previewProviders = getAllPreviewProviders();
      previewProviders.forEach((provider) => {
        provider.postMessageToPreview(uri, {
          command: 'deletedNote',
          sourceUri: uri.toString(),
        });
      });
    });

    this.context.subscriptions.push(this.fileWatcher);
  }
}
