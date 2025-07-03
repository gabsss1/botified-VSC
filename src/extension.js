import * as vscode from "vscode";
import * as path from "path";
import { readFileSync } from "fs";
let webviewPanel;

export function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("code-assistant.openChat", async () => {
      if (webviewPanel) {
        webviewPanel.reveal(vscode.ViewColumn.Two);
        return;
      }

      webviewPanel = vscode.window.createWebviewPanel(
        "botifiedChat",
        "BOTIFIED AI",
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, "src", "chat"),
          ],
        }
      );

      webviewPanel.webview.html = getWebviewContent(webviewPanel.webview, context.extensionUri);

      webviewPanel.onDidDispose(() => {
        webviewPanel = undefined;
      });

      sendActiveFileToWebview();

      const activeEditorListener = vscode.window.onDidChangeActiveTextEditor(() => {
        sendActiveFileToWebview();
      });
      context.subscriptions.push(activeEditorListener);

      webviewPanel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.command) {
            case "getActiveFile":
              sendActiveFileToWebview();
              break;

            case "getFileContent":
              try {
                const document = await vscode.workspace.openTextDocument(message.filePath);
                const content = document.getText();
                webviewPanel?.webview.postMessage({
                  command: "fileContent",
                  content,
                });
              } catch (error) {
                console.error("Error reading file:", error);
                webviewPanel?.webview.postMessage({
                  command: "fileContent",
                  content: null,
                });
              }
              break;
          }
        },
        undefined,
        context.subscriptions
      );
    })
  );
}

function sendActiveFileToWebview() {
  if (!webviewPanel) return;
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const file = {
      name: path.basename(editor.document.fileName),
      path: vscode.workspace.asRelativePath(editor.document.fileName),
    };
    webviewPanel.webview.postMessage({
      command: "activeFile",
      file,
    });
  } else {
    webviewPanel.webview.postMessage({
      command: "activeFile",
      file: null,
    });
  }
}

function getWebviewContent(webview, extensionUri) {
  const htmlPath = vscode.Uri.joinPath(extensionUri, "src", "chat", "index.html");
  let html = readFileSync(htmlPath.fsPath, "utf8");

  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "src", "chat", "script.js")
  );

  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "src", "chat", "styles", "index.css")
  );

  html = html
    .replace(/{{STYLE_URI}}/g, styleUri.toString())
    .replace(/{{SCRIPT_URI}}/g, scriptUri.toString());

  return html;
}

export function deactivate() {}