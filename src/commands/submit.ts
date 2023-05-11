// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { leetCodeTreeDataProvider } from "../explorer/LeetCodeTreeDataProvider";
import { leetCodeExecutor } from "../leetCodeExecutor";
import { leetCodeManager } from "../leetCodeManager";
import { DialogType, promptForOpenOutputChannel, promptForSignIn } from "../utils/uiUtils";
import { copyCodeBlock, insertSubmitResult } from "../utils/workspaceUtils";
import { leetCodeSubmissionProvider } from "../webview/leetCodeSubmissionProvider";

export async function submitSolution(uri?: vscode.Uri): Promise<void> {
    if (!leetCodeManager.getUser()) {
        promptForSignIn();
        return;
    }

    uri;

    const editor = vscode.window.activeTextEditor;
    if (editor) {
        editor.document.save();
    }

    // const filePath: string | undefined = await getActiveFilePath(uri);
    const filePath: string | undefined = await copyCodeBlock();
    if (!filePath) {
        return;
    }

    try {
        const message: string = await leetCodeExecutor.submitSolution(filePath);
        // console.log("submit result", message);

        // 如果 message 不包含 "Accepted"，则说明提交失败
        if (!message.includes("Accepted")) {
            leetCodeSubmissionProvider.show(message);
            return;
        }

        // 获取今天日期字符串，例如 "2021-11-16"
        const today = new Date().toISOString().slice(0, 10);

        // 匹配通过测试用例数、运行时间和内存使用情况的正则表达式
        const regex_cases_passed = /(\d+)\/(\d+) cases passed/;
        const regex_runtime_percentage = /Your runtime beats (\d+\.\d+) %/;
        const regex_memory_percentage = /Your memory usage beats (\d+\.\d+) %/;
        const regex_runtime_ms = /(\d+) ms/;
        const regex_memory_usage = /\((\d+\.\d+) MB\)/;

        // 提取通过测试用例数、运行时间和内存使用情况
        const [cases_passed, total_cases] = regex_cases_passed.exec(message)?.slice(1) ?? [];
        const runtime_percentage = regex_runtime_percentage.exec(message)?.[1] ?? [];
        const memory_percentage = regex_memory_percentage.exec(message)?.[1] ?? [];
        const runtime_ms = regex_runtime_ms.exec(message)?.[1] ?? [];
        const memory_usage = regex_memory_usage.exec(message)?.[1] ?? [];

        // 格式化输出结果
        const result = `// ${today} submission
// ${cases_passed}/${total_cases} cases passed
// Runtime: ${runtime_ms} ms, faster than ${runtime_percentage}% of cpp online submissions.
// Memory Usage: ${memory_usage} MB, less than ${memory_percentage}% of cpp online submissions.`;

        // console.log(result);
        await insertSubmitResult(result);

    } catch (error) {
        await promptForOpenOutputChannel("Failed to submit the solution. Please open the output channel for details.", DialogType.error);
        return;
    }

    leetCodeTreeDataProvider.refresh();
}
