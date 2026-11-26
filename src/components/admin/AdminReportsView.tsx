import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CalendarClock,
  CreditCard,
  Download,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { AdminReportsData, AdminReportType } from '../../types/ils';
import { PageHeader } from '../shared/DesignSystem';

interface AdminReportsViewProps {
  onFetchReports: (month?: string) => Promise<AdminReportsData | null>;
  onExportReport: (
    type: AdminReportType,
    month?: string
  ) => Promise<{ ok: boolean; message: string }>;
}

const REPORT_TABS: Array<{
  id: AdminReportType;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'daily-utilization', label: 'Daily Seat Utilization', icon: BarChart3 },
  { id: 'monthly-utilization', label: 'Monthly Seat Utilization', icon: Calendar },
  { id: 'student-reservations', label: 'Student Reservations', icon: CalendarClock },
  { id: 'monthly-violations', label: 'Monthly Violations', icon: AlertTriangle },
  { id: 'monthly-fines', label: 'Monthly Fines', icon: CreditCard },
  { id: 'outstanding-balances', label: 'Outstanding Balances', icon: Wallet },
];

export const AdminReportsView: React.FC<AdminReportsViewProps> = ({
  onFetchReports,
  onExportReport,
}) => {
  const [activeReport, setActiveReport] = useState<AdminReportType>('daily-utilization');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [reports, setReports] = useState<AdminReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const loadReports = useCallback(
    async (month: string) => {
      setLoading(true);
      try {
        const data = await onFetchReports(month);
        if (data) setReports(data);
      } finally {
        setLoading(false);
      }
    },
    [onFetchReports]
  );

  useEffect(() => {
    void loadReports(selectedMonth);
  }, [loadReports, selectedMonth]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await onExportReport(activeReport, selectedMonth);
      setFeedback(res);
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Institutional Analytics"
        description="Generate and export live database reports covering daily and monthly seat utilization, student reservation histories, monthly violations, monthly fines, and outstanding PKR balances."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              aria-label="Filter report month"
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-semibold text-[#101C3A] focus:border-[#315EF2]"
            >
              <option value="ALL">All Months</option>
              {(reports?.availableMonths ?? []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void loadReports(selectedMonth)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-[#172033] transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              disabled={exporting || loading}
              onClick={() => void handleExport()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] disabled:opacity-60 text-white text-xs font-semibold shadow-sm shadow-[#315EF2]/20 transition-all cursor-pointer whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{exporting ? 'Exporting...' : 'Export Active CSV'}</span>
            </button>
          </div>
        }
      />

      {feedback && (
        <div
          role="status"
          className={`rounded-2xl border px-4 py-3.5 text-xs font-medium ${
            feedback.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* 6 Report Selector Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 surface-card">
        {REPORT_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeReport === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveReport(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[#101C3A] text-white shadow-xs'
                  : 'text-[#68748A] hover:text-[#101C3A] hover:bg-[#F5F7FC]'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading && !reports ? (
        <div className="surface-card p-12 text-center text-xs text-[#68748A]">
          Compiling live institutional reports from database...
        </div>
      ) : !reports ? (
        <div className="surface-card p-12 text-center text-xs text-rose-700 font-medium">
          Unable to load institutional reports. Please refresh.
        </div>
      ) : (
        <section className="surface-card overflow-hidden">
          {/* 1. DAILY SEAT UTILIZATION */}
          {activeReport === 'daily-utilization' && (
            <div>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-bold text-[#101C3A]">
                    Daily Seat Utilization Report
                  </h2>
                  <p className="text-xs text-[#68748A] mt-0.5">
                    Bookings, unique ILS coverage, study hours, and absence expiries by PKT
                    calendar day.
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-[#315EF2] bg-[#EAF0FF] px-2.5 py-1 rounded-lg">
                  {reports.dailySeatUtilization.length} days
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F5F7FC] border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                      <th className="py-3.5 px-4">Date (PKT)</th>
                      <th className="py-3.5 px-4 text-right">Bookings</th>
                      <th className="py-3.5 px-4 text-right">Unique Seats</th>
                      <th className="py-3.5 px-4 text-right">Coverage</th>
                      <th className="py-3.5 px-4 text-right">Unique Students</th>
                      <th className="py-3.5 px-4 text-right">Completed</th>
                      <th className="py-3.5 px-4 text-right">Expired</th>
                      <th className="py-3.5 px-4 text-right">Study Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {reports.dailySeatUtilization.map((row) => (
                      <tr key={row.date} className="hover:bg-[#F5F7FC]/70 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A]">
                          {row.date}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#101C3A]">
                          {row.totalBookings}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#68748A]">
                          {row.uniqueSeatsUsed} / 30
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#315EF2] font-semibold">
                          {row.seatCoveragePct}%
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#172033]">
                          {row.uniqueStudents}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium">
                          {row.completed}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-amber-700 font-medium">
                          {row.expired}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#172033]">
                          {row.totalStudyHours} hrs
                        </td>
                      </tr>
                    ))}
                    {reports.dailySeatUtilization.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-[#68748A]">
                          No daily utilization records for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. MONTHLY SEAT UTILIZATION */}
          {activeReport === 'monthly-utilization' && (
            <div>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-bold text-[#101C3A]">
                    Monthly Seat Utilization Report
                  </h2>
                  <p className="text-xs text-[#68748A] mt-0.5">
                    Aggregated monthly ILS demand, active student reach, expiry rate, and total
                    study hours.
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-[#315EF2] bg-[#EAF0FF] px-2.5 py-1 rounded-lg">
                  {reports.monthlySeatUtilization.length} months
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F5F7FC] border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                      <th className="py-3.5 px-4">Calendar Month</th>
                      <th className="py-3.5 px-4 text-right">Total Bookings</th>
                      <th className="py-3.5 px-4 text-right">Seats Utilized</th>
                      <th className="py-3.5 px-4 text-right">Unique Students</th>
                      <th className="py-3.5 px-4 text-right">Completed</th>
                      <th className="py-3.5 px-4 text-right">Expired</th>
                      <th className="py-3.5 px-4 text-right">Expiry Rate</th>
                      <th className="py-3.5 px-4 text-right">Total Study Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {reports.monthlySeatUtilization.map((row) => (
                      <tr key={row.month} className="hover:bg-[#F5F7FC]/70 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A]">
                          {row.month}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#101C3A]">
                          {row.totalBookings}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#68748A]">
                          {row.uniqueSeatsUsed} / 30 ({row.seatCoveragePct}%)
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#172033]">
                          {row.uniqueStudents}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium">
                          {row.completed}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-amber-700 font-medium">
                          {row.expired}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#172033]">
                          {row.expiryRatePct}%
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#101C3A]">
                          {row.totalStudyHours} hrs
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. STUDENT RESERVATION HISTORY */}
          {activeReport === 'student-reservations' && (
            <div>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-bold text-[#101C3A]">
                    Student Reservation History Report
                  </h2>
                  <p className="text-xs text-[#68748A] mt-0.5">
                    Complete chronological register of student ILS reservations and session
                    outcomes.
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-[#315EF2] bg-[#EAF0FF] px-2.5 py-1 rounded-lg">
                  {reports.studentReservationHistory.length} records
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F5F7FC] border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                      <th className="py-3.5 px-4">Reservation ID</th>
                      <th className="py-3.5 px-4">Date</th>
                      <th className="py-3.5 px-4">Student</th>
                      <th className="py-3.5 px-4">Program</th>
                      <th className="py-3.5 px-4">ILS Seat</th>
                      <th className="py-3.5 px-4 text-right">Duration</th>
                      <th className="py-3.5 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {reports.studentReservationHistory.slice(0, 100).map((row) => (
                      <tr
                        key={row.reservationId}
                        className="hover:bg-[#F5F7FC]/70 transition-colors"
                      >
                        <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A] whitespace-nowrap">
                          {row.reservationId}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[#68748A] whitespace-nowrap tabular-nums">
                          {row.date}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-semibold text-[#101C3A]">{row.studentName}</div>
                          <div className="font-mono text-[11px] text-[#68748A]">
                            ERP {row.studentErp}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-[#68748A]">{row.program}</td>
                        <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A] whitespace-nowrap">
                          {row.seatId} ·{' '}
                          <span className="font-sans font-normal text-[#68748A]">{row.zone}</span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap text-[#172033]">
                          {row.durationMinutes} min
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-[#101C3A] whitespace-nowrap">
                          {row.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. MONTHLY VIOLATION REPORTS */}
          {activeReport === 'monthly-violations' && (
            <div>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-bold text-[#101C3A]">
                    Monthly Violation Reports
                  </h2>
                  <p className="text-xs text-[#68748A] mt-0.5">
                    Warnings issued, fines triggered, waivers, resolutions, and PKR totals per
                    Asia/Karachi calendar month.
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-[#315EF2] bg-[#EAF0FF] px-2.5 py-1 rounded-lg">
                  {reports.monthlyViolationReports.length} months
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F5F7FC] border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                      <th className="py-3.5 px-4">Calendar Month</th>
                      <th className="py-3.5 px-4 text-right">Total Violations</th>
                      <th className="py-3.5 px-4 text-right">Warnings Only</th>
                      <th className="py-3.5 px-4 text-right">Open Fines</th>
                      <th className="py-3.5 px-4 text-right">Resolved</th>
                      <th className="py-3.5 px-4 text-right">Waived</th>
                      <th className="py-3.5 px-4 text-right">Students Affected</th>
                      <th className="py-3.5 px-4 text-right">Total Fines (PKR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {reports.monthlyViolationReports.map((row) => (
                      <tr key={row.month} className="hover:bg-[#F5F7FC]/70 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A]">
                          {row.month}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-[#101C3A]">
                          {row.totalViolations}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-amber-700 font-medium">
                          {row.warningsOnly}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-rose-700 font-medium">
                          {row.finesIssued}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium">
                          {row.resolved}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#68748A]">
                          {row.waived}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#172033]">
                          {row.uniqueStudents}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#101C3A]">
                          PKR {row.totalFinesPkr.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. MONTHLY FINE REPORTS */}
          {activeReport === 'monthly-fines' && (
            <div>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-bold text-[#101C3A]">
                    Monthly Fine &amp; Collection Reports
                  </h2>
                  <p className="text-xs text-[#68748A] mt-0.5">
                    PKR fine generation, verified collections, waivers, outstanding balances, and
                    collection rates by month.
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-[#315EF2] bg-[#EAF0FF] px-2.5 py-1 rounded-lg">
                  {reports.monthlyFineReports.length} months
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F5F7FC] border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                      <th className="py-3.5 px-4">Month</th>
                      <th className="py-3.5 px-4 text-right">Txns</th>
                      <th className="py-3.5 px-4 text-right">Generated (PKR)</th>
                      <th className="py-3.5 px-4 text-right">Collected (PKR)</th>
                      <th className="py-3.5 px-4 text-right">Waived (PKR)</th>
                      <th className="py-3.5 px-4 text-right">Outstanding (PKR)</th>
                      <th className="py-3.5 px-4 text-right">Collection Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {reports.monthlyFineReports.map((row) => (
                      <tr key={row.month} className="hover:bg-[#F5F7FC]/70 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A]">
                          {row.month}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#68748A]">
                          {row.transactionsCount}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#101C3A]">
                          PKR {row.totalGeneratedPkr.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          PKR {row.collectedPkr.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#68748A]">
                          PKR {row.waivedPkr.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-rose-700">
                          PKR {row.outstandingPkr.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#315EF2]">
                          {row.collectionRatePct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. OUTSTANDING BALANCE REPORTS */}
          {activeReport === 'outstanding-balances' && (
            <div>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-bold text-[#101C3A]">
                    Outstanding Student Balance Report
                  </h2>
                  <p className="text-xs text-[#68748A] mt-0.5">
                    Students with open UNPAID or PENDING balances across all historical months
                    (unaffected by monthly resets).
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg">
                  {reports.outstandingBalanceReports.length} students with balance
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F5F7FC] border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                      <th className="py-3.5 px-4">Student</th>
                      <th className="py-3.5 px-4">Program</th>
                      <th className="py-3.5 px-4">Standing</th>
                      <th className="py-3.5 px-4 text-right">Open Txns</th>
                      <th className="py-3.5 px-4 text-right">Unpaid (PKR)</th>
                      <th className="py-3.5 px-4 text-right">Pending (PKR)</th>
                      <th className="py-3.5 px-4 text-right">Total Outstanding</th>
                      <th className="py-3.5 px-4">Latest Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {reports.outstandingBalanceReports.map((row) => (
                      <tr
                        key={row.studentErp}
                        className="hover:bg-[#F5F7FC]/70 transition-colors"
                      >
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-semibold text-[#101C3A]">{row.studentName}</div>
                          <div className="font-mono text-[11px] text-[#68748A]">
                            ERP {row.studentErp}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-[#68748A]">{row.program}</td>
                        <td className="py-3.5 px-4 font-semibold text-[#101C3A] whitespace-nowrap">
                          {row.accountStatus}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#172033]">
                          {row.openTransactionsCount}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-rose-700">
                          PKR {row.unpaidPkr.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-amber-700">
                          PKR {row.pendingPkr.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-rose-700">
                          PKR {row.outstandingBalancePkr.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[#68748A] whitespace-nowrap tabular-nums">
                          {row.latestDueDate}
                        </td>
                      </tr>
                    ))}
                    {reports.outstandingBalanceReports.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-10 text-center text-emerald-700 font-semibold"
                        >
                          All student accounts have PKR 0 outstanding balance.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
