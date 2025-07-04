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
              
            case "createFiles":
              try {
                if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                  vscode.window.showErrorMessage("No hay un workspace abierto.");
                  return;
                }

                const workspaceUri = vscode.workspace.workspaceFolders[0].uri;

                for (const file of message.files) {
                  // Divide la ruta en partes
                  const pathParts = file.filename.split("/");
                  const fileName = pathParts.pop(); // El nombre del archivo
                  const folderParts = pathParts; // Las carpetas intermedias

                  // Construir el URI de la carpeta destino
                  let targetFolderUri = workspaceUri;
                  for (const folder of folderParts) {
                    targetFolderUri = vscode.Uri.joinPath(targetFolderUri, folder);
                  }

                  // Crear carpeta si no existe
                  await vscode.workspace.fs.createDirectory(targetFolderUri);

                  // Crear el archivo dentro de esa carpeta
                  const fileUri = vscode.Uri.joinPath(targetFolderUri, fileName);
                  await vscode.workspace.fs.writeFile(
                    fileUri,
                    Buffer.from(file.content, "utf8")
                  );
                }

                vscode.window.showInformationMessage(
                  `Se crearon ${message.files.length} archivo(s) en ${workspaceUri.fsPath}.`
                );
              } catch (error) {
                console.error("Error creando archivos:", error);
                vscode.window.showErrorMessage("Ocurrió un error al crear los archivos.");
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