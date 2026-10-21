import * as React from 'react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/languages/definitions/python/register.js';
import 'monaco-editor/features/find/register.js';
import 'monaco-editor/features/folding/register.js';
import 'monaco-editor/features/suggest/register.js';
import 'monaco-editor/features/hover/register.js';
import 'monaco-editor/editor/browser/services/contribution.js';
import 'monaco-editor/features/gotoError/register.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
for (const [name, base, background, foreground, surface] of [
  ['dark', 'vs-dark', '#10131c', '#dce0ee', '#1d2230'],
  ['light', 'vs', '#edf0f6', '#263149', '#fafbfe'],
] as const) monaco.editor.defineTheme(`actwright-${name}`, { base, inherit: true, rules: [], colors: {
  'editor.background': background, 'editor.foreground': foreground, 'editorGutter.background': background,
  'editorWidget.background': surface, 'editor.lineHighlightBackground': surface,
} });
export function PythonEditor({ value, onChange, theme, diagnostics, focusLine }: { value: string; onChange: (value: string) => void; theme: 'dark' | 'light'; diagnostics: string[]; focusLine?: number | undefined }) {
  const container = React.useRef<HTMLDivElement>(null), editor = React.useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const change = React.useRef(onChange); change.current = onChange;
  React.useEffect(() => {
    const instance = monaco.editor.create(container.current!, { value, language: 'python', theme: `actwright-${theme}`,
      renderValidationDecorations: 'on', automaticLayout: true, editContext: false, minimap: { enabled: false }, fontSize: 13, tabSize: 4, insertSpaces: true, scrollBeyondLastLine: false,
      ariaLabel: 'Python script', wordWrap: 'on', padding: { top: 14 }, fixedOverflowWidgets: true });
    editor.current = instance;
    const listener = instance.onDidChangeModelContent(() => change.current(instance.getValue()));
    const completion = monaco.languages.registerCompletionItemProvider('python', {
      provideCompletionItems: (model, position) => { const word = model.getWordUntilPosition(position); const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn }; return { suggestions: [
        { label: 'print', insertText: 'print(${1:"hello"})', kind: monaco.languages.CompletionItemKind.Function },
        { label: 'game', insertText: 'game', kind: monaco.languages.CompletionItemKind.Variable },
        { label: 'parent', insertText: 'parent', kind: monaco.languages.CompletionItemKind.Variable },
        { label: 'new_instance', insertText: 'new_instance(${1:"silicon.Entity"}, ${2:"player"}, ${3:game})', kind: monaco.languages.CompletionItemKind.Function },
        { label: 'new_singleton', insertText: 'new_singleton(${1:"silicon.Entity"}, ${2:game})', kind: monaco.languages.CompletionItemKind.Function },
        { label: 'components', insertText: 'components', kind: monaco.languages.CompletionItemKind.Variable },
        { label: 'self', insertText: 'self', kind: monaco.languages.CompletionItemKind.Variable },
      ].map(item => ({ ...item, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range })) }; },
    });
    return () => { listener.dispose(); completion.dispose(); instance.getModel()?.dispose(); instance.dispose(); editor.current = null; };
  }, []);
  React.useEffect(() => { if (editor.current && editor.current.getValue() !== value) editor.current.setValue(value); }, [value]);
  React.useEffect(() => { monaco.editor.setTheme(`actwright-${theme}`); }, [theme]);
  React.useEffect(() => {
    const model = editor.current?.getModel(); if (!model) return;
    monaco.editor.setModelMarkers(model, 'actwright', diagnostics.map(message => {
      const line = Math.max(1, Math.min(model.getLineCount(), Number(/^Line (\d+):/.exec(message)?.[1] ?? 1)));
      return { severity: monaco.MarkerSeverity.Error, message, startLineNumber: line, endLineNumber: line, startColumn: 1, endColumn: Math.max(2, model.getLineMaxColumn(line)) };
    }));
  }, [diagnostics]);
  React.useEffect(() => { if (focusLine && editor.current) { editor.current.revealLineInCenter(focusLine); editor.current.setPosition({ lineNumber: focusLine, column: 1 }); editor.current.focus(); } }, [focusLine]);
  return <div className="python-editor" ref={container}/>;
}
