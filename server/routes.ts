import crypto from 'node:crypto';
import express from 'express';
import type { Request, Response } from 'express';
import {
  createSession,
  hasConfiguredEnvAdminPassword,
  hashPassword,
  requireAdmin,
  requireAuth,
  requireStudent,
  revokeSession,
  verifyEnvAdminPassword,
  verifyPassword,
} from './auth.ts';
import type { AuthenticatedRequest } from './auth.ts';
import { db } from './db.ts';
import {
  isDemoTimerEnabled,
  processAutomatedAbsences,
  setDemoTimerEnabled,
} from './absenceManager.ts';
import type { AbsenceTimerMode } from './absenceManager.ts';
import { broadcastSeatUpdate, registerSeatEventClient } from './events.ts';
import { generateSecureSeatQrToken } from './seed.ts';
import {
  DEMO_TIMER_DEBOUNCE_WINDOW_MS,
  isHardwareIoTConfigured,
  isValidSensorSignalState,
  processSensorSignal,
  SENSOR_DEBOUNCE_WINDOW_MS,
  verifyHardwareIoTKey,
} from './sensors.ts';
import type { SensorSignalState } from './sensors.ts';
import {
  getKarachiCalendarMonth,
  getKarachiDateString,
  getKarachiMonthResetMeta,
  syncMonthlyViolationReset,
} from './violationPolicy.ts';
import {
  buildAdminReportsData,
  computeAdminOverviewMetrics,
  exportAdminReportCsv,
  fetchAdminInterventions,
  recordAdminInterventionInTx,
} from './adminReports.ts';
import type { AdminReportType } from './adminReports.ts';

export const apiRouter = express.Router();

function extractQrTokenFromPayload(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 512) return '';

  // Support full application URLs such as https://host/?scan_qr=IBA-ILS-05-9F4A2C7E
  if (/^https?:\/\//i.test(trimmed) || /^iba-ils:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const tokenParam =
        parsed.searchParams.get('scan_qr') ??
        parsed.searchParams.get('qr') ??
        parsed.searchParams.get('token');
      if (tokenParam && tokenParam.trim()) {
        return tokenParam.trim();
      }
    } catch {
      return '';
    }
  }

  // Reject bare seat IDs like "ILS-05" — must be a full registered secure QR token
  return trimmed;
}

interface StudentRow {
  student_id: string;
  full_name: string;
  email: string;
  auth_reference: string;
  password_hash: string | null;
  role: 'student' | 'admin';
  account_status: 'Active' | 'Warning Issued' | 'Restricted';
  is_demo: number;
  program: string;
  batch: string;
  campus: string;
  phone: string;
  monthly_violation_count: number;
  current_violation_month: string;
  email_alerts: number;
  grace_reminders: number;
  created_date: string;
}

interface SeatJoinedRow {
  seat_id: string;
  ils_number: number;
  zone: string;
  floor: string;
  qr_code_identifier: string;
  qr_active: number;
  current_status: 'available' | 'occupied' | 'away' | 'maintenance';
  assigned_student_id: string | null;
  assigned_student_name: string | null;
  sensor_id: string;
  sensor_connectivity: 'Online' | 'Ready' | 'Offline' | 'Calibrating';
  sensor_presence?: SensorSignalState;
  last_sensor_event_at?: string | null;
  maintenance_status: 'Operational' | 'Scheduled' | 'In Maintenance';
  maintenance_note: string | null;
  has_power_outlet: number;
  has_task_lamp: number;
  has_monitor_dock: number;
  active_start: string | null;
  active_expiry: string | null;
  active_departure: string | null;
  active_absence_warning_at: string | null;
  active_absence_deadline_at: string | null;
  active_absence_warning_sent_at: string | null;
  active_absence_timer_mode: AbsenceTimerMode | null;
}

