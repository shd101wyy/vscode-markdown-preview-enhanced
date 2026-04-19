import { FileSystemApi, FileSystemStats } from 'crossnote';
import * as vscode from 'vscode';

function getUri(
  filePath: string,
  scheme: string,
  authority: string,
): vscode.Uri {
  return vscode.Uri.from({ scheme, authority, path: filePath });
}

export function wrapVSCodeFSAsApi(
  scheme: string,
  authority: string = '',
): FileSystemApi {
  return {
    exists: async (path: string): Promise<boolean> => {
      const uri = getUri(path, scheme, authority);
      // Check if the uri exists
      try {
        await vscode.workspace.fs.stat(uri);
        return true;
      } catch {
        return false;
      }
    },
    readFile: async (
      path: string,
      encoding?: BufferEncoding,
    ): Promise<string> => {
      const uri = getUri(path, scheme, authority);
      const data = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(data).toString(encoding);
    },
    writeFile: async (
      path: string,
      data: string,
      encoding?: string,
    ): Promise<void> => {
      const uri = getUri(path, scheme, authority);
      await vscode.workspace.fs.writeFile(
        uri,
        Buffer.from(data, encoding as BufferEncoding),
      );
    },
    mkdir: async (path: string): Promise<void> => {
      await vscode.workspace.fs.createDirectory(
        getUri(path, scheme, authority),
      );
    },
    readdir: async (path: string): Promise<string[]> => {
      const uri = getUri(path, scheme, authority);
      const files = await vscode.workspace.fs.readDirectory(uri);
      return files.map((file) => file[0]);
    },
    stat: async (path: string): Promise<FileSystemStats> => {
      const uri = getUri(path, scheme, authority);
      const stat = await vscode.workspace.fs.stat(uri);
      return {
        isDirectory: () => stat.type === vscode.FileType.Directory,
        isFile: () => stat.type === vscode.FileType.File,
        isSymbolicLink: () => stat.type === vscode.FileType.SymbolicLink,
        size: stat.size,
        mtimeMs: stat.mtime,
        ctimeMs: stat.ctime,
      };
    },
    unlink: async (path: string): Promise<void> => {
      await vscode.workspace.fs.delete(getUri(path, scheme, authority), {
        recursive: true,
      });
    },
  };
}
