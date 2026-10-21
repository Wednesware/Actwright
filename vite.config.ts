import { defineConfig } from 'vite';
const port = Number(process.env['ACTWRIGHT_PORT'] ?? 5173);
const runtimeTarget = `http://127.0.0.1:${process.env['ACTWRIGHT_RUNTIME_PORT'] ?? 8765}`;
export default defineConfig({
  root: 'frontend',
  optimizeDeps: { include: ['blockly/core', 'blockly/msg/en', 'monaco-editor/editor/editor.api.js', 'monaco-editor/languages/definitions/python/register.js', 'monaco-editor/features/find/register.js', 'monaco-editor/features/folding/register.js', 'monaco-editor/features/suggest/register.js', 'monaco-editor/features/hover/register.js', 'monaco-editor/editor/browser/services/contribution.js', 'monaco-editor/features/gotoError/register.js'] },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { host: '127.0.0.1', port, strictPort: true, proxy: { '/api': { target: runtimeTarget, changeOrigin: true } } },
  preview: { proxy: { '/api': { target: runtimeTarget, changeOrigin: true } } },
});