function formatTimeHHMM(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(11, 16) || iso;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDateYMD(iso: string): string {
  return iso.slice(0, 10);
}

function getAllSeatsWithActiveWindow(): SeatJoinedRow[] {
  return db
    .prepare(
      `SELECT
         s.*,
         u.full_name AS assigned_student_name,
         (
           SELECT r.start_timestamp
           FROM reservations r
           WHERE r.seat_id = s.seat_id
             AND r.reservation_status IN ('Active', 'Temporarily Away')
           ORDER BY r.start_timestamp DESC
           LIMIT 1
         ) AS active_start,
         (
           SELECT r.expiry_timestamp
           FROM reservations r
           WHERE r.seat_id = s.seat_id
             AND r.reservation_status IN ('Active', 'Temporarily Away')
           ORDER BY r.start_timestamp DESC
           LIMIT 1
         ) AS active_expiry,
         (
           SELECT r.departure_timestamp
           FROM reservations r
           WHERE r.seat_id = s.seat_id
             AND r.reservation_status = 'Temporarily Away'
           ORDER BY r.start_timestamp DESC
           LIMIT 1
         ) AS active_departure,
         (
           SELECT r.absence_warning_at
           FROM reservations r
           WHERE r.seat_id = s.seat_id
             AND r.reservation_status = 'Temporarily Away'
           ORDER BY r.start_timestamp DESC
           LIMIT 1
         ) AS active_absence_warning_at,
         (
           SELECT r.absence_deadline_at
           FROM reservations r
           WHERE r.seat_id = s.seat_id
             AND r.reservation_status = 'Temporarily Away'
           ORDER BY r.start_timestamp DESC
           LIMIT 1
         ) AS active_absence_deadline_at,
         (
           SELECT r.absence_warning_sent_at
           FROM reservations r
           WHERE r.seat_id = s.seat_id
             AND r.reservation_status = 'Temporarily Away'
           ORDER BY r.start_timestamp DESC
           LIMIT 1
         ) AS active_absence_warning_sent_at,
         (
           SELECT r.absence_timer_mode
           FROM reservations r
           WHERE r.seat_id = s.seat_id
             AND r.reservation_status = 'Temporarily Away'
           ORDER BY r.start_timestamp DESC
           LIMIT 1
         ) AS active_absence_timer_mode
       FROM ils_seats s
       LEFT JOIN students u ON u.student_id = s.assigned_student_id
       ORDER BY s.ils_number ASC`
    )
    .all() as SeatJoinedRow[];
}

function mapSeatForClient(
  row: SeatJoinedRow,
  viewerRole: 'public' | 'student' | 'admin',
  viewerStudentId?: string,
  maxAwayMinutes = 20
) {
  const canSeeOccupant =
    viewerRole === 'admin' ||
    (viewerRole === 'student' && row.assigned_student_id && row.assigned_student_id === viewerStudentId);

  let reservationDurationMinutes: number | undefined;
  if (row.active_start && row.active_expiry) {
    const startMs = new Date(row.active_start).getTime();
    const expMs = new Date(row.active_expiry).getTime();
    if (!Number.isNaN(startMs) && !Number.isNaN(expMs) && expMs > startMs) {
      reservationDurationMinutes = Math.round((expMs - startMs) / 60000);
    }
  }

  const sensorPresence: SensorSignalState = isValidSensorSignalState(row.sensor_presence)
    ? row.sensor_presence
    : row.sensor_connectivity === 'Offline'
      ? 'OFFLINE'
      : row.current_status === 'occupied'
        ? 'PRESENT'
        : 'ABSENT';

  const isSensorOffline = sensorPresence === 'OFFLINE' || row.sensor_connectivity === 'Offline';

  // Pause/suppress absence countdown if sensor is OFFLINE (unreliable sensor data must never trigger violations)
  let graceExpiresAt: string | undefined;
  if (!isSensorOffline && row.current_status === 'away') {
    if (row.active_absence_deadline_at) {
      graceExpiresAt = row.active_absence_deadline_at;
    } else if (row.active_departure) {
      const depMs = new Date(row.active_departure).getTime();
      if (!Number.isNaN(depMs)) {
        graceExpiresAt = new Date(depMs + maxAwayMinutes * 60000).toISOString();
      }
    }
  }

  // If seat is unreserved and sensor is Offline, mark unavailable ('maintenance') so it cannot be booked.
  // If a student ALREADY holds an active reservation when sensor goes Offline, preserve their occupancy without evicting or penalizing.
  const hasActiveAssignment = Boolean(row.assigned_student_id) && (row.current_status === 'occupied' || row.current_status === 'away');
  const effectiveStatus: 'available' | 'occupied' | 'away' | 'maintenance' =
    row.current_status === 'maintenance' || row.maintenance_status === 'In Maintenance'
      ? 'maintenance'
      : isSensorOffline
        ? hasActiveAssignment
          ? 'occupied'
          : 'maintenance'
        : row.current_status;

  const canSeeQrToken =
    viewerRole === 'admin' ||
    (viewerRole === 'student' && row.assigned_student_id && row.assigned_student_id === viewerStudentId);

  return {
    id: row.seat_id,
    number: row.ils_number,
    zone: row.zone,
    floor: row.floor,
    status: effectiveStatus,
    hasPowerOutlet: row.has_power_outlet === 1,
    hasTaskLamp: row.has_task_lamp === 1,
    hasMonitorDock: row.has_monitor_dock === 1,
    qrCodeToken: canSeeQrToken ? row.qr_code_identifier : 'Physical Desk QR Required',
    qrActive: row.qr_active === 1,
    sensorNodeId: row.sensor_id,
    sensorState: isSensorOffline ? 'Offline' : row.sensor_connectivity,
    sensorPresence,
    lastSensorEventAt: row.last_sensor_event_at ?? undefined,
    maintenanceStatus: row.maintenance_status,
    occupantErp: canSeeOccupant ? row.assigned_student_id ?? undefined : undefined,
    occupantName: canSeeOccupant ? row.assigned_student_name ?? undefined : undefined,
    reservationStartTime: formatTimeHHMM(row.active_start),
    reservedUntil: formatTimeHHMM(row.active_expiry),
    reservationDurationMinutes,
    awaySince: !isSensorOffline && row.current_status === 'away' ? formatTimeHHMM(row.active_departure) : undefined,
    departureTimestamp: !isSensorOffline && row.current_status === 'away' ? row.active_departure ?? undefined : undefined,
    gracePeriodMinutes: !isSensorOffline && row.current_status === 'away' ? maxAwayMinutes : undefined,
    graceExpiresAt,
    absenceWarningAt: !isSensorOffline && row.current_status === 'away' ? row.active_absence_warning_at ?? undefined : undefined,
    absenceWarningSentAt: !isSensorOffline && row.current_status === 'away' ? row.active_absence_warning_sent_at ?? undefined : undefined,
    absenceTimerMode: !isSensorOffline && row.current_status === 'away' ? row.active_absence_timer_mode ?? 'production' : undefined,
    maintenanceNote:
      row.maintenance_note ??
      (isSensorOffline && !hasActiveAssignment ? 'Occupancy sensor OFFLINE — awaiting staff investigation' : undefined),
  };
}

function getLatestFineConfig() {
  const row = db
    .prepare(
      `SELECT
         fc.*,
         COALESCE(fc.warning_after_minutes, 15) AS warning_after_minutes,
         COALESCE(fc.monthly_reset_enabled, 1) AS monthly_reset_enabled,
         COALESCE(fc.first_violation_warning_only, 1) AS first_violation_warning_only,
         u.full_name AS updated_by_name
       FROM fine_configurations fc
       LEFT JOIN students u ON u.student_id = fc.updated_by_administrator
       ORDER BY fc.rowid DESC
       LIMIT 1`
    )
    .get() as
    | {
        configuration_id: string;
        fine_amount_pkr: number;
        overstay_fine_per_hour_pkr: number;
        grace_period_minutes: number;
        max_away_minutes: number;
        warning_after_minutes: number;
        monthly_reset_enabled: number;
        first_violation_warning_only: number;
        max_daily_hours: number;
        warnings_before_restriction: number;
        effective_date: string;
        updated_by_administrator: string;
        updated_by_name: string | null;
      }
    | undefined;

  if (!row) {
    return {
      configurationId: 'CFG-DEFAULT',
      gracePeriodMinutes: 15,
      maxAwayMinutes: 20,
      warningAfterMinutes: 15,
      monthlyResetEnabled: true,
      firstViolationWarningOnly: true,
      maxDailyHours: 4,
      noShowFinePkr: 250,
      overstayFinePerHourPkr: 300,
      warningsBeforeRestriction: 3,
      effectiveDate: '2026-09-01',
      updatedByAdministrator: 'IBA-LIB-014',
      updatedByName: 'Dr. Samina Qureshi',
    };
  }

  return {
    configurationId: row.configuration_id,
    gracePeriodMinutes: row.grace_period_minutes,
    maxAwayMinutes: row.max_away_minutes,
    warningAfterMinutes: Math.min(Math.max(1, row.warning_after_minutes ?? 15), Math.max(1, row.max_away_minutes - 1)),
    monthlyResetEnabled: row.monthly_reset_enabled !== 0,
    firstViolationWarningOnly: row.first_violation_warning_only !== 0,
    maxDailyHours: row.max_daily_hours,
    noShowFinePkr: row.fine_amount_pkr,
    overstayFinePerHourPkr: row.overstay_fine_per_hour_pkr,
    warningsBeforeRestriction: row.warnings_before_restriction,
    effectiveDate: row.effective_date,
    updatedByAdministrator: row.updated_by_administrator,
    updatedByName: row.updated_by_name ?? row.updated_by_administrator,
  };
}

function getFineConfigHistory() {
  const rows = db
    .prepare(
      `SELECT
         fc.*,
         COALESCE(fc.warning_after_minutes, 15) AS warning_after_minutes,
         COALESCE(fc.monthly_reset_enabled, 1) AS monthly_reset_enabled,
         COALESCE(fc.first_violation_warning_only, 1) AS first_violation_warning_only,
         u.full_name AS updated_by_name
       FROM fine_configurations fc
       LEFT JOIN students u ON u.student_id = fc.updated_by_administrator
       ORDER BY fc.rowid DESC
       LIMIT 20`
    )
    .all() as Array<{
    configuration_id: string;
    fine_amount_pkr: number;
    overstay_fine_per_hour_pkr: number;
    grace_period_minutes: number;
    max_away_minutes: number;
    warning_after_minutes: number;
    monthly_reset_enabled: number;
    first_violation_warning_only: number;
    max_daily_hours: number;
    warnings_before_restriction: number;
    effective_date: string;
    updated_by_administrator: string;
    updated_by_name: string | null;
  }>;

  return rows.map((row) => ({
    configurationId: row.configuration_id,
    gracePeriodMinutes: row.grace_period_minutes,
    maxAwayMinutes: row.max_away_minutes,
    warningAfterMinutes: Math.min(Math.max(1, row.warning_after_minutes ?? 15), Math.max(1, row.max_away_minutes - 1)),
    monthlyResetEnabled: row.monthly_reset_enabled !== 0,
    firstViolationWarningOnly: row.first_violation_warning_only !== 0,
    maxDailyHours: row.max_daily_hours,
    noShowFinePkr: row.fine_amount_pkr,
    overstayFinePerHourPkr: row.overstay_fine_per_hour_pkr,
    warningsBeforeRestriction: row.warnings_before_restriction,
    effectiveDate: row.effective_date,
    updatedByAdministrator: row.updated_by_administrator,
    updatedByName: row.updated_by_name ?? row.updated_by_administrator,
  }));
}

type CanonicalPaymentStatus = 'UNPAID' | 'PENDING' | 'PAID' | 'WAIVED';

function normalizePaymentStatus(raw: string | null | undefined): CanonicalPaymentStatus {
  const upper = String(raw ?? '').trim().toUpperCase();
  if (upper === 'PAID') return 'PAID';
  if (upper === 'PENDING') return 'PENDING';
  if (upper === 'WAIVED') return 'WAIVED';
  return 'UNPAID';
}

interface EnrichedTransactionRow {
  transaction_id: string;
  student_id: string;
  student_name: string;
  violation_id: string | null;
  seat_id: string | null;
  violation_seat_id: string | null;
  fine_configuration_id: string | null;
  transaction_date: string;
  description: string;
  amount_pkr: number;
  payment_status: string;
  payment_reference: string;
  payment_method: string | null;
  verified_by_administrator: string | null;
  verified_by_name: string | null;
  verified_at: string | null;
  waiver_reason: string | null;
  admin_notes: string | null;
  gateway_provider: string | null;
  gateway_transaction_id: string | null;
  updated_at: string | null;
}

function fetchEnrichedLedgerRows(studentId?: string): EnrichedTransactionRow[] {
  const baseSql = `
    SELECT
      ft.*,
      u.full_name AS student_name,
      v.seat_id AS violation_seat_id,
      adm.full_name AS verified_by_name
    FROM financial_transactions ft
    INNER JOIN students u ON u.student_id = ft.student_id
    LEFT JOIN violations v ON v.violation_id = ft.violation_id
    LEFT JOIN students adm ON adm.student_id = ft.verified_by_administrator
  `;
  if (studentId) {
    return db
      .prepare(`${baseSql} WHERE ft.student_id = ? ORDER BY ft.transaction_date DESC, ft.rowid DESC`)
      .all(studentId) as EnrichedTransactionRow[];
  }
  return db
    .prepare(`${baseSql} ORDER BY ft.transaction_date DESC, ft.rowid DESC`)
    .all() as EnrichedTransactionRow[];
}

function mapLedgerEntry(t: EnrichedTransactionRow) {
  const status = normalizePaymentStatus(t.payment_status);
  const relatedSeatId = t.seat_id ?? t.violation_seat_id ?? undefined;
  return {
    id: t.transaction_id,
    studentErp: t.student_id,
    studentName: t.student_name,
    seatId: relatedSeatId,
    violationId: t.violation_id ?? undefined,
    fineConfigurationId: t.fine_configuration_id ?? undefined,
    date: t.transaction_date,
    description: t.description,
    referenceId: t.payment_reference,
    amountPkr: t.amount_pkr,
    type: (status === 'WAIVED' ? 'Waiver' : status === 'PAID' ? 'Payment' : 'Fine') as
      | 'Fine'
      | 'Payment'
      | 'Waiver',
    status,
    paymentMethod: t.payment_method ?? undefined,
    verifiedById: t.verified_by_administrator ?? undefined,
    verifiedByName: t.verified_by_name ?? t.verified_by_administrator ?? undefined,
    verifiedAt: t.verified_at ?? undefined,
    waiverReason: t.waiver_reason ?? undefined,
    adminNotes: t.admin_notes ?? undefined,
    gatewayProvider: t.gateway_provider ?? undefined,
    gatewayTransactionId: t.gateway_transaction_id ?? undefined,
    updatedAt: t.updated_at ?? undefined,
  };
}

function computeFinancialSummary(entries: Array<ReturnType<typeof mapLedgerEntry>>) {
  let totalFinesGeneratedPkr = 0;
  let totalPaidPkr = 0;
  let totalWaivedPkr = 0;
  let unpaidAmountPkr = 0;
  let pendingAmountPkr = 0;
  let unpaidCount = 0;
  let pendingCount = 0;
  let paidCount = 0;
  let waivedCount = 0;

  for (const e of entries) {
    totalFinesGeneratedPkr += e.amountPkr;
    if (e.status === 'UNPAID') {
      unpaidAmountPkr += e.amountPkr;
      unpaidCount += 1;
    } else if (e.status === 'PENDING') {
      pendingAmountPkr += e.amountPkr;
      pendingCount += 1;
    } else if (e.status === 'PAID') {
      totalPaidPkr += e.amountPkr;
      paidCount += 1;
    } else if (e.status === 'WAIVED') {
      totalWaivedPkr += e.amountPkr;
      waivedCount += 1;
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
      unpaid: unpaidCount,
      pending: pendingCount,
      paid: paidCount,
      waived: waivedCount,
    },
  };
}

interface FinancialAuditRow {
  audit_id: string;
  transaction_id: string;
  student_id: string;
  student_name: string | null;
  action_type: 'FINE_CREATED' | 'MARKED_PENDING' | 'PAYMENT_VERIFIED' | 'FINE_WAIVED' | 'REOPENED_UNPAID';
  previous_status: string | null;
  new_status: CanonicalPaymentStatus;
  amount_pkr: number;
  payment_reference: string | null;
  payment_method: string | null;
  reason: string;
  performed_by_id: string;
  performed_by_name: string;
  performed_at: string;
}

function fetchFinancialAuditLogs(studentId?: string, limit = 150) {
  const baseSql = `
    SELECT al.*, u.full_name AS student_name
    FROM financial_audit_logs al
    LEFT JOIN students u ON u.student_id = al.student_id
  `;
  const rows = (
    studentId
      ? db
          .prepare(`${baseSql} WHERE al.student_id = ? ORDER BY al.performed_at DESC, al.rowid DESC LIMIT ?`)
          .all(studentId, limit)
      : db
          .prepare(`${baseSql} ORDER BY al.performed_at DESC, al.rowid DESC LIMIT ?`)
          .all(limit)
  ) as FinancialAuditRow[];

  return rows.map((r) => ({
    id: r.audit_id,
    transactionId: r.transaction_id,
    studentErp: r.student_id,
    studentName: r.student_name ?? r.student_id,
    actionType: r.action_type,
    previousStatus: r.previous_status ? normalizePaymentStatus(r.previous_status) : undefined,
    newStatus: normalizePaymentStatus(r.new_status),
    amountPkr: r.amount_pkr,
    paymentReference: r.payment_reference ?? undefined,
    paymentMethod: r.payment_method ?? undefined,
    reason: r.reason,
    performedById: r.performed_by_id,
    performedByName: r.performed_by_name,
    performedAt: r.performed_at,
  }));
}

function sanitizeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  // Neutralize spreadsheet formula injection characters (=, +, -, @, tab, CR)
  const neutralized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  const escaped = neutralized.replace(/"/g, '""');
  return `"${escaped}"`;
}

function mapStudentProfile(row: StudentRow) {
  const stats = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM reservations WHERE student_id = ?) AS total_sessions,
        (SELECT COUNT(*) FROM violations WHERE student_id = ?) AS violations_count,
        (SELECT COALESCE(SUM(amount_pkr), 0) FROM financial_transactions WHERE student_id = ?) AS total_fines_pkr,
        (SELECT COALESCE(SUM(amount_pkr), 0) FROM financial_transactions WHERE student_id = ? AND UPPER(payment_status) IN ('UNPAID', 'PENDING')) AS outstanding_dues,
        (SELECT COALESCE(SUM(amount_pkr), 0) FROM financial_transactions WHERE student_id = ? AND UPPER(payment_status) = 'PAID') AS total_paid_pkr,
        (SELECT COALESCE(SUM(amount_pkr), 0) FROM financial_transactions WHERE student_id = ? AND UPPER(payment_status) = 'WAIVED') AS total_waived_pkr,
        (SELECT COUNT(*) FROM financial_transactions WHERE student_id = ? AND UPPER(payment_status) = 'UNPAID') AS unpaid_count,
        (SELECT COUNT(*) FROM financial_transactions WHERE student_id = ? AND UPPER(payment_status) = 'PENDING') AS pending_count,
        (SELECT COUNT(*) FROM financial_transactions WHERE student_id = ? AND UPPER(payment_status) = 'PAID') AS paid_count,
        (SELECT COUNT(*) FROM financial_transactions WHERE student_id = ? AND UPPER(payment_status) = 'WAIVED') AS waived_count`
    )
    .get(
      row.student_id,
      row.student_id,
      row.student_id,
      row.student_id,
      row.student_id,
      row.student_id,
      row.student_id,
      row.student_id,
      row.student_id,
      row.student_id
    ) as {
    total_sessions: number;
    violations_count: number;
    total_fines_pkr: number;
    outstanding_dues: number;
    total_paid_pkr: number;
    total_waived_pkr: number;
    unpaid_count: number;
    pending_count: number;
    paid_count: number;
    waived_count: number;
  };

  return {
    erpId: row.student_id,
    name: row.full_name,
    email: row.email,
    authReference: row.auth_reference,
    role: row.role,
    isDemo: row.is_demo === 1,
    program: row.program,
    batch: row.batch,
    campus: row.campus,
    phone: row.phone,
    avatarUrl:
      row.role === 'admin'
        ? '/src/assets/images/avatar_admin_iba_1795643330176.jpg'
        : '/src/assets/images/avatar_student_iba_1795643329556.jpg',
    status: row.account_status,
    monthlyViolationCount: row.monthly_violation_count,
    currentViolationMonth: row.current_violation_month,
    createdDate: row.created_date,
    totalSessions: stats.total_sessions,
    violationsCount: stats.violations_count,
    outstandingDuesPkr: stats.outstanding_dues,
    totalFinesGeneratedPkr: stats.total_fines_pkr,
    totalPaidPkr: stats.total_paid_pkr,
    totalWaivedPkr: stats.total_waived_pkr,
    unpaidTransactionsCount: stats.unpaid_count,
    pendingTransactionsCount: stats.pending_count,
    paidTransactionsCount: stats.paid_count,
    waivedTransactionsCount: stats.waived_count,
    emailAlerts: row.email_alerts === 1,
    graceReminders: row.grace_reminders === 1,
  };
}

/* =========================================================================
 * PUBLIC & LIVE EVENT ROUTES (No PII exposed)
 * ========================================================================= */

apiRouter.get('/events/seats', (_req: Request, res: Response) => {
  registerSeatEventClient(res);
});

apiRouter.get('/public/seats', (_req: Request, res: Response) => {
  const fineCfg = getLatestFineConfig();
  const seats = getAllSeatsWithActiveWindow().map((s) =>
    mapSeatForClient(s, 'public', undefined, fineCfg.maxAwayMinutes)
  );
  res.json({ seats });
});

apiRouter.get('/auth/bootstrap-status', (_req: Request, res: Response) => {
  syncMonthlyViolationReset();
  const adminRow = db
    .prepare(`SELECT student_id, full_name, email, password_hash, is_demo FROM students WHERE role = 'admin' LIMIT 1`)
    .get() as
    | { student_id: string; full_name: string; email: string; password_hash: string | null; is_demo: number }
    | undefined;

  const envConfigured = hasConfiguredEnvAdminPassword();
  const dbConfigured = Boolean(adminRow?.password_hash);

  const demoStudents = db
    .prepare(
      `SELECT student_id, full_name, email, program, batch, account_status, monthly_violation_count
       FROM students
       WHERE role = 'student' AND is_demo = 1
       ORDER BY student_id ASC`
    )
    .all() as Array<{
    student_id: string;
    full_name: string;
    email: string;
    program: string;
    batch: string;
    account_status: string;
    monthly_violation_count: number;
  }>;

  res.json({
    adminSetupRequired: !envConfigured && !dbConfigured,
    adminUsesEnvSecret: envConfigured,
    adminAccount: adminRow
      ? {
          staffId: adminRow.student_id,
          name: adminRow.full_name,
          email: adminRow.email,
          isDemo: adminRow.is_demo === 1,
        }
      : null,
    demoStudents: demoStudents.map((s) => ({
      erpId: s.student_id,
      name: s.full_name,
      email: s.email,
      program: s.program,
      batch: s.batch,
      status: s.account_status,
      monthlyViolationCount: s.monthly_violation_count,
    })),
  });
});

/* =========================================================================
 * AUTHENTICATION ROUTES
 * ========================================================================= */

apiRouter.post('/auth/register', (req: Request, res: Response) => {
  const { erpId, fullName, email, program, batch, password } = req.body ?? {};

  const cleanErp = typeof erpId === 'string' ? erpId.trim() : '';
  const cleanName = typeof fullName === 'string' ? fullName.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const cleanProgram = typeof program === 'string' && program.trim() ? program.trim() : 'BS Computer Science';
  const cleanBatch = typeof batch === 'string' && batch.trim() ? batch.trim() : 'Class of 2028';
  const cleanPassword = typeof password === 'string' ? password : '';

  if (!/^[A-Za-z0-9-]{4,16}$/.test(cleanErp)) {
    res.status(400).json({ error: 'Enter a valid IBA ERP ID (4–16 letters or digits).' });
    return;
  }
  if (cleanName.length < 2 || cleanName.length > 80) {
    res.status(400).json({ error: 'Please enter your full name.' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    res.status(400).json({ error: 'Please enter a valid institutional email address.' });
    return;
  }
  if (cleanPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }

  const existing = db
    .prepare(`SELECT student_id FROM students WHERE student_id = ? OR LOWER(email) = ?`)
    .get(cleanErp, cleanEmail);

  if (existing) {
    res.status(409).json({ error: 'An account with this ERP ID or email already exists.' });
    return;
  }

  const passwordHash = hashPassword(cleanPassword);
  const nowIso = new Date().toISOString();
  const currentMonth = getKarachiCalendarMonth();
  const authReference = `AUTH-REAL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const registerTx = db.transaction(() => {
    db.prepare(
      `INSERT INTO students (
        student_id, full_name, email, auth_reference, password_hash, role,
        account_status, is_demo, program, batch, campus, phone,
        monthly_violation_count, current_violation_month, email_alerts, grace_reminders, created_date
      ) VALUES (?, ?, ?, ?, ?, 'student', 'Active', 0, ?, ?, 'IBA Main Campus, Karachi', '', 0, ?, 1, 1, ?)`
    ).run(cleanErp, cleanName, cleanEmail, authReference, passwordHash, cleanProgram, cleanBatch, currentMonth, nowIso);

    const welcomeSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    db.prepare(
      `INSERT INTO notifications (
        notification_id, student_id, title, message, category, created_timestamp, read_status
      ) VALUES (?, ?, ?, ?, 'System', ?, 0)`
    ).run(
      `NTF-${Date.now()}-${welcomeSuffix}`,
      cleanErp,
      'Welcome to IBA Digital Library Smart ILS',
      'Your student account has been registered. You may now scan desk QR codes or book any of the 30 Individual Learning Spaces.',
      nowIso
    );
  });

  registerTx();

  const session = createSession(cleanErp, 'student');
  const studentRow = db.prepare(`SELECT * FROM students WHERE student_id = ?`).get(cleanErp) as StudentRow;

  res.status(201).json({
    token: session.token,
    expiresAt: session.expiresAt,
    role: 'student',
    user: mapStudentProfile(studentRow),
  });
});

