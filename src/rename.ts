import type { Analysis } from "@oval-vote/oval";

export const WORD = /^[A-Za-z][A-Za-z0-9_-]*$/;

const IDENTIFIER = /@([A-Za-z][A-Za-z0-9_-]*)/g;

export function isDeclared(analysis: Analysis, source: string, name: string): boolean {
    for (const match of source.matchAll(IDENTIFIER)) {
        if (match[1] === name && analysis.definition(match.index) !== null) {
            return true;
        }
    }
    return false;
}
