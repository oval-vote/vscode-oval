# Oval for Visual Studio Code

Language support for [Oval](https://oval.vote), a plain-text format for voting guides.

The extension provides, for `.oval` files:

- **Syntax highlighting** from a TextMate grammar that follows the specification's lexical rules.
- **Diagnostics** from the reference implementation: syntax errors and every validation rule
  (V1 through V19), shown as you type. Each diagnostic's code links to the specification.
- **Formatting** through the reference formatter, so Format Document and format-on-save work.
  A document with syntax errors is left untouched.

Diagnostics and formatting come from [`@oval-vote/oval`](https://www.npmjs.com/package/@oval-vote/oval),
the reference implementation compiled to WebAssembly, which runs inside the extension host. There is
nothing to install besides the extension.

## What is highlighted

The grammar follows the lexical rules of the [specification](https://github.com/oval-vote/oval-spec).

| Construct                                                                                     | Scope                                                                                                                      |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `oval` and its version                                                                        | `keyword.other.version.oval`, `constant.numeric.version.oval`                                                              |
| Entity keywords (`party`, `candidate`, `ballot`, `section`, `contest`, `campaign`, `measure`) | `storage.type.oval`                                                                                                        |
| Field keywords (`guide`, `election`, `note`, `website`, ...)                                  | `support.type.property-name.oval`                                                                                          |
| Voting methods (`single`, `multiple`, `ranked`, `retention`, `max`)                           | `keyword.other.method.oval`                                                                                                |
| Flags (`incumbent`, `withdrawn`)                                                              | `storage.modifier.oval`                                                                                                    |
| `recommend`, `support`, `oppose`                                                              | `keyword.control.oval`                                                                                                     |
| `yes`, `no`, `no-position`, `none`                                                            | `constant.language.oval`                                                                                                   |
| `@id` where it is declared                                                                    | `entity.name.type.declaration.oval`                                                                                        |
| `@id` where it is referenced                                                                  | `variable.other.reference.oval`                                                                                            |
| Strings and their two escapes                                                                 | `string.quoted.double.oval`, `constant.character.escape.oval`                                                              |
| Dates and integers                                                                            | `constant.numeric.date.oval`, `constant.numeric.integer.oval`                                                              |
| URLs                                                                                          | `markup.underline.link.oval`                                                                                               |
| Comments                                                                                      | `comment.line.number-sign.oval`                                                                                            |
| Markdown bodies                                                                               | `markup.other.markdown.oval`, with `markup.heading`, `markup.bold`, `markup.italic`, `markup.inline.raw`, and links inside |
| Words that are not keywords, malformed numbers, bad escapes, tabs                             | `invalid.illegal.*.oval`                                                                                                   |

Markdown bodies are not handed to the Markdown grammar. Bodies are indented, and the Markdown
grammar would read every indented line as a code block, so the extension recognizes a small set of
inline constructs itself.

## Developing

Tooling is managed with [mise](https://mise.jdx.dev), which reads `.node-version`.

```sh
npm ci
npm run build          # bundles src/ into dist/ with esbuild and copies the WebAssembly module
npm run format         # Prettier over the whole repo; CI runs format:check
npm test               # grammar tests and unit tests
npm run test:integration   # runs the extension in a downloaded Visual Studio Code
```

The grammar tests are [vscode-tmgrammar-test](https://github.com/PanAeon/vscode-tmgrammar-test)
files under `tests/unit`. Each `.oval` file there is highlighted and the `#` assertion lines
beneath each line name the scopes the tokens above must have. The unit tests cover the pure
helpers, such as the conversion from the byte offsets the implementation reports to editor
positions. The integration tests under `tests/integration` open documents in a real editor and
check diagnostics and formatting end to end.

To try the extension, open this folder in Visual Studio Code and press F5. The build runs first,
then an Extension Development Host starts with the extension loaded; open any `.oval` file in it.

## Versioning

The extension shares its version with the specification and the reference implementation. Its
major and minor components are the language version it understands.
