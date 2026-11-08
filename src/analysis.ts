import * as vscode from "vscode";
import {
    completions,
    fixes,
    hover,
    outline,
    symbols,
    type Completion,
    type Fix,
    type Hover,
    type OutlineItem,
    type Range,
    type Symbols,
} from "@oval-vote/oval";
import { offsets, type Offsets } from "./offsets";

export const WORD = /^[A-Za-z][A-Za-z0-9_-]*$/;

interface Analysis {
    version: number;
    offsets: Offsets;
    symbols?: Symbols;
    outline?: OutlineItem[];
    fixes?: Fix[];
}

export class Analyzer {
    private readonly cache = new Map<string, Analysis>();

    forget(document: vscode.TextDocument): void {
        this.cache.delete(document.uri.toString());
    }

    symbols(document: vscode.TextDocument): Symbols {
        const analysis = this.analysis(document);
        analysis.symbols ??= symbols(document.getText());
        return analysis.symbols;
    }

    outline(document: vscode.TextDocument): OutlineItem[] {
        const analysis = this.analysis(document);
        analysis.outline ??= outline(document.getText());
        return analysis.outline;
    }

    completions(document: vscode.TextDocument, position: vscode.Position): Completion[] {
        return completions(document.getText(), this.byteOffset(document, position));
    }

    hover(document: vscode.TextDocument, position: vscode.Position): Hover | undefined {
        return hover(document.getText(), this.byteOffset(document, position));
    }

    fixes(document: vscode.TextDocument): Fix[] {
        const analysis = this.analysis(document);
        analysis.fixes ??= fixes(document.getText());
        return analysis.fixes;
    }

    range(document: vscode.TextDocument, range: Range): vscode.Range {
        const { toIndex } = this.analysis(document).offsets;
        return new vscode.Range(
            document.positionAt(toIndex(range.start)),
            document.positionAt(toIndex(range.end)),
        );
    }

    byteOffset(document: vscode.TextDocument, position: vscode.Position): number {
        return this.analysis(document).offsets.toByteOffset(document.offsetAt(position));
    }

    private analysis(document: vscode.TextDocument): Analysis {
        const key = document.uri.toString();
        const cached = this.cache.get(key);
        if (cached?.version === document.version) {
            return cached;
        }
        const fresh = { version: document.version, offsets: offsets(document.getText()) };
        this.cache.set(key, fresh);
        return fresh;
    }
}

export type Found =
    | { kind: "declaration"; index: number; name: string }
    | { kind: "reference"; index: number; name: string };

export function symbolAt(found: Symbols, byteOffset: number): Found | undefined {
    const touches = (range: Range) => range.start <= byteOffset && byteOffset <= range.end;
    const declaration = found.declarations.findIndex((d) => touches(d.range));
    if (declaration >= 0) {
        return {
            kind: "declaration",
            index: declaration,
            name: found.declarations[declaration].name,
        };
    }
    const reference = found.references.findIndex((r) => touches(r.range));
    if (reference >= 0) {
        return { kind: "reference", index: reference, name: found.references[reference].name };
    }
    return undefined;
}

export function occurrences(
    found: Symbols,
    name: string,
    includeDeclarations: boolean,
): { range: Range; nameRange: Range }[] {
    const all = [
        ...(includeDeclarations ? found.declarations.filter((d) => d.name === name) : []),
        ...found.references.filter((r) => r.name === name),
    ];
    return all.sort((a, b) => a.range.start - b.range.start);
}
