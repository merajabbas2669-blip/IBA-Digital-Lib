import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  INITIAL_ADMIN,
  INITIAL_CURRENT_STUDENT,
  INITIAL_PENALTY_CONFIG,
  INITIAL_SYSTEM_SETTINGS,
} from '../data/initialData';
import {
  AdminInterventionLog,
  AdminOverviewMetrics,
  AdminProfile,
  AdminReportsData,
  AdminReportType,
  AdminRoute,
  AdminTransactionUpdatePayload,
  AuthBootstrapStatus,
  FinancialAuditLog,
  FinancialSummary,
  ILSSeat,
  LedgerEntry,
  NotificationItem,
  PenaltyConfig,
  ReservationRecord,
  SeatStatus,
  SensorEventRecord,
  SensorPresenceState,
  SensorSystemInfo,
  StudentFinancialLedgerDetail,
  StudentProfile,
  StudentRoute,
  SystemSettings,
  UserRole,
  ViolationPolicyMeta,
  ViolationRecord,
} from '../types/ils';

interface ActionResult {
  ok: boolean;
  message: string;
}

interface RegisterStudentInput {
  erpId: string;
  fullName: string;
  email: string;
  program: string;
  batch: string;
  password: string;
}

export interface QrValidationResult {
  valid: boolean;
  code?: string;
  error?: string;
  qrToken?: string;
  seat?: ILSSeat;
  maxDailyHours?: number;
  confirmationPrompt?: string;
  activeSeatId?: string;
}

interface ILSContextValue {
  role: UserRole | null;
  loadingData: boolean;
  seatsLoading: boolean;
  syncError: string | null;
  lastSyncedAt: string | null;
  pendingScannedQr: string | null;
  clearPendingScannedQr: () => void;
  authBootstrap: AuthBootstrapStatus;
  studentRoute: StudentRoute;
  adminRoute: AdminRoute;
  setStudentRoute: (route: StudentRoute) => void;
  setAdminRoute: (route: AdminRoute) => void;

  // Real Backend Authentication Flows
  loginWithCredentials: (identifier: string, password: string, targetRole: UserRole) => Promise<ActionResult>;
  registerRealStudent: (input: RegisterStudentInput) => Promise<ActionResult>;
  setupInitialAdminPassword: (password: string) => Promise<ActionResult>;
  loginAsDemoStudent: (erpId: string) => Promise<ActionResult>;
  logout: () => Promise<void>;

  currentStudent: StudentProfile;
  updateStudentPreferences: (
    prefs: Partial<Pick<StudentProfile, 'emailAlerts' | 'graceReminders' | 'phone'>>
  ) => Promise<ActionResult>;
  currentAdmin: AdminProfile;

  seats: ILSSeat[];
  seatCounts: {
    total: number;
    available: number;
    occupied: number;
    away: number;
    maintenance: number;
  };
  reservations: ReservationRecord[];
  activeStudentReservation: ReservationRecord | undefined;
  students: StudentProfile[];
  sensorEvents: SensorEventRecord[];
  sensorSystem: SensorSystemInfo;
  notifications: NotificationItem[];
  unreadNotificationsCount: number;
  violations: ViolationRecord[];
  ledger: LedgerEntry[];
  financialSummary: FinancialSummary;
  financialAuditLogs: FinancialAuditLog[];
  overviewMetrics: AdminOverviewMetrics;
  adminInterventions: AdminInterventionLog[];
  penaltyConfig: PenaltyConfig;
  fineConfigHistory: PenaltyConfig[];
  violationPolicy: ViolationPolicyMeta;
  systemSettings: SystemSettings;

