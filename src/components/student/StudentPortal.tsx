import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Armchair,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  HelpCircle,
  History,
  Home,
  Info,
  Keyboard,
  LampDesk,
  Lock,
  LogOut,
  Monitor,
  Plug,
  QrCode,
  Radio,
  ReceiptText,
  RefreshCw,
  ScanLine,
  Search,
  Settings,
  ShieldAlert,
  TrendingUp,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { useILS } from '../../context/ILSContext';
import { ILSSeat, SeatStatus, SeatZone, StudentRoute } from '../../types/ils';
import { BottomNavItemConfig, NavItemConfig, PortalShell } from '../layout/PortalShell';
import {
  IBACrestMark,
  PageHeader,
  QRMatrixSvg,
  SafeImage,
  SEAT_STATUS_META,
  SeatLegend,
  SeatStatusIcon,
  SeatStatusLabel,
} from '../shared/DesignSystem';
import {
  ConfirmDialog,
  HomeCardsSkeleton,
  SeatGridSkeleton,
  useToast,
} from '../shared/UxPrimitives';
import { StudentQRScanner } from './StudentQRScanner';
import { StudentFinancialLedgerView } from './StudentFinancialLedgerView';
import { StudentAnalyticsView } from '../analytics/StudentAnalyticsView';
import {
  computeStudentAnalytics,
  formatHours,
  getDateRangeForPreset,
} from '../../data/analyticsDemoData';