apiRouter.post('/auth/admin/setup', (req: Request, res: Response) => {
  if (hasConfiguredEnvAdminPassword()) {
    res.status(409).json({
      error: 'Administrator password is already configured via server environment secrets.',
    });
    return;
  }

  const { password } = req.body ?? {};
  const cleanPassword = typeof password === 'string' ? password : '';

  if (cleanPassword.length < 8) {
    res.status(400).json({ error: 'Administrator password must be at least 8 characters long.' });
    return;
  }

  const adminRow = db
    .prepare(`SELECT * FROM students WHERE role = 'admin' LIMIT 1`)
    .get() as StudentRow | undefined;

  if (!adminRow) {
    res.status(500).json({ error: 'Administrator record not found.' });
    return;
  }

  const hash = hashPassword(cleanPassword);
  const updateRes = db
    .prepare(`UPDATE students SET password_hash = ? WHERE student_id = ? AND role = 'admin' AND password_hash IS NULL`)
    .run(hash, adminRow.student_id);

  if (updateRes.changes === 0) {
    res.status(409).json({
      error: 'Administrator password has already been initialized. Please sign in with your password.',
    });
    return;
  }

  const session = createSession(adminRow.student_id, 'admin');
  const updatedAdmin = db.prepare(`SELECT * FROM students WHERE student_id = ?`).get(adminRow.student_id) as StudentRow;

  res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    role: 'admin',
    user: mapStudentProfile(updatedAdmin),
  });
});

apiRouter.post('/auth/login', (req: Request, res: Response) => {
  const { identifier, password, role } = req.body ?? {};
  const cleanId = typeof identifier === 'string' ? identifier.trim() : '';
  const cleanPassword = typeof password === 'string' ? password : '';
  const targetRole = role === 'admin' ? 'admin' : 'student';

  if (!cleanId || !cleanPassword) {
    res.status(400).json({ error: 'Please enter both your credentials and password.' });
    return;
  }

  const user = db
    .prepare(
      `SELECT * FROM students
       WHERE role = ? AND (LOWER(email) = LOWER(?) OR LOWER(student_id) = LOWER(?))
       LIMIT 1`
    )
    .get(targetRole, cleanId, cleanId) as StudentRow | undefined;

  if (!user) {
    res.status(401).json({ error: 'Invalid credentials. Please verify your ID/email and password.' });
    return;
  }

  if (targetRole === 'admin') {
    const envSet = hasConfiguredEnvAdminPassword();
    if (envSet) {
      if (!verifyEnvAdminPassword(cleanPassword)) {
        res.status(401).json({ error: 'Invalid administrator credentials.' });
        return;
      }
    } else if (!user.password_hash) {
      res.status(403).json({
        error: 'Administrator password has not been initialized yet. Use the first-run setup form.',
      });
      return;
    } else if (!verifyPassword(cleanPassword, user.password_hash)) {
      res.status(401).json({ error: 'Invalid administrator credentials.' });
      return;
    }
  } else {
    if (!user.password_hash) {
      res.status(401).json({
        error:
          user.is_demo === 1
            ? 'This is a demonstration student account. Use the collapsible Demo Accounts panel below to sign in, or register a real student account.'
            : 'Invalid credentials. Please verify your ERP ID/email and password.',
      });
      return;
    }
    if (!verifyPassword(cleanPassword, user.password_hash)) {
      res.status(401).json({ error: 'Invalid credentials. Please verify your ERP ID/email and password.' });
      return;
    }
  }

  const session = createSession(user.student_id, user.role);
  res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    role: user.role,
    user: mapStudentProfile(user),
  });
});

apiRouter.post('/auth/demo-student-login', (req: Request, res: Response) => {
  const { studentId } = req.body ?? {};
  const cleanId = typeof studentId === 'string' ? studentId.trim() : '';

  if (!cleanId) {
    res.status(400).json({ error: 'Select a demonstration student account.' });
    return;
  }

  // Strictly restricted on the server to seeded demonstration student accounts only (never real accounts or admins)
  const demoStudent = db
    .prepare(`SELECT * FROM students WHERE student_id = ? AND role = 'student' AND is_demo = 1 LIMIT 1`)
    .get(cleanId) as StudentRow | undefined;

  if (!demoStudent) {
    res.status(403).json({
      error: 'Demo sign-in is restricted strictly to designated demonstration student accounts.',
    });
    return;
  }

  const session = createSession(demoStudent.student_id, 'student');
  res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    role: 'student',
    user: mapStudentProfile(demoStudent),
  });
});

apiRouter.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (req.sessionTokenHash) {
    revokeSession(req.sessionTokenHash);
  }
  res.json({ ok: true });
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  syncMonthlyViolationReset();
  const userRow = db
    .prepare(`SELECT * FROM students WHERE student_id = ?`)
    .get(req.authUser!.studentId) as StudentRow | undefined;

  if (!userRow) {
    res.status(401).json({ error: 'Account not found.' });
    return;
  }

  res.json({ role: userRow.role, user: mapStudentProfile(userRow) });
});

/* =========================================================================
 * STUDENT-SCOPED ROUTES (Self-Only Data Isolation via Session)
 * ========================================================================= */

apiRouter.get('/student/bootstrap', requireAuth, requireStudent, (req: AuthenticatedRequest, res: Response) => {
  syncMonthlyViolationReset();
  const studentId = req.authUser!.studentId;
  const studentRow = db.prepare(`SELECT * FROM students WHERE student_id = ?`).get(studentId) as StudentRow;
  const fineCfg = getLatestFineConfig();
  const resetSettings = db
    .prepare(`SELECT last_violation_reset_month FROM system_settings WHERE setting_id = 1`)
    .get() as { last_violation_reset_month: string | null } | undefined;

  const seats = getAllSeatsWithActiveWindow().map((s) =>
    mapSeatForClient(s, 'student', studentId, fineCfg.maxAwayMinutes)
  );

  const resRows = db
    .prepare(
      `SELECT r.*, s.zone, u.full_name AS student_name
       FROM reservations r
       INNER JOIN ils_seats s ON s.seat_id = r.seat_id
       INNER JOIN students u ON u.student_id = r.student_id
       WHERE r.student_id = ?
       ORDER BY r.start_timestamp DESC`
    )
    .all(studentId) as Array<{
    reservation_id: string;
    student_id: string;
    seat_id: string;
    zone: string;
    student_name: string;
    start_timestamp: string;
    departure_timestamp: string | null;
    return_timestamp: string | null;
    expiry_timestamp: string;
    absence_warning_at: string | null;
    absence_deadline_at: string | null;
    absence_warning_sent_at: string | null;
    absence_timer_mode: AbsenceTimerMode | null;
    reservation_status: 'Active' | 'Temporarily Away' | 'Completed' | 'Cancelled' | 'Expired';
  }>;

  const notifRows = db
    .prepare(
      `SELECT * FROM notifications WHERE student_id = ? ORDER BY created_timestamp DESC`
    )
    .all(studentId) as Array<{
    notification_id: string;
    title: string;
    message: string;
    category: 'Reservation' | 'Policy' | 'System';
    created_timestamp: string;
    read_status: number;
  }>;

  const vioRows = db
    .prepare(
      `SELECT v.*, u.full_name AS student_name,
         (SELECT COALESCE(ft.amount_pkr, 0) FROM financial_transactions ft WHERE ft.violation_id = v.violation_id LIMIT 1) AS fine_pkr
       FROM violations v
       INNER JOIN students u ON u.student_id = v.student_id
       WHERE v.student_id = ?
       ORDER BY v.violation_timestamp DESC`
    )
    .all(studentId) as Array<{
    violation_id: string;
    student_id: string;
    student_name: string;
    seat_id: string;
    violation_timestamp: string;
    calendar_month: string;
    monthly_violation_number: number;
    violation_reason: string;
    penalty_status: string;
    fine_pkr: number;
  }>;

  const mappedLedger = fetchEnrichedLedgerRows(studentId).map(mapLedgerEntry);
  const financialSummary = computeFinancialSummary(mappedLedger);
  const karachiMeta = getKarachiMonthResetMeta();

  res.json({
    student: mapStudentProfile(studentRow),
    seats,
    reservations: resRows.map((r) => {
      const startMs = new Date(r.start_timestamp).getTime();
      const endMs = new Date(r.expiry_timestamp).getTime();
      const durationMinutes = Number.isNaN(startMs) || Number.isNaN(endMs) ? 120 : Math.max(30, Math.round((endMs - startMs) / 60000));
      return {
        id: r.reservation_id,
        seatId: r.seat_id,
        zone: r.zone,
        studentErp: r.student_id,
        studentName: r.student_name,
        date: formatDateYMD(r.start_timestamp),
        startTime: formatTimeHHMM(r.start_timestamp) ?? '14:00',
        endTime: formatTimeHHMM(r.expiry_timestamp) ?? '16:00',
        startTimestamp: r.start_timestamp,
        departureTimestamp: r.departure_timestamp ?? undefined,
        returnTimestamp: r.return_timestamp ?? undefined,
        expiryTimestamp: r.expiry_timestamp,
        absenceWarningAt: r.absence_warning_at ?? undefined,
        absenceDeadlineAt: r.absence_deadline_at ?? undefined,
        absenceWarningSentAt: r.absence_warning_sent_at ?? undefined,
        absenceTimerMode: r.absence_timer_mode ?? 'production',
        durationMinutes,
        status: r.reservation_status,
      };
    }),
    notifications: notifRows.map((n) => ({
      id: n.notification_id,
      title: n.title,
      message: n.message,
      category: n.category,
      timestamp: `${formatDateYMD(n.created_timestamp)} ${formatTimeHHMM(n.created_timestamp) ?? ''}`.trim(),
      read: n.read_status === 1,
    })),
    violations: vioRows.map((v) => ({
      id: v.violation_id,
      studentErp: v.student_id,
      studentName: v.student_name,
      seatId: v.seat_id,
      date: formatDateYMD(v.violation_timestamp),
      calendarMonth: v.calendar_month,
      monthlyViolationNumber: v.monthly_violation_number,
      type: v.violation_reason,
      severity: v.penalty_status,
      finePkr: v.fine_pkr ?? 0,
      status: v.penalty_status === 'Resolved' || v.penalty_status === 'Waived' ? v.penalty_status : 'Open',
    })),
    ledger: mappedLedger,
    financialSummary,
    penaltyConfig: fineCfg,
    violationPolicy: {
      ...karachiMeta,
      currentFinePkr: fineCfg.noShowFinePkr,
      activeConfigId: fineCfg.configurationId,
      lastResetMonth: resetSettings?.last_violation_reset_month ?? karachiMeta.currentMonth,
    },
  });
});

