import { StudentProfile } from '../types/ils';

export type AnalyticsDatePreset = 'today' | 'week' | 'month' | 'custom';

export interface AnalyticsDateRange {
  preset: AnalyticsDatePreset;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  label: string;
  daysCount: number;
}

export type OccupancyVerificationStatus =
  | 'Verified Present'
  | 'Verified (Short Break)'
  | 'Partial — Away Gap';

export type TimePeriodBucket = 'Morning' | 'Afternoon' | 'Evening';

export interface DemoOccupancySession {
  id: string;
  studentErp: string;
  studentName: string;
  studentProgram: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 = Sun .. 6 = Sat
  seatId: string; // ILS-01 .. ILS-30
  startHour: number; // 8..20
  startMinute: number;
  startTime: string; // e.g., 09:15 AM
  endTime: string; // e.g., 11:45 AM
  confirmedMinutes: number;
  confirmedHours: number;
  period: TimePeriodBucket;
  verificationStatus: OccupancyVerificationStatus;
}

export interface StudentAnalyticsComputation {
  range: AnalyticsDateRange;
  kpis: {
    todayHours: number;
    weeklyHours: number;
    monthlyHours: number;
    totalVisits: number;
    avgSessionMinutes: number;
    mostFrequentSeat: string;
    mostFrequentSeatVisits: number;
    rangeTotalHours: number;
  };
  weeklyOccupancy: Array<{
    day: string;
    fullDay: string;
    hours: number;
    visits: number;
  }>;
  monthlyTrend: Array<{
    label: string;
    date: string;
    hours: number;
    visits: number;
  }>;
  visitFrequency: Array<{
    day: string;
    fullDay: string;
    visits: number;
    hours: number;
  }>;
  usageDistribution: Array<{
    name: TimePeriodBucket;
    window: string;
    hours: number;
    percentage: number;
    sessions: number;
    color: string;
  }>;
  insights: {
    mostActiveDay: string;
    mostActiveDayHours: number;
    mostFrequentSeat: string;
    mostFrequentSeatHours: number;
    averageDailyHours: number;
    weekDeltaPct: number;
    weekDeltaHours: number;
    prevWeekHours: number;
    monthDeltaPct: number;
    monthDeltaHours: number;
    prevMonthHours: number;
  };
  recentSessions: DemoOccupancySession[];
}

export interface AdminStudentDirectoryItem {
  erpId: string;
  name: string;
  program: string;
  batch: string;
  status: string;
}

export interface IndividualStudentAnalyticsReport {
  student: AdminStudentDirectoryItem;
  weeklyHours: number;
  monthlyHours: number;
  rangeHours: number;
  totalVisits: number;
  avgSessionMinutes: number;
  mostUsedSeat: string;
  mostUsedSeatVisits: number;
  verifiedRatePct: number;
  sessions: DemoOccupancySession[];
}

export interface AdminAnalyticsComputation {
  range: AnalyticsDateRange;
  overview: {
    totalStudents: number;
    totalIlsSeats: number;
    totalConfirmedHours: number;
    totalVisits: number;
    averageDailyHours: number;
    overallUtilizationPct: number;
    hoursDeltaPct: number;
    visitsDeltaPct: number;
  };
  dailyLibraryOccupancy: Array<{
    label: string;
    date: string;
    hours: number;
    visits: number;
    utilizationPct: number;
  }>;
  weeklyOccupancyTrend: Array<{
    week: string;
    hours: number;
    avgDailyHours: number;
    visits: number;
  }>;
  monthlyOccupancyTrend: Array<{
    month: string;
    hours: number;
    visits: number;
    utilizationPct: number;
  }>;
  mostUsedSeats: Array<{
    seatId: string;
    zone: string;
    hours: number;
    visits: number;
    utilizationPct: number;
  }>;
  peakUsageHours: Array<{
    hourLabel: string;
    hour: number;
    avgActiveSeats: number;
    confirmedHours: number;
    isPeak: boolean;
  }>;
  studentVisitTrends: Array<{
    label: string;
    date: string;
    visits: number;
    uniqueStudents: number;
  }>;
  directory: AdminStudentDirectoryItem[];
}

/* ---------- Date Utilities (Local Calendar Safe) ---------- */

export function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => Number(n));
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function addDays(iso: string, delta: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + delta);
  return toIsoDate(d);
}

