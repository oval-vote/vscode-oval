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
- **Completion** of what the grammar accepts at the cursor: the keywords allowed in the current
  block, the literal values of a field, and the identifiers a position names, so `support` offers
  candidates and `party` offers parties, each with its name.
- **Hover** on an identifier for what it declares, its name, and how often it is used, and on a
  keyword for a one-line description with a link to its section of the specification.
- **Quick fixes** for diagnostics that have a mechanical repair: `http` to `https`, a misspelled
  reference to the nearest declared name, a missing guide field, a missing recommendation, and an
  unused declaration.
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

The version in `package.json` is the version the next release will have. Three workflows under
Actions manage it, each run from `main` as the organization's release app:

- **Set Version** takes a version and commits `Set version to <version>`, through
  `mise run set-version`. It makes no release.
- **Release** takes an optional version. It refuses unless the version is greater than the latest
  release, is not tagged or on the Marketplace, and every check on the latest commit of `main` is
  green. When a version was given it sets it, runs the tests, and commits `Release <version>`. Then
  it creates the GitHub release, tagged `v<version>`, with an empty body. The tag runs the same
  workflow's `publish` job, which runs the tests, checks the version against the tag, packages the
  extension, publishes it to the Visual Studio Marketplace, and attaches the `.vsix` to the release.
- **Unrelease** takes the latest version, reverts its release commit if there was one, and deletes
  the GitHub release and tag. A version that reached the Marketplace is not removed; the workflow
  says so, and the next release takes a new number.

Locally, `mise run set-version <version>` writes the version without committing it, and
`mise run version:check` confirms that `package.json` and its lockfile agree. CI runs the check.

Publishing uses the Marketplace's
[trusted publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing),
so no token is stored anywhere. The policy on the `oval-vote` publisher names this repository and
the `release.yml` workflow, with no environment. The release app's ID and private key are the
`VSCODE_OVAL_RELEASE_APP_ID` and `VSCODE_OVAL_RELEASE_APP_PRIVATE_KEY` organization secrets; commits and tags
made with its token trigger the CI and publish workflows, which the default `GITHUB_TOKEN` would
not.

`npm run package` builds a `.vsix` locally, which `code --install-extension` can install for a
hands-on trial.

## Versioning

The extension has its own version. The language it understands is the major version that
`@oval-vote/oval` reports through `languageMajor()`, and the diagnostics link to the edition of the
specification that package was built against.