apiRouter.post('/student/qr/validate', requireAuth, requireStudent, (req: AuthenticatedRequest, res: Response) => {
  const studentId = req.authUser!.studentId;
  const qrToken = extractQrTokenFromPayload(req.body?.qrPayload);

  if (!qrToken) {
    res.status(400).json({
      valid: false,
      code: 'INVALID_QR',
      error: 'Invalid QR code. Please scan the physical QR label attached to an ILS desk.',
    });
    return;
  }

  const fineCfg = getLatestFineConfig();
  const seatRow = getAllSeatsWithActiveWindow().find(
    (s) => s.qr_code_identifier.toLowerCase() === qrToken.toLowerCase()
  );

  if (!seatRow) {
    res.status(404).json({
      valid: false,
      code: 'INVALID_QR',
      error: 'Invalid QR code. This QR code is not registered to any IBA Digital Library ILS seat.',
    });
    return;
  }

  const mappedSeat = mapSeatForClient(seatRow, 'student', studentId, fineCfg.maxAwayMinutes);

  if (req.authUser!.accountStatus === 'Restricted') {
    res.status(403).json({
      valid: false,
      code: 'ACCOUNT_RESTRICTED',
      seat: mappedSeat,
      error: 'Your account is currently restricted due to unresolved library violations. Please visit the library desk.',
    });
    return;
  }

  if (seatRow.qr_active !== 1) {
    res.status(409).json({
      valid: false,
      code: 'QR_SUSPENDED',
      seat: mappedSeat,
      error: `The QR code for ${seatRow.seat_id} is currently deactivated. Please select another desk or notify library staff.`,
    });
    return;
  }

  const existingActive = db
    .prepare(
      `SELECT reservation_id, seat_id, reservation_status
       FROM reservations
       WHERE student_id = ? AND reservation_status IN ('Active', 'Temporarily Away')
       LIMIT 1`
    )
    .get(studentId) as { reservation_id: string; seat_id: string; reservation_status: string } | undefined;

  if (existingActive) {
    res.status(409).json({
      valid: false,
      code: 'STUDENT_HAS_ACTIVE_RESERVATION',
      seat: mappedSeat,
      activeSeatId: existingActive.seat_id,
      error: `You already hold an active reservation for ${existingActive.seat_id}. Only one active reservation is allowed per student.`,
    });
    return;
  }

  if (mappedSeat.status === 'maintenance') {
    res.status(409).json({
      valid: false,
      code: 'SEAT_MAINTENANCE',
      seat: mappedSeat,
      error: `${seatRow.seat_id} is currently under maintenance or offline and cannot be booked.`,
    });
    return;
  }

  if (mappedSeat.status === 'occupied') {
    res.status(409).json({
      valid: false,
      code: 'SEAT_OCCUPIED',
      seat: mappedSeat,
      error: 'This ILS is currently occupied and cannot be booked.',
    });
    return;
  }

  if (mappedSeat.status === 'away') {
    res.status(409).json({
      valid: false,
      code: 'SEAT_AWAY',
      seat: mappedSeat,
      error: 'This ILS is temporarily reserved. Please check again later.',
    });
    return;
  }

  res.json({
    valid: true,
    qrToken: seatRow.qr_code_identifier,
    seat: mappedSeat,
    maxDailyHours: fineCfg.maxDailyHours,
    confirmationPrompt: `You are about to reserve ${seatRow.seat_id}. Confirm your reservation?`,
  });
});