export function diffDaysInclusive(startIso: string, endIso: string): number {
  const start = parseIsoDate(startIso).getTime();
  const end = parseIsoDate(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 1;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

export function formatShortDate(iso: string): string {
  const d = parseIsoDate(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatLongDate(iso: string): string {
  const d = parseIsoDate(iso);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatHours(hours: number): string {
  return `${hours.toFixed(1)} hrs`;
}

export function formatMinutesAsDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0m';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h 00m`;
  return `${mins}m`;
}

function formatClock12(totalMinutesFromMidnight: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutesFromMidnight));
  const h24 = Math.floor(clamped / 60);
  const m = clamped % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function getTodayIso(): string {
  return toIsoDate(new Date());
}

export function getStartOfCurrentWeekIso(todayIso: string): string {
  const d = parseIsoDate(todayIso);
  // Monday-based week
  const day = d.getDay(); // 0=Sun, 1=Mon
  const offsetToMon = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offsetToMon);
  return toIsoDate(d);
}

export function getDateRangeForPreset(
  preset: AnalyticsDatePreset,
  customStart?: string,
  customEnd?: string
): AnalyticsDateRange {
  const todayIso = getTodayIso();

  if (preset === 'today') {
    return {
      preset,
      startDate: todayIso,
      endDate: todayIso,
      label: `Today (${formatShortDate(todayIso)})`,
      daysCount: 1,
    };
  }

  if (preset === 'week') {
    const start = addDays(todayIso, -6);
    return {
      preset,
      startDate: start,
      endDate: todayIso,
      label: `This Week (${formatShortDate(start)} – ${formatShortDate(todayIso)})`,
      daysCount: 7,
    };
  }

  if (preset === 'month') {
    const start = addDays(todayIso, -29);
    return {
      preset,
      startDate: start,
      endDate: todayIso,
      label: `Last 30 Days (${formatShortDate(start)} – ${formatShortDate(todayIso)})`,
      daysCount: 30,
    };
  }

  const fallbackStart = addDays(todayIso, -13);
  let start = customStart && /^\d{4}-\d{2}-\d{2}$/.test(customStart) ? customStart : fallbackStart;
  let end = customEnd && /^\d{4}-\d{2}-\d{2}$/.test(customEnd) ? customEnd : todayIso;
  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }
  return {
    preset: 'custom',
    startDate: start,
    endDate: end,
    label: `${formatShortDate(start)} – ${formatShortDate(end)}`,
    daysCount: diffDaysInclusive(start, end),
  };
}

/* ---------- Deterministic PRNG for Coherent Demo Data ---------- */

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRng(seedStr: string): () => number {
  let a = hashString(seedStr) || 123456789;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seatZoneForNumber(num: number): string {
  if (num <= 10) return 'Quiet Zone A';
  if (num <= 20) return 'Research Zone B';
  return 'Focus Zone C';
}

function padSeatId(num: number): string {
  return `ILS-${String(Math.max(1, Math.min(30, num))).padStart(2, '0')}`;
}

/* ---------- Fallback Demo Student Cohort (Combined With Live Students) ---------- */

const SUPPLEMENTAL_DEMO_STUDENTS: AdminStudentDirectoryItem[] = [
  { erpId: '24811', name: 'Ayaan Siddiqui', program: 'BS Computer Science', batch: 'Class of 2026', status: 'Active' },
  { erpId: '25104', name: 'Zoya Rehman', program: 'BBA', batch: 'Class of 2027', status: 'Active' },
  { erpId: '24390', name: 'Hamza Tariq', program: 'BS Economics & Math', batch: 'Class of 2026', status: 'Active' },
  { erpId: '25618', name: 'Mariam Farooq', program: 'BS Accounting & Finance', batch: 'Class of 2027', status: 'Active' },
  { erpId: '23942', name: 'Bilal Qureshi', program: 'BS Computer Science', batch: 'Class of 2025', status: 'Active' },
  { erpId: '26015', name: 'Hira Mansoor', program: 'BS Social Sciences', batch: 'Class of 2028', status: 'Active' },
  { erpId: '24557', name: 'Saad Nadeem', program: 'BBA', batch: 'Class of 2026', status: 'Active' },
  { erpId: '25882', name: 'Noor-ul-Ain Kazmi', program: 'BS Data Science', batch: 'Class of 2027', status: 'Active' },
  { erpId: '24129', name: 'Usman Jahangir', program: 'BS Economics', batch: 'Class of 2026', status: 'Active' },
  { erpId: '25331', name: 'Alizeh Kamran', program: 'BS Computer Science', batch: 'Class of 2027', status: 'Active' },
  { erpId: '24705', name: 'Danish Memon', program: 'BS Accounting & Finance', batch: 'Class of 2026', status: 'Active' },
  { erpId: '25940', name: 'Maham Sohail', program: 'BBA', batch: 'Class of 2028', status: 'Active' },
];

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_FULL = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

function jsDayToMonIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

/* ---------- Per-Student Deterministic 75-Day Demo Session Generator ---------- */

export function generateDemoSessionsForStudent(
  student: { erpId: string; name: string; program: string },
  daysBack = 75
): DemoOccupancySession[] {
  const todayIso = getTodayIso();
  const rng = createRng(`iba-ils-demo-v1-${student.erpId}`);

  // Student-specific realistic study profile
  const favSeatNum = 1 + Math.floor(rng() * 30);
  const secondarySeatNum = 1 + ((favSeatNum + 3 + Math.floor(rng() * 8)) % 30);
  const tertiarySeatNum = 1 + ((favSeatNum + 11 + Math.floor(rng() * 7)) % 30);

  // Preferred time-of-day affinity
  const morningWeight = 0.25 + rng() * 0.35;
  const afternoonWeight = 0.35 + rng() * 0.3;
  const baseAttendanceProb = 0.62 + rng() * 0.22; // 62%..84% on weekdays

  const sessions: DemoOccupancySession[] = [];
  let seq = 1;

  for (let offset = daysBack; offset >= 0; offset--) {
    const dateIso = addDays(todayIso, -offset);
    const d = parseIsoDate(dateIso);
    const jsDay = d.getDay();
    const isSunday = jsDay === 0;
    const isSaturday = jsDay === 6;

    // Slight upward trend over recent weeks for realistic positive/varied comparisons
    const recencyBoost = offset <= 14 ? 0.08 : offset <= 30 ? 0.03 : -0.02;
    const dayProb = isSunday
      ? 0.28
      : isSaturday
        ? 0.52
        : Math.min(0.95, baseAttendanceProb + recencyBoost);

    // Guarantee today has at least 1 realistic session for rich "Today" filter display
    const mustIncludeToday = offset === 0;
    const attendsToday = mustIncludeToday || rng() < dayProb;
    if (!attendsToday) continue;

    // 1 or 2 sessions on active study days
    const sessionCount =
      mustIncludeToday ? (rng() < 0.45 ? 2 : 1) : !isSunday && rng() < 0.34 ? 2 : 1;

    const usedSlots: number[] = [];

    for (let s = 0; s < sessionCount; s++) {
      // Pick period
      const roll = rng();
      let period: TimePeriodBucket;
      if (s === 1 && usedSlots.length > 0) {
        // Avoid overlapping the first slot
        period = usedSlots[0] < 12 ? (rng() < 0.65 ? 'Afternoon' : 'Evening') : 'Evening';
      } else if (roll < morningWeight) {
        period = 'Morning';
      } else if (roll < morningWeight + afternoonWeight) {
        period = 'Afternoon';
      } else {
        period = 'Evening';
      }

      let startHour: number;
      if (period === 'Morning') {
        startHour = 8 + Math.floor(rng() * 4); // 8,9,10,11
      } else if (period === 'Afternoon') {
        startHour = 12 + Math.floor(rng() * 5); // 12..16
      } else {
        startHour = 17 + Math.floor(rng() * 3); // 17,18,19
      }

      // Prevent overlap with previous session on the same day
      if (usedSlots.some((h) => Math.abs(h - startHour) < 3)) {
        startHour = Math.min(19, Math.max(usedSlots[0] + 3, 16));
        period = startHour < 12 ? 'Morning' : startHour < 17 ? 'Afternoon' : 'Evening';
      }
      usedSlots.push(startHour);

      const startMinute = [0, 10, 15, 20, 30, 40, 45][Math.floor(rng() * 7)];
      const rawDuration = 65 + Math.floor(rng() * 145); // 65..210 mins
      // Cap so sessions end by 21:45
      const startTotal = startHour * 60 + startMinute;
      const maxAllowable = Math.max(50, 21 * 60 + 45 - startTotal);
      const confirmedMinutes = Math.min(rawDuration, maxAllowable);
      const endTotal = startTotal + confirmedMinutes;

      // Seat selection biased heavily toward favorite seat
      const seatRoll = rng();
      const seatNum =
        seatRoll < 0.44
          ? favSeatNum
          : seatRoll < 0.68
            ? secondarySeatNum
            : seatRoll < 0.82
              ? tertiarySeatNum
              : 1 + Math.floor(rng() * 30);

      const statusRoll = rng();
      const verificationStatus: OccupancyVerificationStatus =
        statusRoll < 0.78
          ? 'Verified Present'
          : statusRoll < 0.94
            ? 'Verified (Short Break)'
            : 'Partial — Away Gap';

      sessions.push({
        id: `DEMO-${student.erpId}-${String(seq++).padStart(4, '0')}`,
        studentErp: student.erpId,
        studentName: student.name,
        studentProgram: student.program,
        date: dateIso,
        dayOfWeek: jsDay,
        seatId: padSeatId(seatNum),
        startHour,
        startMinute,
        startTime: formatClock12(startTotal),
        endTime: formatClock12(endTotal),
        confirmedMinutes,
        confirmedHours: Number((confirmedMinutes / 60).toFixed(2)),
        period,
        verificationStatus,
      });
    }
  }

  // Sort newest first
  return sessions.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.startHour * 60 + b.startMinute - (a.startHour * 60 + a.startMinute);
  });
}

