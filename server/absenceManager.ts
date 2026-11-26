import crypto from 'node:crypto';
import { db } from './db.ts';
import { broadcastSeatUpdate } from './events.ts';
import {
  getKarachiCalendarMonth,
  recordAbsenceViolationInTx,
  syncMonthlyViolationReset,
} from './violationPolicy.ts';

export type AbsenceTimerMode = 'production' | 'demo_accelerated';

export const FIVE_MINUTE_WARNING_MESSAGE =
  'Attention! You have only 5 minutes remaining to return to your ILS seat. If you do not return within the next 5 minutes, your reservation will expire and the seat will become available to other students.';

export function isDemoTimerEnabled(): boolean {
  const row = db
    .prepare(`SELECT demo_timer_enabled FROM system_settings WHERE setting_id = 1`)
    .get() as { demo_timer_enabled: number } | undefined;
  return row?.demo_timer_enabled === 1;
}

export function setDemoTimerEnabled(enabled: boolean): boolean {
  db.prepare(`UPDATE system_settings SET demo_timer_enabled = ? WHERE setting_id = 1`).run(
    enabled ? 1 : 0
  );
  broadcastSeatUpdate('admin_timer_mode_updated');
  return enabled;
}

export function getConfiguredAbsencePolicy(): {
  totalMinutes: number;
  warningAfterMinutes: number;
  warningLeadMinutes: number;
} {
  const row = db
    .prepare(
      `SELECT max_away_minutes, COALESCE(warning_after_minutes, 15) AS warning_after_minutes
       FROM fine_configurations
       ORDER BY rowid DESC
       LIMIT 1`
    )
    .get() as { max_away_minutes: number; warning_after_minutes: number } | undefined;

  const totalMinutes = Math.max(6, row?.max_away_minutes ?? 20);
  const rawWarningAfter = row?.warning_after_minutes ?? Math.max(1, totalMinutes - 5);
  const warningAfterMinutes = Math.min(Math.max(1, rawWarningAfter), totalMinutes - 1);
  const warningLeadMinutes = Math.max(1, totalMinutes - warningAfterMinutes);
  return { totalMinutes, warningAfterMinutes, warningLeadMinutes };
}

export function getConfiguredAbsenceMinutes(): number {
  return getConfiguredAbsencePolicy().totalMinutes;
}

/**
 * Computes persistent server-side warning and expiry timestamps for a new absence event.
 * - Production mode: 1 minute = 60,000 ms (default 20-minute absence countdown, warning at 15 min)
 * - Demo mode:       1 simulated minute = 1,000 ms (1 real second = 1 simulated minute; warning at 15s, expiry at 20s)
 */
export function computeAbsenceSchedule(departureMs: number, demoModeOverride?: boolean): {
  mode: AbsenceTimerMode;
  totalMinutes: number;
  warningLeadMinutes: number;
  msPerMinute: number;
  warningAtIso: string;
  deadlineAtIso: string;
} {
  const demoMode = demoModeOverride !== undefined ? demoModeOverride : isDemoTimerEnabled();
  const { totalMinutes, warningAfterMinutes, warningLeadMinutes } = getConfiguredAbsencePolicy();
  const msPerMinute = demoMode ? 1000 : 60_000;

  return {
    mode: demoMode ? 'demo_accelerated' : 'production',
    totalMinutes,
    warningLeadMinutes,
    msPerMinute,
    warningAtIso: new Date(departureMs + warningAfterMinutes * msPerMinute).toISOString(),
    deadlineAtIso: new Date(departureMs + totalMinutes * msPerMinute).toISOString(),
  };
}

export interface AbsenceSweepSummary {
  warningsDispatched: number;
  reservationsExpired: number;
  expiredSeatIds: string[];
  warnedSeatIds: string[];
}

interface PendingAwayRow {
  reservation_id: string;
  student_id: string;
  seat_id: string;
  sensor_id: string;
  departure_timestamp: string | null;
  absence_warning_at: string | null;
  absence_deadline_at: string | null;
  absence_warning_sent_at: string | null;
  absence_timer_mode: AbsenceTimerMode;
  sensor_presence: string;
  sensor_connectivity: string;
}

