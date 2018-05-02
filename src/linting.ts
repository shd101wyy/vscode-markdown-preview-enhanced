// @ts-ignore
import { VFile, VFileBase } from "vfile";
import * as sort from "vfile-sort";
import * as vscode from "vscode";

const diagnosticCollection = vscode.languages.createDiagnosticCollection();

export const updateLintingReport = (vFiles: Array<VFile<{}>> = []) => {
  diagnosticCollection.clear();

  vFiles.forEach((vFile) => {
    const diagnostics: vscode.Diagnostic[] = [];
    sort(vFile);
    vFile.messages.forEach((message) => {
      const severity = {
        true: vscode.DiagnosticSeverity.Error,
        false: vscode.DiagnosticSeverity.Warning,
        null: vscode.DiagnosticSeverity.Information,
        undefined: vscode.DiagnosticSeverity.Information,
      }[message.fatal as any];

      const range = new vscode.Range(
        Math.max(message.location.start.line - 1, 0),
        Math.max(message.location.start.column - 1, 0),
        Math.max(message.location.end.line - 1, 0),
        Math.max(message.location.end.column - 1, 0),
      );

      const labels = [message.source, message.ruleId].filter(Boolean);
      if (labels[0] && labels[0] === labels[1]) {
        labels.pop();
      }
      let excerpt = message.reason.replace(/“([^”]+)”/g, "`$1`");
      if (labels.length) {
        excerpt += ` (${labels.join(":")})`;
      }

      const diagnostic = new vscode.Diagnostic(range, excerpt, severity);
      diagnostic.source = "litvis";
      diagnostics.push(diagnostic);
    });
    diagnosticCollection.set(vscode.Uri.file(vFile.path), diagnostics);
  });
};
