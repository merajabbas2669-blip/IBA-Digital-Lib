import crypto from 'node:crypto';
import {
  computeAbsenceSchedule,
  getConfiguredAbsenceMinutes,
  isDemoTimerEnabled,
} from './absenceManager.ts';
import type { AbsenceTimerMode } from './absenceManager.ts';
import { db } from './db.ts';
import { broadcastSeatUpdate } from './events.ts';

export type SensorSignalState = 'PRESENT' | 'ABSENT' | 'OFFLINE';

export const SENSOR_DEBOUNCE_WINDOW_MS = 3000;
export const DEMO_TIMER_DEBOUNCE_WINDOW_MS = 1000;

export interface ProcessSensorSignalInput {
  seatId?: string;
  sensorId?: string;
  state: SensorSignalState;
  isSimulated: boolean;
  actorLabel?: string;
}

export interface ProcessSensorSignalResult {
  ok: boolean;
  httpStatus: number;
  code:
    | 'RECORDED'
    | 'INVALID_STATE'
    | 'SEAT_NOT_FOUND'
    | 'DUPLICATE_STATE'
    | 'DEBOUNCED';
  message: string;
  seatId?: string;
  sensorId?: string;
  previousState?: SensorSignalState;
  currentState?: SensorSignalState;
  eventId?: string;
  eventTimestamp?: string;
  retryAfterMs?: number;
  absenceCountdownMinutes?: number | null;
  absenceDeadlineAt?: string | null;
  absenceWarningAt?: string | null;
  absenceTimerMode?: AbsenceTimerMode | null;
  violationCreated: boolean;
}

export function isValidSensorSignalState(value: unknown): value is SensorSignalState {
  return value === 'PRESENT' || value === 'ABSENT' || value === 'OFFLINE';
}

function mapSignalToLegacyPresence(state: SensorSignalState): 'Present' | 'Absent' | 'Unknown' {
  if (state === 'PRESENT') return 'Present';
  if (state === 'ABSENT') return 'Absent';
  return 'Unknown';
}

export function isHardwareIoTConfigured(): boolean {
  const raw = process.env.IOT_SENSOR_API_KEY?.trim();
  return Boolean(raw && raw.length >= 12);
}

