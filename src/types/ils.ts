export type UserRole = 'student' | 'admin';

export type SeatStatus = 'available' | 'occupied' | 'away' | 'maintenance';

export type SensorPresenceState = 'PRESENT' | 'ABSENT' | 'OFFLINE';

export type AbsenceTimerMode = 'production' | 'demo_accelerated';

export type SeatZone = 'Quiet Zone A' | 'Research Zone B' | 'Focus Zone C';

export type StudentRoute =
  | 'dashboard'
  | 'book'
  | 'my-reservation'
  | 'analytics'
  | 'notifications'
  | 'history'
  | 'violations'
  | 'ledger'
  | 'profile';

export type AdminRoute =
  | 'overview'
  | 'live-seats'
  | 'qr-codes'
  | 'students'
  | 'reservations'
  | 'sensors'
  | 'violations'
  | 'financials'
  | 'analytics'
  | 'reports'
  | 'penalties'
  | 'settings';

export interface ILSSeat {
  id: string; // e.g., "ILS-01"
  number: number; // 1..30
  zone: SeatZone;
  floor: string;
  status: SeatStatus;
  hasPowerOutlet: boolean;
  hasTaskLamp: boolean;
  hasMonitorDock: boolean;
  qrCodeToken: string;
  qrActive: boolean;
  sensorNodeId: string;
  sensorState: 'Online' | 'Ready' | 'Offline' | 'Calibrating';
  sensorPresence?: SensorPresenceState;
  lastSensorEventAt?: string;
  maintenanceStatus?: 'Operational' | 'Scheduled' | 'In Maintenance';
  occupantErp?: string;
  occupantName?: string;
  reservationStartTime?: string;
  reservedUntil?: string;
  reservationDurationMinutes?: number;
  awaySince?: string;
  departureTimestamp?: string;
  gracePeriodMinutes?: number;
  graceExpiresAt?: string;
  absenceWarningAt?: string;
  absenceWarningSentAt?: string;
  absenceTimerMode?: AbsenceTimerMode;
  maintenanceNote?: string;
}

export interface DemoStudentSummary {
  erpId: string;
  name: string;
  email: string;
  program: string;
  batch: string;
  status: 'Active' | 'Restricted' | 'Warning Issued';
  monthlyViolationCount: number;
}

export interface StudentProfile {
  erpId: string;
  name: string;
  email: string;
  authReference?: string;
  isDemo?: boolean;
  program: string;
  batch: string;
  campus: string;
  phone: string;
  avatarUrl: string;
  status: 'Active' | 'Restricted' | 'Warning Issued';
  monthlyViolationCount?: number;
  currentViolationMonth?: string;
  createdDate?: string;
  totalSessions: number;
  violationsCount: number;
  outstandingDuesPkr: number;
  totalFinesGeneratedPkr?: number;
  totalPaidPkr?: number;
  totalWaivedPkr?: number;
  unpaidTransactionsCount?: number;
  pendingTransactionsCount?: number;
  paidTransactionsCount?: number;
  waivedTransactionsCount?: number;
  emailAlerts: boolean;
  graceReminders: boolean;
}

export interface AdminProfile {
  staffId: string;
  name: string;
  email: string;
  title: string;
  department: string;
  campus: string;
  avatarUrl: string;
  isDemo?: boolean;
}

export interface ReservationRecord {
  id: string;
  seatId: string;
  zone: SeatZone;
  studentErp: string;
  studentName: string;
  date: string;
  startTime: string;
  endTime: string;
  startTimestamp?: string;
  departureTimestamp?: string;
  returnTimestamp?: string;
  expiryTimestamp?: string;
  absenceWarningAt?: string;
  absenceDeadlineAt?: string;
  absenceWarningSentAt?: string;
  absenceTimerMode?: AbsenceTimerMode;
  durationMinutes: number;
  status: 'Active' | 'Temporarily Away' | 'Completed' | 'Cancelled' | 'Expired';
}

