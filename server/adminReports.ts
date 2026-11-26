import crypto from 'node:crypto';
import { db } from './db.ts';
import { getKarachiCalendarMonth, getKarachiDateString } from './violationPolicy.ts';

export type AdminInterventionCategory =
  | 'SEAT_RELEASE'
  | 'SEAT_MAINTENANCE'
  | 'SEAT_STATUS_OVERRIDE'
  | 'VIOLATION_CORRECTION'
  | 'STUDENT_STATUS_CHANGE';

export interface AdminInterventionLogRow {
  intervention_id: string;
  category: AdminInterventionCategory;
  target_id: string;
  seat_id: string | null;
  student_id: string | null;
  student_name?: string | null;
  previous_state: string | null;
  new_state: string;
  reason: string;
  performed_by_id: string;
  performed_by_name: string;
  performed_at: string;
}

export function sanitizeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  const trimmedStart = str.replace(/^[\u0000-\u001F]+/, '');
  const safe = /^[=+\-@\t\r]/.test(trimmedStart) ? `'${str}` : str;
  const escaped = safe.replace(/"/g, '""');
  return `"${escaped}"`;
}

function getKarachiDateFromIso(iso: string): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return getKarachiDateString(d);
}

function getKarachiMonthFromIso(iso: string): string {
  const dateStr = getKarachiDateFromIso(iso);
  return dateStr.slice(0, 7);
}

