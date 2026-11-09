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
            'oval 1\nguide "G\u00fcide"\nelection "E"\ndate 2026-02-30\nballot @b "B"\n  measure @m "M"\n    recommend yes\n',
        );
        await until(() => vscode.languages.getDiagnostics(document.uri).length > 0);
        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        const date = diagnostics.find(
            (d) =>
                typeof d.code === "object" &&
                d.code !== null &&
                "value" in d.code &&
                d.code.value === "invalid-date",
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
            [3, 5, 3, 15],
        );
        assert.equal(
            typeof date.code === "object" && date.code !== null && "target" in date.code
                ? date.code.target.toString()
                : undefined,
            "https://spec.oval.vote/draft/#sec-Invalid-Date",
        );
    });

    it("re-lints after edits and clears fixed diagnostics", async () => {
        const document = await open('oval 1\nguide "G"\n');
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
        const document = await open('oval    01\n\n\n\nguide   "G"');
        const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
            "vscode.executeFormatDocumentProvider",
            document.uri,
            { tabSize: 2, insertSpaces: true },
        );
        const edit = new vscode.WorkspaceEdit();
        edit.set(document.uri, edits);
        assert.ok(await vscode.workspace.applyEdit(edit));
        assert.equal(document.getText(), 'oval 1\n\nguide "G"\n');
    });

    const GUIDE =
        'oval 1\nguide "G"\nelection "E"\ndate 2026-11-03\n' +
        'party @dem "Democratic"\n' +
        'candidate @delgado "Rosa Delgado"\n  party @dem\n' +
        'ballot @city "City"\n  section "Offices"\n    contest @attorney "City Attorney" single\n' +
        '      campaign @delgado\n      campaign @webb "Marcus Webb"\n        party @dem\n' +
        "      recommend\n        support @delgado\n        oppose @webb\n" +
        '  measure @a "Proposition A"\n    recommend yes\n';

    function positionOf(
        document: vscode.TextDocument,
        needle: string,
        occurrence = 0,
    ): vscode.Position {
        let from = 0;
        for (let i = 0; i < occurrence; i++) {
            from = document.getText().indexOf(needle, from) + needle.length;
        }
        return document.positionAt(document.getText().indexOf(needle, from) + 1);
    }

    it("outlines ballots, sections, contests, and measures", async () => {
        const document = await open(GUIDE);
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            "vscode.executeDocumentSymbolProvider",
            document.uri,
        );
        assert.equal(symbols.length, 1);
        const city = symbols[0];
        assert.equal(city.name, "City");
        assert.equal(city.detail, "ballot @city");
        assert.equal(city.kind, vscode.SymbolKind.Module);
        assert.equal(city.selectionRange.start.line, 7);
        assert.deepEqual(
            city.children.map((child) => [child.name, child.detail]),
            [
                ["Offices", "section"],
                ["Proposition A", "measure @a"],
            ],
        );
        assert.deepEqual(
            city.children[0].children.map((child) => child.name),
            ["City Attorney"],
        );
        assert.ok(city.range.contains(city.children[1].range));
    });

    it("goes from a reference to its declaration", async () => {
        const document = await open(GUIDE);
        const locations = await vscode.commands.executeCommand<vscode.Location[]>(
            "vscode.executeDefinitionProvider",
            document.uri,
            positionOf(document, "@delgado", 2),
        );
        assert.equal(locations.length, 1);
        assert.equal(document.getText(locations[0].range), "@delgado");
        assert.equal(locations[0].range.start.line, 5);
    });

    it("finds every occurrence of an identifier", async () => {
        const document = await open(GUIDE);
        const locations = await vscode.commands.executeCommand<vscode.Location[]>(
            "vscode.executeReferenceProvider",
            document.uri,
            positionOf(document, "@dem", 0),
        );
        assert.deepEqual(
            locations.map((location) => location.range.start.line),
            [4, 6, 12],
        );
    });

    it("renames an identifier everywhere", async () => {
        const document = await open(GUIDE);
        const prepared = await vscode.commands.executeCommand<{
            range: vscode.Range;
            placeholder: string;
        }>("vscode.prepareRename", document.uri, positionOf(document, "@delgado", 1));
        assert.equal(prepared.placeholder, "delgado");
        assert.equal(document.getText(prepared.range), "delgado");
        const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
            "vscode.executeDocumentRenameProvider",
            document.uri,
            positionOf(document, "@delgado", 1),
            "rosa-delgado",
        );
        assert.ok(await vscode.workspace.applyEdit(edit));
        const text = document.getText();
        assert.equal((text.match(/@rosa-delgado/g) ?? []).length, 3);
        assert.ok(!text.includes("@delgado"));
    });

    it("completes keywords and identifiers", async () => {
        const document = await open(GUIDE);
        const atKind = positionOf(document, "single", 0).translate(0, -1);
        const kinds = await vscode.commands.executeCommand<vscode.CompletionList>(
            "vscode.executeCompletionItemProvider",
            document.uri,
            atKind,
        );
        const labels = kinds.items.map((item) => item.label);
        for (const kind of ["single", "multiple", "ranked", "retention"]) {
            assert.ok(labels.includes(kind), labels.join(","));
        }
        const atSupport = positionOf(document, "support @delgado", 0).translate(0, 7);
        const identifiers = await vscode.commands.executeCommand<vscode.CompletionList>(
            "vscode.executeCompletionItemProvider",
            document.uri,
            atSupport,
        );
        const delgado = identifiers.items.find((item) => item.label === "@delgado");
        assert.ok(delgado, identifiers.items.map((item) => item.label).join(","));
        assert.equal(delgado.detail, "Rosa Delgado");
        assert.equal(delgado.kind, vscode.CompletionItemKind.User);
        assert.ok(identifiers.items.some((item) => item.label === "@webb"));
    });

    it("shows hover text for identifiers and keywords", async () => {
        const document = await open(GUIDE);
        const [identifier] = await vscode.commands.executeCommand<vscode.Hover[]>(
            "vscode.executeHoverProvider",
            document.uri,
            positionOf(document, "@delgado", 2),
        );
        const contents = identifier.contents[0];
        assert.ok(contents instanceof vscode.MarkdownString);
        assert.ok(contents.value.startsWith("**candidate** `@delgado`\n\nRosa Delgado"));
        assert.equal(document.getText(identifier.range), "@delgado");
        const [keyword] = await vscode.commands.executeCommand<vscode.Hover[]>(
            "vscode.executeHoverProvider",
            document.uri,
            positionOf(document, "contest @attorney", 0),
        );
        const text = keyword.contents[0];
        assert.ok(text instanceof vscode.MarkdownString);
        assert.ok(text.value.includes("#sec-Contest"));
    });

    it("offers a quick fix for an insecure url and applies it", async () => {
        const document = await open(
            GUIDE.replace(
                "campaign @delgado\n",
                "campaign @delgado\n        website http://delgado.example\n",
            ),
        );
        await until(() => vscode.languages.getDiagnostics(document.uri).length > 0);
        const line = document.getText().indexOf("http://");
        const range = new vscode.Range(document.positionAt(line), document.positionAt(line + 7));
        const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
            "vscode.executeCodeActionProvider",
            document.uri,
            range,
        );
        const fix = actions.find((action) => action.title === "Use https");
        assert.ok(fix, actions.map((action) => action.title).join(","));
        assert.equal(fix.kind?.value, vscode.CodeActionKind.QuickFix.value);
        assert.ok(fix.edit);
        assert.ok(await vscode.workspace.applyEdit(fix.edit));
        assert.ok(document.getText().includes("website https://delgado.example"));
        await until(() => vscode.languages.getDiagnostics(document.uri).length === 0);
    });

    it("adds a missing guide field with its value as a placeholder to type over", async () => {
        const document = await open(GUIDE.replace('election "E"\n', ""));
        await until(() => vscode.languages.getDiagnostics(document.uri).length > 0);
        const end = document.lineAt(0).range.end;
        const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
            "vscode.executeCodeActionProvider",
            document.uri,
            new vscode.Range(end, end),
        );
        const fix = actions.find((action) => action.title === "Add `election`");
        assert.ok(fix?.edit, actions.map((action) => action.title).join(","));
        assert.ok(await vscode.workspace.applyEdit(fix.edit));
        assert.ok(document.getText().startsWith('oval 1\nelection ""\nguide "G"'));
        const selection = vscode.window.activeTextEditor?.selection;
        assert.deepEqual(
            [selection?.active.line, selection?.active.character],
            [1, 'election "'.length],
        );
        await until(() =>
            vscode.languages
                .getDiagnostics(document.uri)
                .some(
                    (diagnostic) => (diagnostic.code as { value: string }).value === "empty-string",
                ),
        );
    });

    it("refuses a rename to an invalid or taken name", async () => {
        const document = await open(GUIDE);
        for (const name of ["9lives", "webb"]) {
            await assert.rejects(
                Promise.resolve(
                    vscode.commands.executeCommand(
                        "vscode.executeDocumentRenameProvider",
                        document.uri,
                        positionOf(document, "@delgado", 1),
                        name,
                    ),
                ),
            );
        }
    });

    it("offers no edits for a document with syntax errors", async () => {
        const document = await open("oval 1\nguide   yes\n");
        const edits = await vscode.commands.executeCommand<vscode.TextEdit[] | undefined>(
            "vscode.executeFormatDocumentProvider",
            document.uri,
            { tabSize: 2, insertSpaces: true },
        );
        assert.deepEqual(edits ?? [], []);
    });
});