export interface SensorEventRecord {
  id: string;
  seatId: string;
  sensorId: string;
  presenceStatus: 'Present' | 'Absent' | 'Unknown';
  signalState?: SensorPresenceState;
  timestamp: string;
  rawTimestamp?: string;
  source: string;
  isSimulated?: boolean;
  note?: string;
}

export interface SensorSystemInfo {
  mode: string;
  hardwareConnected: boolean;
  debounceWindowMs: number;
  iotEndpoint: string;
  demoTimerEnabled: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  category: 'Reservation' | 'Policy' | 'System';
  read: boolean;
}

export interface ViolationRecord {
  id: string;
  studentErp: string;
  studentName: string;
  seatId: string;
  date: string;
  calendarMonth?: string;
  monthlyViolationNumber?: number;
  type: string;
  severity: string;
  finePkr: number;
  status: 'Open' | 'Resolved' | 'Waived';
  reviewNote?: string;
  reviewedByName?: string;
  reviewedAt?: string;
}

export type PaymentStatus = 'UNPAID' | 'PENDING' | 'PAID' | 'WAIVED';

export interface LedgerEntry {
  id: string;
  studentErp: string;
  studentName: string;
  seatId?: string;
  violationId?: string;
  fineConfigurationId?: string;
  date: string;
  description: string;
  referenceId: string;
  amountPkr: number;
  type: 'Fine' | 'Payment' | 'Waiver';
  status: PaymentStatus;
  paymentMethod?: string;
  verifiedById?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  waiverReason?: string;
  adminNotes?: string;
  gatewayProvider?: string;
  gatewayTransactionId?: string;
  updatedAt?: string;
}

export interface FinancialSummary {
  totalFinesGeneratedPkr: number;
  totalPaidPkr: number;
  totalWaivedPkr: number;
  outstandingBalancePkr: number;
  unpaidAmountPkr: number;
  pendingAmountPkr: number;
  counts: {
    total: number;
    unpaid: number;
    pending: number;
    paid: number;
    waived: number;
  };
}

export interface FinancialAuditLog {
  id: string;
  transactionId: string;
  studentErp: string;
  studentName: string;
  actionType: 'FINE_CREATED' | 'MARKED_PENDING' | 'PAYMENT_VERIFIED' | 'FINE_WAIVED' | 'REOPENED_UNPAID';
  previousStatus?: PaymentStatus;
  newStatus: PaymentStatus;
  amountPkr: number;
  paymentReference?: string;
  paymentMethod?: string;
  reason: string;
  performedById: string;
  performedByName: string;
  performedAt: string;
}

export interface AdminTransactionUpdatePayload {
  status: PaymentStatus;
  paymentReference?: string;
  paymentMethod?: string;
  reason?: string;
}

export interface StudentFinancialLedgerDetail {
  student: StudentProfile;
  summary: FinancialSummary;
  ledger: LedgerEntry[];
  auditLogs: FinancialAuditLog[];
}

export interface ViolationPolicyMeta {
  timezone: string;
  currentMonth: string;
  nextResetDate: string;
  currentFinePkr: number;
  activeConfigId: string;
  lastResetMonth: string;
}

export interface PenaltyConfig {
  configurationId?: string;
  gracePeriodMinutes: number;
  maxAwayMinutes: number;
  warningAfterMinutes?: number;
  monthlyResetEnabled?: boolean;
  firstViolationWarningOnly?: boolean;
  maxDailyHours: number;
  noShowFinePkr: number;
  overstayFinePerHourPkr: number;
  warningsBeforeRestriction: number;
  effectiveDate?: string;
  updatedByAdministrator?: string;
  updatedByName?: string;
}

export type AdminInterventionCategory =
  | 'SEAT_RELEASE'
  | 'SEAT_MAINTENANCE'
  | 'SEAT_STATUS_OVERRIDE'
  | 'VIOLATION_CORRECTION'
  | 'STUDENT_STATUS_CHANGE';

export interface AdminInterventionLog {
  id: string;
  category: AdminInterventionCategory;
  targetId: string;
  seatId?: string;
  studentErp?: string;
  studentName?: string;
  previousState?: string;
  newState: string;
  reason: string;
  performedById: string;
  performedByName: string;
  performedAt: string;
}