export function recordAdminInterventionInTx(params: {
  category: AdminInterventionCategory;
  targetId: string;
  seatId?: string | null;
  studentId?: string | null;
  previousState?: string | null;
  newState: string;
  reason: string;
  performedById: string;
  performedByName: string;
  performedAt?: string;
}): string {
  const nowIso = params.performedAt ?? new Date().toISOString();
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  const interventionId = `INT-${Date.now()}-${suffix}`;

  db.prepare(
    `INSERT INTO admin_intervention_logs (
      intervention_id, category, target_id, seat_id, student_id,
      previous_state, new_state, reason, performed_by_id, performed_by_name, performed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    interventionId,
    params.category,
    params.targetId,
    params.seatId ?? null,
    params.studentId ?? null,
    params.previousState ?? null,
    params.newState,
    params.reason.trim().slice(0, 400),
    params.performedById,
    params.performedByName,
    nowIso
  );

  return interventionId;
}

export function fetchAdminInterventions(limit = 100) {
  const rows = db
    .prepare(
      `SELECT l.*, u.full_name AS student_name
       FROM admin_intervention_logs l
       LEFT JOIN students u ON u.student_id = l.student_id
       ORDER BY l.performed_at DESC
       LIMIT ?`
    )
    .all(limit) as AdminInterventionLogRow[];

  return rows.map((r) => ({
    id: r.intervention_id,
    category: r.category,
    targetId: r.target_id,
    seatId: r.seat_id ?? undefined,
    studentErp: r.student_id ?? undefined,
    studentName: r.student_name ?? undefined,
    previousState: r.previous_state ?? undefined,
    newState: r.new_state,
    reason: r.reason,
    performedById: r.performed_by_id,
    performedByName: r.performed_by_name,
    performedAt: r.performed_at,
  }));
}

export function computeAdminOverviewMetrics(
  seats: Array<{
    id: string;
    zone: string;
    status: 'available' | 'occupied' | 'away' | 'maintenance';
    sensorState?: string;
    sensorPresence?: string;
  }>
) {
  const todayKarachi = getKarachiDateString();
  const currentMonthKarachi = getKarachiCalendarMonth();

  const totalSeats = seats.length;
  const availableSeats = seats.filter((s) => s.status === 'available').length;
  const occupiedSeats = seats.filter((s) => s.status === 'occupied').length;
  const awaySeats = seats.filter((s) => s.status === 'away').length;
  const maintenanceSeats = seats.filter((s) => s.status === 'maintenance').length;

  const studentCounts = db
    .prepare(
      `SELECT
         COUNT(*) AS total_students,
         SUM(CASE WHEN account_status = 'Active' THEN 1 ELSE 0 END) AS active_students
       FROM students
       WHERE role = 'student'`
    )
    .get() as { total_students: number; active_students: number | null };

  const allReservations = db
    .prepare(
      `SELECT reservation_id, seat_id, student_id, start_timestamp, expiry_timestamp, reservation_status
       FROM reservations`
    )
    .all() as Array<{
    reservation_id: string;
    seat_id: string;
    student_id: string;
    start_timestamp: string;
    expiry_timestamp: string;
    reservation_status: string;
  }>;

  let reservationsToday = 0;
  let expiredReservationsToday = 0;

  // Build last 7 days utilization buckets (in Asia/Karachi calendar days)
  const dailyMap = new Map<
    string,
    { date: string; totalReservations: number; completed: number; expired: number; activeOrAway: number }
  >();
  const now = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const key = getKarachiDateString(d);
    dailyMap.set(key, {
      date: key,
      totalReservations: 0,
      completed: 0,
      expired: 0,
      activeOrAway: 0,
    });
  }

  for (const r of allReservations) {
    const startDay = getKarachiDateFromIso(r.start_timestamp);
    const expDay = getKarachiDateFromIso(r.expiry_timestamp);
    if (startDay === todayKarachi) {
      reservationsToday += 1;
    }
    if (r.reservation_status === 'Expired' && (expDay === todayKarachi || startDay === todayKarachi)) {
      expiredReservationsToday += 1;
    }

    const bucket = dailyMap.get(startDay);
    if (bucket) {
      bucket.totalReservations += 1;
      if (r.reservation_status === 'Completed') bucket.completed += 1;
      else if (r.reservation_status === 'Expired') bucket.expired += 1;
      else if (r.reservation_status === 'Active' || r.reservation_status === 'Temporarily Away') {
        bucket.activeOrAway += 1;
      }
    }
  }

  const monthlyViolationsRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM violations WHERE calendar_month = ?`)
    .get(currentMonthKarachi) as { cnt: number };

  const allTransactions = db
    .prepare(
      `SELECT transaction_date, amount_pkr, payment_status FROM financial_transactions`
    )
    .all() as Array<{
    transaction_date: string;
    amount_pkr: number;
    payment_status: string;
  }>;

  let monthlyFinesGeneratedPkr = 0;
  let outstandingBalancesPkr = 0;
  const monthlyFinMap = new Map<
    string,
    {
      month: string;
      generatedPkr: number;
      collectedPkr: number;
      waivedPkr: number;
      outstandingPkr: number;
      transactionsCount: number;
    }
  >();

  for (const txn of allTransactions) {
    const month = getKarachiMonthFromIso(txn.transaction_date);
    const status = String(txn.payment_status).toUpperCase();
    if (month === currentMonthKarachi) {
      monthlyFinesGeneratedPkr += txn.amount_pkr;
    }
    if (status === 'UNPAID' || status === 'PENDING') {
      outstandingBalancesPkr += txn.amount_pkr;
    }

    let m = monthlyFinMap.get(month);
    if (!m) {
      m = {
        month,
        generatedPkr: 0,
        collectedPkr: 0,
        waivedPkr: 0,
        outstandingPkr: 0,
        transactionsCount: 0,
      };
      monthlyFinMap.set(month, m);
    }
    m.generatedPkr += txn.amount_pkr;
    m.transactionsCount += 1;
    if (status === 'PAID') m.collectedPkr += txn.amount_pkr;
    else if (status === 'WAIVED') m.waivedPkr += txn.amount_pkr;
    else m.outstandingPkr += txn.amount_pkr;
  }

  if (!monthlyFinMap.has(currentMonthKarachi)) {
    monthlyFinMap.set(currentMonthKarachi, {
      month: currentMonthKarachi,
      generatedPkr: 0,
      collectedPkr: 0,
      waivedPkr: 0,
      outstandingPkr: 0,
      transactionsCount: 0,
    });
  }

  const zoneNames = ['Quiet Zone A', 'Research Zone B', 'Focus Zone C'];
  const zoneUtilization = zoneNames.map((zone) => {
    const zoneSeats = seats.filter((s) => s.zone === zone);
    const total = zoneSeats.length;
    const occupied = zoneSeats.filter((s) => s.status === 'occupied').length;
    const away = zoneSeats.filter((s) => s.status === 'away').length;
    const available = zoneSeats.filter((s) => s.status === 'available').length;
    const maintenance = zoneSeats.filter((s) => s.status === 'maintenance').length;
    const utilizationPct = total > 0 ? Math.round(((occupied + away) / total) * 100) : 0;
    return { zone, total, occupied, away, available, maintenance, utilizationPct };
  });

  const monthlyFinancialSeries = Array.from(monthlyFinMap.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);

  return {
    asOfDateKarachi: todayKarachi,
    currentMonthKarachi,
    totalSeats,
    availableSeats,
    occupiedSeats,
    awaySeats,
    maintenanceSeats,
    totalStudentsCount: studentCounts.total_students ?? 0,
    activeStudentsCount: studentCounts.active_students ?? 0,
    reservationsToday,
    expiredReservationsToday,
    monthlyViolations: monthlyViolationsRow?.cnt ?? 0,
    monthlyFinesGeneratedPkr,
    outstandingBalancesPkr,
    dailyUtilizationSeries: Array.from(dailyMap.values()),
    monthlyFinancialSeries,
    zoneUtilization,
  };
}

