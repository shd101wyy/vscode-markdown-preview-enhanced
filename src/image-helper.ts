import { utility } from 'crossnote';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { isMarkdownFile } from './utils';

/**
 * Copy ans paste image at imageFilePath to config.imageForlderPath.
 * Then insert markdown image url to markdown file.
 * @param uri
 * @param imageFilePath
 */
export function pasteImageFile(sourceUri: string, imageFilePath: string) {
  const uri = vscode.Uri.parse(sourceUri);

  const imageFolderPath =
    vscode.workspace
      .getConfiguration('markdown-preview-enhanced')
      .get<string>('imageFolderPath') ?? '';
  let imageFileName = path.basename(imageFilePath);
  const projectDirectoryPath = vscode.workspace.getWorkspaceFolder(uri)?.uri
    .fsPath;
  if (!projectDirectoryPath) {
    return vscode.window.showErrorMessage('Cannot find workspace');
  }

  let assetDirectoryPath;
  let description;
  if (imageFolderPath[0] === '/') {
    assetDirectoryPath = path.resolve(
      projectDirectoryPath,
      '.' + imageFolderPath,
    );
  } else {
    assetDirectoryPath = path.resolve(
      path.dirname(uri.fsPath),
      imageFolderPath,
    );
  }

  const destPath = path.resolve(
    assetDirectoryPath,
    path.basename(imageFilePath),
  );

  vscode.window.visibleTextEditors
    .filter(
      editor =>
        isMarkdownFile(editor.document) &&
        editor.document.uri.fsPath === uri.fsPath,
    )
    .forEach(editor => {
      fs.mkdir(assetDirectoryPath, error => {
        fs.stat(destPath, (err, stat) => {
          if (err == null) {
            // file existed
            const lastDotOffset = imageFileName.lastIndexOf('.');
            const uid =
              '_' +
              Math.random()
                .toString(36)
                .substr(2, 9);

            if (lastDotOffset > 0) {
              description = imageFileName.slice(0, lastDotOffset);
              imageFileName =
                imageFileName.slice(0, lastDotOffset) +
                uid +
                imageFileName.slice(lastDotOffset, imageFileName.length);
            } else {
              description = imageFileName;
              imageFileName = imageFileName + uid;
            }

            fs.createReadStream(imageFilePath).pipe(
              fs.createWriteStream(
                path.resolve(assetDirectoryPath, imageFileName),
              ),
            );
          } else if (err.code === 'ENOENT') {
            // file doesn't exist
            fs.createReadStream(imageFilePath).pipe(
              fs.createWriteStream(destPath),
            );

            if (imageFileName.lastIndexOf('.')) {
              description = imageFileName.slice(
                0,
                imageFileName.lastIndexOf('.'),
              );
            } else {
              description = imageFileName;
            }
          } else {
            return vscode.window.showErrorMessage(err.toString());
          }

          vscode.window.showInformationMessage(
            `Image ${imageFileName} has been copied to folder ${assetDirectoryPath}`,
          );

          let url = `${imageFolderPath}/${imageFileName}`;
          if (url.indexOf(' ') >= 0) {
            url = url.replace(/ /g, '%20');
          }

          editor.edit(textEditorEdit => {
            textEditorEdit.insert(
              editor.selection.active,
              `![${description}](${url})`,
            );
          });
        });
      });
    });
}

function replaceHint(
  editor: vscode.TextEditor,
  line: number,
  hint: string,
  withStr: string,
): boolean {
  const textLine = editor.document.lineAt(line);
  if (textLine.text.indexOf(hint) >= 0) {
    editor.edit(textEdit => {
      textEdit.replace(
        new vscode.Range(
          new vscode.Position(line, 0),
          new vscode.Position(line, textLine.text.length),
        ),
        textLine.text.replace(hint, withStr),
      );
    });
    return true;
  }
  return false;
}

function setUploadedImageURL(
  imageFileName: string,
  url: string,
  editor: vscode.TextEditor,
  hint: string,
  curPos: vscode.Position,
) {
  let description;
  if (imageFileName.lastIndexOf('.')) {
    description = imageFileName.slice(0, imageFileName.lastIndexOf('.'));
  } else {
    description = imageFileName;
  }

  const withStr = `![${description}](${url})`;

  if (!replaceHint(editor, curPos.line, hint, withStr)) {
    let i = curPos.line - 20;
    while (i <= curPos.line + 20) {
      if (replaceHint(editor, i, hint, withStr)) {
        break;
      }
      i++;
    }
  }
}

/**
 * Upload image at imageFilePath to config.imageUploader.
 * Then insert markdown image url to markdown file.
 * @param uri
 * @param imageFilePath
 */
export function uploadImageFile(
  sourceUri: any,
  imageFilePath: string,
  imageUploader: string,
) {
  // console.log('uploadImageFile', sourceUri, imageFilePath, imageUploader)
  if (typeof sourceUri === 'string') {
    sourceUri = vscode.Uri.parse(sourceUri);
  }
  const imageFileName = path.basename(imageFilePath);

  vscode.window.visibleTextEditors
    .filter(
      editor =>
        isMarkdownFile(editor.document) &&
        editor.document.uri.fsPath === sourceUri.fsPath,
    )
    .forEach(editor => {
      const uid = Math.random()
        .toString(36)
        .substr(2, 9);
      const hint = `![Uploading ${imageFileName}… (${uid})]()`;
      const curPos = editor.selection.active;

      editor.edit(textEditorEdit => {
        textEditorEdit.insert(curPos, hint);
      });

      const config = vscode.workspace.getConfiguration(
        'markdown-preview-enhanced',
      );
      const AccessKey = config.get<string>('AccessKey') || '';
      const SecretKey = config.get<string>('SecretKey') || '';
      const Bucket = config.get<string>('Bucket') || '';
      const Domain = config.get<string>('Domain') || '';

      utility
        .uploadImage(imageFilePath, {
          method: imageUploader,
          qiniu: { AccessKey, SecretKey, Bucket, Domain },
        })
        .then(url => {
          setUploadedImageURL(imageFileName, url, editor, hint, curPos);
        })
        .catch(error => {
          vscode.window.showErrorMessage(error.toString());
        });
    });
}
