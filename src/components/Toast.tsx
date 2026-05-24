// Toast / notification system.
//
// Goals:
//   1. Replace native `alert()` / `confirm()` calls (which look dated
//      and block the render thread) with non-blocking in-app messages.
//   2. Provide a confirm-with-callback pattern so destructive actions
//      can ask "are you sure" without freezing the UI.
//   3. Be small — no library dependency. The contract is a single
//      provider + four helpers (`toast.success / info / error /
//      confirm`).
//
// Usage:
//   import { toast } from './components/Toast';
//   toast.success('บันทึกแล้ว');
//   toast.confirm('ลบรายการนี้?', { onConfirm: () => deletePosition(id) });
//
// The provider is mounted once at the top of <App />. Calls to
// `toast.*` outside an active provider become no-ops (they log a
// warning in dev). The provider holds its queue in module-level
// state because that's how the global helpers reach React.

import {
  useEffect,
  useState,
  type ReactNode,
} from 'react';

type ToastKind = 'success' | 'info' | 'error';

type ToastEntry = {
  id: number;
  kind: ToastKind;
  message: string;
  durationMs: number;
};

type ConfirmEntry = {
  id: number;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel?: () => void;
  destructive?: boolean;
};

type Subscriber = (state: { toasts: ToastEntry[]; confirms: ConfirmEntry[] }) => void;

let nextId = 1;
let toasts: ToastEntry[] = [];
let confirms: ConfirmEntry[] = [];
const subscribers = new Set<Subscriber>();

function emit(): void {
  const snapshot = { toasts: [...toasts], confirms: [...confirms] };
  for (const s of subscribers) s(snapshot);
}

function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

function pushToast(kind: ToastKind, message: string, durationMs = 3000): void {
  const entry: ToastEntry = { id: nextId++, kind, message, durationMs };
  toasts = [...toasts, entry];
  emit();
  if (durationMs > 0) {
    window.setTimeout(() => dismissToast(entry.id), durationMs);
  }
}

function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function pushConfirm(entry: Omit<ConfirmEntry, 'id'>): void {
  const e: ConfirmEntry = { ...entry, id: nextId++ };
  confirms = [...confirms, e];
  emit();
}

function dismissConfirm(id: number, run: 'confirm' | 'cancel'): void {
  const entry = confirms.find((c) => c.id === id);
  confirms = confirms.filter((c) => c.id !== id);
  emit();
  if (!entry) return;
  if (run === 'confirm') entry.onConfirm();
  else entry.onCancel?.();
}

/**
 * Global toast helpers — call from anywhere (event handlers, async
 * effects, etc.). The provider component must be mounted at the top
 * of the tree for these to render.
 */
export const toast = {
  success(message: string, durationMs?: number) { pushToast('success', message, durationMs); },
  info(message: string, durationMs?: number) { pushToast('info', message, durationMs); },
  error(message: string, durationMs?: number) { pushToast('error', message, durationMs ?? 5000); },
  /**
   * Show a non-blocking confirm dialog. `onConfirm` runs when the user
   * accepts; `onCancel` (optional) runs when they dismiss. `destructive`
   * styles the confirm button red and is recommended for delete actions.
   */
  confirm(
    message: string,
    opts: {
      onConfirm: () => void;
      onCancel?: () => void;
      confirmLabel?: string;
      cancelLabel?: string;
      destructive?: boolean;
    },
  ) {
    pushConfirm({
      message,
      confirmLabel: opts.confirmLabel ?? 'ยืนยัน',
      cancelLabel: opts.cancelLabel ?? 'ยกเลิก',
      onConfirm: opts.onConfirm,
      onCancel: opts.onCancel,
      destructive: opts.destructive,
    });
  },
};

/**
 * Top-level provider. Renders the toast stack + confirm dialog above
 * the rest of the UI. Mount once in App.tsx.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ toasts: ToastEntry[]; confirms: ConfirmEntry[] }>({
    toasts: [],
    confirms: [],
  });
  useEffect(() => subscribe(setState), []);
  return (
    <>
      {children}
      {state.toasts.length > 0 ? (
        <div className="toast-stack" aria-live="polite" role="status">
          {state.toasts.map((t) => (
            <div
              key={t.id}
              className={`toast toast-${t.kind}`}
              onClick={() => dismissToast(t.id)}
              role="alert"
            >
              <span className="toast-icon">
                {t.kind === 'success' ? '✓' : t.kind === 'error' ? '⚠' : 'ⓘ'}
              </span>
              <span className="toast-message">{t.message}</span>
            </div>
          ))}
        </div>
      ) : null}
      {state.confirms.length > 0 ? (
        <div className="toast-confirm-overlay" role="dialog" aria-modal="true">
          {state.confirms.map((c) => (
            <div key={c.id} className="toast-confirm">
              <div className="toast-confirm-message">{c.message}</div>
              <div className="toast-confirm-actions">
                <button
                  type="button"
                  className="toast-confirm-cancel"
                  onClick={() => dismissConfirm(c.id, 'cancel')}
                >
                  {c.cancelLabel}
                </button>
                <button
                  type="button"
                  className={`toast-confirm-ok${c.destructive ? ' toast-confirm-destructive' : ''}`}
                  onClick={() => dismissConfirm(c.id, 'confirm')}
                >
                  {c.confirmLabel}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
