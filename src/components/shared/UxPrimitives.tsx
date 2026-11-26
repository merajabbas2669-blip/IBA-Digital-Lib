import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';

/* ==================== 1. GLOBAL TOAST NOTIFICATIONS ==================== */

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastInput {
  tone: ToastTone;
  title: string;
  description?: string;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastRecord extends ToastInput {
  id: string;
}

interface ToastContextValue {
  pushToast: (toast: ToastInput) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const existing = timersRef.current.get(id);
    if (existing !== undefined) {
      window.clearTimeout(existing);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: ToastInput): string => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = toast.durationMs ?? (toast.tone === 'error' ? 5600 : 3800);

      setToasts((prev) => [...prev.slice(-2), { ...toast, id }]);

      if (duration > 0) {
        const timer = window.setTimeout(() => {
          dismissToast(id);
        }, duration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [dismissToast]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const toneStyle: Record<
    ToastTone,
    { wrap: string; iconWrap: string; icon: React.ReactNode }
  > = {
    success: {
      wrap: 'bg-[#101C3A] text-white border-[#19B6A4]/40',
      iconWrap: 'bg-emerald-500/20 text-emerald-300',
      icon: <CheckCircle2 className="h-4.5 w-4.5" />,
    },
    error: {
      wrap: 'bg-rose-950 text-white border-rose-400/40',
      iconWrap: 'bg-rose-500/25 text-rose-200',
      icon: <XCircle className="h-4.5 w-4.5" />,
    },
    warning: {
      wrap: 'bg-amber-950 text-white border-amber-400/40',
      iconWrap: 'bg-amber-500/25 text-amber-200',
      icon: <AlertTriangle className="h-4.5 w-4.5" />,
    },
    info: {
      wrap: 'bg-[#101C3A] text-white border-[#315EF2]/45',
      iconWrap: 'bg-[#315EF2]/25 text-blue-200',
      icon: <Info className="h-4.5 w-4.5" />,
    },
  };

  return (
    <ToastContext.Provider value={{ pushToast, dismissToast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.9rem+env(safe-area-inset-bottom,0px))] lg:bottom-6 z-[80] flex flex-col items-center lg:items-end gap-2 px-4 lg:px-6"
      >
        {toasts.map((toast) => {
          const style = toneStyle[toast.tone];
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto animate-toast-in w-full max-w-md rounded-2xl border px-4 py-3 shadow-2xl shadow-black/25 backdrop-blur-md flex items-center justify-between gap-3 ${style.wrap}`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span
                  className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${style.iconWrap}`}
                >
                  {style.icon}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold leading-snug">{toast.title}</div>
                  {toast.description && (
                    <div className="mt-0.5 text-[11px] text-white/80 leading-relaxed">
                      {toast.description}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {toast.actionLabel && toast.onAction && (
                  <button
                    type="button"
                    onClick={() => {
                      dismissToast(toast.id);
                      toast.onAction?.();
                    }}
                    className="min-h-[36px] px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold cursor-pointer whitespace-nowrap active:scale-[0.97] transition-transform"
                  >
                    {toast.actionLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Dismiss notification"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      pushToast: () => '',
      dismissToast: () => undefined,
    };
  }
  return ctx;
}

/* ==================== 2. ACCESSIBLE CONFIRMATION DIALOG ==================== */

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  icon?: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  busy = false,
  icon,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      <div
        className="fixed inset-0 bg-[#0A1329]/65 backdrop-blur-[2px]"
        onClick={() => {
          if (!busy) onCancel();
        }}
        aria-hidden="true"
      />
      <div className="relative z-10 animate-sheet-up w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200/80 p-5 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 space-y-4">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto -mt-1" />

        <div className="flex items-start gap-3.5">
          <span
            className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${
              tone === 'danger'
                ? 'bg-rose-50 text-rose-600 border border-rose-200/80'
                : 'bg-[#EAF0FF] text-[#315EF2] border border-[#DCE6FF]'
            }`}
          >
            {icon ?? (
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <h2
              id="confirm-dialog-title"
              className="font-display text-base font-bold text-[#101C3A]"
            >
              {title}
            </h2>
            <p
              id="confirm-dialog-desc"
              className="mt-1 text-xs sm:text-sm text-[#68748A] leading-relaxed"
            >
              {description}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="w-full sm:w-auto min-h-[48px] px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[#101C3A] text-sm font-semibold cursor-pointer active:scale-[0.98] transition-all"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className={`w-full sm:w-auto min-h-[48px] px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm disabled:opacity-60 cursor-pointer active:scale-[0.98] transition-all ${
              tone === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-[#315EF2] hover:bg-[#244AD4]'
            }`}
          >
            {busy ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ==================== 3. TOUCH PULL-TO-REFRESH ==================== */

interface PullToRefreshProps {
  onRefresh?: () => Promise<boolean | void>;
  disabled?: boolean;
  children: React.ReactNode;
}

const PULL_THRESHOLD_PX = 64;
const PULL_MAX_PX = 96;

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  disabled = false,
  children,
}) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (disabled || !onRefresh || refreshing) return;
    if (window.scrollY > 2) return;
    const touch = e.touches[0];
    if (!touch) return;
    startYRef.current = touch.clientY;
    pullingRef.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!pullingRef.current || startYRef.current === null || refreshing) return;
    if (window.scrollY > 2) {
      pullingRef.current = false;
      setPullDistance(0);
      return;
    }
    const touch = e.touches[0];
    if (!touch) return;
    const delta = touch.clientY - startYRef.current;
    if (delta > 8) {
      // Elastic resistance curve
      const damped = Math.min(PULL_MAX_PX, Math.round((delta - 8) * 0.48));
      setPullDistance(damped);
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = async () => {
    if (!pullingRef.current) return;
    pullingRef.current = false;
    startYRef.current = null;

    if (pullDistance >= PULL_THRESHOLD_PX && onRefresh && !refreshing) {
      setRefreshing(true);
      setPullDistance(52);
      try {
        await onRefresh();
      } finally {
        window.setTimeout(() => {
          setRefreshing(false);
          setPullDistance(0);
        }, 280);
      }
    } else {
      setPullDistance(0);
    }
  };

  const readyToRelease = pullDistance >= PULL_THRESHOLD_PX;
  const visibleHeight = refreshing ? 52 : pullDistance;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => void handleTouchEnd()}
      onTouchCancel={() => {
        pullingRef.current = false;
        startYRef.current = null;
        if (!refreshing) setPullDistance(0);
      }}
      className="relative"
    >
      {onRefresh && (
        <div
          aria-live="polite"
          style={{
            height: `${visibleHeight}px`,
            opacity: visibleHeight > 6 ? Math.min(1, visibleHeight / 44) : 0,
          }}
          className="overflow-hidden flex items-center justify-center transition-[height,opacity] duration-150 ease-out select-none"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200/90 shadow-xs text-xs font-semibold text-[#101C3A]">
            <RefreshCw
              className={`h-3.5 w-3.5 text-[#315EF2] transition-transform ${
                refreshing ? 'animate-spin' : readyToRelease ? 'rotate-180' : ''
              }`}
            />
            <span>
              {refreshing
                ? 'Refreshing live data...'
                : readyToRelease
                  ? 'Release to refresh'
                  : 'Pull to refresh'}
            </span>
          </div>
        </div>
      )}
      {children}
    </div>
  );
};

/* ==================== 4. SYNC ERROR RETRY BANNER ==================== */

export const SyncErrorBanner: React.FC<{
  message: string;
  retrying?: boolean;
  onRetry: () => void;
}> = ({ message, retrying = false, onRetry }) => (
  <div
    role="alert"
    className="mb-4 rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
  >
    <div className="flex items-start gap-2.5 min-w-0">
      <WifiOff className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-xs font-bold text-rose-950">Connection Issue</div>
        <p className="text-xs text-rose-900/90 leading-snug">{message}</p>
      </div>
    </div>
    <button
      type="button"
      disabled={retrying}
      onClick={onRetry}
      className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0 active:scale-[0.98] transition-all"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
      <span>{retrying ? 'Retrying...' : 'Retry'}</span>
    </button>
  </div>
);

/* ==================== 5. SKELETON LOADING STATES ==================== */

export const SeatGridSkeleton: React.FC<{ count?: number }> = ({ count = 15 }) => (
  <div
    aria-label="Loading ILS seats"
    className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3.5"
  >
    {Array.from({ length: count }).map((_, idx) => (
      <div
        key={idx}
        className="min-h-[104px] sm:min-h-[116px] rounded-2xl border border-slate-200/80 bg-white p-3.5 flex flex-col justify-between animate-pulse"
      >
        <div className="flex items-center justify-between">
          <div className="h-3.5 w-11 rounded-md bg-slate-200/80" />
          <div className="h-3.5 w-3.5 rounded-full bg-slate-200/80" />
        </div>
        <div className="mx-auto h-7 w-7 rounded-xl bg-slate-100" />
        <div className="mx-auto h-3 w-14 rounded-md bg-slate-200/70" />
      </div>
    ))}
  </div>
);

export const HomeCardsSkeleton: React.FC = () => (
  <div className="space-y-4 animate-pulse" aria-label="Loading dashboard summary">
    <div className="surface-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-4 w-32 rounded-md bg-slate-200/80" />
        <div className="h-6 w-20 rounded-lg bg-slate-100" />
      </div>
      <div className="h-7 w-24 rounded-md bg-slate-200" />
      <div className="h-11 w-full rounded-xl bg-slate-100" />
    </div>
    <div className="grid grid-cols-2 gap-3.5">
      <div className="surface-card p-4 space-y-2.5">
        <div className="h-3.5 w-20 rounded bg-slate-200/80" />
        <div className="h-7 w-14 rounded bg-slate-200" />
        <div className="h-3 w-24 rounded bg-slate-100" />
      </div>
      <div className="surface-card p-4 space-y-2.5">
        <div className="h-3.5 w-24 rounded bg-slate-200/80" />
        <div className="h-7 w-14 rounded bg-slate-200" />
        <div className="h-3 w-20 rounded bg-slate-100" />
      </div>
    </div>
  </div>
);

export const ListRowsSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="surface-card divide-y divide-slate-100 overflow-hidden animate-pulse">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-200/80 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-2/5 rounded bg-slate-200/80" />
          <div className="h-3 w-3/4 rounded bg-slate-100" />
        </div>
      </div>
    ))}
  </div>
);

/* ==================== 6. EMPTY STATE CARD ==================== */

export const EmptyStateCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}> = ({ icon, title, description, primaryAction, secondaryAction }) => (
  <div className="surface-card p-8 sm:p-10 text-center space-y-4">
    <div className="mx-auto h-14 w-14 rounded-2xl bg-[#EAF0FF] text-[#315EF2] flex items-center justify-center">
      {icon}
    </div>
    <div className="space-y-1.5">
      <h3 className="font-display text-base sm:text-lg font-bold text-[#101C3A]">{title}</h3>
      <p className="text-xs sm:text-sm text-[#68748A] max-w-sm mx-auto leading-relaxed">
        {description}
      </p>
    </div>
    {(primaryAction || secondaryAction) && (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
        {primaryAction && (
          <button
            type="button"
            onClick={primaryAction.onClick}
            className="w-full sm:w-auto min-h-[48px] px-5 py-2.5 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] text-white text-sm font-semibold shadow-sm cursor-pointer active:scale-[0.98] transition-all"
          >
            {primaryAction.label}
          </button>
        )}
        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[#101C3A] text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    )}
  </div>
);
