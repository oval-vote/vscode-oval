# Oval for Visual Studio Code

Language support for [Oval](https://oval.vote), a plain-text format for voting guides.

The extension provides, for `.oval` files:

- **Syntax highlighting** from a TextMate grammar that follows the specification's lexical rules.
- **Diagnostics** from the reference implementation: every lexical error, syntax error, validation
  error, and warning the specification defines, shown as you type. Each diagnostic's code is the
  identifier of its entry in the specification, and links to that entry on
  [spec.oval.vote](https://spec.oval.vote).
- **Formatting** through the reference formatter, so Format Document and format-on-save work.
  A document with syntax errors is left untouched.
- **Outline** of the ballots, sections, contests, and measures, in the Outline view and
  breadcrumbs.
- **Go to Definition, Find All References, and Rename** for identifiers. A reference goes to its
  declaration, references list every occurrence, and a rename changes all of them, refusing a name
  that is not a valid identifier or is already declared.

Diagnostics, formatting, and navigation come from [`@oval-vote/oval`](https://www.npmjs.com/package/@oval-vote/oval),
the reference implementation compiled to WebAssembly, which runs inside the extension host. There is
nothing to install besides the extension.

## What is highlighted

The grammar follows the lexical rules of the [specification](https://github.com/oval-vote/oval-spec).

| Construct                                                                                     | Scope                                                                                                                      |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `oval` and its major version                                                                  | `keyword.other.version.oval`, `constant.numeric.integer.oval`                                                              |
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
| Words where no keyword is expected, stray characters, malformed numbers, bad escapes, tabs    | `invalid.illegal.*.oval`                                                                                                   |

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

## Releasing

A release is a tag. Set `version` in `package.json` (`npm version <version> --no-git-tag-version`
updates the lockfile too), commit, tag the commit `v<version>`, and push the tag. The release
workflow runs the tests, checks that the tag matches the version, packages the extension, publishes
it to the Visual Studio Marketplace, and attaches the `.vsix` to the GitHub release.

Publishing uses the Marketplace's
[trusted publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing),
so no token is stored anywhere. The policy on the `oval-vote` publisher names this repository and
the `release.yml` workflow, with no environment.

`npm run package` builds a `.vsix` locally, which `code --install-extension` can install for a
hands-on trial.

## Versioning

The extension has its own version. The language it understands is the major version that
`@oval-vote/oval` reports through `languageMajor()`, and the diagnostics link to the edition of the
specification that package was built against.