function formatDurationMinutes(minutes?: number): string {
  if (!minutes || minutes <= 0) return '—';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h 00m`;
  return `${mins}m`;
}

function formatGraceCountdown(
  graceExpiresAt: string | undefined,
  nowMs: number
): {
  label: string;
  expired: boolean;
} | null {
  if (!graceExpiresAt) return null;
  const targetMs = new Date(graceExpiresAt).getTime();
  if (Number.isNaN(targetMs)) return null;
  const diffSec = Math.floor((targetMs - nowMs) / 1000);
  if (diffSec <= 0) {
    return { label: 'Grace expired', expired: true };
  }
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return {
    label: `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s left`,
    expired: false,
  };
}

function getGreetingPrefix(nowMs: number): string {
  const hour = new Date(nowMs).getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export const StudentPortal: React.FC = () => {
  const {
    studentRoute,
    setStudentRoute,
    currentStudent,
    updateStudentPreferences,
    seats,
    seatsLoading,
    syncError,
    lastSyncedAt,
    pendingScannedQr,
    clearPendingScannedQr,
    seatCounts,
    reservations,
    activeStudentReservation,
    notifications,
    unreadNotificationsCount,
    violations,
    ledger,
    financialSummary,
    penaltyConfig,
    violationPolicy,
    checkoutCurrentStudent,
    markNotificationRead,
    markAllNotificationsRead,
    refreshLiveSeatData,
    logout,
  } = useILS();

  const { pushToast } = useToast();
  const [scannerState, setScannerState] = useState<{
    open: boolean;
    manualSeatId: string | null;
  }>({ open: false, manualSeatId: null });

  const openFullScreenScanner = (manualSeatId: string | null = null) => {
    setScannerState({ open: true, manualSeatId });
  };

  const closeFullScreenScanner = () => {
    setScannerState({ open: false, manualSeatId: null });
    if (pendingScannedQr) clearPendingScannedQr();
  };

  // If student opened the app via a physical desk QR URL (?scan_qr=...), launch scanner verification immediately
  useEffect(() => {
    if (pendingScannedQr) {
      setScannerState({ open: true, manualSeatId: null });
    }
  }, [pendingScannedQr]);

  const navItems: NavItemConfig<StudentRoute>[] = [
    { id: 'dashboard', label: 'Home', icon: Home, section: 'Study Workspace' },
    { id: 'book', label: 'Book ILS', icon: Armchair, section: 'Study Workspace' },
    { id: 'my-reservation', label: 'My Reservation', icon: CalendarClock, section: 'Study Workspace' },
    {
      id: 'analytics',
      label: 'My Study Analytics',
      icon: BarChart3,
      section: 'Activity & Records',
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: Bell,
      badgeCount: unreadNotificationsCount,
      section: 'Activity & Records',
    },
    { id: 'history', label: 'Occupancy History', icon: History, section: 'Activity & Records' },
    { id: 'violations', label: 'Violations & Warnings', icon: AlertTriangle, section: 'Compliance & Account' },
    { id: 'ledger', label: 'Financial Ledger', icon: ReceiptText, section: 'Compliance & Account' },
    { id: 'profile', label: 'My Profile', icon: User, section: 'Compliance & Account' },
  ];

  // Profile sub-pages keep Profile highlighted on bottom nav and show a native Back arrow on mobile
  const isProfileSubRoute =
    studentRoute === 'history' ||
    studentRoute === 'violations' ||
    studentRoute === 'ledger' ||
    studentRoute === 'notifications';

  const bottomNavItems: BottomNavItemConfig<StudentRoute>[] = [
    { id: 'dashboard', label: 'Home', icon: Home, isActive: studentRoute === 'dashboard' },
    { id: 'book', label: 'Book ILS', icon: Armchair, isActive: studentRoute === 'book' },
    {
      id: 'my-reservation',
      label: 'Reservation',
      icon: CalendarClock,
      badgeCount: activeStudentReservation?.status === 'Temporarily Away' ? 1 : undefined,
      isActive: studentRoute === 'my-reservation',
    },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, isActive: studentRoute === 'analytics' },
    {
      id: 'profile',
      label: 'Profile',
      icon: User,
      badgeCount: unreadNotificationsCount > 0 ? unreadNotificationsCount : undefined,
      isActive: studentRoute === 'profile' || isProfileSubRoute,
    },
  ];

  const headerActions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => openFullScreenScanner(null)}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
      >
        <QrCode className="h-3.5 w-3.5" />
        <span>Scan QR</span>
      </button>
      <button
        type="button"
        onClick={() => setStudentRoute('notifications')}
        aria-label={`Notifications (${unreadNotificationsCount} unread)`}
        title="Notifications"
        className={`relative inline-flex items-center justify-center h-9 w-9 rounded-xl border transition-colors cursor-pointer ${
          studentRoute === 'notifications'
            ? 'border-[#315EF2] bg-[#EAF0FF] text-[#315EF2]'
            : 'border-slate-200/90 bg-white text-[#68748A] hover:bg-slate-50 hover:text-[#101C3A]'
        }`}
      >
        <Bell className="h-4 w-4" />
        {unreadNotificationsCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#315EF2] text-white font-mono text-[10px] font-bold leading-[18px] text-center tabular-nums shadow-xs">
            {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => setStudentRoute('profile')}
        aria-label="Student Profile"
        title={`${currentStudent.name} (ERP ${currentStudent.erpId})`}
        className={`inline-flex items-center gap-2.5 pl-1.5 pr-3 py-1 rounded-xl border transition-colors cursor-pointer ${
          studentRoute === 'profile'
            ? 'border-[#315EF2] bg-[#EAF0FF] text-[#101C3A]'
            : 'border-slate-200/90 bg-white hover:bg-slate-50 text-[#101C3A]'
        }`}
      >
        <SafeImage
          src={currentStudent.avatarUrl}
          alt={currentStudent.name}
          fallbackLabel={currentStudent.name}
          className="h-7 w-7 rounded-lg object-cover border border-slate-200 shrink-0"
        />
        <span className="hidden md:flex flex-col items-start leading-tight text-left">
          <span className="text-xs font-semibold text-[#101C3A] max-w-[125px] truncate">
            {currentStudent.name}
          </span>
          <span className="font-mono text-[10px] text-[#68748A] tabular-nums">
            ERP {currentStudent.erpId}
          </span>
        </span>
      </button>
    </div>
  );

  // Home and Profile render their own full-bleed Deep Navy mobile headers matching the reference design
  const hideMobileTopBar = studentRoute === 'dashboard' || studentRoute === 'profile';

  const mobileRightAction =
    studentRoute === 'notifications' ? (
      <button
        type="button"
        onClick={() => {
          void markAllNotificationsRead();
          pushToast({
            tone: 'success',
            title: 'Notifications cleared',
            description: 'All library alerts marked as read.',
            durationMs: 2400,
          });
        }}
        className="min-h-[44px] px-3 rounded-xl text-xs font-semibold text-[#2DD4BF] hover:bg-white/10 active:scale-[0.97] transition-all cursor-pointer whitespace-nowrap"
      >
        Read all
      </button>
    ) : (
      <button
        type="button"
        onClick={() => openFullScreenScanner(null)}
        aria-label="Open QR Scanner"
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/15 active:scale-[0.96] transition-all cursor-pointer"
      >
        <QrCode className="h-4.5 w-4.5" />
      </button>
    );

  return (
    <PortalShell
      portalTitle="Student Portal"
      portalRoleLabel="Student Workspace"
      navItems={navItems}
      bottomNavItems={bottomNavItems}
      activeRoute={studentRoute}
      onSelectRoute={setStudentRoute}
      userName={currentStudent.name}
      userMeta={`ERP ${currentStudent.erpId}`}
      userAvatar={currentStudent.avatarUrl}
      accountOriginLabel={
        currentStudent.isDemo ? 'Demonstration Student Account' : 'Verified Student Account'
      }
      headerActions={headerActions}
      hideMobileTopBar={hideMobileTopBar}
      mobileBackTarget={isProfileSubRoute ? 'profile' : null}
      mobileRightAction={mobileRightAction}
      onRefresh={refreshLiveSeatData}
      syncError={syncError}
      onLogout={() => void logout()}
    >
      {studentRoute === 'dashboard' && (
        <StudentHomeView
          student={currentStudent}
          seatCounts={seatCounts}
          seats={seats}
          seatsLoading={seatsLoading}
          maxAwayMinutes={penaltyConfig.maxAwayMinutes}
          activeReservation={activeStudentReservation}
          notifications={notifications}
          unreadCount={unreadNotificationsCount}
          onNavigate={setStudentRoute}
          onOpenQrScanner={() => openFullScreenScanner(null)}
        />
      )}

      {studentRoute === 'book' && (
        <StudentBookIlsView
          seats={seats}
          seatsLoading={seatsLoading}
          seatCounts={seatCounts}
          lastSyncedAt={lastSyncedAt}
          maxDailyHours={penaltyConfig.maxDailyHours}
          maxAwayMinutes={penaltyConfig.maxAwayMinutes}
          activeReservation={activeStudentReservation}
          onOpenQrScanner={openFullScreenScanner}
          onRefreshSeats={async () => {
            const ok = await refreshLiveSeatData();
            pushToast(
              ok
                ? {
                    tone: 'success',
                    title: 'Seat map refreshed',
                    description: `${seatCounts.available} of ${seatCounts.total} ILS seats available right now.`,
                    durationMs: 2400,
                  }
                : {
                    tone: 'error',
                    title: 'Refresh failed',
                    description: 'Could not load live seat availability.',
                    actionLabel: 'Retry',
                    onAction: () => void refreshLiveSeatData(),
                  }
            );
          }}
          onGoToMyReservation={() => setStudentRoute('my-reservation')}
        />
      )}

      {studentRoute === 'my-reservation' && (
        <StudentMyReservationView
          activeReservation={activeStudentReservation}
          seats={seats}
          maxAwayMinutes={penaltyConfig.maxAwayMinutes}
          onCheckout={checkoutCurrentStudent}
          onNavigateToBook={() => setStudentRoute('book')}
          onOpenQrScanner={() => openFullScreenScanner(null)}
        />
      )}

      {studentRoute === 'analytics' && (
        <StudentAnalyticsView
          student={currentStudent}
          verifiedReservationsCount={
            reservations.filter((r) => r.studentErp === currentStudent.erpId).length
          }
          activeSeatId={activeStudentReservation?.seatId ?? null}
        />
      )}

      {studentRoute === 'notifications' && (
        <StudentNotificationsView
          notifications={notifications}
          onMarkRead={(id) => void markNotificationRead(id)}
          onMarkAllRead={() => {
            void markAllNotificationsRead();
            pushToast({
              tone: 'success',
              title: 'All notifications read',
              durationMs: 2400,
            });
          }}
        />
      )}

      {studentRoute === 'history' && (
        <StudentHistoryView
          reservations={reservations.filter((r) => r.studentErp === currentStudent.erpId)}
          onNavigateToBook={() => setStudentRoute('book')}
        />
      )}

      {studentRoute === 'violations' && (
        <StudentViolationsView
          student={currentStudent}
          violations={violations.filter((v) => v.studentErp === currentStudent.erpId)}
          violationPolicy={violationPolicy}
          maxAwayMinutes={penaltyConfig.maxAwayMinutes}
        />
      )}

      {studentRoute === 'ledger' && (
        <StudentFinancialLedgerView
          student={currentStudent}
          entries={ledger.filter((l) => l.studentErp === currentStudent.erpId)}
          summary={financialSummary}
          violationPolicy={violationPolicy}
        />
      )}

      {studentRoute === 'profile' && (
        <StudentProfileHubView
          student={currentStudent}
          unreadNotificationsCount={unreadNotificationsCount}
          outstandingDuesPkr={financialSummary.outstandingBalancePkr}
          maxAwayMinutes={penaltyConfig.maxAwayMinutes}
          violationPolicy={violationPolicy}
          onNavigate={setStudentRoute}
          onSavePreferences={updateStudentPreferences}
          onLogout={() => void logout()}
        />
      )}

      {/* Full-Screen Mobile-First QR Scanner Overlay with Manual Seat ID Fallback */}
      {scannerState.open && (
        <StudentQRScanner
          fullScreen
          initialQrPayload={pendingScannedQr}
          initialManualSeatId={scannerState.manualSeatId}
          autoStartCamera={!pendingScannedQr && !scannerState.manualSeatId}
          onGoToMyReservation={() => {
            closeFullScreenScanner();
            setStudentRoute('my-reservation');
          }}
          onGoToDashboard={() => {
            closeFullScreenScanner();
            setStudentRoute('dashboard');
          }}
          onClose={closeFullScreenScanner}
        />
      )}
    </PortalShell>
  );
};

const FIVE_MINUTE_WARNING_TEXT =
  'Attention! You have only 5 minutes remaining to return to your ILS seat. If you do not return within the next 5 minutes, your reservation will expire and the seat will become available to other students.';

const StudentAbsenceWarningBanner: React.FC<{
  reservation: NonNullable<ReturnType<typeof useILS>['activeStudentReservation']>;
  seat: ILSSeat | undefined;
  maxAwayMinutes: number;
  nowMs: number;
  onGoToReservation?: () => void;
}> = ({ reservation, seat, maxAwayMinutes, nowMs, onGoToReservation }) => {
  if (reservation.status !== 'Temporarily Away') return null;

  const deadlineIso = reservation.absenceDeadlineAt ?? seat?.graceExpiresAt;
  const timerMode = reservation.absenceTimerMode ?? seat?.absenceTimerMode ?? 'production';
  const warningSent = Boolean(reservation.absenceWarningSentAt ?? seat?.absenceWarningSentAt);

  let remainingSec = 0;
  if (deadlineIso) {
    const expMs = new Date(deadlineIso).getTime();
    if (!Number.isNaN(expMs)) {
      remainingSec = Math.max(0, Math.ceil((expMs - nowMs) / 1000));
    }
  }

  const isFiveMinWarning =
    warningSent || (timerMode === 'demo_accelerated' ? remainingSec <= 5 : remainingSec <= 300);

  const countdownDisplay =
    remainingSec <= 0
      ? '00:00'
      : timerMode === 'demo_accelerated'
        ? `${String(remainingSec).padStart(2, '0')}:00 sim`
        : `${String(Math.floor(remainingSec / 60)).padStart(2, '0')}:${String(remainingSec % 60).padStart(2, '0')}`;

  return (
    <div
      role="alert"
      className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-sm ${
        isFiveMinWarning
          ? 'bg-rose-50 border-rose-200 text-rose-950'
          : 'bg-amber-50 border-amber-200 text-amber-950'
      }`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
            isFiveMinWarning ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          <AlertTriangle className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide">
              {isFiveMinWarning
                ? `5-Min Warning · ${reservation.seatId}`
                : `Temporarily Away · ${reservation.seatId}`}
            </span>
            {timerMode === 'demo_accelerated' && (
              <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/90 border border-amber-300 text-amber-900">
                DEMO TIMER
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed opacity-90">
            {isFiveMinWarning
              ? FIVE_MINUTE_WARNING_TEXT
              : `Your desk ${reservation.seatId} is held under the ${maxAwayMinutes}-minute absence countdown. Return before the timer expires to avoid a violation.`}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
        <div
          className={`px-3.5 py-2 rounded-xl border text-right shadow-2xs ${
            isFiveMinWarning
              ? 'bg-white border-rose-200 text-rose-700'
              : 'bg-white border-amber-200 text-amber-800'
          }`}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-75">
            Remaining
          </div>
          <div className="font-mono text-base font-bold tabular-nums">{countdownDisplay}</div>
        </div>
        {onGoToReservation && (
          <button
            type="button"
            onClick={onGoToReservation}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#101C3A] hover:bg-[#172554] text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            View Seat
          </button>
        )}
      </div>
    </div>
  );
};

/* ---------------- 1. STUDENT HOME SCREEN (MOBILE-FIRST REFERENCE) ---------------- */
const StudentHomeView: React.FC<{
  student: ReturnType<typeof useILS>['currentStudent'];
  seatCounts: { total: number; available: number; occupied: number; away: number; maintenance: number };
  seats: ILSSeat[];
  seatsLoading: boolean;
  maxAwayMinutes: number;
  activeReservation: ReturnType<typeof useILS>['activeStudentReservation'];
  notifications: ReturnType<typeof useILS>['notifications'];
  unreadCount: number;
  onNavigate: (route: StudentRoute) => void;
  onOpenQrScanner: () => void;
}> = ({
  student,
  seatCounts,
  seats,
  seatsLoading,
  maxAwayMinutes,
  activeReservation,
  notifications,
  unreadCount,
  onNavigate,
  onOpenQrScanner,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const firstName = student.name.split(' ')[0] || student.name;
  const greeting = getGreetingPrefix(nowMs);

  const occupancyPct = useMemo(() => {
    if (seatCounts.total <= 0) return 0;
    return Math.round(((seatCounts.occupied + seatCounts.away) / seatCounts.total) * 100);
  }, [seatCounts]);

  // Weekly demo study summary (clearly labelled DEMO)
  const weeklyAnalytics = useMemo(() => {
    const range = getDateRangeForPreset('week');
    return computeStudentAnalytics(student, range);
  }, [student]);

  const maxWeeklyBarHours = useMemo(
    () => Math.max(1, ...weeklyAnalytics.weeklyOccupancy.map((d) => d.hours)),
    [weeklyAnalytics.weeklyOccupancy]
  );

  const activeSeatObj = activeReservation
    ? seats.find((s) => s.id === activeReservation.seatId)
    : undefined;

  const awayCountdown =
    activeReservation?.status === 'Temporarily Away'
      ? formatGraceCountdown(activeReservation.absenceDeadlineAt ?? activeSeatObj?.graceExpiresAt, nowMs)
      : null;

  const getNoticeVisual = (category: string, title: string) => {
    const lower = `${category} ${title}`.toLowerCase();
    if (lower.includes('fine') || lower.includes('expired') || lower.includes('violation')) {
      return { icon: <AlertTriangle className="h-4 w-4 text-rose-600" />, bg: 'bg-rose-50' };
    }
    if (lower.includes('warning') || lower.includes('return') || lower.includes('away')) {
      return { icon: <Clock className="h-4 w-4 text-amber-600" />, bg: 'bg-amber-50' };
    }
    if (lower.includes('confirmed') || lower.includes('restored') || lower.includes('paid')) {
      return { icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />, bg: 'bg-emerald-50' };
    }
    return { icon: <Info className="h-4 w-4 text-[#315EF2]" />, bg: 'bg-[#EAF0FF]' };
  };

  return (
    <div className="space-y-0 lg:space-y-6">
      {/* Top Deep Navy App Header — Edge-to-edge on mobile, rounded executive card on desktop */}
      <section className="bg-[#101C3A] text-white px-4 pt-safe pt-4 pb-9 lg:rounded-[22px] lg:p-7 lg:shadow-lg">
        <div className="max-w-5xl lg:max-w-none mx-auto space-y-4 sm:space-y-5">
          {/* Subtle Mobile Institutional Header Bar (< lg) */}
          <div className="flex lg:hidden items-center justify-between gap-2 pb-2 border-b border-white/10">
            <div className="flex items-center gap-2.5 min-w-0">
              <IBACrestMark light size="xs" />
              <div className="min-w-0">
                <div className="font-display text-xs font-bold text-white tracking-tight truncate">
                  IBA Digital Library
                </div>
                <div className="text-[10px] font-medium text-[#2DD4BF] truncate">
                  Smart ILS Portal
                </div>
              </div>
            </div>
            <span className="font-mono text-[10px] text-blue-200/75 tabular-nums shrink-0">
              ERP {student.erpId}
            </span>
          </div>

          {/* Greeting + Avatar + Notification Bell */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                aria-label="Open student profile"
                className="shrink-0 rounded-full ring-2 ring-white/25 hover:ring-[#19B6A4] transition-all cursor-pointer"
              >
                <SafeImage
                  src={student.avatarUrl}
                  alt={student.name}
                  fallbackLabel={student.name}
                  className="h-12 w-12 rounded-full object-cover"
                />
              </button>
              <div className="min-w-0">
                <h1 className="font-display text-lg sm:text-2xl font-bold text-white tracking-tight truncate">
                  Hello, {firstName}!
                </h1>
                <p className="text-xs sm:text-sm text-blue-200/85 truncate">
                  {greeting} · Welcome back to IBA Digital Library
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('notifications')}
              aria-label={`Notifications (${unreadCount} unread)`}
              className="relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl bg-white/10 hover:bg-white/16 border border-white/10 text-white transition-colors cursor-pointer shrink-0"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-[#101C3A]" />
              )}
            </button>
          </div>

          {/* Prominent Scan QR to Book Your Seat Action Card */}
          <button
            type="button"
            onClick={onOpenQrScanner}
            className="w-full min-h-[72px] rounded-2xl bg-[#315EF2] hover:bg-[#244AD4] active:scale-[0.99] transition-all px-5 py-4 flex items-center justify-between gap-4 shadow-[0_12px_28px_-8px_rgba(49,94,242,0.75)] cursor-pointer text-left"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="h-11 w-11 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                <ScanLine className="h-6 w-6 text-white" />
              </span>
              <div className="min-w-0">
                <div className="font-display text-[15px] sm:text-base font-bold text-white leading-tight">
                  Scan QR to Book Your Seat
                </div>
                <div className="mt-0.5 text-xs text-blue-100/90 truncate">
                  Point camera at any available ILS-01 – ILS-30 desk plaque
                </div>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-white shrink-0" />
          </button>
        </div>
      </section>

      {/* Main White/Soft-Blue Canvas Sheet (Rounded overlap on mobile matching reference) */}
      <div className="bg-[#F5F7FC] rounded-t-[24px] -mt-4 px-4 pt-5 pb-2 lg:bg-transparent lg:rounded-none lg:mt-0 lg:px-0 lg:pt-0 space-y-4 sm:space-y-5">
        {seatsLoading && seats.length === 0 ? (
          <HomeCardsSkeleton />
        ) : (
          <>
        {/* Live 5-Min / Temporary Absence Alert Banner */}
        {activeReservation && activeReservation.status === 'Temporarily Away' && (
          <StudentAbsenceWarningBanner
            reservation={activeReservation}
            seat={activeSeatObj}
            maxAwayMinutes={maxAwayMinutes}
            nowMs={nowMs}
            onGoToReservation={() => onNavigate('my-reservation')}
          />
        )}

        {/* Top Grid: Current Reservation + Live Seat Availability & Occupancy */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {/* Current Reservation Card */}
          <section className="lg:col-span-7 surface-card p-5 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-[15px] font-bold text-[#101C3A]">
                Current Reservation
              </h2>
              {activeReservation ? (
                <SeatStatusLabel
                  status={activeReservation.status === 'Temporarily Away' ? 'away' : 'occupied'}
                  compact
                />
              ) : (
                <span className="text-xs font-semibold text-[#68748A]">No active seat</span>
              )}
            </div>

            {activeReservation ? (
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="font-mono text-2xl sm:text-3xl font-bold text-[#101C3A] tabular-nums">
                    {activeReservation.seatId}
                  </div>
                  <div className="font-mono text-xs sm:text-sm font-medium text-[#68748A] tabular-nums">
                    {activeReservation.startTime} – {activeReservation.endTime}
                  </div>
                  <div className="text-xs text-[#68748A] truncate">
                    {activeReservation.zone}
                    {awayCountdown ? ` · ${awayCountdown.label}` : ''}
                  </div>
                </div>
                <div className="h-14 w-14 rounded-2xl bg-[#EAF0FF] text-[#315EF2] flex items-center justify-center shrink-0">
                  <Armchair className="h-7 w-7" />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="font-display text-base font-bold text-[#101C3A]">
                    Ready for your next study session
                  </div>
                  <p className="text-xs text-[#68748A] leading-relaxed">
                    Browse all 30 Individual Learning Spaces or scan a desk QR code to check in.
                  </p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-slate-100 text-[#68748A] flex items-center justify-center shrink-0">
                  <Armchair className="h-6 w-6" />
                </div>
              </div>
            )}

            <div>
              {activeReservation ? (
                <button
                  type="button"
                  onClick={() => onNavigate('my-reservation')}
                  className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#EAF0FF] hover:bg-[#DCE6FF] text-[#315EF2] text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>View Details</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate('book')}
                  className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#101C3A] hover:bg-[#172554] text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <span>Browse Available ILS Seats</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </section>

          {/* 2-Column Live Library Snapshot: Available Seats + Library Occupancy */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-3.5">
            <button
              type="button"
              onClick={() => onNavigate('book')}
              className="surface-card-interactive p-4 sm:p-5 text-left flex flex-col justify-between gap-3 cursor-pointer"
            >
              <div className="text-xs font-semibold text-[#68748A]">Available Seats</div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="font-display text-3xl font-bold text-[#101C3A] tabular-nums leading-none">
                    {seatsLoading ? '—' : seatCounts.available}
                  </div>
                  <div className="mt-1.5 text-[11px] font-medium text-emerald-700">
                    of {seatCounts.total} open
                  </div>
                </div>
                <span className="h-10 w-10 rounded-xl bg-[#EAF0FF] text-[#315EF2] flex items-center justify-center shrink-0">
                  <Armchair className="h-5 w-5" />
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('book')}
              className="surface-card-interactive p-4 sm:p-5 text-left flex flex-col justify-between gap-3 cursor-pointer"
            >
              <div className="text-xs font-semibold text-[#68748A]">Library Occupancy</div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="font-display text-3xl font-bold text-[#101C3A] tabular-nums leading-none">
                    {seatsLoading ? '—' : `${occupancyPct}%`}
                  </div>
                  <div className="mt-1.5 text-[11px] font-medium text-[#68748A] tabular-nums">
                    {seatCounts.occupied + seatCounts.away} active now
                  </div>
                </div>
                {/* Crisp 4-bar visual occupancy indicator */}
                <div className="flex items-end gap-1 h-9 shrink-0" aria-hidden="true">
                  <span className="w-1.5 h-3.5 rounded-full bg-[#315EF2]/40" />
                  <span className="w-1.5 h-5 rounded-full bg-[#315EF2]/65" />
                  <span className="w-1.5 h-7 rounded-full bg-[#315EF2]" />
                  <span className="w-1.5 h-9 rounded-full bg-[#19B6A4]" />
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Bottom Grid: Weekly Occupancy Summary + Recent Notifications */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {/* Weekly Occupancy Summary Card (DEMO DATA labelled) */}
          <button
            type="button"
            onClick={() => onNavigate('analytics')}
            className="lg:col-span-5 surface-card-interactive p-5 text-left space-y-4 cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="font-display text-[15px] font-bold text-[#101C3A] truncate">
                  Your Weekly Study Hours
                </h2>
                <span className="font-mono text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 shrink-0">
                  Demo
                </span>
              </div>
              <ChevronRight className="h-4 w-4 text-[#68748A] shrink-0" />
            </div>

            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="font-display text-2xl sm:text-3xl font-bold text-[#101C3A] tabular-nums">
                  {formatHours(weeklyAnalytics.kpis.weeklyHours)}
                </div>
                <div
                  className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold tabular-nums ${
                    weeklyAnalytics.insights.weekDeltaPct >= 0
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                  }`}
                >
                  <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {weeklyAnalytics.insights.weekDeltaPct >= 0 ? '+' : ''}
                    {weeklyAnalytics.insights.weekDeltaPct}% vs last week
                  </span>
                </div>
              </div>

              {/* Mon-Sun Mini Bar Sparkline */}
              <div className="flex items-end gap-1.5 h-14 shrink-0" aria-hidden="true">
                {weeklyAnalytics.weeklyOccupancy.map((day, idx) => {
                  const pct = Math.max(14, Math.round((day.hours / maxWeeklyBarHours) * 100));
                  return (
                    <div key={day.day} className="flex flex-col items-center gap-1 h-full justify-end">
                      <span
                        className={`w-2.5 rounded-t-md ${
                          idx === weeklyAnalytics.weeklyOccupancy.length - 1
                            ? 'bg-[#19B6A4]'
                            : 'bg-[#315EF2]'
                        }`}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </button>

          {/* Recent Notifications Card */}
          <section className="lg:col-span-7 surface-card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-[15px] font-bold text-[#101C3A]">
                  Recent Notifications
                </h2>
                {unreadCount > 0 && (
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#EAF0FF] text-[#315EF2] tabular-nums">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onNavigate('notifications')}
                className="text-xs font-semibold text-[#315EF2] hover:underline cursor-pointer whitespace-nowrap"
              >
                View All
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#68748A]">
                  No notifications yet. Reservation confirmations and alerts appear here.
                </div>
              ) : (
                notifications.slice(0, 3).map((item) => {
                  const visual = getNoticeVisual(item.category, item.title);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate('notifications')}
                      className={`w-full text-left px-5 py-3.5 flex items-start gap-3 transition-colors hover:bg-[#F5F7FC] cursor-pointer ${
                        item.read ? 'bg-white' : 'bg-[#EAF0FF]/30'
                      }`}
                    >
                      <span
                        className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${visual.bg}`}
                      >
                        {visual.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#101C3A] truncate">
                            {item.title}
                          </span>
                          <span className="font-mono text-[10px] text-[#68748A] tabular-nums shrink-0">
                            {item.timestamp}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#68748A] line-clamp-1">{item.message}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ---------------- SHARED SEAT DETAILS INSPECTOR / BOTTOM SHEET ---------------- */
const SeatDetailsCard: React.FC<{
  seat: ILSSeat;
  maxDailyHours: number;
  maxAwayMinutes: number;
  nowMs: number;
  isCurrentStudentSeat: boolean;
  onScanQrForSeat: () => void;
  onBookManualSeat: (seatId: string) => void;
  onManageOwnReservation: () => void;
  onCloseMobile?: () => void;
}> = ({
  seat,
  maxDailyHours,
  maxAwayMinutes,
  nowMs,
  isCurrentStudentSeat,
  onScanQrForSeat,
  onBookManualSeat,
  onManageOwnReservation,
  onCloseMobile,
}) => {
  const grace = seat.status === 'away' ? formatGraceCountdown(seat.graceExpiresAt, nowMs) : null;

  return (
    <div className="surface-card lg:rounded-2xl rounded-t-3xl rounded-b-none lg:rounded-b-2xl p-5 sm:p-6 space-y-5">
      {/* Mobile drag handle */}
      {onCloseMobile && (
        <div className="lg:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto -mt-1 mb-1" />
      )}

      <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-2xl font-bold text-[#101C3A] tabular-nums">{seat.id}</h3>
            {isCurrentStudentSeat && (
              <span className="px-2 py-0.5 rounded-md bg-[#EAF0FF] text-[#315EF2] text-[11px] font-semibold">
                Your Seat
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-[#68748A]">
            {seat.zone} · {seat.floor}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SeatStatusLabel status={seat.status} compact />
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close seat details"
              className="lg:hidden min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-400 hover:text-[#101C3A] hover:bg-slate-100 cursor-pointer"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          )}
        </div>
      </div>

      {/* Contextual Status Notice */}
      {seat.status === 'available' && (
        <div className="rounded-xl bg-emerald-50/90 border border-emerald-200/90 p-3.5 flex items-start gap-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs text-emerald-950 leading-relaxed">
            <span className="font-bold">Available now.</span> Scan the QR code mounted on{' '}
            <span className="font-mono font-bold">{seat.id}</span> or confirm with manual seat ID
            entry.
          </div>
        </div>
      )}

      {seat.status === 'occupied' && (
        <div className="rounded-xl bg-rose-50/90 border border-rose-200/90 p-3.5 flex items-start gap-2.5">
          <Lock className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs text-rose-950 leading-relaxed">
            <span className="font-bold">Currently occupied.</span>{' '}
            {isCurrentStudentSeat
              ? 'This seat is assigned to your active reservation.'
              : 'Choose a green available ILS space to book.'}
          </div>
        </div>
      )}

      {seat.status === 'away' && (
        <div className="rounded-xl bg-amber-50/90 border border-amber-200/90 p-3.5 flex items-start gap-2.5">
          <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-950 leading-relaxed">
            <span className="font-bold">Temporarily Away.</span>{' '}
            {grace
              ? grace.expired
                ? 'Grace window elapsed; release is pending.'
                : `Held under the ${seat.gracePeriodMinutes ?? maxAwayMinutes}-min grace window (${grace.label}).`
              : `Held under the ${maxAwayMinutes}-minute grace period.`}
          </div>
        </div>
      )}

      {seat.status === 'maintenance' && (
        <div className="rounded-xl bg-slate-100 border border-slate-200 p-3.5 flex items-start gap-2.5">
          <Wrench className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-800 leading-relaxed">
            <span className="font-bold">Offline / Maintenance.</span>{' '}
            {seat.maintenanceNote || 'Temporarily out of service by library staff.'}
          </div>
        </div>
      )}

      {/* Details list */}
      <dl className="divide-y divide-slate-100 text-xs">
        <div className="py-2.5 flex items-center justify-between gap-3">
          <dt className="text-[#68748A]">Status</dt>
          <dd className={`font-semibold ${SEAT_STATUS_META[seat.status].textClass}`}>
            {SEAT_STATUS_META[seat.status].label}
          </dd>
        </div>
        <div className="py-2.5 flex items-center justify-between gap-3">
          <dt className="text-[#68748A]">Session Window</dt>
          <dd className="font-mono font-semibold text-[#101C3A] tabular-nums">
            {seat.status === 'occupied' || seat.status === 'away'
              ? seat.reservationStartTime && seat.reservedUntil
                ? `${seat.reservationStartTime} – ${seat.reservedUntil}`
                : 'Active session'
              : seat.status === 'available'
                ? `Up to ${maxDailyHours}h / session`
                : 'Unavailable'}
          </dd>
        </div>
        <div className="py-2.5 flex items-center justify-between gap-3">
          <dt className="text-[#68748A]">Sensor Telemetry</dt>
          <dd className="font-mono text-[#172033] tabular-nums">
            {seat.sensorNodeId} · {seat.sensorPresence ?? seat.sensorState}
          </dd>
        </div>
      </dl>

      {/* Amenities */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#172033] pt-1">
        {seat.hasPowerOutlet && (
          <span className="inline-flex items-center gap-1.5">
            <Plug className="h-3.5 w-3.5 text-[#19B6A4]" />
            <span>AC Power</span>
          </span>
        )}
        {seat.hasTaskLamp && (
          <span className="inline-flex items-center gap-1.5">
            <LampDesk className="h-3.5 w-3.5 text-[#19B6A4]" />
            <span>Task Lamp</span>
          </span>
        )}
        {seat.hasMonitorDock && (
          <span className="inline-flex items-center gap-1.5">
            <Monitor className="h-3.5 w-3.5 text-[#19B6A4]" />
            <span>USB-C Dock</span>
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="pt-3 border-t border-slate-100 space-y-2.5">
        {isCurrentStudentSeat ? (
          <button
            type="button"
            onClick={onManageOwnReservation}
            className="w-full min-h-[48px] py-2.5 px-4 rounded-xl bg-[#101C3A] hover:bg-[#172554] text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            Open My Reservation
          </button>
        ) : seat.status === 'available' ? (
          <>
            <button
              type="button"
              onClick={onScanQrForSeat}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <QrCode className="h-4.5 w-4.5 shrink-0" />
              <span>Scan QR to Book {seat.id}</span>
            </button>
            <button
              type="button"
              onClick={() => onBookManualSeat(seat.id)}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[#101C3A] text-xs font-semibold transition-colors cursor-pointer"
            >
              <Keyboard className="h-4 w-4 text-[#315EF2]" />
              <span>Book via Manual Seat ID ({seat.id})</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onScanQrForSeat}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[#101C3A] text-xs font-semibold cursor-pointer"
          >
            <QrCode className="h-4 w-4 text-[#315EF2]" />
            <span>Scan Another Available Desk</span>
          </button>
        )}
      </div>
    </div>
  );
};

/* ---------------- 2. BOOK ILS SCREEN (MOBILE-FIRST 30-SEAT SELECTOR + QR ENTRY) ---------------- */
const StudentBookIlsView: React.FC<{
  seats: ILSSeat[];
  seatsLoading: boolean;
  seatCounts: { total: number; available: number; occupied: number; away: number; maintenance: number };
  lastSyncedAt: string | null;
  maxDailyHours: number;
  maxAwayMinutes: number;
  activeReservation: ReturnType<typeof useILS>['activeStudentReservation'];
  onOpenQrScanner: (manualSeatId?: string | null) => void;
  onRefreshSeats: () => void;
  onGoToMyReservation: () => void;
}> = ({
  seats,
  seatsLoading,
  seatCounts,
  lastSyncedAt,
  maxDailyHours,
  maxAwayMinutes,
  activeReservation,
  onOpenQrScanner,
  onRefreshSeats,
  onGoToMyReservation,
}) => {
  const [statusFilter, setStatusFilter] = useState<SeatStatus | 'all'>('all');
  const [zoneFilter, setZoneFilter] = useState<SeatZone | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedSeatId && seats.length > 0) {
      setSelectedSeatId(
        activeReservation?.seatId ??
          seats.find((s) => s.status === 'available')?.id ??
          seats[0].id
      );
    }
  }, [activeReservation?.seatId, seats, selectedSeatId]);

  const selectedSeat = useMemo(
    () => seats.find((s) => s.id === selectedSeatId) ?? seats[0] ?? null,
    [seats, selectedSeatId]
  );

  const filteredSeats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return seats.filter((seat) => {
      if (statusFilter !== 'all' && seat.status !== statusFilter) return false;
      if (zoneFilter !== 'all' && seat.zone !== zoneFilter) return false;
      if (q && !`${seat.id} ${seat.zone} ${seat.status}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [seats, statusFilter, zoneFilter, searchQuery]);

  const handleSeatTap = (seat: ILSSeat) => {
    setSelectedSeatId(seat.id);
    if (window.innerWidth < 1024) {
      setMobileSheetOpen(true);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    onRefreshSeats();
    window.setTimeout(() => setRefreshing(false), 450);
  };

  const syncedLabel = useMemo(() => {
    if (!lastSyncedAt) return null;
    const d = new Date(lastSyncedAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [lastSyncedAt]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="hidden lg:block">
        <PageHeader
          title="Book an Individual Learning Space"
          description="Select any of the 30 ILS seats (ILS-01 to ILS-30) to inspect live availability, or scan the desk QR code to confirm immediately."
          action={
            <button
              type="button"
              onClick={() => onOpenQrScanner(null)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] text-white text-xs font-semibold shadow-sm cursor-pointer whitespace-nowrap"
            >
              <QrCode className="h-4 w-4" />
              <span>Open Full-Screen QR Scanner</span>
            </button>
          }
        />
      </div>

      {/* Prominent QR Scanner Launch Banner + Manual Entry Fallback */}
      <section className="rounded-2xl bg-[#101C3A] text-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-11 w-11 rounded-xl bg-[#315EF2] flex items-center justify-center shrink-0 shadow-sm">
            <ScanLine className="h-5.5 w-5.5 text-white" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-sm sm:text-base font-bold text-white">
              At an Available Desk?
            </h2>
            <p className="text-xs text-blue-200/85">
              Scan the desk QR plaque or enter the seat ID manually to check in.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onOpenQrScanner(null)}
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <QrCode className="h-4 w-4 shrink-0" />
            <span>Scan QR</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenQrScanner('')}
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/16 border border-white/15 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Keyboard className="h-4 w-4 text-[#2DD4BF] shrink-0" />
            <span>Manual ID</span>
          </button>
        </div>
      </section>

      {/* Filter & Search Bar */}
      <section className="surface-card p-3.5 sm:p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ILS-01 to ILS-30..."
              aria-label="Search ILS seats"
              className="w-full min-h-[44px] pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
            />
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            aria-label="Refresh seats"
            className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:scale-[0.97] transition-all inline-flex items-center gap-1.5 text-xs font-semibold text-[#101C3A] cursor-pointer shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#315EF2] ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{syncedLabel ? `Synced ${syncedLabel}` : 'Refresh'}</span>
          </button>
        </div>

        {/* Status Filter Chips (44px min touch targets) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {(
            [
              { id: 'all', label: `All (${seatCounts.total})` },
              { id: 'available', label: `Available (${seatCounts.available})` },
              { id: 'occupied', label: `Occupied (${seatCounts.occupied})` },
              { id: 'away', label: `Away (${seatCounts.away})` },
              { id: 'maintenance', label: `Offline (${seatCounts.maintenance})` },
            ] as const
          ).map((item) => {
            const active = statusFilter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setStatusFilter(item.id)}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-all active:scale-[0.97] cursor-pointer whitespace-nowrap shrink-0 border ${
                  active
                    ? 'bg-[#101C3A] text-white border-[#101C3A]'
                    : 'bg-[#F5F7FC] text-[#68748A] border-slate-200/80 hover:text-[#101C3A]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Zone Filters + Legend */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(['all', 'Quiet Zone A', 'Research Zone B', 'Focus Zone C'] as const).map((zone) => (
              <button
                key={zone}
                type="button"
                aria-pressed={zoneFilter === zone}
                onClick={() => setZoneFilter(zone)}
                className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold transition-all active:scale-[0.97] cursor-pointer whitespace-nowrap shrink-0 ${
                  zoneFilter === zone
                    ? 'bg-[#EAF0FF] text-[#315EF2]'
                    : 'text-[#68748A] hover:bg-slate-100'
                }`}
              >
                {zone === 'all' ? 'All Zones' : zone}
              </button>
            ))}
          </div>
          <SeatLegend />
        </div>
      </section>

      {/* Main 30-Seat Mobile-First Grid + Desktop Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8">
          {seatsLoading && seats.length === 0 ? (
            <SeatGridSkeleton count={15} />
          ) : filteredSeats.length === 0 ? (
            <div className="surface-card p-8 text-center space-y-2.5">
              <p className="text-sm font-bold text-[#101C3A]">No ILS seats match your filter.</p>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setZoneFilter('all');
                  setSearchQuery('');
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#315EF2] text-white text-xs font-semibold cursor-pointer"
              >
                Show All 30 Seats
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3.5">
              {filteredSeats.map((seat) => {
                const meta = SEAT_STATUS_META[seat.status];
                const isSelected = selectedSeat?.id === seat.id;
                const isOwnSeat = activeReservation?.seatId === seat.id;
                const grace =
                  seat.status === 'away' ? formatGraceCountdown(seat.graceExpiresAt, nowMs) : null;

                return (
                  <button
                    key={seat.id}
                    type="button"
                    onClick={() => handleSeatTap(seat)}
                    aria-pressed={isSelected}
                    className={`group text-left rounded-2xl border p-3 sm:p-3.5 transition-all duration-150 cursor-pointer flex flex-col justify-between min-h-[104px] sm:min-h-[116px] active:scale-[0.97] ${
                      isSelected ? meta.tileSelectedClass : meta.tileClass
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-xs sm:text-sm font-bold tabular-nums text-[#101C3A]">
                        {seat.id}
                      </span>
                      <SeatStatusIcon status={seat.status} className="h-3.5 w-3.5 shrink-0" />
                    </div>

                    <div className="my-1.5 flex items-center justify-center">
                      <Armchair
                        className={`h-6 w-6 sm:h-7 sm:w-7 ${
                          seat.status === 'available'
                            ? 'text-emerald-600'
                            : seat.status === 'occupied'
                              ? 'text-rose-600'
                              : seat.status === 'away'
                                ? 'text-amber-600'
                                : 'text-slate-400'
                        }`}
                      />
                    </div>

                    <div className="text-center">
                      <div className={`text-[11px] font-bold truncate ${meta.textClass}`}>
                        {isOwnSeat ? 'Your Seat' : meta.shortLabel}
                      </div>
                      {seat.status === 'away' && grace && (
                        <div className="font-mono text-[9px] text-amber-800 truncate tabular-nums">
                          {grace.label}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop Sticky Seat Details Inspector */}
        <div className="hidden lg:block lg:col-span-4 lg:sticky lg:top-22">
          {selectedSeat && (
            <SeatDetailsCard
              seat={selectedSeat}
              maxDailyHours={maxDailyHours}
              maxAwayMinutes={maxAwayMinutes}
              nowMs={nowMs}
              isCurrentStudentSeat={activeReservation?.seatId === selectedSeat.id}
              onScanQrForSeat={() => onOpenQrScanner(null)}
              onBookManualSeat={(id) => onOpenQrScanner(id)}
              onManageOwnReservation={onGoToMyReservation}
            />
          )}
        </div>
      </div>

      {/* Mobile Bottom Sheet for Selected Seat */}
      {mobileSheetOpen && selectedSeat && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex items-end justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={`Details for ${selectedSeat.id}`}
        >
          <div
            className="fixed inset-0 bg-[#0A1329]/60 backdrop-blur-[2px]"
            onClick={() => setMobileSheetOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-lg max-h-[88vh] overflow-y-auto pb-safe bg-white rounded-t-3xl shadow-2xl">
            <SeatDetailsCard
              seat={selectedSeat}
              maxDailyHours={maxDailyHours}
              maxAwayMinutes={maxAwayMinutes}
              nowMs={nowMs}
              isCurrentStudentSeat={activeReservation?.seatId === selectedSeat.id}
              onScanQrForSeat={() => {
                setMobileSheetOpen(false);
                onOpenQrScanner(null);
              }}
              onBookManualSeat={(id) => {
                setMobileSheetOpen(false);
                onOpenQrScanner(id);
              }}
              onManageOwnReservation={() => {
                setMobileSheetOpen(false);
                onGoToMyReservation();
              }}
              onCloseMobile={() => setMobileSheetOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------------- 3. MY RESERVATION SCREEN ---------------- */
const StudentMyReservationView: React.FC<{
  activeReservation: ReturnType<typeof useILS>['activeStudentReservation'];
  seats: ILSSeat[];
  maxAwayMinutes: number;
  onCheckout: () => Promise<{ ok: boolean; message: string }>;
  onNavigateToBook: () => void;
  onOpenQrScanner: () => void;
}> = ({
  activeReservation,
  seats,
  maxAwayMinutes,
  onCheckout,
  onNavigateToBook,
  onOpenQrScanner,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [confirmCheckoutOpen, setConfirmCheckoutOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutFeedback, setCheckoutFeedback] = useState<{ ok: boolean; message: string } | null>(
    null
  );

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const seatDetails = activeReservation
    ? seats.find((s) => s.id === activeReservation.seatId)
    : undefined;

  const presenceState =
    seatDetails?.sensorPresence ??
    (activeReservation?.status === 'Temporarily Away' ? 'ABSENT' : 'PRESENT');

  const { pushToast } = useToast();
  const handleConfirmCheckout = async () => {
    setCheckingOut(true);
    setCheckoutFeedback(null);
    const res = await onCheckout();
    setCheckingOut(false);
    setConfirmCheckoutOpen(false);
    setCheckoutFeedback(res);
    pushToast({
      tone: res.ok ? 'success' : 'error',
      title: res.ok ? 'Seat Released' : 'Check-Out Failed',
      description: res.message,
    });
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="hidden lg:block">
        <PageHeader
          title="My Reservation"
          description="Inspect your current ILS seat, live presence status, temporary absence countdown, or release your seat early."
        />
      </div>

      {checkoutFeedback && (
        <div
          role="status"
          className={`rounded-2xl border px-4 py-3.5 text-xs font-medium flex items-center justify-between gap-3 ${
            checkoutFeedback.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{checkoutFeedback.message}</span>
          <button
            type="button"
            onClick={() => setCheckoutFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
            aria-label="Dismiss message"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {activeReservation && seatDetails ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-8 space-y-4">
            {/* Hero Active Seat Card */}
            <div className="surface-card p-5 sm:p-6 space-y-5">
              <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <div className="text-[11px] font-semibold text-[#68748A]">
                    Reservation ID · <span className="font-mono">{activeReservation.id}</span>
                  </div>
                  <div className="mt-1 font-mono text-3xl sm:text-4xl font-bold text-[#101C3A] tabular-nums">
                    {activeReservation.seatId}
                  </div>
                  <div className="mt-0.5 text-xs sm:text-sm text-[#68748A]">
                    {seatDetails.zone} · {seatDetails.floor}
                  </div>
                </div>
                <SeatStatusLabel
                  status={activeReservation.status === 'Temporarily Away' ? 'away' : 'occupied'}
                />
              </div>

              {/* Presence Status Highlight Strip */}
              <div
                className={`rounded-xl border p-3.5 flex items-center justify-between gap-3 ${
                  presenceState === 'PRESENT'
                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                    : presenceState === 'ABSENT'
                      ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                      : 'bg-slate-100 border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Radio className="h-4.5 w-4.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold opacity-75">Live Presence Status</div>
                    <div className="text-xs sm:text-sm font-bold">
                      {presenceState === 'PRESENT'
                        ? 'Student Present at Desk'
                        : presenceState === 'ABSENT'
                          ? 'Temporarily Away — Absence Timer Running'
                          : 'Sensor Offline'}
                    </div>
                  </div>
                </div>
                <span className="font-mono text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white/80 shrink-0">
                  {presenceState}
                </span>
              </div>

              {/* Temporary Absence Countdown Banner */}
              {activeReservation.status === 'Temporarily Away' && (
                <StudentAbsenceWarningBanner
                  reservation={activeReservation}
                  seat={seatDetails}
                  maxAwayMinutes={maxAwayMinutes}
                  nowMs={nowMs}
                />
              )}

              {/* Reservation Details Grid */}
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-[#F5F7FC] border border-slate-200/70">
                  <dt className="text-[#68748A]">Booking Date</dt>
                  <dd className="mt-1 font-mono font-bold text-[#101C3A] tabular-nums">
                    {activeReservation.date}
                  </dd>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F5F7FC] border border-slate-200/70">
                  <dt className="text-[#68748A]">Booking Time</dt>
                  <dd className="mt-1 font-mono font-bold text-[#101C3A] tabular-nums">
                    {activeReservation.startTime}
                  </dd>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F5F7FC] border border-slate-200/70">
                  <dt className="text-[#68748A]">Scheduled End</dt>
                  <dd className="mt-1 font-mono font-bold text-[#101C3A] tabular-nums">
                    {activeReservation.endTime}
                  </dd>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F5F7FC] border border-slate-200/70">
                  <dt className="text-[#68748A]">Duration</dt>
                  <dd className="mt-1 font-mono font-bold text-[#315EF2] tabular-nums">
                    {formatDurationMinutes(activeReservation.durationMinutes)}
                  </dd>
                </div>
              </dl>

              <div className="rounded-xl bg-[#EAF0FF]/60 border border-[#DCE6FF] px-4 py-3 text-xs text-[#172033] flex items-start gap-2.5 leading-relaxed">
                <Info className="h-4 w-4 text-[#315EF2] shrink-0 mt-0.5" />
                <span>
                  Desk sensor{' '}
                  <span className="font-mono font-semibold text-[#101C3A]">
                    {seatDetails.sensorNodeId}
                  </span>{' '}
                  tracks occupancy automatically. Returning before the {maxAwayMinutes}-minute
                  absence countdown finishes keeps your reservation active with zero violations.
                </span>
              </div>

              {/* Check-out Button (opens accessible ConfirmDialog) */}
              <div className="pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConfirmCheckoutOpen(true)}
                  className="w-full sm:w-auto min-h-[48px] px-5 py-2.5 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-50 active:scale-[0.98] text-rose-700 text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                >
                  Check Out &amp; Release Seat
                </button>
              </div>
            </div>
          </div>

          <ConfirmDialog
            open={confirmCheckoutOpen}
            title={`Release ${activeReservation.seatId} early?`}
            description={`Checking out of ${activeReservation.seatId} ends your current study session immediately and makes this Individual Learning Space available to other students.`}
            confirmLabel="Yes, Release Seat"
            cancelLabel="Keep Seat"
            tone="danger"
            busy={checkingOut}
            onConfirm={handleConfirmCheckout}
            onCancel={() => setConfirmCheckoutOpen(false)}
          />

          {/* Desk Verification Pass */}
          <div className="lg:col-span-4 surface-card p-6 flex flex-col items-center text-center space-y-3">
            <div className="font-display text-sm font-bold text-[#101C3A]">
              Desk Verification Pass
            </div>
            <QRMatrixSvg value={`${activeReservation.id}-${seatDetails.qrCodeToken}`} size={152} />
            <div className="font-mono text-xs text-[#68748A] tabular-nums">
              {seatDetails.qrCodeToken}
            </div>
            <p className="text-xs text-[#68748A] leading-relaxed">
              Show this verification code to library staff during spot occupancy checks.
            </p>
          </div>
        </div>
      ) : (
        <div className="surface-card p-8 sm:p-12 text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-[#EAF0FF] text-[#315EF2] flex items-center justify-center">
            <CalendarClock className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-display text-lg font-bold text-[#101C3A]">No Active Reservation</h2>
            <p className="text-xs sm:text-sm text-[#68748A] max-w-sm mx-auto leading-relaxed">
              You do not currently hold an Individual Learning Space. Scan the desk QR code or pick
              an available carrel to begin.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={onOpenQrScanner}
              className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] text-white text-sm font-semibold shadow-sm cursor-pointer"
            >
              <QrCode className="h-4.5 w-4.5" />
              <span>Scan Desk QR</span>
            </button>
            <button
              type="button"
              onClick={onNavigateToBook}
              className="w-full sm:w-auto min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[#101C3A] text-xs font-semibold cursor-pointer"
            >
              <span>Browse 30 ILS Seats</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------------- 4. NOTIFICATIONS ---------------- */
const StudentNotificationsView: React.FC<{
  notifications: ReturnType<typeof useILS>['notifications'];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}> = ({ notifications, onMarkRead, onMarkAllRead }) => {
  const [filter, setFilter] = useState<'all' | 'unread' | 'Reservation' | 'Policy' | 'System'>(
    'all'
  );

  const filtered = useMemo(
    () =>
      notifications.filter((n) => {
        if (filter === 'unread') return !n.read;
        if (filter === 'all') return true;
        return n.category === filter;
      }),
    [notifications, filter]
  );

  const getCategoryVisual = (category: string, title: string) => {
    const lower = `${category} ${title}`.toLowerCase();
    if (
      lower.includes('warning') ||
      lower.includes('expired') ||
      lower.includes('fine') ||
      lower.includes('violation')
    ) {
      return {
        icon: <AlertTriangle className="h-4 w-4 text-rose-600" />,
        iconBg: 'bg-rose-50 border-rose-200/80',
        labelClass: 'text-rose-700',
      };
    }
    if (lower.includes('confirmed') || lower.includes('restored') || lower.includes('paid')) {
      return {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
        iconBg: 'bg-emerald-50 border-emerald-200/80',
        labelClass: 'text-emerald-700',
      };
    }
    if (category === 'Policy') {
      return {
        icon: <Clock className="h-4 w-4 text-amber-600" />,
        iconBg: 'bg-amber-50 border-amber-200/80',
        labelClass: 'text-amber-700',
      };
    }
    return {
      icon: <Info className="h-4 w-4 text-[#315EF2]" />,
      iconBg: 'bg-[#EAF0FF] border-[#DCE6FF]',
      labelClass: 'text-[#315EF2]',
    };
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="hidden lg:block">
        <PageHeader
          title="Notifications"
          description="Reservation confirmations, 5-minute absence alerts, library schedule updates, and policy advisories."
          action={
            <button
              type="button"
              onClick={onMarkAllRead}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-xs font-semibold text-[#101C3A] cursor-pointer whitespace-nowrap shadow-2xs"
            >
              <Check className="h-3.5 w-3.5 text-[#315EF2]" />
              <span>Mark All Read</span>
            </button>
          }
        />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {(['all', 'unread', 'Reservation', 'Policy', 'System'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              filter === tab
                ? 'bg-[#101C3A] text-white border-[#101C3A]'
                : 'bg-white text-[#68748A] border-slate-200/90 hover:text-[#101C3A]'
            }`}
          >
            {tab === 'all' ? 'All' : tab === 'unread' ? 'Unread' : tab}
          </button>
        ))}
      </div>

      <div className="surface-card divide-y divide-slate-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-xs text-[#68748A]">
            No notifications in this category.
          </div>
        ) : (
          filtered.map((item) => {
            const visual = getCategoryVisual(item.category, item.title);
            return (
              <div
                key={item.id}
                className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 transition-colors ${
                  item.read ? 'bg-white' : 'bg-[#EAF0FF]/35'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${visual.iconBg}`}
                    aria-hidden="true"
                  >
                    {visual.icon}
                  </span>
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#68748A]">
                      <span className={`font-semibold ${visual.labelClass}`}>{item.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{item.timestamp}</span>
                      {!item.read && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-[#315EF2]">Unread</span>
                        </>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-[#101C3A]">{item.title}</h3>
                    <p className="text-xs text-[#68748A] leading-relaxed">{item.message}</p>
                  </div>
                </div>
                {!item.read && (
                  <button
                    type="button"
                    onClick={() => onMarkRead(item.id)}
                    className="self-start min-h-[36px] px-3 py-1.5 rounded-lg border border-[#315EF2]/25 bg-white hover:bg-[#EAF0FF] text-xs font-semibold text-[#315EF2] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Mark Read
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

/* ---------------- 5. OCCUPANCY & RESERVATION HISTORY (MOBILE CARDS + DESKTOP TABLE) ---------------- */
const StudentHistoryView: React.FC<{
  reservations: ReturnType<typeof useILS>['reservations'];
  onNavigateToBook: () => void;
}> = ({ reservations, onNavigateToBook }) => {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(
    () =>
      reservations.filter((r) => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (
          query.trim() &&
          !`${r.id} ${r.seatId} ${r.zone} ${r.date}`.toLowerCase().includes(query.toLowerCase())
        ) {
          return false;
        }
        return true;
      }),
    [reservations, query, statusFilter]
  );

  const statusTone = (status: string) => {
    if (status === 'Active') return 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
    if (status === 'Temporarily Away') return 'bg-amber-50 text-amber-800 border-amber-200/80';
    if (status === 'Expired') return 'bg-rose-50 text-rose-700 border-rose-200/80';
    if (status === 'Completed') return 'bg-[#EAF0FF] text-[#315EF2] border-[#DCE6FF]';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="hidden lg:block">
        <PageHeader
          title="Occupancy & Reservation History"
          description="Chronological record of your past and current Individual Learning Space bookings."
          action={
            <button
              type="button"
              onClick={onNavigateToBook}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] text-white text-xs font-semibold shadow-xs cursor-pointer whitespace-nowrap"
            >
              <QrCode className="h-3.5 w-3.5" />
              <span>Book Seat</span>
            </button>
          }
        />
      </div>

      <div className="space-y-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search seat ID, zone, or date..."
            className="w-full min-h-[42px] pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:border-[#315EF2]"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {['all', 'Active', 'Temporarily Away', 'Completed', 'Expired', 'Cancelled'].map(
            (status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-xl border cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  statusFilter === status
                    ? 'bg-[#101C3A] text-white border-[#101C3A]'
                    : 'bg-white text-[#68748A] border-slate-200/90 hover:text-[#101C3A]'
                }`}
              >
                {status === 'all' ? 'All' : status}
              </button>
            )
          )}
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        {/* Mobile Stacked Cards (< sm) */}
        <div className="sm:hidden divide-y divide-slate-100">
          {filtered.map((r) => (
            <div key={r.id} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-[#315EF2] tabular-nums">
                    {r.seatId}
                  </span>
                  <span className="text-xs text-[#68748A]">· {r.zone}</span>
                </div>
                <div className="font-mono text-xs text-[#172033] tabular-nums">
                  {r.date} · {r.startTime} – {r.endTime}
                </div>
                <div className="font-mono text-[11px] text-[#68748A]">
                  {r.id} · {r.durationMinutes} min
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold whitespace-nowrap shrink-0 ${statusTone(r.status)}`}
              >
                {r.status}
              </span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-10 px-4 text-center text-xs text-[#68748A]">
              No matching reservation records found.
            </div>
          )}
        </div>

        {/* Desktop Table (sm+) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-[#F5F7FC] text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                <th className="py-3.5 px-4">Reservation</th>
                <th className="py-3.5 px-4">ILS Seat</th>
                <th className="py-3.5 px-4">Zone</th>
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4">Time Window</th>
                <th className="py-3.5 px-4 text-right">Duration</th>
                <th className="py-3.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-[#F5F7FC]/70 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A] tabular-nums">
                    {r.id}
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-[#315EF2] tabular-nums">
                    {r.seatId}
                  </td>
                  <td className="py-3.5 px-4 text-[#68748A]">{r.zone}</td>
                  <td className="py-3.5 px-4 font-mono text-[#68748A] tabular-nums">{r.date}</td>
                  <td className="py-3.5 px-4 font-mono text-[#172033] tabular-nums">
                    {r.startTime} – {r.endTime}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-[#172033] tabular-nums">
                    {r.durationMinutes} min
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap ${statusTone(r.status)}`}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#68748A]">
                    No matching reservation records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ---------------- 6. VIOLATIONS & WARNINGS (MOBILE CARDS + DESKTOP TABLE) ---------------- */
const StudentViolationsView: React.FC<{
  student: ReturnType<typeof useILS>['currentStudent'];
  violations: ReturnType<typeof useILS>['violations'];
  violationPolicy: ReturnType<typeof useILS>['violationPolicy'];
  maxAwayMinutes: number;
}> = ({ student, violations, violationPolicy, maxAwayMinutes }) => {
  const monthlyCount = student.monthlyViolationCount ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="hidden lg:block">
        <PageHeader
          title="Violations & Warnings"
          description="Monthly compliance cycle (Asia/Karachi timezone) and permanent historical violation records."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="surface-card p-4 sm:p-5">
          <div className="text-xs font-semibold text-[#68748A]">
            Monthly Counter ({violationPolicy.currentMonth})
          </div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-bold text-[#101C3A] tabular-nums">
            {monthlyCount}
          </div>
          <div className="mt-1 text-xs text-[#68748A]">
            Resets automatically on {violationPolicy.nextResetDate}
          </div>
        </div>
        <div className="surface-card p-4 sm:p-5">
          <div className="text-xs font-semibold text-[#68748A]">1st Monthly Violation</div>
          <div className="mt-1.5 text-xl sm:text-2xl font-bold text-amber-700">Warning Only</div>
          <div className="mt-1 text-xs text-[#68748A]">
            PKR 0 fine · Released after {maxAwayMinutes}m away
          </div>
        </div>
        <div className="surface-card p-4 sm:p-5">
          <div className="text-xs font-semibold text-[#68748A]">2nd+ Violations</div>
          <div className="mt-1.5 text-xl sm:text-2xl font-bold text-rose-700 tabular-nums">
            PKR {violationPolicy.currentFinePkr.toLocaleString()} / each
          </div>
          <div className="mt-1 text-xs text-[#68748A]">Recorded in your Financial Ledger</div>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold text-[#101C3A]">
            Permanent Violation History
          </h2>
          <span className="font-mono text-[11px] text-[#68748A] tabular-nums">
            {violations.length} records
          </span>
        </div>

        {/* Mobile Stacked Cards (< sm) */}
        <div className="sm:hidden divide-y divide-slate-100">
          {violations.map((v) => (
            <div key={v.id} className="p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#315EF2]">{v.seatId}</span>
                  <span className="font-mono text-[11px] text-[#68748A] tabular-nums">
                    {v.date} · #{v.monthlyViolationNumber ?? 1}
                  </span>
                </div>
                <span
                  className={`text-xs font-bold ${
                    v.status === 'Resolved'
                      ? 'text-emerald-700'
                      : v.status === 'Waived'
                        ? 'text-[#0F8B7C]'
                        : 'text-amber-700'
                  }`}
                >
                  {v.status}
                </span>
              </div>
              <div className="text-xs font-semibold text-[#101C3A]">{v.type}</div>
              <div className="flex items-center justify-between text-[11px] text-[#68748A]">
                <span>{v.severity}</span>
                <span className="font-mono font-bold text-[#101C3A] tabular-nums">
                  {v.finePkr > 0 ? `PKR ${v.finePkr.toLocaleString()}` : 'Warning (PKR 0)'}
                </span>
              </div>
            </div>
          ))}
          {violations.length === 0 && (
            <div className="py-10 px-4 text-center text-xs text-[#68748A]">
              Clean compliance record with zero violations.
            </div>
          )}
        </div>

        {/* Desktop Table (sm+) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-[#F5F7FC] text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                <th className="py-3.5 px-4">Reference</th>
                <th className="py-3.5 px-4">Month / #</th>
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4">Seat</th>
                <th className="py-3.5 px-4">Reason</th>
                <th className="py-3.5 px-4">Action</th>
                <th className="py-3.5 px-4 text-right">Fine (PKR)</th>
                <th className="py-3.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {violations.map((v) => (
                <tr key={v.id} className="hover:bg-[#F5F7FC]/70">
                  <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A]">{v.id}</td>
                  <td className="py-3.5 px-4 font-mono text-[#172033] tabular-nums whitespace-nowrap">
                    {v.calendarMonth ?? '—'} · #{v.monthlyViolationNumber ?? 1}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[#68748A] tabular-nums">{v.date}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-[#315EF2]">{v.seatId}</td>
                  <td className="py-3.5 px-4 text-[#172033] font-medium">{v.type}</td>
                  <td className="py-3.5 px-4 text-[#68748A]">{v.severity}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-[#101C3A]">
                    {v.finePkr > 0 ? `PKR ${v.finePkr.toLocaleString()}` : 'Warning (PKR 0)'}
                  </td>
                  <td
                    className={`py-3.5 px-4 font-semibold whitespace-nowrap ${
                      v.status === 'Resolved'
                        ? 'text-emerald-700'
                        : v.status === 'Waived'
                          ? 'text-[#0F8B7C]'
                          : 'text-amber-700'
                    }`}
                  >
                    {v.status}
                  </td>
                </tr>
              ))}
              {violations.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#68748A]">
                    Your account has a clean compliance record with zero violations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ---------------- 7. PROFILE SCREEN (MOBILE-FIRST HUB MATCHING REFERENCE) ---------------- */
const StudentProfileHubView: React.FC<{
  student: ReturnType<typeof useILS>['currentStudent'];
  unreadNotificationsCount: number;
  outstandingDuesPkr: number;
  maxAwayMinutes: number;
  violationPolicy: ReturnType<typeof useILS>['violationPolicy'];
  onNavigate: (route: StudentRoute) => void;
  onSavePreferences: (prefs: {
    emailAlerts: boolean;
    graceReminders: boolean;
    phone: string;
  }) => Promise<{ ok: boolean; message: string }>;
  onLogout: () => void;
}> = ({
  student,
  unreadNotificationsCount,
  outstandingDuesPkr,
  maxAwayMinutes,
  violationPolicy,
  onNavigate,
  onSavePreferences,
  onLogout,
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [phone, setPhone] = useState(student.phone);
  const [emailAlerts, setEmailAlerts] = useState(student.emailAlerts);
  const [graceReminders, setGraceReminders] = useState(student.graceReminders);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setPhone(student.phone);
    setEmailAlerts(student.emailAlerts);
    setGraceReminders(student.graceReminders);
  }, [student.phone, student.emailAlerts, student.graceReminders]);

  const { pushToast } = useToast();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await onSavePreferences({ phone, emailAlerts, graceReminders });
    setSaving(false);
    setSavedNotice(res);
    pushToast({
      tone: res.ok ? 'success' : 'error',
      title: res.ok ? 'Settings saved' : 'Could not save settings',
      description: res.message,
    });
    setTimeout(() => setSavedNotice(null), 3000);
  };

  const menuRows: Array<{
    key: string;
    label: string;
    subtitle: string;
    icon: React.ReactNode;
    badge?: string;
    badgeTone?: string;
    onClick: () => void;
  }> = [
    {
      key: 'my-reservation',
      label: 'My Reservations',
      subtitle: 'Active desk session & live presence status',
      icon: <CalendarClock className="h-4.5 w-4.5 text-[#101C3A]" />,
      onClick: () => onNavigate('my-reservation'),
    },
    {
      key: 'analytics',
      label: 'My Study Analytics',
      subtitle: 'Weekly hours, trends & study habits (DEMO)',
      icon: <BarChart3 className="h-4.5 w-4.5 text-[#315EF2]" />,
      onClick: () => onNavigate('analytics'),
    },
    {
      key: 'history',
      label: 'Occupancy History',
      subtitle: `${student.totalSessions} completed ILS sessions`,
      icon: <History className="h-4.5 w-4.5 text-[#0F8B7C]" />,
      onClick: () => onNavigate('history'),
    },
    {
      key: 'violations',
      label: 'Violations',
      subtitle: `Monthly count: ${student.monthlyViolationCount ?? 0} (${violationPolicy.currentMonth})`,
      icon: <ShieldAlert className="h-4.5 w-4.5 text-amber-600" />,
      badge:
        (student.monthlyViolationCount ?? 0) > 0
          ? String(student.monthlyViolationCount)
          : undefined,
      badgeTone: 'bg-amber-50 text-amber-800 border-amber-200',
      onClick: () => onNavigate('violations'),
    },
    {
      key: 'ledger',
      label: 'Financial Ledger',
      subtitle:
        outstandingDuesPkr > 0
          ? `Outstanding: PKR ${outstandingDuesPkr.toLocaleString()}`
          : 'No outstanding dues (PKR 0)',
      icon: <ReceiptText className="h-4.5 w-4.5 text-[#101C3A]" />,
      badge: outstandingDuesPkr > 0 ? `PKR ${outstandingDuesPkr.toLocaleString()}` : undefined,
      badgeTone: 'bg-rose-50 text-rose-700 border-rose-200',
      onClick: () => onNavigate('ledger'),
    },
    {
      key: 'notifications',
      label: 'Notifications',
      subtitle: 'Booking confirmations & 5-minute absence alerts',
      icon: <Bell className="h-4.5 w-4.5 text-[#315EF2]" />,
      badge: unreadNotificationsCount > 0 ? String(unreadNotificationsCount) : undefined,
      badgeTone: 'bg-[#EAF0FF] text-[#315EF2] border-[#DCE6FF]',
      onClick: () => onNavigate('notifications'),
    },
    {
      key: 'settings',
      label: 'Settings',
      subtitle: 'Mobile number, email & absence alert preferences',
      icon: <Settings className="h-4.5 w-4.5 text-[#101C3A]" />,
      onClick: () => setSettingsOpen((prev) => !prev),
    },
    {
      key: 'help',
      label: 'Help & Support',
      subtitle: 'QR check-in guide, library policy & desk contact',
      icon: <HelpCircle className="h-4.5 w-4.5 text-[#0F8B7C]" />,
      onClick: () => setHelpOpen(true),
    },
  ];

  return (
    <div className="space-y-0 lg:space-y-6">
      {/* Top Deep Navy Profile Banner (Mobile-First Reference) */}
      <section className="bg-[#101C3A] text-white px-4 pt-safe pt-5 pb-12 lg:rounded-[22px] lg:p-7">
        <div className="flex items-center justify-between lg:hidden mb-4">
          <span className="w-10" />
          <h1 className="font-display text-base font-bold text-white">My Profile</h1>
          <button
            type="button"
            onClick={() => setSettingsOpen((prev) => !prev)}
            aria-label="Toggle Settings"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-blue-100 hover:bg-white/10 cursor-pointer"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>

        <div className="hidden lg:flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <SafeImage
              src={student.avatarUrl}
              alt={student.name}
              fallbackLabel={student.name}
              className="h-16 w-16 rounded-2xl object-cover border-2 border-white/25 shrink-0"
            />
            <div>
              <h1 className="font-display text-2xl font-bold text-white">{student.name}</h1>
              <p className="text-xs text-blue-200 mt-0.5">
                Student · ERP <span className="font-mono">{student.erpId}</span> · {student.program}{' '}
                · {student.batch}
              </p>
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs font-semibold text-[#2DD4BF]">
            {student.status}
          </span>
        </div>
      </section>

      {/* Overlapping Light Canvas with Centered Mobile Avatar + Menu List */}
      <div className="bg-[#F5F7FC] rounded-t-[24px] -mt-6 px-4 pt-0 pb-2 lg:bg-transparent lg:rounded-none lg:mt-0 lg:px-0 space-y-4 sm:space-y-5">
        {/* Centered Mobile Avatar Identity Block */}
        <div className="lg:hidden flex flex-col items-center text-center -mt-10 pb-1">
          <SafeImage
            src={student.avatarUrl}
            alt={student.name}
            fallbackLabel={student.name}
            className="h-20 w-20 rounded-full object-cover border-4 border-white shadow-md bg-white"
          />
          <h2 className="mt-2.5 font-display text-lg font-bold text-[#101C3A]">{student.name}</h2>
          <p className="text-xs font-medium text-[#68748A] font-mono tabular-nums">
            Student · ERP {student.erpId}
          </p>
          <p className="mt-0.5 text-xs text-[#68748A]">
            {student.program} · {student.batch}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Grouped Navigation Menu List (All 9 Requested Destinations) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="surface-card divide-y divide-slate-100 overflow-hidden">
              {menuRows.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={row.onClick}
                  className="w-full min-h-[60px] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-[#F5F7FC] active:bg-[#EAF0FF]/50 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="h-9 w-9 rounded-xl bg-[#F5F7FC] border border-slate-200/80 flex items-center justify-center shrink-0">
                      {row.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#101C3A] truncate">
                        {row.label}
                      </div>
                      <div className="text-[11px] text-[#68748A] truncate">{row.subtitle}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {row.badge && (
                      <span
                        className={`px-2 py-0.5 rounded-md border font-mono text-[11px] font-bold tabular-nums ${row.badgeTone}`}
                      >
                        {row.badge}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </button>
              ))}
            </div>

            {/* Full-Width Soft Logout Button with confirmation dialog */}
            <button
              type="button"
              onClick={() => setLogoutConfirmOpen(true)}
              className="w-full min-h-[50px] inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-50 hover:bg-rose-100/80 active:scale-[0.98] border border-rose-200/80 text-rose-700 text-sm font-bold transition-all cursor-pointer shadow-2xs"
            >
              <LogOut className="h-4.5 w-4.5" />
              <span>Logout</span>
            </button>

            <ConfirmDialog
              open={logoutConfirmOpen}
              title="Log out of your IBA account?"
              description={`You are signed in as ${student.name} (ERP ${student.erpId}). Any active reservation will remain tracked on the server.`}
              confirmLabel="Logout"
              cancelLabel="Stay Signed In"
              tone="danger"
              icon={<LogOut className="h-5 w-5" />}
              onConfirm={() => {
                setLogoutConfirmOpen(false);
                onLogout();
              }}
              onCancel={() => setLogoutConfirmOpen(false)}
            />
          </div>

          {/* Right Column on Desktop (or Expandable Panel on Mobile): Student Info + Settings */}
          <div className="lg:col-span-5 space-y-4">
            {/* Institutional Details Card */}
            <div className="surface-card p-5 space-y-3">
              <h3 className="font-display text-sm font-bold text-[#101C3A]">
                Student Information
              </h3>
              <dl className="divide-y divide-slate-100 text-xs">
                <div className="py-2.5 flex justify-between gap-3">
                  <dt className="text-[#68748A]">Institutional Email</dt>
                  <dd className="font-medium text-[#101C3A] text-right truncate">
                    {student.email}
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between gap-3">
                  <dt className="text-[#68748A]">Campus</dt>
                  <dd className="font-medium text-[#101C3A] text-right">{student.campus}</dd>
                </div>
                <div className="py-2.5 flex justify-between gap-3">
                  <dt className="text-[#68748A]">Account Status</dt>
                  <dd className="font-semibold text-emerald-700 text-right">{student.status}</dd>
                </div>
                <div className="py-2.5 flex justify-between gap-3">
                  <dt className="text-[#68748A]">Completed Sessions</dt>
                  <dd className="font-mono font-bold text-[#101C3A] tabular-nums">
                    {student.totalSessions}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Settings Form (Always visible on desktop, toggleable via Settings row on mobile) */}
            <form
              onSubmit={(e) => void handleSave(e)}
              className={`${settingsOpen ? 'block' : 'hidden lg:block'} surface-card p-5 space-y-4`}
            >
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-display text-sm font-bold text-[#101C3A]">
                    Notification Settings
                  </h3>
                  <p className="text-[11px] text-[#68748A]">
                    Saved directly to your IBA student record.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
                  aria-label="Close settings"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div>
                <label
                  htmlFor="student-phone"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  Mobile Number
                </label>
                <input
                  id="student-phone"
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono rounded-xl border border-slate-200 bg-white focus:border-[#315EF2]"
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailAlerts}
                    onChange={(e) => setEmailAlerts(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#315EF2]"
                  />
                  <span className="text-xs text-[#68748A]">
                    <span className="font-semibold text-[#101C3A] block">
                      Email Booking Confirmations
                    </span>
                    Receive confirmations whenever an ILS session begins or ends.
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={graceReminders}
                    onChange={(e) => setGraceReminders(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#315EF2]"
                  />
                  <span className="text-xs text-[#68748A]">
                    <span className="font-semibold text-[#101C3A] block">
                      5-Minute Absence Warnings
                    </span>
                    Alert before the {maxAwayMinutes}-minute temporary absence timer expires.
                  </span>
                </label>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
                {savedNotice && (
                  <span
                    className={`text-xs font-semibold ${
                      savedNotice.ok ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {savedNotice.message}
                  </span>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Help & Support Bottom Sheet / Modal */}
      {helpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Help and Support"
        >
          <div
            className="fixed inset-0 bg-[#0A1329]/60 backdrop-blur-[2px]"
            onClick={() => setHelpOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="h-9 w-9 rounded-xl bg-teal-50 text-[#0F8B7C] flex items-center justify-center">
                  <HelpCircle className="h-5 w-5" />
                </span>
                <h3 className="font-display text-base font-bold text-[#101C3A]">
                  Help &amp; Support
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                aria-label="Close help"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#68748A] leading-relaxed">
              <div className="rounded-xl bg-[#F5F7FC] p-3.5">
                <div className="font-semibold text-[#101C3A]">QR Check-In &amp; Manual Fallback</div>
                <p className="mt-1">
                  Scan the fixed QR code mounted on any green available carrel (ILS-01 to ILS-30).
                  If your camera is unavailable, tap &ldquo;Enter Seat ID Manually&rdquo; inside the
                  scanner.
                </p>
              </div>
              <div className="rounded-xl bg-[#F5F7FC] p-3.5">
                <div className="font-semibold text-[#101C3A]">
                  {maxAwayMinutes}-Minute Absence Policy
                </div>
                <p className="mt-1">
                  Stepping away pauses your seat under a {maxAwayMinutes}-minute grace timer with a
                  5-minute warning. 1st monthly expiry issues a warning only; 2nd+ incurs PKR{' '}
                  {violationPolicy.currentFinePkr.toLocaleString()}.
                </p>
              </div>
              <div className="rounded-xl bg-[#F5F7FC] p-3.5">
                <div className="font-semibold text-[#101C3A]">IBA Digital Library Desk</div>
                <p className="mt-1">
                  Main Campus Library Circulation Desk · Daily 08:30 AM – 09:30 PM PKT ·
                  library@iba.edu.pk
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="w-full min-h-[46px] rounded-xl bg-[#101C3A] text-white text-xs font-semibold cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