export interface AdminOverviewMetrics {
  asOfDateKarachi: string;
  currentMonthKarachi: string;
  totalSeats: number;
  availableSeats: number;
  occupiedSeats: number;
  awaySeats: number;
  maintenanceSeats: number;
  totalStudentsCount: number;
  activeStudentsCount: number;
  reservationsToday: number;
  expiredReservationsToday: number;
  monthlyViolations: number;
  monthlyFinesGeneratedPkr: number;
  outstandingBalancesPkr: number;
  dailyUtilizationSeries: Array<{
    date: string;
    totalReservations: number;
    completed: number;
    expired: number;
    activeOrAway: number;
  }>;
  monthlyFinancialSeries: Array<{
    month: string;
    generatedPkr: number;
    collectedPkr: number;
    waivedPkr: number;
    outstandingPkr: number;
    transactionsCount: number;
  }>;
  zoneUtilization: Array<{
    zone: string;
    total: number;
    occupied: number;
    away: number;
    available: number;
    maintenance: number;
    utilizationPct: number;
  }>;
}

export type AdminReportType =
  | 'daily-utilization'
  | 'monthly-utilization'
  | 'student-reservations'
  | 'monthly-violations'
  | 'monthly-fines'
  | 'outstanding-balances';

export interface AdminReportsData {
  generatedAt: string;
  filterMonth: string;
  availableMonths: string[];
  dailySeatUtilization: Array<{
    date: string;
    totalBookings: number;
    uniqueSeatsUsed: number;
    uniqueStudents: number;
    seatCoveragePct: number;
    activeOrAway: number;
    completed: number;
    expired: number;
    cancelled: number;
    totalStudyHours: number;
  }>;
  monthlySeatUtilization: Array<{
    month: string;
    totalBookings: number;
    uniqueSeatsUsed: number;
    uniqueStudents: number;
    seatCoveragePct: number;
    completed: number;
    expired: number;
    cancelled: number;
    expiryRatePct: number;
    totalStudyHours: number;
  }>;
  studentReservationHistory: Array<{
    reservationId: string;
    date: string;
    studentErp: string;
    studentName: string;
    program: string;
    seatId: string;
    zone: string;
    startTimestamp: string;
    departureTimestamp?: string;
    expiryTimestamp: string;
    durationMinutes: number;
    status: string;
  }>;
  monthlyViolationReports: Array<{
    month: string;
    totalViolations: number;
    warningsOnly: number;
    finesIssued: number;
    resolved: number;
    waived: number;
    uniqueStudents: number;
    totalFinesPkr: number;
  }>;
  monthlyFineReports: Array<{
    month: string;
    transactionsCount: number;
    totalGeneratedPkr: number;
    collectedPkr: number;
    waivedPkr: number;
    unpaidPkr: number;
    pendingPkr: number;
    outstandingPkr: number;
    collectionRatePct: number;
  }>;
  outstandingBalanceReports: Array<{
    studentErp: string;
    studentName: string;
    email: string;
    program: string;
    accountStatus: string;
    monthlyViolationCount: number;
    openTransactionsCount: number;
    unpaidPkr: number;
    pendingPkr: number;
    outstandingBalancePkr: number;
    totalPaidPkr: number;
    totalWaivedPkr: number;
    totalGeneratedPkr: number;
    latestDueDate: string;
  }>;
}

export interface SystemSettings {
  libraryName: string;
  campusLocation: string;
  operatingHoursOpen: string;
  operatingHoursClose: string;
  totalIlsCapacity: number;
  academicTerm: string;
  qrRotationCycle: 'Daily' | 'Weekly' | 'Semester';
  allowAdvanceBooking: boolean;
  maintenanceBannerEnabled: boolean;
}

export interface AuthBootstrapStatus {
  adminSetupRequired: boolean;
  adminUsesEnvSecret: boolean;
  adminAccount: {
    staffId: string;
    name: string;
    email: string;
    isDemo: boolean;
  } | null;
  demoStudents: DemoStudentSummary[];
}