/* ---------- Student Analytics Aggregator ---------- */

export function computeStudentAnalytics(
  student: Pick<StudentProfile, 'erpId' | 'name' | 'program'>,
  range: AnalyticsDateRange
): StudentAnalyticsComputation {
  const allSessions = generateDemoSessionsForStudent(student, 75);
  const todayIso = getTodayIso();
  const weekStartIso = addDays(todayIso, -6);
  const prevWeekStartIso = addDays(todayIso, -13);
  const prevWeekEndIso = addDays(todayIso, -7);
  const monthStartIso = addDays(todayIso, -29);
  const prevMonthStartIso = addDays(todayIso, -59);
  const prevMonthEndIso = addDays(todayIso, -30);

  const inRange = allSessions.filter(
    (s) => s.date >= range.startDate && s.date <= range.endDate
  );

  const sumHours = (list: DemoOccupancySession[]) =>
    Number(list.reduce((acc, s) => acc + s.confirmedMinutes / 60, 0).toFixed(1));

  const todayHours = sumHours(allSessions.filter((s) => s.date === todayIso));
  const weeklyHours = sumHours(
    allSessions.filter((s) => s.date >= weekStartIso && s.date <= todayIso)
  );
  const prevWeekHours = sumHours(
    allSessions.filter((s) => s.date >= prevWeekStartIso && s.date <= prevWeekEndIso)
  );
  const monthlyHours = sumHours(
    allSessions.filter((s) => s.date >= monthStartIso && s.date <= todayIso)
  );
  const prevMonthHours = sumHours(
    allSessions.filter((s) => s.date >= prevMonthStartIso && s.date <= prevMonthEndIso)
  );

  const rangeTotalHours = sumHours(inRange);
  const totalVisits = inRange.length;
  const avgSessionMinutes =
    totalVisits > 0
      ? Math.round(inRange.reduce((acc, s) => acc + s.confirmedMinutes, 0) / totalVisits)
      : 0;

  // Seat frequency inside selected range (fallback to 30-day window if range empty)
  const seatSource = inRange.length > 0 ? inRange : allSessions.filter((s) => s.date >= monthStartIso);
  const seatCounts = new Map<string, { visits: number; minutes: number }>();
  for (const s of seatSource) {
    const cur = seatCounts.get(s.seatId) ?? { visits: 0, minutes: 0 };
    cur.visits += 1;
    cur.minutes += s.confirmedMinutes;
    seatCounts.set(s.seatId, cur);
  }

  let mostFrequentSeat = 'ILS-05';
  let mostFrequentSeatVisits = 0;
  let mostFrequentSeatHours = 0;
  for (const [seatId, info] of seatCounts.entries()) {
    if (
      info.visits > mostFrequentSeatVisits ||
      (info.visits === mostFrequentSeatVisits && info.minutes > mostFrequentSeatHours * 60)
    ) {
      mostFrequentSeat = seatId;
      mostFrequentSeatVisits = info.visits;
      mostFrequentSeatHours = Number((info.minutes / 60).toFixed(1));
    }
  }

  // 1. Weekly Occupancy Chart (Mon–Sun)
  // If user selected 'today', show the current week context so Mon–Sun bar chart stays insightful;
  // otherwise aggregate sessions within the selected date range by weekday.
  const weekdaySource =
    range.preset === 'today'
      ? allSessions.filter((s) => s.date >= weekStartIso && s.date <= todayIso)
      : inRange;

  const weeklyBuckets = WEEKDAY_SHORT.map((day, idx) => ({
    day,
    fullDay: WEEKDAY_FULL[idx],
    minutes: 0,
    visits: 0,
  }));

  for (const s of weekdaySource) {
    const idx = jsDayToMonIndex(s.dayOfWeek);
    weeklyBuckets[idx].minutes += s.confirmedMinutes;
    weeklyBuckets[idx].visits += 1;
  }

  const weeklyOccupancy = weeklyBuckets.map((b) => ({
    day: b.day,
    fullDay: b.fullDay,
    hours: Number((b.minutes / 60).toFixed(1)),
    visits: b.visits,
  }));

  const visitFrequency = weeklyBuckets.map((b) => ({
    day: b.day,
    fullDay: b.fullDay,
    visits: b.visits,
    hours: Number((b.minutes / 60).toFixed(1)),
  }));

  // Most active day from weekdayBuckets
  let mostActiveIdx = 0;
  for (let i = 1; i < weeklyBuckets.length; i++) {
    if (weeklyBuckets[i].minutes > weeklyBuckets[mostActiveIdx].minutes) {
      mostActiveIdx = i;
    }
  }

  // 2. Monthly Occupancy Trend (Line chart across 30 days or selected custom range)
  const trendEnd = range.preset === 'today' ? todayIso : range.endDate;
  const trendStart =
    range.preset === 'today' || range.preset === 'week'
      ? addDays(trendEnd, -29)
      : range.startDate;
  const trendDays = Math.min(60, diffDaysInclusive(trendStart, trendEnd));

  const byDate = new Map<string, { minutes: number; visits: number }>();
  for (const s of allSessions) {
    if (s.date >= trendStart && s.date <= trendEnd) {
      const cur = byDate.get(s.date) ?? { minutes: 0, visits: 0 };
      cur.minutes += s.confirmedMinutes;
      cur.visits += 1;
      byDate.set(s.date, cur);
    }
  }

  const monthlyTrend: StudentAnalyticsComputation['monthlyTrend'] = [];
  for (let i = 0; i < trendDays; i++) {
    const iso = addDays(trendStart, i);
    const rec = byDate.get(iso);
    monthlyTrend.push({
      label: formatShortDate(iso),
      date: iso,
      hours: rec ? Number((rec.minutes / 60).toFixed(1)) : 0,
      visits: rec ? rec.visits : 0,
    });
  }

  // 4. Usage Distribution Donut (Morning / Afternoon / Evening)
  const periodMeta: Array<{ name: TimePeriodBucket; window: string; color: string }> = [
    { name: 'Morning', window: '08:00 – 12:00', color: '#315EF2' },
    { name: 'Afternoon', window: '12:00 – 17:00', color: '#19B6A4' },
    { name: 'Evening', window: '17:00 – 22:00', color: '#101C3A' },
  ];

  const periodTotals = new Map<TimePeriodBucket, { minutes: number; sessions: number }>();
  for (const m of periodMeta) periodTotals.set(m.name, { minutes: 0, sessions: 0 });
  for (const s of inRange) {
    const cur = periodTotals.get(s.period)!;
    cur.minutes += s.confirmedMinutes;
    cur.sessions += 1;
  }

  const totalPeriodMinutes = Array.from(periodTotals.values()).reduce(
    (sum, item) => sum + item.minutes,
    0
  );

  const usageDistribution = periodMeta.map((m) => {
    const rec = periodTotals.get(m.name)!;
    const hours = Number((rec.minutes / 60).toFixed(1));
    const percentage =
      totalPeriodMinutes > 0 ? Math.round((rec.minutes / totalPeriodMinutes) * 100) : 0;
    return {
      name: m.name,
      window: m.window,
      hours,
      percentage,
      sessions: rec.sessions,
      color: m.color,
    };
  });

  // Period comparisons
  const weekDeltaHours = Number((weeklyHours - prevWeekHours).toFixed(1));
  const weekDeltaPct =
    prevWeekHours > 0 ? Math.round(((weeklyHours - prevWeekHours) / prevWeekHours) * 100) : 0;
  const monthDeltaHours = Number((monthlyHours - prevMonthHours).toFixed(1));
  const monthDeltaPct =
    prevMonthHours > 0 ? Math.round(((monthlyHours - prevMonthHours) / prevMonthHours) * 100) : 0;

  const averageDailyHours = Number((rangeTotalHours / Math.max(1, range.daysCount)).toFixed(1));

  return {
    range,
    kpis: {
      todayHours,
      weeklyHours,
      monthlyHours,
      totalVisits,
      avgSessionMinutes,
      mostFrequentSeat,
      mostFrequentSeatVisits,
      rangeTotalHours,
    },
    weeklyOccupancy,
    monthlyTrend,
    visitFrequency,
    usageDistribution,
    insights: {
      mostActiveDay: WEEKDAY_FULL[mostActiveIdx],
      mostActiveDayHours: Number((weeklyBuckets[mostActiveIdx].minutes / 60).toFixed(1)),
      mostFrequentSeat,
      mostFrequentSeatHours,
      averageDailyHours,
      weekDeltaPct,
      weekDeltaHours,
      prevWeekHours,
      monthDeltaPct,
      monthDeltaHours,
      prevMonthHours,
    },
    recentSessions: inRange.slice(0, 20),
  };
}