/**
 * Reliable, idempotent server-side absence processor.
 * Runs continuously on the backend regardless of whether any student or admin browser is open.
 * Uses SQLite BEGIN IMMEDIATE write transactions and conditional state checks so:
 *  - Duplicate 5-minute warnings can never be created for the same absence event.
 *  - Only ONE expiry operation and ONE violation/fine can ever execute for a reservation.
 *  - A returning PRESENT signal received before the deadline atomically cancels expiry.
 *  - Offline sensors never trigger warnings, expiries, or violations.
 */
export function processAutomatedAbsences(): AbsenceSweepSummary {
  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const warnedSeatIds: string[] = [];
  const expiredSeatIds: string[] = [];

  const sweepTxn = db.transaction(() => {
    const awayRows = db
      .prepare(
        `SELECT
           r.reservation_id,
           r.student_id,
           r.seat_id,
           s.sensor_id,
           r.departure_timestamp,
           r.absence_warning_at,
           r.absence_deadline_at,
           r.absence_warning_sent_at,
           r.absence_timer_mode,
           s.sensor_presence,
           s.sensor_connectivity
         FROM reservations r
         INNER JOIN ils_seats s ON s.seat_id = r.seat_id
         WHERE r.reservation_status = 'Temporarily Away'`
      )
      .all() as PendingAwayRow[];

    const nowMs = nowDate.getTime();

    for (const row of awayRows) {
      // Never warn, expire, or penalize when sensor data is OFFLINE / unreliable
      if (row.sensor_presence === 'OFFLINE' || row.sensor_connectivity === 'Offline') {
        continue;
      }

      // Compute fallback deadlines if a legacy Temporarily Away row lacks persisted schedule columns
      let warningAtIso = row.absence_warning_at;
      let deadlineAtIso = row.absence_deadline_at;

      if (!deadlineAtIso && row.departure_timestamp) {
        const depMs = new Date(row.departure_timestamp).getTime();
        if (!Number.isNaN(depMs)) {
          const sched = computeAbsenceSchedule(depMs, row.absence_timer_mode === 'demo_accelerated');
          warningAtIso = sched.warningAtIso;
          deadlineAtIso = sched.deadlineAtIso;
          db.prepare(
            `UPDATE reservations
             SET absence_warning_at = ?, absence_deadline_at = ?
             WHERE reservation_id = ? AND reservation_status = 'Temporarily Away'`
          ).run(warningAtIso, deadlineAtIso, row.reservation_id);
        }
      }

      if (!deadlineAtIso) continue;

      const deadlineMs = new Date(deadlineAtIso).getTime();
      const warningMs = warningAtIso ? new Date(warningAtIso).getTime() : deadlineMs - 5 * 60_000;
      if (Number.isNaN(deadlineMs)) continue;

      // 1. Check 20-minute expiry deadline FIRST
      if (nowMs >= deadlineMs) {
        // Atomic exactly-once transition guard: only succeeds if reservation is still Temporarily Away
        const expireGuard = db
          .prepare(
            `UPDATE reservations
             SET reservation_status = 'Expired',
                 expiry_timestamp = ?
             WHERE reservation_id = ?
               AND reservation_status = 'Temporarily Away'`
          )
          .run(nowIso, row.reservation_id);

        if (expireGuard.changes !== 1) {
          continue;
        }

        // Release seat assignment and return seat to AVAILABLE for other students
        db.prepare(
          `UPDATE ils_seats
           SET current_status = 'available',
               assigned_student_id = NULL,
               sensor_presence = 'ABSENT',
               sensor_connectivity = 'Online',
               last_sensor_event_at = ?
           WHERE seat_id = ?`
        ).run(nowIso, row.seat_id);

        const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
        const modeTag =
          row.absence_timer_mode === 'demo_accelerated'
            ? 'DEMO TIMER (1s=1m)'
            : 'Production 20-min timer';

        // Record automated expiry event in sensor_events
        db.prepare(
          `INSERT INTO sensor_events (
            event_id, seat_id, sensor_id, presence_status, signal_state,
            event_timestamp, event_source, is_simulated, event_note
          ) VALUES (?, ?, ?, 'Absent', 'ABSENT', ?, 'Sensor Feed', 1, ?)`
        ).run(
          `EVT-${nowMs}-${suffix}`,
          row.seat_id,
          row.sensor_id,
          nowIso,
          `Automated absence expiry (${modeTag}): reservation ${row.reservation_id} expired and ${row.seat_id} released to AVAILABLE`
        );

        // Apply finalized Phase 7 Monthly Violation & Penalty Policy (Asia/Karachi timezone, deduplicated by reservation_id)
        recordAbsenceViolationInTx({
          studentId: row.student_id,
          seatId: row.seat_id,
          reservationId: row.reservation_id,
          nowDate,
        });

        expiredSeatIds.push(row.seat_id);
        continue;
      }

      // 2. Check 15-minute mark (5-minute remaining warning) — strictly once per absence event
      if (!row.absence_warning_sent_at && nowMs >= warningMs) {
        const warnGuard = db
          .prepare(
            `UPDATE reservations
             SET absence_warning_sent_at = ?
             WHERE reservation_id = ?
               AND reservation_status = 'Temporarily Away'
               AND absence_warning_sent_at IS NULL`
          )
          .run(nowIso, row.reservation_id);

        if (warnGuard.changes !== 1) {
          continue;
        }

        const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
        db.prepare(
          `INSERT INTO notifications (
            notification_id, student_id, title, message, category, created_timestamp, read_status
          ) VALUES (?, ?, ?, ?, 'Policy', ?, 0)`
        ).run(
          `NTF-WARN-${nowMs}-${suffix}`,
          row.student_id,
          `5-Minute Absence Warning — ${row.seat_id}`,
          FIVE_MINUTE_WARNING_MESSAGE,
          nowIso
        );

        warnedSeatIds.push(row.seat_id);
      }
    }
  });

  sweepTxn.immediate();

  if (warnedSeatIds.length > 0) {
    broadcastSeatUpdate('absence_five_minute_warning', warnedSeatIds[0]);
  }
  if (expiredSeatIds.length > 0) {
    broadcastSeatUpdate('absence_auto_expired', expiredSeatIds[0]);
  }

  return {
    warningsDispatched: warnedSeatIds.length,
    reservationsExpired: expiredSeatIds.length,
    expiredSeatIds,
    warnedSeatIds,
  };
}