export function verifyHardwareIoTKey(providedKey: string | undefined): boolean {
  const configured = process.env.IOT_SENSOR_API_KEY?.trim();
  if (!configured || !providedKey) return false;
  const expectedBuf = Buffer.from(configured, 'utf8');
  const providedBuf = Buffer.from(providedKey.trim(), 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export function processSensorSignal(input: ProcessSensorSignalInput): ProcessSensorSignalResult {
  if (!isValidSensorSignalState(input.state)) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'INVALID_STATE',
      message: 'Sensor state must be PRESENT, ABSENT, or OFFLINE.',
      violationCreated: false,
    };
  }

  const lookupSeatId = typeof input.seatId === 'string' ? input.seatId.trim().toUpperCase() : '';
  const lookupSensorId = typeof input.sensorId === 'string' ? input.sensorId.trim().toUpperCase() : '';

  if (!lookupSeatId && !lookupSensorId) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'SEAT_NOT_FOUND',
      message: 'Specify a valid seatId (e.g., ILS-01) or sensorId (e.g., NODE-ILS-01).',
      violationCreated: false,
    };
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const demoTimerOn = isDemoTimerEnabled();
  const activeDebounceMs = demoTimerOn ? DEMO_TIMER_DEBOUNCE_WINDOW_MS : SENSOR_DEBOUNCE_WINDOW_MS;
  const countdownMins = getConfiguredAbsenceMinutes();
  const modePrefix = input.isSimulated ? 'DEMO / SIMULATED' : 'Hardware IoT Sensor';

  const tx = db.transaction((): ProcessSensorSignalResult => {
    const seat = (
      lookupSeatId
        ? db.prepare(`SELECT * FROM ils_seats WHERE UPPER(seat_id) = ? LIMIT 1`).get(lookupSeatId)
        : db.prepare(`SELECT * FROM ils_seats WHERE UPPER(sensor_id) = ? LIMIT 1`).get(lookupSensorId)
    ) as
      | {
          seat_id: string;
          sensor_id: string;
          current_status: 'available' | 'occupied' | 'away' | 'maintenance';
          assigned_student_id: string | null;
          sensor_connectivity: 'Online' | 'Ready' | 'Offline' | 'Calibrating';
          sensor_presence: SensorSignalState;
          last_sensor_event_at: string | null;
          maintenance_status: 'Operational' | 'Scheduled' | 'In Maintenance';
        }
      | undefined;

    if (!seat) {
      return {
        ok: false,
        httpStatus: 404,
        code: 'SEAT_NOT_FOUND',
        message: 'Matching ILS seat or sensor node was not found.',
        violationCreated: false,
      };
    }

    const previousState: SensorSignalState = isValidSensorSignalState(seat.sensor_presence)
      ? seat.sensor_presence
      : seat.sensor_connectivity === 'Offline'
        ? 'OFFLINE'
        : seat.current_status === 'occupied'
          ? 'PRESENT'
          : 'ABSENT';

    // 1. Prevent duplicate / redundant sensor signals
    if (previousState === input.state) {
      const connectivityMatches =
        (input.state === 'OFFLINE' && seat.sensor_connectivity === 'Offline') ||
        (input.state !== 'OFFLINE' && seat.sensor_connectivity !== 'Offline');
      if (connectivityMatches) {
        return {
          ok: false,
          httpStatus: 409,
          code: 'DUPLICATE_STATE',
          message: `Duplicate signal ignored: ${seat.sensor_id} (${seat.seat_id}) is already reporting ${input.state}.`,
          seatId: seat.seat_id,
          sensorId: seat.sensor_id,
          previousState,
          currentState: previousState,
          violationCreated: false,
        };
      }
    }

    // 2. Debounce rapid back-to-back sensor bounces to prevent false transitions
    if (seat.last_sensor_event_at) {
      const lastMs = new Date(seat.last_sensor_event_at).getTime();
      if (!Number.isNaN(lastMs) && nowMs - lastMs < activeDebounceMs) {
        const remainingMs = activeDebounceMs - (nowMs - lastMs);
        const remainingSec = (remainingMs / 1000).toFixed(1);
        return {
          ok: false,
          httpStatus: 429,
          code: 'DEBOUNCED',
          message: `Signal debounced for ${seat.sensor_id} (${seat.seat_id}): wait ${remainingSec}s to prevent false rapid switching.`,
          seatId: seat.seat_id,
          sensorId: seat.sensor_id,
          previousState,
          currentState: previousState,
          retryAfterMs: remainingMs,
          violationCreated: false,
        };
      }
    }

    // Look up any currently active or temporarily away reservation for this seat
    const activeRes = db
      .prepare(
        `SELECT reservation_id, student_id, reservation_status, departure_timestamp, absence_deadline_at, absence_warning_at, absence_timer_mode
         FROM reservations
         WHERE seat_id = ? AND reservation_status IN ('Active', 'Temporarily Away')
         ORDER BY start_timestamp DESC
         LIMIT 1`
      )
      .get(seat.seat_id) as
      | {
          reservation_id: string;
          student_id: string;
          reservation_status: 'Active' | 'Temporarily Away';
          departure_timestamp: string | null;
          absence_deadline_at: string | null;
          absence_warning_at: string | null;
          absence_timer_mode: AbsenceTimerMode;
        }
      | undefined;

    const uniqueSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const eventId = `EVT-${nowMs}-${uniqueSuffix}`;
    const notifId = `NTF-${nowMs}-${uniqueSuffix}`;
    let note = `${modePrefix}: ${previousState} -> ${input.state}`;
    let resultMessage = '';
    let absenceCountdownMinutes: number | null = null;
    let absenceDeadlineAt: string | null = null;
    let absenceWarningAt: string | null = null;
    let absenceTimerMode: AbsenceTimerMode | null = null;

    if (input.state === 'PRESENT') {
      // Sensor reports student PRESENT — atomically cancels any pending absence expiry & countdown
      if (activeRes) {
        const wasAway = activeRes.reservation_status === 'Temporarily Away';
        const wasOffline = previousState === 'OFFLINE';

        db.prepare(
          `UPDATE ils_seats
           SET current_status = 'occupied',
               assigned_student_id = ?,
               sensor_presence = 'PRESENT',
               sensor_connectivity = 'Online',
               maintenance_status = 'Operational',
               maintenance_note = NULL,
               qr_active = 1,
               last_sensor_event_at = ?
           WHERE seat_id = ?`
        ).run(activeRes.student_id, nowIso, seat.seat_id);

        if (wasAway) {
          // Cancel pending expiry, clear countdown/warning timestamps, record return_timestamp, ZERO violation
          db.prepare(
            `UPDATE reservations
             SET reservation_status = 'Active',
                 return_timestamp = ?,
                 absence_warning_at = NULL,
                 absence_deadline_at = NULL,
                 absence_warning_sent_at = NULL
             WHERE reservation_id = ?`
          ).run(nowIso, activeRes.reservation_id);

          db.prepare(
            `INSERT INTO notifications (notification_id, student_id, title, message, category, created_timestamp, read_status)
             VALUES (?, ?, ?, ?, 'Reservation', ?, 0)`
          ).run(
            notifId,
            activeRes.student_id,
            `Presence Restored — ${seat.seat_id}`,
            `Occupancy sensor ${seat.sensor_id} (${modePrefix}) detected your return to ${seat.seat_id} before expiry. Your pending absence expiry has been cancelled and no violation was recorded.`,
            nowIso
          );

          note = `${modePrefix}: Student returned before expiry — pending expiry cancelled, seat OCCUPIED (no violation)`;
          resultMessage = `${seat.seat_id} (${seat.sensor_id}) set to PRESENT. Pending absence expiry cancelled, return timestamp recorded, seat restored to OCCUPIED, and no violation created.`;
        } else if (wasOffline) {
          note = `${modePrefix}: Sensor restored online (PRESENT) — active reservation intact`;
          resultMessage = `${seat.seat_id} (${seat.sensor_id}) restored from OFFLINE to PRESENT. Active student occupancy resumed with zero violations.`;
        } else {
          note = `${modePrefix}: Active student presence confirmed — seat OCCUPIED`;
          resultMessage = `${seat.seat_id} (${seat.sensor_id}) confirmed PRESENT. Seat remains OCCUPIED with no absence countdown.`;
        }
      } else {
        // No active reservation exists on this desk — record sensor presence without fabricating a student reservation
        const nextSeatStatus = seat.maintenance_status === 'In Maintenance' ? 'maintenance' : 'available';
        db.prepare(
          `UPDATE ils_seats
           SET current_status = ?,
               sensor_presence = 'PRESENT',
               sensor_connectivity = 'Online',
               last_sensor_event_at = ?
           WHERE seat_id = ?`
        ).run(nextSeatStatus, nowIso, seat.seat_id);

        note = `${modePrefix}: Unreserved presence detected (no active QR booking)`;
        resultMessage = `${seat.seat_id} (${seat.sensor_id}) set to PRESENT. Note: no active student QR reservation is assigned to this desk.`;
      }
    } else if (input.state === 'ABSENT') {
      // Sensor reports student ABSENT — start server-controlled 20-minute absence countdown
      if (activeRes) {
        const wasOffline = previousState === 'OFFLINE';
        const isContinuingAway =
          activeRes.reservation_status === 'Temporarily Away' &&
          Boolean(activeRes.departure_timestamp) &&
          Boolean(activeRes.absence_deadline_at);

        const departureTs = isContinuingAway ? activeRes.departure_timestamp! : nowIso;
        const schedule = computeAbsenceSchedule(nowMs, demoTimerOn);
        const warningAt = isContinuingAway && activeRes.absence_warning_at
          ? activeRes.absence_warning_at
          : schedule.warningAtIso;
        const deadlineAt = isContinuingAway && activeRes.absence_deadline_at
          ? activeRes.absence_deadline_at
          : schedule.deadlineAtIso;
        const timerMode: AbsenceTimerMode = isContinuingAway
          ? activeRes.absence_timer_mode
          : schedule.mode;

        db.prepare(
          `UPDATE ils_seats
           SET current_status = 'away',
               assigned_student_id = ?,
               sensor_presence = 'ABSENT',
               sensor_connectivity = 'Online',
               maintenance_status = 'Operational',
               qr_active = 1,
               last_sensor_event_at = ?
           WHERE seat_id = ?`
        ).run(activeRes.student_id, nowIso, seat.seat_id);

        db.prepare(
          `UPDATE reservations
           SET reservation_status = 'Temporarily Away',
               departure_timestamp = ?,
               absence_warning_at = ?,
               absence_deadline_at = ?,
               absence_warning_sent_at = CASE WHEN ? = 1 THEN absence_warning_sent_at ELSE NULL END,
               absence_timer_mode = ?
           WHERE reservation_id = ?`
        ).run(
          departureTs,
          warningAt,
          deadlineAt,
          isContinuingAway ? 1 : 0,
          timerMode,
          activeRes.reservation_id
        );

        const timerLabel =
          timerMode === 'demo_accelerated'
            ? `${countdownMins}s (Accelerated Demo Timer: 1s = 1 simulated min)`
            : `${countdownMins} minutes`;

        db.prepare(
          `INSERT INTO notifications (notification_id, student_id, title, message, category, created_timestamp, read_status)
           VALUES (?, ?, ?, ?, 'Policy', ?, 0)`
        ).run(
          notifId,
          activeRes.student_id,
          `Temporarily Away Detected — ${seat.seat_id}`,
          `Occupancy sensor ${seat.sensor_id} (${modePrefix}) detected departure from ${seat.seat_id}. Your reservation remains held for ${countdownMins} minutes (${timerMode === 'demo_accelerated' ? 'accelerated demo mode: 1s = 1m' : 'server-managed countdown'}).`,
          nowIso
        );

        absenceCountdownMinutes = countdownMins;
        absenceDeadlineAt = deadlineAt;
        absenceWarningAt = warningAt;
        absenceTimerMode = timerMode;

        note = wasOffline
          ? `${modePrefix}: Sensor restored online (ABSENT) — ${timerLabel} absence countdown active`
          : `${modePrefix}: Departure detected — TEMPORARILY AWAY (${timerLabel} countdown started)`;
        resultMessage = `${seat.seat_id} (${seat.sensor_id}) changed to ABSENT. Departure recorded, seat marked TEMPORARILY AWAY, and server-side ${timerLabel} countdown started.`;
      } else {
        // Desk has no active reservation — returning from offline/maintenance or confirming empty desk
        db.prepare(
          `UPDATE ils_seats
           SET current_status = 'available',
               assigned_student_id = NULL,
               sensor_presence = 'ABSENT',
               sensor_connectivity = 'Online',
               maintenance_status = 'Operational',
               maintenance_note = NULL,
               qr_active = 1,
               last_sensor_event_at = ?
           WHERE seat_id = ?`
        ).run(nowIso, seat.seat_id);

        note = `${modePrefix}: Sensor online and desk unoccupied (AVAILABLE)`;
        resultMessage = `${seat.seat_id} (${seat.sensor_id}) set to ABSENT (Online). Seat is available for student QR booking.`;
      }
    } else {
      // Sensor reports OFFLINE — alert administrator, NEVER auto-create a violation, preserve any active student reservation!
      db.prepare(
        `UPDATE ils_seats
         SET sensor_presence = 'OFFLINE',
             sensor_connectivity = 'Offline',
             last_sensor_event_at = ?
         WHERE seat_id = ?`
      ).run(nowIso, seat.seat_id);

      note = activeRes
        ? `${modePrefix}: Sensor OFFLINE — active reservation ${activeRes.reservation_id} protected (no violation or auto-expiry while offline)`
        : `${modePrefix}: Sensor OFFLINE — seat paused from new bookings pending staff investigation`;
      resultMessage = activeRes
        ? `ALERT: ${seat.sensor_id} (${seat.seat_id}) is now OFFLINE. Active reservation preserved with zero automatic violations or expiries; staff investigation required.`
        : `ALERT: ${seat.sensor_id} (${seat.seat_id}) is now OFFLINE. Seat flagged unavailable for booking until staff investigates and restores sensor.`;
    }

    if (input.actorLabel) {
      note = `${note} [${input.actorLabel}]`;
    }

    db.prepare(
      `INSERT INTO sensor_events (
        event_id, seat_id, sensor_id, presence_status, signal_state, event_timestamp, event_source, is_simulated, event_note
      ) VALUES (?, ?, ?, ?, ?, ?, 'Sensor Feed', ?, ?)`
    ).run(
      eventId,
      seat.seat_id,
      seat.sensor_id,
      mapSignalToLegacyPresence(input.state),
      input.state,
      nowIso,
      input.isSimulated ? 1 : 0,
      note
    );

    return {
      ok: true,
      httpStatus: 200,
      code: 'RECORDED',
      message: resultMessage,
      seatId: seat.seat_id,
      sensorId: seat.sensor_id,
      previousState,
      currentState: input.state,
      eventId,
      eventTimestamp: nowIso,
      absenceCountdownMinutes,
      absenceDeadlineAt,
      absenceWarningAt,
      absenceTimerMode,
      violationCreated: false,
    };
  });

  const result = tx.immediate();
  if (result.ok) {
    broadcastSeatUpdate(
      input.isSimulated ? 'sensor_simulated_event' : 'sensor_iot_event',
      result.seatId
    );
  }
  return result;
}