/* ---------- Administrator Analytics Cohort & Aggregator ---------- */

export function buildAdminAnalyticsDirectory(
  liveStudents: StudentProfile[]
): AdminStudentDirectoryItem[] {
  const seen = new Set<string>();
  const merged: AdminStudentDirectoryItem[] = [];

  for (const s of liveStudents) {
    if (!seen.has(s.erpId)) {
      seen.add(s.erpId);
      merged.push({
        erpId: s.erpId,
        name: s.name,
        program: s.program,
        batch: s.batch,
        status: s.status,
      });
    }
  }

  for (const demo of SUPPLEMENTAL_DEMO_STUDENTS) {
    if (!seen.has(demo.erpId)) {
      seen.add(demo.erpId);
      merged.push(demo);
    }
  }

  return merged;
}

// Cache generated demo sessions per student ERP so switching filters/searches stays instant
const studentSessionCache = new Map<string, DemoOccupancySession[]>();

function getCachedStudentSessions(student: AdminStudentDirectoryItem): DemoOccupancySession[] {
  const key = `${student.erpId}-${getTodayIso()}`;
  const cached = studentSessionCache.get(key);
  if (cached) return cached;
  const generated = generateDemoSessionsForStudent(student, 120);
  studentSessionCache.set(key, generated);
  return generated;
}

