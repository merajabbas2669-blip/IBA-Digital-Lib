import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Download,
  FileDown,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  QrCode,
  ReceiptText,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useILS } from '../../context/ILSContext';
import {
  buildSeatQrPayload,
  downloadAllSeatsPrintableSheet,
  downloadSingleSeatQrPng,
} from '../../utils/qr';
import {
  AdminRoute,
  ILSSeat,
  PenaltyConfig,
  SeatZone,
  SystemSettings,
  ViolationRecord,
} from '../../types/ils';
import { BottomNavItemConfig, NavItemConfig, PortalShell } from '../layout/PortalShell';
import { IBACrestMark, PageHeader, QRMatrixSvg } from '../shared/DesignSystem';
import { ConfirmDialog } from '../shared/UxPrimitives';
import { AdminSensorMonitoring } from './AdminSensorMonitoring';
import { AdminFinancialManagementView } from './AdminFinancialManagementView';
import { AdminOverviewDashboard } from './AdminOverviewDashboard';
import { AdminLiveSeatMonitoringView } from './AdminLiveSeatMonitoringView';
import { AdminStudentManagementView } from './AdminStudentManagementView';
import { AdminReportsView } from './AdminReportsView';
import { AdminAnalyticsView } from '../analytics/AdminAnalyticsView';

const RESERVATION_STATUS_BADGE: Record<string, string> = {
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Temporarily Away': 'bg-amber-50 text-amber-700 border-amber-200',
  Completed: 'bg-[#EAF0FF] text-[#315EF2] border-[#DCE6FF]',
  Cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
  Expired: 'bg-rose-50 text-rose-700 border-rose-200',
};

