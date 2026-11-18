import * as vscode from "vscode";
import {
    format,
    type Completion,
    type Diagnostic,
    type Edit,
    type OutlineItem,
} from "@oval-vote/oval";
import { Analyzer, range } from "./analysis";
import { WORD } from "./rename";

const DEBOUNCE_MILLISECONDS = 150;

export function activate(context: vscode.ExtensionContext): void {
    const collection = vscode.languages.createDiagnosticCollection("oval");
    const pending = new Map<string, NodeJS.Timeout>();
    const analyzer = new Analyzer();

    const lint = (document: vscode.TextDocument) => {
        if (document.languageId !== "oval") {
            return;
        }
        collection.set(document.uri, diagnostics(analyzer, document));
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

    const renamed = (document: vscode.TextDocument, position: vscode.Position) => {
        const index = document.offsetAt(position);
        const occurrences = analyzer.occurrences(document, position);
        const here = occurrences.find(
            (occurrence) => occurrence.range.start <= index && index <= occurrence.range.end,
        );
        if (here === undefined) {
            throw new Error("Only an identifier can be renamed");
        }
        return { here, occurrences, name: document.getText(range(document, here.idRange)) };
    };

    context.subscriptions.push(
        collection,
        analyzer,
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
                return analyzer.outline(document).map((item) => documentSymbol(document, item));
            },
        }),
        vscode.languages.registerDefinitionProvider("oval", {
            provideDefinition(document, position) {
                const definition = analyzer.definition(document, position);
                if (definition === null) {
                    return undefined;
                }
                return new vscode.Location(document.uri, range(document, definition.range));
            },
        }),
        vscode.languages.registerReferenceProvider("oval", {
            provideReferences(document, position, context) {
                return analyzer
                    .occurrences(document, position)
                    .filter((occurrence) => context.includeDeclaration || !occurrence.isDeclaration)
                    .map(
                        (occurrence) =>
                            new vscode.Location(document.uri, range(document, occurrence.range)),
                    );
            },
        }),
        vscode.languages.registerCompletionItemProvider(
            "oval",
            {
                provideCompletionItems(document, position) {
                    return analyzer
                        .completions(document, position)
                        .map((completion) => completionItem(document, completion));
                },
            },
            "@",
            " ",
        ),
        vscode.languages.registerHoverProvider("oval", {
            provideHover(document, position) {
                const hover = analyzer.hover(document, position);
                if (hover === null) {
                    return undefined;
                }
                return new vscode.Hover(
                    new vscode.MarkdownString(hover.contents),
                    range(document, hover.range),
                );
            },
        }),
        vscode.languages.registerCodeActionsProvider(
            "oval",
            {
                provideCodeActions(document, requested, context) {
                    const found = analyzer.diagnostics(document);
                    return analyzer.fixes(document).flatMap((fix) => {
                        const repaired = found[fix.diagnostic];
                        const where = range(document, repaired.range);
                        if (where.intersection(requested) === undefined) {
                            return [];
                        }
                        const action = new vscode.CodeAction(
                            fix.title,
                            vscode.CodeActionKind.QuickFix,
                        );
                        action.edit = new vscode.WorkspaceEdit();
                        action.edit.set(document.uri, [
                            textEdit(range(document, fix.edit.range), fix.edit),
                        ]);
                        action.diagnostics = context.diagnostics.filter(
                            (diagnostic) =>
                                diagnostic.code === repaired.code &&
                                diagnostic.range.isEqual(where),
                        );
                        action.isPreferred = true;
                        return [action];
                    });
                },
            },
            { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
        ),
        vscode.languages.registerRenameProvider("oval", {
            prepareRename(document, position) {
                const { here, name } = renamed(document, position);
                return { range: range(document, here.idRange), placeholder: name };
            },
            provideRenameEdits(document, position, newName) {
                const { occurrences, name } = renamed(document, position);
                if (!WORD.test(newName)) {
                    throw new Error(
                        "An identifier is a letter followed by letters, digits, hyphens, and underscores",
                    );
                }
                if (newName !== name && analyzer.isDeclared(document, newName)) {
                    throw new Error(`@${newName} is already declared`);
                }
                const edit = new vscode.WorkspaceEdit();
                for (const occurrence of occurrences) {
                    edit.replace(document.uri, range(document, occurrence.idRange), newName);
                }
                return edit;
            },
        }),
    );
    vscode.workspace.textDocuments.forEach(lint);
}

export function deactivate(): void {}

function diagnostics(analyzer: Analyzer, document: vscode.TextDocument): vscode.Diagnostic[] {
    let found: Diagnostic[];
    try {
        found = analyzer.diagnostics(document);
    } catch (error) {
        const start = new vscode.Range(0, 0, 0, 0);
        const message = error instanceof Error ? error.message : String(error);
        return [new vscode.Diagnostic(start, message, vscode.DiagnosticSeverity.Error)];
    }
    return found.map((diagnostic) => convert(document, diagnostic));
}

function convert(document: vscode.TextDocument, found: Diagnostic): vscode.Diagnostic {
    const severity =
        found.severity === "error"
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning;
    const diagnostic = new vscode.Diagnostic(range(document, found.range), found.message, severity);
    diagnostic.source = "oval";
    diagnostic.code = found.code;
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

function documentSymbol(document: vscode.TextDocument, item: OutlineItem): vscode.DocumentSymbol {
    const symbol = new vscode.DocumentSymbol(
        item.title ?? (item.id === null ? item.kind : `@${item.id}`),
        item.id === null ? item.kind : `${item.kind} @${item.id}`,
        SYMBOL_KINDS[item.kind],
        range(document, item.range),
        range(document, item.selection),
    );
    symbol.children = item.children.map((child) => documentSymbol(document, child));
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
    document: vscode.TextDocument,
    completion: Completion,
): vscode.CompletionItem {
    const item = new vscode.CompletionItem(completion.label, COMPLETION_KINDS[completion.kind]);
    item.detail = completion.detail ?? undefined;
    item.range = range(document, completion.replace);
    return item;
}

function textEdit(where: vscode.Range, edit: Edit): vscode.TextEdit | vscode.SnippetTextEdit {
    const placeholder = edit.placeholder;
    if (placeholder === null) {
        return vscode.TextEdit.replace(where, edit.text);
    }
    const snippet = new vscode.SnippetString()
        .appendText(edit.text.slice(0, placeholder.start))
        .appendPlaceholder(edit.text.slice(placeholder.start, placeholder.end))
        .appendText(edit.text.slice(placeholder.end));
    return vscode.SnippetTextEdit.replace(where, snippet);
}