export function computeIndividualStudentReport(
  student: AdminStudentDirectoryItem,
  range: AnalyticsDateRange
): IndividualStudentAnalyticsReport {
  const all = getCachedStudentSessions(student);
  const todayIso = getTodayIso();
  const weekStart = addDays(todayIso, -6);
  const monthStart = addDays(todayIso, -29);

  const inRange = all.filter((s) => s.date >= range.startDate && s.date <= range.endDate);
  const weeklyHours = Number(
    all
      .filter((s) => s.date >= weekStart && s.date <= todayIso)
      .reduce((acc, s) => acc + s.confirmedMinutes / 60, 0)
      .toFixed(1)
  );
  const monthlyHours = Number(
    all
      .filter((s) => s.date >= monthStart && s.date <= todayIso)
      .reduce((acc, s) => acc + s.confirmedMinutes / 60, 0)
      .toFixed(1)
  );
  const rangeHours = Number(
    inRange.reduce((acc, s) => acc + s.confirmedMinutes / 60, 0).toFixed(1)
  );
  const totalVisits = inRange.length;
  const avgSessionMinutes =
    totalVisits > 0
      ? Math.round(inRange.reduce((acc, s) => acc + s.confirmedMinutes, 0) / totalVisits)
      : 0;

  const seatFreq = new Map<string, number>();
  const freqSource = inRange.length > 0 ? inRange : all.filter((s) => s.date >= monthStart);
  for (const s of freqSource) {
    seatFreq.set(s.seatId, (seatFreq.get(s.seatId) ?? 0) + 1);
  }
  let mostUsedSeat = 'ILS-04';
  let mostUsedSeatVisits = 0;
  for (const [seat, count] of seatFreq.entries()) {
    if (count > mostUsedSeatVisits) {
      mostUsedSeat = seat;
      mostUsedSeatVisits = count;
    }
  }

  const verifiedCount = inRange.filter(
    (s) => s.verificationStatus !== 'Partial — Away Gap'
  ).length;
  const verifiedRatePct =
    totalVisits > 0 ? Math.round((verifiedCount / totalVisits) * 100) : 100;

  return {
    student,
    weeklyHours,
    monthlyHours,
    rangeHours,
    totalVisits,
    avgSessionMinutes,
    mostUsedSeat,
    mostUsedSeatVisits,
    verifiedRatePct,
    sessions: inRange.slice(0, 25),
  };
}

