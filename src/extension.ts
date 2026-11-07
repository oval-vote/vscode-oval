import * as vscode from "vscode";
import { catalog, check, format, type Diagnostic } from "@oval-vote/oval";
import { byteOffsetToIndex } from "./offsets";

const SPECIFICATION = "https://spec.oval.vote/draft/";
const DEBOUNCE_MILLISECONDS = 150;

export function activate(context: vscode.ExtensionContext): void {
    const collection = vscode.languages.createDiagnosticCollection("oval");
    const pending = new Map<string, NodeJS.Timeout>();
    const links = new Map(catalog().map((entry) => [entry.identifier, entry.url]));

    const lint = (document: vscode.TextDocument) => {
        if (document.languageId !== "oval") {
            return;
        }
        collection.set(document.uri, diagnostics(document, links));
    };

    const schedule = (document: vscode.TextDocument) => {
        if (document.languageId !== "oval") {
            return;
        }
        const key = document.uri.toString();
        clearTimeout(pending.get(key));
        pending.set(
            key,
            setTimeout(() => {
                pending.delete(key);
                lint(document);
            }, DEBOUNCE_MILLISECONDS),
        );
    };

    context.subscriptions.push(
        collection,
        vscode.workspace.onDidOpenTextDocument(lint),
        vscode.workspace.onDidChangeTextDocument((event) => schedule(event.document)),
        vscode.workspace.onDidCloseTextDocument((document) => {
            clearTimeout(pending.get(document.uri.toString()));
            pending.delete(document.uri.toString());
            collection.delete(document.uri);
        }),
        vscode.languages.registerDocumentFormattingEditProvider("oval", {
            provideDocumentFormattingEdits(document) {
                return formattingEdits(document);
            },
        }),
    );
    vscode.workspace.textDocuments.forEach(lint);
}

export function deactivate(): void {}

function diagnostics(
    document: vscode.TextDocument,
    links: Map<string, string>,
): vscode.Diagnostic[] {
    const text = document.getText();
    const index = byteOffsetToIndex(text);
    return check(text).map((found) => convert(document, index, links, found));
}

function convert(
    document: vscode.TextDocument,
    index: (byteOffset: number) => number,
    links: Map<string, string>,
    found: Diagnostic,
): vscode.Diagnostic {
    const range = new vscode.Range(
        document.positionAt(index(found.range.start)),
        document.positionAt(index(found.range.end)),
    );
    const severity =
        found.severity === "error"
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning;
    const diagnostic = new vscode.Diagnostic(range, found.message, severity);
    diagnostic.source = "oval";
    diagnostic.code = {
        value: found.code,
        target: vscode.Uri.parse(links.get(found.code) ?? SPECIFICATION),
    };
    return diagnostic;
}

function formattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
    const text = document.getText();
    let formatted: string;
    try {
        formatted = format(text);
    } catch {
        return [];
    }
    if (formatted === text) {
        return [];
    }
    const whole = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
    return [vscode.TextEdit.replace(whole, formatted)];
}
