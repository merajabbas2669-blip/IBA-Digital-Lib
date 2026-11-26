import crypto from 'node:crypto';
import { db } from './db.ts';
import { getKarachiCalendarMonth } from './violationPolicy.ts';

interface DemoStudentSeed {
  studentId: string;
  fullName: string;
  email: string;
  program: string;
  batch: string;
  phone: string;
  accountStatus: 'Active' | 'Warning Issued' | 'Restricted';
  monthlyViolationCount: number;
}

const CURRENT_MONTH = getKarachiCalendarMonth();

const DEMO_STUDENTS: DemoStudentSeed[] = [
  { studentId: '26418', fullName: 'Ahmed Raza Khan', email: 'a.khan.26418@khi.iba.edu.pk', program: 'BS Computer Science', batch: 'Class of 2027', phone: '+92 300 4812641', accountStatus: 'Active', monthlyViolationCount: 1 },
  { studentId: '25904', fullName: 'Zainab Tariq', email: 'z.tariq.25904@khi.iba.edu.pk', program: 'BBA', batch: 'Class of 2026', phone: '+92 321 9045120', accountStatus: 'Active', monthlyViolationCount: 0 },
  { studentId: '27112', fullName: 'Bilal Mahmood', email: 'b.mahmood.27112@khi.iba.edu.pk', program: 'BS Economics & Mathematics', batch: 'Class of 2028', phone: '+92 333 2711290', accountStatus: 'Warning Issued', monthlyViolationCount: 2 },
  { studentId: '24885', fullName: 'Hira Siddiqui', email: 'h.siddiqui.24885@khi.iba.edu.pk', program: 'BS Accounting & Finance', batch: 'Class of 2026', phone: '+92 301 8851204', accountStatus: 'Active', monthlyViolationCount: 0 },
  { studentId: '26731', fullName: 'Usman Farooq', email: 'u.farooq.26731@khi.iba.edu.pk', program: 'BS Data Science', batch: 'Class of 2027', phone: '+92 345 6731902', accountStatus: 'Active', monthlyViolationCount: 1 },
  { studentId: '25319', fullName: 'Mariam Javed', email: 'm.javed.25319@khi.iba.edu.pk', program: 'BS Social Sciences', batch: 'Class of 2026', phone: '+92 312 5319441', accountStatus: 'Restricted', monthlyViolationCount: 3 },
  { studentId: '27408', fullName: 'Hamza Altaf', email: 'h.altaf.27408@khi.iba.edu.pk', program: 'BS Computer Science', batch: 'Class of 2028', phone: '+92 300 7408119', accountStatus: 'Active', monthlyViolationCount: 0 },
  { studentId: '26092', fullName: 'Areeba Nadeem', email: 'a.nadeem.26092@khi.iba.edu.pk', program: 'BBA', batch: 'Class of 2027', phone: '+92 322 6092345', accountStatus: 'Active', monthlyViolationCount: 0 },
  { studentId: '25114', fullName: 'Saad Iqbal', email: 's.iqbal.25114@khi.iba.edu.pk', program: 'BS Economics', batch: 'Class of 2026', phone: '+92 300 5114820', accountStatus: 'Active', monthlyViolationCount: 0 },
  { studentId: '26220', fullName: 'Fatima Noor', email: 'f.noor.26220@khi.iba.edu.pk', program: 'BS Computer Science', batch: 'Class of 2027', phone: '+92 321 6220911', accountStatus: 'Active', monthlyViolationCount: 0 },
  { studentId: '24990', fullName: 'Daniyal Shah', email: 'd.shah.24990@khi.iba.edu.pk', program: 'BBA', batch: 'Class of 2026', phone: '+92 334 4990112', accountStatus: 'Active', monthlyViolationCount: 0 },
  { studentId: '25841', fullName: 'Nadia Kamran', email: 'n.kamran.25841@khi.iba.edu.pk', program: 'BS Accounting & Finance', batch: 'Class of 2026', phone: '+92 302 5841907', accountStatus: 'Active', monthlyViolationCount: 1 },
  { studentId: '27019', fullName: 'Taha Zubair', email: 't.zubair.27019@khi.iba.edu.pk', program: 'BS Data Science', batch: 'Class of 2028', phone: '+92 331 7019884', accountStatus: 'Active', monthlyViolationCount: 0 },
  { studentId: '26505', fullName: 'Sana Mir', email: 's.mir.26505@khi.iba.edu.pk', program: 'BS Economics & Mathematics', batch: 'Class of 2027', phone: '+92 345 6505122', accountStatus: 'Active', monthlyViolationCount: 0 },
  { studentId: '27210', fullName: 'Omar Sheikh', email: 'o.sheikh.27210@khi.iba.edu.pk', program: 'BS Computer Science', batch: 'Class of 2028', phone: '+92 300 7210443', accountStatus: 'Active', monthlyViolationCount: 0 },
  { studentId: '25672', fullName: 'Ayesha Khalid', email: 'a.khalid.25672@khi.iba.edu.pk', program: 'BBA', batch: 'Class of 2026', phone: '+92 323 5672109', accountStatus: 'Active', monthlyViolationCount: 0 },
  { studentId: '26844', fullName: 'Zayd Mansoor', email: 'z.mansoor.26844@khi.iba.edu.pk', program: 'BS Accounting & Finance', batch: 'Class of 2027', phone: '+92 315 6844730', accountStatus: 'Warning Issued', monthlyViolationCount: 2 },
  { studentId: '27531', fullName: 'Mehwish Ali', email: 'm.ali.27531@khi.iba.edu.pk', program: 'BS Social Sciences', batch: 'Class of 2028', phone: '+92 301 7531208', accountStatus: 'Active', monthlyViolationCount: 0 },
  { studentId: '24790', fullName: 'Kamran Haider', email: 'k.haider.24790@khi.iba.edu.pk', program: 'BS Economics', batch: 'Class of 2026', phone: '+92 332 4790655', accountStatus: 'Active', monthlyViolationCount: 0 },
  { studentId: '26155', fullName: 'Laiba Imran', email: 'l.imran.26155@khi.iba.edu.pk', program: 'BS Data Science', batch: 'Class of 2027', phone: '+92 320 6155832', accountStatus: 'Active', monthlyViolationCount: 0 },
];

