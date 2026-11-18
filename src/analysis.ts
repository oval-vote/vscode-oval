import * as vscode from "vscode";
import {
    Analysis,
    type Completion,
    type Definition,
    type Diagnostic,
    type Fix,
    type Hover,
    type Occurrence,
    type OutlineItem,
    type Range,
} from "@oval-vote/oval";
import { isDeclared } from "./rename";

interface Cached {
    version: number;
    analysis: Analysis;
    diagnostics?: Diagnostic[];
    outline?: OutlineItem[];
    fixes?: Fix[];
}

export class Analyzer implements vscode.Disposable {
    private readonly cache = new Map<string, Cached>();

    diagnostics(document: vscode.TextDocument): Diagnostic[] {
        const cached = this.cached(document);
        cached.diagnostics ??= cached.analysis.diagnostics();
        return cached.diagnostics;
    }

    outline(document: vscode.TextDocument): OutlineItem[] {
        const cached = this.cached(document);
        cached.outline ??= cached.analysis.outline();
        return cached.outline;
    }

    fixes(document: vscode.TextDocument): Fix[] {
        const cached = this.cached(document);
        cached.fixes ??= cached.analysis.fixes();
        return cached.fixes;
    }

    definition(document: vscode.TextDocument, position: vscode.Position): Definition | null {
        return this.cached(document).analysis.definition(document.offsetAt(position));
    }

    occurrences(document: vscode.TextDocument, position: vscode.Position): Occurrence[] {
        return this.cached(document).analysis.occurrences(document.offsetAt(position));
    }

    hover(document: vscode.TextDocument, position: vscode.Position): Hover | null {
        return this.cached(document).analysis.hover(document.offsetAt(position));
    }

    completions(document: vscode.TextDocument, position: vscode.Position): Completion[] {
        return this.cached(document).analysis.completions(document.offsetAt(position));
    }

    isDeclared(document: vscode.TextDocument, name: string): boolean {
        return isDeclared(this.cached(document).analysis, document.getText(), name);
    }

    forget(document: vscode.TextDocument): void {
        const key = document.uri.toString();
        this.cache.get(key)?.analysis.free();
        this.cache.delete(key);
    }

    dispose(): void {
        for (const cached of this.cache.values()) {
            cached.analysis.free();
        }
        this.cache.clear();
    }

    private cached(document: vscode.TextDocument): Cached {
        const key = document.uri.toString();
        const cached = this.cache.get(key);
        if (cached?.version === document.version) {
            return cached;
        }
        const fresh = { version: document.version, analysis: new Analysis(document.getText()) };
        cached?.analysis.free();
        this.cache.set(key, fresh);
        return fresh;
    }
}

export function range(document: vscode.TextDocument, range: Range): vscode.Range {
    return new vscode.Range(document.positionAt(range.start), document.positionAt(range.end));
}
