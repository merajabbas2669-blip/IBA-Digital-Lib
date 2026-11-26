import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ImageOff,
  Lock,
  Wrench,
} from 'lucide-react';
import { ILSSeat, SeatStatus, SeatZone } from '../../types/ils';
import { generateQrDataUrl } from '../../utils/qr';

export const SEAT_STATUS_META: Record<
  SeatStatus,
  {
    label: string;
    shortLabel: string;
    textClass: string;
    swatchClass: string;
    badgeBgClass: string;
    tileClass: string;
    tileSelectedClass: string;
  }
> = {
  available: {
    label: 'Available',
    shortLabel: 'Available',
    textClass: 'text-emerald-700',
    swatchClass: 'bg-emerald-500',
    badgeBgClass: 'bg-emerald-50 border-emerald-200/80 text-emerald-700',
    tileClass:
      'bg-emerald-50/55 border-emerald-200/90 hover:border-emerald-400 hover:bg-emerald-50/95 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-10px_rgba(16,185,129,0.32)] text-[#172033]',
    tileSelectedClass:
      'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/25 shadow-[0_10px_22px_-10px_rgba(16,185,129,0.35)] text-[#172033]',
  },
  occupied: {
    label: 'Occupied',
    shortLabel: 'Occupied',
    textClass: 'text-rose-700',
    swatchClass: 'bg-rose-500',
    badgeBgClass: 'bg-rose-50 border-rose-200/80 text-rose-700',
    tileClass:
      'bg-rose-50/50 border-rose-200/90 hover:border-rose-400 hover:bg-rose-50/90 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-10px_rgba(244,63,94,0.28)] text-[#172033]',
    tileSelectedClass:
      'bg-rose-50 border-rose-500 ring-2 ring-rose-500/25 shadow-[0_10px_22px_-10px_rgba(244,63,94,0.3)] text-[#172033]',
  },
  away: {
    label: 'Temporarily Away',
    shortLabel: 'Away',
    textClass: 'text-amber-700',
    swatchClass: 'bg-amber-500',
    badgeBgClass: 'bg-amber-50 border-amber-200/90 text-amber-800',
    tileClass:
      'bg-amber-50/60 border-amber-200/90 hover:border-amber-400 hover:bg-amber-50 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-10px_rgba(245,158,11,0.32)] text-[#172033]',
    tileSelectedClass:
      'bg-amber-50 border-amber-500 ring-2 ring-amber-500/25 shadow-[0_10px_22px_-10px_rgba(245,158,11,0.34)] text-[#172033]',
  },
  maintenance: {
    label: 'Maintenance / Offline',
    shortLabel: 'Maint. / Offline',
    textClass: 'text-slate-600',
    swatchClass: 'bg-slate-400',
    badgeBgClass: 'bg-slate-100 border-slate-200 text-slate-600',
    tileClass:
      'bg-slate-100/75 border-slate-200/90 hover:border-slate-300 hover:bg-slate-100 hover:-translate-y-0.5 text-slate-600',
    tileSelectedClass:
      'bg-slate-100 border-slate-500 ring-2 ring-slate-400/25 shadow-sm text-slate-800',
  },
};

