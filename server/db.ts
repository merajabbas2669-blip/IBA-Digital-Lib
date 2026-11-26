import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'iba_digital_library.sqlite');
export const db = new Database(dbPath);

// Enforce strict relational integrity and WAL concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      student_id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      auth_reference TEXT NOT NULL UNIQUE,
      password_hash TEXT NULL,
      role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
      account_status TEXT NOT NULL DEFAULT 'Active' CHECK (account_status IN ('Active', 'Warning Issued', 'Restricted')),
      is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
      program TEXT NOT NULL DEFAULT 'BS Computer Science',
      batch TEXT NOT NULL DEFAULT 'Class of 2027',
      campus TEXT NOT NULL DEFAULT 'IBA Main Campus, Karachi',
      phone TEXT NOT NULL DEFAULT '',
      monthly_violation_count INTEGER NOT NULL DEFAULT 0,
      current_violation_month TEXT NOT NULL,
      email_alerts INTEGER NOT NULL DEFAULT 1 CHECK (email_alerts IN (0, 1)),
      grace_reminders INTEGER NOT NULL DEFAULT 1 CHECK (grace_reminders IN (0, 1)),
      created_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ils_seats (
      seat_id TEXT PRIMARY KEY,
      ils_number INTEGER NOT NULL UNIQUE,
      zone TEXT NOT NULL,
      floor TEXT NOT NULL,
      qr_code_identifier TEXT NOT NULL UNIQUE,
      qr_active INTEGER NOT NULL DEFAULT 1 CHECK (qr_active IN (0, 1)),
      current_status TEXT NOT NULL CHECK (current_status IN ('available', 'occupied', 'away', 'maintenance')),
      assigned_student_id TEXT NULL REFERENCES students(student_id) ON DELETE SET NULL,
      sensor_id TEXT NOT NULL UNIQUE,
      sensor_connectivity TEXT NOT NULL CHECK (sensor_connectivity IN ('Online', 'Ready', 'Offline', 'Calibrating')),
      sensor_presence TEXT NOT NULL DEFAULT 'ABSENT' CHECK (sensor_presence IN ('PRESENT', 'ABSENT', 'OFFLINE')),
      last_sensor_event_at TEXT NULL,
      maintenance_status TEXT NOT NULL CHECK (maintenance_status IN ('Operational', 'Scheduled', 'In Maintenance')),
      maintenance_note TEXT NULL,
      has_power_outlet INTEGER NOT NULL DEFAULT 1 CHECK (has_power_outlet IN (0, 1)),
      has_task_lamp INTEGER NOT NULL DEFAULT 1 CHECK (has_task_lamp IN (0, 1)),
      has_monitor_dock INTEGER NOT NULL DEFAULT 0 CHECK (has_monitor_dock IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS reservations (
      reservation_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
      seat_id TEXT NOT NULL REFERENCES ils_seats(seat_id) ON DELETE RESTRICT,
      start_timestamp TEXT NOT NULL,
      departure_timestamp TEXT NULL,
      return_timestamp TEXT NULL,
      expiry_timestamp TEXT NOT NULL,
      absence_warning_at TEXT NULL,
      absence_deadline_at TEXT NULL,
      absence_warning_sent_at TEXT NULL,
      absence_timer_mode TEXT NOT NULL DEFAULT 'production' CHECK (absence_timer_mode IN ('production', 'demo_accelerated')),
      reservation_status TEXT NOT NULL CHECK (reservation_status IN ('Active', 'Temporarily Away', 'Completed', 'Cancelled', 'Expired'))
    );

    CREATE TABLE IF NOT EXISTS sensor_events (
      event_id TEXT PRIMARY KEY,
      seat_id TEXT NOT NULL REFERENCES ils_seats(seat_id) ON DELETE RESTRICT,
      sensor_id TEXT NOT NULL,
      presence_status TEXT NOT NULL CHECK (presence_status IN ('Present', 'Absent', 'Unknown')),
      signal_state TEXT NOT NULL DEFAULT 'ABSENT' CHECK (signal_state IN ('PRESENT', 'ABSENT', 'OFFLINE')),
      event_timestamp TEXT NOT NULL,
      event_source TEXT NOT NULL CHECK (event_source IN ('System Seed', 'Admin Override', 'Student Check-In', 'Student Away', 'Student Checkout', 'Sensor Feed')),
      is_simulated INTEGER NOT NULL DEFAULT 1 CHECK (is_simulated IN (0, 1)),
      event_note TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS violations (
      violation_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
      seat_id TEXT NOT NULL REFERENCES ils_seats(seat_id) ON DELETE RESTRICT,
      reservation_id TEXT NULL REFERENCES reservations(reservation_id) ON DELETE SET NULL,
      violation_timestamp TEXT NOT NULL,
      calendar_month TEXT NOT NULL,
      monthly_violation_number INTEGER NOT NULL,
      violation_reason TEXT NOT NULL,
      penalty_status TEXT NOT NULL CHECK (penalty_status IN ('Warning', 'Fine Issued', 'Resolved', 'Waived', 'Account Hold'))
    );

    CREATE TABLE IF NOT EXISTS financial_transactions (
      transaction_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
      violation_id TEXT NULL REFERENCES violations(violation_id) ON DELETE SET NULL,
      seat_id TEXT NULL,
      fine_configuration_id TEXT NULL,
      transaction_date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_pkr INTEGER NOT NULL CHECK (amount_pkr >= 0),
      payment_status TEXT NOT NULL CHECK (payment_status IN ('UNPAID', 'PENDING', 'PAID', 'WAIVED')),
      payment_reference TEXT NOT NULL,
      payment_method TEXT NULL,
      verified_by_administrator TEXT NULL REFERENCES students(student_id) ON DELETE SET NULL,
      verified_at TEXT NULL,
      waiver_reason TEXT NULL,
      admin_notes TEXT NULL,
      gateway_provider TEXT NULL,
      gateway_transaction_id TEXT NULL,
      updated_at TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS financial_audit_logs (
      audit_id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL REFERENCES financial_transactions(transaction_id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
      action_type TEXT NOT NULL CHECK (action_type IN ('FINE_CREATED', 'MARKED_PENDING', 'PAYMENT_VERIFIED', 'FINE_WAIVED', 'REOPENED_UNPAID')),
      previous_status TEXT NULL,
      new_status TEXT NOT NULL CHECK (new_status IN ('UNPAID', 'PENDING', 'PAID', 'WAIVED')),
      amount_pkr INTEGER NOT NULL CHECK (amount_pkr >= 0),
      payment_reference TEXT NULL,
      payment_method TEXT NULL,
      reason TEXT NOT NULL,
      performed_by_id TEXT NOT NULL,
      performed_by_name TEXT NOT NULL,
      performed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      notification_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'System',
      created_timestamp TEXT NOT NULL,
      read_status INTEGER NOT NULL DEFAULT 0 CHECK (read_status IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS fine_configurations (
      configuration_id TEXT PRIMARY KEY,
      fine_amount_pkr INTEGER NOT NULL CHECK (fine_amount_pkr >= 0),
      overstay_fine_per_hour_pkr INTEGER NOT NULL CHECK (overstay_fine_per_hour_pkr >= 0),
      grace_period_minutes INTEGER NOT NULL CHECK (grace_period_minutes >= 1),
      max_away_minutes INTEGER NOT NULL CHECK (max_away_minutes >= 5),
      max_daily_hours INTEGER NOT NULL CHECK (max_daily_hours >= 1),
      warnings_before_restriction INTEGER NOT NULL CHECK (warnings_before_restriction >= 1),
      effective_date TEXT NOT NULL,
      updated_by_administrator TEXT NOT NULL REFERENCES students(student_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      setting_id INTEGER PRIMARY KEY CHECK (setting_id = 1),
      library_name TEXT NOT NULL,
      campus_location TEXT NOT NULL,
      operating_hours_open TEXT NOT NULL,
      operating_hours_close TEXT NOT NULL,
      total_ils_capacity INTEGER NOT NULL,
      academic_term TEXT NOT NULL,
      qr_rotation_cycle TEXT NOT NULL CHECK (qr_rotation_cycle IN ('Daily', 'Weekly', 'Semester')),
      allow_advance_booking INTEGER NOT NULL DEFAULT 1 CHECK (allow_advance_booking IN (0, 1)),
      maintenance_banner_enabled INTEGER NOT NULL DEFAULT 0 CHECK (maintenance_banner_enabled IN (0, 1)),
      demo_timer_enabled INTEGER NOT NULL DEFAULT 0 CHECK (demo_timer_enabled IN (0, 1)),
      last_violation_reset_month TEXT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reservations_student ON reservations(student_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_seat ON reservations(seat_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_reservation_per_student
      ON reservations(student_id)
      WHERE reservation_status IN ('Active', 'Temporarily Away');
    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_reservation_per_seat
      ON reservations(seat_id)
      WHERE reservation_status IN ('Active', 'Temporarily Away');
    CREATE INDEX IF NOT EXISTS idx_sensor_events_seat ON sensor_events(seat_id);
    CREATE INDEX IF NOT EXISTS idx_violations_student ON violations(student_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_student ON financial_transactions(student_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_violation ON financial_transactions(violation_id);
    CREATE INDEX IF NOT EXISTS idx_financial_audit_txn ON financial_audit_logs(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_financial_audit_student ON financial_audit_logs(student_id);
    CREATE INDEX IF NOT EXISTS idx_financial_audit_time ON financial_audit_logs(performed_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_student ON notifications(student_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_student ON sessions(student_id);
  `);

  // Idempotent column migrations for databases created prior to Phase 5
  const seatColumns = db
    .prepare(`PRAGMA table_info(ils_seats)`)
    .all() as Array<{ name: string }>;
  const seatColSet = new Set(seatColumns.map((c) => c.name));

  if (!seatColSet.has('sensor_presence')) {
    db.exec(`ALTER TABLE ils_seats ADD COLUMN sensor_presence TEXT NOT NULL DEFAULT 'ABSENT'`);
  }
  if (!seatColSet.has('last_sensor_event_at')) {
    db.exec(`ALTER TABLE ils_seats ADD COLUMN last_sensor_event_at TEXT NULL`);
  }

  const eventColumns = db
    .prepare(`PRAGMA table_info(sensor_events)`)
    .all() as Array<{ name: string }>;
  const eventColSet = new Set(eventColumns.map((c) => c.name));

  if (!eventColSet.has('signal_state')) {
    db.exec(`ALTER TABLE sensor_events ADD COLUMN signal_state TEXT NOT NULL DEFAULT 'ABSENT'`);
  }
  if (!eventColSet.has('is_simulated')) {
    db.exec(`ALTER TABLE sensor_events ADD COLUMN is_simulated INTEGER NOT NULL DEFAULT 1`);
  }
  if (!eventColSet.has('event_note')) {
    db.exec(`ALTER TABLE sensor_events ADD COLUMN event_note TEXT NULL`);
  }

  // Idempotent Phase 6 column migrations for persistent server-side absence management
  const resColumns = db
    .prepare(`PRAGMA table_info(reservations)`)
    .all() as Array<{ name: string }>;
  const resColSet = new Set(resColumns.map((c) => c.name));

  if (!resColSet.has('absence_warning_at')) {
    db.exec(`ALTER TABLE reservations ADD COLUMN absence_warning_at TEXT NULL`);
  }
  if (!resColSet.has('absence_deadline_at')) {
    db.exec(`ALTER TABLE reservations ADD COLUMN absence_deadline_at TEXT NULL`);
  }
  if (!resColSet.has('absence_warning_sent_at')) {
    db.exec(`ALTER TABLE reservations ADD COLUMN absence_warning_sent_at TEXT NULL`);
  }
  if (!resColSet.has('absence_timer_mode')) {
    db.exec(`ALTER TABLE reservations ADD COLUMN absence_timer_mode TEXT NOT NULL DEFAULT 'production'`);
  }

  const settingsColumns = db
    .prepare(`PRAGMA table_info(system_settings)`)
    .all() as Array<{ name: string }>;
  const settingsColSet = new Set(settingsColumns.map((c) => c.name));

  if (!settingsColSet.has('demo_timer_enabled')) {
    db.exec(`ALTER TABLE system_settings ADD COLUMN demo_timer_enabled INTEGER NOT NULL DEFAULT 0`);
  }
  if (!settingsColSet.has('last_violation_reset_month')) {
    db.exec(`ALTER TABLE system_settings ADD COLUMN last_violation_reset_month TEXT NULL`);
  }

  // Idempotent Phase 7 migrations: reservation-level violation deduplication
  const vioColumns = db
    .prepare(`PRAGMA table_info(violations)`)
    .all() as Array<{ name: string }>;
  const vioColSet = new Set(vioColumns.map((c) => c.name));

  if (!vioColSet.has('reservation_id')) {
    db.exec(`ALTER TABLE violations ADD COLUMN reservation_id TEXT NULL REFERENCES reservations(reservation_id) ON DELETE SET NULL`);
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_violation_per_reservation
      ON violations(reservation_id)
      WHERE reservation_id IS NOT NULL;
  `);

  // Idempotent Phase 8 migration: canonical payment statuses ('UNPAID', 'PENDING', 'PAID', 'WAIVED')
  // plus verification metadata, waiver reasons, and online-gateway extensibility fields
  const txnSchemaRow = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'financial_transactions'`)
    .get() as { sql: string } | undefined;

  const needsPhase8TxnRebuild =
    Boolean(txnSchemaRow) &&
    (!txnSchemaRow!.sql.includes("'PENDING'") ||
      !txnSchemaRow!.sql.includes("'PAID'") ||
      !txnSchemaRow!.sql.includes("'WAIVED'"));

  if (needsPhase8TxnRebuild) {
    const existingCols = db
      .prepare(`PRAGMA table_info(financial_transactions)`)
      .all() as Array<{ name: string }>;
    const existingColSet = new Set(existingCols.map((c) => c.name));

    const selectCol = (col: string, fallback = 'NULL') =>
      existingColSet.has(col) ? col : fallback;

    db.pragma('foreign_keys = OFF');
    try {
      const migrateTxns = db.transaction(() => {
        db.exec(`
          CREATE TABLE financial_transactions_v8 (
            transaction_id TEXT PRIMARY KEY,
            student_id TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
            violation_id TEXT NULL REFERENCES violations(violation_id) ON DELETE SET NULL,
            seat_id TEXT NULL,
            fine_configuration_id TEXT NULL,
            transaction_date TEXT NOT NULL,
            description TEXT NOT NULL,
            amount_pkr INTEGER NOT NULL CHECK (amount_pkr >= 0),
            payment_status TEXT NOT NULL CHECK (payment_status IN ('UNPAID', 'PENDING', 'PAID', 'WAIVED')),
            payment_reference TEXT NOT NULL,
            payment_method TEXT NULL,
            verified_by_administrator TEXT NULL REFERENCES students(student_id) ON DELETE SET NULL,
            verified_at TEXT NULL,
            waiver_reason TEXT NULL,
            admin_notes TEXT NULL,
            gateway_provider TEXT NULL,
            gateway_transaction_id TEXT NULL,
            updated_at TEXT NULL
          );

          INSERT INTO financial_transactions_v8 (
            transaction_id, student_id, violation_id, seat_id, fine_configuration_id,
            transaction_date, description, amount_pkr, payment_status, payment_reference,
            payment_method, verified_by_administrator, verified_at, waiver_reason,
            admin_notes, gateway_provider, gateway_transaction_id, updated_at
          )
          SELECT
            transaction_id,
            student_id,
            violation_id,
            ${selectCol('seat_id')},
            ${selectCol('fine_configuration_id')},
            transaction_date,
            description,
            amount_pkr,
            CASE UPPER(payment_status)
              WHEN 'PAID' THEN 'PAID'
              WHEN 'WAIVED' THEN 'WAIVED'
              WHEN 'PENDING' THEN 'PENDING'
              ELSE 'UNPAID'
            END,
            payment_reference,
            ${selectCol('payment_method')},
            ${selectCol('verified_by_administrator')},
            ${selectCol('verified_at')},
            ${selectCol('waiver_reason')},
            ${selectCol('admin_notes')},
            ${selectCol('gateway_provider')},
            ${selectCol('gateway_transaction_id')},
            ${selectCol('updated_at')}
          FROM financial_transactions;

          DROP TABLE financial_transactions;
          ALTER TABLE financial_transactions_v8 RENAME TO financial_transactions;

          CREATE INDEX IF NOT EXISTS idx_transactions_student ON financial_transactions(student_id);
          CREATE INDEX IF NOT EXISTS idx_transactions_violation ON financial_transactions(violation_id);
        `);
      });
      migrateTxns();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  } else {
    const txnCols = db
      .prepare(`PRAGMA table_info(financial_transactions)`)
      .all() as Array<{ name: string }>;
    const txnColSet = new Set(txnCols.map((c) => c.name));
    const optionalCols: Array<[string, string]> = [
      ['seat_id', 'TEXT NULL'],
      ['fine_configuration_id', 'TEXT NULL'],
      ['payment_method', 'TEXT NULL'],
      ['verified_by_administrator', 'TEXT NULL REFERENCES students(student_id) ON DELETE SET NULL'],
      ['verified_at', 'TEXT NULL'],
      ['waiver_reason', 'TEXT NULL'],
      ['admin_notes', 'TEXT NULL'],
      ['gateway_provider', 'TEXT NULL'],
      ['gateway_transaction_id', 'TEXT NULL'],
      ['updated_at', 'TEXT NULL'],
    ];
    for (const [col, def] of optionalCols) {
      if (!txnColSet.has(col)) {
        db.exec(`ALTER TABLE financial_transactions ADD COLUMN ${col} ${def}`);
      }
    }
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_txn_per_violation
      ON financial_transactions(violation_id)
      WHERE violation_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS admin_intervention_logs (
      intervention_id TEXT PRIMARY KEY,
      category TEXT NOT NULL CHECK (category IN (
        'SEAT_RELEASE',
        'SEAT_MAINTENANCE',
        'SEAT_STATUS_OVERRIDE',
        'VIOLATION_CORRECTION',
        'STUDENT_STATUS_CHANGE'
      )),
      target_id TEXT NOT NULL,
      seat_id TEXT NULL,
      student_id TEXT NULL,
      previous_state TEXT NULL,
      new_state TEXT NOT NULL,
      reason TEXT NOT NULL,
      performed_by_id TEXT NOT NULL,
      performed_by_name TEXT NOT NULL,
      performed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_admin_interventions_time ON admin_intervention_logs(performed_at);
    CREATE INDEX IF NOT EXISTS idx_admin_interventions_seat ON admin_intervention_logs(seat_id);
    CREATE INDEX IF NOT EXISTS idx_admin_interventions_student ON admin_intervention_logs(student_id);
  `);

  // Idempotent Phase 9 migrations: fine_configurations warning & reset policy fields + violation review notes
  const fineCfgCols = db
    .prepare(`PRAGMA table_info(fine_configurations)`)
    .all() as Array<{ name: string }>;
  const fineCfgColSet = new Set(fineCfgCols.map((c) => c.name));

  if (!fineCfgColSet.has('warning_after_minutes')) {
    db.exec(`ALTER TABLE fine_configurations ADD COLUMN warning_after_minutes INTEGER NOT NULL DEFAULT 15`);
  }
  if (!fineCfgColSet.has('monthly_reset_enabled')) {
    db.exec(`ALTER TABLE fine_configurations ADD COLUMN monthly_reset_enabled INTEGER NOT NULL DEFAULT 1`);
  }
  if (!fineCfgColSet.has('first_violation_warning_only')) {
    db.exec(`ALTER TABLE fine_configurations ADD COLUMN first_violation_warning_only INTEGER NOT NULL DEFAULT 1`);
  }

  const vioColsPhase9 = db
    .prepare(`PRAGMA table_info(violations)`)
    .all() as Array<{ name: string }>;
  const vioColSetPhase9 = new Set(vioColsPhase9.map((c) => c.name));

  if (!vioColSetPhase9.has('review_note')) {
    db.exec(`ALTER TABLE violations ADD COLUMN review_note TEXT NULL`);
  }
  if (!vioColSetPhase9.has('reviewed_by_administrator')) {
    db.exec(`ALTER TABLE violations ADD COLUMN reviewed_by_administrator TEXT NULL`);
  }
  if (!vioColSetPhase9.has('reviewed_at')) {
    db.exec(`ALTER TABLE violations ADD COLUMN reviewed_at TEXT NULL`);
  }
}

