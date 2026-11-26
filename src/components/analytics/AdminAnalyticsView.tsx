import React, { useMemo, useState } from 'react';
import {
  Armchair,
  BarChart3,
  Clock,
  Footprints,
  Gauge,
  LayoutGrid,
  Search,
  Timer,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
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
  computeAdminAnalytics,
  computeIndividualStudentReport,
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

interface AdminAnalyticsViewProps {
  students: StudentProfile[];
  totalSeats: number;
}

export const AdminAnalyticsView: React.FC<AdminAnalyticsViewProps> = ({
  students,
  totalSeats,
}) => {
  const todayIso = useMemo(() => getTodayIso(), []);
  const [preset, setPreset] = useState<AnalyticsDatePreset>('month');
  const [customStart, setCustomStart] = useState<string>(() => addDays(todayIso, -13));
  const [customEnd, setCustomEnd] = useState<string>(todayIso);
  const [studentQuery, setStudentQuery] = useState('');
  const [selectedErp, setSelectedErp] = useState<string>('');

  const activeRange = useMemo(
    () => getDateRangeForPreset(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );

  const analytics = useMemo(
    () => computeAdminAnalytics(students, totalSeats, activeRange),
    [students, totalSeats, activeRange]
  );

  const {
    overview,
    dailyLibraryOccupancy,
    weeklyOccupancyTrend,
    monthlyOccupancyTrend,
    mostUsedSeats,
    peakUsageHours,
    studentVisitTrends,
    directory,
  } = analytics;

  const filteredDirectory = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return directory;
    return directory.filter(
      (st) =>
        st.erpId.toLowerCase().includes(q) ||
        st.name.toLowerCase().includes(q) ||
        st.program.toLowerCase().includes(q)
    );
  }, [directory, studentQuery]);

  const activeStudent = useMemo(() => {
    if (selectedErp) {
      const found = directory.find((s) => s.erpId === selectedErp);
      if (found) return found;
    }
    return filteredDirectory[0] ?? directory[0] ?? null;
  }, [directory, filteredDirectory, selectedErp]);

  const studentReport = useMemo(
    () => (activeStudent ? computeIndividualStudentReport(activeStudent, activeRange) : null),
    [activeStudent, activeRange]
  );

  const peakHourEntry = useMemo(() => {
    return peakUsageHours.reduce(
      (best, cur) => (cur.avgActiveSeats > best.avgActiveSeats ? cur : best),
      peakUsageHours[0] ?? { hourLabel: '2 PM', avgActiveSeats: 0, confirmedHours: 0 }
    );
  }, [peakUsageHours]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="hidden lg:block">
        <PageHeader
          title="Library Analytics"
          description="Institutional occupancy intelligence, ILS seat utilization patterns, peak study hours, and individual student occupancy reports."
        />
      </div>

      <DemoDataBanner scopeLabel="Administrator Library Analytics · Simulated Institutional Dataset" />

      <AnalyticsDateFilterBar
        preset={preset}
        customStart={customStart}
        customEnd={customEnd}
        activeRange={activeRange}
        onSelectPreset={setPreset}
        onChangeCustomStart={setCustomStart}
        onChangeCustomEnd={setCustomEnd}
      />

      {/* 6 Overview Cards — Clean 2-col grid on mobile, 3-col on desktop */}
      <section aria-label="Library Analytics Overview">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <AnalyticsKpiCard
            label="Total Students"
            value={overview.totalStudents.toLocaleString()}
            subtext={`${directory.length} profiles searchable`}
            icon={<Users className="h-4 w-4" />}
            accent="navy"
          />

          <AnalyticsKpiCard
            label="Total ILS Seats"
            value={String(overview.totalIlsSeats).padStart(2, '0')}
            subtext="Zones A, B & C"
            icon={<LayoutGrid className="h-4 w-4" />}
            accent="blue"
          />

          <AnalyticsKpiCard
            label="Confirmed Hours"
            value={formatHours(overview.totalConfirmedHours)}
            subtext={activeRange.label}
            icon={<Clock className="h-4 w-4" />}
            accent="teal"
            delta={{
              value: `${overview.hoursDeltaPct >= 0 ? '+' : ''}${overview.hoursDeltaPct}%`,
              positive: overview.hoursDeltaPct >= 0,
            }}
          />

          <AnalyticsKpiCard
            label="Total Visits"
            value={overview.totalVisits.toLocaleString()}
            subtext="Verified sessions"
            icon={<Footprints className="h-4 w-4" />}
            accent="emerald"
            delta={{
              value: `${overview.visitsDeltaPct >= 0 ? '+' : ''}${overview.visitsDeltaPct}%`,
              positive: overview.visitsDeltaPct >= 0,
            }}
          />

          <AnalyticsKpiCard
            label="Avg Daily Occupancy"
            value={formatHours(overview.averageDailyHours)}
            subtext="Mean hrs / day"
            icon={<BarChart3 className="h-4 w-4" />}
            accent="blue"
          />

          <AnalyticsKpiCard
            label="Seat Utilization"
            value={`${overview.overallUtilizationPct}%`}
            subtext={`${overview.totalIlsSeats} seats × 13h/day`}
            icon={<Gauge className="h-4 w-4" />}
            accent={overview.overallUtilizationPct >= 65 ? 'emerald' : 'amber'}
          />
        </div>
      </section>

      {/* 6 Library Usage Charts — Stacked cleanly on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <AnalyticsChartCard
          title="Daily Library Occupancy"
          subtitle="Total confirmed student occupancy hours per day across all 30 ILS spaces."
          rightMeta={
            <div className="sm:text-right">
              <div className="text-[11px] font-medium text-[#68748A]">Daily Mean</div>
              <div className="font-mono text-xs font-bold text-[#315EF2] tabular-nums">
                {formatHours(overview.averageDailyHours)}
              </div>
            </div>
          }
        >
          <div className="h-[220px] sm:h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={dailyLibraryOccupancy}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="adminDailyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#315EF2" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#315EF2" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={26}
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
                <Area
                  type="monotone"
                  dataKey="hours"
                  name="Confirmed Hours"
                  stroke="#315EF2"
                  strokeWidth={2.5}
                  fill="url(#adminDailyFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard
          title="Weekly Occupancy Trend"
          subtitle="Rolling 8-week confirmed study hours across IBA Digital Library."
        >
          <div className="h-[220px] sm:h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={weeklyOccupancyTrend}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="week"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                  tick={{ fill: '#68748A', fontSize: 10 }}
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
                      unitFormatter={(val) => `${Number(val).toLocaleString()} hrs`}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="hours"
                  name="Weekly Hours"
                  stroke="#19B6A4"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#FFFFFF', stroke: '#19B6A4', strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: '#101C3A', stroke: '#FFFFFF', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard
          title="Monthly Occupancy Trend"
          subtitle="Multi-month total confirmed hours across the IBA Digital Library."
        >
          <div className="h-[220px] sm:h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyOccupancyTrend}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="month"
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
                      unitFormatter={(val) => `${Number(val).toLocaleString()} hrs`}
                    />
                  }
                />
                <Bar
                  dataKey="hours"
                  name="Confirmed Hours"
                  fill="#101C3A"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={44}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard
          title="Most-Used ILS Seats"
          subtitle="Top 10 Individual Learning Spaces ranked by confirmed occupancy hours."
          rightMeta={
            mostUsedSeats[0] && (
              <div className="sm:text-right">
                <div className="text-[11px] font-medium text-[#68748A]">Top Space</div>
                <div className="font-mono text-xs font-bold text-[#101C3A] tabular-nums">
                  {mostUsedSeats[0].seatId} · {formatHours(mostUsedSeats[0].hours)}
                </div>
              </div>
            )
          }
        >
          <div className="h-[240px] sm:h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={mostUsedSeats}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#68748A', fontSize: 11 }}
                  unit="h"
                />
                <YAxis
                  type="category"
                  dataKey="seatId"
                  width={54}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#101C3A', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(25, 182, 164, 0.08)' }}
                  content={
                    <AnalyticsTooltip
                      unitFormatter={(val) => `${Number(val).toFixed(1)} hrs`}
                    />
                  }
                />
                <Bar
                  dataKey="hours"
                  name="Occupancy Hours"
                  fill="#315EF2"
                  radius={[0, 6, 6, 0]}
                  barSize={15}
                >
                  {mostUsedSeats.map((entry, idx) => (
                    <Cell
                      key={entry.seatId}
                      fill={idx < 3 ? '#315EF2' : idx < 6 ? '#19B6A4' : '#64748B'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard
          title="Peak Library Usage Hours"
          subtitle="Average concurrent occupied ILS spaces by hour of day (08:00 – 21:00)."
          rightMeta={
            <div className="sm:text-right">
              <div className="text-[11px] font-medium text-[#68748A]">Busiest Hour</div>
              <div className="font-mono text-xs font-bold text-amber-700 tabular-nums">
                {peakHourEntry.hourLabel} · {peakHourEntry.avgActiveSeats} avg seats
              </div>
            </div>
          }
        >
          <div className="h-[220px] sm:h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={peakUsageHours}
                margin={{ top: 8, right: 6, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="hourLabel"
                  axisLine={false}
                  tickLine={false}
                  interval={2}
                  tick={{ fill: '#68748A', fontSize: 10 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#68748A', fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(49, 94, 242, 0.06)' }}
                  content={
                    <AnalyticsTooltip
                      unitFormatter={(val) => `${Number(val).toFixed(1)} avg seats`}
                    />
                  }
                />
                <Bar
                  dataKey="avgActiveSeats"
                  name="Avg Active Seats"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={24}
                >
                  {peakUsageHours.map((slot) => (
                    <Cell key={slot.hour} fill={slot.isPeak ? '#315EF2' : '#94A3B8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsChartCard>

        <AnalyticsChartCard
          title="Student Visit Trends"
          subtitle="Daily confirmed visits and distinct students utilizing ILS spaces."
        >
          <div className="h-[220px] sm:h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={studentVisitTrends}
                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={26}
                  tick={{ fill: '#68748A', fontSize: 11 }}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#68748A', fontSize: 11 }}
                />
                <Tooltip
                  content={
                    <AnalyticsTooltip
                      unitFormatter={(val, name) =>
                        name.includes('Students') ? `${val} students` : `${val} visits`
                      }
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="visits"
                  name="Total Visits"
                  stroke="#315EF2"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#315EF2' }}
                />
                <Line
                  type="monotone"
                  dataKey="uniqueStudents"
                  name="Unique Students"
                  stroke="#19B6A4"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 4, fill: '#19B6A4' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsChartCard>
      </div>

      {/* Individual Student Reports Section */}
      <section className="surface-card overflow-hidden" aria-label="Individual Student Reports">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3.5">
          <div className="flex items-start sm:items-center gap-3">
            <span className="h-9 w-9 rounded-xl bg-[#EAF0FF] text-[#315EF2] flex items-center justify-center shrink-0">
              <UserCheck className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-[15px] sm:text-base font-bold text-[#101C3A]">
                  Individual Student Reports
                </h2>
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded">
                  Demo
                </span>
              </div>
              <p className="text-xs text-[#68748A] mt-0.5">
                Search by Student ID (ERP) or name to inspect personal occupancy history.
              </p>
            </div>
          </div>

          <div className="relative w-full md:w-80">
            <Search
              className="h-4 w-4 text-[#68748A] absolute left-3.5 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="text"
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              placeholder="Search Student ID (ERP) or name..."
              aria-label="Search student reports by Student ID or name"
              className="w-full min-h-[44px] pl-9 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-slate-100">
          {/* Roster Picker */}
          <div className="xl:col-span-4 p-3.5 sm:p-4 space-y-2 max-h-[260px] xl:max-h-[540px] overflow-y-auto bg-[#F5F7FC]/45">
            <div className="px-1 pb-1 flex items-center justify-between text-[11px] font-semibold text-[#68748A]">
              <span>Matching Students</span>
              <span className="font-mono tabular-nums">{filteredDirectory.length}</span>
            </div>

            {filteredDirectory.map((st) => {
              const isSelected = activeStudent?.erpId === st.erpId;
              return (
                <button
                  key={st.erpId}
                  type="button"
                  onClick={() => setSelectedErp(st.erpId)}
                  className={`w-full min-h-[52px] text-left px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#101C3A] border-[#101C3A] text-white shadow-sm'
                      : 'bg-white border-slate-200/80 text-[#101C3A] hover:border-[#315EF2]/50 hover:bg-[#EAF0FF]/35'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold truncate">{st.name}</span>
                    <span
                      className={`font-mono text-[11px] font-semibold tabular-nums shrink-0 ${
                        isSelected ? 'text-[#2DD4BF]' : 'text-[#315EF2]'
                      }`}
                    >
                      ERP {st.erpId}
                    </span>
                  </div>
                  <div
                    className={`mt-0.5 text-[11px] truncate ${
                      isSelected ? 'text-blue-200/90' : 'text-[#68748A]'
                    }`}
                  >
                    {st.program} · {st.batch}
                  </div>
                </button>
              );
            })}

            {filteredDirectory.length === 0 && (
              <div className="py-8 text-center text-xs text-[#68748A]">
                No students match &ldquo;{studentQuery}&rdquo;.
              </div>
            )}
          </div>

          {/* Individual Student Report Detail */}
          <div className="xl:col-span-8 p-4 sm:p-6 space-y-5">
            {studentReport ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base sm:text-lg font-bold text-[#101C3A]">
                        {studentReport.student.name}
                      </h3>
                      <span className="font-mono text-xs font-semibold text-[#315EF2] tabular-nums">
                        ERP {studentReport.student.erpId}
                      </span>
                    </div>
                    <p className="text-xs text-[#68748A] mt-0.5">
                      {studentReport.student.program} · {studentReport.student.batch}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-[11px] font-medium text-[#68748A]">Verification Rate</div>
                    <div className="font-mono text-sm font-bold text-emerald-700 tabular-nums">
                      {studentReport.verifiedRatePct}% verified
                    </div>
                  </div>
                </div>

                {/* 5 Summary Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
                  <div className="rounded-xl border border-slate-200/80 bg-[#F5F7FC]/75 p-3">
                    <div className="text-[11px] font-medium text-[#68748A]">Weekly Hours</div>
                    <div className="mt-1 font-mono text-sm sm:text-base font-bold text-[#101C3A] tabular-nums">
                      {formatHours(studentReport.weeklyHours)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-[#F5F7FC]/75 p-3">
                    <div className="text-[11px] font-medium text-[#68748A]">Monthly Hours</div>
                    <div className="mt-1 font-mono text-sm sm:text-base font-bold text-[#315EF2] tabular-nums">
                      {formatHours(studentReport.monthlyHours)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-[#F5F7FC]/75 p-3">
                    <div className="text-[11px] font-medium text-[#68748A]">Total Visits</div>
                    <div className="mt-1 font-mono text-sm sm:text-base font-bold text-[#101C3A] tabular-nums">
                      {studentReport.totalVisits}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-[#F5F7FC]/75 p-3">
                    <div className="inline-flex items-center gap-1 text-[11px] font-medium text-[#68748A]">
                      <Timer className="h-3 w-3 shrink-0" />
                      <span>Avg Session</span>
                    </div>
                    <div className="mt-1 font-mono text-sm sm:text-base font-bold text-[#101C3A] tabular-nums">
                      {formatMinutesAsDuration(studentReport.avgSessionMinutes)}
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200/80 bg-[#F5F7FC]/75 p-3">
                    <div className="inline-flex items-center gap-1 text-[11px] font-medium text-[#68748A]">
                      <Armchair className="h-3 w-3 shrink-0" />
                      <span>Most-Used Seat</span>
                    </div>
                    <div className="mt-1 font-mono text-sm sm:text-base font-bold text-[#0F8B7C] tabular-nums">
                      {studentReport.mostUsedSeat}
                    </div>
                  </div>
                </div>

                {/* Historical Sessions — Mobile Cards + Desktop Table */}
                <div className="rounded-xl border border-slate-200/80 overflow-hidden">
                  <div className="px-4 py-3 bg-[#F5F7FC] border-b border-slate-200/70 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#101C3A]">
                      Historical Sessions (DEMO DATA)
                    </span>
                    <span className="font-mono text-[11px] text-[#68748A] tabular-nums">
                      {studentReport.sessions.length} records
                    </span>
                  </div>

                  {/* Mobile Card Stack (< sm) */}
                  <div className="sm:hidden divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
                    {studentReport.sessions.map((session) => (
                      <div key={session.id} className="p-3.5 flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#315EF2] tabular-nums">
                              {session.seatId}
                            </span>
                            <span className="text-[11px] text-[#68748A]">
                              · {formatLongDate(session.date)}
                            </span>
                          </div>
                          <div className="font-mono text-[11px] text-[#172033] tabular-nums">
                            {session.startTime} – {session.endTime}
                          </div>
                          <VerificationStatusText status={session.verificationStatus} />
                        </div>
                        <span className="font-mono text-xs font-bold text-[#101C3A] tabular-nums shrink-0">
                          {formatMinutesAsDuration(session.confirmedMinutes)}
                        </span>
                      </div>
                    ))}
                    {studentReport.sessions.length === 0 && (
                      <div className="py-8 text-center text-xs text-[#68748A]">
                        No sample sessions in {activeRange.label}.
                      </div>
                    )}
                  </div>

                  {/* Desktop Table (sm+) */}
                  <div className="hidden sm:block overflow-x-auto max-h-[300px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-white z-10">
                        <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                          <th className="py-2.5 px-4 whitespace-nowrap">Date</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">ILS</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">Start – End</th>
                          <th className="py-2.5 px-3 whitespace-nowrap text-right">Duration</th>
                          <th className="py-2.5 px-4 whitespace-nowrap">Verification</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {studentReport.sessions.map((session) => (
                          <tr
                            key={session.id}
                            className="hover:bg-[#F5F7FC]/70 transition-colors"
                          >
                            <td className="py-2.5 px-4 font-medium text-[#101C3A] whitespace-nowrap">
                              {formatLongDate(session.date)}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-[#315EF2] whitespace-nowrap tabular-nums">
                              {session.seatId}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[#68748A] whitespace-nowrap tabular-nums">
                              {session.startTime} – {session.endTime}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-[#101C3A] text-right whitespace-nowrap tabular-nums">
                              {formatMinutesAsDuration(session.confirmedMinutes)}
                            </td>
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              <VerificationStatusText status={session.verificationStatus} />
                            </td>
                          </tr>
                        ))}
                        {studentReport.sessions.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-xs text-[#68748A]">
                              No sample occupancy sessions logged for this student within{' '}
                              {activeRange.label}.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-xs text-[#68748A]">
                Select a student from the list to view their individual occupancy report.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