export const SeatStatusLabel: React.FC<{ status: SeatStatus; compact?: boolean }> = ({
  status,
  compact = false,
}) => {
  const meta = SEAT_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${meta.badgeBgClass} whitespace-nowrap`}
    >
      <span className={`h-2 w-2 rounded-full shrink-0 ${meta.swatchClass}`} aria-hidden="true" />
      <span>{compact ? meta.shortLabel : meta.label}</span>
    </span>
  );
};

export const SeatStatusIcon: React.FC<{ status: SeatStatus; className?: string }> = ({
  status,
  className = 'h-3.5 w-3.5',
}) => {
  switch (status) {
    case 'available':
      return <CheckCircle2 className={`${className} text-emerald-600`} aria-hidden="true" />;
    case 'occupied':
      return <Lock className={`${className} text-rose-600`} aria-hidden="true" />;
    case 'away':
      return <Clock className={`${className} text-amber-600`} aria-hidden="true" />;
    case 'maintenance':
      return <Wrench className={`${className} text-slate-500`} aria-hidden="true" />;
  }
};

export const PageHeader: React.FC<{
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-6 border-b border-slate-200/80">
    <div className="min-w-0">
      <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-[#101C3A] text-balance">
        {title}
      </h1>
      <p className="mt-1.5 text-sm text-[#68748A] max-w-2xl leading-relaxed">{description}</p>
    </div>
    {action && <div className="flex items-center gap-3 shrink-0">{action}</div>}
  </div>
);

export const SeatSummaryStrip: React.FC<{
  counts: { total: number; available: number; occupied: number; away: number; maintenance: number };
}> = ({ counts }) => {
  const items: Array<{
    label: string;
    value: number;
    subtext: string;
    icon: React.ReactNode;
    iconWrap: string;
    valueColor: string;
    borderHover: string;
  }> = [
    {
      label: 'Available ILS',
      value: counts.available,
      subtext: `of ${counts.total} total spaces`,
      icon: <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />,
      iconWrap: 'bg-emerald-50 border-emerald-100',
      valueColor: 'text-emerald-700',
      borderHover: 'hover:border-emerald-300',
    },
    {
      label: 'Occupied',
      value: counts.occupied,
      subtext: `${counts.total > 0 ? Math.round((counts.occupied / counts.total) * 100) : 0}% active study`,
      icon: <Lock className="h-4.5 w-4.5 text-rose-600" />,
      iconWrap: 'bg-rose-50 border-rose-100',
      valueColor: 'text-rose-700',
      borderHover: 'hover:border-rose-300',
    },
    {
      label: 'Temporarily Away',
      value: counts.away,
      subtext: '20-min grace window',
      icon: <Clock className="h-4.5 w-4.5 text-amber-600" />,
      iconWrap: 'bg-amber-50 border-amber-100',
      valueColor: 'text-amber-700',
      borderHover: 'hover:border-amber-300',
    },
    {
      label: 'Maintenance / Offline',
      value: counts.maintenance,
      subtext: 'Out of service',
      icon: <Wrench className="h-4.5 w-4.5 text-slate-600" />,
      iconWrap: 'bg-slate-100 border-slate-200',
      valueColor: 'text-[#172033]',
      borderHover: 'hover:border-slate-300',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={`surface-card-interactive p-5 flex flex-col justify-between gap-3 ${item.borderHover}`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-[#68748A] truncate">{item.label}</span>
            <span
              className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${item.iconWrap}`}
              aria-hidden="true"
            >
              {item.icon}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`text-3xl font-bold tabular-nums tracking-tight ${item.valueColor}`}
            >
              {String(item.value).padStart(2, '0')}
            </span>
            <span className="text-xs text-[#68748A] truncate">{item.subtext}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export const SeatLegend: React.FC = () => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#68748A]">
    {(['available', 'occupied', 'away', 'maintenance'] as SeatStatus[]).map((status) => {
      const meta = SEAT_STATUS_META[status];
      return (
        <span key={status} className="inline-flex items-center gap-1.5 font-medium whitespace-nowrap">
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${meta.swatchClass}`} aria-hidden="true" />
          <span className="text-[#172033]">{meta.label}</span>
        </span>
      );
    })}
  </div>
);

export const SeatGrid30: React.FC<{
  seats: ILSSeat[];
  selectedSeatId: string | null;
  onSelectSeat: (seat: ILSSeat) => void;
  filterStatus?: SeatStatus | 'all';
  filterZone?: SeatZone | 'all';
  compact?: boolean;
}> = ({
  seats,
  selectedSeatId,
  onSelectSeat,
  filterStatus = 'all',
  filterZone = 'all',
  compact = false,
}) => {
  const filteredSeats = useMemo(
    () =>
      seats.filter((seat) => {
        if (filterStatus !== 'all' && seat.status !== filterStatus) return false;
        if (filterZone !== 'all' && seat.zone !== filterZone) return false;
        return true;
      }),
    [seats, filterStatus, filterZone]
  );

  if (filteredSeats.length === 0) {
    return (
      <div className="surface-card p-10 text-center">
        <p className="text-sm font-semibold text-[#101C3A]">
          No Individual Learning Spaces match the selected filter.
        </p>
        <p className="mt-1 text-xs text-[#68748A]">
          Adjust the zone or availability filter to view other ILS seats.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`grid gap-3 ${
        compact
          ? 'grid-cols-3 sm:grid-cols-5 md:grid-cols-6'
          : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'
      }`}
    >
      {filteredSeats.map((seat) => {
        const meta = SEAT_STATUS_META[seat.status];
        const isSelected = selectedSeatId === seat.id;
        return (
          <button
            key={seat.id}
            type="button"
            onClick={() => onSelectSeat(seat)}
            aria-pressed={isSelected}
            className={`group text-left rounded-2xl border p-3.5 transition-all duration-180 cursor-pointer flex flex-col justify-between min-h-[86px] ${
              isSelected ? meta.tileSelectedClass : meta.tileClass
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold tabular-nums tracking-tight text-[#101C3A]">
                {seat.id}
              </span>
              <SeatStatusIcon status={seat.status} className="h-4 w-4 shrink-0" />
            </div>
            <div className="mt-3 flex items-center justify-between gap-1.5">
              <span className={`text-[11px] font-semibold ${meta.textClass} truncate`}>
                {meta.shortLabel}
              </span>
              <span className="text-[11px] text-[#68748A] truncate">
                {seat.zone.replace(' Zone ', ' ')}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export const QRMatrixSvg: React.FC<{ value: string; size?: number; dimmed?: boolean }> = ({
  value,
  size = 120,
  dimmed = false,
}) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    void generateQrDataUrl(value, Math.max(size * 2, 240))
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-xl bg-slate-100 border border-slate-200 shrink-0"
        aria-label={`Generating QR code for ${value}`}
      />
    );
  }

  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt={`Scannable QR code for ${value}`}
      className={`rounded-xl bg-white border border-slate-200/90 p-1.5 shrink-0 object-contain shadow-xs ${
        dimmed ? 'opacity-40 grayscale' : ''
      }`}
    />
  );
};

export const SafeImage: React.FC<{
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}> = ({ src, alt, className = '', fallbackLabel = 'IBA Digital Library' }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#101C3A] via-[#172554] to-[#1E3A8A] text-slate-200 p-6 ${className}`}
      >
        <ImageOff className="h-7 w-7 text-[#19B6A4] mb-2" aria-hidden="true" />
        <span className="text-xs font-medium text-center">{fallbackLabel}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

export const OFFICIAL_IBA_LOGO_SRC = '/assets/aistudio/image_565e4e65.png';

export const IBACrestMark: React.FC<{
  light?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}> = ({ light = false, size = 'md', className = '' }) => {
  const sizeClass = {
    xs: 'h-7 rounded-[4px]',
    sm: 'h-8 rounded-[5px]',
    md: 'h-9 rounded-[6px]',
    lg: 'h-12 rounded-[7px]',
    xl: 'h-20 sm:h-24 rounded-lg',
  }[size];

  const ringClass = light
    ? 'ring-1 ring-white/20 shadow-[0_6px_16px_-6px_rgba(0,0,0,0.55)]'
    : 'ring-1 ring-slate-900/10 shadow-xs';

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 overflow-hidden select-none aspect-[622/549] ${sizeClass} ${ringClass} ${className}`}
    >
      <img
        src={OFFICIAL_IBA_LOGO_SRC}
        alt="IBA Karachi Official Logo"
        width={622}
        height={549}
        decoding="async"
        className="h-full w-full object-contain block"
      />
    </span>
  );
};