const VIOLATION_STATUS_BADGE: Record<string, string> = {
  Open: 'bg-rose-50 text-rose-700 border-rose-200',
  Resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Waived: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const AdminPortal: React.FC = () => {
  const {
    adminRoute,
    setAdminRoute,
    currentAdmin,
    seats,
    students,
    reservations,
    sensorEvents,
    sensorSystem,
    violations,
    ledger,
    financialSummary,
    financialAuditLogs,
    overviewMetrics,
    adminInterventions,
    penaltyConfig,
    fineConfigHistory,
    violationPolicy,
    systemSettings,
    adminUpdateSeatStatus,
    adminSimulateSensor,
    adminSetDemoTimerMode,
    adminToggleSeatQr,
    adminRegenerateSeatQr,
    adminReleaseReservation,
    adminResolveViolation,
    adminUpdateStudentStatus,
    adminUpdateTransactionStatus,
    adminFetchStudentFinancialLedger,
    adminExportFinancialReport,
    adminFetchReports,
    adminExportAdminReport,
    updatePenaltyConfig,
    updateSystemSettings,
    refreshLiveSeatData,
    syncError,
    logout,
  } = useILS();

  const [manageHubOpen, setManageHubOpen] = useState(false);
  const [hubLogoutConfirm, setHubLogoutConfirm] = useState(false);

  const openViolationsCount = violations.filter((v) => v.status === 'Open').length;
  const offlineSensorsCount = seats.filter(
    (s) => s.sensorPresence === 'OFFLINE' || s.sensorState === 'Offline'
  ).length;

  const navItems: NavItemConfig<AdminRoute>[] = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard, section: 'Operations' },
    { id: 'live-seats', label: 'Live ILS Monitoring', icon: Activity, section: 'Operations' },
    { id: 'qr-codes', label: 'QR Code Management', icon: QrCode, section: 'Operations' },
    { id: 'students', label: 'Student Management', icon: Users, section: 'Directory & Bookings' },
    {
      id: 'reservations',
      label: 'Reservation Management',
      icon: CalendarRange,
      section: 'Directory & Bookings',
    },
    {
      id: 'sensors',
      label: 'Sensor Simulation',
      icon: Cpu,
      badgeCount: offlineSensorsCount,
      section: 'Infrastructure',
    },
    {
      id: 'violations',
      label: 'Violation Management',
      icon: AlertTriangle,
      badgeCount: openViolationsCount,
      section: 'Governance & Finance',
    },
    {
      id: 'financials',
      label: 'Financial Ledger',
      icon: ReceiptText,
      section: 'Governance & Finance',
    },
    {
      id: 'analytics',
      label: 'Occupancy Analytics',
      icon: TrendingUp,
      section: 'Analytics & Reports',
    },
    {
      id: 'reports',
      label: 'Reports & Exports',
      icon: BarChart3,
      section: 'Analytics & Reports',
    },
    {
      id: 'penalties',
      label: 'Fine Configuration',
      icon: SlidersHorizontal,
      section: 'Configuration',
    },
    { id: 'settings', label: 'System Settings', icon: Settings, section: 'Configuration' },
  ];

  const isManageRoute =
    adminRoute === 'students' ||
    adminRoute === 'reservations' ||
    adminRoute === 'violations' ||
    adminRoute === 'financials' ||
    adminRoute === 'penalties' ||
    adminRoute === 'reports' ||
    adminRoute === 'qr-codes' ||
    adminRoute === 'settings';

  const bottomNavItems: BottomNavItemConfig<AdminRoute>[] = [
    {
      id: 'overview',
      label: 'Dashboard',
      icon: LayoutDashboard,
      isActive: !manageHubOpen && adminRoute === 'overview',
      onPress: () => {
        setManageHubOpen(false);
        setAdminRoute('overview');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    },
    {
      id: 'live-seats',
      label: 'Live ILS',
      icon: Activity,
      isActive: !manageHubOpen && adminRoute === 'live-seats',
      onPress: () => {
        setManageHubOpen(false);
        setAdminRoute('live-seats');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    },
    {
      id: 'sensors',
      label: 'Sensors',
      icon: Cpu,
      badgeCount: offlineSensorsCount > 0 ? offlineSensorsCount : undefined,
      isActive: !manageHubOpen && adminRoute === 'sensors',
      onPress: () => {
        setManageHubOpen(false);
        setAdminRoute('sensors');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: TrendingUp,
      isActive: !manageHubOpen && adminRoute === 'analytics',
      onPress: () => {
        setManageHubOpen(false);
        setAdminRoute('analytics');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    },
    {
      id: '__more__',
      label: 'Manage',
      icon: LayoutGrid,
      badgeCount: openViolationsCount > 0 ? openViolationsCount : undefined,
      isActive: manageHubOpen || isManageRoute,
      onPress: () => setManageHubOpen(true),
    },
  ];

  const adminMobileHubItems: Array<{
    id: AdminRoute;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'overview', label: 'Dashboard', subtitle: 'Overview & utilization', icon: LayoutDashboard },
    { id: 'live-seats', label: 'Live ILS Monitoring', subtitle: 'All 30 seats real-time', icon: Activity },
    { id: 'students', label: 'Student Management', subtitle: 'Directory & standing', icon: Users },
    {
      id: 'sensors',
      label: 'Sensor Simulation',
      subtitle: 'IoT presence & timer',
      icon: Cpu,
      badge: offlineSensorsCount,
    },
    { id: 'analytics', label: 'Occupancy Analytics', subtitle: 'Charts & student reports', icon: TrendingUp },
    {
      id: 'violations',
      label: 'Violation Management',
      subtitle: 'Monthly compliance log',
      icon: AlertTriangle,
      badge: openViolationsCount,
    },
    { id: 'financials', label: 'Financial Ledger', subtitle: 'PKR fines & payments', icon: ReceiptText },
    { id: 'penalties', label: 'Fine Configuration', subtitle: 'Rates & grace timing', icon: SlidersHorizontal },
    { id: 'reports', label: 'Reports & Exports', subtitle: 'CSV institutional reports', icon: BarChart3 },
    { id: 'qr-codes', label: 'QR Code Management', subtitle: '30 desk QR plaques', icon: QrCode },
    { id: 'reservations', label: 'Reservations', subtitle: 'Active & past bookings', icon: CalendarRange },
    { id: 'settings', label: 'System Settings', subtitle: 'Library hours & config', icon: Settings },
  ];

  return (
    <PortalShell
      portalTitle="Administrator Portal"
      portalRoleLabel="Library Administration"
      navItems={navItems}
      bottomNavItems={bottomNavItems}
      activeRoute={adminRoute}
      onSelectRoute={(route) => {
        setManageHubOpen(false);
        setAdminRoute(route);
      }}
      userName={currentAdmin.name}
      userMeta={currentAdmin.staffId}
      userAvatar={currentAdmin.avatarUrl}
      accountOriginLabel={
        currentAdmin.isDemo
          ? 'Administrator · Demonstration Staff Account'
          : 'Authorized Administrator'
      }
      mobileBackTarget={isManageRoute ? 'overview' : null}
      mobileRightAction={
        <button
          type="button"
          onClick={() => setManageHubOpen(true)}
          aria-label="Open admin modules"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/15 cursor-pointer"
        >
          <Settings className="h-4.5 w-4.5" />
        </button>
      }
      onRefresh={refreshLiveSeatData}
      syncError={syncError}
      onLogout={() => void logout()}
    >
      {adminRoute === 'overview' && (
        <AdminOverviewDashboard
          metrics={overviewMetrics}
          seats={seats}
          financialSummary={financialSummary}
          interventions={adminInterventions}
          violationPolicy={violationPolicy}
          onNavigate={setAdminRoute}
        />
      )}

      {adminRoute === 'live-seats' && (
        <AdminLiveSeatMonitoringView
          seats={seats}
          reservations={reservations}
          interventions={adminInterventions}
          onUpdateStatus={adminUpdateSeatStatus}
          onReleaseReservation={adminReleaseReservation}
        />
      )}

      {adminRoute === 'qr-codes' && (
        <AdminQrCodesView
          seats={seats}
          onToggleQr={(seatId) => void adminToggleSeatQr(seatId)}
          onRegenerateQr={adminRegenerateSeatQr}
        />
      )}

      {adminRoute === 'students' && (
        <AdminStudentManagementView
          students={students}
          reservations={reservations}
          violations={violations}
          ledger={ledger}
          violationPolicy={violationPolicy}
          onUpdateStudentStatus={adminUpdateStudentStatus}
          onExportStudentLedger={adminExportFinancialReport}
        />
      )}

      {adminRoute === 'reservations' && (
        <AdminReservationsView
          reservations={reservations}
          onRelease={(id) => void adminReleaseReservation(id)}
        />
      )}

      {adminRoute === 'sensors' && (
        <AdminSensorMonitoring
          seats={seats}
          sensorEvents={sensorEvents}
          sensorSystem={sensorSystem}
          maxAwayMinutes={penaltyConfig.maxAwayMinutes}
          onSimulateSensor={adminSimulateSensor}
          onSetDemoTimerMode={adminSetDemoTimerMode}
        />
      )}

      {adminRoute === 'violations' && (
        <AdminViolationsView
          violations={violations}
          violationPolicy={violationPolicy}
          onReviewViolation={adminResolveViolation}
        />
      )}

      {adminRoute === 'financials' && (
        <AdminFinancialManagementView
          ledger={ledger}
          students={students}
          auditLogs={financialAuditLogs}
          violationPolicy={violationPolicy}
          onUpdateTransaction={adminUpdateTransactionStatus}
          onFetchStudentLedger={adminFetchStudentFinancialLedger}
          onExportReport={adminExportFinancialReport}
          onExportMonthlyFines={() => adminExportAdminReport('monthly-fines')}
        />
      )}

      {adminRoute === 'analytics' && (
        <AdminAnalyticsView students={students} totalSeats={seats.length || 30} />
      )}

      {adminRoute === 'reports' && (
        <AdminReportsView
          onFetchReports={adminFetchReports}
          onExportReport={adminExportAdminReport}
        />
      )}

      {adminRoute === 'penalties' && (
        <AdminPenaltyConfigView
          config={penaltyConfig}
          history={fineConfigHistory}
          violationPolicy={violationPolicy}
          onSave={updatePenaltyConfig}
        />
      )}

      {adminRoute === 'settings' && (
        <AdminSystemSettingsView settings={systemSettings} onSave={updateSystemSettings} />
      )}

      {/* Mobile Administrator Modules Hub Sheet (< lg) */}
      {manageHubOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex items-end justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Administrator Modules"
        >
          <div
            className="fixed inset-0 bg-[#0A1329]/65 backdrop-blur-[2px]"
            onClick={() => setManageHubOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-lg max-h-[88vh] flex flex-col bg-white rounded-t-3xl shadow-2xl overflow-hidden pb-safe">
            <div className="px-5 pt-3 pb-4 border-b border-slate-100 shrink-0">
              <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <IBACrestMark size="sm" />
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-bold text-[#101C3A] truncate">
                      Admin Management Hub
                    </h2>
                    <p className="text-xs text-[#68748A] truncate">
                      {currentAdmin.name} · {currentAdmin.staffId}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setManageHubOpen(false)}
                  aria-label="Close admin menu"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {adminMobileHubItems.map((item) => {
                const Icon = item.icon;
                const active = adminRoute === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setManageHubOpen(false);
                      setAdminRoute(item.id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`w-full min-h-[56px] px-3.5 py-2.5 rounded-2xl border flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#EAF0FF] border-[#315EF2]/40 text-[#101C3A]'
                        : 'bg-white border-slate-200/80 hover:bg-[#F5F7FC] text-[#101C3A]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                          active ? 'bg-[#315EF2] text-white' : 'bg-[#F5F7FC] text-[#101C3A]'
                        }`}
                      >
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{item.label}</div>
                        <div className="text-[11px] text-[#68748A] truncate">{item.subtitle}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {typeof item.badge === 'number' && item.badge > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 font-mono text-[11px] font-bold text-rose-700 tabular-nums">
                          {item.badge}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </button>
                );
              })}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setManageHubOpen(false);
                    setHubLogoutConfirm(true);
                  }}
                  className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-sm font-bold cursor-pointer active:scale-[0.98] transition-all"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={hubLogoutConfirm}
        title="Sign out of Administrator Portal?"
        description={`You are signed in as ${currentAdmin.name} (${currentAdmin.staffId}).`}
        confirmLabel="Sign Out"
        cancelLabel="Stay Signed In"
        tone="danger"
        icon={<LogOut className="h-5 w-5" />}
        onConfirm={() => {
          setHubLogoutConfirm(false);
          void logout();
        }}
        onCancel={() => setHubLogoutConfirm(false)}
      />
    </PortalShell>
  );
};

/* ---------------- 3. QR CODE MANAGEMENT ---------------- */
const AdminQrCodesView: React.FC<{
  seats: ILSSeat[];
  onToggleQr: (seatId: string) => void;
  onRegenerateQr: (
    seatId: string
  ) => Promise<{ ok: boolean; message: string; qrCodeToken?: string }>;
}> = ({ seats, onToggleQr, onRegenerateQr }) => {
  const [zoneFilter, setZoneFilter] = useState<SeatZone | 'all'>('all');
  const [query, setQuery] = useState('');
  const [downloadingSheet, setDownloadingSheet] = useState(false);
  const [downloadingSeatId, setDownloadingSeatId] = useState<string | null>(null);
  const [confirmRegenSeatId, setConfirmRegenSeatId] = useState<string | null>(null);
  const [regeneratingSeatId, setRegeneratingSeatId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const filtered = useMemo(
    () =>
      seats.filter((s) => {
        if (zoneFilter !== 'all' && s.zone !== zoneFilter) return false;
        if (
          query.trim() &&
          !`${s.id} ${s.qrCodeToken} ${s.zone}`.toLowerCase().includes(query.toLowerCase())
        ) {
          return false;
        }
        return true;
      }),
    [seats, zoneFilter, query]
  );

  const activeQrCount = seats.filter((s) => s.qrActive).length;

  const handleDownloadSingle = async (seat: ILSSeat) => {
    setDownloadingSeatId(seat.id);
    try {
      await downloadSingleSeatQrPng(seat);
      setFeedback({ ok: true, message: `Downloaded print-ready QR plaque for ${seat.id}.` });
    } finally {
      setDownloadingSeatId(null);
    }
  };

  const handleDownloadAllSheet = async () => {
    setDownloadingSheet(true);
    try {
      await downloadAllSeatsPrintableSheet(seats);
      setFeedback({
        ok: true,
        message:
          'Downloaded printable A4 sheet containing all 30 ILS QR codes (ILS-01 to ILS-30).',
      });
    } finally {
      setDownloadingSheet(false);
    }
  };

  const handleConfirmRegenerate = async (seatId: string) => {
    setRegeneratingSeatId(seatId);
    const res = await onRegenerateQr(seatId);
    setRegeneratingSeatId(null);
    setConfirmRegenSeatId(null);
    setFeedback({ ok: res.ok, message: res.message });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="QR Code Management"
        description="Permanent, scannable QR identifiers for all 30 Individual Learning Spaces (ILS-01 to ILS-30). No student credentials or sensitive data are stored inside QR codes."
        action={
          <button
            type="button"
            disabled={downloadingSheet || seats.length === 0}
            onClick={() => void handleDownloadAllSheet()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] disabled:opacity-60 text-white text-xs font-semibold shadow-sm shadow-[#315EF2]/20 transition-all cursor-pointer whitespace-nowrap"
          >
            <FileDown className="h-4 w-4 shrink-0" />
            <span>
              {downloadingSheet
                ? 'Preparing Printable Sheet...'
                : 'Download Printable Sheet (All 30)'}
            </span>
          </button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="surface-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#68748A]">
              Registered Permanent QR Codes
            </span>
            <span className="h-9 w-9 rounded-xl bg-[#EAF0FF] text-[#315EF2] flex items-center justify-center">
              <QrCode className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-[#101C3A] tabular-nums">
            {String(seats.length).padStart(2, '0')}
          </div>
          <div className="mt-1 text-xs text-[#68748A]">
            1-to-1 mapped to ILS-01 through ILS-30
          </div>
        </div>
        <div className="surface-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#68748A]">
              Active for Student Scanning
            </span>
            <span className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-emerald-700 tabular-nums">
            {String(activeQrCount).padStart(2, '0')}
          </div>
          <div className="mt-1 text-xs text-[#68748A]">
            {seats.length - activeQrCount} suspended or in maintenance
          </div>
        </div>
        <div className="surface-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#68748A]">QR Security Standard</span>
            <span className="h-9 w-9 rounded-xl bg-teal-50 text-[#0F8B7C] flex items-center justify-center">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3 font-display text-lg font-bold text-[#101C3A]">
            Opaque Seat URL Token
          </div>
          <div className="mt-1 text-xs text-[#68748A]">
            Zero passwords or student PII embedded
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-2xl px-4 py-3.5 border text-xs font-medium flex items-center justify-between gap-3 ${
            feedback.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold hover:underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="surface-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative max-w-xs w-full">
          <Search className="h-4 w-4 text-[#68748A] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by ILS ID or QR token..."
            className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F5F7FC] border border-slate-200/80 rounded-xl">
          {(['all', 'Quiet Zone A', 'Research Zone B', 'Focus Zone C'] as const).map((zone) => (
            <button
              key={zone}
              type="button"
              onClick={() => setZoneFilter(zone)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                zoneFilter === zone
                  ? 'bg-[#101C3A] text-white shadow-xs'
                  : 'text-[#68748A] hover:text-[#101C3A]'
              }`}
            >
              {zone === 'all' ? 'All 30' : zone}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((seat) => {
          const qrPayload = buildSeatQrPayload(seat.qrCodeToken);
          const isConfirmingRegen = confirmRegenSeatId === seat.id;
          const isRegenerating = regeneratingSeatId === seat.id;
          const isDownloading = downloadingSeatId === seat.id;

          return (
            <div
              key={seat.id}
              className="surface-card p-5 flex flex-col justify-between gap-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-4">
                <QRMatrixSvg value={qrPayload} size={96} dimmed={!seat.qrActive} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-base font-bold text-[#101C3A] tabular-nums">
                      {seat.id}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border ${
                        seat.qrActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {seat.qrActive ? 'Active' : 'Suspended'}
                    </span>
                  </div>
                  <div className="text-xs text-[#68748A] truncate">
                    {seat.zone} · {seat.floor}
                  </div>
                  <div className="text-[11px] text-[#68748A]">
                    Seat State:{' '}
                    <span className="font-semibold text-[#101C3A] capitalize">{seat.status}</span>
                  </div>
                  <div
                    className="font-mono text-[11px] text-[#68748A] bg-[#F5F7FC] px-2 py-1 rounded-md truncate"
                    title={seat.qrCodeToken}
                  >
                    {seat.qrCodeToken}
                  </div>
                </div>
              </div>

              {isConfirmingRegen ? (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 space-y-2.5">
                  <p className="text-[11px] text-amber-900 leading-relaxed">
                    Regenerating invalidates the current printed QR on{' '}
                    <span className="font-mono font-semibold">{seat.id}</span>. Continue?
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isRegenerating}
                      onClick={() => void handleConfirmRegenerate(seat.id)}
                      className="px-3 py-1.5 rounded-lg bg-[#315EF2] hover:bg-[#244AD4] text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                    >
                      {isRegenerating ? 'Regenerating...' : 'Confirm Regenerate'}
                    </button>
                    <button
                      type="button"
                      disabled={isRegenerating}
                      onClick={() => setConfirmRegenSeatId(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-medium text-[#172033] cursor-pointer whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isDownloading}
                      onClick={() => void handleDownloadSingle(seat)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#EAF0FF] hover:border-[#DCE6FF] hover:text-[#315EF2] text-xs font-semibold text-[#101C3A] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Download className="h-3.5 w-3.5 text-[#315EF2]" />
                      <span>{isDownloading ? 'Saving...' : 'Download PNG'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRegenSeatId(seat.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-[#68748A] hover:text-[#101C3A] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Regenerate</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleQr(seat.id)}
                    className="text-xs font-semibold text-[#315EF2] hover:text-[#244AD4] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    {seat.qrActive ? 'Suspend' : 'Activate'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ---------------- 5. RESERVATION MANAGEMENT ---------------- */
const AdminReservationsView: React.FC<{
  reservations: ReturnType<typeof useILS>['reservations'];
  onRelease: (reservationId: string) => void;
}> = ({ reservations, onRelease }) => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () =>
      reservations.filter((r) => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (
          query.trim() &&
          !`${r.id} ${r.seatId} ${r.studentName} ${r.studentErp}`
            .toLowerCase()
            .includes(query.toLowerCase())
        ) {
          return false;
        }
        return true;
      }),
    [reservations, statusFilter, query]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reservation Management"
        description="Monitor active and historical ILS reservations and release seats when needed."
      />

      <div className="surface-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative max-w-xs w-full">
          <Search className="h-4 w-4 text-[#68748A] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reservation, seat, or ERP..."
            className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F5F7FC] border border-slate-200/80 rounded-xl">
          {['all', 'Active', 'Temporarily Away', 'Completed', 'Cancelled'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === status
                  ? 'bg-[#101C3A] text-white shadow-xs'
                  : 'text-[#68748A] hover:text-[#101C3A]'
              }`}
            >
              {status === 'all' ? 'All' : status}
            </button>
          ))}
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-[#F5F7FC] text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                <th className="py-3.5 px-4">ID</th>
                <th className="py-3.5 px-4">Seat</th>
                <th className="py-3.5 px-4">Student</th>
                <th className="py-3.5 px-4">Date &amp; Window</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-[#F5F7FC]/70 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A]">{r.id}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-[#101C3A]">{r.seatId}</td>
                  <td className="py-3.5 px-4">
                    <span className="font-semibold text-[#101C3A]">{r.studentName}</span>
                    <span className="ml-2 font-mono text-[#68748A]">ERP {r.studentErp}</span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#68748A] tabular-nums">
                    {r.date} · {r.startTime}–{r.endTime}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-block px-2.5 py-0.5 text-[11px] font-semibold rounded-md border ${
                        RESERVATION_STATUS_BADGE[r.status] ??
                        'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {r.status === 'Active' || r.status === 'Temporarily Away' ? (
                      <button
                        type="button"
                        onClick={() => onRelease(r.id)}
                        className="text-xs font-semibold text-rose-700 hover:underline cursor-pointer whitespace-nowrap"
                      >
                        Release Seat
                      </button>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ---------------- 7. VIOLATIONS & PENALTIES ---------------- */
const AdminViolationsView: React.FC<{
  violations: ViolationRecord[];
  violationPolicy: ReturnType<typeof useILS>['violationPolicy'];
  onReviewViolation: (
    id: string,
    resolution: 'Resolved' | 'Waived' | 'Warning' | 'Fine Issued',
    reason: string
  ) => Promise<{ ok: boolean; message: string }>;
}> = ({ violations, violationPolicy, onReviewViolation }) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'Open' | 'Resolved' | 'Waived'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewTarget, setReviewTarget] = useState<ViolationRecord | null>(null);
  const [resolutionChoice, setResolutionChoice] = useState<
    'Resolved' | 'Waived' | 'Warning' | 'Fine Issued'
  >('Resolved');
  const [reviewReason, setReviewReason] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return violations.filter((v) => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (!q) return true;
      return (
        v.id.toLowerCase().includes(q) ||
        v.studentName.toLowerCase().includes(q) ||
        v.studentErp.toLowerCase().includes(q) ||
        v.seatId.toLowerCase().includes(q) ||
        (v.calendarMonth ?? '').toLowerCase().includes(q)
      );
    });
  }, [searchQuery, statusFilter, violations]);

  const currentMonthViolations = violations.filter(
    (v) => v.calendarMonth === violationPolicy.currentMonth
  ).length;

  const openReviewModal = (vio: ViolationRecord) => {
    setReviewTarget(vio);
    setResolutionChoice(vio.status === 'Waived' ? 'Resolved' : 'Waived');
    setReviewReason('');
    setModalError(null);
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;
    const cleanReason = reviewReason.trim();
    if (cleanReason.length < 5) {
      setModalError(
        'Enter a documented administrative reason (at least 5 characters) for the audit log.'
      );
      return;
    }
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await onReviewViolation(reviewTarget.id, resolutionChoice, cleanReason);
      if (!res.ok) {
        setModalError(res.message);
        return;
      }
      setReviewTarget(null);
      setFeedback(res);
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Violation Management"
        description="Permanent violation log under the monthly Asia/Karachi policy: 1st violation = Warning only (PKR 0); 2nd, 3rd, and subsequent violations = configured PKR fine. All reviews and corrections require a documented reason."
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="surface-card p-5">
          <div className="text-xs font-medium text-[#68748A]">
            Active Cycle ({violationPolicy.timezone})
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[#101C3A] tabular-nums">
            {violationPolicy.currentMonth}
          </div>
          <div className="mt-1.5 text-xs text-[#68748A]">
            Next automatic reset: {violationPolicy.nextResetDate}
          </div>
        </div>
        <div className="surface-card p-5">
          <div className="text-xs font-medium text-[#68748A]">Violations This Month</div>
          <div className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
            {currentMonthViolations}
          </div>
          <div className="mt-1.5 text-xs text-[#68748A]">
            {violations.length} permanent historical records retained
          </div>
        </div>
        <div className="surface-card p-5">
          <div className="text-xs font-medium text-[#68748A]">
            Active Fine Rate (2nd+ Violation)
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-rose-700 tabular-nums">
            PKR {violationPolicy.currentFinePkr.toLocaleString()}
          </div>
          <div className="mt-1.5 text-xs text-[#68748A]">
            Config {violationPolicy.activeConfigId} · 1st violation is warning only
          </div>
        </div>
      </div>

      <div className="surface-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F5F7FC] border border-slate-200/80 rounded-xl w-fit">
          {(['all', 'Open', 'Resolved', 'Waived'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === status
                  ? 'bg-[#101C3A] text-white shadow-xs'
                  : 'text-[#68748A] hover:text-[#101C3A]'
              }`}
            >
              {status === 'all' ? 'All Records' : status}
            </button>
          ))}
        </div>

        <div className="relative sm:w-72">
          <Search className="h-4 w-4 text-[#68748A] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student, ERP, ILS, violation ID..."
            aria-label="Search violations"
            className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
          />
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-[#F5F7FC] text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                <th className="py-3.5 px-4 whitespace-nowrap">Student Name</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Student ID</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Violation Date</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Monthly #</th>
                <th className="py-3.5 px-4 whitespace-nowrap">ILS</th>
                <th className="py-3.5 px-4">Warning / Fine Status</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">Fine Amount (PKR)</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">Review / Correct</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.map((v) => (
                <tr key={v.id} className="hover:bg-[#F5F7FC]/70 transition-colors align-top">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-[#101C3A]">{v.studentName}</div>
                    <div className="font-mono text-[10px] text-[#68748A]">{v.id}</div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#101C3A] whitespace-nowrap tabular-nums">
                    {v.studentErp}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#68748A] whitespace-nowrap tabular-nums">
                    <div>{v.date}</div>
                    <div className="text-[10px] text-slate-400">{v.calendarMonth ?? '—'}</div>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-[#101C3A] whitespace-nowrap tabular-nums">
                    #{v.monthlyViolationNumber ?? 1}
                  </td>
                  <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A] whitespace-nowrap">
                    {v.seatId}
                  </td>
                  <td className="py-3.5 px-4 max-w-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#101C3A]">{v.severity}</span>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border ${
                          VIOLATION_STATUS_BADGE[v.status] ??
                          'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {v.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#68748A] mt-1">{v.type}</div>
                    {v.reviewNote && (
                      <div className="mt-1 text-[11px] text-[#315EF2]">
                        Review Note: {v.reviewNote}
                        {v.reviewedByName ? ` (${v.reviewedByName})` : ''}
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-[#101C3A] whitespace-nowrap">
                    {v.finePkr > 0 ? `PKR ${v.finePkr.toLocaleString()}` : 'PKR 0 (Warning)'}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openReviewModal(v)}
                      className="text-xs font-semibold text-[#315EF2] hover:text-[#244AD4] hover:underline cursor-pointer"
                    >
                      Review / Correct
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#68748A]">
                    No violation records match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Documented Violation Review / Correction Modal */}
      {reviewTarget && (
        <div
          className="fixed inset-0 z-50 bg-[#0A1329]/55 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="violation-review-title"
        >
          <div className="bg-white border border-slate-200/80 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-100 bg-[#F5F7FC]/70 flex items-center justify-between gap-3">
              <div>
                <h3
                  id="violation-review-title"
                  className="font-display text-sm font-bold text-[#101C3A]"
                >
                  Review / Correct Violation — {reviewTarget.id}
                </h3>
                <p className="text-xs text-[#68748A] mt-0.5">
                  {reviewTarget.studentName} (ERP {reviewTarget.studentErp}) · {reviewTarget.seatId}{' '}
                  · Monthly #{reviewTarget.monthlyViolationNumber ?? 1}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[#68748A] hover:text-[#101C3A] hover:bg-slate-200/60 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleReviewSubmit(e)} className="p-6 space-y-4">
              {modalError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-800 font-medium">
                  {modalError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#101C3A] mb-1.5">
                  Updated Violation Status
                </label>
                <select
                  value={resolutionChoice}
                  onChange={(e) =>
                    setResolutionChoice(
                      e.target.value as 'Resolved' | 'Waived' | 'Warning' | 'Fine Issued'
                    )
                  }
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
                >
                  <option value="Resolved">Resolved (Mark Linked Fine PAID)</option>
                  <option value="Waived">
                    Waived (Officially Waive Violation &amp; Linked Fine)
                  </option>
                  <option value="Warning">Correct to Warning Only (Waives Linked Fine)</option>
                  <option value="Fine Issued">Reopen as Fine Issued (UNPAID)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#101C3A] mb-1.5">
                  Documented Administrative Reason (Required)
                </label>
                <textarea
                  rows={3}
                  required
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  placeholder="Document why this violation is being resolved, waived, or corrected (min 5 characters)..."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReviewTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-[#68748A] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] disabled:opacity-60 text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Save Review & Log Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------------- 9. PENALTY CONFIGURATION ---------------- */
const AdminPenaltyConfigView: React.FC<{
  config: PenaltyConfig;
  history: PenaltyConfig[];
  violationPolicy: ReturnType<typeof useILS>['violationPolicy'];
  onSave: (next: PenaltyConfig) => Promise<{ ok: boolean; message: string }>;
}> = ({ config, history, violationPolicy, onSave }) => {
  const [draft, setDraft] = useState<PenaltyConfig>({
    ...config,
    warningAfterMinutes: config.warningAfterMinutes ?? Math.max(1, config.maxAwayMinutes - 5),
    monthlyResetEnabled: config.monthlyResetEnabled ?? true,
    firstViolationWarningOnly: config.firstViolationWarningOnly ?? true,
  });
  const [savedMsg, setSavedMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setDraft({
      ...config,
      warningAfterMinutes: config.warningAfterMinutes ?? Math.max(1, config.maxAwayMinutes - 5),
      monthlyResetEnabled: config.monthlyResetEnabled ?? true,
      firstViolationWarningOnly: config.firstViolationWarningOnly ?? true,
    });
  }, [config]);

  const warningAfter = draft.warningAfterMinutes ?? Math.max(1, draft.maxAwayMinutes - 5);
  const warningLeadMinutes = Math.max(0, draft.maxAwayMinutes - warningAfter);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (warningAfter < 1 || warningAfter >= draft.maxAwayMinutes) {
      setSavedMsg({
        ok: false,
        text: 'Warning timing must be at least 1 minute and strictly less than the absence grace period.',
      });
      return;
    }
    const res = await onSave({
      ...draft,
      warningAfterMinutes: warningAfter,
    });
    setSavedMsg({ ok: res.ok, text: res.message });
    setTimeout(() => setSavedMsg(null), 4000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Penalty Configuration"
        description="Configure the PKR fine amount, absence grace period, five-minute warning timing, monthly reset policy, and violation penalty rules. Updates apply strictly to future violations and never alter historical fines."
      />

      <div className="surface-card px-6 py-5 max-w-4xl space-y-3 text-xs text-[#68748A]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span>
            Active Config:{' '}
            <strong className="font-mono text-[#101C3A]">
              {config.configurationId ?? 'CFG-2026-01'}
            </strong>
          </span>
          <span>
            Effective Date:{' '}
            <strong className="font-mono text-[#101C3A] tabular-nums">
              {config.effectiveDate ?? '2026-09-01'}
            </strong>
          </span>
          <span>
            Updated By:{' '}
            <strong className="text-[#101C3A]">
              {config.updatedByName ?? config.updatedByAdministrator ?? 'IBA-LIB-014'}
            </strong>
          </span>
          <span>
            Next Monthly Reset:{' '}
            <strong className="font-mono text-[#315EF2]">{violationPolicy.nextResetDate}</strong>
          </span>
        </div>
        <div className="pt-3 border-t border-slate-100 text-[#172033] leading-relaxed">
          <strong className="text-[#101C3A]">
            Active Policy Rules ({violationPolicy.timezone}):
          </strong>{' '}
          1st absence expiry in a calendar month issues a{' '}
          <strong>
            {draft.firstViolationWarningOnly
              ? 'written warning only (PKR 0)'
              : `PKR ${draft.noShowFinePkr} fine`}
          </strong>
          . The 2nd, 3rd, and every subsequent violation in the same month generates a separate{' '}
          <strong className="text-rose-700">UNPAID</strong> fine of{' '}
          <strong className="font-mono text-[#101C3A]">
            PKR {draft.noShowFinePkr.toLocaleString()}
          </strong>
          . Warning triggers after <strong className="font-mono">{warningAfter} min</strong> (
          {warningLeadMinutes} min before the{' '}
          <strong className="font-mono">{draft.maxAwayMinutes}-min</strong> auto-expiry).
        </div>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="surface-card p-6 max-w-4xl space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="sm:col-span-2 p-5 rounded-2xl bg-[#F5F7FC] border border-slate-200/80">
            <label className="block text-xs font-bold text-[#101C3A] mb-1">
              Violation Fine Amount (PKR) — Applied to 2nd &amp; Subsequent Monthly Violations
            </label>
            <p className="text-[11px] text-[#68748A] mb-3">
              Each new fine snapshots this PKR amount into its financial transaction. Changing this
              value will never alter previously issued fines.
            </p>
            <input
              type="number"
              min={0}
              max={1000000}
              step={50}
              value={draft.noShowFinePkr}
              onChange={(e) => setDraft({ ...draft, noShowFinePkr: Number(e.target.value) || 0 })}
              className="w-full sm:w-64 px-4 py-2.5 text-base font-mono font-bold tabular-nums rounded-xl border border-slate-200 bg-white focus:border-[#315EF2] text-[#101C3A]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#101C3A] mb-1.5">
              Absence Grace Period (minutes · default 20)
            </label>
            <input
              type="number"
              min={6}
              max={180}
              value={draft.maxAwayMinutes}
              onChange={(e) => {
                const nextMax = Math.max(6, Number(e.target.value) || 20);
                setDraft({
                  ...draft,
                  maxAwayMinutes: nextMax,
                  warningAfterMinutes: Math.min(warningAfter, nextMax - 1),
                });
              }}
              className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-xl border border-slate-200 bg-white text-[#101C3A] focus:border-[#315EF2]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#101C3A] mb-1.5">
              Warning Timing — Dispatch Warning After (minutes · default 15)
            </label>
            <input
              type="number"
              min={1}
              max={Math.max(1, draft.maxAwayMinutes - 1)}
              value={warningAfter}
              onChange={(e) =>
                setDraft({ ...draft, warningAfterMinutes: Number(e.target.value) || 15 })
              }
              className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-xl border border-slate-200 bg-white text-[#101C3A] focus:border-[#315EF2]"
            />
            <p className="mt-1.5 text-[11px] text-[#68748A]">
              Sends student warning with{' '}
              <strong className="font-mono text-[#101C3A]">{warningLeadMinutes} min</strong>{' '}
              remaining before seat expiry.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#101C3A] mb-1.5">
              Arrival Check-In Grace Period (minutes)
            </label>
            <input
              type="number"
              min={1}
              max={120}
              value={draft.gracePeriodMinutes}
              onChange={(e) =>
                setDraft({ ...draft, gracePeriodMinutes: Number(e.target.value) || 15 })
              }
              className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-xl border border-slate-200 bg-white text-[#101C3A] focus:border-[#315EF2]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#101C3A] mb-1.5">
              Max Daily Booking Allowance (hours)
            </label>
            <input
              type="number"
              min={1}
              max={16}
              value={draft.maxDailyHours}
              onChange={(e) => setDraft({ ...draft, maxDailyHours: Number(e.target.value) || 4 })}
              className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-xl border border-slate-200 bg-white text-[#101C3A] focus:border-[#315EF2]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#101C3A] mb-1.5">
              Overstay Fine Per Hour (PKR)
            </label>
            <input
              type="number"
              min={0}
              max={1000000}
              step={50}
              value={draft.overstayFinePerHourPkr}
              onChange={(e) =>
                setDraft({ ...draft, overstayFinePerHourPkr: Number(e.target.value) || 0 })
              }
              className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-xl border border-slate-200 bg-white text-[#101C3A] focus:border-[#315EF2]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#101C3A] mb-1.5">
              Warnings Before Account Review Threshold
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={draft.warningsBeforeRestriction}
              onChange={(e) =>
                setDraft({ ...draft, warningsBeforeRestriction: Number(e.target.value) || 3 })
              }
              className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-xl border border-slate-200 bg-white text-[#101C3A] focus:border-[#315EF2]"
            />
          </div>
        </div>

        {/* Monthly Reset Policy & Penalty Rules Toggles */}
        <div className="pt-5 border-t border-slate-100 space-y-3.5">
          <div className="font-display text-xs font-bold text-[#101C3A]">
            Monthly Reset Policy &amp; Progressive Penalty Rules
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.firstViolationWarningOnly !== false}
              onChange={(e) =>
                setDraft({ ...draft, firstViolationWarningOnly: e.target.checked })
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#315EF2]"
            />
            <span className="text-xs text-[#68748A]">
              <span className="font-semibold text-[#101C3A] block">
                1st Monthly Violation = Warning Only (PKR 0); 2nd &amp; Subsequent = Fine
              </span>
              Follows IBA Digital Library policy: first monthly expiry triggers a written warning
              without fine; every subsequent violation in the same month generates a separate PKR
              fine.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.monthlyResetEnabled !== false}
              onChange={(e) => setDraft({ ...draft, monthlyResetEnabled: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#315EF2]"
            />
            <span className="text-xs text-[#68748A]">
              <span className="font-semibold text-[#101C3A] block">
                Automatic 1st-of-Month Counter Reset ({violationPolicy.timezone})
              </span>
              Resets student monthly violation counters at 00:00 PKT on the 1st of every calendar
              month while permanently retaining all historical violation records and unpaid PKR
              balances.
            </span>
          </label>
        </div>

        <div className="pt-5 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] text-white text-xs font-semibold shadow-sm shadow-[#315EF2]/20 transition-all cursor-pointer whitespace-nowrap"
          >
            Save Penalty &amp; Policy Rules
          </button>
          <button
            type="button"
            onClick={() =>
              setDraft({
                ...config,
                warningAfterMinutes:
                  config.warningAfterMinutes ?? Math.max(1, config.maxAwayMinutes - 5),
                monthlyResetEnabled: config.monthlyResetEnabled ?? true,
                firstViolationWarningOnly: config.firstViolationWarningOnly ?? true,
              })
            }
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[#68748A] text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            Reset
          </button>
          {savedMsg && (
            <span
              className={`text-xs font-semibold ${
                savedMsg.ok ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {savedMsg.text}
            </span>
          )}
        </div>
      </form>

      <div className="surface-card overflow-hidden max-w-4xl">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-sm font-bold text-[#101C3A]">
              Fine Configuration History
            </h3>
            <p className="text-xs text-[#68748A] mt-0.5">
              Immutable audit trail of PKR fine and absence schedules. Previous transactions stay
              linked to their original configuration.
            </p>
          </div>
          <span className="text-xs font-mono font-semibold text-[#315EF2] bg-[#EAF0FF] px-2.5 py-1 rounded-lg whitespace-nowrap">
            {history.length} {history.length === 1 ? 'record' : 'records'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F5F7FC] border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                <th className="py-3 px-4">Config ID</th>
                <th className="py-3 px-4">Effective Date</th>
                <th className="py-3 px-4 text-right">Violation Fine (PKR)</th>
                <th className="py-3 px-4 text-right">Absence / Warning</th>
                <th className="py-3 px-4">Monthly Reset</th>
                <th className="py-3 px-4">Updated By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[#68748A]">
                    No configuration versions recorded yet.
                  </td>
                </tr>
              ) : (
                history.map((item, idx) => (
                  <tr
                    key={item.configurationId ?? `${item.effectiveDate}-${idx}`}
                    className="hover:bg-[#F5F7FC]/70 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono text-xs text-[#101C3A] font-semibold whitespace-nowrap">
                      <span>{item.configurationId ?? '—'}</span>
                      {idx === 0 && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#68748A] font-mono whitespace-nowrap">
                      {item.effectiveDate ?? '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#101C3A]">
                      PKR {item.noShowFinePkr.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-[#68748A] whitespace-nowrap">
                      {item.maxAwayMinutes}m (warn @{' '}
                      {item.warningAfterMinutes ?? Math.max(1, item.maxAwayMinutes - 5)}m)
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#68748A] whitespace-nowrap">
                      {item.monthlyResetEnabled !== false ? 'PKT Auto-Reset' : 'Manual'}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#68748A]">
                      {item.updatedByName ?? item.updatedByAdministrator ?? 'System'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ---------------- 10. SYSTEM SETTINGS ---------------- */
const AdminSystemSettingsView: React.FC<{
  settings: SystemSettings;
  onSave: (next: SystemSettings) => Promise<{ ok: boolean; message: string }>;
}> = ({ settings, onSave }) => {
  const [draft, setDraft] = useState<SystemSettings>(settings);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onSave(draft);
    setSavedMsg(res.message);
    setTimeout(() => setSavedMsg(null), 2500);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Settings"
        description="Configure campus facility metadata, library operating hours, and QR rotation policies."
      />

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="surface-card p-6 max-w-3xl space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#101C3A] mb-1.5">
              Library Facility Name
            </label>
            <input
              type="text"
              value={draft.libraryName}
              onChange={(e) => setDraft({ ...draft, libraryName: e.target.value })}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#101C3A] mb-1.5">
              Campus Location
            </label>
            <input
              type="text"
              value={draft.campusLocation}
              onChange={(e) => setDraft({ ...draft, campusLocation: e.target.value })}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#101C3A] mb-1.5">
              Opening Time
            </label>
            <input
              type="time"
              value={draft.operatingHoursOpen}
              onChange={(e) => setDraft({ ...draft, operatingHoursOpen: e.target.value })}
              className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-xl border border-slate-200 bg-white text-[#101C3A] focus:border-[#315EF2]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#101C3A] mb-1.5">
              Closing Time
            </label>
            <input
              type="time"
              value={draft.operatingHoursClose}
              onChange={(e) => setDraft({ ...draft, operatingHoursClose: e.target.value })}
              className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-xl border border-slate-200 bg-white text-[#101C3A] focus:border-[#315EF2]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#101C3A] mb-1.5">
              Active Academic Term
            </label>
            <input
              type="text"
              value={draft.academicTerm}
              onChange={(e) => setDraft({ ...draft, academicTerm: e.target.value })}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#101C3A] mb-1.5">
              QR Token Rotation Cycle
            </label>
            <select
              value={draft.qrRotationCycle}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  qrRotationCycle: e.target.value as SystemSettings['qrRotationCycle'],
                })
              }
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
            >
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
              <option value="Semester">Semester</option>
            </select>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.allowAdvanceBooking}
              onChange={(e) => setDraft({ ...draft, allowAdvanceBooking: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#315EF2]"
            />
            <span className="text-xs text-[#68748A]">
              <span className="font-semibold text-[#101C3A] block">
                Allow Same-Day Advance Booking
              </span>
              Permit students to reserve open ILS units up to 2 hours ahead of arrival.
            </span>
          </label>
        </div>

        <div className="pt-5 border-t border-slate-100 flex items-center gap-4">
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] text-white text-xs font-semibold shadow-sm shadow-[#315EF2]/20 transition-all cursor-pointer whitespace-nowrap"
          >
            Save System Settings
          </button>
          {savedMsg && <span className="text-xs font-semibold text-emerald-700">{savedMsg}</span>}
        </div>
      </form>
    </div>
  );
};
