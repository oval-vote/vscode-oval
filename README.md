# Oval for Visual Studio Code

Language support for [Oval](https://oval.vote), a plain-text format for voting guides.

This extension currently provides syntax highlighting and editor configuration for `.oval` files.
Diagnostics and formatting will follow, first through the `oval` command-line tool and later
through a language server.

## What is highlighted

The grammar follows the lexical rules of the [specification](https://github.com/oval-vote/oval-spec).

| Construct | Scope |
|---|---|
| `oval` and its version | `keyword.other.version.oval`, `constant.numeric.version.oval` |
| Entity keywords (`party`, `candidate`, `ballot`, `section`, `contest`, `campaign`, `measure`) | `storage.type.oval` |
| Field keywords (`guide`, `election`, `note`, `website`, ...) | `support.type.property-name.oval` |
| Voting methods (`single`, `multiple`, `ranked`, `retention`, `max`) | `keyword.other.method.oval` |
| Flags (`incumbent`, `withdrawn`) | `storage.modifier.oval` |
| `recommend`, `support`, `oppose` | `keyword.control.oval` |
| `yes`, `no`, `no-position`, `none` | `constant.language.oval` |
| `@id` where it is declared | `entity.name.type.declaration.oval` |
| `@id` where it is referenced | `variable.other.reference.oval` |
| Strings and their two escapes | `string.quoted.double.oval`, `constant.character.escape.oval` |
| Dates and integers | `constant.numeric.date.oval`, `constant.numeric.integer.oval` |
| URLs | `markup.underline.link.oval` |
| Comments | `comment.line.number-sign.oval` |
| Markdown bodies | `markup.other.markdown.oval`, with `markup.heading`, `markup.bold`, `markup.italic`, `markup.inline.raw`, and links inside |
| Words that are not keywords, malformed numbers, bad escapes, tabs | `invalid.illegal.*.oval` |

Markdown bodies are not handed to the Markdown grammar. Bodies are indented, and the Markdown
grammar would read every indented line as a code block, so the extension recognizes a small set of
inline constructs itself.

## Developing

Tooling is managed with [mise](https://mise.jdx.dev), which reads `.node-version`.

```sh
npm ci
npm test
```

The tests are [vscode-tmgrammar-test](https://github.com/PanAeon/vscode-tmgrammar-test) files under
`tests/unit`. Each `.oval` file there is highlighted and the `#` assertion lines beneath each line
name the scopes the tokens above must have.

To try the extension, open this folder in Visual Studio Code and press F5. An Extension
Development Host starts with the extension loaded; open any `.oval` file in it.
