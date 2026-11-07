import * as vscode from "vscode";
import {
    catalog,
    check,
    format,
    type Completion,
    type Diagnostic,
    type OutlineItem,
} from "@oval-vote/oval";
import { Analyzer, WORD, occurrences, symbolAt } from "./analysis";
import { byteOffsetToIndex } from "./offsets";

const SPECIFICATION = "https://spec.oval.vote/draft/";
const DEBOUNCE_MILLISECONDS = 150;

export function activate(context: vscode.ExtensionContext): void {
    const collection = vscode.languages.createDiagnosticCollection("oval");
    const pending = new Map<string, NodeJS.Timeout>();
    const links = new Map(catalog().map((entry) => [entry.identifier, entry.url]));
    const analyzer = new Analyzer();

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
            analyzer.forget(document);
        }),
        vscode.languages.registerDocumentFormattingEditProvider("oval", {
            provideDocumentFormattingEdits(document) {
                return formattingEdits(document);
            },
        }),
        vscode.languages.registerDocumentSymbolProvider("oval", {
            provideDocumentSymbols(document) {
                return analyzer
                    .outline(document)
                    .map((item) => documentSymbol(analyzer, document, item));
            },
        }),
        vscode.languages.registerDefinitionProvider("oval", {
            provideDefinition(document, position) {
                const found = analyzer.symbols(document);
                const at = symbolAt(found, analyzer.byteOffset(document, position));
                if (at === undefined) {
                    return undefined;
                }
                const index =
                    at.kind === "declaration" ? at.index : found.references[at.index].declaration;
                const declaration = index === undefined ? undefined : found.declarations[index];
                if (declaration === undefined) {
                    return undefined;
                }
                return new vscode.Location(
                    document.uri,
                    analyzer.range(document, declaration.range),
                );
            },
        }),
        vscode.languages.registerReferenceProvider("oval", {
            provideReferences(document, position, context) {
                const found = analyzer.symbols(document);
                const at = symbolAt(found, analyzer.byteOffset(document, position));
                if (at === undefined) {
                    return undefined;
                }
                return occurrences(found, at.name, context.includeDeclaration).map(
                    (occurrence) =>
                        new vscode.Location(
                            document.uri,
                            analyzer.range(document, occurrence.range),
                        ),
                );
            },
        }),
        vscode.languages.registerCompletionItemProvider(
            "oval",
            {
                provideCompletionItems(document, position) {
                    return analyzer
                        .completions(document, position)
                        .map((completion) => completionItem(analyzer, document, completion));
                },
            },
            "@",
            " ",
        ),
        vscode.languages.registerRenameProvider("oval", {
            prepareRename(document, position) {
                const found = analyzer.symbols(document);
                const at = symbolAt(found, analyzer.byteOffset(document, position));
                if (at === undefined) {
                    throw new Error("Only an identifier can be renamed");
                }
                const occurrence =
                    at.kind === "declaration"
                        ? found.declarations[at.index]
                        : found.references[at.index];
                return {
                    range: analyzer.range(document, occurrence.nameRange),
                    placeholder: at.name,
                };
            },
            provideRenameEdits(document, position, newName) {
                const found = analyzer.symbols(document);
                const at = symbolAt(found, analyzer.byteOffset(document, position));
                if (at === undefined) {
                    throw new Error("Only an identifier can be renamed");
                }
                if (!WORD.test(newName)) {
                    throw new Error(
                        "An identifier is a letter followed by letters, digits, hyphens, and underscores",
                    );
                }
                if (newName !== at.name && found.declarations.some((d) => d.name === newName)) {
                    throw new Error(`@${newName} is already declared`);
                }
                const edit = new vscode.WorkspaceEdit();
                for (const occurrence of occurrences(found, at.name, true)) {
                    edit.replace(
                        document.uri,
                        analyzer.range(document, occurrence.nameRange),
                        newName,
                    );
                }
                return edit;
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

const SYMBOL_KINDS = {
    ballot: vscode.SymbolKind.Module,
    section: vscode.SymbolKind.Namespace,
    contest: vscode.SymbolKind.Class,
    measure: vscode.SymbolKind.Property,
} as const;

function documentSymbol(
    analyzer: Analyzer,
    document: vscode.TextDocument,
    item: OutlineItem,
): vscode.DocumentSymbol {
    const symbol = new vscode.DocumentSymbol(
        item.title ?? (item.name === undefined ? item.kind : `@${item.name}`),
        item.name === undefined ? item.kind : `${item.kind} @${item.name}`,
        SYMBOL_KINDS[item.kind],
        analyzer.range(document, item.range),
        analyzer.range(document, item.selection),
    );
    symbol.children = item.children.map((child) => documentSymbol(analyzer, document, child));
    return symbol;
}

const COMPLETION_KINDS = {
    keyword: vscode.CompletionItemKind.Keyword,
    party: vscode.CompletionItemKind.Enum,
    candidate: vscode.CompletionItemKind.User,
    ballot: vscode.CompletionItemKind.Module,
    contest: vscode.CompletionItemKind.Class,
    measure: vscode.CompletionItemKind.Property,
} as const;

function completionItem(
    analyzer: Analyzer,
    document: vscode.TextDocument,
    completion: Completion,
): vscode.CompletionItem {
    const item = new vscode.CompletionItem(completion.label, COMPLETION_KINDS[completion.kind]);
    item.detail = completion.detail;
    item.range = analyzer.range(document, completion.replace);
    return item;
}