  // Live Database-Backed Operations (QR-Verified Booking & Sensor Simulator)
  validateScannedQr: (qrPayload: string) => Promise<QrValidationResult>;
  confirmQrSeatReservation: (qrPayload: string, durationHours: number) => Promise<ActionResult>;
  checkoutCurrentStudent: () => Promise<ActionResult>;
  adminUpdateSeatStatus: (seatId: string, status: SeatStatus, note?: string) => Promise<ActionResult>;
  adminSimulateSensor: (
    seatId: string,
    state: SensorPresenceState
  ) => Promise<ActionResult & { code?: string; retryAfterMs?: number; eventId?: string }>;
  adminSetDemoTimerMode: (demoTimerEnabled: boolean) => Promise<ActionResult>;
  adminToggleSeatQr: (seatId: string) => Promise<ActionResult>;
  adminRegenerateSeatQr: (seatId: string) => Promise<ActionResult & { qrCodeToken?: string }>;
  adminReleaseReservation: (reservationId: string, reason?: string) => Promise<ActionResult>;
  adminResolveViolation: (
    violationId: string,
    resolution: 'Resolved' | 'Waived' | 'Warning' | 'Fine Issued',
    reason: string
  ) => Promise<ActionResult>;
  adminUpdateStudentStatus: (
    studentId: string,
    status: 'Active' | 'Warning Issued' | 'Restricted',
    reason: string
  ) => Promise<ActionResult>;
  adminUpdateTransactionStatus: (
    transactionId: string,
    payload: AdminTransactionUpdatePayload
  ) => Promise<ActionResult>;
  adminFetchStudentFinancialLedger: (studentId: string) => Promise<StudentFinancialLedgerDetail | null>;
  adminExportFinancialReport: (filters?: {
    studentId?: string;
    status?: string;
    search?: string;
  }) => Promise<ActionResult>;
  adminFetchReports: (month?: string) => Promise<AdminReportsData | null>;
  adminExportAdminReport: (type: AdminReportType, month?: string) => Promise<ActionResult>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  updatePenaltyConfig: (next: PenaltyConfig) => Promise<ActionResult>;
  updateSystemSettings: (next: SystemSettings) => Promise<ActionResult>;
  refreshLiveSeatData: () => Promise<boolean>;
}

const ILSContext = createContext<ILSContextValue | null>(null);

