// React error boundary — catches render-time exceptions in any
// descendant component and shows a friendly fallback instead of a
// blank screen.
//
// Two placement levels are used:
//   1. Top-level (around <App />) — last-resort net; if this fires
//      something fundamental is broken (ffish failed, engine module
//      threw, etc.) and the only sensible action is reload.
//   2. Per-tab (around each tab's screen component) — keeps a crash
//      in one tab from killing access to the other tabs. The user
//      can switch away, fix state, or report the bug from the
//      Profile tab without losing the rest of the session.
//
// We deliberately do NOT auto-reset state on render error. Loops
// where the same render throws repeatedly are worse than showing the
// fallback — the user picks "ลองโหลดใหม่" / "รีเซ็ตข้อมูล" so the
// choice is theirs.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../lib/i18n';
import { log } from '../lib/log';

type Props = {
  children: ReactNode;
  /** Optional human label used in the fallback (e.g. "Play", "Profile"). */
  scope?: string;
  /** Optional override for the fallback UI. Receives the error + a
   *  reset callback that resets the boundary's internal state. */
  fallback?: (err: Error, reset: () => void) => ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log('error.boundary_caught', {
      scope: this.props.scope ?? 'app',
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      componentStack: info.componentStack?.split('\n').slice(0, 6).join('\n'),
    });
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary-emoji">⚠️</div>
        <h2 className="error-boundary-title">{t('error.boundary.title')}</h2>
        <p className="error-boundary-message">{t('error.boundary.message')}</p>
        {this.props.scope ? (
          <p className="error-boundary-scope">
            <small>scope: {this.props.scope}</small>
          </p>
        ) : null}
        <details className="error-boundary-details">
          <summary>รายละเอียดทางเทคนิค</summary>
          <pre>{error.message}</pre>
          {error.stack ? <pre>{error.stack}</pre> : null}
        </details>
        <div className="error-boundary-actions">
          <button
            type="button"
            className="error-boundary-button"
            onClick={() => window.location.reload()}
          >
            {t('action.reload')}
          </button>
          <button
            type="button"
            className="error-boundary-button error-boundary-button-secondary"
            onClick={this.reset}
          >
            {t('action.continue')}
          </button>
        </div>
      </div>
    );
  }
}
