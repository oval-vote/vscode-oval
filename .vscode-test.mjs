import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
    files: "out/tests/integration/**/*.test.js",
    workspaceFolder: "tests/fixtures",
    mocha: { ui: "bdd", timeout: 20000 },
});
