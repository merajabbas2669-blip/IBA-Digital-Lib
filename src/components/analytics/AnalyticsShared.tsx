import React from 'react';
import { Calendar, FlaskConical, TrendingDown, TrendingUp } from 'lucide-react';
import { AnalyticsDatePreset, AnalyticsDateRange } from '../../data/analyticsDemoData';

export const DemoDataBanner: React.FC<{
  scopeLabel?: string;
}> = ({ scopeLabel = 'Analytics Preview' }) => (
  <div
    role="note"
    className="rounded-2xl bg-amber-50/90 border border-amber-200/90 px-3.5 py-3 sm:px-4 sm:py-3.5 flex items-start gap-3"
  >
    <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-amber-100 border border-amber-200 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
      <FlaskConical className="h-4 w-4" aria-hidden="true" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-950">
          DEMO DATA
        </span>
        <span className="text-xs font-semibold text-amber-950">{scopeLabel}</span>
      </div>
      <p className="mt-1 text-[11px] sm:text-xs text-amber-900/85 leading-relaxed">
        Occupancy hours, visit trends, utilization percentages, and session logs shown here are
        sample DEMO DATA for previewing analytics and are not live physical sensor measurements.
      </p>
    </div>
  </div>
);

export const AnalyticsDateFilterBar: React.FC<{
  preset: AnalyticsDatePreset;
  customStart: string;
  customEnd: string;
  activeRange: AnalyticsDateRange;
  onSelectPreset: (preset: AnalyticsDatePreset) => void;
  onChangeCustomStart: (value: string) => void;
  onChangeCustomEnd: (value: string) => void;
}> = ({
  preset,
  customStart,
  customEnd,
  activeRange,
  onSelectPreset,
  onChangeCustomStart,
  onChangeCustomEnd,
}) => {
  const presets: Array<{ id: AnalyticsDatePreset; label: string; shortLabel: string }> = [
    { id: 'today', label: 'Today', shortLabel: 'Today' },
    { id: 'week', label: 'This Week', shortLabel: 'Week' },
    { id: 'month', label: 'This Month', shortLabel: 'Month' },
    { id: 'custom', label: 'Custom Range', shortLabel: 'Custom' },
  ];

  return (
    <div className="surface-card p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <div
        role="group"
        aria-label="Analytics date filter"
        className="grid grid-cols-4 sm:inline-flex items-center gap-1 p-1 bg-[#F5F7FC] border border-slate-200/80 rounded-xl w-full sm:w-fit"
      >
        {presets.map((item) => {
          const isActive = preset === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectPreset(item.id)}
              className={`min-h-[44px] px-2 sm:px-3.5 py-2 text-xs font-semibold rounded-lg transition-all active:scale-[0.97] cursor-pointer whitespace-nowrap text-center ${
                isActive
                  ? 'bg-[#101C3A] text-white shadow-xs'
                  : 'text-[#68748A] hover:text-[#101C3A] hover:bg-white/70'
              }`}
            >
              <span className="sm:hidden">{item.shortLabel}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5">
        {preset === 'custom' ? (
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
            <label className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[11px] sm:text-xs font-medium text-[#68748A]">
              <span>From</span>
              <input
                type="date"
                aria-label="Analytics start date"
                value={customStart}
                max={customEnd}
                onChange={(e) => onChangeCustomStart(e.target.value)}
                className="w-full sm:w-auto min-h-[44px] px-2.5 py-2 rounded-lg border border-slate-200 bg-white font-mono text-xs text-[#101C3A] tabular-nums focus:border-[#315EF2]"
              />
            </label>
            <label className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[11px] sm:text-xs font-medium text-[#68748A]">
              <span>To</span>
              <input
                type="date"
                aria-label="Analytics end date"
                value={customEnd}
                min={customStart}
                onChange={(e) => onChangeCustomEnd(e.target.value)}
                className="w-full sm:w-auto min-h-[44px] px-2.5 py-2 rounded-lg border border-slate-200 bg-white font-mono text-xs text-[#101C3A] tabular-nums focus:border-[#315EF2]"
              />
            </label>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 text-xs text-[#68748A]">
            <Calendar className="h-3.5 w-3.5 text-[#315EF2] shrink-0" aria-hidden="true" />
            <span className="font-medium text-[#101C3A]">{activeRange.label}</span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="font-mono text-[11px] text-[#68748A] tabular-nums">
              {activeRange.daysCount} {activeRange.daysCount === 1 ? 'day' : 'days'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const AnalyticsKpiCard: React.FC<{
  label: string;
  value: string;
  subtext: string;
  icon: React.ReactNode;
  accent?: 'blue' | 'teal' | 'navy' | 'emerald' | 'amber';
  delta?: {
    value: string;
    positive: boolean;
  };
}> = ({ label, value, subtext, icon, accent = 'blue', delta }) => {
  const iconTone: Record<typeof accent, string> = {
    blue: 'bg-[#EAF0FF] border-[#DCE6FF] text-[#315EF2]',
    teal: 'bg-teal-50 border-teal-200/80 text-[#0F8B7C]',
    navy: 'bg-slate-100 border-slate-200 text-[#101C3A]',
    emerald: 'bg-emerald-50 border-emerald-200/80 text-emerald-700',
    amber: 'bg-amber-50 border-amber-200/80 text-amber-700',
  };

  return (
    <div className="surface-card-interactive p-4 sm:p-5 flex flex-col justify-between gap-3 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] sm:text-xs font-semibold text-[#68748A] leading-snug">
          {label}
        </span>
        <span
          className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl border flex items-center justify-center shrink-0 ${iconTone[accent]}`}
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-1.5 flex-wrap">
          <span className="font-display text-xl sm:text-[26px] font-bold tracking-tight text-[#101C3A] tabular-nums">
            {value}
          </span>
          {delta && (
            <span
              className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${
                delta.positive ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {delta.positive ? (
                <TrendingUp className="h-3 w-3 shrink-0" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-3 w-3 shrink-0" aria-hidden="true" />
              )}
              <span>{delta.value}</span>
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-[#68748A] line-clamp-1">{subtext}</p>
      </div>
    </div>
  );
};

export const AnalyticsChartCard: React.FC<{
  title: string;
  subtitle: string;
  rightMeta?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, rightMeta, children }) => (
  <section className="surface-card p-4 sm:p-6 flex flex-col gap-3.5 min-w-0 overflow-hidden">
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[15px] sm:text-base font-bold text-[#101C3A] tracking-tight truncate">
            {title}
          </h2>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded shrink-0">
            Demo
          </span>
        </div>
        <p className="mt-0.5 text-xs text-[#68748A] leading-relaxed">{subtitle}</p>
      </div>
      {rightMeta && <div className="shrink-0">{rightMeta}</div>}
    </div>
    <div className="w-full min-w-0">{children}</div>
  </section>
);

interface TooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
}

export const AnalyticsTooltip: React.FC<{
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadItem[];
  unitFormatter?: (value: number | string, name: string) => string;
}> = ({ active, label, payload, unitFormatter }) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl bg-[#101C3A] text-white px-3 py-2 shadow-xl border border-white/10 text-xs">
      {label && <div className="font-semibold text-blue-100 mb-1">{label}</div>}
      <div className="space-y-1">
        {payload.map((entry, index) => {
          const itemName = String(entry.name ?? entry.dataKey ?? 'Value');
          const rawVal = entry.value ?? 0;
          const formatted = unitFormatter
            ? unitFormatter(rawVal, itemName)
            : typeof rawVal === 'number'
              ? rawVal.toLocaleString()
              : String(rawVal);

          return (
            <div key={`${itemName}-${index}`} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-slate-300">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color || '#315EF2' }}
                />
                <span>{itemName}</span>
              </span>
              <span className="font-mono font-semibold text-white tabular-nums">{formatted}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const VerificationStatusText: React.FC<{
  status: 'Verified Present' | 'Verified (Short Break)' | 'Partial — Away Gap';
}> = ({ status }) => {
  if (status === 'Verified Present') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
        <span>Verified Present</span>
      </span>
    );
  }
  if (status === 'Verified (Short Break)') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F8B7C]">
        <span className="h-2 w-2 rounded-full bg-[#19B6A4] shrink-0" />
        <span>Verified (Short Break)</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
      <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
      <span>Partial — Away Gap</span>
    </span>
  );
};
