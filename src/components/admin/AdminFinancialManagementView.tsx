import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileSpreadsheet,
  History,
  Search,
  ShieldCheck,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';
import {
  AdminTransactionUpdatePayload,
  FinancialAuditLog,
  LedgerEntry,
  PaymentStatus,
  StudentFinancialLedgerDetail,
  StudentProfile,
  ViolationPolicyMeta,
} from '../../types/ils';
import { PageHeader } from '../shared/DesignSystem';

interface AdminFinancialManagementViewProps {
  ledger: LedgerEntry[];
  students: StudentProfile[];
  auditLogs: FinancialAuditLog[];
  violationPolicy: ViolationPolicyMeta;
  onUpdateTransaction: (
    transactionId: string,
    payload: AdminTransactionUpdatePayload
  ) => Promise<{ ok: boolean; message: string }>;
  onFetchStudentLedger: (studentId: string) => Promise<StudentFinancialLedgerDetail | null>;
  onExportReport: (filters?: {
    studentId?: string;
    status?: string;
    search?: string;
  }) => Promise<{ ok: boolean; message: string }>;
  onExportMonthlyFines?: () => Promise<{ ok: boolean; message: string }>;
}

type FinancialTab = 'transactions' | 'students' | 'monthly' | 'audit';
type ModalMode = 'PAID' | 'PENDING' | 'WAIVED' | 'UNPAID';

const PAYMENT_METHODS = [
  'Bursar Cash Counter',
  'Bank Challan / Deposit',
  'Kuickpay / Online Transfer',
  'Library Desk Verification',
] as const;

const STATUS_BADGE_CLASS: Record<PaymentStatus, string> = {
  UNPAID: 'bg-rose-50 text-rose-700 border-rose-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  WAIVED: 'bg-slate-100 text-slate-600 border-slate-200',
};

const AUDIT_ACTION_LABELS: Record<FinancialAuditLog['actionType'], string> = {
  FINE_CREATED: 'Automatic Fine Created',
  MARKED_PENDING: 'Marked Pending Verification',
  PAYMENT_VERIFIED: 'Payment Verified (PAID)',
  FINE_WAIVED: 'Fine Officially Waived',
  REOPENED_UNPAID: 'Returned to UNPAID',
};

