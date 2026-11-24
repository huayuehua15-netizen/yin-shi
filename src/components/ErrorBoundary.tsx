import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Cadence UI error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 text-center shadow-sm">
          <h1 className="font-display text-xl font-bold text-slate-950">
            Something went wrong / 页面出现异常
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            The workspace hit an unexpected error. Reload to restore your call library.
            <br />
            工作区遇到意外错误，刷新页面即可恢复通话库。
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Reload / 刷新页面
          </button>
        </div>
      </div>
    );
  }
}
