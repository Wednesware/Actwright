import * as React from 'react';
import type { InputPrompt } from './client.ts';

export function TerminalPrompt({ prompt, busy, onReply }: { prompt: InputPrompt; busy: boolean; onReply: (text: string) => void }) {
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { input.current?.focus(); }, [prompt.requestId]);
  return <form className="runtime-input terminal-prompt" aria-label="Python input prompt" onSubmit={event => {
    event.preventDefault(); if (!busy && input.current) onReply(input.current.value);
  }}><label htmlFor="terminal-response">{prompt.prompt || 'Enter text:'}</label>
    <input key={prompt.requestId} ref={input} id="terminal-response" aria-label="Terminal input" autoComplete="off" maxLength={2000} disabled={busy}/>
    <button className="button compact" disabled={busy}>Submit</button>
  </form>;
}