export function computeAdminAnalytics(
  liveStudents: StudentProfile[],
  totalIlsSeats: number,
  range: AnalyticsDateRange
): AdminAnalyticsComputation {
  const directory = buildAdminAnalyticsDirectory(liveStudents);
  const seatsCount = Math.max(1, totalIlsSeats || 30);
  const operatingHoursPerDay = 13; // 08:30–21:30 IBA Digital Library hours

  // Collect all cohort demo sessions (plus scaled realistic campus traffic multiplier)
  // Scale factor simulates broader IBA student body activity beyond the searchable roster
  const campusScale = 3.2;
  const cohortSessions: DemoOccupancySession[] = [];
  for (const st of directory) {
    cohortSessions.push(...getCachedStudentSessions(st));
  }

  const inRange = cohortSessions.filter(
    (s) => s.date >= range.startDate && s.date <= range.endDate
  );

  // Previous equivalent range for delta calculation
  const prevEnd = addDays(range.startDate, -1);
  const prevStart = addDays(prevEnd, -(range.daysCount - 1));
  const prevRange = cohortSessions.filter((s) => s.date >= prevStart && s.date <= prevEnd);

  const rawRangeHours = inRange.reduce((acc, s) => acc + s.confirmedMinutes / 60, 0);
  const rawPrevHours = prevRange.reduce((acc, s) => acc + s.confirmedMinutes / 60, 0);

  const totalConfirmedHours = Number((rawRangeHours * campusScale).toFixed(1));
  const prevConfirmedHours = Number((rawPrevHours * campusScale).toFixed(1));
  const totalVisits = Math.round(inRange.length * campusScale);
  const prevVisits = Math.round(prevRange.length * campusScale);
  const averageDailyHours = Number(
    (totalConfirmedHours / Math.max(1, range.daysCount)).toFixed(1)
  );

  const maxCapacityHours = seatsCount * operatingHoursPerDay * Math.max(1, range.daysCount);
  const overallUtilizationPct = Math.min(
    96,
    Math.round((totalConfirmedHours / Math.max(1, maxCapacityHours)) * 100)
  );

  const hoursDeltaPct =
    prevConfirmedHours > 0
      ? Math.round(((totalConfirmedHours - prevConfirmedHours) / prevConfirmedHours) * 100)
      : 6;
  const visitsDeltaPct =
    prevVisits > 0 ? Math.round(((totalVisits - prevVisits) / prevVisits) * 100) : 4;

  // 1. Daily Library Occupancy & 6. Student Visit Trends (across selected range or last 14 days if Today)
  const dailyEnd = range.endDate;
  const dailyStart = range.preset === 'today' ? addDays(dailyEnd, -13) : range.startDate;
  const dailyCount = Math.min(45, diffDaysInclusive(dailyStart, dailyEnd));

  const dayMap = new Map<
    string,
    { minutes: number; visits: number; students: Set<string> }
  >();
  for (const s of cohortSessions) {
    if (s.date >= dailyStart && s.date <= dailyEnd) {
      let entry = dayMap.get(s.date);
      if (!entry) {
        entry = { minutes: 0, visits: 0, students: new Set<string>() };
        dayMap.set(s.date, entry);
      }
      entry.minutes += s.confirmedMinutes;
      entry.visits += 1;
      entry.students.add(s.studentErp);
    }
  }

  const dailyLibraryOccupancy: AdminAnalyticsComputation['dailyLibraryOccupancy'] = [];
  const studentVisitTrends: AdminAnalyticsComputation['studentVisitTrends'] = [];

  for (let i = 0; i < dailyCount; i++) {
    const iso = addDays(dailyStart, i);
    const rec = dayMap.get(iso);
    const hours = rec ? Number(((rec.minutes / 60) * campusScale).toFixed(1)) : 0;
    const visits = rec ? Math.round(rec.visits * campusScale) : 0;
    const uniqueStudents = rec ? Math.round(rec.students.size * campusScale) : 0;
    const utilizationPct = Math.min(
      98,
      Math.round((hours / (seatsCount * operatingHoursPerDay)) * 100)
    );

    dailyLibraryOccupancy.push({
      label: formatShortDate(iso),
      date: iso,
      hours,
      visits,
      utilizationPct,
    });
    studentVisitTrends.push({
      label: formatShortDate(iso),
      date: iso,
      visits,
      uniqueStudents,
    });
  }

  // 2. Weekly Occupancy Trend (Last 8 Weeks)
  const todayIso = getTodayIso();
  const weeklyOccupancyTrend: AdminAnalyticsComputation['weeklyOccupancyTrend'] = [];
  for (let w = 7; w >= 0; w--) {
    const wEnd = addDays(todayIso, -w * 7);
    const wStart = addDays(wEnd, -6);
    const wSessions = cohortSessions.filter((s) => s.date >= wStart && s.date <= wEnd);
    const wHours = Number(
      (wSessions.reduce((acc, s) => acc + s.confirmedMinutes / 60, 0) * campusScale).toFixed(1)
    );
    const wVisits = Math.round(wSessions.length * campusScale);
    weeklyOccupancyTrend.push({
      week: `Wk ${formatShortDate(wStart)}`,
      hours: wHours,
      avgDailyHours: Number((wHours / 7).toFixed(1)),
      visits: wVisits,
    });
  }

  // 3. Monthly Occupancy Trend (Last 4 Calendar Months synthesized cleanly)
  const monthBuckets = new Map<string, { label: string; hours: number; visits: number; days: number }>();
  const nowDate = parseIsoDate(todayIso);
  const monthKeys: string[] = [];
  for (let m = 3; m >= 0; m--) {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - m, 1, 12, 0, 0);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const daysInMonth =
      m === 0
        ? nowDate.getDate()
        : new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    monthKeys.push(key);
    monthBuckets.set(key, { label, hours: 0, visits: 0, days: Math.max(1, daysInMonth) });
  }

  for (const s of cohortSessions) {
    const key = s.date.slice(0, 7);
    const bucket = monthBuckets.get(key);
    if (bucket) {
      bucket.hours += (s.confirmedMinutes / 60) * campusScale;
      bucket.visits += campusScale;
    }
  }

  const monthlyOccupancyTrend = monthKeys.map((key) => {
    const b = monthBuckets.get(key)!;
    const hours = Number(b.hours.toFixed(1));
    const visits = Math.round(b.visits);
    const utilizationPct = Math.min(
      96,
      Math.round((hours / (seatsCount * operatingHoursPerDay * b.days)) * 100)
    );
    return {
      month: b.label,
      hours,
      visits,
      utilizationPct,
    };
  });

  // 4. Most-Used ILS Seats (Top 10 across selected range)
  const seatTotals = new Map<string, { minutes: number; visits: number }>();
  for (let i = 1; i <= seatsCount; i++) {
    seatTotals.set(padSeatId(i), { minutes: 0, visits: 0 });
  }
  for (const s of inRange) {
    const rec = seatTotals.get(s.seatId);
    if (rec) {
      rec.minutes += s.confirmedMinutes;
      rec.visits += 1;
    }
  }

  const mostUsedSeats = Array.from(seatTotals.entries())
    .map(([seatId, rec]) => {
      const seatNum = Number(seatId.replace('ILS-', '')) || 1;
      const hours = Number(((rec.minutes / 60) * campusScale).toFixed(1));
      const visits = Math.round(rec.visits * campusScale);
      const utilizationPct = Math.min(
        98,
        Math.round((hours / (operatingHoursPerDay * Math.max(1, range.daysCount))) * 100)
      );
      return {
        seatId,
        zone: seatZoneForNumber(seatNum),
        hours,
        visits,
        utilizationPct,
      };
    })
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 10);

  // 5. Peak Library Usage Hours (08:00 through 21:00)
  const hourAccum = new Map<number, number>();
  for (let h = 8; h <= 21; h++) hourAccum.set(h, 0);

  for (const s of inRange) {
    const startDec = s.startHour + s.startMinute / 60;
    const endDec = startDec + s.confirmedMinutes / 60;
    for (let h = 8; h <= 21; h++) {
      const overlap = Math.max(0, Math.min(endDec, h + 1) - Math.max(startDec, h));
      if (overlap > 0) {
        hourAccum.set(h, (hourAccum.get(h) ?? 0) + overlap * campusScale);
      }
    }
  }

  const rawPeakRows = Array.from(hourAccum.entries()).map(([hour, confirmedHours]) => {
    const avgActiveSeats = Math.min(
      seatsCount,
      Number((confirmedHours / Math.max(1, range.daysCount)).toFixed(1))
    );
    const label12 =
      hour === 12
        ? '12 PM'
        : hour > 12
          ? `${hour - 12} PM`
          : `${hour} AM`;
    return {
      hour,
      hourLabel: label12,
      avgActiveSeats,
      confirmedHours: Number(confirmedHours.toFixed(1)),
    };
  });

  const maxSeatAvg = Math.max(1, ...rawPeakRows.map((r) => r.avgActiveSeats));
  const peakUsageHours = rawPeakRows.map((r) => ({
    ...r,
    isPeak: r.avgActiveSeats >= maxSeatAvg * 0.78,
  }));

  return {
    range,
    overview: {
      totalStudents: Math.max(directory.length, Math.round(directory.length * campusScale)),
      totalIlsSeats: seatsCount,
      totalConfirmedHours,
      totalVisits,
      averageDailyHours,
      overallUtilizationPct,
      hoursDeltaPct,
      visitsDeltaPct,
    },
    dailyLibraryOccupancy,
    weeklyOccupancyTrend,
    monthlyOccupancyTrend,
    mostUsedSeats,
    peakUsageHours,
    studentVisitTrends,
    directory,
  };
}
