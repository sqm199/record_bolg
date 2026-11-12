# Vendor

## tiptap.js

富文本编辑器运行时，由 TipTap / ProseMirror 打包生成（MIT License）。

- `@tiptap/core` 2.27.3
- `@tiptap/starter-kit` 2.27.3
- `@tiptap/extension-underline` 2.27.3
- `@tiptap/extension-link` 2.27.3
- `@tiptap/extension-image` 2.27.3
- `@tiptap/extension-placeholder` 2.27.3
- `@tiptap/extension-table` / `-table-row` / `-table-cell` / `-table-header` 2.27.3
- `@tiptap/suggestion` 2.27.3

构建方式（在临时目录安装依赖后执行，产物提交到本目录）：

```bash
esbuild entry.js --bundle --minify --format=iife --target=es2018 --outfile=static/vendor/tiptap.js
```

入口文件把所需的 TipTap 类挂到 `window.TipTapKit`，页面逻辑见
`static/js/note-editor-rich.js`。这样运行时不需要 Node 或 CDN。