function handleQrVerifiedReservation(req: AuthenticatedRequest, res: Response): void {
  const studentId = req.authUser!.studentId;
  const qrToken = extractQrTokenFromPayload(req.body?.qrPayload ?? req.body?.qrToken);
  const fineCfg = getLatestFineConfig();
  const requestedHours = req.body?.durationHours !== undefined ? Number(req.body.durationHours) : 2;

  if (!qrToken) {
    res.status(400).json({
      error: 'A valid scanned desk QR code is required to reserve an ILS seat. Direct seat selection is not permitted.',
    });
    return;
  }

  if (!Number.isInteger(requestedHours) || requestedHours < 1 || requestedHours > fineCfg.maxDailyHours) {
    res.status(400).json({ error: `Duration must be between 1 and ${fineCfg.maxDailyHours} hours.` });
    return;
  }

  if (req.authUser!.accountStatus === 'Restricted') {
    res.status(403).json({
      error: 'Your account is currently restricted due to unresolved library violations. Please visit the library desk.',
    });
    return;
  }

  try {
    // Use BEGIN IMMEDIATE write-locked transaction + atomic conditional UPDATE + DB partial unique indexes
    // so simultaneous booking attempts on the same seat or student are serialized safely on the backend.
    const reserveTxn = db.transaction(() => {
      const seat = db
        .prepare(`SELECT * FROM ils_seats WHERE LOWER(qr_code_identifier) = LOWER(?) LIMIT 1`)
        .get(qrToken) as
        | {
            seat_id: string;
            current_status: string;
            qr_active: number;
            maintenance_status: string;
            sensor_connectivity: string;
            assigned_student_id: string | null;
            zone: string;
            sensor_id: string;
          }
        | undefined;

      if (!seat) {
        throw new Error('INVALID_QR');
      }
      if (seat.qr_active !== 1) {
        throw new Error(`QR_SUSPENDED:${seat.seat_id}`);
      }
      if (
        seat.current_status === 'maintenance' ||
        seat.maintenance_status === 'In Maintenance' ||
        seat.sensor_connectivity === 'Offline'
      ) {
        throw new Error(`SEAT_MAINTENANCE:${seat.seat_id}`);
      }
      if (seat.current_status === 'occupied') {
        throw new Error(`SEAT_OCCUPIED:${seat.seat_id}`);
      }
      if (seat.current_status === 'away') {
        throw new Error(`SEAT_AWAY:${seat.seat_id}`);
      }

      const existingStudentActive = db
        .prepare(
          `SELECT reservation_id, seat_id FROM reservations
           WHERE student_id = ? AND reservation_status IN ('Active', 'Temporarily Away')
           LIMIT 1`
        )
        .get(studentId) as { reservation_id: string; seat_id: string } | undefined;

      if (existingStudentActive) {
        throw new Error(`ALREADY_RESERVED:${existingStudentActive.seat_id}`);
      }

      const existingSeatActive = db
        .prepare(
          `SELECT reservation_id FROM reservations
           WHERE seat_id = ? AND reservation_status IN ('Active', 'Temporarily Away')
           LIMIT 1`
        )
        .get(seat.seat_id) as { reservation_id: string } | undefined;

      if (existingSeatActive) {
        throw new Error(`SEAT_OCCUPIED:${seat.seat_id}`);
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const expiry = new Date(now.getTime() + requestedHours * 60 * 60 * 1000);
      const uniqueSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      const resId = `RES-${uniqueSuffix}`;
      const evtId = `EVT-${Date.now()}-${uniqueSuffix}`;
      const ntfId = `NTF-${Date.now()}-${uniqueSuffix}`;

      const seatClaim = db
        .prepare(
          `UPDATE ils_seats
           SET current_status = 'occupied',
               assigned_student_id = ?,
               sensor_presence = 'PRESENT',
               sensor_connectivity = 'Online',
               last_sensor_event_at = ?
           WHERE seat_id = ?
             AND current_status = 'available'
             AND qr_active = 1
             AND assigned_student_id IS NULL`
        )
        .run(studentId, nowIso, seat.seat_id);

      if (seatClaim.changes !== 1) {
        throw new Error(`SEAT_CONFLICT:${seat.seat_id}`);
      }

      db.prepare(
        `INSERT INTO reservations (
          reservation_id, student_id, seat_id, start_timestamp,
          departure_timestamp, return_timestamp, expiry_timestamp, reservation_status
        ) VALUES (?, ?, ?, ?, NULL, NULL, ?, 'Active')`
      ).run(resId, studentId, seat.seat_id, nowIso, expiry.toISOString());

      db.prepare(
        `INSERT INTO sensor_events (
          event_id, seat_id, sensor_id, presence_status, signal_state, event_timestamp, event_source, is_simulated, event_note
        ) VALUES (?, ?, ?, 'Present', 'PRESENT', ?, 'Student Check-In', 1, ?)`
      ).run(
        evtId,
        seat.seat_id,
        seat.sensor_id,
        nowIso,
        'DEMO / SIMULATED: Normal occupancy established on QR check-in'
      );

      db.prepare(
        `INSERT INTO notifications (notification_id, student_id, title, message, category, created_timestamp, read_status)
         VALUES (?, ?, ?, ?, 'Reservation', ?, 0)`
      ).run(
        ntfId,
        studentId,
        `Reservation Confirmed — ${seat.seat_id}`,
        `You checked into ${seat.seat_id} (${seat.zone}) via QR scan for ${requestedHours} hour${requestedHours > 1 ? 's' : ''}.`,
        now.toISOString()
      );

      return {
        reservationId: resId,
        seatId: seat.seat_id,
        zone: seat.zone,
        startTimestamp: now.toISOString(),
        expiryTimestamp: expiry.toISOString(),
        expiry: formatTimeHHMM(expiry.toISOString()),
      };
    });

    const result = reserveTxn.immediate();
    broadcastSeatUpdate('student_qr_reservation', result.seatId);
    res.status(201).json({
      ok: true,
      message: `${result.seatId} reserved via QR check-in until ${result.expiry}.`,
      ...result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'INVALID_QR') {
      res.status(404).json({
        error: 'Invalid QR code. This QR code does not match any active IBA Digital Library ILS seat.',
      });
      return;
    }
    if (msg.startsWith('QR_SUSPENDED:')) {
      res.status(409).json({
        error: `The QR code for ${msg.split(':')[1]} is currently deactivated.`,
      });
      return;
    }
    if (msg.startsWith('ALREADY_RESERVED:')) {
      res.status(409).json({
        error: `You already hold an active reservation for ${msg.split(':')[1]}. Check out before booking another ILS.`,
      });
      return;
    }
    if (msg.startsWith('SEAT_MAINTENANCE:')) {
      res.status(409).json({
        error: `${msg.split(':')[1]} is under maintenance or offline and cannot be booked.`,
      });
      return;
    }
    if (msg.startsWith('SEAT_AWAY:')) {
      res.status(409).json({
        error: 'This ILS is temporarily reserved. Please check again later.',
      });
      return;
    }
    if (msg.startsWith('SEAT_OCCUPIED:') || msg.startsWith('SEAT_CONFLICT:') || msg.includes('UNIQUE constraint failed')) {
      res.status(409).json({
        error: 'This ILS is currently occupied or was just reserved by another student.',
      });
      return;
    }
    res.status(500).json({ error: 'Unable to complete QR reservation. Please try again.' });
  }
}

apiRouter.post('/student/qr/reserve', requireAuth, requireStudent, handleQrVerifiedReservation);

// Enforce QR-mandatory booking on legacy endpoint as well so direct seat-ID calls are rejected
apiRouter.post('/student/reservations', requireAuth, requireStudent, handleQrVerifiedReservation);

// Security guard: Students cannot manually change seat status or generate occupancy sensor events.
// Absence and return transitions are controlled exclusively by the smart desk sensor system.
apiRouter.patch(
  '/student/reservations/:reservationId/away',
  requireAuth,
  requireStudent,
  (_req: AuthenticatedRequest, res: Response) => {
    res.status(403).json({
      error:
        'Students cannot manually change seat status or generate occupancy sensor events. Absence and return states are managed exclusively by the desk occupancy sensor system.',
    });
  }
);

apiRouter.post(
  '/student/reservations/:reservationId/checkout',
  requireAuth,
  requireStudent,
  (req: AuthenticatedRequest, res: Response) => {
    const studentId = req.authUser!.studentId;
    const reservationId = Array.isArray(req.params.reservationId)
      ? req.params.reservationId[0]
      : req.params.reservationId;

    // Ensure any already-elapsed 20-minute absence deadlines expire before permitting checkout
    processAutomatedAbsences();

    const nowIso = new Date().toISOString();
    const uniqueSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();

    const checkoutTx = db.transaction(() => {
      const existing = db
        .prepare(
          `SELECT r.reservation_id, r.seat_id, r.reservation_status
           FROM reservations r
           WHERE r.reservation_id = ? AND r.student_id = ?
             AND r.reservation_status IN ('Active', 'Temporarily Away')`
        )
        .get(reservationId, studentId) as
        | { reservation_id: string; seat_id: string; reservation_status: string }
        | undefined;

      if (!existing) {
        return null;
      }

      const updateRes = db
        .prepare(
          `UPDATE reservations
           SET reservation_status = 'Completed',
               expiry_timestamp = ?,
               absence_warning_at = NULL,
               absence_deadline_at = NULL,
               absence_warning_sent_at = NULL
           WHERE reservation_id = ?
             AND student_id = ?
             AND reservation_status IN ('Active', 'Temporarily Away')`
        )
        .run(nowIso, existing.reservation_id, studentId);

      if (updateRes.changes !== 1) {
        return null;
      }

      db.prepare(
        `UPDATE ils_seats
         SET current_status = CASE WHEN maintenance_status = 'In Maintenance' THEN 'maintenance' ELSE 'available' END,
             assigned_student_id = NULL,
             sensor_presence = CASE WHEN sensor_connectivity = 'Offline' THEN 'OFFLINE' ELSE 'ABSENT' END
         WHERE seat_id = ?`
      ).run(existing.seat_id);

      db.prepare(
        `INSERT INTO notifications (notification_id, student_id, title, message, category, created_timestamp, read_status)
         VALUES (?, ?, ?, ?, 'Reservation', ?, 0)`
      ).run(
        `NTF-${Date.now()}-${uniqueSuffix}`,
        studentId,
        `Checked Out — ${existing.seat_id}`,
        `Your session at ${existing.seat_id} has completed and the desk is now available.`,
        nowIso
      );

      return existing.seat_id;
    });

    const releasedSeatId = checkoutTx.immediate();
    if (!releasedSeatId) {
      res.status(404).json({ error: 'Active reservation not found for your account.' });
      return;
    }

    broadcastSeatUpdate('student_checkout', releasedSeatId);
    res.json({ ok: true, seatId: releasedSeatId });
  }
);

apiRouter.patch(
  '/student/notifications/:notificationId/read',
  requireAuth,
  requireStudent,
  (req: AuthenticatedRequest, res: Response) => {
    db.prepare(
      `UPDATE notifications SET read_status = 1 WHERE notification_id = ? AND student_id = ?`
    ).run(req.params.notificationId, req.authUser!.studentId);
    res.json({ ok: true });
  }
);

apiRouter.post(
  '/student/notifications/read-all',
  requireAuth,
  requireStudent,
  (req: AuthenticatedRequest, res: Response) => {
    db.prepare(`UPDATE notifications SET read_status = 1 WHERE student_id = ?`).run(
      req.authUser!.studentId
    );
    res.json({ ok: true });
  }
);

apiRouter.patch('/student/profile', requireAuth, requireStudent, (req: AuthenticatedRequest, res: Response) => {
  const { phone, emailAlerts, graceReminders } = req.body ?? {};
  const cleanPhone = typeof phone === 'string' ? phone.trim().slice(0, 32) : '';
  const alertsVal = emailAlerts ? 1 : 0;
  const graceVal = graceReminders ? 1 : 0;

  db.prepare(
    `UPDATE students SET phone = ?, email_alerts = ?, grace_reminders = ? WHERE student_id = ?`
  ).run(cleanPhone, alertsVal, graceVal, req.authUser!.studentId);

  const updated = db
    .prepare(`SELECT * FROM students WHERE student_id = ?`)
    .get(req.authUser!.studentId) as StudentRow;

  res.json({ ok: true, student: mapStudentProfile(updated) });
});

// Read-only student financial ledger endpoint (students can never edit financial records or mark fines paid)
apiRouter.get('/student/ledger', requireAuth, requireStudent, (req: AuthenticatedRequest, res: Response) => {
  syncMonthlyViolationReset();
  const studentId = req.authUser!.studentId;
  const ledger = fetchEnrichedLedgerRows(studentId).map(mapLedgerEntry);
  res.json({
    studentErp: studentId,
    ledger,
    summary: computeFinancialSummary(ledger),
  });
});

/* =========================================================================
 * ADMINISTRATOR-SCOPED ROUTES (Strictly Admin Role Verified on Server)
 * ========================================================================= */

apiRouter.get('/admin/bootstrap', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  syncMonthlyViolationReset();
  const adminRow = db
    .prepare(`SELECT * FROM students WHERE student_id = ?`)
    .get(req.authUser!.studentId) as StudentRow;
  const fineCfg = getLatestFineConfig();

  const seats = getAllSeatsWithActiveWindow().map((s) =>
    mapSeatForClient(s, 'admin', undefined, fineCfg.maxAwayMinutes)
  );

  const studentRows = db
    .prepare(`SELECT * FROM students WHERE role = 'student' ORDER BY is_demo ASC, created_date DESC, student_id ASC`)
    .all() as StudentRow[];

  const resRows = db
    .prepare(
      `SELECT r.*, s.zone, u.full_name AS student_name
       FROM reservations r
       INNER JOIN ils_seats s ON s.seat_id = r.seat_id
       INNER JOIN students u ON u.student_id = r.student_id
       ORDER BY r.start_timestamp DESC`
    )
    .all() as Array<{
    reservation_id: string;
    student_id: string;
    seat_id: string;
    zone: string;
    student_name: string;
    start_timestamp: string;
    departure_timestamp: string | null;
    return_timestamp: string | null;
    expiry_timestamp: string;
    reservation_status: 'Active' | 'Temporarily Away' | 'Completed' | 'Cancelled' | 'Expired';
  }>;

  const sensorEventRows = db
    .prepare(
      `SELECT * FROM sensor_events ORDER BY event_timestamp DESC LIMIT 60`
    )
    .all() as Array<{
    event_id: string;
    seat_id: string;
    sensor_id: string;
    presence_status: string;
    signal_state?: SensorSignalState;
    event_timestamp: string;
    event_source: string;
    is_simulated?: number;
    event_note?: string | null;
  }>;

  const vioRows = db
    .prepare(
      `SELECT v.*, u.full_name AS student_name, rev.full_name AS reviewed_by_name,
         (SELECT COALESCE(ft.amount_pkr, 0) FROM financial_transactions ft WHERE ft.violation_id = v.violation_id LIMIT 1) AS fine_pkr
       FROM violations v
       INNER JOIN students u ON u.student_id = v.student_id
       LEFT JOIN students rev ON rev.student_id = v.reviewed_by_administrator
       ORDER BY v.violation_timestamp DESC`
    )
    .all() as Array<{
    violation_id: string;
    student_id: string;
    student_name: string;
    seat_id: string;
    violation_timestamp: string;
    calendar_month: string;
    monthly_violation_number: number;
    violation_reason: string;
    penalty_status: string;
    fine_pkr: number;
    review_note?: string | null;
    reviewed_by_administrator?: string | null;
    reviewed_by_name?: string | null;
    reviewed_at?: string | null;
  }>;

  const mappedLedger = fetchEnrichedLedgerRows().map(mapLedgerEntry);
  const financialAuditLogs = fetchFinancialAuditLogs(undefined, 200);
  const overviewMetrics = computeAdminOverviewMetrics(seats);
  const adminInterventions = fetchAdminInterventions(100);

  const settingsRow = db
    .prepare(`SELECT * FROM system_settings WHERE setting_id = 1`)
    .get() as {
    library_name: string;
    campus_location: string;
    operating_hours_open: string;
    operating_hours_close: string;
    total_ils_capacity: number;
    academic_term: string;
    qr_rotation_cycle: 'Daily' | 'Weekly' | 'Semester';
    allow_advance_booking: number;
    maintenance_banner_enabled: number;
    last_violation_reset_month: string | null;
  };

  const karachiMeta = getKarachiMonthResetMeta();

  res.json({
    admin: {
      staffId: adminRow.student_id,
      name: adminRow.full_name,
      email: adminRow.email,
      title: adminRow.program,
      department: adminRow.batch,
      campus: adminRow.campus,
      avatarUrl: '/src/assets/images/avatar_admin_iba_1795643330176.jpg',
      isDemo: adminRow.is_demo === 1,
    },
    seats,
    students: studentRows.map(mapStudentProfile),
    reservations: resRows.map((r) => {
      const startMs = new Date(r.start_timestamp).getTime();
      const endMs = new Date(r.expiry_timestamp).getTime();
      const durationMinutes = Number.isNaN(startMs) || Number.isNaN(endMs) ? 120 : Math.max(30, Math.round((endMs - startMs) / 60000));
      return {
        id: r.reservation_id,
        seatId: r.seat_id,
        zone: r.zone,
        studentErp: r.student_id,
        studentName: r.student_name,
        date: formatDateYMD(r.start_timestamp),
        startTime: formatTimeHHMM(r.start_timestamp) ?? '14:00',
        endTime: formatTimeHHMM(r.expiry_timestamp) ?? '16:00',
        startTimestamp: r.start_timestamp,
        departureTimestamp: r.departure_timestamp ?? undefined,
        returnTimestamp: r.return_timestamp ?? undefined,
        expiryTimestamp: r.expiry_timestamp,
        durationMinutes,
        status: r.reservation_status,
      };
    }),
    sensorEvents: sensorEventRows.map((e) => {
      const derivedSignal: SensorSignalState = isValidSensorSignalState(e.signal_state)
        ? e.signal_state
        : e.presence_status === 'Present'
          ? 'PRESENT'
          : e.presence_status === 'Unknown'
            ? 'OFFLINE'
            : 'ABSENT';
      return {
        id: e.event_id,
        seatId: e.seat_id,
        sensorId: e.sensor_id,
        presenceStatus: e.presence_status,
        signalState: derivedSignal,
        timestamp: `${formatDateYMD(e.event_timestamp)} ${formatTimeHHMM(e.event_timestamp) ?? ''}`.trim(),
        rawTimestamp: e.event_timestamp,
        source: e.event_source,
        isSimulated: e.is_simulated !== 0,
        note: e.event_note ?? undefined,
      };
    }),
    sensorSystem: {
      mode: 'DEMO / SIMULATED',
      hardwareConnected: isHardwareIoTConfigured(),
      debounceWindowMs: isDemoTimerEnabled() ? DEMO_TIMER_DEBOUNCE_WINDOW_MS : SENSOR_DEBOUNCE_WINDOW_MS,
      iotEndpoint: '/api/iot/sensors/events',
      demoTimerEnabled: isDemoTimerEnabled(),
    },
    violations: vioRows.map((v) => ({
      id: v.violation_id,
      studentErp: v.student_id,
      studentName: v.student_name,
      seatId: v.seat_id,
      date: formatDateYMD(v.violation_timestamp),
      calendarMonth: v.calendar_month,
      monthlyViolationNumber: v.monthly_violation_number,
      type: v.violation_reason,
      severity: v.penalty_status,
      finePkr: v.fine_pkr ?? 0,
      status: v.penalty_status === 'Resolved' || v.penalty_status === 'Waived' ? v.penalty_status : 'Open',
      reviewNote: v.review_note ?? undefined,
      reviewedByName: v.reviewed_by_name ?? v.reviewed_by_administrator ?? undefined,
      reviewedAt: v.reviewed_at ?? undefined,
    })),
    ledger: mappedLedger,
    financialSummary: computeFinancialSummary(mappedLedger),
    financialAuditLogs,
    overviewMetrics,
    adminInterventions,
    penaltyConfig: fineCfg,
    fineConfigHistory: getFineConfigHistory(),
    violationPolicy: {
      ...karachiMeta,
      currentFinePkr: fineCfg.noShowFinePkr,
      activeConfigId: fineCfg.configurationId,
      lastResetMonth: settingsRow.last_violation_reset_month ?? karachiMeta.currentMonth,
    },
    systemSettings: {
      libraryName: settingsRow.library_name,
      campusLocation: settingsRow.campus_location,
      operatingHoursOpen: settingsRow.operating_hours_open,
      operatingHoursClose: settingsRow.operating_hours_close,
      totalIlsCapacity: settingsRow.total_ils_capacity,
      academicTerm: settingsRow.academic_term,
      qrRotationCycle: settingsRow.qr_rotation_cycle,
      allowAdvanceBooking: settingsRow.allow_advance_booking === 1,
      maintenanceBannerEnabled: settingsRow.maintenance_banner_enabled === 1,
    },
  });
});

/* =========================================================================
 * PHASE 5 — SMART OCCUPANCY SENSOR SIMULATOR (ADMIN-ONLY) & FUTURE IOT API
 * ========================================================================= */

// Strictly Administrator-only simulator — students attempting to trigger sensor events receive 403 Forbidden
apiRouter.post(
  '/admin/sensors/:seatId/simulate',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const rawSeatId = Array.isArray(req.params.seatId) ? req.params.seatId[0] : req.params.seatId;
    const rawState = typeof req.body?.state === 'string' ? req.body.state.trim().toUpperCase() : '';

    if (!isValidSensorSignalState(rawState)) {
      res.status(400).json({
        ok: false,
        code: 'INVALID_STATE',
        error: 'Sensor simulation state must be PRESENT, ABSENT, or OFFLINE.',
      });
      return;
    }

    const result = processSensorSignal({
      seatId: rawSeatId,
      state: rawState,
      isSimulated: true,
      actorLabel: `Admin ${req.authUser!.studentId}`,
    });

    if (!result.ok) {
      res.status(result.httpStatus).json({
        ok: false,
        code: result.code,
        error: result.message,
        retryAfterMs: result.retryAfterMs,
        seatId: result.seatId,
        sensorId: result.sensorId,
        currentState: result.currentState,
      });
      return;
    }

    res.json({
      ...result,
      mode: 'DEMO / SIMULATED',
    });
  }
);

