import crypto from 'node:crypto';
import { db } from './db.ts';

export const KARACHI_TIMEZONE = 'Asia/Karachi';

export const FIRST_VIOLATION_WARNING_MESSAGE =
  'First Warning: You failed to return to your reserved ILS within the permitted 20-minute absence period. Your seat has been released. Please follow library seat management rules to avoid financial penalties.';

/**
 * Returns the calendar month in Asia/Karachi timezone (YYYY-MM).
 */
export function getKarachiCalendarMonth(referenceDate: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KARACHI_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(referenceDate);

  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  return `${year}-${month}`;
}

/**
 * Returns the calendar date in Asia/Karachi timezone (YYYY-MM-DD).
 */
export function getKarachiDateString(referenceDate: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KARACHI_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(referenceDate);

  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

/**
 * Computes the next 1st-of-month reset label in Asia/Karachi timezone.
 */
export function getKarachiMonthResetMeta(referenceDate: Date = new Date()): {
  timezone: string;
  currentMonth: string;
  nextResetDate: string;
} {
  const currentMonth = getKarachiCalendarMonth(referenceDate);
  const [yStr, mStr] = currentMonth.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthStr = String(nextMonth).padStart(2, '0');

  return {
    timezone: KARACHI_TIMEZONE,
    currentMonth,
    nextResetDate: `${nextYear}-${nextMonthStr}-01 00:00 PKT`,
  };
}

export interface ActiveFineConfigurationRow {
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
}

/**
 * Reads the currently active administrator-configured fine settings from fine_configurations.
 * Never overrides configured fines with a hardcoded value.
 */
export function getActiveFineConfigurationRow(): ActiveFineConfigurationRow {
  const row = db
    .prepare(
      `SELECT
         configuration_id,
         fine_amount_pkr,
         overstay_fine_per_hour_pkr,
         grace_period_minutes,
         max_away_minutes,
         COALESCE(warning_after_minutes, 15) AS warning_after_minutes,
         COALESCE(monthly_reset_enabled, 1) AS monthly_reset_enabled,
         COALESCE(first_violation_warning_only, 1) AS first_violation_warning_only,
         max_daily_hours,
         warnings_before_restriction,
         effective_date,
         updated_by_administrator
       FROM fine_configurations
       ORDER BY rowid DESC
       LIMIT 1`
    )
    .get() as ActiveFineConfigurationRow | undefined;

  if (!row) {
    throw new Error('FINE_CONFIGURATION_MISSING');
  }
  return row;
}

export interface MonthlyResetSummary {
  karachiMonth: string;
  studentsResetCount: number;
}

/**
 * Automatically resets monthly violation counters when the Asia/Karachi calendar month
 * advances to a new month (on the 1st day of every calendar month at 00:00 PKT).
 *
 * Guarantees:
 * - Resets monthly_violation_count to 0 and updates current_violation_month to the new Karachi month.
 * - Restores 'Warning Issued' standing back to 'Active' for the fresh monthly cycle.
 * - NEVER deletes historical rows in violations.
 * - NEVER deletes or modifies UNPAID fines in financial_transactions.
 * - NEVER deletes payment history (Paid / Waived) in financial_transactions.
 */
export function syncMonthlyViolationReset(referenceDate: Date = new Date()): MonthlyResetSummary {
  const karachiMonth = getKarachiCalendarMonth(referenceDate);

  // Respect administrator-configured monthly reset policy (enabled by default)
  const cfgRow = db
    .prepare(
      `SELECT COALESCE(monthly_reset_enabled, 1) AS monthly_reset_enabled
       FROM fine_configurations
       ORDER BY rowid DESC
       LIMIT 1`
    )
    .get() as { monthly_reset_enabled: number } | undefined;

  if (cfgRow && cfgRow.monthly_reset_enabled === 0) {
    return { karachiMonth, studentsResetCount: 0 };
  }

  const resetTx = db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE students
         SET monthly_violation_count = 0,
             current_violation_month = ?,
             account_status = CASE
               WHEN account_status = 'Warning Issued' THEN 'Active'
               ELSE account_status
             END
         WHERE current_violation_month != ?`
      )
      .run(karachiMonth, karachiMonth);

    db.prepare(
      `UPDATE system_settings
       SET last_violation_reset_month = ?
       WHERE setting_id = 1
         AND (last_violation_reset_month IS NULL OR last_violation_reset_month != ?)`
    ).run(karachiMonth, karachiMonth);

    return result.changes;
  });

  const studentsResetCount = resetTx.immediate();
  return { karachiMonth, studentsResetCount };
}

export interface RecordedViolationOutcome {
  duplicate: boolean;
  violationId?: string;
  transactionId?: string;
  calendarMonth: string;
  monthlyViolationNumber: number;
  penaltyStatus: 'Warning' | 'Fine Issued';
  fineAmountPkr: number;
  notificationTitle?: string;
  notificationMessage?: string;
}

/**
 * Applies the finalized IBA Digital Library Monthly Violation & Penalty Policy
 * inside the caller's active SQLite write transaction (BEGIN IMMEDIATE):
 *
 * - Deduplicates strictly by reservation_id so repeated sensor signals or retries
 *   can never create duplicate violations or duplicate fines.
 * - Uses Asia/Karachi calendar month; automatically resets counter if month rolled over.
 * - 1st violation in calendar month:
 *     - monthly_violation_count = 1
 *     - penalty_status = 'Warning'
 *     - NO fine and NO financial_transactions row created
 *     - Sends exact required First Warning notification
 * - 2nd, 3rd, 4th, and subsequent violations in the same calendar month:
 *     - monthly_violation_count increments (2, 3, 4, ...)
 *     - penalty_status = 'Fine Issued'
 *     - Uses current administrator-configured fine_amount_pkr (PKR) from fine_configurations
 *     - Creates a separate financial_transactions row storing amount_pkr & fine_configuration_id,
 *       marked 'UNPAID'
 *     - Sends fine notification to the student
 */
export function recordAbsenceViolationInTx(params: {
  studentId: string;
  seatId: string;
  reservationId: string;
  nowDate?: Date;
}): RecordedViolationOutcome {
  const nowDate = params.nowDate ?? new Date();
  const nowIso = nowDate.toISOString();
  const nowMs = nowDate.getTime();
  const calendarMonth = getKarachiCalendarMonth(nowDate);
  const karachiDate = getKarachiDateString(nowDate);

  // Idempotency guard: never record more than one violation for the same reservation
  const existingViolation = db
    .prepare(
      `SELECT violation_id, calendar_month, monthly_violation_number, penalty_status
       FROM violations
       WHERE reservation_id = ?
       LIMIT 1`
    )
    .get(params.reservationId) as
    | {
        violation_id: string;
        calendar_month: string;
        monthly_violation_number: number;
        penalty_status: 'Warning' | 'Fine Issued';
      }
    | undefined;

  if (existingViolation) {
    return {
      duplicate: true,
      violationId: existingViolation.violation_id,
      calendarMonth: existingViolation.calendar_month,
      monthlyViolationNumber: existingViolation.monthly_violation_number,
      penaltyStatus: existingViolation.penalty_status,
      fineAmountPkr: 0,
    };
  }

  const fineCfg = getActiveFineConfigurationRow();

  const studentRow = db
    .prepare(
      `SELECT student_id, monthly_violation_count, current_violation_month, account_status
       FROM students
       WHERE student_id = ?`
    )
    .get(params.studentId) as
    | {
        student_id: string;
        monthly_violation_count: number;
        current_violation_month: string;
        account_status: 'Active' | 'Warning Issued' | 'Restricted';
      }
    | undefined;

  const currentCountInKarachiMonth =
    studentRow && studentRow.current_violation_month === calendarMonth
      ? studentRow.monthly_violation_count
      : 0;

  const nextMonthlyCount = currentCountInKarachiMonth + 1;
  const warningOnlyOnFirst = fineCfg.first_violation_warning_only !== 0;
  const isWarningOnlyViolation = warningOnlyOnFirst && nextMonthlyCount === 1;
  const penaltyStatus: 'Warning' | 'Fine Issued' = isWarningOnlyViolation ? 'Warning' : 'Fine Issued';
  const assessedFinePkr = isWarningOnlyViolation ? 0 : fineCfg.fine_amount_pkr;

  if (studentRow) {
    const nextAccountStatus =
      studentRow.account_status === 'Restricted' ? 'Restricted' : 'Warning Issued';

    db.prepare(
      `UPDATE students
       SET monthly_violation_count = ?,
           current_violation_month = ?,
           account_status = ?
       WHERE student_id = ?`
    ).run(nextMonthlyCount, calendarMonth, nextAccountStatus, params.studentId);
  }

  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  const violationId = `VIO-${nowMs.toString().slice(-5)}-${suffix.slice(0, 4)}`;

  db.prepare(
    `INSERT INTO violations (
      violation_id, student_id, seat_id, reservation_id, violation_timestamp,
      calendar_month, monthly_violation_number, violation_reason, penalty_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    violationId,
    params.studentId,
    params.seatId,
    params.reservationId,
    nowIso,
    calendarMonth,
    nextMonthlyCount,
    `Failed to return within permitted ${fineCfg.max_away_minutes}-minute absence period (${params.seatId} released)`,
    penaltyStatus
  );

  let transactionId: string | undefined;
  let notificationTitle: string;
  let notificationMessage: string;

  if (isWarningOnlyViolation) {
    notificationTitle = `First Warning — ${params.seatId} Released`;
    notificationMessage = FIRST_VIOLATION_WARNING_MESSAGE;
  } else {
    transactionId = `TXN-${nowMs.toString().slice(-5)}-${suffix.slice(0, 4)}`;
    const ordinalLabel =
      nextMonthlyCount === 2
        ? '2nd'
        : nextMonthlyCount === 3
          ? '3rd'
          : `${nextMonthlyCount}th`;

    db.prepare(
      `INSERT INTO financial_transactions (
        transaction_id, student_id, violation_id, seat_id, fine_configuration_id,
        transaction_date, description, amount_pkr, payment_status, payment_reference, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UNPAID', ?, ?)`
    ).run(
      transactionId,
      params.studentId,
      violationId,
      params.seatId,
      fineCfg.configuration_id,
      karachiDate,
      `ILS Absence Violation Fine (${params.seatId} · ${ordinalLabel} violation in ${calendarMonth})`,
      assessedFinePkr,
      `REF-${violationId}`,
      nowIso
    );

    db.prepare(
      `INSERT INTO financial_audit_logs (
        audit_id, transaction_id, student_id, action_type, previous_status, new_status,
        amount_pkr, payment_reference, payment_method, reason, performed_by_id, performed_by_name, performed_at
      ) VALUES (?, ?, ?, 'FINE_CREATED', NULL, 'UNPAID', ?, ?, NULL, ?, 'SYSTEM', 'Automated Violation Policy Engine', ?)`
    ).run(
      `AUD-${nowMs}-${suffix.slice(0, 4)}`,
      transactionId,
      params.studentId,
      assessedFinePkr,
      `REF-${violationId}`,
      `Automatic fine generated for ${ordinalLabel} qualifying absence violation in ${calendarMonth} (${params.seatId}, config ${fineCfg.configuration_id}).`,
      nowIso
    );

    notificationTitle = `Violation #${nextMonthlyCount} Fine Issued — PKR ${assessedFinePkr.toLocaleString()}`;
    notificationMessage = `You failed to return to ${params.seatId} within the permitted ${fineCfg.max_away_minutes}-minute absence period (${ordinalLabel} violation in ${calendarMonth}). Your seat has been released and a fine of PKR ${assessedFinePkr.toLocaleString()} (${transactionId}) has been added to your financial ledger as UNPAID.`;
  }

  db.prepare(
    `INSERT INTO notifications (
      notification_id, student_id, title, message, category, created_timestamp, read_status
    ) VALUES (?, ?, ?, ?, 'Policy', ?, 0)`
  ).run(
    `NTF-${nowMs}-${suffix}`,
    params.studentId,
    notificationTitle,
    notificationMessage,
    nowIso
  );

  return {
    duplicate: false,
    violationId,
    transactionId,
    calendarMonth,
    monthlyViolationNumber: nextMonthlyCount,
    penaltyStatus,
    fineAmountPkr: assessedFinePkr,
    notificationTitle,
    notificationMessage,
  };
}