function formatAuditTimestamp(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export const AdminFinancialManagementView: React.FC<AdminFinancialManagementViewProps> = ({
  ledger,
  students,
  auditLogs,
  violationPolicy,
  onUpdateTransaction,
  onFetchStudentLedger,
  onExportReport,
  onExportMonthlyFines,
}) => {
  const [activeTab, setActiveTab] = useState<FinancialTab>('transactions');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentBalanceFilter, setStudentBalanceFilter] = useState<
    'all' | 'outstanding' | 'activity'
  >('all');

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentDetail, setStudentDetail] = useState<StudentFinancialLedgerDetail | null>(null);
  const [loadingStudentDetail, setLoadingStudentDetail] = useState(false);

  const [actionModal, setActionModal] = useState<{
    entry: LedgerEntry;
    mode: ModalMode;
  } | null>(null);
  const [modalRef, setModalRef] = useState('');
  const [modalMethod, setModalMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [modalReason, setModalReason] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [submittingModal, setSubmittingModal] = useState(false);

  const [feedbackBanner, setFeedbackBanner] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  const [exporting, setExporting] = useState(false);

  const showFeedback = (res: { ok: boolean; message: string }) => {
    setFeedbackBanner(res);
    setTimeout(() => setFeedbackBanner(null), 4500);
  };

  const totals = useMemo(() => {
    let totalGenerated = 0;
    let unpaidAmount = 0;
    let pendingAmount = 0;
    let paidAmount = 0;
    let waivedAmount = 0;
    let unpaidCount = 0;
    let pendingCount = 0;
    let paidCount = 0;
    let waivedCount = 0;

    for (const item of ledger) {
      totalGenerated += item.amountPkr;
      if (item.status === 'UNPAID') {
        unpaidAmount += item.amountPkr;
        unpaidCount += 1;
      } else if (item.status === 'PENDING') {
        pendingAmount += item.amountPkr;
        pendingCount += 1;
      } else if (item.status === 'PAID') {
        paidAmount += item.amountPkr;
        paidCount += 1;
      } else if (item.status === 'WAIVED') {
        waivedAmount += item.amountPkr;
        waivedCount += 1;
      }
    }

    return {
      totalGenerated,
      outstanding: unpaidAmount + pendingAmount,
      unpaidAmount,
      pendingAmount,
      paidAmount,
      waivedAmount,
      counts: {
        total: ledger.length,
        unpaid: unpaidCount,
        pending: pendingCount,
        paid: paidCount,
        waived: waivedCount,
      },
    };
  }, [ledger]);

  const monthlyBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        month: string;
        transactions: number;
        generatedPkr: number;
        collectedPkr: number;
        waivedPkr: number;
        outstandingPkr: number;
      }
    >();

    for (const item of ledger) {
      const month = (item.date || '').slice(0, 7) || violationPolicy.currentMonth;
      let row = map.get(month);
      if (!row) {
        row = {
          month,
          transactions: 0,
          generatedPkr: 0,
          collectedPkr: 0,
          waivedPkr: 0,
          outstandingPkr: 0,
        };
        map.set(month, row);
      }
      row.transactions += 1;
      row.generatedPkr += item.amountPkr;
      if (item.status === 'PAID') row.collectedPkr += item.amountPkr;
      else if (item.status === 'WAIVED') row.waivedPkr += item.amountPkr;
      else row.outstandingPkr += item.amountPkr;
    }

    return Array.from(map.values())
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((m) => {
        const collectible = Math.max(0, m.generatedPkr - m.waivedPkr);
        return {
          ...m,
          collectionRatePct:
            collectible > 0 ? Math.round((m.collectedPkr / collectible) * 100) : 100,
        };
      });
  }, [ledger, violationPolicy.currentMonth]);

  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ledger.filter((entry) => {
      if (statusFilter !== 'ALL' && entry.status !== statusFilter) return false;
      if (!q) return true;
      return (
        entry.id.toLowerCase().includes(q) ||
        entry.studentErp.toLowerCase().includes(q) ||
        entry.studentName.toLowerCase().includes(q) ||
        (entry.seatId ?? '').toLowerCase().includes(q) ||
        (entry.violationId ?? '').toLowerCase().includes(q) ||
        entry.referenceId.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q)
      );
    });
  }, [ledger, searchQuery, statusFilter]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return students
      .filter((s) => {
        if (studentBalanceFilter === 'outstanding' && s.outstandingDuesPkr <= 0) return false;
        if (
          studentBalanceFilter === 'activity' &&
          (s.totalFinesGeneratedPkr ?? s.outstandingDuesPkr) <= 0
        ) {
          return false;
        }
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.erpId.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          s.program.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) => b.outstandingDuesPkr - a.outstandingDuesPkr || a.erpId.localeCompare(b.erpId)
      );
  }, [studentBalanceFilter, studentSearch, students]);

  const openStudentLedger = async (studentId: string) => {
    setSelectedStudentId(studentId);
    setActiveTab('students');
    setLoadingStudentDetail(true);
    try {
      const detail = await onFetchStudentLedger(studentId);
      setStudentDetail(detail);
    } finally {
      setLoadingStudentDetail(false);
    }
  };

  const openActionModal = (entry: LedgerEntry, mode: ModalMode) => {
    setActionModal({ entry, mode });
    setModalRef(entry.referenceId);
    setModalMethod(
      entry.paymentMethod &&
        PAYMENT_METHODS.includes(entry.paymentMethod as (typeof PAYMENT_METHODS)[number])
        ? entry.paymentMethod
        : PAYMENT_METHODS[0]
    );
    setModalReason('');
    setModalError(null);
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionModal) return;

    const cleanReason = modalReason.trim();
    if (actionModal.mode === 'WAIVED' && cleanReason.length < 5) {
      setModalError(
        'Enter a documented waiver reason (at least 5 characters) for the audit trail.'
      );
      return;
    }

    setSubmittingModal(true);
    setModalError(null);
    try {
      const payload: AdminTransactionUpdatePayload = {
        status: actionModal.mode,
        paymentReference: modalRef.trim() || actionModal.entry.referenceId,
        paymentMethod: actionModal.mode === 'WAIVED' ? 'Waiver Adjustment' : modalMethod,
        reason: cleanReason || undefined,
      };
      const res = await onUpdateTransaction(actionModal.entry.id, payload);
      if (!res.ok) {
        setModalError(res.message);
        return;
      }

      setActionModal(null);
      showFeedback(res);

      if (selectedStudentId === actionModal.entry.studentErp) {
        const refreshed = await onFetchStudentLedger(selectedStudentId);
        setStudentDetail(refreshed);
      }
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleExport = async (studentId?: string) => {
    setExporting(true);
    try {
      const res = await onExportReport(
        studentId
          ? { studentId }
          : {
              status: statusFilter,
              search: searchQuery,
            }
      );
      showFeedback(res);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Management"
        description="Verify manual payments, review individual student ledgers, issue documented waivers, inspect the immutable audit trail, and export institutional PKR reports."
        action={
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExport()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] disabled:opacity-60 text-white text-xs font-semibold shadow-sm shadow-[#315EF2]/20 transition-all cursor-pointer whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{exporting ? 'Exporting...' : 'Export CSV Report'}</span>
          </button>
        }
      />

      {feedbackBanner && (
        <div
          role="status"
          className={`rounded-2xl border px-4 py-3.5 text-xs font-medium flex items-center justify-between gap-3 ${
            feedbackBanner.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{feedbackBanner.message}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-current opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="Dismiss message"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Institutional Financial Summary Cards */}
      <section aria-label="Institutional Financial Metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="surface-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#68748A]">Total Fines Generated</span>
              <span className="h-9 w-9 rounded-xl bg-[#EAF0FF] text-[#315EF2] flex items-center justify-center">
                <CreditCard className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold text-[#101C3A] tabular-nums">
              PKR {totals.totalGenerated.toLocaleString()}
            </div>
            <div className="mt-1.5 text-xs text-[#68748A]">
              {totals.counts.total} txns · Active rate PKR{' '}
              {violationPolicy.currentFinePkr.toLocaleString()}
            </div>
          </div>

          <div className="surface-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#68748A]">Outstanding Balance</span>
              <span className="h-9 w-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Wallet className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold text-rose-700 tabular-nums">
              PKR {totals.outstanding.toLocaleString()}
            </div>
            <div className="mt-1.5 text-xs text-[#68748A]">
              {totals.counts.unpaid} UNPAID (PKR {totals.unpaidAmount.toLocaleString()}) ·{' '}
              {totals.counts.pending} PENDING
            </div>
          </div>

          <div className="surface-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#68748A]">Verified Payments (PAID)</span>
              <span className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold text-emerald-700 tabular-nums">
              PKR {totals.paidAmount.toLocaleString()}
            </div>
            <div className="mt-1.5 text-xs text-[#68748A]">
              {totals.counts.paid} manually verified · No auto-deductions
            </div>
          </div>

          <div className="surface-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#68748A]">Official Waivers (WAIVED)</span>
              <span className="h-9 w-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold text-[#101C3A] tabular-nums">
              PKR {totals.waivedAmount.toLocaleString()}
            </div>
            <div className="mt-1.5 text-xs text-[#68748A]">
              {totals.counts.waived} documented waivers · {auditLogs.length} audit logs
            </div>
          </div>
        </div>
      </section>

      {/* Primary Section Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1.5 surface-card">
          <button
            type="button"
            onClick={() => setActiveTab('transactions')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'transactions'
                ? 'bg-[#101C3A] text-white shadow-xs'
                : 'text-[#68748A] hover:text-[#101C3A] hover:bg-[#F5F7FC]'
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Transaction Ledger ({totals.counts.total})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('students')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'students'
                ? 'bg-[#101C3A] text-white shadow-xs'
                : 'text-[#68748A] hover:text-[#101C3A] hover:bg-[#F5F7FC]'
            }`}
          >
            <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Student Ledgers ({students.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('monthly')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'monthly'
                ? 'bg-[#101C3A] text-white shadow-xs'
                : 'text-[#68748A] hover:text-[#101C3A] hover:bg-[#F5F7FC]'
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Monthly Financial Reports ({monthlyBreakdown.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'audit'
                ? 'bg-[#101C3A] text-white shadow-xs'
                : 'text-[#68748A] hover:text-[#101C3A] hover:bg-[#F5F7FC]'
            }`}
          >
            <History className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Audit Trail ({auditLogs.length})</span>
          </button>
        </div>

        <div className="text-xs text-[#68748A]">
          Monthly resets ({violationPolicy.timezone}) never clear financial balances · Manual
          verification active
        </div>
      </div>

      {/* TAB 1: ALL TRANSACTIONS */}
      {activeTab === 'transactions' && (
        <section className="surface-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F5F7FC] border border-slate-200/80 rounded-xl">
              {(['ALL', 'UNPAID', 'PENDING', 'PAID', 'WAIVED'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    statusFilter === status
                      ? 'bg-[#315EF2] text-white shadow-xs'
                      : 'text-[#68748A] hover:text-[#101C3A] hover:bg-white'
                  }`}
                >
                  {status === 'ALL'
                    ? `All (${totals.counts.total})`
                    : `${status} (${
                        status === 'UNPAID'
                          ? totals.counts.unpaid
                          : status === 'PENDING'
                            ? totals.counts.pending
                            : status === 'PAID'
                              ? totals.counts.paid
                              : totals.counts.waived
                      })`}
                </button>
              ))}
            </div>

            <div className="relative lg:w-72">
              <Search className="h-4 w-4 text-[#68748A] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search student, ERP, TXN, ILS, ref..."
                aria-label="Search financial transactions"
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-[#F5F7FC] text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                  <th className="py-3.5 px-4 whitespace-nowrap">Transaction ID</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Date</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Student</th>
                  <th className="py-3.5 px-4">Description</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">ILS / Violation</th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap">Amount (PKR)</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Status</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Reference</th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap">Verification Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredTransactions.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-[#F5F7FC]/70 transition-colors align-top"
                  >
                    <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A] whitespace-nowrap">
                      <div>{entry.id}</div>
                      {entry.fineConfigurationId && (
                        <div className="text-[10px] font-normal text-[#68748A] mt-0.5">
                          {entry.fineConfigurationId}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#68748A] tabular-nums whitespace-nowrap">
                      {entry.date}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => void openStudentLedger(entry.studentErp)}
                        className="text-left group cursor-pointer"
                      >
                        <div className="font-semibold text-[#101C3A] group-hover:text-[#315EF2] group-hover:underline">
                          {entry.studentName}
                        </div>
                        <div className="font-mono text-[11px] text-[#68748A]">
                          ERP {entry.studentErp}
                        </div>
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-[#172033] max-w-xs">
                      <div>{entry.description}</div>
                      {entry.waiverReason && entry.status === 'WAIVED' && (
                        <div className="mt-1 text-[11px] text-[#68748A]">
                          Waiver: {entry.waiverReason}
                        </div>
                      )}
                      {entry.verifiedByName && entry.status === 'PAID' && (
                        <div className="mt-1 text-[11px] text-emerald-700">
                          Verified by {entry.verifiedByName}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                      <div className="font-semibold text-[#101C3A]">{entry.seatId ?? '—'}</div>
                      <div className="text-[11px] text-[#68748A]">{entry.violationId ?? '—'}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-[#101C3A] whitespace-nowrap">
                      PKR {entry.amountPkr.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-md border ${
                          STATUS_BADGE_CLASS[entry.status]
                        }`}
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#68748A] whitespace-nowrap">
                      <div>{entry.referenceId}</div>
                      {entry.paymentMethod && (
                        <div className="font-sans text-[10px] text-slate-400 mt-0.5">
                          {entry.paymentMethod}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-2.5">
                        {(entry.status === 'UNPAID' || entry.status === 'PENDING') && (
                          <button
                            type="button"
                            onClick={() => openActionModal(entry, 'PAID')}
                            className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                          >
                            Verify Paid
                          </button>
                        )}
                        {entry.status === 'UNPAID' && (
                          <button
                            type="button"
                            onClick={() => openActionModal(entry, 'PENDING')}
                            className="text-xs font-semibold text-amber-700 hover:underline cursor-pointer"
                          >
                            Mark Pending
                          </button>
                        )}
                        {entry.status === 'PENDING' && (
                          <button
                            type="button"
                            onClick={() => openActionModal(entry, 'UNPAID')}
                            className="text-xs font-semibold text-rose-700 hover:underline cursor-pointer"
                          >
                            Reopen Unpaid
                          </button>
                        )}
                        {(entry.status === 'UNPAID' || entry.status === 'PENDING') && (
                          <button
                            type="button"
                            onClick={() => openActionModal(entry, 'WAIVED')}
                            className="text-xs font-semibold text-[#68748A] hover:text-[#101C3A] hover:underline cursor-pointer"
                          >
                            Waive
                          </button>
                        )}
                        {(entry.status === 'PAID' || entry.status === 'WAIVED') && (
                          <span className="text-[11px] text-slate-400">Settled</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-[#68748A]">
                      No financial transactions match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: STUDENT LEDGERS DIRECTORY + INDIVIDUAL INSPECTOR */}
      {activeTab === 'students' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Student Search & List */}
          <section className="xl:col-span-5 surface-card overflow-hidden">
            <div className="p-4 border-b border-slate-100 space-y-3 bg-[#F5F7FC]/60">
              <div className="relative">
                <Search className="h-4 w-4 text-[#68748A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search students by name, ERP ID, or program..."
                  aria-label="Search student financial ledgers"
                  className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1 p-1 bg-white border border-slate-200/80 rounded-xl">
                {(
                  [
                    ['all', 'All Students'],
                    ['outstanding', 'With Balance'],
                    ['activity', 'With Ledger History'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStudentBalanceFilter(key)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      studentBalanceFilter === key
                        ? 'bg-[#101C3A] text-white shadow-xs'
                        : 'text-[#68748A] hover:text-[#101C3A]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-100 max-h-[580px] overflow-y-auto">
              {filteredStudents.map((stu) => {
                const isSelected = selectedStudentId === stu.erpId;
                return (
                  <button
                    key={stu.erpId}
                    type="button"
                    onClick={() => void openStudentLedger(stu.erpId)}
                    className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-[#EAF0FF]/60 ring-1 ring-inset ring-[#315EF2]/20'
                        : 'hover:bg-[#F5F7FC]/80'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#101C3A] truncate">{stu.name}</div>
                      <div className="mt-0.5 text-[11px] text-[#68748A] font-mono tabular-nums truncate">
                        ERP {stu.erpId} · {stu.program}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#68748A]">
                        Paid: PKR {(stu.totalPaidPkr ?? 0).toLocaleString()} · Waived: PKR{' '}
                        {(stu.totalWaivedPkr ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={`font-mono text-xs font-bold tabular-nums ${
                          stu.outstandingDuesPkr > 0 ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        PKR {stu.outstandingDuesPkr.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-[#68748A] mt-0.5">
                        {stu.outstandingDuesPkr > 0 ? 'Outstanding' : 'Clear'}
                      </div>
                    </div>
                  </button>
                );
              })}

              {filteredStudents.length === 0 && (
                <div className="py-10 px-4 text-center text-xs text-[#68748A]">
                  No students match this filter.
                </div>
              )}
            </div>
          </section>

          {/* Individual Student Ledger Panel */}
          <section className="xl:col-span-7 surface-card overflow-hidden">
            {!selectedStudentId ? (
              <div className="p-14 text-center space-y-2.5">
                <UserCheck className="h-8 w-8 text-slate-300 mx-auto" aria-hidden="true" />
                <h3 className="font-display text-sm font-bold text-[#101C3A]">
                  Select a Student Ledger
                </h3>
                <p className="text-xs text-[#68748A] max-w-sm mx-auto">
                  Choose any student from the directory to view their complete PKR balance, verify
                  payments, issue documented waivers, or export their individual statement.
                </p>
              </div>
            ) : loadingStudentDetail || !studentDetail ? (
              <div className="p-12 text-center text-xs text-[#68748A]">
                Loading student financial ledger...
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F5F7FC]/60">
                  <div>
                    <div className="text-[11px] text-[#315EF2] font-semibold uppercase tracking-wider">
                      Individual Student Financial Ledger
                    </div>
                    <h3 className="font-display text-lg font-bold text-[#101C3A] mt-0.5">
                      {studentDetail.student.name}
                    </h3>
                    <div className="text-xs text-[#68748A] font-mono tabular-nums mt-0.5">
                      ERP {studentDetail.student.erpId} · {studentDetail.student.program} ·{' '}
                      {studentDetail.student.email}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleExport(studentDetail.student.erpId)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-[#EAF0FF] hover:border-[#DCE6FF] hover:text-[#315EF2] text-xs font-semibold text-[#101C3A] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Download className="h-3.5 w-3.5 text-[#315EF2]" aria-hidden="true" />
                    <span>Export Student CSV</span>
                  </button>
                </div>

                <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white">
                  <div className="rounded-xl bg-[#F5F7FC] p-3.5">
                    <div className="text-[11px] text-[#68748A]">Total Fines</div>
                    <div className="mt-1 font-mono text-base font-bold text-[#101C3A] tabular-nums">
                      PKR {studentDetail.summary.totalFinesGeneratedPkr.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#F5F7FC] p-3.5">
                    <div className="text-[11px] text-[#68748A]">Outstanding</div>
                    <div
                      className={`mt-1 font-mono text-base font-bold tabular-nums ${
                        studentDetail.summary.outstandingBalancePkr > 0
                          ? 'text-rose-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      PKR {studentDetail.summary.outstandingBalancePkr.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#F5F7FC] p-3.5">
                    <div className="text-[11px] text-[#68748A]">Verified Paid</div>
                    <div className="mt-1 font-mono text-base font-bold text-emerald-700 tabular-nums">
                      PKR {studentDetail.summary.totalPaidPkr.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#F5F7FC] p-3.5">
                    <div className="text-[11px] text-[#68748A]">Waived</div>
                    <div className="mt-1 font-mono text-base font-bold text-slate-700 tabular-nums">
                      PKR {studentDetail.summary.totalWaivedPkr.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Student Transactions */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-[#F5F7FC] text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                        <th className="py-3 px-4">Transaction</th>
                        <th className="py-3 px-4">ILS / Violation</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {studentDetail.ledger.map((entry) => (
                        <tr key={entry.id} className="hover:bg-[#F5F7FC]/70 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-mono font-semibold text-[#101C3A]">{entry.id}</div>
                            <div className="text-[11px] text-[#68748A]">
                              {entry.date} · Ref {entry.referenceId}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono">
                            <div className="font-semibold text-[#101C3A]">
                              {entry.seatId ?? '—'}
                            </div>
                            <div className="text-[11px] text-[#68748A]">
                              {entry.violationId ?? '—'}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-[#101C3A] whitespace-nowrap">
                            PKR {entry.amountPkr.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-md border ${
                                STATUS_BADGE_CLASS[entry.status]
                              }`}
                            >
                              {entry.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                            {entry.status === 'UNPAID' || entry.status === 'PENDING' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openActionModal(entry, 'PAID')}
                                  className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                                >
                                  Verify Paid
                                </button>
                                {entry.status === 'UNPAID' && (
                                  <button
                                    type="button"
                                    onClick={() => openActionModal(entry, 'PENDING')}
                                    className="text-xs font-semibold text-amber-700 hover:underline cursor-pointer"
                                  >
                                    Pending
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openActionModal(entry, 'WAIVED')}
                                  className="text-xs font-semibold text-[#68748A] hover:underline cursor-pointer"
                                >
                                  Waive
                                </button>
                              </>
                            ) : (
                              <span className="text-[11px] text-slate-400">Settled</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {studentDetail.ledger.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-9 text-center text-[#68748A]">
                            No fine transactions recorded for this student.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Student Audit History */}
                <div className="p-5 bg-[#F5F7FC]/40">
                  <h4 className="font-display text-xs font-bold text-[#101C3A] mb-3">
                    Student Adjustment Audit Trail ({studentDetail.auditLogs.length})
                  </h4>
                  {studentDetail.auditLogs.length === 0 ? (
                    <p className="text-xs text-[#68748A]">No financial audit events yet.</p>
                  ) : (
                    <ul className="divide-y divide-slate-200/70 text-xs">
                      {studentDetail.auditLogs.slice(0, 8).map((log) => (
                        <li
                          key={log.id}
                          className="py-2.5 flex flex-col sm:flex-row sm:items-start justify-between gap-2"
                        >
                          <div className="space-y-0.5">
                            <div className="font-semibold text-[#101C3A]">
                              {AUDIT_ACTION_LABELS[log.actionType]} ·{' '}
                              <span className="font-mono text-[#68748A]">{log.transactionId}</span>
                            </div>
                            <div className="text-[11px] text-[#172033]">{log.reason}</div>
                            <div className="text-[10px] text-[#68748A]">
                              By {log.performedByName} ({log.performedById})
                              {log.paymentReference ? ` · Ref ${log.paymentReference}` : ''}
                            </div>
                          </div>
                          <div className="font-mono text-[11px] text-[#68748A] tabular-nums whitespace-nowrap">
                            {formatAuditTimestamp(log.performedAt)} PKT
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2B: MONTHLY FINANCIAL REPORTS */}
      {activeTab === 'monthly' && (
        <section className="surface-card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-bold text-[#101C3A]">
                Monthly Financial Reports (PKR)
              </h2>
              <p className="text-xs text-[#68748A] mt-0.5">
                Month-by-month breakdown of fines generated, verified collections, waivers,
                outstanding balances, and collection rate.
              </p>
            </div>
            {onExportMonthlyFines && (
              <button
                type="button"
                onClick={() => {
                  void onExportMonthlyFines().then(showFeedback);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-[#EAF0FF] hover:border-[#DCE6FF] hover:text-[#315EF2] text-xs font-semibold text-[#101C3A] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5 text-[#315EF2]" aria-hidden="true" />
                <span>Export Monthly Summary CSV</span>
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-[#F5F7FC] text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                  <th className="py-3.5 px-4">Calendar Month</th>
                  <th className="py-3.5 px-4 text-right">Transactions</th>
                  <th className="py-3.5 px-4 text-right">Fines Generated (PKR)</th>
                  <th className="py-3.5 px-4 text-right">Fines Collected (PKR)</th>
                  <th className="py-3.5 px-4 text-right">Waived Fines (PKR)</th>
                  <th className="py-3.5 px-4 text-right">Outstanding (PKR)</th>
                  <th className="py-3.5 px-4 text-right">Collection Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {monthlyBreakdown.map((m) => (
                  <tr key={m.month} className="hover:bg-[#F5F7FC]/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A]">
                      {m.month}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#68748A]">
                      {m.transactions}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#101C3A]">
                      PKR {m.generatedPkr.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      PKR {m.collectedPkr.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#68748A]">
                      PKR {m.waivedPkr.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-rose-700">
                      PKR {m.outstandingPkr.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#315EF2]">
                      {m.collectionRatePct}%
                    </td>
                  </tr>
                ))}
                {monthlyBreakdown.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-[#68748A]">
                      No monthly financial transactions recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 3: IMMUTABLE FINANCIAL AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <section className="surface-card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-display text-sm font-bold text-[#101C3A]">
              Immutable Financial Audit Trail
            </h2>
            <p className="text-xs text-[#68748A] mt-0.5">
              Every automatic fine creation, payment verification, pending hold, and documented
              waiver is permanently logged with actor identity and Asia/Karachi timestamp.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-[#F5F7FC] text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                  <th className="py-3.5 px-4 whitespace-nowrap">Timestamp (PKT)</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Transaction</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Student</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Event &amp; Transition</th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap">Amount (PKR)</th>
                  <th className="py-3.5 px-4">Documented Reason / Reference</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Performed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F5F7FC]/70 transition-colors align-top">
                    <td className="py-3.5 px-4 font-mono text-[#68748A] tabular-nums whitespace-nowrap">
                      {formatAuditTimestamp(log.performedAt)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A] whitespace-nowrap">
                      {log.transactionId}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-semibold text-[#101C3A]">{log.studentName}</div>
                      <div className="font-mono text-[11px] text-[#68748A]">
                        ERP {log.studentErp}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-semibold text-[#101C3A]">
                        {AUDIT_ACTION_LABELS[log.actionType]}
                      </div>
                      <div className="font-mono text-[11px] text-[#68748A] mt-1 flex items-center gap-1.5">
                        <span>{log.previousStatus ? `${log.previousStatus} →` : 'NEW →'}</span>
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                            STATUS_BADGE_CLASS[log.newStatus]
                          }`}
                        >
                          {log.newStatus}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-[#101C3A] whitespace-nowrap">
                      PKR {log.amountPkr.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-[#172033] max-w-md">
                      <div>{log.reason}</div>
                      {(log.paymentReference || log.paymentMethod) && (
                        <div className="mt-1 font-mono text-[11px] text-[#68748A]">
                          {log.paymentReference ? `Ref: ${log.paymentReference}` : ''}
                          {log.paymentReference && log.paymentMethod ? ' · ' : ''}
                          {log.paymentMethod ?? ''}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-semibold text-[#101C3A]">{log.performedByName}</div>
                      <div className="font-mono text-[11px] text-[#68748A]">
                        {log.performedById}
                      </div>
                    </td>
                  </tr>
                ))}

                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-[#68748A]">
                      No financial audit events recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* PAYMENT VERIFICATION / PENDING / WAIVER MODAL */}
      {actionModal && (
        <div
          className="fixed inset-0 z-50 bg-[#0A1329]/55 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="financial-modal-title"
        >
          <div className="bg-white border border-slate-200/80 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-100 bg-[#F5F7FC]/75 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {actionModal.mode === 'PAID' && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
                )}
                {actionModal.mode === 'PENDING' && (
                  <Clock className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
                )}
                {actionModal.mode === 'WAIVED' && (
                  <ShieldCheck className="h-4 w-4 text-[#315EF2] shrink-0" aria-hidden="true" />
                )}
                <h3
                  id="financial-modal-title"
                  className="font-display text-sm font-bold text-[#101C3A]"
                >
                  {actionModal.mode === 'PAID'
                    ? 'Record & Verify Payment (Mark PAID)'
                    : actionModal.mode === 'PENDING'
                      ? 'Mark Payment Pending Verification'
                      : actionModal.mode === 'WAIVED'
                        ? 'Waive Fine with Documented Reason'
                        : 'Return Transaction to UNPAID'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[#68748A] hover:text-[#101C3A] hover:bg-slate-200/60 cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleModalSubmit(e)} className="p-6 space-y-4">
              {/* Immutable Transaction Summary */}
              <div className="rounded-xl bg-[#F5F7FC] border border-slate-200/70 p-4 text-xs space-y-2">
                <div className="flex justify-between gap-2">
                  <span className="text-[#68748A]">Transaction / Violation</span>
                  <span className="font-mono font-semibold text-[#101C3A]">
                    {actionModal.entry.id}
                    {actionModal.entry.violationId ? ` · ${actionModal.entry.violationId}` : ''}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#68748A]">Student</span>
                  <span className="font-semibold text-[#101C3A]">
                    {actionModal.entry.studentName} (ERP {actionModal.entry.studentErp})
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#68748A]">Immutable Fine Amount</span>
                  <span className="font-mono font-bold text-[#101C3A] tabular-nums">
                    PKR {actionModal.entry.amountPkr.toLocaleString()}
                  </span>
                </div>
              </div>

              {(actionModal.mode === 'PAID' || actionModal.mode === 'PENDING') && (
                <>
                  <div>
                    <label
                      htmlFor="fin-payment-ref"
                      className="block text-xs font-semibold text-[#101C3A] mb-1.5"
                    >
                      Payment Receipt / Voucher Reference
                    </label>
                    <input
                      id="fin-payment-ref"
                      type="text"
                      maxLength={80}
                      value={modalRef}
                      onChange={(e) => setModalRef(e.target.value)}
                      placeholder="e.g. RCP-2026-8841 or Bank Challan #"
                      className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-slate-200 bg-white text-[#101C3A] focus:border-[#315EF2]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="fin-payment-method"
                      className="block text-xs font-semibold text-[#101C3A] mb-1.5"
                    >
                      Payment Channel
                    </label>
                    <select
                      id="fin-payment-method"
                      value={modalMethod}
                      onChange={(e) => setModalMethod(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label
                  htmlFor="fin-audit-reason"
                  className="block text-xs font-semibold text-[#101C3A] mb-1.5"
                >
                  {actionModal.mode === 'WAIVED'
                    ? 'Documented Waiver Reason (Required for Audit Trail)'
                    : 'Verification / Audit Notes (Optional)'}
                </label>
                <textarea
                  id="fin-audit-reason"
                  rows={3}
                  maxLength={400}
                  required={actionModal.mode === 'WAIVED'}
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  placeholder={
                    actionModal.mode === 'WAIVED'
                      ? 'Specify official justification (e.g., Medical emergency verified by Student Affairs, sensor hardware fault)...'
                      : actionModal.mode === 'PAID'
                        ? 'Optional note confirming manual receipt verification at IBA Campus Bursar...'
                        : 'Optional note for the financial audit log...'
                  }
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
                />
              </div>

              {modalError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700 font-medium">
                  {modalError}
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setActionModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-[#68748A] cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingModal}
                  className={`px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-xs transition-all cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                    actionModal.mode === 'PAID'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : actionModal.mode === 'PENDING'
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-[#315EF2] hover:bg-[#244AD4]'
                  }`}
                >
                  {submittingModal
                    ? 'Saving...'
                    : actionModal.mode === 'PAID'
                      ? 'Confirm Payment Verified'
                      : actionModal.mode === 'PENDING'
                        ? 'Set Status to PENDING'
                        : actionModal.mode === 'WAIVED'
                          ? 'Approve Official Waiver'
                          : 'Return to UNPAID'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
