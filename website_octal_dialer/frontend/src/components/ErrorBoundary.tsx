import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React Component:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 text-center select-none font-sans">
          <div className="max-w-md w-full p-8 border border-slate-800 rounded-3xl bg-slate-900 shadow-2xl space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center justify-center mx-auto text-2xl font-bold font-mono">
              ⚠️
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black uppercase tracking-wider text-amber-400">
                Application Recovery
              </h2>
              <p className="text-xs text-slate-400 font-mono leading-relaxed">
                An unforeseen error occurred during rendering. Click below to reload the console safely.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 border border-slate-800 bg-slate-950 rounded-xl text-[10px] font-mono text-red-400 text-left overflow-x-auto">
                {this.state.error.message}
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs font-mono uppercase tracking-wider rounded-xl transition cursor-pointer shadow-lg shadow-amber-500/20"
            >
              Reload Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
