import React, { useMemo, useState } from 'react';
import {
  Activity,
  Armchair,
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck2,
  CalendarDays,
  Clock,
  Footprints,
  ShieldCheck,
  Sparkles,
  Timer,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { StudentProfile } from '../../types/ils';
import { PageHeader } from '../shared/DesignSystem';
import {
  addDays,
  AnalyticsDatePreset,
  computeStudentAnalytics,
  formatHours,
  formatLongDate,
  formatMinutesAsDuration,
  getDateRangeForPreset,
  getTodayIso,
} from '../../data/analyticsDemoData';
import {
  AnalyticsChartCard,
  AnalyticsDateFilterBar,
  AnalyticsKpiCard,
  AnalyticsTooltip,
  DemoDataBanner,
  VerificationStatusText,
} from './AnalyticsShared';

interface StudentAnalyticsViewProps {
  student: StudentProfile;
  verifiedReservationsCount?: number;
  activeSeatId?: string | null;
}

export const StudentAnalyticsView: React.FC<StudentAnalyticsViewProps> = ({
  student,
  verifiedReservationsCount,
  activeSeatId,
}) => {
  const todayIso = useMemo(() => getTodayIso(), []);
  const [preset, setPreset] = useState<AnalyticsDatePreset>('week');
  const [customStart, setCustomStart] = useState<string>(() => addDays(todayIso, -13));
  const [customEnd, setCustomEnd] = useState<string>(todayIso);

  const activeRange = useMemo(
    () => getDateRangeForPreset(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );

  const analytics = useMemo(
    () => computeStudentAnalytics(student, activeRange),
    [student, activeRange]
  );

  const {
    kpis,
    weeklyOccupancy,
    monthlyTrend,
    visitFrequency,
    usageDistribution,
    insights,
    recentSessions,
  } = analytics;

  const totalDistributionHours = useMemo(
    () => Number(usageDistribution.reduce((sum, item) => sum + item.hours, 0).toFixed(1)),
    [usageDistribution]
  );

  const heroHeadlineHours =
    preset === 'today'
      ? kpis.todayHours
      : preset === 'week'
        ? kpis.weeklyHours
        : preset === 'month'
          ? kpis.monthlyHours
          : kpis.rangeTotalHours;

  const heroHeadlineLabel =
    preset === 'today'
      ? "Today's Study Hours"
      : preset === 'week'
        ? 'This Week'
        : preset === 'month'
          ? 'This Month'
          : 'Selected Range';

  const heroDeltaPct = preset === 'month' ? insights.monthDeltaPct : insights.weekDeltaPct;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="hidden lg:block">
        <PageHeader
          title="My Study Analytics"
          description="Understand your library usage and study-space habits."
          action={
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200/90 text-xs text-[#68748A]">
              <span className="font-semibold text-[#101C3A]">{student.name}</span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span className="font-mono font-semibold text-[#315EF2] tabular-nums">
                ERP {student.erpId}
              </span>
            </div>
          }
        />
      </div>

      {/* Mobile Compact Title + Summary Navy Hero Card (Reference-Inspired) */}
      <section className="rounded-2xl bg-[#101C3A] text-white p-5 sm:p-6 shadow-md overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-blue-200/90">
              <span className="font-semibold">{heroHeadlineLabel}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-amber-200">
                DEMO DATA
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2.5 flex-wrap">
              <span className="font-display text-3xl sm:text-4xl font-bold tracking-tight tabular-nums">
                {formatHours(heroHeadlineHours)}
              </span>
              <span
                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-semibold tabular-nums ${
                  heroDeltaPct >= 0
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/20 text-amber-200'
                }`}
              >
                {heroDeltaPct >= 0 ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                )}
                {heroDeltaPct >= 0 ? '+' : ''}
                {heroDeltaPct}%
              </span>
            </div>
            <p className="mt-1 text-xs text-blue-200/80">
              Understand your library usage and study-space habits.
            </p>
          </div>

          <div className="w-full sm:w-64 h-[78px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyOccupancy} margin={{ top: 6, right: 6, left: 6, bottom: 2 }}>
                <Line
                  type="monotone"
                  dataKey="hours"
                  stroke="#38BDF8"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#FFFFFF', stroke: '#315EF2', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <DemoDataBanner scopeLabel="Personal Study Analytics · Simulated Sample Dataset" />

      {/* Explicit Distinction: Verified Live Records vs Demonstration Analytics */}
      <section
        aria-label="Data source verification"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        <div className="surface-card p-3.5 sm:p-4 flex items-center justify-between gap-3 border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-9 w-9 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Verified Live Record
              </div>
              <div className="text-xs font-semibold text-[#101C3A] truncate">
                {activeSeatId
                  ? `Active now at ${activeSeatId}`
                  : 'No active desk session right now'}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-base font-bold text-[#101C3A] tabular-nums">
              {verifiedReservationsCount ?? student.totalSessions}
            </div>
            <div className="text-[10px] text-[#68748A]">DB sessions</div>
          </div>
        </div>

        <div className="surface-card p-3.5 sm:p-4 flex items-center justify-between gap-3 border-l-4 border-l-amber-400">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              Demonstration Analytics Below
            </div>
            <div className="text-xs text-[#68748A] leading-snug mt-0.5">
              Charts and hour breakdowns below use clearly labelled sample demo figures.
            </div>
          </div>
          <span className="font-mono text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 shrink-0">
            DEMO
          </span>
        </div>
      </section>

      <AnalyticsDateFilterBar
        preset={preset}
        customStart={customStart}
        customEnd={customEnd}
        activeRange={activeRange}
        onSelectPreset={setPreset}
        onChangeCustomStart={setCustomStart}
        onChangeCustomEnd={setCustomEnd}
      />

      {/* 6 Main Statistic Cards — 2-col crisp grid on mobile, 3-col on desktop */}
      <section aria-label="Main Study Statistics">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <AnalyticsKpiCard
            label="Today's Confirmed Occupancy"
            value={formatHours(kpis.todayHours)}
            subtext="Sample demo figure"
            icon={<Clock className="h-4 w-4" />}
            accent="blue"
          />

          <AnalyticsKpiCard
            label="Weekly Occupancy"
            value={formatHours(kpis.weeklyHours)}
            subtext={`Prev 7d: ${formatHours(insights.prevWeekHours)}`}
            icon={<CalendarDays className="h-4 w-4" />}
            accent="teal"
            delta={{
              value: `${insights.weekDeltaPct >= 0 ? '+' : ''}${insights.weekDeltaPct}%`,
              positive: insights.weekDeltaPct >= 0,
            }}
          />

          <AnalyticsKpiCard
            label="Monthly Occupancy"
            value={formatHours(kpis.monthlyHours)}
            subtext={`Prev 30d: ${formatHours(insights.prevMonthHours)}`}
            icon={<CalendarCheck2 className="h-4 w-4" />}
            accent="navy"
            delta={{
              value: `${insights.monthDeltaPct >= 0 ? '+' : ''}${insights.monthDeltaPct}%`,
              positive: insights.monthDeltaPct >= 0,
            }}
          />

          <AnalyticsKpiCard
            label="Total Visits"
            value={String(kpis.totalVisits)}
            subtext={activeRange.label}
            icon={<Footprints className="h-4 w-4" />}
            accent="emerald"
          />

          <AnalyticsKpiCard
            label="Avg Session"
            value={formatMinutesAsDuration(kpis.avgSessionMinutes)}
            subtext={`${formatHours(kpis.rangeTotalHours)} in range`}
            icon={<Timer className="h-4 w-4" />}
            accent="blue"
          />

          <AnalyticsKpiCard
            label="Most Used ILS"
            value={kpis.mostFrequentSeat}
            subtext={`${kpis.mostFrequentSeatVisits} visits · ${formatHours(insights.mostFrequentSeatHours)}`}
            icon={<Armchair className="h-4 w-4" />}
            accent="teal"
          />
        </div>
      </section>

      {/* 4 Interactive Charts — Stacked cleanly on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* 1. Weekly Occupancy Chart (Mon–Sun Bar Chart) */}
        <AnalyticsChartCard
          title="Weekly Occupancy Chart"
          subtitle={
            preset === 'today'
              ? 'Monday to Sunday confirmed study hours (7-day context).'
              : `Monday to Sunday confirmed study hours across ${activeRange.label}.`
          }
          rightMeta={
            <div className="sm:text-right">
              <div className="text-[11px] font-medium text-[#68748A]">Peak Day</div>
              <div className="font-mono text-xs font-bold text-[#101C3A] tabular-nums">
                {insights.mostActiveDay} · {formatHours(insights.mostActiveDayHours)}
              </div>
            </div>
          }
        >
          <div className="h-[220px] sm:h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyOccupancy} margin={{ top: 8, right: 6, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#68748A', fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#68748A', fontSize: 11 }}
                  unit="h"
                />
                <Tooltip
                  cursor={{ fill: 'rgba(49, 94, 242, 0.06)' }}
                  content={
                    <AnalyticsTooltip
                      unitFormatter={(val) => `${Number(val).toFixed(1)} hrs`}
                    />
                  }
                />
                <Bar
                  dataKey="hours"
                  name="Confirmed Hours"
                  fill="#315EF2"
                  radius={[7, 7, 0, 0]}
                  maxBarSize={34}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsChartCard>

        {/* 2. Monthly Occupancy Trend (Line Chart) */}
        <AnalyticsChartCard
          title="Monthly Occupancy Trend"
          subtitle="Daily confirmed study hours trajectory across the active window."
          rightMeta={
            <div className="sm:text-right">
              <div className="text-[11px] font-medium text-[#68748A]">Daily Average</div>
              <div className="font-mono text-xs font-bold text-[#0F8B7C] tabular-nums">
                {formatHours(insights.averageDailyHours)} / day
              </div>
            </div>
          }
        >
          <div className="h-[220px] sm:h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={28}
                  tick={{ fill: '#68748A', fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#68748A', fontSize: 11 }}
                  unit="h"
                />
                <Tooltip
                  content={
                    <AnalyticsTooltip
                      unitFormatter={(val) => `${Number(val).toFixed(1)} hrs`}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="hours"
                  name="Occupancy Hours"
                  stroke="#19B6A4"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: '#FFFFFF', stroke: '#19B6A4', strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: '#315EF2', stroke: '#FFFFFF', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsChartCard>

        {/* 3. Visit Frequency by Day (Bar Chart) */}
        <AnalyticsChartCard
          title="Visit Frequency"
          subtitle="Confirmed IBA Digital Library study visits grouped by day of week."
          rightMeta={
            <div className="sm:text-right">
              <div className="text-[11px] font-medium text-[#68748A]">Range Total</div>
              <div className="font-mono text-xs font-bold text-[#101C3A] tabular-nums">
                {kpis.totalVisits} visits
              </div>
            </div>
          }
        >
          <div className="h-[220px] sm:h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={visitFrequency} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#68748A', fontSize: 11 }}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#68748A', fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(16, 28, 58, 0.05)' }}
                  content={
                    <AnalyticsTooltip
                      unitFormatter={(val) => `${val} ${Number(val) === 1 ? 'visit' : 'visits'}`}
                    />
                  }
                />
                <Bar
                  dataKey="visits"
                  name="Library Visits"
                  fill="#101C3A"
                  radius={[7, 7, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsChartCard>

        {/* 4. Usage Distribution by Time Period (Donut Chart) */}
        <AnalyticsChartCard
          title="Usage Distribution"
          subtitle="Occupancy share across Morning, Afternoon, and Evening study windows."
          rightMeta={
            <div className="sm:text-right">
              <div className="text-[11px] font-medium text-[#68748A]">Confirmed Time</div>
              <div className="font-mono text-xs font-bold text-[#315EF2] tabular-nums">
                {formatHours(totalDistributionHours)}
              </div>
            </div>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4">
            <div className="sm:col-span-6 h-[200px] sm:h-[230px] w-full">
              {totalDistributionHours > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={usageDistribution}
                      dataKey="hours"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={82}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {usageDistribution.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={
                        <AnalyticsTooltip
                          unitFormatter={(val) => `${Number(val).toFixed(1)} hrs`}
                        />
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-[#68748A]">
                  No sessions in selected range.
                </div>
              )}
            </div>

            <div className="sm:col-span-6 space-y-2.5">
              {usageDistribution.map((slice) => (
                <div
                  key={slice.name}
                  className="rounded-xl border border-slate-200/80 bg-[#F5F7FC]/70 px-3.5 py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: slice.color }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#101C3A]">{slice.name}</div>
                      <div className="font-mono text-[11px] text-[#68748A] tabular-nums">
                        {slice.window}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm font-bold text-[#101C3A] tabular-nums">
                      {slice.percentage}%
                    </div>
                    <div className="font-mono text-[11px] text-[#68748A] tabular-nums">
                      {formatHours(slice.hours)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AnalyticsChartCard>
      </div>

      {/* Additional Insights Panel */}
      <section className="surface-card p-4 sm:p-6 space-y-4" aria-label="Study Habit Insights">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-8 w-8 rounded-xl bg-[#EAF0FF] text-[#315EF2] flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-[15px] sm:text-base font-bold text-[#101C3A] truncate">
                Additional Study Insights
              </h2>
              <p className="text-xs text-[#68748A] truncate">
                Comparative benchmarks from sample history
              </p>
            </div>
          </div>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded shrink-0">
            Demo
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="rounded-xl border border-slate-200/80 bg-[#F5F7FC]/70 p-3.5">
            <div className="text-[11px] font-semibold text-[#68748A]">Most Active Day</div>
            <div className="mt-1 font-display text-base sm:text-lg font-bold text-[#101C3A]">
              {insights.mostActiveDay}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-[#315EF2] tabular-nums">
              {formatHours(insights.mostActiveDayHours)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-[#F5F7FC]/70 p-3.5">
            <div className="text-[11px] font-semibold text-[#68748A]">Top ILS Seat</div>
            <div className="mt-1 font-mono text-base sm:text-lg font-bold text-[#101C3A] tabular-nums">
              {insights.mostFrequentSeat}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-[#0F8B7C] tabular-nums">
              {formatHours(insights.mostFrequentSeatHours)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-[#F5F7FC]/70 p-3.5">
            <div className="text-[11px] font-semibold text-[#68748A]">Daily Average</div>
            <div className="mt-1 font-mono text-base sm:text-lg font-bold text-[#101C3A] tabular-nums">
              {formatHours(insights.averageDailyHours)}
            </div>
            <div className="mt-0.5 text-[11px] text-[#68748A]">
              {activeRange.daysCount}d window
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-[#F5F7FC]/70 p-3.5">
            <div className="text-[11px] font-semibold text-[#68748A]">vs. Prev Week</div>
            <div
              className={`mt-1 inline-flex items-center gap-0.5 font-mono text-base sm:text-lg font-bold tabular-nums ${
                insights.weekDeltaHours >= 0 ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {insights.weekDeltaHours >= 0 ? (
                <ArrowUpRight className="h-4 w-4 shrink-0" />
              ) : (
                <ArrowDownRight className="h-4 w-4 shrink-0" />
              )}
              <span>
                {insights.weekDeltaPct >= 0 ? '+' : ''}
                {insights.weekDeltaPct}%
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-[#68748A] tabular-nums">
              {insights.weekDeltaHours >= 0 ? '+' : ''}
              {insights.weekDeltaHours.toFixed(1)} hrs
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200/80 bg-[#F5F7FC]/70 p-3.5">
            <div className="text-[11px] font-semibold text-[#68748A]">vs. Prev Month</div>
            <div
              className={`mt-1 inline-flex items-center gap-0.5 font-mono text-base sm:text-lg font-bold tabular-nums ${
                insights.monthDeltaHours >= 0 ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {insights.monthDeltaHours >= 0 ? (
                <ArrowUpRight className="h-4 w-4 shrink-0" />
              ) : (
                <ArrowDownRight className="h-4 w-4 shrink-0" />
              )}
              <span>
                {insights.monthDeltaPct >= 0 ? '+' : ''}
                {insights.monthDeltaPct}%
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-[#68748A] tabular-nums">
              {insights.monthDeltaHours >= 0 ? '+' : ''}
              {insights.monthDeltaHours.toFixed(1)} hrs vs 30d
            </div>
          </div>
        </div>
      </section>

      {/* Recent Occupancy Sessions — Mobile Stacked Cards + Desktop Table */}
      <section className="surface-card overflow-hidden" aria-label="Recent Occupancy Sessions">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Activity className="h-4.5 w-4.5 text-[#315EF2] shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="font-display text-[15px] sm:text-base font-bold text-[#101C3A] truncate">
                Recent Occupancy Sessions
              </h2>
              <p className="text-xs text-[#68748A] truncate">
                Sample confirmed presence sessions (DEMO DATA)
              </p>
            </div>
          </div>
          <span className="font-mono text-xs text-[#68748A] tabular-nums shrink-0">
            {recentSessions.length}
          </span>
        </div>

        {/* Mobile Card Stack (< sm) — Zero Horizontal Scrolling */}
        <div className="sm:hidden divide-y divide-slate-100">
          {recentSessions.map((session) => (
            <div key={session.id} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-[#315EF2] tabular-nums">
                    {session.seatId}
                  </span>
                  <span className="text-xs text-[#68748A]">· {formatLongDate(session.date)}</span>
                </div>
                <div className="font-mono text-xs text-[#172033] tabular-nums">
                  {session.startTime} – {session.endTime}
                </div>
                <div className="pt-0.5">
                  <VerificationStatusText status={session.verificationStatus} />
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-sm font-bold text-[#101C3A] tabular-nums">
                  {formatMinutesAsDuration(session.confirmedMinutes)}
                </div>
                <div className="text-[11px] text-[#68748A]">confirmed</div>
              </div>
            </div>
          ))}
          {recentSessions.length === 0 && (
            <div className="py-10 px-4 text-center text-xs text-[#68748A]">
              No sample occupancy sessions found for the selected custom date range.
            </div>
          )}
        </div>

        {/* Tablet & Desktop Table (sm+) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-[#F5F7FC] text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                <th className="py-3.5 px-5 whitespace-nowrap">Date</th>
                <th className="py-3.5 px-4 whitespace-nowrap">ILS Number</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Start Time</th>
                <th className="py-3.5 px-4 whitespace-nowrap">End Time</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-right">
                  Confirmed Duration
                </th>
                <th className="py-3.5 px-5 whitespace-nowrap">Verification Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {recentSessions.map((session) => (
                <tr key={session.id} className="hover:bg-[#F5F7FC]/75 transition-colors">
                  <td className="py-3.5 px-5 font-medium text-[#101C3A] whitespace-nowrap">
                    {formatLongDate(session.date)}
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-[#315EF2] whitespace-nowrap tabular-nums">
                    {session.seatId}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#172033] whitespace-nowrap tabular-nums">
                    {session.startTime}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#172033] whitespace-nowrap tabular-nums">
                    {session.endTime}
                  </td>
                  <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A] text-right whitespace-nowrap tabular-nums">
                    {formatMinutesAsDuration(session.confirmedMinutes)}
                  </td>
                  <td className="py-3.5 px-5 whitespace-nowrap">
                    <VerificationStatusText status={session.verificationStatus} />
                  </td>
                </tr>
              ))}
              {recentSessions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-xs text-[#68748A]">
                    No sample occupancy sessions found for the selected custom date range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
