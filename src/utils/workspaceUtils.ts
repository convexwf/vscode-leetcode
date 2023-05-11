// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { IQuickItemEx } from "../shared";
import { getWorkspaceConfiguration, getWorkspaceFolder } from "./settingUtils";
import { showDirectorySelectDialog } from "./uiUtils";
import * as wsl from "./wslUtils";

export async function selectWorkspaceFolder(): Promise<string> {
    let workspaceFolderSetting: string = getWorkspaceFolder();
    if (workspaceFolderSetting.trim() === "") {
        workspaceFolderSetting = await determineLeetCodeFolder();
        if (workspaceFolderSetting === "") {
            // User cancelled
            return workspaceFolderSetting;
        }
    }
    let needAsk: boolean = true;
    await fse.ensureDir(workspaceFolderSetting);
    for (const folder of vscode.workspace.workspaceFolders || []) {
        if (isSubFolder(folder.uri.fsPath, workspaceFolderSetting)) {
            needAsk = false;
        }
    }

    if (needAsk) {
        const choice: string | undefined = await vscode.window.showQuickPick(
            [
                OpenOption.justOpenFile,
                OpenOption.openInCurrentWindow,
                OpenOption.openInNewWindow,
                OpenOption.addToWorkspace,
            ],
            { placeHolder: "The LeetCode workspace folder is not opened in VS Code, would you like to open it?" },
        );

        // Todo: generate file first
        switch (choice) {
            case OpenOption.justOpenFile:
                return workspaceFolderSetting;
            case OpenOption.openInCurrentWindow:
                await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(workspaceFolderSetting), false);
                return "";
            case OpenOption.openInNewWindow:
                await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(workspaceFolderSetting), true);
                return "";
            case OpenOption.addToWorkspace:
                vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length ?? 0, 0, { uri: vscode.Uri.file(workspaceFolderSetting) });
                break;
            default:
                return "";
        }
    }

    return wsl.useWsl() ? wsl.toWslPath(workspaceFolderSetting) : workspaceFolderSetting;
}

export async function insertSubmitResult(result?: string): Promise<string | undefined> {
    if (!result) {
        return;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("Please open a solution file first.");
        return;
    }
    editor.document.save();

    // 获取当前光标所在行
    const currentLine = editor.selection.active.line;
    // 向前遍历找到第一次出现 "// @lc code=start" 的行
    let startLine = currentLine;
    while (startLine >= 0) {
        const lineText = editor.document.lineAt(startLine).text;
        if (lineText.includes('// @lc code=start')) {
            break;
        }
        startLine--;
    }
    if (startLine < 0) {
        vscode.window.showErrorMessage("Please add '// @lc code=start' in your solution file.");
        return;
    }

    // 将 result 插入到 startLine 之后
    const resultLines: string[] = result.split(os.EOL);
    const insertPosition: vscode.Position = new vscode.Position(startLine + 1, 0);
    await editor.edit((editBuilder) => {
        resultLines.forEach((line) => {
            editBuilder.insert(insertPosition, `${line}${os.EOL}`);
        });
    });
    return;
}

export async function copyCodeBlock(): Promise<string | undefined> {
    // 获取当前激活的文本编辑器
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('当前没有打开的文本编辑器');
        return;
    }
    // 获取当前光标所在行
    const currentLine = editor.selection.active.line;

    // 向前遍历找到第一次出现 "// @lc code=start" 的行
    let startLine = currentLine;
    while (startLine >= 0) {
        const lineText = editor.document.lineAt(startLine).text;
        if (lineText.includes('// @lc code=start')) {
            break;
        }
        startLine--;
    }

    // 向后遍历找到第一次出现 "// @lc code=end" 的行
    let endLine = currentLine;
    while (endLine < editor.document.lineCount) {
        const lineText = editor.document.lineAt(endLine).text;
        if (lineText.includes('// @lc code=end')) {
            break;
        }
        endLine++;
    }

    const leetCodeConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("leetcode");
    const filePath: string = leetCodeConfig.get<string>(`filePath.default.codefile`, "").trim();
    if (filePath === "") {
        vscode.window.showErrorMessage("Please specify the default code file path in the settings.");
        return;
    }

    // 如果找到了符合条件的区域，将其复制到文件中
    if (startLine < endLine) {
        const fileContent = `// ${editor.document.lineAt(1).text}\n` + // 添加当前文件正数第二行前面加上 "// "
            editor.document.getText(new vscode.Range(
                new vscode.Position(startLine, 0),
                new vscode.Position(endLine + 1, 0)
            ));
        fse.writeFileSync(filePath, fileContent);

        // vscode.window.showInformationMessage(`成功将代码复制到文件 ${filePath}`);
    } else {
        vscode.window.showWarningMessage('未找到符合条件的代码区域');
    }
    return filePath;
}

export async function getActiveFilePath(uri?: vscode.Uri): Promise<string | undefined> {
    let textEditor: vscode.TextEditor | undefined;
    if (uri) {
        textEditor = await vscode.window.showTextDocument(uri, { preview: false });
    } else {
        textEditor = vscode.window.activeTextEditor;
    }

    if (!textEditor) {
        return undefined;
    }
    if (textEditor.document.isDirty && !await textEditor.document.save()) {
        vscode.window.showWarningMessage("Please save the solution file first.");
        return undefined;
    }
    return wsl.useWsl() ? wsl.toWslPath(textEditor.document.uri.fsPath) : textEditor.document.uri.fsPath;
}

function isSubFolder(from: string, to: string): boolean {
    const relative: string = path.relative(from, to);
    if (relative === "") {
        return true;
    }
    return !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function determineLeetCodeFolder(): Promise<string> {
    let result: string;
    const picks: Array<IQuickItemEx<string>> = [];
    picks.push(
        {
            label: `Default location`,
            detail: `${path.join(os.homedir(), ".leetcode")}`,
            value: `${path.join(os.homedir(), ".leetcode")}`,
        },
        {
            label: "$(file-directory) Browse...",
            value: ":browse",
        },
    );
    const choice: IQuickItemEx<string> | undefined = await vscode.window.showQuickPick(
        picks,
        { placeHolder: "Select where you would like to save your LeetCode files" },
    );
    if (!choice) {
        result = "";
    } else if (choice.value === ":browse") {
        const directory: vscode.Uri[] | undefined = await showDirectorySelectDialog();
        if (!directory || directory.length < 1) {
            result = "";
        } else {
            result = directory[0].fsPath;
        }
    } else {
        result = choice.value;
    }

    getWorkspaceConfiguration().update("workspaceFolder", result, vscode.ConfigurationTarget.Global);

    return result;
}

enum OpenOption {
    justOpenFile = "Just open the problem file",
    openInCurrentWindow = "Open in current window",
    openInNewWindow = "Open in new window",
    addToWorkspace = "Add to workspace",
}