export type AdminReportType =
  | 'daily-utilization'
  | 'monthly-utilization'
  | 'student-reservations'
  | 'monthly-violations'
  | 'monthly-fines'
  | 'outstanding-balances';

export function buildAdminReportsData(filterMonth?: string) {
  const cleanMonth =
    filterMonth && /^\d{4}-\d{2}$/.test(filterMonth.trim()) ? filterMonth.trim() : '';

  const totalSeatsRow = db.prepare(`SELECT COUNT(*) AS cnt FROM ils_seats`).get() as { cnt: number };
  const totalCapacity = Math.max(1, totalSeatsRow?.cnt ?? 30);

  const reservations = db
    .prepare(
      `SELECT
         r.reservation_id,
         r.student_id,
         u.full_name AS student_name,
         u.program AS student_program,
         r.seat_id,
         s.zone,
         r.start_timestamp,
         r.departure_timestamp,
         r.return_timestamp,
         r.expiry_timestamp,
         r.reservation_status
       FROM reservations r
       INNER JOIN students u ON u.student_id = r.student_id
       INNER JOIN ils_seats s ON s.seat_id = r.seat_id
       ORDER BY r.start_timestamp DESC`
    )
    .all() as Array<{
    reservation_id: string;
    student_id: string;
    student_name: string;
    student_program: string;
    seat_id: string;
    zone: string;
    start_timestamp: string;
    departure_timestamp: string | null;
    return_timestamp: string | null;
    expiry_timestamp: string;
    reservation_status: string;
  }>;

  const filteredReservations = cleanMonth
    ? reservations.filter((r) => getKarachiMonthFromIso(r.start_timestamp) === cleanMonth)
    : reservations;

  // 1. Daily Seat Utilization
  const dailyMap = new Map<
    string,
    {
      date: string;
      totalBookings: number;
      uniqueSeatsSet: Set<string>;
      uniqueStudentsSet: Set<string>;
      activeOrAway: number;
      completed: number;
      expired: number;
      cancelled: number;
      totalMinutes: number;
    }
  >();

  // 2. Monthly Seat Utilization
  const monthlyUtilMap = new Map<
    string,
    {
      month: string;
      totalBookings: number;
      uniqueSeatsSet: Set<string>;
      uniqueStudentsSet: Set<string>;
      completed: number;
      expired: number;
      cancelled: number;
      totalMinutes: number;
    }
  >();

  for (const r of reservations) {
    const dateKey = getKarachiDateFromIso(r.start_timestamp);
    const monthKey = dateKey.slice(0, 7);
    const startMs = new Date(r.start_timestamp).getTime();
    const endMs = new Date(r.expiry_timestamp).getTime();
    const durMin =
      !Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs
        ? Math.min(480, Math.round((endMs - startMs) / 60000))
        : 120;

    if (!cleanMonth || monthKey === cleanMonth) {
      let day = dailyMap.get(dateKey);
      if (!day) {
        day = {
          date: dateKey,
          totalBookings: 0,
          uniqueSeatsSet: new Set(),
          uniqueStudentsSet: new Set(),
          activeOrAway: 0,
          completed: 0,
          expired: 0,
          cancelled: 0,
          totalMinutes: 0,
        };
        dailyMap.set(dateKey, day);
      }
      day.totalBookings += 1;
      day.uniqueSeatsSet.add(r.seat_id);
      day.uniqueStudentsSet.add(r.student_id);
      day.totalMinutes += durMin;
      if (r.reservation_status === 'Completed') day.completed += 1;
      else if (r.reservation_status === 'Expired') day.expired += 1;
      else if (r.reservation_status === 'Cancelled') day.cancelled += 1;
      else day.activeOrAway += 1;
    }

    let m = monthlyUtilMap.get(monthKey);
    if (!m) {
      m = {
        month: monthKey,
        totalBookings: 0,
        uniqueSeatsSet: new Set(),
        uniqueStudentsSet: new Set(),
        completed: 0,
        expired: 0,
        cancelled: 0,
        totalMinutes: 0,
      };
      monthlyUtilMap.set(monthKey, m);
    }
    m.totalBookings += 1;
    m.uniqueSeatsSet.add(r.seat_id);
    m.uniqueStudentsSet.add(r.student_id);
    m.totalMinutes += durMin;
    if (r.reservation_status === 'Completed') m.completed += 1;
    else if (r.reservation_status === 'Expired') m.expired += 1;
    else if (r.reservation_status === 'Cancelled') m.cancelled += 1;
  }

  const dailySeatUtilization = Array.from(dailyMap.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((d) => ({
      date: d.date,
      totalBookings: d.totalBookings,
      uniqueSeatsUsed: d.uniqueSeatsSet.size,
      uniqueStudents: d.uniqueStudentsSet.size,
      seatCoveragePct: Math.min(100, Math.round((d.uniqueSeatsSet.size / totalCapacity) * 100)),
      activeOrAway: d.activeOrAway,
      completed: d.completed,
      expired: d.expired,
      cancelled: d.cancelled,
      totalStudyHours: Number((d.totalMinutes / 60).toFixed(1)),
    }));

  const monthlySeatUtilization = Array.from(monthlyUtilMap.values())
    .sort((a, b) => b.month.localeCompare(a.month))
    .map((m) => ({
      month: m.month,
      totalBookings: m.totalBookings,
      uniqueSeatsUsed: m.uniqueSeatsSet.size,
      uniqueStudents: m.uniqueStudentsSet.size,
      seatCoveragePct: Math.min(100, Math.round((m.uniqueSeatsSet.size / totalCapacity) * 100)),
      completed: m.completed,
      expired: m.expired,
      cancelled: m.cancelled,
      expiryRatePct: m.totalBookings > 0 ? Math.round((m.expired / m.totalBookings) * 100) : 0,
      totalStudyHours: Number((m.totalMinutes / 60).toFixed(1)),
    }));

  // 3. Student Reservation History
  const studentReservationHistory = filteredReservations.map((r) => {
    const startMs = new Date(r.start_timestamp).getTime();
    const endMs = new Date(r.expiry_timestamp).getTime();
    const durationMinutes =
      !Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs
        ? Math.round((endMs - startMs) / 60000)
        : 120;
    return {
      reservationId: r.reservation_id,
      date: getKarachiDateFromIso(r.start_timestamp),
      studentErp: r.student_id,
      studentName: r.student_name,
      program: r.student_program,
      seatId: r.seat_id,
      zone: r.zone,
      startTimestamp: r.start_timestamp,
      departureTimestamp: r.departure_timestamp ?? undefined,
      expiryTimestamp: r.expiry_timestamp,
      durationMinutes,
      status: r.reservation_status,
    };
  });

  // 4. Monthly Violation Reports
  const violations = db
    .prepare(
      `SELECT
         v.violation_id,
         v.student_id,
         u.full_name AS student_name,
         v.seat_id,
         v.calendar_month,
         v.monthly_violation_number,
         v.penalty_status,
         COALESCE(ft.amount_pkr, 0) AS fine_pkr
       FROM violations v
       INNER JOIN students u ON u.student_id = v.student_id
       LEFT JOIN financial_transactions ft ON ft.violation_id = v.violation_id
       ORDER BY v.calendar_month DESC, v.violation_timestamp DESC`
    )
    .all() as Array<{
    violation_id: string;
    student_id: string;
    student_name: string;
    seat_id: string;
    calendar_month: string;
    monthly_violation_number: number;
    penalty_status: string;
    fine_pkr: number;
  }>;

  const monthlyVioMap = new Map<
    string,
    {
      month: string;
      totalViolations: number;
      warningsOnly: number;
      finesIssued: number;
      resolved: number;
      waived: number;
      uniqueStudentsSet: Set<string>;
      totalFinesPkr: number;
    }
  >();

  for (const v of violations) {
    let row = monthlyVioMap.get(v.calendar_month);
    if (!row) {
      row = {
        month: v.calendar_month,
        totalViolations: 0,
        warningsOnly: 0,
        finesIssued: 0,
        resolved: 0,
        waived: 0,
        uniqueStudentsSet: new Set(),
        totalFinesPkr: 0,
      };
      monthlyVioMap.set(v.calendar_month, row);
    }
    row.totalViolations += 1;
    row.uniqueStudentsSet.add(v.student_id);
    row.totalFinesPkr += v.fine_pkr ?? 0;
    if (v.penalty_status === 'Warning') row.warningsOnly += 1;
    else if (v.penalty_status === 'Resolved') row.resolved += 1;
    else if (v.penalty_status === 'Waived') row.waived += 1;
    else row.finesIssued += 1;
  }

  const monthlyViolationReports = Array.from(monthlyVioMap.values())
    .filter((m) => !cleanMonth || m.month === cleanMonth)
    .sort((a, b) => b.month.localeCompare(a.month))
    .map((m) => ({
      month: m.month,
      totalViolations: m.totalViolations,
      warningsOnly: m.warningsOnly,
      finesIssued: m.finesIssued,
      resolved: m.resolved,
      waived: m.waived,
      uniqueStudents: m.uniqueStudentsSet.size,
      totalFinesPkr: m.totalFinesPkr,
    }));

  // 5. Monthly Fine Reports
  const transactions = db
    .prepare(
      `SELECT
         ft.transaction_id,
         ft.student_id,
         u.full_name AS student_name,
         u.program,
         u.account_status,
         u.monthly_violation_count,
         ft.transaction_date,
         ft.amount_pkr,
         ft.payment_status
       FROM financial_transactions ft
       INNER JOIN students u ON u.student_id = ft.student_id
       ORDER BY ft.transaction_date DESC`
    )
    .all() as Array<{
    transaction_id: string;
    student_id: string;
    student_name: string;
    program: string;
    account_status: string;
    monthly_violation_count: number;
    transaction_date: string;
    amount_pkr: number;
    payment_status: string;
  }>;

  const monthlyFineMap = new Map<
    string,
    {
      month: string;
      transactionsCount: number;
      totalGeneratedPkr: number;
      collectedPkr: number;
      waivedPkr: number;
      unpaidPkr: number;
      pendingPkr: number;
      outstandingPkr: number;
    }
  >();

  for (const t of transactions) {
    const month = getKarachiMonthFromIso(t.transaction_date);
    const status = String(t.payment_status).toUpperCase();
    let row = monthlyFineMap.get(month);
    if (!row) {
      row = {
        month,
        transactionsCount: 0,
        totalGeneratedPkr: 0,
        collectedPkr: 0,
        waivedPkr: 0,
        unpaidPkr: 0,
        pendingPkr: 0,
        outstandingPkr: 0,
      };
      monthlyFineMap.set(month, row);
    }
    row.transactionsCount += 1;
    row.totalGeneratedPkr += t.amount_pkr;
    if (status === 'PAID') row.collectedPkr += t.amount_pkr;
    else if (status === 'WAIVED') row.waivedPkr += t.amount_pkr;
    else if (status === 'PENDING') {
      row.pendingPkr += t.amount_pkr;
      row.outstandingPkr += t.amount_pkr;
    } else {
      row.unpaidPkr += t.amount_pkr;
      row.outstandingPkr += t.amount_pkr;
    }
  }

  const monthlyFineReports = Array.from(monthlyFineMap.values())
    .filter((m) => !cleanMonth || m.month === cleanMonth)
    .sort((a, b) => b.month.localeCompare(a.month))
    .map((m) => {
      const collectible = Math.max(0, m.totalGeneratedPkr - m.waivedPkr);
      const collectionRatePct =
        collectible > 0 ? Math.round((m.collectedPkr / collectible) * 100) : 100;
      return {
        ...m,
        collectionRatePct,
      };
    });

  // 6. Outstanding Balance Reports (per-student balances)
  const outstandingRows = db
    .prepare(
      `SELECT
         u.student_id,
         u.full_name,
         u.email,
         u.program,
         u.account_status,
         u.monthly_violation_count,
         COALESCE(SUM(ft.amount_pkr), 0) AS total_generated_pkr,
         COALESCE(SUM(CASE WHEN UPPER(ft.payment_status) = 'PAID' THEN ft.amount_pkr ELSE 0 END), 0) AS total_paid_pkr,
         COALESCE(SUM(CASE WHEN UPPER(ft.payment_status) = 'WAIVED' THEN ft.amount_pkr ELSE 0 END), 0) AS total_waived_pkr,
         COALESCE(SUM(CASE WHEN UPPER(ft.payment_status) = 'UNPAID' THEN ft.amount_pkr ELSE 0 END), 0) AS unpaid_pkr,
         COALESCE(SUM(CASE WHEN UPPER(ft.payment_status) = 'PENDING' THEN ft.amount_pkr ELSE 0 END), 0) AS pending_pkr,
         SUM(CASE WHEN UPPER(ft.payment_status) IN ('UNPAID', 'PENDING') THEN 1 ELSE 0 END) AS open_txns,
         MAX(CASE WHEN UPPER(ft.payment_status) IN ('UNPAID', 'PENDING') THEN ft.transaction_date ELSE NULL END) AS latest_due_date
       FROM students u
       INNER JOIN financial_transactions ft ON ft.student_id = u.student_id
       WHERE u.role = 'student'
       GROUP BY u.student_id
       HAVING (unpaid_pkr + pending_pkr) > 0
       ORDER BY (unpaid_pkr + pending_pkr) DESC, u.student_id ASC`
    )
    .all() as Array<{
    student_id: string;
    full_name: string;
    email: string;
    program: string;
    account_status: string;
    monthly_violation_count: number;
    total_generated_pkr: number;
    total_paid_pkr: number;
    total_waived_pkr: number;
    unpaid_pkr: number;
    pending_pkr: number;
    open_txns: number;
    latest_due_date: string | null;
  }>;

  const outstandingBalanceReports = outstandingRows.map((row) => ({
    studentErp: row.student_id,
    studentName: row.full_name,
    email: row.email,
    program: row.program,
    accountStatus: row.account_status,
    monthlyViolationCount: row.monthly_violation_count,
    openTransactionsCount: row.open_txns,
    unpaidPkr: row.unpaid_pkr,
    pendingPkr: row.pending_pkr,
    outstandingBalancePkr: row.unpaid_pkr + row.pending_pkr,
    totalPaidPkr: row.total_paid_pkr,
    totalWaivedPkr: row.total_waived_pkr,
    totalGeneratedPkr: row.total_generated_pkr,
    latestDueDate: row.latest_due_date ?? '—',
  }));

  // Available months selector list
  const monthSet = new Set<string>([getKarachiCalendarMonth()]);
  for (const m of monthlyUtilMap.keys()) if (m) monthSet.add(m);
  for (const m of monthlyVioMap.keys()) if (m) monthSet.add(m);
  for (const m of monthlyFineMap.keys()) if (m) monthSet.add(m);

  return {
    generatedAt: new Date().toISOString(),
    filterMonth: cleanMonth || 'ALL',
    availableMonths: Array.from(monthSet).sort((a, b) => b.localeCompare(a)),
    dailySeatUtilization,
    monthlySeatUtilization,
    studentReservationHistory,
    monthlyViolationReports,
    monthlyFineReports,
    outstandingBalanceReports,
  };
}

export function exportAdminReportCsv(
  type: AdminReportType,
  filterMonth?: string
): { filename: string; csv: string } {
  const reports = buildAdminReportsData(filterMonth);
  const dateTag = getKarachiDateString();
  const monthSuffix = reports.filterMonth !== 'ALL' ? `-${reports.filterMonth}` : '';

  let headers: string[] = [];
  let rows: unknown[][] = [];

  if (type === 'daily-utilization') {
    headers = [
      'Date (PKT)',
      'Total Bookings',
      'Unique ILS Seats Used',
      'Seat Coverage (%)',
      'Unique Students',
      'Active / Away',
      'Completed',
      'Expired',
      'Cancelled',
      'Total Study Hours',
    ];
    rows = reports.dailySeatUtilization.map((r) => [
      r.date,
      r.totalBookings,
      r.uniqueSeatsUsed,
      r.seatCoveragePct,
      r.uniqueStudents,
      r.activeOrAway,
      r.completed,
      r.expired,
      r.cancelled,
      r.totalStudyHours,
    ]);
  } else if (type === 'monthly-utilization') {
    headers = [
      'Calendar Month',
      'Total Bookings',
      'Unique ILS Seats Used',
      'Seat Coverage (%)',
      'Unique Students',
      'Completed',
      'Expired',
      'Cancelled',
      'Expiry Rate (%)',
      'Total Study Hours',
    ];
    rows = reports.monthlySeatUtilization.map((r) => [
      r.month,
      r.totalBookings,
      r.uniqueSeatsUsed,
      r.seatCoveragePct,
      r.uniqueStudents,
      r.completed,
      r.expired,
      r.cancelled,
      r.expiryRatePct,
      r.totalStudyHours,
    ]);
  } else if (type === 'student-reservations') {
    headers = [
      'Reservation ID',
      'Date (PKT)',
      'Student ERP',
      'Student Name',
      'Program',
      'ILS Seat',
      'Zone',
      'Start Timestamp',
      'Departure Timestamp',
      'Expiry Timestamp',
      'Duration (Minutes)',
      'Status',
    ];
    rows = reports.studentReservationHistory.map((r) => [
      r.reservationId,
      r.date,
      r.studentErp,
      r.studentName,
      r.program,
      r.seatId,
      r.zone,
      r.startTimestamp,
      r.departureTimestamp ?? '—',
      r.expiryTimestamp,
      r.durationMinutes,
      r.status,
    ]);
  } else if (type === 'monthly-violations') {
    headers = [
      'Calendar Month',
      'Total Violations',
      'Warnings Only',
      'Fines Issued (Open)',
      'Resolved',
      'Waived',
      'Unique Students',
      'Total Fines Generated (PKR)',
    ];
    rows = reports.monthlyViolationReports.map((r) => [
      r.month,
      r.totalViolations,
      r.warningsOnly,
      r.finesIssued,
      r.resolved,
      r.waived,
      r.uniqueStudents,
      r.totalFinesPkr,
    ]);
  } else if (type === 'monthly-fines') {
    headers = [
      'Calendar Month',
      'Transactions Count',
      'Total Fines Generated (PKR)',
      'Collected / Paid (PKR)',
      'Waived (PKR)',
      'Unpaid (PKR)',
      'Pending Verification (PKR)',
      'Outstanding Balance (PKR)',
      'Collection Rate (%)',
    ];
    rows = reports.monthlyFineReports.map((r) => [
      r.month,
      r.transactionsCount,
      r.totalGeneratedPkr,
      r.collectedPkr,
      r.waivedPkr,
      r.unpaidPkr,
      r.pendingPkr,
      r.outstandingPkr,
      r.collectionRatePct,
    ]);
  } else {
    headers = [
      'Student ERP',
      'Student Name',
      'Email',
      'Program',
      'Account Status',
      'Monthly Violation Count',
      'Open Transactions',
      'Unpaid (PKR)',
      'Pending Verification (PKR)',
      'Outstanding Balance (PKR)',
      'Total Paid (PKR)',
      'Total Waived (PKR)',
      'Latest Due Date',
    ];
    rows = reports.outstandingBalanceReports.map((r) => [
      r.studentErp,
      r.studentName,
      r.email,
      r.program,
      r.accountStatus,
      r.monthlyViolationCount,
      r.openTransactionsCount,
      r.unpaidPkr,
      r.pendingPkr,
      r.outstandingBalancePkr,
      r.totalPaidPkr,
      r.totalWaivedPkr,
      r.latestDueDate,
    ]);
  }

  const lines = [
    headers.map(sanitizeCsvCell).join(','),
    ...rows.map((row) => row.map(sanitizeCsvCell).join(',')),
  ];

  return {
    filename: `iba-ils-${type}${monthSuffix}-${dateTag}.csv`,
    csv: lines.join('\r\n'),
  };
}
