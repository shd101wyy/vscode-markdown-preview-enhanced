import { FileSystemApi, FileSystemStats } from 'crossnote';
import * as vscode from 'vscode';

function getUri(path: string, scheme: string): vscode.Uri {
  const uri = vscode.Uri.file(path);
  return vscode.Uri.from({
    ...uri,
    scheme,
  });
}

export function wrapVSCodeFSAsApi(scheme: string): FileSystemApi {
  return {
    exists: async (path: string): Promise<boolean> => {
      const uri = getUri(path, scheme);
      // Check if the uri exists
      try {
        await vscode.workspace.fs.stat(uri);
        return true;
      } catch (error) {
        return false;
      }
    },
    readFile: async (
      path: string,
      encoding?: BufferEncoding,
    ): Promise<string> => {
      path = path.replace(/^\//, '');
      const uri = getUri(path, scheme);
      const data = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(data).toString(encoding);
    },
    writeFile: async (
      path: string,
      data: string,
      encoding?: BufferEncoding,
    ): Promise<void> => {
      const uri = getUri(path, scheme);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(data, encoding));
    },
    mkdir: async (path: string): Promise<void> => {
      await vscode.workspace.fs.createDirectory(getUri(path, scheme));
    },
    readdir: async (path: string): Promise<string[]> => {
      const uri = getUri(path, scheme);
      const files = await vscode.workspace.fs.readDirectory(uri);
      return files.map((file) => file[0]);
    },
    stat: async (path: string): Promise<FileSystemStats> => {
      const uri = getUri(path, scheme);
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
      await vscode.workspace.fs.delete(getUri(path, scheme), {
        recursive: true,
      });
    },
  };
}