// Administrator-only toggle for Accelerated Demo Timer (1 real second = 1 simulated minute) vs Production (20 real minutes)
apiRouter.patch(
  '/admin/sensors/timer-mode',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const { demoTimerEnabled } = req.body ?? {};
    if (typeof demoTimerEnabled !== 'boolean') {
      res.status(400).json({ ok: false, error: 'demoTimerEnabled must be a boolean value.' });
      return;
    }

    const updated = setDemoTimerEnabled(demoTimerEnabled);
    res.json({
      ok: true,
      demoTimerEnabled: updated,
      mode: updated ? 'demo_accelerated' : 'production',
      message: updated
        ? 'Accelerated Demo Timer enabled: 1 real second = 1 simulated minute (5-minute warning at 15s, auto-expiry at 20s).'
        : 'Production Timer active: actual 20-minute absence period (5-minute warning at 15 minutes, auto-expiry at 20 minutes).',
    });
  }
);

// Future Physical IoT Hardware Sensor Ingestion Endpoint (secured by server-side IOT_SENSOR_API_KEY)
apiRouter.post('/iot/sensors/events', (req: Request, res: Response) => {
  if (!isHardwareIoTConfigured()) {
    res.status(503).json({
      ok: false,
      code: 'IOT_HARDWARE_NOT_CONNECTED',
      error:
        'Physical IoT occupancy sensors are not connected yet. Configure IOT_SENSOR_API_KEY on the server to enable hardware ingestion, or use the Administrator Sensor Simulator (DEMO / SIMULATED mode).',
    });
    return;
  }

  const headerKey = req.header('X-Sensor-API-Key');
  if (!verifyHardwareIoTKey(headerKey)) {
    res.status(401).json({
      ok: false,
      code: 'UNAUTHORIZED_SENSOR',
      error: 'Invalid or missing X-Sensor-API-Key header.',
    });
    return;
  }

  const rawSeatId = typeof req.body?.seatId === 'string' ? req.body.seatId : undefined;
  const rawSensorId = typeof req.body?.sensorId === 'string' ? req.body.sensorId : undefined;
  const rawState = typeof req.body?.state === 'string' ? req.body.state.trim().toUpperCase() : '';

  if (!isValidSensorSignalState(rawState)) {
    res.status(400).json({
      ok: false,
      code: 'INVALID_STATE',
      error: 'Sensor state must be PRESENT, ABSENT, or OFFLINE.',
    });
    return;
  }

  const result = processSensorSignal({
    seatId: rawSeatId,
    sensorId: rawSensorId,
    state: rawState,
    isSimulated: false,
    actorLabel: 'IoT Hardware API',
  });

  if (!result.ok) {
    res.status(result.httpStatus).json({
      ok: false,
      code: result.code,
      error: result.message,
      retryAfterMs: result.retryAfterMs,
    });
    return;
  }

  res.status(200).json({
    ...result,
    mode: 'HARDWARE_IOT',
  });
});

apiRouter.patch(
  '/admin/seats/:seatId/status',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const seatId = Array.isArray(req.params.seatId) ? req.params.seatId[0] : req.params.seatId;
    const { status, note, reason } = req.body ?? {};
    const validStatuses = ['available', 'occupied', 'away', 'maintenance'];

    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid seat status value.' });
      return;
    }

    const seat = db.prepare(`SELECT * FROM ils_seats WHERE seat_id = ?`).get(seatId) as
      | {
          seat_id: string;
          sensor_id: string;
          current_status: string;
          assigned_student_id: string | null;
        }
      | undefined;

    if (!seat) {
      res.status(404).json({ error: 'Seat not found.' });
      return;
    }

    const adminUser = db
      .prepare(`SELECT student_id, full_name FROM students WHERE student_id = ?`)
      .get(req.authUser!.studentId) as { student_id: string; full_name: string } | undefined;

    const nowIso = new Date().toISOString();
    const rawNote = typeof reason === 'string' && reason.trim() ? reason : note;
    const cleanNote = typeof rawNote === 'string' && rawNote.trim() ? rawNote.trim().slice(0, 240) : null;

    const interventionCategory =
      status === 'maintenance'
        ? 'SEAT_MAINTENANCE'
        : status === 'available' && seat.assigned_student_id
          ? 'SEAT_RELEASE'
          : 'SEAT_STATUS_OVERRIDE';

    const interventionReason =
      cleanNote ??
      (status === 'maintenance'
        ? `Marked ${seatId} under administrative maintenance.`
        : status === 'available' && seat.assigned_student_id
          ? `Manually released ${seatId} (previous occupant: ${seat.assigned_student_id}).`
          : `Administrative status override on ${seatId}: ${seat.current_status} -> ${status}.`);

    let interventionId = '';

    db.transaction(() => {
      if (status === 'available') {
        db.prepare(
          `UPDATE ils_seats
           SET current_status = 'available', assigned_student_id = NULL,
               maintenance_status = 'Operational', maintenance_note = NULL,
               qr_active = 1, sensor_connectivity = 'Online',
               sensor_presence = 'ABSENT', last_sensor_event_at = ?
           WHERE seat_id = ?`
        ).run(nowIso, seatId);
        db.prepare(
          `UPDATE reservations SET reservation_status = 'Cancelled'
           WHERE seat_id = ? AND reservation_status IN ('Active', 'Temporarily Away')`
        ).run(seatId);
        if (seat.assigned_student_id) {
          db.prepare(
            `INSERT INTO notifications (notification_id, student_id, title, message, category, created_timestamp, read_status)
             VALUES (?, ?, ?, ?, 'Reservation', ?, 0)`
          ).run(
            `NTF-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
            seat.assigned_student_id,
            `Seat Released by Library Desk — ${seatId}`,
            `An administrator has manually released ${seatId}. Reason: ${interventionReason}`,
            nowIso
          );
        }
      } else if (status === 'maintenance') {
        db.prepare(
          `UPDATE ils_seats
           SET current_status = 'maintenance', assigned_student_id = NULL,
               maintenance_status = 'In Maintenance', maintenance_note = ?,
               qr_active = 0, sensor_connectivity = 'Offline',
               sensor_presence = 'OFFLINE', last_sensor_event_at = ?
           WHERE seat_id = ?`
        ).run(cleanNote ?? 'Scheduled administrative inspection', nowIso, seatId);
        db.prepare(
          `UPDATE reservations SET reservation_status = 'Cancelled'
           WHERE seat_id = ? AND reservation_status IN ('Active', 'Temporarily Away')`
        ).run(seatId);
        if (seat.assigned_student_id) {
          db.prepare(
            `INSERT INTO notifications (notification_id, student_id, title, message, category, created_timestamp, read_status)
             VALUES (?, ?, ?, ?, 'System', ?, 0)`
          ).run(
            `NTF-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
            seat.assigned_student_id,
            `Seat Placed Under Maintenance — ${seatId}`,
            `Your reservation on ${seatId} was closed because the desk was marked under maintenance. Reason: ${interventionReason}`,
            nowIso
          );
        }
      } else if (status === 'away') {
        db.prepare(
          `UPDATE ils_seats
           SET current_status = 'away', maintenance_status = 'Operational',
               qr_active = 1, sensor_connectivity = 'Online',
               sensor_presence = 'ABSENT', last_sensor_event_at = ?
           WHERE seat_id = ?`
        ).run(nowIso, seatId);
      } else {
        db.prepare(
          `UPDATE ils_seats
           SET current_status = 'occupied', maintenance_status = 'Operational',
               maintenance_note = NULL, qr_active = 1, sensor_connectivity = 'Online',
               sensor_presence = 'PRESENT', last_sensor_event_at = ?
           WHERE seat_id = ?`
        ).run(nowIso, seatId);
      }

      const presence = status === 'occupied' ? 'Present' : status === 'maintenance' ? 'Unknown' : 'Absent';
      const signalState = status === 'occupied' ? 'PRESENT' : status === 'maintenance' ? 'OFFLINE' : 'ABSENT';
      db.prepare(
        `INSERT INTO sensor_events (
          event_id, seat_id, sensor_id, presence_status, signal_state, event_timestamp, event_source, is_simulated, event_note
        ) VALUES (?, ?, ?, ?, ?, ?, 'Admin Override', 1, ?)`
      ).run(
        `EVT-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        seatId,
        seat.sensor_id,
        presence,
        signalState,
        nowIso,
        `Admin override (${seat.current_status} -> ${status}): ${interventionReason}`
      );

      interventionId = recordAdminInterventionInTx({
        category: interventionCategory,
        targetId: seatId,
        seatId,
        studentId: seat.assigned_student_id,
        previousState: seat.current_status,
        newState: status,
        reason: interventionReason,
        performedById: req.authUser!.studentId,
        performedByName: adminUser?.full_name ?? req.authUser!.studentId,
        performedAt: nowIso,
      });
    })();

    broadcastSeatUpdate('admin_seat_override', seatId);
    res.json({ ok: true, interventionId });
  }
);

apiRouter.patch(
  '/admin/seats/:seatId/qr',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const { seatId } = req.params;
    const seat = db.prepare(`SELECT qr_active FROM ils_seats WHERE seat_id = ?`).get(seatId) as
      | { qr_active: number }
      | undefined;

    if (!seat) {
      res.status(404).json({ error: 'Seat not found.' });
      return;
    }

    const nextActive = seat.qr_active === 1 ? 0 : 1;
    db.prepare(`UPDATE ils_seats SET qr_active = ? WHERE seat_id = ?`).run(nextActive, seatId);
    broadcastSeatUpdate('admin_qr_toggle', seatId);
    res.json({ ok: true, qrActive: nextActive === 1 });
  }
);

apiRouter.post(
  '/admin/seats/:seatId/qr/regenerate',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const { seatId } = req.params;
    const seat = db.prepare(`SELECT seat_id FROM ils_seats WHERE seat_id = ?`).get(seatId) as
      | { seat_id: string }
      | undefined;

    if (!seat) {
      res.status(404).json({ error: 'Seat not found.' });
      return;
    }

    const nextToken = generateSecureSeatQrToken(seat.seat_id);
    db.prepare(`UPDATE ils_seats SET qr_code_identifier = ?, qr_active = 1 WHERE seat_id = ?`).run(
      nextToken,
      seat.seat_id
    );
    broadcastSeatUpdate('admin_qr_regenerated', seat.seat_id);
    res.json({ ok: true, seatId: seat.seat_id, qrCodeToken: nextToken });
  }
);

apiRouter.post(
  '/admin/reservations/:reservationId/release',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const reservationId = Array.isArray(req.params.reservationId)
      ? req.params.reservationId[0]
      : req.params.reservationId;
    const rawReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const target = db
      .prepare(
        `SELECT r.*, s.sensor_id FROM reservations r
         INNER JOIN ils_seats s ON s.seat_id = r.seat_id
         WHERE r.reservation_id = ?`
      )
      .get(reservationId) as
      | {
          reservation_id: string;
          seat_id: string;
          student_id: string;
          sensor_id: string;
          reservation_status: string;
        }
      | undefined;

    if (!target) {
      res.status(404).json({ error: 'Reservation not found.' });
      return;
    }

    const adminUser = db
      .prepare(`SELECT student_id, full_name FROM students WHERE student_id = ?`)
      .get(req.authUser!.studentId) as { student_id: string; full_name: string } | undefined;

    const nowIso = new Date().toISOString();
    const releaseReason =
      rawReason.slice(0, 240) ||
      `Manual reservation release by library administrator for ${target.seat_id}.`;
    let interventionId = '';

    db.transaction(() => {
      db.prepare(`UPDATE reservations SET reservation_status = 'Cancelled' WHERE reservation_id = ?`).run(
        reservationId
      );
      db.prepare(
        `UPDATE ils_seats
         SET current_status = 'available',
             assigned_student_id = NULL,
             sensor_presence = CASE WHEN sensor_connectivity = 'Offline' THEN 'OFFLINE' ELSE 'ABSENT' END,
             last_sensor_event_at = ?
         WHERE seat_id = ?`
      ).run(nowIso, target.seat_id);
      db.prepare(
        `INSERT INTO sensor_events (
          event_id, seat_id, sensor_id, presence_status, signal_state, event_timestamp, event_source, is_simulated, event_note
        ) VALUES (?, ?, ?, 'Absent', 'ABSENT', ?, 'Admin Override', 1, ?)`
      ).run(
        `EVT-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        target.seat_id,
        target.sensor_id,
        nowIso,
        `Admin released reservation ${reservationId}: ${releaseReason}`
      );
      db.prepare(
        `INSERT INTO notifications (notification_id, student_id, title, message, category, created_timestamp, read_status)
         VALUES (?, ?, ?, ?, 'Reservation', ?, 0)`
      ).run(
        `NTF-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        target.student_id,
        `Seat Released by Library Desk — ${target.seat_id}`,
        `An administrator has released reservation ${reservationId} for ${target.seat_id}. Reason: ${releaseReason}`,
        nowIso
      );

      interventionId = recordAdminInterventionInTx({
        category: 'SEAT_RELEASE',
        targetId: reservationId,
        seatId: target.seat_id,
        studentId: target.student_id,
        previousState: target.reservation_status,
        newState: 'Cancelled (Seat Released)',
        reason: releaseReason,
        performedById: req.authUser!.studentId,
        performedByName: adminUser?.full_name ?? req.authUser!.studentId,
        performedAt: nowIso,
      });
    })();

    broadcastSeatUpdate('admin_reservation_release', target.seat_id);
    res.json({ ok: true, interventionId });
  }
);

apiRouter.patch(
  '/admin/violations/:violationId',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const violationId = Array.isArray(req.params.violationId)
      ? req.params.violationId[0]
      : req.params.violationId;
    const { resolution, reason } = req.body ?? {};
    const allowedResolutions = ['Resolved', 'Waived', 'Warning', 'Fine Issued'] as const;
    if (!allowedResolutions.includes(resolution)) {
      res.status(400).json({
        error: 'Resolution must be Resolved, Waived, Warning, or Fine Issued.',
      });
      return;
    }

    const cleanReason = typeof reason === 'string' ? reason.trim() : '';
    if (cleanReason.length < 5) {
      res.status(400).json({
        error: 'A documented administrative reason (at least 5 characters) is required for violation reviews and corrections.',
      });
      return;
    }
    if (cleanReason.length > 400) {
      res.status(400).json({ error: 'Documented reason must be 400 characters or fewer.' });
      return;
    }

    const vio = db
      .prepare(`SELECT * FROM violations WHERE violation_id = ?`)
      .get(violationId) as
      | {
          violation_id: string;
          student_id: string;
          seat_id: string;
          penalty_status: string;
        }
      | undefined;

    if (!vio) {
      res.status(404).json({ error: 'Violation not found.' });
      return;
    }

    const adminUser = db
      .prepare(`SELECT student_id, full_name FROM students WHERE student_id = ?`)
      .get(req.authUser!.studentId) as { student_id: string; full_name: string } | undefined;

    const nowIso = new Date().toISOString();
    const targetTxnStatus: CanonicalPaymentStatus =
      resolution === 'Waived' || resolution === 'Warning'
        ? 'WAIVED'
        : resolution === 'Resolved'
          ? 'PAID'
          : 'UNPAID';

    let interventionId = '';

    db.transaction(() => {
      db.prepare(
        `UPDATE violations
         SET penalty_status = ?,
             review_note = ?,
             reviewed_by_administrator = ?,
             reviewed_at = ?
         WHERE violation_id = ?`
      ).run(resolution, cleanReason, req.authUser!.studentId, nowIso, violationId);

      const linkedTxn = db
        .prepare(
          `SELECT transaction_id, student_id, amount_pkr, payment_status, payment_reference
           FROM financial_transactions
           WHERE violation_id = ?
           LIMIT 1`
        )
        .get(violationId) as
        | {
            transaction_id: string;
            student_id: string;
            amount_pkr: number;
            payment_status: string;
            payment_reference: string;
          }
        | undefined;

      if (linkedTxn) {
        const prevStatus = normalizePaymentStatus(linkedTxn.payment_status);
        const auditAction: FinancialAuditRow['action_type'] =
          targetTxnStatus === 'WAIVED'
            ? 'FINE_WAIVED'
            : targetTxnStatus === 'PAID'
              ? 'PAYMENT_VERIFIED'
              : 'REOPENED_UNPAID';

        db.prepare(
          `UPDATE financial_transactions
           SET payment_status = ?,
               payment_method = ?,
               verified_by_administrator = CASE WHEN ? IN ('PAID', 'WAIVED') THEN ? ELSE NULL END,
               verified_at = CASE WHEN ? IN ('PAID', 'WAIVED') THEN ? ELSE NULL END,
               waiver_reason = CASE WHEN ? = 'WAIVED' THEN ? ELSE waiver_reason END,
               admin_notes = ?,
               updated_at = ?
           WHERE transaction_id = ?`
        ).run(
          targetTxnStatus,
          targetTxnStatus === 'WAIVED'
            ? 'Waiver Adjustment'
            : targetTxnStatus === 'PAID'
              ? 'Library Desk Verification'
              : null,
          targetTxnStatus,
          req.authUser!.studentId,
          targetTxnStatus,
          nowIso,
          targetTxnStatus,
          cleanReason,
          cleanReason,
          nowIso,
          linkedTxn.transaction_id
        );

        const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
        db.prepare(
          `INSERT INTO financial_audit_logs (
            audit_id, transaction_id, student_id, action_type, previous_status, new_status,
            amount_pkr, payment_reference, payment_method, reason, performed_by_id, performed_by_name, performed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          `AUD-${Date.now()}-${suffix}`,
          linkedTxn.transaction_id,
          linkedTxn.student_id,
          auditAction,
          prevStatus,
          targetTxnStatus,
          linkedTxn.amount_pkr,
          linkedTxn.payment_reference,
          targetTxnStatus === 'WAIVED'
            ? 'Waiver Adjustment'
            : targetTxnStatus === 'PAID'
              ? 'Library Desk Verification'
              : null,
          cleanReason,
          req.authUser!.studentId,
          adminUser?.full_name ?? req.authUser!.studentId,
          nowIso
        );
      }

      interventionId = recordAdminInterventionInTx({
        category: 'VIOLATION_CORRECTION',
        targetId: violationId,
        seatId: vio.seat_id,
        studentId: vio.student_id,
        previousState: vio.penalty_status,
        newState: resolution,
        reason: cleanReason,
        performedById: req.authUser!.studentId,
        performedByName: adminUser?.full_name ?? req.authUser!.studentId,
        performedAt: nowIso,
      });
    })();

    broadcastSeatUpdate('admin_violation_resolved');
    res.json({ ok: true, interventionId });
  }
);

