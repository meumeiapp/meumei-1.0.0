import React from 'react';

const isDev = import.meta.env.DEV;

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export default class ErrorBoundary extends React.Component<
  React.PropsWithChildren<unknown>,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const payload = {
      name: error?.name || 'Error',
      message: error?.message || 'unknown',
      stack: error?.stack || null,
      componentStack: errorInfo?.componentStack || null,
      href: typeof window !== 'undefined' ? window.location.href : 'unknown',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      timestamp: new Date().toISOString()
    };
    try {
      localStorage.setItem('meumei_last_error_v1', JSON.stringify(payload));
    } catch (storageError) {
      console.error('[ErrorBoundary] Storage error', storageError);
    }
    console.error('[ErrorBoundary] Captured', payload);
    console.error('[error-boundary]', {
      name: payload.name,
      message: payload.message,
      stack: payload.stack,
      componentStack: payload.componentStack
    });
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  handleRecovery = () => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('reset', '1');
    window.location.href = url.toString();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-[#121216] p-4 text-sm text-zinc-600 dark:text-zinc-300">
        <p className="font-semibold text-zinc-900 dark:text-white">
          {isDev ? 'Erro capturado. Ver console.' : 'Erro detectado. Clique em \"Limpar e reiniciar\".'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={this.handleRecovery}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Limpar e reiniciar
          </button>
          <button
            onClick={this.handleReload}
            className="rounded-lg border border-transparent bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-700 dark:hover:bg-zinc-600"
          >
            Recarregar
          </button>
        </div>
        {isDev && this.state.error?.stack && (
          <pre className="mt-3 max-h-40 overflow-auto text-[0.65rem] text-red-500">
            {this.state.error.stack}
          </pre>
        )}
      </div>
    );
  }
}
