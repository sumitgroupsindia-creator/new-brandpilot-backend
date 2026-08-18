import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';
import { Button } from './Button';

type FeedbackTone = 'info' | 'success' | 'warning' | 'error';

export interface FeedbackToastInput {
  title: string;
  description?: string;
  tone?: FeedbackTone;
  durationMs?: number;
}

export interface FeedbackDialogInput {
  title: string;
  description?: string;
  tone?: FeedbackTone;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface FeedbackToast extends FeedbackToastInput {
  id: string;
}

interface FeedbackDialog extends FeedbackDialogInput {
  id: string;
}

interface FeedbackContextValue {
  showToast: (input: FeedbackToastInput) => void;
  showDialog: (input: FeedbackDialogInput) => void;
  dismissDialog: () => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);
let feedbackBridge: FeedbackContextValue | null = null;

function createFeedbackId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function showGlobalToast(input: FeedbackToastInput) {
  feedbackBridge?.showToast(input);
}

export function showGlobalDialog(input: FeedbackDialogInput) {
  feedbackBridge?.showDialog(input);
}

export function dismissGlobalDialog() {
  feedbackBridge?.dismissDialog();
}

export function FeedbackProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<FeedbackToast[]>([]);
  const [dialog, setDialog] = useState<FeedbackDialog | null>(null);

  useEffect(() => {
    feedbackBridge = {
      showToast: input => {
        setToasts(current => [...current, { id: createFeedbackId('toast'), tone: 'info', durationMs: 4200, ...input }]);
      },
      showDialog: input => {
        setDialog({ id: createFeedbackId('dialog'), tone: 'error', confirmLabel: 'Okay', ...input });
      },
      dismissDialog: () => {
        setDialog(null);
      },
    };

    return () => {
      feedbackBridge = null;
    };
  }, []);

  useEffect(() => {
    if (!toasts.length) {
      return;
    }

    const timers = toasts.map(toast =>
      window.setTimeout(() => {
        setToasts(current => current.filter(item => item.id !== toast.id));
      }, toast.durationMs ?? 4200),
    );

    return () => {
      timers.forEach(timer => window.clearTimeout(timer));
    };
  }, [toasts]);

  return (
    <FeedbackContext.Provider
      value={{
        showToast: input => {
          setToasts(current => [...current, { id: createFeedbackId('toast'), tone: 'info', durationMs: 4200, ...input }]);
        },
        showDialog: input => {
          setDialog({ id: createFeedbackId('dialog'), tone: 'error', confirmLabel: 'Okay', ...input });
        },
        dismissDialog: () => {
          setDialog(null);
        },
      }}
    >
      {children}

      <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-full max-w-[380px] flex-col gap-3">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto overflow-hidden rounded-[22px] border px-4 py-3 shadow-[0_24px_55px_rgba(15,23,42,0.22)] backdrop-blur-xl ${toastToneClassName(toast.tone ?? 'info')}`}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/85 text-sm font-semibold text-slate-900">
                {toneGlyph(toast.tone ?? 'info')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-current">{toast.title}</p>
                {toast.description ? <p className="mt-1 text-sm text-current/80">{toast.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-current transition hover:bg-white"
                aria-label="Dismiss message"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4 stroke-current" fill="none" strokeWidth="1.8">
                  <path d="m6 6 8 8M14 6l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {dialog ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(9,12,18,0.58)] p-4 backdrop-blur-sm" onClick={() => setDialog(null)}>
          <div
            className="w-full max-w-[520px] rounded-[30px] border border-white/50 bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(244,247,252,0.96)_100%)] p-5 shadow-[0_40px_100px_rgba(15,23,42,0.28)]"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="global-feedback-dialog-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] text-xl font-semibold ${dialogToneIconClassName(dialog.tone ?? 'error')}`}>
                {toneGlyph(dialog.tone ?? 'error')}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-subtle)]">BrandPilot Notice</p>
                <h3 id="global-feedback-dialog-title" className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">
                  {dialog.title}
                </h3>
                {dialog.description ? <p className="mt-3 text-[15px] leading-7 text-[var(--color-ink-muted)]">{dialog.description}</p> : null}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              {dialog.cancelLabel ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    dialog.onCancel?.();
                    setDialog(null);
                  }}
                >
                  {dialog.cancelLabel}
                </Button>
              ) : null}
              <Button
                type="button"
                className="border-0 bg-[linear-gradient(135deg,#ff7a18,#f23686_56%,#7a5cff)] text-white shadow-[0_18px_40px_rgba(137,76,255,0.24)] hover:opacity-95"
                onClick={() => {
                  dialog.onConfirm?.();
                  setDialog(null);
                }}
              >
                {dialog.confirmLabel ?? 'Okay'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);

  if (context) {
    return context;
  }

  return {
    showToast: showGlobalToast,
    showDialog: showGlobalDialog,
    dismissDialog: dismissGlobalDialog,
  };
}

function toastToneClassName(tone: FeedbackTone) {
  switch (tone) {
    case 'success':
      return 'border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.96),rgba(209,250,229,0.98))] text-emerald-900';
    case 'warning':
      return 'border-amber-200 bg-[linear-gradient(135deg,rgba(255,251,235,0.96),rgba(254,243,199,0.98))] text-amber-900';
    case 'error':
      return 'border-rose-200 bg-[linear-gradient(135deg,rgba(255,241,242,0.96),rgba(255,228,230,0.98))] text-rose-900';
    default:
      return 'border-sky-200 bg-[linear-gradient(135deg,rgba(239,246,255,0.96),rgba(219,234,254,0.98))] text-sky-900';
  }
}

function dialogToneIconClassName(tone: FeedbackTone) {
  switch (tone) {
    case 'success':
      return 'bg-emerald-100 text-emerald-700';
    case 'warning':
      return 'bg-amber-100 text-amber-700';
    case 'error':
      return 'bg-rose-100 text-rose-700';
    default:
      return 'bg-sky-100 text-sky-700';
  }
}

function toneGlyph(tone: FeedbackTone) {
  switch (tone) {
    case 'success':
      return '✓';
    case 'warning':
      return '!';
    case 'error':
      return '!';
    default:
      return 'i';
  }
}