apiRouter.patch(
  '/admin/students/:studentId/status',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const studentId = Array.isArray(req.params.studentId)
      ? req.params.studentId[0]
      : req.params.studentId;
    const { status, reason } = req.body ?? {};
    const validStatuses = ['Active', 'Warning Issued', 'Restricted'];

    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Account status must be Active, Warning Issued, or Restricted.' });
      return;
    }

    const cleanReason = typeof reason === 'string' ? reason.trim() : '';
    if (cleanReason.length < 5) {
      res.status(400).json({
        error: 'A documented administrative reason (at least 5 characters) is required to change student account status.',
      });
      return;
    }

    const student = db
      .prepare(`SELECT student_id, full_name, account_status FROM students WHERE student_id = ? AND role = 'student'`)
      .get(studentId) as { student_id: string; full_name: string; account_status: string } | undefined;

    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    const adminUser = db
      .prepare(`SELECT student_id, full_name FROM students WHERE student_id = ?`)
      .get(req.authUser!.studentId) as { student_id: string; full_name: string } | undefined;

    const nowIso = new Date().toISOString();
    let interventionId = '';

    db.transaction(() => {
      db.prepare(`UPDATE students SET account_status = ? WHERE student_id = ?`).run(status, studentId);
      interventionId = recordAdminInterventionInTx({
        category: 'STUDENT_STATUS_CHANGE',
        targetId: studentId,
        studentId,
        previousState: student.account_status,
        newState: status,
        reason: cleanReason.slice(0, 400),
        performedById: req.authUser!.studentId,
        performedByName: adminUser?.full_name ?? req.authUser!.studentId,
        performedAt: nowIso,
      });
      db.prepare(
        `INSERT INTO notifications (notification_id, student_id, title, message, category, created_timestamp, read_status)
         VALUES (?, ?, ?, ?, 'Policy', ?, 0)`
      ).run(
        `NTF-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        studentId,
        `Account Standing Updated — ${status}`,
        `Your IBA Digital Library account standing has been updated to "${status}". Administrative note: ${cleanReason}`,
        nowIso
      );
    })();

    broadcastSeatUpdate('admin_student_status_updated');
    res.json({ ok: true, interventionId, accountStatus: status });
  }
);

apiRouter.get(
  '/admin/financial/students/:studentId',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    syncMonthlyViolationReset();
    const studentId = Array.isArray(req.params.studentId)
      ? req.params.studentId[0]
      : req.params.studentId;
    const studentRow = db
      .prepare(`SELECT * FROM students WHERE student_id = ? AND role = 'student'`)
      .get(studentId) as StudentRow | undefined;

    if (!studentRow) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    const ledger = fetchEnrichedLedgerRows(studentId).map(mapLedgerEntry);
    const auditLogs = fetchFinancialAuditLogs(studentId, 100);

    res.json({
      student: mapStudentProfile(studentRow),
      summary: computeFinancialSummary(ledger),
      ledger,
      auditLogs,
    });
  }
);

apiRouter.get(
  '/admin/financial/export',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    syncMonthlyViolationReset();
    const rawStudentId = typeof req.query.studentId === 'string' ? req.query.studentId.trim() : '';
    const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : '';
    const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    let entries = fetchEnrichedLedgerRows(rawStudentId || undefined).map(mapLedgerEntry);
    if (['UNPAID', 'PENDING', 'PAID', 'WAIVED'].includes(rawStatus)) {
      entries = entries.filter((e) => e.status === rawStatus);
    }
    if (rawSearch) {
      entries = entries.filter(
        (e) =>
          e.id.toLowerCase().includes(rawSearch) ||
          e.studentErp.toLowerCase().includes(rawSearch) ||
          e.studentName.toLowerCase().includes(rawSearch) ||
          (e.seatId ?? '').toLowerCase().includes(rawSearch) ||
          (e.violationId ?? '').toLowerCase().includes(rawSearch) ||
          e.referenceId.toLowerCase().includes(rawSearch) ||
          e.description.toLowerCase().includes(rawSearch)
      );
    }

    const headers = [
      'Transaction ID',
      'Date',
      'Student ID',
      'Student Name',
      'Description',
      'Related ILS Number',
      'Related Violation ID',
      'Fine Config ID',
      'Fine Amount (PKR)',
      'Payment Status',
      'Payment Reference',
      'Payment Method',
      'Verified By',
      'Verified At',
      'Waiver Reason / Admin Notes',
    ];

    const lines = [
      headers.map(sanitizeCsvCell).join(','),
      ...entries.map((e) =>
        [
          e.id,
          e.date,
          e.studentErp,
          e.studentName,
          e.description,
          e.seatId ?? '—',
          e.violationId ?? '—',
          e.fineConfigurationId ?? '—',
          e.amountPkr,
          e.status,
          e.referenceId,
          e.paymentMethod ?? '—',
          e.verifiedByName ?? '—',
          e.verifiedAt ?? '—',
          e.waiverReason ?? e.adminNotes ?? '',
        ]
          .map(sanitizeCsvCell)
          .join(',')
      ),
    ];

    const dateTag = getKarachiDateString();
    const filenameScope = rawStudentId ? `-${rawStudentId.replace(/[^A-Za-z0-9_-]/g, '')}` : '';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="iba-ils-financial-report${filenameScope}-${dateTag}.csv"`
    );
    res.send(lines.join('\r\n'));
  }
);