const SEAT_ASSIGNMENTS: Record<
  number,
  {
    status: 'available' | 'occupied' | 'away' | 'maintenance';
    studentId?: string;
    maintenanceNote?: string;
  }
> = {
  1: { status: 'occupied', studentId: '25904' },
  3: { status: 'occupied', studentId: '26418' },
  5: { status: 'away', studentId: '27112' },
  6: { status: 'occupied', studentId: '24885' },
  9: { status: 'maintenance', maintenanceNote: 'Desk power socket inspection scheduled' },
  10: { status: 'occupied', studentId: '26731' },
  12: { status: 'occupied', studentId: '27408' },
  13: { status: 'away', studentId: '26092' },
  15: { status: 'occupied', studentId: '25114' },
  18: { status: 'occupied', studentId: '26220' },
  20: { status: 'maintenance', maintenanceNote: 'Acoustic divider bracket replacement' },
  21: { status: 'occupied', studentId: '24990' },
  23: { status: 'away', studentId: '25841' },
  25: { status: 'occupied', studentId: '27019' },
  28: { status: 'occupied', studentId: '26505' },
};

function zoneForSeat(num: number): string {
  if (num <= 10) return 'Quiet Zone A';
  if (num <= 20) return 'Research Zone B';
  return 'Focus Zone C';
}

export function generateSecureSeatQrToken(seatId: string): string {
  const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `IBA-${seatId}-${randomSuffix}`;
}

