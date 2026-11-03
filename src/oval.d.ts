declare module "@oval-vote/oval" {
    export interface Diagnostic {
        code: string;
        severity: "error" | "warning";
        range: { start: number; end: number };
        message: string;
    }

    export function check(source: string): Diagnostic[];
    export function compile(source: string): unknown;
    export function format(source: string): string;
}