let schedulerTimer: NodeJS.Timeout | null = null;
let sweepInFlight = false;
let lastCheckedKarachiMonth: string | null = null;

export function startAbsenceScheduler(): void {
  if (schedulerTimer) return;

  const runTick = () => {
    if (sweepInFlight) return;
    sweepInFlight = true;
    try {
      const currentKarachiMonth = getKarachiCalendarMonth();
      if (lastCheckedKarachiMonth !== currentKarachiMonth) {
        const resetSummary = syncMonthlyViolationReset();
        lastCheckedKarachiMonth = resetSummary.karachiMonth;
        if (resetSummary.studentsResetCount > 0) {
          broadcastSeatUpdate('monthly_violation_reset');
        }
      }

      processAutomatedAbsences();
    } catch (err) {
      console.error('Absence automation tick error:', err);
    } finally {
      sweepInFlight = false;
    }
  };

  // Run once immediately on boot to recover any deadlines elapsed or month transitions while server was down
  runTick();

  // Poll every 1 second so Production (20 min), Accelerated Demo Mode (1s = 1m), and 1st-of-month PKT resets fire accurately
  schedulerTimer = setInterval(runTick, 1000);
  if (typeof schedulerTimer.unref === 'function') {
    schedulerTimer.unref();
  }
}