export function seedDatabaseIfEmpty(): void {
  const seatCountRow = db.prepare(`SELECT COUNT(*) AS count FROM ils_seats`).get() as { count: number };
  if (seatCountRow.count > 0) {
    // Upgrade legacy Phase 1 predictable QR tokens (IBA-DL-2026-ILSXX) once into permanent secure per-seat tokens
    const legacySeats = db
      .prepare(`SELECT seat_id FROM ils_seats WHERE qr_code_identifier LIKE 'IBA-DL-2026-ILS%'`)
      .all() as Array<{ seat_id: string }>;
    if (legacySeats.length > 0) {
      const updateQr = db.prepare(`UPDATE ils_seats SET qr_code_identifier = ? WHERE seat_id = ?`);
      db.transaction(() => {
        for (const s of legacySeats) {
          updateQr.run(generateSecureSeatQrToken(s.seat_id), s.seat_id);
        }
      })();
    }

    // Align seeded default fine configuration with the 20-minute absence countdown policy
    db.prepare(
      `UPDATE fine_configurations SET max_away_minutes = 20 WHERE configuration_id = 'CFG-2026-01' AND max_away_minutes = 30`
    ).run();

    // Backfill Phase 5 sensor_presence and last_sensor_event_at for existing seats
    const nowIso = new Date().toISOString();
    const uninitializedSeats = db
      .prepare(
        `SELECT seat_id, current_status, sensor_connectivity, maintenance_status
         FROM ils_seats
         WHERE last_sensor_event_at IS NULL`
      )
      .all() as Array<{
      seat_id: string;
      current_status: string;
      sensor_connectivity: string;
      maintenance_status: string;
    }>;

    if (uninitializedSeats.length > 0) {
      const backfillSeat = db.prepare(
        `UPDATE ils_seats
         SET sensor_presence = ?,
             sensor_connectivity = ?,
             last_sensor_event_at = ?
         WHERE seat_id = ?`
      );
      db.transaction(() => {
        for (const s of uninitializedSeats) {
          const isOffline =
            s.sensor_connectivity === 'Offline' ||
            s.current_status === 'maintenance' ||
            s.maintenance_status === 'In Maintenance';
          const presence = isOffline
            ? 'OFFLINE'
            : s.current_status === 'occupied'
              ? 'PRESENT'
              : 'ABSENT';
          const connectivity = isOffline ? 'Offline' : 'Online';
          const lastEv = db
            .prepare(
              `SELECT event_timestamp FROM sensor_events WHERE seat_id = ? ORDER BY event_timestamp DESC LIMIT 1`
            )
            .get(s.seat_id) as { event_timestamp: string } | undefined;
          backfillSeat.run(presence, connectivity, lastEv?.event_timestamp ?? nowIso, s.seat_id);
        }
      })();
    }

    // Backfill signal_state on legacy sensor_events rows
    db.prepare(
      `UPDATE sensor_events
       SET signal_state = CASE
         WHEN presence_status = 'Present' THEN 'PRESENT'
         WHEN presence_status = 'Unknown' THEN 'OFFLINE'
         ELSE 'ABSENT'
       END
       WHERE signal_state = 'ABSENT' AND presence_status != 'Absent'`
    ).run();

    // Keep the 3 initial seeded demo 'Temporarily Away' rows realistic within the 20-minute absence countdown
    const now = Date.now();
    const demoAwayOffsets: Array<{ id: string; minsAgo: number }> = [
      { id: 'RES-8839', minsAgo: 4 },
      { id: 'RES-8835', minsAgo: 8 },
      { id: 'RES-8831', minsAgo: 12 },
    ];
    for (const item of demoAwayOffsets) {
      const row = db
        .prepare(
          `SELECT reservation_id, departure_timestamp, absence_deadline_at, reservation_status FROM reservations WHERE reservation_id = ?`
        )
        .get(item.id) as
        | {
            reservation_id: string;
            departure_timestamp: string | null;
            absence_deadline_at: string | null;
            reservation_status: string;
          }
        | undefined;
      if (row && row.reservation_status === 'Temporarily Away') {
        const depMs = row.departure_timestamp ? new Date(row.departure_timestamp).getTime() : NaN;
        const needsRefresh =
          !row.absence_deadline_at ||
          Number.isNaN(depMs) ||
          now - depMs > 18 * 60 * 1000 ||
          depMs > now;
        if (needsRefresh) {
          const freshDepMs = now - item.minsAgo * 60 * 1000;
          const freshStart = new Date(now - 75 * 60 * 1000).toISOString();
          const freshDep = new Date(freshDepMs).toISOString();
          const freshWarn = new Date(freshDepMs + 15 * 60 * 1000).toISOString();
          const freshDeadline = new Date(freshDepMs + 20 * 60 * 1000).toISOString();
          const freshExp = new Date(now + 105 * 60 * 1000).toISOString();
          db.prepare(
            `UPDATE reservations
             SET start_timestamp = ?,
                 departure_timestamp = ?,
                 absence_warning_at = ?,
                 absence_deadline_at = ?,
                 absence_warning_sent_at = NULL,
                 absence_timer_mode = 'production',
                 expiry_timestamp = ?
             WHERE reservation_id = ?`
          ).run(freshStart, freshDep, freshWarn, freshDeadline, freshExp, item.id);
        }
      }
    }

    // One-time idempotent alignment of legacy Phase 2 seeded demo rows to the finalized Phase 7 policy:
    // - 1st monthly violation (VIO-409) = Warning only, zero fine (remove legacy TXN-901)
    // - 2nd monthly violation (VIO-418) = Fine Issued with UNPAID fine (TXN-911)
    // - 3rd monthly violation (VIO-415) = Fine Issued with UNPAID fine
    db.transaction(() => {
      const legacyVio409 = db
        .prepare(`SELECT violation_id, penalty_status FROM violations WHERE violation_id = 'VIO-409' AND monthly_violation_number = 1`)
        .get() as { violation_id: string; penalty_status: string } | undefined;
      if (legacyVio409 && legacyVio409.penalty_status === 'Fine Issued') {
        db.prepare(
          `UPDATE violations
           SET penalty_status = 'Warning',
               violation_reason = 'Failed to return within permitted 20-minute absence period (ILS-08 released)'
           WHERE violation_id = 'VIO-409'`
        ).run();
        db.prepare(`DELETE FROM financial_transactions WHERE transaction_id = 'TXN-901' AND violation_id = 'VIO-409'`).run();
      }

      const legacyVio418 = db
        .prepare(`SELECT violation_id, penalty_status FROM violations WHERE violation_id = 'VIO-418' AND monthly_violation_number = 2`)
        .get() as { violation_id: string; penalty_status: string } | undefined;
      if (legacyVio418 && legacyVio418.penalty_status === 'Warning') {
        db.prepare(
          `UPDATE violations
           SET penalty_status = 'Fine Issued',
               violation_reason = 'Failed to return within permitted 20-minute absence period (ILS-17 released)'
           WHERE violation_id = 'VIO-418'`
        ).run();
        const hasTxn418 = db
          .prepare(`SELECT transaction_id FROM financial_transactions WHERE violation_id = 'VIO-418' LIMIT 1`)
          .get();
        if (!hasTxn418) {
          db.prepare(
            `INSERT INTO financial_transactions (
              transaction_id, student_id, violation_id, seat_id, fine_configuration_id,
              transaction_date, description, amount_pkr, payment_status, payment_reference, updated_at
            ) VALUES ('TXN-911', '26844', 'VIO-418', 'ILS-17', 'CFG-2026-01', '2026-11-22',
              'ILS Absence Violation Fine (ILS-17 · 2nd violation)', 250, 'UNPAID', 'REF-VIO-418', '2026-11-22T16:40:00.000Z')`
          ).run();
        }
      }

      db.prepare(
        `UPDATE violations
         SET penalty_status = 'Fine Issued'
         WHERE violation_id = 'VIO-415' AND penalty_status = 'Account Hold'`
      ).run();

      db.prepare(
        `UPDATE financial_transactions
         SET fine_configuration_id = 'CFG-2026-01'
         WHERE fine_configuration_id IS NULL`
      ).run();

      // Phase 8 idempotent backfill for seat_id, verification metadata, and baseline audit logs
      db.prepare(
        `UPDATE financial_transactions
         SET seat_id = (SELECT v.seat_id FROM violations v WHERE v.violation_id = financial_transactions.violation_id)
         WHERE seat_id IS NULL AND violation_id IS NOT NULL`
      ).run();

      db.prepare(
        `UPDATE financial_transactions
         SET seat_id = COALESCE(seat_id, 'ILS-14'),
             payment_method = COALESCE(payment_method, 'Bursar Cash Counter'),
             verified_by_administrator = COALESCE(verified_by_administrator, 'IBA-LIB-014'),
             verified_at = COALESCE(verified_at, '2026-10-19T14:20:00.000Z'),
             admin_notes = COALESCE(admin_notes, 'Verified against Campus Bursar receipt RCP-4410.')
         WHERE transaction_id = 'TXN-884'`
      ).run();

      db.prepare(
        `UPDATE financial_transactions
         SET seat_id = COALESCE(seat_id, 'ILS-04'),
             payment_method = COALESCE(payment_method, 'Waiver Adjustment'),
             verified_by_administrator = COALESCE(verified_by_administrator, 'IBA-LIB-014'),
             verified_at = COALESCE(verified_at, '2026-10-12T15:05:00.000Z'),
             waiver_reason = COALESCE(waiver_reason, 'Approved medical emergency grace waiver by Library Operations Desk.')
         WHERE transaction_id = 'TXN-872'`
      ).run();

      const allTxns = db
        .prepare(
          `SELECT transaction_id, student_id, amount_pkr, payment_status, payment_reference,
                  payment_method, transaction_date, description, waiver_reason, verified_by_administrator, verified_at
           FROM financial_transactions`
        )
        .all() as Array<{
        transaction_id: string;
        student_id: string;
        amount_pkr: number;
        payment_status: 'UNPAID' | 'PENDING' | 'PAID' | 'WAIVED';
        payment_reference: string;
        payment_method: string | null;
        transaction_date: string;
        description: string;
        waiver_reason: string | null;
        verified_by_administrator: string | null;
        verified_at: string | null;
      }>;

      const hasAuditStmt = db.prepare(
        `SELECT audit_id FROM financial_audit_logs WHERE transaction_id = ? LIMIT 1`
      );
      const insertAuditStmt = db.prepare(
        `INSERT INTO financial_audit_logs (
          audit_id, transaction_id, student_id, action_type, previous_status, new_status,
          amount_pkr, payment_reference, payment_method, reason, performed_by_id, performed_by_name, performed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const tx of allTxns) {
        if (!hasAuditStmt.get(tx.transaction_id)) {
          const baseTime = `${tx.transaction_date}T10:00:00.000Z`;
          insertAuditStmt.run(
            `AUD-INIT-${tx.transaction_id}`,
            tx.transaction_id,
            tx.student_id,
            'FINE_CREATED',
            null,
            'UNPAID',
            tx.amount_pkr,
            tx.payment_reference,
            null,
            tx.description,
            'SYSTEM',
            'Automated Violation Policy Engine',
            baseTime
          );
          if (tx.payment_status === 'PAID') {
            insertAuditStmt.run(
              `AUD-PAID-${tx.transaction_id}`,
              tx.transaction_id,
              tx.student_id,
              'PAYMENT_VERIFIED',
              'UNPAID',
              'PAID',
              tx.amount_pkr,
              tx.payment_reference,
              tx.payment_method ?? 'Bursar Cash Counter',
              `Verified payment receipt (${tx.payment_reference}) at IBA Campus Bursar.`,
              tx.verified_by_administrator ?? 'IBA-LIB-014',
              'Dr. Samina Qureshi',
              tx.verified_at ?? `${tx.transaction_date}T14:20:00.000Z`
            );
          } else if (tx.payment_status === 'WAIVED') {
            insertAuditStmt.run(
              `AUD-WAIV-${tx.transaction_id}`,
              tx.transaction_id,
              tx.student_id,
              'FINE_WAIVED',
              'UNPAID',
              'WAIVED',
              tx.amount_pkr,
              tx.payment_reference,
              'Waiver Adjustment',
              tx.waiver_reason ?? 'Approved administrative waiver by Library Desk.',
              tx.verified_by_administrator ?? 'IBA-LIB-014',
              'Dr. Samina Qureshi',
              tx.verified_at ?? `${tx.transaction_date}T15:05:00.000Z`
            );
          }
        }
      }
    })();

    return;
  }

  const runSeed = db.transaction(() => {
    const createdDate = '2026-09-01T08:30:00.000Z';
    const now = Date.now();
    const relIso = (offsetMins: number) => new Date(now + offsetMins * 60 * 1000).toISOString();

    // 1. Seed 1 Administrator (Demonstration Staff Account; password claimed on first-run or via ADMIN_INITIAL_PASSWORD env var)
    db.prepare(
      `INSERT INTO students (
        student_id, full_name, email, auth_reference, password_hash, role,
        account_status, is_demo, program, batch, campus, phone,
        monthly_violation_count, current_violation_month, email_alerts, grace_reminders, created_date
      ) VALUES (?, ?, ?, ?, ?, 'admin', 'Active', 1, ?, ?, ?, ?, 0, ?, 1, 1, ?)`
    ).run(
      'IBA-LIB-014',
      'Dr. Samina Qureshi',
      's.qureshi@iba.edu.pk',
      `AUTH-ADM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      null,
      'Head of Digital Library Operations',
      'Mian Muhammad Abdullah Library',
      'IBA Main Campus, Karachi',
      '+92 21 38104700',
      CURRENT_MONTH,
      createdDate
    );

    // 2. Seed 20 Demonstration Students (is_demo = 1, clearly distinguished from real student registrations)
    const insertStudent = db.prepare(
      `INSERT INTO students (
        student_id, full_name, email, auth_reference, password_hash, role,
        account_status, is_demo, program, batch, campus, phone,
        monthly_violation_count, current_violation_month, email_alerts, grace_reminders, created_date
      ) VALUES (?, ?, ?, ?, NULL, 'student', ?, 1, ?, ?, 'IBA Main Campus, Karachi', ?, ?, ?, 1, 1, ?)`
    );

    for (const s of DEMO_STUDENTS) {
      insertStudent.run(
        s.studentId,
        s.fullName,
        s.email,
        `AUTH-STU-${s.studentId}`,
        s.accountStatus,
        s.program,
        s.batch,
        s.phone,
        s.monthlyViolationCount,
        CURRENT_MONTH,
        createdDate
      );
    }

    // 3. Seed 30 ILS Seats (ILS-01 to ILS-30), each paired 1:1 with a simulated sensor NODE-ILS-01..NODE-ILS-30
    const insertSeat = db.prepare(
      `INSERT INTO ils_seats (
        seat_id, ils_number, zone, floor, qr_code_identifier, qr_active,
        current_status, assigned_student_id, sensor_id, sensor_connectivity,
        sensor_presence, last_sensor_event_at,
        maintenance_status, maintenance_note, has_power_outlet, has_task_lamp, has_monitor_dock
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`
    );

    for (let i = 1; i <= 30; i += 1) {
      const padded = String(i).padStart(2, '0');
      const seatId = `ILS-${padded}`;
      const preset = SEAT_ASSIGNMENTS[i] ?? { status: 'available' as const };
      const isMaint = preset.status === 'maintenance';
      const initialPresence = isMaint
        ? 'OFFLINE'
        : preset.status === 'occupied'
          ? 'PRESENT'
          : 'ABSENT';
      insertSeat.run(
        seatId,
        i,
        zoneForSeat(i),
        i <= 20 ? 'Floor 2 · North Wing' : 'Floor 2 · South Wing',
        generateSecureSeatQrToken(seatId),
        isMaint ? 0 : 1,
        preset.status,
        preset.studentId ?? null,
        `NODE-ILS-${padded}`,
        isMaint ? 'Offline' : 'Online',
        initialPresence,
        relIso(-15),
        isMaint ? 'In Maintenance' : 'Operational',
        preset.maintenanceNote ?? null,
        i > 10 && i <= 20 ? 1 : 0
      );
    }

    // 4. Seed Connected Reservations (Active, Temporarily Away with 20-min countdown, and Historical records)
    const insertRes = db.prepare(
      `INSERT INTO reservations (
        reservation_id, student_id, seat_id, start_timestamp,
        departure_timestamp, return_timestamp, expiry_timestamp, reservation_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const activeSeatRows: Array<[string, string, string, string, string | null, string | null, string, string]> = [
      ['RES-8841', '26418', 'ILS-03', relIso(-45), null, null, relIso(135), 'Active'],
      ['RES-8840', '25904', 'ILS-01', relIso(-60), null, null, relIso(120), 'Active'],
      ['RES-8839', '27112', 'ILS-05', relIso(-75), relIso(-5), null, relIso(105), 'Temporarily Away'],
      ['RES-8838', '24885', 'ILS-06', relIso(-30), null, null, relIso(90), 'Active'],
      ['RES-8837', '26731', 'ILS-10', relIso(-50), null, null, relIso(130), 'Active'],
      ['RES-8836', '27408', 'ILS-12', relIso(-20), null, null, relIso(160), 'Active'],
      ['RES-8835', '26092', 'ILS-13', relIso(-65), relIso(-9), null, relIso(115), 'Temporarily Away'],
      ['RES-8834', '25114', 'ILS-15', relIso(-40), null, null, relIso(80), 'Active'],
      ['RES-8833', '26220', 'ILS-18', relIso(-85), null, null, relIso(95), 'Active'],
      ['RES-8832', '24990', 'ILS-21', relIso(-15), null, null, relIso(105), 'Active'],
      ['RES-8831', '25841', 'ILS-23', relIso(-80), relIso(-14), null, relIso(100), 'Temporarily Away'],
      ['RES-8830', '27019', 'ILS-25', relIso(-55), null, null, relIso(125), 'Active'],
      ['RES-8829', '26505', 'ILS-28', relIso(-25), null, null, relIso(155), 'Active'],
      // Historical records demonstrating 1-to-many per student AND 1-to-many per seat
      ['RES-8812', '26418', 'ILS-14', '2026-11-23T10:00:00.000Z', '2026-11-23T11:10:00.000Z', '2026-11-23T11:25:00.000Z', '2026-11-23T13:00:00.000Z', 'Completed'],
      ['RES-8789', '26418', 'ILS-22', '2026-11-20T15:00:00.000Z', null, null, '2026-11-20T17:30:00.000Z', 'Completed'],
      ['RES-8754', '26418', 'ILS-07', '2026-11-17T11:00:00.000Z', null, null, '2026-11-17T12:00:00.000Z', 'Cancelled'],
      ['RES-8710', '26418', 'ILS-03', '2026-11-14T09:30:00.000Z', null, null, '2026-11-14T12:30:00.000Z', 'Completed'],
      ['RES-8702', '25904', 'ILS-03', '2026-11-12T13:00:00.000Z', null, null, '2026-11-12T16:00:00.000Z', 'Completed'],
      ['RES-8695', '27210', 'ILS-01', '2026-11-11T09:00:00.000Z', null, null, '2026-11-11T12:00:00.000Z', 'Completed'],
      ['RES-8680', '25672', 'ILS-14', '2026-11-10T14:00:00.000Z', null, null, '2026-11-10T16:30:00.000Z', 'Completed'],
    ];

    for (const row of activeSeatRows) {
      insertRes.run(...row);
    }

    // 5. Seed Connected Sensor Events (marked is_simulated = 1)
    const insertEvent = db.prepare(
      `INSERT INTO sensor_events (
        event_id, seat_id, sensor_id, presence_status, signal_state, event_timestamp, event_source, is_simulated, event_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );

    const seedEvents: Array<[string, string, string, string, string, string, string, string]> = [
      ['EVT-1001', 'ILS-01', 'NODE-ILS-01', 'Present', 'PRESENT', relIso(-60), 'Sensor Feed', 'DEMO / SIMULATED initial occupancy'],
      ['EVT-1002', 'ILS-03', 'NODE-ILS-03', 'Present', 'PRESENT', relIso(-45), 'Sensor Feed', 'DEMO / SIMULATED initial occupancy'],
      ['EVT-1003', 'ILS-05', 'NODE-ILS-05', 'Absent', 'ABSENT', relIso(-5), 'Sensor Feed', 'DEMO / SIMULATED departure — 20-min countdown started'],
      ['EVT-1004', 'ILS-09', 'NODE-ILS-09', 'Unknown', 'OFFLINE', relIso(-120), 'Admin Override', 'DEMO / SIMULATED offline during desk maintenance'],
      ['EVT-1005', 'ILS-13', 'NODE-ILS-13', 'Absent', 'ABSENT', relIso(-9), 'Sensor Feed', 'DEMO / SIMULATED departure — 20-min countdown started'],
      ['EVT-1006', 'ILS-20', 'NODE-ILS-20', 'Unknown', 'OFFLINE', relIso(-95), 'Admin Override', 'DEMO / SIMULATED offline during desk maintenance'],
      ['EVT-1007', 'ILS-23', 'NODE-ILS-23', 'Absent', 'ABSENT', relIso(-14), 'Sensor Feed', 'DEMO / SIMULATED departure — 20-min countdown started'],
      ['EVT-1008', 'ILS-28', 'NODE-ILS-28', 'Present', 'PRESENT', relIso(-25), 'Sensor Feed', 'DEMO / SIMULATED initial occupancy'],
    ];

    for (const ev of seedEvents) {
      insertEvent.run(...ev);
    }

    // 6. Seed Connected Violations
    const insertViolation = db.prepare(
      `INSERT INTO violations (
        violation_id, student_id, seat_id, violation_timestamp,
        calendar_month, monthly_violation_number, violation_reason, penalty_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const seedViolations: Array<[string, string, string, string, string, number, string, string]> = [
      ['VIO-409', '26418', 'ILS-08', '2026-11-10T15:45:00.000Z', CURRENT_MONTH, 1, 'Failed to return within permitted 20-minute absence period (ILS-08 released)', 'Warning'],
      ['VIO-412', '27112', 'ILS-05', '2026-11-18T11:20:00.000Z', CURRENT_MONTH, 2, 'Failed to return within permitted 20-minute absence period (ILS-05 released)', 'Fine Issued'],
      ['VIO-415', '25319', 'ILS-19', '2026-11-21T18:15:00.000Z', CURRENT_MONTH, 3, 'Failed to return within permitted 20-minute absence period (ILS-19 released)', 'Fine Issued'],
      ['VIO-401', '26731', 'ILS-10', '2026-11-05T13:10:00.000Z', CURRENT_MONTH, 1, 'Failed to return within permitted 20-minute absence period (ILS-10 released)', 'Resolved'],
      ['VIO-418', '26844', 'ILS-17', '2026-11-22T16:40:00.000Z', CURRENT_MONTH, 2, 'Failed to return within permitted 20-minute absence period (ILS-17 released)', 'Fine Issued'],
    ];

    for (const v of seedViolations) {
      insertViolation.run(...v);
    }

    // 7. Seed Connected Financial Transactions (linked to 2nd+ violations, canonical Phase 8 statuses + audit logs)
    const insertTxn = db.prepare(
      `INSERT INTO financial_transactions (
        transaction_id, student_id, violation_id, seat_id, fine_configuration_id, transaction_date,
        description, amount_pkr, payment_status, payment_reference, payment_method,
        verified_by_administrator, verified_at, waiver_reason, admin_notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const seedTxns: Array<[
      string, string, string | null, string | null, string, string,
      string, number, string, string, string | null,
      string | null, string | null, string | null, string | null, string
    ]> = [
      [
        'TXN-884', '26418', null, 'ILS-14', 'CFG-2026-01', '2026-10-19',
        'ILS Absence Violation Fine Settlement — Campus Bursar', 250, 'PAID', 'RCP-4410',
        'Bursar Cash Counter', 'IBA-LIB-014', '2026-10-19T14:20:00.000Z', null,
        'Verified against Campus Bursar receipt RCP-4410.', '2026-10-19T14:20:00.000Z',
      ],
      [
        'TXN-904', '27112', 'VIO-412', 'ILS-05', 'CFG-2026-01', '2026-11-18',
        'ILS Absence Violation Fine (ILS-05 · 2nd violation)', 250, 'UNPAID', 'REF-VIO-412',
        null, null, null, null, null, '2026-11-18T11:20:00.000Z',
      ],
      [
        'TXN-908', '25319', 'VIO-415', 'ILS-19', 'CFG-2026-01', '2026-11-21',
        'ILS Absence Violation Fine (ILS-19 · 3rd violation)', 250, 'UNPAID', 'REF-VIO-415',
        null, null, null, null, null, '2026-11-21T18:15:00.000Z',
      ],
      [
        'TXN-911', '26844', 'VIO-418', 'ILS-17', 'CFG-2026-01', '2026-11-22',
        'ILS Absence Violation Fine (ILS-17 · 2nd violation)', 250, 'UNPAID', 'REF-VIO-418',
        null, null, null, null, null, '2026-11-22T16:40:00.000Z',
      ],
      [
        'TXN-872', '25904', null, 'ILS-04', 'CFG-2026-01', '2026-10-12',
        'Administrative Grace Waiver Approved by Desk', 250, 'WAIVED', 'WVR-118',
        'Waiver Adjustment', 'IBA-LIB-014', '2026-10-12T15:05:00.000Z',
        'Approved medical emergency grace waiver by Library Operations Desk.', null, '2026-10-12T15:05:00.000Z',
      ],
    ];

    for (const tx of seedTxns) {
      insertTxn.run(...tx);
    }

    const insertSeedAudit = db.prepare(
      `INSERT INTO financial_audit_logs (
        audit_id, transaction_id, student_id, action_type, previous_status, new_status,
        amount_pkr, payment_reference, payment_method, reason, performed_by_id, performed_by_name, performed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const tx of seedTxns) {
      const [txnId, stuId, , , , txDate, desc, amt, status, ref, method, verBy, verAt, wReason] = tx;
      insertSeedAudit.run(
        `AUD-INIT-${txnId}`, txnId, stuId, 'FINE_CREATED', null, 'UNPAID',
        amt, ref, null, desc, 'SYSTEM', 'Automated Violation Policy Engine', `${txDate}T10:00:00.000Z`
      );
      if (status === 'PAID') {
        insertSeedAudit.run(
          `AUD-PAID-${txnId}`, txnId, stuId, 'PAYMENT_VERIFIED', 'UNPAID', 'PAID',
          amt, ref, method, `Verified payment receipt (${ref}) at IBA Campus Bursar.`,
          verBy ?? 'IBA-LIB-014', 'Dr. Samina Qureshi', verAt ?? `${txDate}T14:20:00.000Z`
        );
      } else if (status === 'WAIVED') {
        insertSeedAudit.run(
          `AUD-WAIV-${txnId}`, txnId, stuId, 'FINE_WAIVED', 'UNPAID', 'WAIVED',
          amt, ref, method, wReason ?? 'Approved waiver.',
          verBy ?? 'IBA-LIB-014', 'Dr. Samina Qureshi', verAt ?? `${txDate}T15:05:00.000Z`
        );
      }
    }

    // 8. Seed Connected Notifications
    const insertNotif = db.prepare(
      `INSERT INTO notifications (
        notification_id, student_id, title, message, category, created_timestamp, read_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const seedNotifs: Array<[string, string, string, string, string, string, number]> = [
      ['NTF-001', '26418', 'Active Reservation Confirmed — ILS-03', 'Your Individual Learning Space ILS-03 in Quiet Zone A is active until 17:00 today. Please return within 20 minutes if stepping away.', 'Reservation', '2026-11-25T14:00:00.000Z', 0],
      ['NTF-002', '26418', 'Extended Library Hours for Final Exams', 'Mian Muhammad Abdullah Library will operate from 08:00 to 23:00 starting December 1 across all 30 Individual Learning Spaces.', 'System', '2026-11-24T16:45:00.000Z', 0],
      ['NTF-003', '26418', 'Policy Reminder: Away Grace Period', 'Temporarily Away status holds your reserved ILS seat for up to 20 minutes before administrative reassignment.', 'Policy', '2026-11-22T11:20:00.000Z', 1],
      ['NTF-004', '26418', 'Session Completed — ILS-14', 'Thank you for checking out on time from ILS-14 (Research Zone B). Your compliance record has been updated.', 'Reservation', '2026-11-23T13:02:00.000Z', 1],
      ['NTF-005', '25904', 'Active Reservation Confirmed — ILS-01', 'Your study carrel ILS-01 in Quiet Zone A is confirmed until 16:30 today.', 'Reservation', '2026-11-25T13:30:00.000Z', 0],
      ['NTF-006', '27112', 'Temporarily Away Timer Active — ILS-05', 'Your ILS-05 reservation is currently marked Temporarily Away. Please return within 20 minutes to keep your seat.', 'Policy', '2026-11-25T14:12:00.000Z', 0],
    ];

    for (const n of seedNotifs) {
      insertNotif.run(...n);
    }

    // 9. Seed Fine Configuration linked to Administrator (20-minute absence countdown)
    db.prepare(
      `INSERT INTO fine_configurations (
        configuration_id, fine_amount_pkr, overstay_fine_per_hour_pkr,
        grace_period_minutes, max_away_minutes, max_daily_hours,
        warnings_before_restriction, effective_date, updated_by_administrator
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('CFG-2026-01', 250, 300, 15, 20, 4, 3, '2026-09-01', 'IBA-LIB-014');

    // 10. Seed System Settings
    db.prepare(
      `INSERT INTO system_settings (
        setting_id, library_name, campus_location, operating_hours_open,
        operating_hours_close, total_ils_capacity, academic_term,
        qr_rotation_cycle, allow_advance_booking, maintenance_banner_enabled
      ) VALUES (1, ?, ?, ?, ?, 30, ?, ?, 1, 0)`
    ).run(
      'IBA Digital Library – Mian Muhammad Abdullah Building',
      'University Enclave, University Road, Karachi',
      '08:30',
      '21:30',
      'Fall 2026',
      'Weekly'
    );
  });

  runSeed();
}
