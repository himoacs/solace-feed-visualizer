import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  /** Shown in the fallback, e.g. "Topic Explorer". */
  label: string;
  /** Positions the fallback where the crashed region was (defaults to filling its parent). */
  className?: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Without a boundary, React unmounts the ENTIRE app on any render error -
 * one bad frame in, say, the sunburst chart would blank the whole page. These
 * sit inside the context providers, so a crash is contained to one region and
 * the canvas's nodes and live sessions survive it.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.label}] crashed:`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={`flex items-center justify-center p-6 ${this.props.className ?? 'h-full w-full'}`}>
        <div className="max-w-sm rounded-lg border border-sc-error bg-white p-4 text-sm text-sc-text shadow-xl">
          <p className="font-medium text-sc-error">{this.props.label} hit an error</p>
          <p className="mt-1 break-words font-mono text-[11px] text-sc-muted">{this.state.error.message}</p>
          <button
            className="mt-3 rounded-md bg-sc-action px-3 py-1.5 text-xs font-medium text-white hover:bg-sc-action-hover"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
