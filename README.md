# siyuan-plugin-d2

Render ` ```d2 ` code blocks in SiYuan as diagrams — pixel-identical to what your blog build produces.

- Shows only the diagram by default; click it (or the ✎ button) to edit the source. It re-renders ~0.5s after you stop typing, and switches back when the caret leaves the block or you press Esc
- TALA layout, sketch style. Without a top-level `direction`, it prefers horizontal and falls back to vertical only when the horizontal layout would be scaled down too much
- Syntax errors are shown in place of the diagram
- Inverted in dark mode
- Adds `d2` to the code block language list

Only the d2 source is saved in your notes (the preview node carries `protyle-custom`, which SiYuan skips when saving), so exports and publishing still see a plain ` ```d2 ` block.

## Rendering engine

| Where | Engine |
|---|---|
| Desktop | Local `d2` CLI via stdin/stdout. Searches `/opt/homebrew/bin`, `/usr/local/bin`, `~/go/bin`, `~/.local/bin`, or a path set in the plugin settings |
| Desktop without the CLI, mobile, browser | Bundled `@d2lang/d2` WASM (includes TALA), loads ~11MB on first render |

Both produce byte-identical SVG for the same parameters (`--layout=tala --sketch --pad=16 --theme=0`).

## Development

```bash
npm install
npm run build      # build into dist/
npm run package    # build and create package.zip for a GitHub Release
npm run link       # symlink dist/ into ~/SiYuan/data/plugins/siyuan-plugin-d2 (override with SIYUAN_WORKSPACE)
npm run dev        # rebuild on change, then reload the plugin in SiYuan
```

## Known limitations

- Relies on SiYuan's internal code block DOM (`.protyle-action` first child is the language, followed by `.hljs`); re-test after major SiYuan upgrades
- SiYuan's built-in PDF / HTML export shows the source only

## Credits

The icon is derived from the [D2](https://github.com/terrastruct/d2) logo (© Terrastruct, MPL-2.0). Rendering uses the D2 CLI and `@d2lang/d2`.
