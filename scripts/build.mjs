import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

await build({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    external: ["vscode"],
    outfile: "dist/extension.js",
    sourcemap: true,
});

mkdirSync("dist", { recursive: true });
copyFileSync(require.resolve("@oval-vote/oval/pkg/oval_wasm_bg.wasm"), "dist/oval_wasm_bg.wasm");
