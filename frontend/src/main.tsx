import * as React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles/app.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: unknown) { return { error: String(error) }; }
  render() { return this.state.error ? <main className="loading-screen"><h1>The workspace could not render.</h1><p>{this.state.error}</p><p>Your saved Acts remain in browser storage.</p><button onClick={() => location.reload()}>Reload workspace</button></main> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App/></ErrorBoundary>);
