import React, { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  Armchair,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Cpu,
  CreditCard,
  LayoutGrid,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react';
import {
  AdminInterventionLog,
  AdminOverviewMetrics,
  AdminRoute,
  FinancialSummary,
  ILSSeat,
  ViolationPolicyMeta,
} from '../../types/ils';
import { SeatStatusLabel } from '../shared/DesignSystem';

interface AdminOverviewDashboardProps {
  metrics: AdminOverviewMetrics;
  seats: ILSSeat[];
  financialSummary: FinancialSummary;
  interventions: AdminInterventionLog[];
  violationPolicy: ViolationPolicyMeta;
  onNavigate: (route: AdminRoute) => void;
}

const INTERVENTION_LABELS: Record<AdminInterventionLog['category'], string> = {
  SEAT_RELEASE: 'Manual Seat Release',
  SEAT_MAINTENANCE: 'Maintenance Override',
  SEAT_STATUS_OVERRIDE: 'Seat Status Override',
  VIOLATION_CORRECTION: 'Violation Review / Correction',
  STUDENT_STATUS_CHANGE: 'Student Account Standing',
};

function formatPktTimestamp(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export const AdminOverviewDashboard: React.FC<AdminOverviewDashboardProps> = ({
  metrics,
  seats,
  financialSummary,
  interventions,
  violationPolicy,
  onNavigate,
}) => {
  const occupancyRate = useMemo(() => {
    if (metrics.totalSeats <= 0) return 0;
    return Math.round(((metrics.occupiedSeats + metrics.awaySeats) / metrics.totalSeats) * 100);
  }, [metrics.awaySeats, metrics.occupiedSeats, metrics.totalSeats]);

  const sensorHealth = useMemo(() => {
    const offline = seats.filter(
      (s) => s.sensorPresence === 'OFFLINE' || s.sensorState === 'Offline'
    ).length;
    const online = Math.max(0, seats.length - offline);
    return { online, offline };
  }, [seats]);

  // SVG Donut chart segments for seat distribution
  const donutSegments = useMemo(() => {
    const total = Math.max(1, metrics.totalSeats);
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const items = [
      { key: 'occupied', label: 'Occupied', count: metrics.occupiedSeats, color: '#E11D48' },
      { key: 'away', label: 'Temporarily Away', count: metrics.awaySeats, color: '#F59E0B' },
      { key: 'available', label: 'Available', count: metrics.availableSeats, color: '#10B981' },
      { key: 'maintenance', label: 'Maintenance', count: metrics.maintenanceSeats, color: '#94A3B8' },
    ];

    let offset = 0;
    return items.map((item) => {
      const length = (item.count / total) * circumference;
      const seg = { ...item, length, offset, circumference };
      offset += length;
      return seg;
    });
  }, [metrics]);

  const maxDailyBookings = useMemo(() => {
    return Math.max(4, ...metrics.dailyUtilizationSeries.map((d) => d.totalReservations));
  }, [metrics.dailyUtilizationSeries]);

  const maxMonthlyFinance = useMemo(() => {
    return Math.max(
      500,
      ...metrics.monthlyFinancialSeries.map((m) =>
        Math.max(m.generatedPkr, m.collectedPkr, m.outstandingPkr)
      )
    );
  }, [metrics.monthlyFinancialSeries]);

  const awaySeatsList = useMemo(() => seats.filter((s) => s.status === 'away'), [seats]);

  return (
    <div className="space-y-6">
      {/* Executive Operations Control Centre Banner */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#101C3A] via-[#172554] to-[#1D3576] text-white p-6 sm:p-7 shadow-lg shadow-[#101C3A]/15">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="admin-hero-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#admin-hero-grid)" />
        </svg>

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5 text-xs font-medium text-blue-200">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#2DD4BF]">
                <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                IBA Operations Control Centre
              </span>
              <span className="text-white/30">•</span>
              <span className="font-mono text-[11px] tabular-nums">
                {metrics.asOfDateKarachi} PKT · Cycle {metrics.currentMonthKarachi}
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Administrator Overview
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Live operational intelligence across all {metrics.totalSeats} Individual Learning
              Spaces, IoT occupancy telemetry, monthly compliance tracking, and PKR financial
              ledgers.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <div className="rounded-xl bg-white/10 border border-white/15 px-4 py-3 backdrop-blur-xs">
              <div className="text-[11px] font-medium text-blue-200">Live Occupancy</div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="font-sans text-2xl font-bold tabular-nums text-white">
                  {occupancyRate}%
                </span>
                <span className="font-mono text-xs text-[#2DD4BF] tabular-nums">
                  {metrics.occupiedSeats + metrics.awaySeats}/{metrics.totalSeats} in use
                </span>
              </div>
            </div>

            <div className="flex flex-wrap sm:flex-col gap-2">
              <button
                type="button"
                onClick={() => onNavigate('live-seats')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] text-white text-xs font-semibold shadow-sm shadow-[#315EF2]/30 transition-all cursor-pointer whitespace-nowrap"
              >
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Live Seat Map</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
              >
                <BarChart3 className="h-3.5 w-3.5 text-[#2DD4BF]" aria-hidden="true" />
                <span>Reports &amp; Exports</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile-First Live ILS Status Preview Strip + Quick Module Access (Echoing Reference Admin Panel) */}
      <section className="surface-card p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm sm:text-base font-bold text-[#101C3A]">
              Live ILS Status
            </h2>
            <p className="text-[11px] sm:text-xs text-[#68748A]">
              Real-time snapshot of Individual Learning Spaces
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('live-seats')}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#315EF2] hover:underline cursor-pointer whitespace-nowrap"
          >
            <span>View All</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          {seats.slice(0, 6).map((seat) => {
            const tileTone =
              seat.status === 'available'
                ? 'bg-emerald-50/85 border-emerald-200 text-emerald-700'
                : seat.status === 'occupied'
                  ? 'bg-rose-50/85 border-rose-200 text-rose-700'
                  : seat.status === 'away'
                    ? 'bg-amber-50/85 border-amber-200 text-amber-700'
                    : 'bg-slate-100 border-slate-200 text-slate-600';

            const statusWord =
              seat.status === 'available'
                ? 'Available'
                : seat.status === 'occupied'
                  ? 'Occupied'
                  : seat.status === 'away'
                    ? 'Away'
                    : 'Offline';

            return (
              <button
                key={seat.id}
                type="button"
                onClick={() => onNavigate('live-seats')}
                className={`rounded-2xl border p-3 flex flex-col items-center justify-center gap-1.5 min-h-[92px] transition-transform active:scale-[0.97] cursor-pointer ${tileTone}`}
              >
                <Armchair className="h-5 w-5" />
                <span className="font-mono text-xs font-bold text-[#101C3A] tabular-nums">
                  {seat.id}
                </span>
                <span className="text-[11px] font-bold">{statusWord}</span>
              </button>
            );
          })}
        </div>

        {/* Fast Mobile Admin Shortcuts */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
          {(
            [
              { route: 'sensors', label: 'Sensor Sim', icon: Cpu },
              { route: 'analytics', label: 'Analytics', icon: TrendingUp },
              { route: 'penalties', label: 'Fine Config', icon: SlidersHorizontal },
              { route: 'reports', label: 'Reports', icon: BarChart3 },
            ] as const
          ).map((shortcut) => {
            const Icon = shortcut.icon;
            return (
              <button
                key={shortcut.route}
                type="button"
                onClick={() => onNavigate(shortcut.route)}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#F5F7FC] hover:bg-[#EAF0FF] border border-slate-200/75 flex items-center justify-center gap-2 text-xs font-semibold text-[#101C3A] hover:text-[#315EF2] transition-colors cursor-pointer"
              >
                <Icon className="h-3.5 w-3.5 text-[#315EF2] shrink-0" />
                <span className="truncate">{shortcut.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Row 1: Seat Capacity & Live Occupancy KPI Cards (5 Metrics) */}
      <section aria-label="ILS Seat Capacity Metrics">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => onNavigate('live-seats')}
            className="surface-card-interactive p-5 text-left cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#68748A]">Total ILS Seats</span>
              <span className="h-9 w-9 rounded-xl bg-[#EAF0FF] text-[#315EF2] flex items-center justify-center shrink-0">
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-[#101C3A] tabular-nums">
              {metrics.totalSeats}
            </div>
            <div className="mt-1.5 text-xs text-[#68748A] font-mono tabular-nums">
              {occupancyRate}% live utilization
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('live-seats')}
            className="surface-card-interactive p-5 text-left cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#68748A]">Available Seats</span>
              <span className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-emerald-700 tabular-nums">
              {metrics.availableSeats}
            </div>
            <div className="mt-1.5 text-xs text-[#68748A]">Ready for QR check-in</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('live-seats')}
            className="surface-card-interactive p-5 text-left cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#68748A]">Occupied Seats</span>
              <span className="h-9 w-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-rose-700 tabular-nums">
              {metrics.occupiedSeats}
            </div>
            <div className="mt-1.5 text-xs text-[#68748A]">Active student presence</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('sensors')}
            className="surface-card-interactive p-5 text-left cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#68748A]">Temporarily Away</span>
              <span className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Clock className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-amber-700 tabular-nums">
              {metrics.awaySeats}
            </div>
            <div className="mt-1.5 text-xs text-[#68748A]">Absence countdown active</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('live-seats')}
            className="surface-card-interactive p-5 text-left cursor-pointer col-span-2 sm:col-span-1"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#68748A]">Maintenance</span>
              <span className="h-9 w-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                <Wrench className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-slate-700 tabular-nums">
              {metrics.maintenanceSeats}
            </div>
            <div className="mt-1.5 text-xs text-[#68748A]">
              {sensorHealth.offline > 0
                ? `${sensorHealth.offline} sensor offline`
                : `${sensorHealth.online} sensors online`}
            </div>
          </button>
        </div>
      </section>

      {/* Row 2: Students, Daily Activity, Monthly Violations & Financial Metrics (6 Metrics) */}
      <section aria-label="Operations, Compliance, and Financial Metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <button
            type="button"
            onClick={() => onNavigate('students')}
            className="surface-card-interactive p-4 text-left cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#68748A]">Active Students</span>
              <span className="h-7 w-7 rounded-lg bg-[#EAF0FF] text-[#315EF2] flex items-center justify-center shrink-0">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-2.5 text-2xl font-bold tracking-tight text-[#101C3A] tabular-nums">
              {metrics.activeStudentsCount}
            </div>
            <div className="mt-1 text-[11px] text-[#68748A]">
              of {metrics.totalStudentsCount} registered
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('reservations')}
            className="surface-card-interactive p-4 text-left cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#68748A]">Reservations Today</span>
              <span className="h-7 w-7 rounded-lg bg-teal-50 text-[#0F8B7C] flex items-center justify-center shrink-0">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-2.5 text-2xl font-bold tracking-tight text-[#101C3A] tabular-nums">
              {metrics.reservationsToday}
            </div>
            <div className="mt-1 text-[11px] font-mono text-[#68748A] tabular-nums">
              PKT {metrics.asOfDateKarachi}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('reservations')}
            className="surface-card-interactive p-4 text-left cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#68748A]">Expired Today</span>
              <span className="h-7 w-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-2.5 text-2xl font-bold tracking-tight text-amber-700 tabular-nums">
              {metrics.expiredReservationsToday}
            </div>
            <div className="mt-1 text-[11px] text-[#68748A]">Auto-released absence</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('violations')}
            className="surface-card-interactive p-4 text-left cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#68748A]">Monthly Violations</span>
              <span className="h-7 w-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-2.5 text-2xl font-bold tracking-tight text-rose-700 tabular-nums">
              {metrics.monthlyViolations}
            </div>
            <div className="mt-1 text-[11px] font-mono text-[#68748A] tabular-nums">
              Month {metrics.currentMonthKarachi}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('financials')}
            className="surface-card-interactive p-4 text-left cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#68748A]">Monthly Fines</span>
              <span className="h-7 w-7 rounded-lg bg-[#EAF0FF] text-[#101C3A] flex items-center justify-center shrink-0">
                <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-2.5 text-xl font-bold tracking-tight text-[#101C3A] tabular-nums">
              PKR {metrics.monthlyFinesGeneratedPkr.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] font-mono text-[#68748A] tabular-nums">
              Cycle {metrics.currentMonthKarachi}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('financials')}
            className="surface-card-interactive p-4 text-left cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#68748A]">Outstanding</span>
              <span className="h-7 w-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-2.5 text-xl font-bold tracking-tight text-rose-700 tabular-nums">
              PKR {metrics.outstandingBalancesPkr.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-[#68748A] tabular-nums">
              {financialSummary.counts.unpaid} Unpaid · {financialSummary.counts.pending} Pending
            </div>
          </button>
        </div>
      </section>

      {/* Row 3: Charts — Live Occupancy & Zone Utilization + 7-Day Daily Seat Utilization */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Seat Distribution Donut + Zone Breakdown */}
        <section className="xl:col-span-5 surface-card p-6 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-[#101C3A]">
                Live Occupancy Distribution
              </h2>
              <p className="text-xs text-[#68748A] mt-0.5">
                Real-time breakdown across all {metrics.totalSeats} Individual Learning Spaces
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('live-seats')}
              className="text-xs font-semibold text-[#315EF2] hover:text-[#244AD4] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span>Inspect</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative h-40 w-40 shrink-0">
              <svg
                viewBox="0 0 132 132"
                className="h-40 w-40 -rotate-90"
                aria-label="Seat occupancy donut chart"
              >
                <circle
                  cx="66"
                  cy="66"
                  r="52"
                  fill="none"
                  stroke="#EEF2F8"
                  strokeWidth="14"
                />
                {donutSegments.map((seg) =>
                  seg.count > 0 ? (
                    <circle
                      key={seg.key}
                      cx="66"
                      cy="66"
                      r="52"
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="14"
                      strokeDasharray={`${seg.length} ${seg.circumference - seg.length}`}
                      strokeDashoffset={-seg.offset}
                    />
                  ) : null
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-[#101C3A] tabular-nums">
                  {occupancyRate}%
                </span>
                <span className="text-[11px] font-medium text-[#68748A]">In Use</span>
              </div>
            </div>

            <div className="flex-1 w-full space-y-3 text-xs">
              {donutSegments.map((seg) => (
                <div key={seg.key} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-[#172033] font-medium">{seg.label}</span>
                  </div>
                  <span className="font-mono font-semibold text-[#101C3A] tabular-nums">
                    {seg.count} / {metrics.totalSeats}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Zone Breakdown Bars */}
          <div className="pt-5 border-t border-slate-100 space-y-3.5">
            <div className="text-xs font-semibold text-[#101C3A]">Utilization by Study Zone</div>
            {metrics.zoneUtilization.map((z) => {
              const occW = z.total > 0 ? (z.occupied / z.total) * 100 : 0;
              const awayW = z.total > 0 ? (z.away / z.total) * 100 : 0;
              const maintW = z.total > 0 ? (z.maintenance / z.total) * 100 : 0;
              return (
                <div key={z.zone} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#172033]">{z.zone}</span>
                    <span className="font-mono text-[#68748A] tabular-nums">
                      {z.occupied + z.away}/{z.total} active ({z.utilizationPct}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-emerald-100/90 overflow-hidden flex">
                    <div
                      className="bg-rose-500 h-full transition-all"
                      style={{ width: `${occW}%` }}
                      title={`Occupied: ${z.occupied}`}
                    />
                    <div
                      className="bg-amber-400 h-full transition-all"
                      style={{ width: `${awayW}%` }}
                      title={`Away: ${z.away}`}
                    />
                    <div
                      className="bg-slate-400 h-full transition-all"
                      style={{ width: `${maintW}%` }}
                      title={`Maintenance: ${z.maintenance}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 7-Day Daily Seat Utilization & Expiry Bar Chart */}
        <section className="xl:col-span-7 surface-card p-6 flex flex-col justify-between gap-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-[#101C3A]">
                7-Day Daily Seat Utilization &amp; Expiries
              </h2>
              <p className="text-xs text-[#68748A] mt-0.5">
                Daily reservations booked vs. automated absence expiries ({violationPolicy.timezone})
              </p>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-medium text-[#68748A]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#315EF2]" />
                Total Bookings
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                Expired
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 sm:gap-3 items-end h-48 pt-4 border-b border-slate-100 pb-3">
            {metrics.dailyUtilizationSeries.map((day) => {
              const totalPct = Math.round((day.totalReservations / maxDailyBookings) * 100);
              const expPct = Math.round((day.expired / maxDailyBookings) * 100);
              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center h-full justify-end gap-1.5"
                >
                  <div className="font-mono text-[11px] font-semibold text-[#101C3A] tabular-nums">
                    {day.totalReservations}
                  </div>
                  <div className="w-full max-w-[46px] flex items-end justify-center gap-1.5 h-32">
                    <div
                      className="w-1/2 rounded-t-md bg-[#315EF2] hover:bg-[#244AD4] transition-all"
                      style={{
                        height: `${Math.max(day.totalReservations > 0 ? 12 : 4, totalPct)}%`,
                      }}
                      title={`${day.date}: ${day.totalReservations} bookings`}
                    />
                    <div
                      className="w-1/2 rounded-t-md bg-amber-400 hover:bg-amber-500 transition-all"
                      style={{ height: `${Math.max(day.expired > 0 ? 12 : 4, expPct)}%` }}
                      title={`${day.date}: ${day.expired} expired`}
                    />
                  </div>
                  <div className="font-mono text-[10px] text-[#68748A] tabular-nums">
                    {day.date.slice(5)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Monthly Financial Summary Chart */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-[#101C3A]">
                Monthly Fines Generated vs. Collected (PKR)
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('financials')}
                className="text-xs font-semibold text-[#315EF2] hover:text-[#244AD4] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>Open Financial Ledger</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-3">
              {metrics.monthlyFinancialSeries.slice(-4).map((m) => (
                <div key={m.month} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-semibold text-[#101C3A]">{m.month}</span>
                    <span className="font-mono text-[11px] text-[#68748A] tabular-nums">
                      Gen: PKR {m.generatedPkr.toLocaleString()} · Paid: PKR{' '}
                      {m.collectedPkr.toLocaleString()} · Open: PKR{' '}
                      {m.outstandingPkr.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full transition-all"
                      style={{
                        width: `${Math.min(100, (m.collectedPkr / maxMonthlyFinance) * 100)}%`,
                      }}
                      title={`Collected: PKR ${m.collectedPkr.toLocaleString()}`}
                    />
                    <div
                      className="bg-rose-500 h-full transition-all"
                      style={{
                        width: `${Math.min(100, (m.outstandingPkr / maxMonthlyFinance) * 100)}%`,
                      }}
                      title={`Outstanding: PKR ${m.outstandingPkr.toLocaleString()}`}
                    />
                    <div
                      className="bg-slate-400 h-full transition-all"
                      style={{
                        width: `${Math.min(100, (m.waivedPkr / maxMonthlyFinance) * 100)}%`,
                      }}
                      title={`Waived: PKR ${m.waivedPkr.toLocaleString()}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Row 4: Active Away Countdowns + Recent Recorded Manual Interventions */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-5 surface-card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-bold text-[#101C3A]">
                Active Absence Countdowns
              </h2>
              <p className="text-xs text-[#68748A] mt-0.5">
                Students currently marked Temporarily Away by occupancy sensors
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('sensors')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EAF0FF] text-[#315EF2] hover:bg-[#DCE6FF] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Radio className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Sensors</span>
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {awaySeatsList.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#68748A]">
                No desks are currently in Temporarily Away status.
              </div>
            ) : (
              awaySeatsList.map((seat) => (
                <div
                  key={seat.id}
                  className="px-6 py-3.5 flex items-center justify-between gap-3 text-xs hover:bg-[#F5F7FC]/70 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#101C3A]">{seat.id}</span>
                      <SeatStatusLabel status={seat.status} />
                    </div>
                    <div className="text-[#68748A] mt-1">
                      {seat.occupantName ?? 'Assigned Student'} ({seat.occupantErp ?? '—'})
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-amber-700 font-semibold">
                      Away since {seat.awaySince ?? '—'}
                    </div>
                    <div className="text-[11px] text-[#68748A]">
                      Ends {seat.reservedUntil ?? '—'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="xl:col-span-7 surface-card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-bold text-[#101C3A]">
                Recent Manual Staff Interventions
              </h2>
              <p className="text-xs text-[#68748A] mt-0.5">
                Every manual seat release, maintenance override, violation correction, and standing
                update is permanently logged.
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-[#315EF2] bg-[#EAF0FF] px-2.5 py-1 rounded-lg tabular-nums shrink-0">
              {interventions.length} logged
            </span>
          </div>
          {/* Mobile Stacked Intervention Cards (< sm) */}
          <div className="sm:hidden divide-y divide-slate-100">
            {interventions.slice(0, 6).map((item) => (
              <div key={item.id} className="p-4 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#101C3A]">
                    {INTERVENTION_LABELS[item.category]}
                  </span>
                  <span className="font-mono font-bold text-[#315EF2] shrink-0">
                    {item.seatId ?? item.targetId}
                  </span>
                </div>
                <p className="text-[#172033] leading-relaxed">{item.reason}</p>
                <div className="flex items-center justify-between text-[11px] text-[#68748A]">
                  <span>{item.performedByName}</span>
                  <span className="font-mono tabular-nums">
                    {formatPktTimestamp(item.performedAt)}
                  </span>
                </div>
              </div>
            ))}
            {interventions.length === 0 && (
              <div className="py-8 px-4 text-center text-xs text-[#68748A]">
                No manual staff interventions recorded yet.
              </div>
            )}
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-[#F5F7FC] text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                  <th className="py-3 px-4">Time (PKT)</th>
                  <th className="py-3 px-4">Intervention</th>
                  <th className="py-3 px-4">Target</th>
                  <th className="py-3 px-4">Documented Reason</th>
                  <th className="py-3 px-4">Staff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {interventions.slice(0, 6).map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-[#F5F7FC]/70 transition-colors align-top"
                  >
                    <td className="py-3.5 px-4 font-mono text-[11px] text-[#68748A] whitespace-nowrap tabular-nums">
                      {formatPktTimestamp(item.performedAt)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-semibold text-[#101C3A]">
                        {INTERVENTION_LABELS[item.category]}
                      </div>
                      <div className="font-mono text-[11px] text-[#68748A]">
                        {item.previousState ? `${item.previousState} → ` : ''}
                        {item.newState}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A] whitespace-nowrap">
                      {item.seatId ?? item.targetId}
                    </td>
                    <td className="py-3.5 px-4 text-[#172033] max-w-xs">{item.reason}</td>
                    <td className="py-3.5 px-4 text-[#68748A] whitespace-nowrap">
                      {item.performedByName}
                    </td>
                  </tr>
                ))}
                {interventions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-[#68748A]">
                      No manual staff interventions recorded yet. Actions taken in Live Seat
                      Monitoring, Violations, or Student Management appear here immediately.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