export const ILSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Auth token kept strictly in React memory (never persisted in localStorage/sessionStorage)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [seatsLoading, setSeatsLoading] = useState<boolean>(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pendingScannedQr, setPendingScannedQr] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const scanned = params.get('scan_qr') ?? params.get('qr');
    return scanned && scanned.trim() ? scanned.trim() : null;
  });

  const clearPendingScannedQr = useCallback(() => {
    setPendingScannedQr(null);
    if (typeof window !== 'undefined' && window.location.search) {
      const url = new URL(window.location.href);
      url.searchParams.delete('scan_qr');
      url.searchParams.delete('qr');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  }, []);

  const [studentRoute, setStudentRoute] = useState<StudentRoute>('dashboard');
  const [adminRoute, setAdminRoute] = useState<AdminRoute>('overview');

  const [authBootstrap, setAuthBootstrap] = useState<AuthBootstrapStatus>({
    adminSetupRequired: false,
    adminUsesEnvSecret: false,
    adminAccount: null,
    demoStudents: [],
  });

  const [currentStudent, setCurrentStudent] = useState<StudentProfile>(INITIAL_CURRENT_STUDENT);
  const [currentAdmin, setCurrentAdmin] = useState<AdminProfile>(INITIAL_ADMIN);
  const [seats, setSeats] = useState<ILSSeat[]>([]);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [sensorEvents, setSensorEvents] = useState<SensorEventRecord[]>([]);
  const [sensorSystem, setSensorSystem] = useState<SensorSystemInfo>({
    mode: 'DEMO / SIMULATED',
    hardwareConnected: false,
    debounceWindowMs: 3000,
    iotEndpoint: '/api/iot/sensors/events',
    demoTimerEnabled: false,
  });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [violations, setViolations] = useState<ViolationRecord[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary>({
    totalFinesGeneratedPkr: 0,
    totalPaidPkr: 0,
    totalWaivedPkr: 0,
    outstandingBalancePkr: 0,
    unpaidAmountPkr: 0,
    pendingAmountPkr: 0,
    counts: { total: 0, unpaid: 0, pending: 0, paid: 0, waived: 0 },
  });
  const [financialAuditLogs, setFinancialAuditLogs] = useState<FinancialAuditLog[]>([]);
  const [overviewMetrics, setOverviewMetrics] = useState<AdminOverviewMetrics>({
    asOfDateKarachi: new Date().toISOString().slice(0, 10),
    currentMonthKarachi: new Date().toISOString().slice(0, 7),
    totalSeats: 30,
    availableSeats: 0,
    occupiedSeats: 0,
    awaySeats: 0,
    maintenanceSeats: 0,
    totalStudentsCount: 0,
    activeStudentsCount: 0,
    reservationsToday: 0,
    expiredReservationsToday: 0,
    monthlyViolations: 0,
    monthlyFinesGeneratedPkr: 0,
    outstandingBalancesPkr: 0,
    dailyUtilizationSeries: [],
    monthlyFinancialSeries: [],
    zoneUtilization: [],
  });
  const [adminInterventions, setAdminInterventions] = useState<AdminInterventionLog[]>([]);
  const [penaltyConfig, setPenaltyConfig] = useState<PenaltyConfig>(INITIAL_PENALTY_CONFIG);
  const [fineConfigHistory, setFineConfigHistory] = useState<PenaltyConfig[]>([]);
  const [violationPolicy, setViolationPolicy] = useState<ViolationPolicyMeta>({
    timezone: 'Asia/Karachi',
    currentMonth: new Date().toISOString().slice(0, 7),
    nextResetDate: '1st of next month 00:00 PKT',
    currentFinePkr: INITIAL_PENALTY_CONFIG.noShowFinePkr,
    activeConfigId: 'CFG-2026-01',
    lastResetMonth: new Date().toISOString().slice(0, 7),
  });
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(INITIAL_SYSTEM_SETTINGS);

  const authRef = useRef<{ role: UserRole | null; token: string | null }>({ role: null, token: null });
  authRef.current = { role, token: authToken };

  const apiFetch = useCallback(
    async <T,>(
      url: string,
      options: RequestInit = {},
      tokenOverride?: string | null
    ): Promise<{ ok: boolean; status: number; data: T & { error?: string; message?: string } }> => {
      const activeToken = tokenOverride !== undefined ? tokenOverride : authToken;
      const headers = new Headers(options.headers ?? {});
      if (!headers.has('Content-Type') && options.body) {
        headers.set('Content-Type', 'application/json');
      }
      if (activeToken) {
        headers.set('Authorization', `Bearer ${activeToken}`);
      }

      const response = await fetch(url, { ...options, headers });
      let data = {} as T & { error?: string; message?: string };
      try {
        data = (await response.json()) as T & { error?: string; message?: string };
      } catch {
        // Ignore empty JSON responses
      }

      if (response.status === 401 && activeToken) {
        setAuthToken(null);
        setRole(null);
      }

      return { ok: response.ok, status: response.status, data };
    },
    [authToken]
  );

  const loadPublicLandingData = useCallback(async (silent = false): Promise<boolean> => {
    if (!silent) setSeatsLoading(true);
    try {
      const [seatsRes, bootRes] = await Promise.all([
        fetch('/api/public/seats'),
        fetch('/api/auth/bootstrap-status'),
      ]);
      if (seatsRes.ok) {
        const seatsJson = (await seatsRes.json()) as { seats: ILSSeat[] };
        if (Array.isArray(seatsJson.seats)) {
          setSeats(seatsJson.seats);
          setLastSyncedAt(new Date().toISOString());
          setSyncError(null);
        }
      } else {
        setSyncError('Unable to load live ILS seat availability. Tap Retry to refresh.');
        return false;
      }
      if (bootRes.ok) {
        const bootJson = (await bootRes.json()) as AuthBootstrapStatus;
        setAuthBootstrap(bootJson);
      }
      return true;
    } catch {
      setSyncError('Unable to reach the library server. Check your connection and tap Retry.');
      return false;
    } finally {
      if (!silent) setSeatsLoading(false);
    }
  }, []);

  const loadStudentPortalData = useCallback(
    async (token: string, silent = false): Promise<boolean> => {
      if (!silent) setLoadingData(true);
      try {
        const res = await apiFetch<{
          student: StudentProfile;
          seats: ILSSeat[];
          reservations: ReservationRecord[];
          notifications: NotificationItem[];
          violations: ViolationRecord[];
          ledger: LedgerEntry[];
          financialSummary?: FinancialSummary;
          penaltyConfig: PenaltyConfig;
          violationPolicy?: ViolationPolicyMeta;
        }>('/api/student/bootstrap', {}, token);

        if (res.ok) {
          setCurrentStudent(res.data.student);
          setSeats(res.data.seats);
          setReservations(res.data.reservations);
          setNotifications(res.data.notifications);
          setViolations(res.data.violations);
          setLedger(res.data.ledger);
          if (res.data.financialSummary) {
            setFinancialSummary(res.data.financialSummary);
          }
          setPenaltyConfig(res.data.penaltyConfig);
          if (res.data.violationPolicy) {
            setViolationPolicy(res.data.violationPolicy);
          }
          setLastSyncedAt(new Date().toISOString());
          setSeatsLoading(false);
          setSyncError(null);
          return true;
        }
        setSyncError('Could not refresh student library data. Tap Retry to sync.');
        return false;
      } catch {
        setSyncError('Network connection lost while syncing library data. Tap Retry.');
        return false;
      } finally {
        if (!silent) setLoadingData(false);
      }
    },
    [apiFetch]
  );

  const loadAdminPortalData = useCallback(
    async (token: string, silent = false): Promise<boolean> => {
      if (!silent) setLoadingData(true);
      try {
        const res = await apiFetch<{
          admin: AdminProfile;
          seats: ILSSeat[];
          students: StudentProfile[];
          reservations: ReservationRecord[];
          sensorEvents: SensorEventRecord[];
          sensorSystem?: SensorSystemInfo;
          violations: ViolationRecord[];
          ledger: LedgerEntry[];
          financialSummary?: FinancialSummary;
          financialAuditLogs?: FinancialAuditLog[];
          overviewMetrics?: AdminOverviewMetrics;
          adminInterventions?: AdminInterventionLog[];
          penaltyConfig: PenaltyConfig;
          fineConfigHistory?: PenaltyConfig[];
          violationPolicy?: ViolationPolicyMeta;
          systemSettings: SystemSettings;
        }>('/api/admin/bootstrap', {}, token);

        if (res.ok) {
          setCurrentAdmin(res.data.admin);
          setSeats(res.data.seats);
          setStudents(res.data.students);
          setReservations(res.data.reservations);
          setSensorEvents(res.data.sensorEvents);
          if (res.data.sensorSystem) {
            setSensorSystem(res.data.sensorSystem);
          }
          setViolations(res.data.violations);
          setLedger(res.data.ledger);
          if (res.data.financialSummary) {
            setFinancialSummary(res.data.financialSummary);
          }
          if (Array.isArray(res.data.financialAuditLogs)) {
            setFinancialAuditLogs(res.data.financialAuditLogs);
          }
          if (res.data.overviewMetrics) {
            setOverviewMetrics(res.data.overviewMetrics);
          }
          if (Array.isArray(res.data.adminInterventions)) {
            setAdminInterventions(res.data.adminInterventions);
          }
          setPenaltyConfig(res.data.penaltyConfig);
          if (Array.isArray(res.data.fineConfigHistory)) {
            setFineConfigHistory(res.data.fineConfigHistory);
          }
          if (res.data.violationPolicy) {
            setViolationPolicy(res.data.violationPolicy);
          }
          setSystemSettings(res.data.systemSettings);
          setLastSyncedAt(new Date().toISOString());
          setSeatsLoading(false);
          setSyncError(null);
          return true;
        }
        setSyncError('Could not refresh administrator data. Tap Retry to sync.');
        return false;
      } catch {
        setSyncError('Network connection lost while syncing administrator data. Tap Retry.');
        return false;
      } finally {
        if (!silent) setLoadingData(false);
      }
    },
    [apiFetch]
  );

  const refreshLiveSeatData = useCallback(async (): Promise<boolean> => {
    const { role: activeRole, token } = authRef.current;
    if (activeRole === 'student' && token) {
      return loadStudentPortalData(token, true);
    }
    if (activeRole === 'admin' && token) {
      return loadAdminPortalData(token, true);
    }
    return loadPublicLandingData(true);
  }, [loadAdminPortalData, loadPublicLandingData, loadStudentPortalData]);

  useEffect(() => {
    void loadPublicLandingData();
  }, [loadPublicLandingData]);

  // Live database-driven SSE subscription for automatic seat map updates
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/events/seats');

    const handleSeatUpdate = () => {
      void refreshLiveSeatData();
    };

    source.addEventListener('seats:updated', handleSeatUpdate);

    return () => {
      source.removeEventListener('seats:updated', handleSeatUpdate);
      source.close();
    };
  }, [refreshLiveSeatData]);

  const seatCounts = useMemo(() => {
    let available = 0;
    let occupied = 0;
    let away = 0;
    let maintenance = 0;
    for (const s of seats) {
      if (s.status === 'available') available += 1;
      else if (s.status === 'occupied') occupied += 1;
      else if (s.status === 'away') away += 1;
      else maintenance += 1;
    }
    return { total: seats.length, available, occupied, away, maintenance };
  }, [seats]);

  const activeStudentReservation = useMemo(
    () =>
      reservations.find(
        (r) =>
          r.studentErp === currentStudent.erpId &&
          (r.status === 'Active' || r.status === 'Temporarily Away')
      ),
    [reservations, currentStudent.erpId]
  );

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const completeAuthSession = useCallback(
    async (token: string, nextRole: UserRole) => {
      setAuthToken(token);
      setRole(nextRole);
      if (nextRole === 'student') {
        setStudentRoute('dashboard');
        await loadStudentPortalData(token);
      } else {
        setAdminRoute('overview');
        await loadAdminPortalData(token);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [loadAdminPortalData, loadStudentPortalData]
  );

  const loginWithCredentials = useCallback(
    async (identifier: string, password: string, targetRole: UserRole): Promise<ActionResult> => {
      const res = await apiFetch<{ token: string; role: UserRole }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ identifier, password, role: targetRole }),
        },
        null
      );

      if (!res.ok) {
        return { ok: false, message: res.data.error ?? 'Authentication failed.' };
      }

      await completeAuthSession(res.data.token, res.data.role);
      return { ok: true, message: 'Signed in successfully.' };
    },
    [apiFetch, completeAuthSession]
  );

  const registerRealStudent = useCallback(
    async (input: RegisterStudentInput): Promise<ActionResult> => {
      const res = await apiFetch<{ token: string; role: UserRole }>(
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        null
      );

      if (!res.ok) {
        return { ok: false, message: res.data.error ?? 'Registration failed.' };
      }

      await completeAuthSession(res.data.token, 'student');
      return { ok: true, message: 'Student account created and signed in.' };
    },
    [apiFetch, completeAuthSession]
  );

  const setupInitialAdminPassword = useCallback(
    async (password: string): Promise<ActionResult> => {
      const res = await apiFetch<{ token: string; role: UserRole }>(
        '/api/auth/admin/setup',
        {
          method: 'POST',
          body: JSON.stringify({ password }),
        },
        null
      );

      if (!res.ok) {
        return { ok: false, message: res.data.error ?? 'Could not initialize administrator password.' };
      }

      await loadPublicLandingData();
      await completeAuthSession(res.data.token, 'admin');
      return { ok: true, message: 'Administrator password initialized.' };
    },
    [apiFetch, completeAuthSession, loadPublicLandingData]
  );

  const loginAsDemoStudent = useCallback(
    async (erpId: string): Promise<ActionResult> => {
      const res = await apiFetch<{ token: string; role: UserRole }>(
        '/api/auth/demo-student-login',
        {
          method: 'POST',
          body: JSON.stringify({ studentId: erpId }),
        },
        null
      );

      if (!res.ok) {
        return { ok: false, message: res.data.error ?? 'Unable to open demo student session.' };
      }

      await completeAuthSession(res.data.token, 'student');
      return { ok: true, message: 'Signed into demonstration student account.' };
    },
    [apiFetch, completeAuthSession]
  );

  const logout = useCallback(async () => {
    if (authToken) {
      try {
        await apiFetch('/api/auth/logout', { method: 'POST' }, authToken);
      } catch {
        // Proceed with client state clear
      }
    }
    setAuthToken(null);
    setRole(null);
    setReservations([]);
    setStudents([]);
    setNotifications([]);
    setViolations([]);
    setLedger([]);
    setFinancialAuditLogs([]);
    setFinancialSummary({
      totalFinesGeneratedPkr: 0,
      totalPaidPkr: 0,
      totalWaivedPkr: 0,
      outstandingBalancePkr: 0,
      unpaidAmountPkr: 0,
      pendingAmountPkr: 0,
      counts: { total: 0, unpaid: 0, pending: 0, paid: 0, waived: 0 },
    });
    setSensorEvents([]);
    await loadPublicLandingData();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [apiFetch, authToken, loadPublicLandingData]);

  const updateStudentPreferences = useCallback(
    async (
      prefs: Partial<Pick<StudentProfile, 'emailAlerts' | 'graceReminders' | 'phone'>>
    ): Promise<ActionResult> => {
      if (!authToken) return { ok: false, message: 'Session expired.' };
      const res = await apiFetch<{ student: StudentProfile }>('/api/student/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          phone: prefs.phone ?? currentStudent.phone,
          emailAlerts: prefs.emailAlerts ?? currentStudent.emailAlerts,
          graceReminders: prefs.graceReminders ?? currentStudent.graceReminders,
        }),
      });
      if (!res.ok) {
        return { ok: false, message: res.data.error ?? 'Failed to update preferences.' };
      }
      setCurrentStudent(res.data.student);
      return { ok: true, message: 'Preferences saved to database.' };
    },
    [apiFetch, authToken, currentStudent]
  );

  const validateScannedQr = useCallback(
    async (qrPayload: string): Promise<QrValidationResult> => {
      if (!authToken) {
        return { valid: false, error: 'Please sign in as an authenticated student before scanning.' };
      }
      const res = await apiFetch<QrValidationResult>('/api/student/qr/validate', {
        method: 'POST',
        body: JSON.stringify({ qrPayload }),
      });
      if (!res.ok) {
        return {
          valid: false,
          code: res.data.code,
          seat: res.data.seat,
          activeSeatId: res.data.activeSeatId,
          error: res.data.error ?? 'Invalid or unavailable ILS QR code.',
        };
      }
      return res.data;
    },
    [apiFetch, authToken]
  );

  const confirmQrSeatReservation = useCallback(
    async (qrPayload: string, durationHours: number): Promise<ActionResult> => {
      if (!authToken) return { ok: false, message: 'Please sign in first.' };
      const res = await apiFetch<{ message?: string }>('/api/student/qr/reserve', {
        method: 'POST',
        body: JSON.stringify({ qrPayload, durationHours }),
      });
      if (!res.ok) {
        return { ok: false, message: res.data.error ?? 'Unable to complete QR reservation.' };
      }
      await loadStudentPortalData(authToken, true);
      return { ok: true, message: res.data.message ?? 'ILS seat reserved via QR scan.' };
    },
    [apiFetch, authToken, loadStudentPortalData]
  );

  const checkoutCurrentStudent = useCallback(async (): Promise<ActionResult> => {
    if (!authToken || !activeStudentReservation) {
      return { ok: false, message: 'No active reservation.' };
    }
    const res = await apiFetch(
      `/api/student/reservations/${encodeURIComponent(activeStudentReservation.id)}/checkout`,
      { method: 'POST' }
    );
    if (!res.ok) {
      return { ok: false, message: res.data.error ?? 'Could not complete checkout.' };
    }
    await loadStudentPortalData(authToken);
    return { ok: true, message: 'Checked out and released seat.' };
  }, [activeStudentReservation, apiFetch, authToken, loadStudentPortalData]);

  const markNotificationRead = useCallback(
    async (id: string) => {
      if (!authToken) return;
      const res = await apiFetch(`/api/student/notifications/${encodeURIComponent(id)}/read`, {
        method: 'PATCH',
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      }
    },
    [apiFetch, authToken]
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (!authToken) return;
    const res = await apiFetch('/api/student/notifications/read-all', { method: 'POST' });
    if (res.ok) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  }, [apiFetch, authToken]);

  const adminUpdateSeatStatus = useCallback(
    async (seatId: string, status: SeatStatus, note?: string): Promise<ActionResult> => {
      if (!authToken) return { ok: false, message: 'Session expired.' };
      const res = await apiFetch(`/api/admin/seats/${encodeURIComponent(seatId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, note }),
      });
      if (!res.ok) {
        return { ok: false, message: res.data.error ?? 'Unable to update seat status.' };
      }
      await loadAdminPortalData(authToken);
      return { ok: true, message: `${seatId} updated to ${status}.` };
    },
    [apiFetch, authToken, loadAdminPortalData]
  );

  const adminSimulateSensor = useCallback(
    async (
      seatId: string,
      state: SensorPresenceState
    ): Promise<ActionResult & { code?: string; retryAfterMs?: number; eventId?: string }> => {
      if (!authToken) return { ok: false, message: 'Session expired.' };
      const res = await apiFetch<{
        code?: string;
        message?: string;
        retryAfterMs?: number;
        eventId?: string;
      }>(`/api/admin/sensors/${encodeURIComponent(seatId)}/simulate`, {
        method: 'POST',
        body: JSON.stringify({ state }),
      });
      if (!res.ok) {
        return {
          ok: false,
          code: res.data.code,
          retryAfterMs: res.data.retryAfterMs,
          message: res.data.error ?? 'Unable to process simulated sensor signal.',
        };
      }
      await loadAdminPortalData(authToken, true);
      return {
        ok: true,
        code: res.data.code,
        eventId: res.data.eventId,
        message: res.data.message ?? `${seatId} sensor simulated as ${state}.`,
      };
    },
    [apiFetch, authToken, loadAdminPortalData]
  );

  const adminSetDemoTimerMode = useCallback(
    async (demoTimerEnabled: boolean): Promise<ActionResult> => {
      if (!authToken) return { ok: false, message: 'Session expired.' };
      const res = await apiFetch<{ demoTimerEnabled?: boolean; message?: string }>(
        '/api/admin/sensors/timer-mode',
        {
          method: 'PATCH',
          body: JSON.stringify({ demoTimerEnabled }),
        }
      );
      if (!res.ok) {
        return { ok: false, message: res.data.error ?? 'Unable to update absence timer mode.' };
      }
      await loadAdminPortalData(authToken, true);
      return {
        ok: true,
        message: res.data.message ?? 'Absence timer mode updated.',
      };
    },
    [apiFetch, authToken, loadAdminPortalData]
  );

  const adminToggleSeatQr = useCallback(
    async (seatId: string): Promise<ActionResult> => {
      if (!authToken) return { ok: false, message: 'Session expired.' };
      const res = await apiFetch(`/api/admin/seats/${encodeURIComponent(seatId)}/qr`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        return { ok: false, message: res.data.error ?? 'Unable to toggle QR status.' };
      }
      await loadAdminPortalData(authToken, true);
      return { ok: true, message: `${seatId} QR status updated.` };
    },
    [apiFetch, authToken, loadAdminPortalData]
  );

  const adminRegenerateSeatQr = useCallback(
    async (seatId: string): Promise<ActionResult & { qrCodeToken?: string }> => {
      if (!authToken) return { ok: false, message: 'Session expired.' };
      const res = await apiFetch<{ qrCodeToken?: string }>(
        `/api/admin/seats/${encodeURIComponent(seatId)}/qr/regenerate`,
        { method: 'POST' }
      );
      if (!res.ok) {
        return { ok: false, message: res.data.error ?? 'Unable to regenerate QR code.' };
      }
      await loadAdminPortalData(authToken, true);
      return {
        ok: true,
        message: `Generated a new permanent QR code for ${seatId}. Previous code invalidated.`,
        qrCodeToken: res.data.qrCodeToken,
      };
    },
    [apiFetch, authToken, loadAdminPortalData]
  );

  const adminReleaseReservation = useCallback(
    async (reservationId: string, reason?: string): Promise<ActionResult> => {
      if (!authToken) return { ok: false, message: 'Session expired.' };
      const res = await apiFetch(
        `/api/admin/reservations/${encodeURIComponent(reservationId)}/release`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }
      );
      if (!res.ok) {
        return { ok: false, message: res.data.error ?? 'Unable to release reservation.' };
      }
      await loadAdminPortalData(authToken, true);
      return { ok: true, message: `Reservation ${reservationId} released and logged.` };
    },
    [apiFetch, authToken, loadAdminPortalData]
  );

  const adminResolveViolation = useCallback(
    async (
      violationId: string,
      resolution: 'Resolved' | 'Waived' | 'Warning' | 'Fine Issued',
      reason: string
    ): Promise<ActionResult> => {
      if (!authToken) return { ok: false, message: 'Session expired.' };
      const res = await apiFetch(`/api/admin/violations/${encodeURIComponent(violationId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ resolution, reason }),
      });
      if (!res.ok) {
        return { ok: false, message: res.data.error ?? 'Unable to update violation.' };
      }
      await loadAdminPortalData(authToken, true);
      return { ok: true, message: `Violation ${violationId} updated to ${resolution}. Audit entry recorded.` };
    },
    [apiFetch, authToken, loadAdminPortalData]
  );

  const adminUpdateStudentStatus = useCallback(
    async (
      studentId: string,
      status: 'Active' | 'Warning Issued' | 'Restricted',
      reason: string
    ): Promise<ActionResult> => {
      if (!authToken) return { ok: false, message: 'Session expired.' };
      const res = await apiFetch(`/api/admin/students/${encodeURIComponent(studentId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      });
      if (!res.ok) {
        return { ok: false, message: res.data.error ?? 'Unable to update student status.' };
      }
      await loadAdminPortalData(authToken, true);
      return { ok: true, message: `Student ${studentId} account status updated to ${status}.` };
    },
    [apiFetch, authToken, loadAdminPortalData]
  );

  const adminUpdateTransactionStatus = useCallback(
    async (
      transactionId: string,
      payload: AdminTransactionUpdatePayload
    ): Promise<ActionResult> => {
      if (!authToken) return { ok: false, message: 'Session expired.' };
      const res = await apiFetch(`/api/admin/transactions/${encodeURIComponent(transactionId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return { ok: false, message: res.data.error ?? 'Unable to update financial transaction.' };
      }
      await loadAdminPortalData(authToken, true);
      return {
        ok: true,
        message: `Transaction ${transactionId} updated to ${payload.status}. Audit log recorded.`,
      };
    },
    [apiFetch, authToken, loadAdminPortalData]
  );

  const adminFetchStudentFinancialLedger = useCallback(
    async (studentId: string): Promise<StudentFinancialLedgerDetail | null> => {
      if (!authToken) return null;
      const res = await apiFetch<StudentFinancialLedgerDetail>(
        `/api/admin/financial/students/${encodeURIComponent(studentId)}`
      );
      if (!res.ok) return null;
      return res.data;
    },
    [apiFetch, authToken]
  );

  const adminExportFinancialReport = useCallback(
    async (filters?: { studentId?: string; status?: string; search?: string }): Promise<ActionResult> => {
      if (!authToken) return { ok: false, message: 'Session expired.' };
      const params = new URLSearchParams();
      if (filters?.studentId) params.set('studentId', filters.studentId);
      if (filters?.status && filters.status !== 'ALL') params.set('status', filters.status);
      if (filters?.search?.trim()) params.set('search', filters.search.trim());
      const query = params.toString() ? `?${params.toString()}` : '';

      try {
        const response = await fetch(`/api/admin/financial/export${query}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!response.ok) {
          return { ok: false, message: 'Failed to export financial report.' };
        }
        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition') ?? '';
        const match = disposition.match(/filename="([^"]+)"/);
        const filename = match?.[1] ?? `iba-ils-financial-report-${new Date().toISOString().slice(0, 10)}.csv`;

        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);

        return { ok: true, message: `Exported ${filename}.` };
      } catch {
        return { ok: false, message: 'Network error while exporting CSV report.' };
      }
    },
    [authToken]
  );

  const adminFetchReports = useCallback(
    async (month?: string): Promise<AdminReportsData | null> => {
      if (!authToken) return null;
      const query = month && month !== 'ALL' ? `?month=${encodeURIComponent(month)}` : '';
      const res = await apiFetch<AdminReportsData>(`/api/admin/reports${query}`);
      if (!res.ok) return null;
      return res.data;
    },
    [apiFetch, authToken]
  );

  const adminExportAdminReport = useCallback(
    async (type: AdminReportType, month?: string): Promise<ActionResult> => {
      if (!authToken) return { ok: false, message: 'Session expired.' };
      const params = new URLSearchParams({ type });
      if (month && month !== 'ALL') params.set('month', month);

      try {
        const response = await fetch(`/api/admin/reports/export?${params.toString()}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!response.ok) {
          return { ok: false, message: 'Failed to export institutional report.' };
        }
        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition') ?? '';
        const match = disposition.match(/filename="([^"]+)"/);
        const filename = match?.[1] ?? `iba-ils-${type}-${new Date().toISOString().slice(0, 10)}.csv`;

        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);

        return { ok: true, message: `Exported ${filename}.` };
      } catch {
        return { ok: false, message: 'Network error while exporting institutional CSV report.' };
      }
    },
    [authToken]
  );

  const updatePenaltyConfig = useCallback(
    async (next: PenaltyConfig): Promise<ActionResult> => {
      if (!authToken) return { ok: false, message: 'Session expired.' };
      const res = await apiFetch<{
        penaltyConfig: PenaltyConfig;
        fineConfigHistory?: PenaltyConfig[];
      }>('/api/admin/fine-config', {
        method: 'PUT',
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        return { ok: false, message: res.data.error ?? 'Unable to save fine configuration.' };
      }
      setPenaltyConfig(res.data.penaltyConfig);
      if (Array.isArray(res.data.fineConfigHistory)) {
        setFineConfigHistory(res.data.fineConfigHistory);
      }
      setViolationPolicy((prev) => ({
        ...prev,
        currentFinePkr: res.data.penaltyConfig.noShowFinePkr,
        activeConfigId: res.data.penaltyConfig.configurationId ?? prev.activeConfigId,
      }));
      return { ok: true, message: 'Fine configuration saved. Historical fines remain unchanged.' };
    },
    [apiFetch, authToken]
  );

  const updateSystemSettings = useCallback(
    async (next: SystemSettings): Promise<ActionResult> => {
      if (!authToken) return { ok: false, message: 'Session expired.' };
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        return { ok: false, message: res.data.error ?? 'Unable to save system settings.' };
      }
      setSystemSettings(next);
      return { ok: true, message: 'System settings saved.' };
    },
    [apiFetch, authToken]
  );

  return (
    <ILSContext.Provider
      value={{
        role,
        loadingData,
        seatsLoading,
        syncError,
        lastSyncedAt,
        pendingScannedQr,
        clearPendingScannedQr,
        authBootstrap,
        studentRoute,
        adminRoute,
        setStudentRoute,
        setAdminRoute,
        loginWithCredentials,
        registerRealStudent,
        setupInitialAdminPassword,
        loginAsDemoStudent,
        logout,
        currentStudent,
        updateStudentPreferences,
        currentAdmin,
        seats,
        seatCounts,
        reservations,
        activeStudentReservation,
        students,
        sensorEvents,
        sensorSystem,
        notifications,
        unreadNotificationsCount,
        violations,
        ledger,
        financialSummary,
        financialAuditLogs,
        overviewMetrics,
        adminInterventions,
        penaltyConfig,
        fineConfigHistory,
        violationPolicy,
        systemSettings,
        validateScannedQr,
        confirmQrSeatReservation,
        checkoutCurrentStudent,
        adminUpdateSeatStatus,
        adminSimulateSensor,
        adminSetDemoTimerMode,
        adminToggleSeatQr,
        adminRegenerateSeatQr,
        adminReleaseReservation,
        adminResolveViolation,
        adminUpdateStudentStatus,
        adminUpdateTransactionStatus,
        adminFetchStudentFinancialLedger,
        adminExportFinancialReport,
        adminFetchReports,
        adminExportAdminReport,
        markNotificationRead,
        markAllNotificationsRead,
        updatePenaltyConfig,
        updateSystemSettings,
        refreshLiveSeatData,
      }}
    >
      {children}
    </ILSContext.Provider>
  );
};

export function useILS() {
  const ctx = useContext(ILSContext);
  if (!ctx) throw new Error('useILS must be used within ILSProvider');
  return ctx;
}
