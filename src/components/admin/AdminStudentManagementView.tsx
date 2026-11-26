import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CreditCard,
  Download,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  LedgerEntry,
  ReservationRecord,
  StudentProfile,
  ViolationPolicyMeta,
  ViolationRecord,
} from '../../types/ils';
import { PageHeader } from '../shared/DesignSystem';

interface AdminStudentManagementViewProps {
  students: StudentProfile[];
  reservations: ReservationRecord[];
  violations: ViolationRecord[];
  ledger: LedgerEntry[];
  violationPolicy: ViolationPolicyMeta;
  onUpdateStudentStatus: (
    studentId: string,
    status: 'Active' | 'Warning Issued' | 'Restricted',
    reason: string
  ) => Promise<{ ok: boolean; message: string }>;
  onExportStudentLedger: (filters?: {
    studentId?: string;
  }) => Promise<{ ok: boolean; message: string }>;
}

type InspectorTab = 'reservations' | 'violations' | 'ledger';

const STANDING_BADGE: Record<StudentProfile['status'], string> = {
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Warning Issued': 'bg-amber-50 text-amber-700 border-amber-200',
  Restricted: 'bg-rose-50 text-rose-700 border-rose-200',
};

const LEDGER_STATUS_BADGE: Record<string, string> = {
  UNPAID: 'bg-rose-50 text-rose-700 border-rose-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  WAIVED: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const AdminStudentManagementView: React.FC<AdminStudentManagementViewProps> = ({
  students,
  reservations,
  violations,
  ledger,
  violationPolicy,
  onUpdateStudentStatus,
  onExportStudentLedger,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | StudentProfile['status']>('ALL');
  const [accountTypeFilter, setAccountTypeFilter] = useState<'ALL' | 'REAL' | 'DEMO'>('ALL');
  const [selectedErp, setSelectedErp] = useState<string>(students[0]?.erpId ?? '');
  const [activeTab, setActiveTab] = useState<InspectorTab>('reservations');

  const [nextStatus, setNextStatus] = useState<StudentProfile['status']>('Active');
  const [statusReason, setStatusReason] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (accountTypeFilter === 'REAL' && s.isDemo) return false;
      if (accountTypeFilter === 'DEMO' && !s.isDemo) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.erpId.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.program.toLowerCase().includes(q)
      );
    });
  }, [accountTypeFilter, searchQuery, statusFilter, students]);

  const selectedStudent = useMemo(
    () =>
      students.find((s) => s.erpId === selectedErp) ??
      filteredStudents[0] ??
      students[0],
    [filteredStudents, selectedErp, students]
  );

  const studentReservations = useMemo(() => {
    if (!selectedStudent) return [];
    return reservations.filter((r) => r.studentErp === selectedStudent.erpId);
  }, [reservations, selectedStudent]);

  const studentViolations = useMemo(() => {
    if (!selectedStudent) return [];
    return violations.filter((v) => v.studentErp === selectedStudent.erpId);
  }, [selectedStudent, violations]);

  const studentLedger = useMemo(() => {
    if (!selectedStudent) return [];
    return ledger.filter((l) => l.studentErp === selectedStudent.erpId);
  }, [ledger, selectedStudent]);

  const handleSelectStudent = (stu: StudentProfile) => {
    setSelectedErp(stu.erpId);
    setNextStatus(stu.status);
    setStatusReason('');
    setFeedback(null);
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    if (statusReason.trim().length < 5) {
      setFeedback({
        ok: false,
        message:
          'Enter a documented administrative reason (at least 5 characters) to update account status.',
      });
      return;
    }
    setSavingStatus(true);
    try {
      const res = await onUpdateStudentStatus(
        selectedStudent.erpId,
        nextStatus,
        statusReason.trim()
      );
      setFeedback(res);
      if (res.ok) setStatusReason('');
    } finally {
      setSavingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Management"
        description="Search student accounts and inspect complete profiles, monthly violation counters, reservation history, violation logs, and PKR financial ledgers."
      />

      {feedback && (
        <div
          role="status"
          className={`rounded-2xl border px-4 py-3.5 text-xs font-medium shadow-xs ${
            feedback.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Searchable Student Directory */}
        <section className="xl:col-span-5 surface-card overflow-hidden">
          <div className="p-4 border-b border-slate-100 space-y-3 bg-[#F5F7FC]/60">
            <div className="relative">
              <Search className="h-4 w-4 text-[#68748A] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by student name, ERP ID, email, or program..."
                aria-label="Search students"
                className="w-full pl-9 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {(['ALL', 'Active', 'Warning Issued', 'Restricted'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                      statusFilter === st
                        ? 'bg-[#101C3A] text-white'
                        : 'bg-white border border-slate-200 text-[#68748A] hover:text-[#101C3A]'
                    }`}
                  >
                    {st === 'ALL' ? 'All' : st}
                  </button>
                ))}
              </div>
              <select
                value={accountTypeFilter}
                onChange={(e) =>
                  setAccountTypeFilter(e.target.value as 'ALL' | 'REAL' | 'DEMO')
                }
                aria-label="Filter by account type"
                className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
              >
                <option value="ALL">All ({students.length})</option>
                <option value="REAL">Registered</option>
                <option value="DEMO">Demo Accounts</option>
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[660px] overflow-y-auto">
            {filteredStudents.map((stu) => {
              const isSelected = selectedStudent?.erpId === stu.erpId;
              return (
                <button
                  key={stu.erpId}
                  type="button"
                  onClick={() => handleSelectStudent(stu)}
                  className={`w-full text-left px-4 py-4 transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-[#EAF0FF]/60 ring-1 ring-inset ring-[#315EF2]/20'
                      : 'hover:bg-[#F5F7FC]/80'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#101C3A] truncate">
                        {stu.name}
                      </span>
                      {stu.isDemo && (
                        <span className="font-mono text-[10px] font-semibold text-[#68748A] bg-slate-100 px-1.5 py-0.5 rounded">
                          DEMO
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-[#68748A] truncate tabular-nums">
                      ERP {stu.erpId} · {stu.program}
                    </div>
                    <div className="mt-1 text-[11px] text-[#68748A]">
                      Monthly violations:{' '}
                      <strong className="font-mono text-[#101C3A]">
                        {stu.monthlyViolationCount ?? 0}
                      </strong>{' '}
                      · Sessions:{' '}
                      <strong className="font-mono text-[#101C3A]">{stu.totalSessions}</strong>
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <span
                      className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-md border ${
                        STANDING_BADGE[stu.status]
                      }`}
                    >
                      {stu.status}
                    </span>
                    <div
                      className={`font-mono text-xs font-bold tabular-nums ${
                        stu.outstandingDuesPkr > 0 ? 'text-rose-700' : 'text-[#68748A]'
                      }`}
                    >
                      PKR {stu.outstandingDuesPkr.toLocaleString()}
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredStudents.length === 0 && (
              <div className="py-12 text-center text-xs text-[#68748A]">
                No students match your search criteria.
              </div>
            )}
          </div>
        </section>

        {/* Right: Connected Student 360° Inspector */}
        <section className="xl:col-span-7 surface-card overflow-hidden">
          {!selectedStudent ? (
            <div className="p-14 text-center space-y-2.5">
              <UserCheck className="h-8 w-8 text-slate-300 mx-auto" />
              <div className="font-display text-sm font-bold text-[#101C3A]">
                Select a Student Profile
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {/* Student Profile Header */}
              <div className="p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4 bg-[#F5F7FC]/60">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="font-display text-xl font-bold text-[#101C3A]">
                      {selectedStudent.name}
                    </h2>
                    <span
                      className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-lg border ${
                        STANDING_BADGE[selectedStudent.status]
                      }`}
                    >
                      {selectedStudent.status}
                    </span>
                  </div>
                  <div className="font-mono text-xs text-[#68748A] tabular-nums">
                    ERP {selectedStudent.erpId} · {selectedStudent.program} ·{' '}
                    {selectedStudent.batch}
                  </div>
                  <div className="pt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#68748A]">
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-[#315EF2]" aria-hidden="true" />
                      {selectedStudent.email}
                    </span>
                    {selectedStudent.phone && (
                      <span className="inline-flex items-center gap-1.5 font-mono">
                        <Phone className="h-3.5 w-3.5 text-[#19B6A4]" aria-hidden="true" />
                        {selectedStudent.phone}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void onExportStudentLedger({ studentId: selectedStudent.erpId })}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-[#EAF0FF] hover:border-[#DCE6FF] hover:text-[#315EF2] text-xs font-semibold text-[#101C3A] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5 text-[#315EF2]" aria-hidden="true" />
                  <span>Export Ledger CSV</span>
                </button>
              </div>

              {/* 4 Connected Student Metrics */}
              <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white">
                <div className="rounded-xl bg-[#F5F7FC] p-3.5">
                  <div className="text-[11px] font-medium text-[#68748A]">
                    Violations ({violationPolicy.currentMonth})
                  </div>
                  <div className="mt-1.5 text-2xl font-bold text-[#101C3A] tabular-nums">
                    {selectedStudent.monthlyViolationCount ?? 0}
                  </div>
                </div>
                <div className="rounded-xl bg-[#F5F7FC] p-3.5">
                  <div className="text-[11px] font-medium text-[#68748A]">Total Violations</div>
                  <div className="mt-1.5 text-2xl font-bold text-[#101C3A] tabular-nums">
                    {studentViolations.length}
                  </div>
                </div>
                <div className="rounded-xl bg-[#F5F7FC] p-3.5">
                  <div className="text-[11px] font-medium text-[#68748A]">Reservations</div>
                  <div className="mt-1.5 text-2xl font-bold text-[#101C3A] tabular-nums">
                    {studentReservations.length}
                  </div>
                </div>
                <div className="rounded-xl bg-[#F5F7FC] p-3.5">
                  <div className="text-[11px] font-medium text-[#68748A]">Outstanding</div>
                  <div
                    className={`mt-1.5 text-lg font-bold tabular-nums ${
                      selectedStudent.outstandingDuesPkr > 0
                        ? 'text-rose-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    PKR {selectedStudent.outstandingDuesPkr.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Account Status Governance Control */}
              <form
                onSubmit={(e) => void handleStatusSubmit(e)}
                className="p-5 bg-[#F5F7FC]/45 space-y-3"
              >
                <div className="font-display text-xs font-bold text-[#101C3A] flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-[#315EF2]" aria-hidden="true" />
                  <span>Account Status Management (Logged to Audit Trail)</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <select
                    value={nextStatus}
                    onChange={(e) =>
                      setNextStatus(e.target.value as StudentProfile['status'])
                    }
                    aria-label="Account status"
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-[#101C3A] focus:border-[#315EF2]"
                  >
                    <option value="Active">Active</option>
                    <option value="Warning Issued">Warning Issued</option>
                    <option value="Restricted">Restricted</option>
                  </select>
                  <input
                    type="text"
                    value={statusReason}
                    onChange={(e) => setStatusReason(e.target.value)}
                    placeholder="Documented reason for account status change (min 5 chars)..."
                    className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
                  />
                  <button
                    type="submit"
                    disabled={savingStatus}
                    className="px-4 py-2 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] disabled:opacity-60 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer whitespace-nowrap"
                  >
                    {savingStatus ? 'Updating...' : 'Update Status'}
                  </button>
                </div>
              </form>

              {/* Sub-tabs: Reservation History | Violation History | Financial Ledger */}
              <div className="p-5 space-y-4">
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#F5F7FC] border border-slate-200/80 rounded-xl w-fit">
                  <button
                    type="button"
                    onClick={() => setActiveTab('reservations')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === 'reservations'
                        ? 'bg-[#101C3A] text-white shadow-xs'
                        : 'text-[#68748A] hover:text-[#101C3A]'
                    }`}
                  >
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Reservations ({studentReservations.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('violations')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === 'violations'
                        ? 'bg-[#101C3A] text-white shadow-xs'
                        : 'text-[#68748A] hover:text-[#101C3A]'
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Violations ({studentViolations.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('ledger')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === 'ledger'
                        ? 'bg-[#101C3A] text-white shadow-xs'
                        : 'text-[#68748A] hover:text-[#101C3A]'
                    }`}
                  >
                    <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Financial Ledger ({studentLedger.length})</span>
                  </button>
                </div>

                {activeTab === 'reservations' && (
                  <div className="overflow-x-auto border border-slate-100 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#F5F7FC] border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                          <th className="py-3 px-3.5">Reservation</th>
                          <th className="py-3 px-3.5">ILS Seat</th>
                          <th className="py-3 px-3.5">Date &amp; Time</th>
                          <th className="py-3 px-3.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {studentReservations.map((r) => (
                          <tr key={r.id} className="hover:bg-[#F5F7FC]/70 transition-colors">
                            <td className="py-3 px-3.5 font-mono font-semibold text-[#101C3A]">
                              {r.id}
                            </td>
                            <td className="py-3 px-3.5 font-mono text-[#101C3A]">
                              {r.seatId} ·{' '}
                              <span className="font-sans text-[#68748A]">{r.zone}</span>
                            </td>
                            <td className="py-3 px-3.5 font-mono text-[#68748A] tabular-nums">
                              {r.date} · {r.startTime}–{r.endTime}
                            </td>
                            <td className="py-3 px-3.5 font-semibold text-[#101C3A]">
                              {r.status}
                            </td>
                          </tr>
                        ))}
                        {studentReservations.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-9 text-center text-[#68748A]">
                              No reservations recorded for this student.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab === 'violations' && (
                  <div className="overflow-x-auto border border-slate-100 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#F5F7FC] border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                          <th className="py-3 px-3.5">Date / Month</th>
                          <th className="py-3 px-3.5">Monthly #</th>
                          <th className="py-3 px-3.5">ILS</th>
                          <th className="py-3 px-3.5">Outcome</th>
                          <th className="py-3 px-3.5 text-right">Fine (PKR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {studentViolations.map((v) => (
                          <tr key={v.id} className="hover:bg-[#F5F7FC]/70 transition-colors">
                            <td className="py-3 px-3.5 font-mono text-[#68748A] tabular-nums">
                              <div>{v.date}</div>
                              <div className="text-[10px] text-slate-400">{v.calendarMonth}</div>
                            </td>
                            <td className="py-3 px-3.5 font-mono font-bold text-[#101C3A]">
                              #{v.monthlyViolationNumber ?? 1}
                            </td>
                            <td className="py-3 px-3.5 font-mono font-semibold text-[#101C3A]">
                              {v.seatId}
                            </td>
                            <td className="py-3 px-3.5">
                              <div className="font-semibold text-[#101C3A]">{v.severity}</div>
                              {v.reviewNote && (
                                <div className="text-[11px] text-[#68748A] mt-0.5">
                                  Note: {v.reviewNote}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3.5 text-right font-mono font-semibold tabular-nums text-[#101C3A]">
                              PKR {v.finePkr.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        {studentViolations.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-9 text-center text-[#68748A]">
                              No violations recorded for this student.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab === 'ledger' && (
                  <div className="overflow-x-auto border border-slate-100 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#F5F7FC] border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                          <th className="py-3 px-3.5">Transaction</th>
                          <th className="py-3 px-3.5">Description</th>
                          <th className="py-3 px-3.5 text-right">Amount</th>
                          <th className="py-3 px-3.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {studentLedger.map((entry) => (
                          <tr key={entry.id} className="hover:bg-[#F5F7FC]/70 transition-colors">
                            <td className="py-3 px-3.5 font-mono text-[#101C3A]">
                              <div className="font-semibold">{entry.id}</div>
                              <div className="text-[10px] text-[#68748A]">{entry.date}</div>
                            </td>
                            <td className="py-3 px-3.5 text-[#172033]">{entry.description}</td>
                            <td className="py-3 px-3.5 text-right font-mono font-semibold tabular-nums text-[#101C3A] whitespace-nowrap">
                              PKR {entry.amountPkr.toLocaleString()}
                            </td>
                            <td className="py-3 px-3.5">
                              <span
                                className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-md border ${
                                  LEDGER_STATUS_BADGE[entry.status] ??
                                  'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {entry.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {studentLedger.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-9 text-center text-[#68748A]">
                              No financial transactions recorded for this student.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