apiRouter.patch(
  '/admin/transactions/:transactionId',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const transactionId = Array.isArray(req.params.transactionId)
      ? req.params.transactionId[0]
      : req.params.transactionId;

    const rawStatus = typeof req.body?.status === 'string' ? req.body.status.trim().toUpperCase() : '';
    if (!['UNPAID', 'PENDING', 'PAID', 'WAIVED'].includes(rawStatus)) {
      res.status(400).json({ error: 'Transaction status must be UNPAID, PENDING, PAID, or WAIVED.' });
      return;
    }
    const targetStatus = rawStatus as CanonicalPaymentStatus;

    const rawReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const rawRef = typeof req.body?.paymentReference === 'string' ? req.body.paymentReference.trim() : '';
    const rawMethod = typeof req.body?.paymentMethod === 'string' ? req.body.paymentMethod.trim() : '';

    if (targetStatus === 'WAIVED' && rawReason.length < 5) {
      res.status(400).json({
        error: 'A documented waiver reason (at least 5 characters) is required to waive a fine.',
      });
      return;
    }

    if (rawReason.length > 400) {
      res.status(400).json({ error: 'Reason or notes must be 400 characters or fewer.' });
      return;
    }

    if (rawRef.length > 80) {
      res.status(400).json({ error: 'Payment reference must be 80 characters or fewer.' });
      return;
    }

    const allowedMethods = [
      'Bursar Cash Counter',
      'Bank Challan / Deposit',
      'Kuickpay / Online Transfer',
      'Library Desk Verification',
      'Waiver Adjustment',
    ];
    const cleanMethod =
      rawMethod && allowedMethods.includes(rawMethod)
        ? rawMethod
        : targetStatus === 'WAIVED'
          ? 'Waiver Adjustment'
          : targetStatus === 'PAID'
            ? 'Bursar Cash Counter'
            : targetStatus === 'PENDING'
              ? 'Bank Challan / Deposit'
              : null;

    const txn = db
      .prepare(
        `SELECT transaction_id, student_id, violation_id, seat_id, amount_pkr, payment_status, payment_reference
         FROM financial_transactions
         WHERE transaction_id = ?`
      )
      .get(transactionId) as
      | {
          transaction_id: string;
          student_id: string;
          violation_id: string | null;
          seat_id: string | null;
          amount_pkr: number;
          payment_status: string;
          payment_reference: string;
        }
      | undefined;

    if (!txn) {
      res.status(404).json({ error: 'Financial transaction not found.' });
      return;
    }

    const adminUser = db
      .prepare(`SELECT student_id, full_name FROM students WHERE student_id = ?`)
      .get(req.authUser!.studentId) as { student_id: string; full_name: string } | undefined;

    const previousStatus = normalizePaymentStatus(txn.payment_status);
    const nextReference = rawRef || txn.payment_reference;
    const nowIso = new Date().toISOString();

    const auditAction: FinancialAuditRow['action_type'] =
      targetStatus === 'PAID'
        ? 'PAYMENT_VERIFIED'
        : targetStatus === 'PENDING'
          ? 'MARKED_PENDING'
          : targetStatus === 'WAIVED'
            ? 'FINE_WAIVED'
            : 'REOPENED_UNPAID';

    const auditReason =
      rawReason ||
      (targetStatus === 'PAID'
        ? `Manual payment verified via ${cleanMethod ?? 'Campus Bursar'} (Ref: ${nextReference}).`
        : targetStatus === 'PENDING'
          ? `Payment receipt submitted and marked PENDING verification (Ref: ${nextReference}).`
          : targetStatus === 'UNPAID'
            ? 'Transaction returned to UNPAID status pending valid payment verification.'
            : rawReason);

    const updateTx = db.transaction(() => {
      // Strictly never modify amount_pkr or fine_configuration_id (historical fine immutability)
      db.prepare(
        `UPDATE financial_transactions
         SET payment_status = ?,
             payment_reference = ?,
             payment_method = ?,
             verified_by_administrator = CASE WHEN ? IN ('PAID', 'WAIVED') THEN ? ELSE NULL END,
             verified_at = CASE WHEN ? IN ('PAID', 'WAIVED') THEN ? ELSE NULL END,
             waiver_reason = CASE WHEN ? = 'WAIVED' THEN ? ELSE waiver_reason END,
             admin_notes = ?,
             updated_at = ?
         WHERE transaction_id = ?`
      ).run(
        targetStatus,
        nextReference,
        cleanMethod,
        targetStatus,
        req.authUser!.studentId,
        targetStatus,
        nowIso,
        targetStatus,
        auditReason,
        auditReason,
        nowIso,
        transactionId
      );

      if (txn.violation_id) {
        const nextVioStatus =
          targetStatus === 'WAIVED'
            ? 'Waived'
            : targetStatus === 'PAID'
              ? 'Resolved'
              : 'Fine Issued';
        db.prepare(`UPDATE violations SET penalty_status = ? WHERE violation_id = ?`).run(
          nextVioStatus,
          txn.violation_id
        );
      }

      const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      db.prepare(
        `INSERT INTO financial_audit_logs (
          audit_id, transaction_id, student_id, action_type, previous_status, new_status,
          amount_pkr, payment_reference, payment_method, reason, performed_by_id, performed_by_name, performed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        `AUD-${Date.now()}-${suffix}`,
        transactionId,
        txn.student_id,
        auditAction,
        previousStatus,
        targetStatus,
        txn.amount_pkr,
        nextReference,
        cleanMethod,
        auditReason,
        req.authUser!.studentId,
        adminUser?.full_name ?? req.authUser!.studentId,
        nowIso
      );

      // Notify student of verified payment / pending status / official waiver
      let notifTitle = `Financial Ledger Updated — ${transactionId}`;
      let notifMessage = `Transaction ${transactionId} (PKR ${txn.amount_pkr.toLocaleString()}) status was updated to ${targetStatus}.`;
      if (targetStatus === 'PAID') {
        notifTitle = `Payment Verified — ${transactionId} (PKR ${txn.amount_pkr.toLocaleString()})`;
        notifMessage = `Your payment of PKR ${txn.amount_pkr.toLocaleString()} for ${transactionId} (Ref: ${nextReference}) has been verified by the Library Administration. Your financial ledger has been updated.`;
      } else if (targetStatus === 'PENDING') {
        notifTitle = `Payment Awaiting Verification — ${transactionId}`;
        notifMessage = `Your payment submission for ${transactionId} (PKR ${txn.amount_pkr.toLocaleString()}, Ref: ${nextReference}) is currently marked PENDING while awaiting Bursar verification.`;
      } else if (targetStatus === 'WAIVED') {
        notifTitle = `Fine Officially Waived — ${transactionId}`;
        notifMessage = `Your fine of PKR ${txn.amount_pkr.toLocaleString()} (${transactionId}) has been officially waived by the Library Administration. Reason: ${auditReason}`;
      }

      db.prepare(
        `INSERT INTO notifications (
          notification_id, student_id, title, message, category, created_timestamp, read_status
        ) VALUES (?, ?, ?, ?, 'Policy', ?, 0)`
      ).run(`NTF-${Date.now()}-${suffix}`, txn.student_id, notifTitle, notifMessage, nowIso);
    });

    updateTx.immediate();
    broadcastSeatUpdate('admin_transaction_updated');

    const updatedRows = fetchEnrichedLedgerRows(txn.student_id).map(mapLedgerEntry);
    const updatedTxn = updatedRows.find((r) => r.id === transactionId);

    res.json({
      ok: true,
      transaction: updatedTxn,
      transactionId,
      status: targetStatus,
      studentSummary: computeFinancialSummary(updatedRows),
    });
  }
);

apiRouter.put(
  '/admin/fine-config',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const current = getLatestFineConfig();
    const body = req.body ?? {};

    const fineAmt = Number(body.noShowFinePkr ?? body.fineAmountPkr ?? current.noShowFinePkr);
    const overstayAmt = Number(body.overstayFinePerHourPkr ?? current.overstayFinePerHourPkr);
    const graceMin = Number(body.gracePeriodMinutes ?? current.gracePeriodMinutes);
    const awayMin = Number(body.maxAwayMinutes ?? current.maxAwayMinutes);
    const warningAfterMin = Number(
      body.warningAfterMinutes ?? Math.max(1, Math.min(current.warningAfterMinutes, awayMin - 1))
    );
    const monthlyResetEnabled =
      typeof body.monthlyResetEnabled === 'boolean'
        ? body.monthlyResetEnabled
        : current.monthlyResetEnabled;
    const firstViolationWarningOnly =
      typeof body.firstViolationWarningOnly === 'boolean'
        ? body.firstViolationWarningOnly
        : current.firstViolationWarningOnly;
    const dailyHrs = Number(body.maxDailyHours ?? current.maxDailyHours);
    const warnMax = Number(body.warningsBeforeRestriction ?? current.warningsBeforeRestriction);

    if (
      !Number.isFinite(fineAmt) || fineAmt < 0 || fineAmt > 1_000_000 ||
      !Number.isFinite(overstayAmt) || overstayAmt < 0 || overstayAmt > 1_000_000 ||
      !Number.isFinite(graceMin) || graceMin < 1 || graceMin > 120 ||
      !Number.isFinite(awayMin) || awayMin < 6 || awayMin > 180 ||
      !Number.isFinite(warningAfterMin) || warningAfterMin < 1 || warningAfterMin >= awayMin ||
      !Number.isFinite(dailyHrs) || dailyHrs < 1 || dailyHrs > 16 ||
      !Number.isFinite(warnMax) || warnMax < 1 || warnMax > 20
    ) {
      res.status(400).json({
        error:
          'Invalid numeric values in penalty configuration. Warning timing must be at least 1 minute and strictly less than the absence grace period.',
      });
      return;
    }

    const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    const configId = `CFG-${Date.now().toString().slice(-6)}-${suffix}`;
    const effectiveDate = getKarachiDateString();

    // Always append a new immutable configuration record — never alter historical financial_transactions
    db.prepare(
      `INSERT INTO fine_configurations (
        configuration_id, fine_amount_pkr, overstay_fine_per_hour_pkr,
        grace_period_minutes, max_away_minutes, warning_after_minutes,
        monthly_reset_enabled, first_violation_warning_only,
        max_daily_hours, warnings_before_restriction, effective_date, updated_by_administrator
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      configId,
      Math.round(fineAmt),
      Math.round(overstayAmt),
      Math.round(graceMin),
      Math.round(awayMin),
      Math.round(warningAfterMin),
      monthlyResetEnabled ? 1 : 0,
      firstViolationWarningOnly ? 1 : 0,
      Math.round(dailyHrs),
      Math.round(warnMax),
      effectiveDate,
      req.authUser!.studentId
    );

    broadcastSeatUpdate('admin_fine_config_update');
    res.json({
      ok: true,
      penaltyConfig: getLatestFineConfig(),
      fineConfigHistory: getFineConfigHistory(),
    });
  }
);

apiRouter.get(
  '/admin/reports',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    syncMonthlyViolationReset();
    const rawMonth = typeof req.query.month === 'string' ? req.query.month.trim() : '';
    const reports = buildAdminReportsData(rawMonth && rawMonth !== 'ALL' ? rawMonth : undefined);
    res.json(reports);
  }
);

apiRouter.get(
  '/admin/reports/export',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    syncMonthlyViolationReset();
    const rawType = typeof req.query.type === 'string' ? req.query.type.trim() : '';
    const allowedTypes: AdminReportType[] = [
      'daily-utilization',
      'monthly-utilization',
      'student-reservations',
      'monthly-violations',
      'monthly-fines',
      'outstanding-balances',
    ];
    if (!allowedTypes.includes(rawType as AdminReportType)) {
      res.status(400).json({ error: 'Invalid report type requested.' });
      return;
    }

    const rawMonth = typeof req.query.month === 'string' ? req.query.month.trim() : '';
    const { filename, csv } = exportAdminReportCsv(
      rawType as AdminReportType,
      rawMonth && rawMonth !== 'ALL' ? rawMonth : undefined
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
);

apiRouter.put(
  '/admin/settings',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const {
      libraryName,
      campusLocation,
      operatingHoursOpen,
      operatingHoursClose,
      academicTerm,
      qrRotationCycle,
      allowAdvanceBooking,
    } = req.body ?? {};

    const validCycles = ['Daily', 'Weekly', 'Semester'];
    if (!validCycles.includes(qrRotationCycle)) {
      res.status(400).json({ error: 'Invalid QR rotation cycle.' });
      return;
    }

    db.prepare(
      `UPDATE system_settings
       SET library_name = ?, campus_location = ?, operating_hours_open = ?,
           operating_hours_close = ?, academic_term = ?, qr_rotation_cycle = ?,
           allow_advance_booking = ?
       WHERE setting_id = 1`
    ).run(
      String(libraryName || '').trim().slice(0, 120),
      String(campusLocation || '').trim().slice(0, 120),
      String(operatingHoursOpen || '08:30').trim().slice(0, 10),
      String(operatingHoursClose || '21:30').trim().slice(0, 10),
      String(academicTerm || 'Fall 2026').trim().slice(0, 40),
      qrRotationCycle,
      allowAdvanceBooking ? 1 : 0
    );

    res.json({ ok: true });
  }
);
