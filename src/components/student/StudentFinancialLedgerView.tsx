import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Lock,
  Search,
  ShieldCheck,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  FinancialSummary,
  LedgerEntry,
  PaymentStatus,
  StudentProfile,
  ViolationPolicyMeta,
} from '../../types/ils';
import { PageHeader } from '../shared/DesignSystem';

interface StudentFinancialLedgerViewProps {
  student: StudentProfile;
  entries: LedgerEntry[];
  summary: FinancialSummary;
  violationPolicy: ViolationPolicyMeta;
}

const STATUS_META: Record<
  PaymentStatus,
  { label: string; badgeClass: string; description: string }
> = {
  UNPAID: {
    label: 'UNPAID',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200/80',
    description: 'Fine generated, awaiting payment',
  },
  PENDING: {
    label: 'PENDING',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
    description: 'Payment awaiting verification',
  },
  PAID: {
    label: 'PAID',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    description: 'Payment verified by administration',
  },
  WAIVED: {
    label: 'WAIVED',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    description: 'Fine officially waived',
  },
};

export const StudentFinancialLedgerView: React.FC<StudentFinancialLedgerViewProps> = ({
  student,
  entries,
  summary,
  violationPolicy,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const computedSummary = useMemo<FinancialSummary>(() => {
    if (entries.length === 0 && summary.counts.total === 0) return summary;
    let totalFinesGeneratedPkr = 0;
    let totalPaidPkr = 0;
    let totalWaivedPkr = 0;
    let unpaidAmountPkr = 0;
    let pendingAmountPkr = 0;
    let unpaid = 0;
    let pending = 0;
    let paid = 0;
    let waived = 0;

    for (const e of entries) {
      totalFinesGeneratedPkr += e.amountPkr;
      if (e.status === 'UNPAID') {
        unpaidAmountPkr += e.amountPkr;
        unpaid += 1;
      } else if (e.status === 'PENDING') {
        pendingAmountPkr += e.amountPkr;
        pending += 1;
      } else if (e.status === 'PAID') {
        totalPaidPkr += e.amountPkr;
        paid += 1;
      } else if (e.status === 'WAIVED') {
        totalWaivedPkr += e.amountPkr;
        waived += 1;
      }
    }

    return {
      totalFinesGeneratedPkr,
      totalPaidPkr,
      totalWaivedPkr,
      outstandingBalancePkr: unpaidAmountPkr + pendingAmountPkr,
      unpaidAmountPkr,
      pendingAmountPkr,
      counts: {
        total: entries.length,
        unpaid,
        pending,
        paid,
        waived,
      },
    };
  }, [entries, summary]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (statusFilter !== 'ALL' && entry.status !== statusFilter) return false;
      if (!q) return true;
      return (
        entry.id.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q) ||
        (entry.seatId ?? '').toLowerCase().includes(q) ||
        (entry.violationId ?? '').toLowerCase().includes(q) ||
        entry.referenceId.toLowerCase().includes(q) ||
        entry.date.toLowerCase().includes(q)
      );
    });
  }, [entries, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Ledger"
        description={`Official read-only PKR statement for ${student.name} (ERP ${student.erpId}). Balances carry forward across monthly resets and are updated only after administrative verification.`}
      />

      {/* Primary Financial Totals (PKR) */}
      <section aria-label="Primary Financial Totals">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="surface-card p-5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#68748A]">Total Fines Generated</span>
              <span className="h-9 w-9 rounded-xl bg-[#EAF0FF] border border-[#DCE6FF] flex items-center justify-center shrink-0">
                <CreditCard className="h-4 w-4 text-[#315EF2]" />
              </span>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-[#101C3A] tabular-nums">
                PKR {computedSummary.totalFinesGeneratedPkr.toLocaleString()}
              </div>
              <div className="mt-1.5 text-xs text-[#68748A]">
                {computedSummary.counts.total} permanent ledger{' '}
                {computedSummary.counts.total === 1 ? 'record' : 'records'} · Rate PKR{' '}
                {violationPolicy.currentFinePkr.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="surface-card p-5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#68748A]">Total Amount Paid</span>
              <span className="h-9 w-9 rounded-xl bg-emerald-50 border border-emerald-200/70 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </span>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-emerald-700 tabular-nums">
                PKR {computedSummary.totalPaidPkr.toLocaleString()}
              </div>
              <div className="mt-1.5 text-xs text-[#68748A]">
                {computedSummary.counts.paid} verified{' '}
                {computedSummary.counts.paid === 1 ? 'payment' : 'payments'} retained permanently
              </div>
            </div>
          </div>

          <div className="surface-card p-5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#68748A]">Outstanding Balance</span>
              <span
                className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${
                  computedSummary.outstandingBalancePkr > 0
                    ? 'bg-rose-50 border-rose-200/80'
                    : 'bg-emerald-50 border-emerald-200/70'
                }`}
              >
                <Wallet
                  className={`h-4 w-4 ${
                    computedSummary.outstandingBalancePkr > 0 ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                />
              </span>
            </div>
            <div>
              <div
                className={`text-2xl sm:text-3xl font-bold tabular-nums ${
                  computedSummary.outstandingBalancePkr > 0 ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                PKR {computedSummary.outstandingBalancePkr.toLocaleString()}
              </div>
              <div className="mt-1.5 text-xs text-[#68748A]">
                {computedSummary.pendingAmountPkr > 0
                  ? `PKR ${computedSummary.unpaidAmountPkr.toLocaleString()} UNPAID · PKR ${computedSummary.pendingAmountPkr.toLocaleString()} PENDING`
                  : 'Preserved across monthly violation resets'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Transaction Breakdown by Status */}
      <section aria-label="Transaction Status Breakdown">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="surface-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#68748A]">
              <span>Unpaid</span>
              <XCircle className="h-4 w-4 text-rose-600 shrink-0" aria-hidden="true" />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold text-rose-700 tabular-nums">
                {computedSummary.counts.unpaid}
              </span>
              <span className="font-mono text-xs font-semibold text-[#172033] tabular-nums">
                PKR {computedSummary.unpaidAmountPkr.toLocaleString()}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-[#68748A]">Fine generated, not yet paid</div>
          </div>

          <div className="surface-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#68748A]">
              <span>Pending Verification</span>
              <Clock className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold text-amber-700 tabular-nums">
                {computedSummary.counts.pending}
              </span>
              <span className="font-mono text-xs font-semibold text-[#172033] tabular-nums">
                PKR {computedSummary.pendingAmountPkr.toLocaleString()}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-[#68748A]">Awaiting Bursar verification</div>
          </div>

          <div className="surface-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#68748A]">
              <span>Paid</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold text-emerald-700 tabular-nums">
                {computedSummary.counts.paid}
              </span>
              <span className="font-mono text-xs font-semibold text-[#172033] tabular-nums">
                PKR {computedSummary.totalPaidPkr.toLocaleString()}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-[#68748A]">Payment verified &amp; settled</div>
          </div>

          <div className="surface-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#68748A]">
              <span>Waived</span>
              <ShieldCheck className="h-4 w-4 text-slate-500 shrink-0" aria-hidden="true" />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold text-[#101C3A] tabular-nums">
                {computedSummary.counts.waived}
              </span>
              <span className="font-mono text-xs font-semibold text-[#172033] tabular-nums">
                PKR {computedSummary.totalWaivedPkr.toLocaleString()}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-[#68748A]">Officially waived with reason</div>
          </div>
        </div>
      </section>

      {/* Settlement & Governance Guidance */}
      <section className="rounded-2xl bg-[#EAF0FF]/65 border border-[#DCE6FF] px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3 text-xs text-[#172033] leading-relaxed">
          <CreditCard className="h-4 w-4 text-[#315EF2] shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <span className="font-bold text-[#101C3A]">
              Manual Payment Verification Protocol (IBA Campus Bursar):
            </span>{' '}
            Settle outstanding PKR fines at the IBA Campus Bursar or Library Operations Desk using
            your Transaction ID and Payment Reference. Payments are never auto-deducted and only
            change to <strong className="text-emerald-700">PAID</strong> after manual administrative
            verification. Online payment gateway support is planned for a future release.
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-[#68748A] shrink-0 whitespace-nowrap">
          <Lock className="h-3.5 w-3.5 text-[#315EF2]" aria-hidden="true" />
          <span>Read-only student ledger</span>
        </div>
      </section>

      {/* Filter Toolbar & Financial Transaction History Table */}
      <section className="surface-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#101C3A]">Financial Transaction History</h2>
            <p className="text-xs text-[#68748A] mt-0.5">
              Historical fine amounts remain fixed at the PKR rate active when each violation occurred.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F5F7FC] border border-slate-200/80 rounded-xl">
              {(['ALL', 'UNPAID', 'PENDING', 'PAID', 'WAIVED'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    statusFilter === status
                      ? 'bg-[#101C3A] text-white'
                      : 'text-[#68748A] hover:text-[#101C3A] hover:bg-white'
                  }`}
                >
                  {status === 'ALL' ? `All (${computedSummary.counts.total})` : status}
                </button>
              ))}
            </div>

            <div className="relative sm:w-56">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ID, ILS, violation..."
                aria-label="Search financial transactions"
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:border-[#315EF2]"
              />
            </div>
          </div>
        </div>

        {/* Mobile Stacked Cards (< sm) */}
        <div className="sm:hidden divide-y divide-slate-100">
          {filteredEntries.map((entry) => {
            const statusMeta = STATUS_META[entry.status] ?? STATUS_META.UNPAID;
            return (
              <div key={entry.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-bold text-[#101C3A]">{entry.id}</span>
                      {entry.seatId && (
                        <span className="font-mono text-[11px] font-bold text-[#315EF2] bg-[#EAF0FF] px-1.5 py-0.5 rounded-md">
                          {entry.seatId}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-[#68748A] tabular-nums mt-0.5">
                      {entry.date} · ERP {entry.studentErp}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm font-bold text-[#101C3A] tabular-nums">
                      PKR {entry.amountPkr.toLocaleString()}
                    </div>
                    <span
                      className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-lg border text-[10px] font-semibold ${statusMeta.badgeClass}`}
                    >
                      {statusMeta.label}
                    </span>
                  </div>
                </div>

                <div className="text-xs font-medium text-[#172033] leading-snug">
                  {entry.description}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#68748A] bg-[#F5F7FC] rounded-xl px-3 py-2">
                  <span>
                    Ref: <strong className="font-mono text-[#101C3A]">{entry.referenceId}</strong>
                  </span>
                  {entry.violationId && (
                    <span className="font-mono text-[#68748A]">Viol. {entry.violationId}</span>
                  )}
                </div>

                {entry.status === 'WAIVED' && entry.waiverReason && (
                  <div className="text-[11px] text-[#68748A]">
                    Waiver reason: {entry.waiverReason}
                  </div>
                )}
                {entry.status === 'PAID' && entry.verifiedByName && (
                  <div className="text-[11px] text-emerald-700 font-medium">
                    Verified by {entry.verifiedByName}
                    {entry.paymentMethod ? ` · ${entry.paymentMethod}` : ''}
                  </div>
                )}
                {entry.status === 'PENDING' && entry.adminNotes && (
                  <div className="text-[11px] text-amber-700">{entry.adminNotes}</div>
                )}
              </div>
            );
          })}

          {filteredEntries.length === 0 && (
            <div className="py-10 px-4 text-center">
              <div className="inline-flex flex-col items-center gap-1.5 text-[#68748A]">
                <FileText className="h-5 w-5 text-slate-300" aria-hidden="true" />
                <div className="text-xs font-semibold text-[#101C3A]">
                  {entries.length === 0
                    ? 'No financial transactions recorded for your account.'
                    : 'No transactions match your current filter.'}
                </div>
                {entries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('ALL');
                      setSearchQuery('');
                    }}
                    className="mt-1 text-xs font-semibold text-[#315EF2] hover:underline cursor-pointer"
                  >
                    Reset filters
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Desktop Table (sm+) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-[#F5F7FC] text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                <th className="py-3.5 px-4 whitespace-nowrap">Transaction ID</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Date</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Student ID</th>
                <th className="py-3.5 px-4">Description</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Related ILS</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Violation ID</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">Fine Amount (PKR)</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Payment Status</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Payment Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredEntries.map((entry) => {
                const statusMeta = STATUS_META[entry.status] ?? STATUS_META.UNPAID;
                return (
                  <tr key={entry.id} className="hover:bg-[#F5F7FC]/70 align-top transition-colors">
                    <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A] whitespace-nowrap">
                      <div>{entry.id}</div>
                      {entry.fineConfigurationId && (
                        <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                          Rate {entry.fineConfigurationId}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#68748A] tabular-nums whitespace-nowrap">
                      {entry.date}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#172033] tabular-nums whitespace-nowrap">
                      {entry.studentErp}
                    </td>
                    <td className="py-3.5 px-4 text-[#172033] max-w-xs">
                      <div className="font-medium text-[#101C3A]">{entry.description}</div>
                      {entry.status === 'WAIVED' && entry.waiverReason && (
                        <div className="mt-1 text-[11px] text-[#68748A]">
                          Waiver reason: {entry.waiverReason}
                        </div>
                      )}
                      {entry.status === 'PAID' && entry.verifiedByName && (
                        <div className="mt-1 text-[11px] text-emerald-700">
                          Verified by {entry.verifiedByName}
                          {entry.paymentMethod ? ` · ${entry.paymentMethod}` : ''}
                        </div>
                      )}
                      {entry.status === 'PENDING' && entry.adminNotes && (
                        <div className="mt-1 text-[11px] text-amber-700">{entry.adminNotes}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-[#315EF2] whitespace-nowrap">
                      {entry.seatId ?? '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#68748A] whitespace-nowrap">
                      {entry.violationId ?? '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-[#101C3A] whitespace-nowrap">
                      PKR {entry.amountPkr.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-lg border text-[11px] font-semibold ${statusMeta.badgeClass}`}
                      >
                        {statusMeta.label}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-1">
                        {statusMeta.description}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#172033] whitespace-nowrap">
                      <div>{entry.referenceId}</div>
                      {entry.paymentMethod && (
                        <div className="font-sans text-[10px] text-slate-400 mt-0.5">
                          {entry.paymentMethod}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center">
                    <div className="inline-flex flex-col items-center gap-1.5 text-[#68748A]">
                      <FileText className="h-5 w-5 text-slate-300" aria-hidden="true" />
                      <div className="text-xs font-semibold text-[#101C3A]">
                        {entries.length === 0
                          ? 'No financial transactions recorded for your account.'
                          : 'No transactions match your current filter.'}
                      </div>
                      {entries.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setStatusFilter('ALL');
                            setSearchQuery('');
                          }}
                          className="mt-1 text-xs font-semibold text-[#315EF2] hover:underline cursor-pointer"
                        >
                          Reset filters
                        </button>
                      )}
                    </div>
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
