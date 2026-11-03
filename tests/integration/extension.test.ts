import assert from "node:assert/strict";
import * as path from "node:path";
import * as vscode from "vscode";

const FIXTURE = path.resolve(__dirname, "../../../tests/fixtures/franklin.oval");

async function until(condition: () => boolean, milliseconds = 5000): Promise<void> {
    const deadline = Date.now() + milliseconds;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error("condition not met in time");
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}

async function open(content: string): Promise<vscode.TextDocument> {
    const document = await vscode.workspace.openTextDocument({ language: "oval", content });
    await vscode.window.showTextDocument(document);
    return document;
}

describe("the Oval extension", () => {
    it("reports no diagnostics for the Franklin fixture", async () => {
        const document = await vscode.workspace.openTextDocument(FIXTURE);
        await vscode.window.showTextDocument(document);
        await new Promise((resolve) => setTimeout(resolve, 500));
        assert.deepEqual(vscode.languages.getDiagnostics(document.uri), []);
    });

    it("maps diagnostics to editor positions through UTF-16", async () => {
        const document = await open(
            'oval 0.1\nguide "G\u00fcide"\nelection "E"\ndate 2026-02-30\n',
        );
        await until(() => vscode.languages.getDiagnostics(document.uri).length > 0);
        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        const date = diagnostics.find(
            (d) =>
                typeof d.code === "object" &&
                d.code !== null &&
                "value" in d.code &&
                d.code.value === "V13",
        );
        assert.ok(date, JSON.stringify(diagnostics));
        assert.equal(date.severity, vscode.DiagnosticSeverity.Error);
        assert.equal(date.source, "oval");
        assert.deepEqual(
            [
                date.range.start.line,
                date.range.start.character,
                date.range.end.line,
                date.range.end.character,
            ],
            [3, 0, 4, 0],
        );
    });

    it("re-lints after edits and clears fixed diagnostics", async () => {
        const document = await open('oval 0.1\nguide "G"\n');
        await until(() => vscode.languages.getDiagnostics(document.uri).length > 0);
        const editor = vscode.window.activeTextEditor;
        assert.ok(editor);
        await editor.edit((builder) => {
            builder.insert(
                new vscode.Position(2, 0),
                'election "E"\ndate 2026-11-03\nballot @b "B"\n  measure @m "M"\n    recommend yes\n',
            );
        });
        await until(() => vscode.languages.getDiagnostics(document.uri).length === 0);
    });

    it("provides formatting edits", async () => {
        const document = await open('oval    0.1\n\n\n\nguide   "G"');
        const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
            "vscode.executeFormatDocumentProvider",
            document.uri,
            { tabSize: 2, insertSpaces: true },
        );
        const edit = new vscode.WorkspaceEdit();
        edit.set(document.uri, edits);
        assert.ok(await vscode.workspace.applyEdit(edit));
        assert.equal(document.getText(), 'oval 0.1\n\nguide "G"\n');
    });

    it("offers no edits for a document with syntax errors", async () => {
        const document = await open("oval 0.1\nguide   yes\n");
        const edits = await vscode.commands.executeCommand<vscode.TextEdit[] | undefined>(
            "vscode.executeFormatDocumentProvider",
            document.uri,
            { tabSize: 2, insertSpaces: true },
        );
        assert.deepEqual(edits ?? [], []);
    });
});
