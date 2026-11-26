import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Radio,
  Search,
  ShieldAlert,
  UserCheck,
  UserMinus,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  ILSSeat,
  SensorEventRecord,
  SensorPresenceState,
  SensorSystemInfo,
} from '../../types/ils';
import { PageHeader, SeatStatusLabel } from '../shared/DesignSystem';

interface AdminSensorMonitoringProps {
  seats: ILSSeat[];
  sensorEvents: SensorEventRecord[];
  sensorSystem: SensorSystemInfo;
  maxAwayMinutes: number;
  onSimulateSensor: (
    seatId: string,
    state: SensorPresenceState
  ) => Promise<{
    ok: boolean;
    message: string;
    code?: string;
    retryAfterMs?: number;
    eventId?: string;
  }>;
  onSetDemoTimerMode: (enabled: boolean) => Promise<{ ok: boolean; message: string }>;
}

function getEffectivePresence(seat: ILSSeat): SensorPresenceState {
  if (
    seat.sensorPresence === 'PRESENT' ||
    seat.sensorPresence === 'ABSENT' ||
    seat.sensorPresence === 'OFFLINE'
  ) {
    return seat.sensorPresence;
  }
  if (seat.sensorState === 'Offline') return 'OFFLINE';
  return seat.status === 'occupied' ? 'PRESENT' : 'ABSENT';
}

function formatCountdown(
  graceExpiresAt: string | undefined,
  nowMs: number,
  timerMode?: 'production' | 'demo_accelerated'
): {
  active: boolean;
  expired: boolean;
  inWarningWindow: boolean;
  label: string;
} {
  if (!graceExpiresAt) {
    return { active: false, expired: false, inWarningWindow: false, label: '—' };
  }
  const expMs = new Date(graceExpiresAt).getTime();
  if (Number.isNaN(expMs)) {
    return { active: false, expired: false, inWarningWindow: false, label: '—' };
  }
  const diffSec = Math.max(0, Math.ceil((expMs - nowMs) / 1000));
  if (diffSec <= 0) {
    return { active: true, expired: true, inWarningWindow: true, label: 'Expiring now…' };
  }
  if (timerMode === 'demo_accelerated') {
    return {
      active: true,
      expired: false,
      inWarningWindow: diffSec <= 5,
      label: `${diffSec}m sim (${diffSec}s real) left`,
    };
  }
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return {
    active: true,
    expired: false,
    inWarningWindow: diffSec <= 300,
    label: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} left`,
  };
}

function formatTimestamp(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const datePart = d.toISOString().slice(0, 10);
  const timePart = d.toISOString().slice(11, 19);
  return `${datePart} ${timePart} UTC`;
}

const PresenceBadge: React.FC<{ state: SensorPresenceState }> = ({ state }) => {
  if (state === 'PRESENT') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 font-mono text-[11px] font-semibold text-emerald-700">
        <UserCheck className="h-3 w-3 shrink-0" />
        PRESENT
      </span>
    );
  }
  if (state === 'ABSENT') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 font-mono text-[11px] font-semibold text-amber-700">
        <UserMinus className="h-3 w-3 shrink-0" />
        ABSENT
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 font-mono text-[11px] font-semibold text-rose-700">
      <WifiOff className="h-3 w-3 shrink-0" />
      OFFLINE
    </span>
  );
};

export const AdminSensorMonitoring: React.FC<AdminSensorMonitoringProps> = ({
  seats,
  sensorEvents,
  sensorSystem,
  maxAwayMinutes,
  onSimulateSensor,
  onSetDemoTimerMode,
}) => {
  const [selectedSeatId, setSelectedSeatId] = useState<string>(seats[0]?.id ?? 'ILS-01');
  const [stateFilter, setStateFilter] = useState<'ALL' | SensorPresenceState>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState<SensorPresenceState | null>(null);
  const [togglingTimer, setTogglingTimer] = useState(false);
  const [timerFeedback, setTimerFeedback] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'warning' | 'error';
    text: string;
    detail?: string;
  } | null>(null);
  const [showIotDocs, setShowIotDocs] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const selectedSeat = useMemo(
    () => seats.find((s) => s.id === selectedSeatId) ?? seats[0],
    [seats, selectedSeatId]
  );

  const sensorStats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let offline = 0;
    let awayCountdowns = 0;
    for (const s of seats) {
      const p = getEffectivePresence(s);
      if (p === 'PRESENT') present += 1;
      else if (p === 'ABSENT') absent += 1;
      else offline += 1;
      if (s.status === 'away' && s.graceExpiresAt && p !== 'OFFLINE') {
        awayCountdowns += 1;
      }
    }
    return { total: seats.length, present, absent, offline, awayCountdowns };
  }, [seats]);

  const offlineSeats = useMemo(
    () => seats.filter((s) => getEffectivePresence(s) === 'OFFLINE'),
    [seats]
  );

  const filteredSeats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return seats.filter((seat) => {
      const presence = getEffectivePresence(seat);
      if (stateFilter !== 'ALL' && presence !== stateFilter) return false;
      if (!q) return true;
      return (
        seat.id.toLowerCase().includes(q) ||
        seat.sensorNodeId.toLowerCase().includes(q) ||
        seat.zone.toLowerCase().includes(q) ||
        (seat.occupantName?.toLowerCase().includes(q) ?? false) ||
        (seat.occupantErp?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [seats, stateFilter, searchQuery]);

  const handleSimulate = async (targetState: SensorPresenceState) => {
    if (!selectedSeat) return;
    setSubmitting(targetState);
    setFeedback(null);
    try {
      const res = await onSimulateSensor(selectedSeat.id, targetState);
      if (res.ok) {
        setFeedback({
          tone: 'success',
          text: res.message,
          detail: res.eventId
            ? `Recorded database event: ${res.eventId} · DEMO / SIMULATED`
            : undefined,
        });
      } else if (res.code === 'DUPLICATE_STATE' || res.code === 'DEBOUNCED') {
        setFeedback({
          tone: 'warning',
          text: res.message,
          detail:
            res.code === 'DEBOUNCED'
              ? `False-signal debounce active (${Math.round(sensorSystem.debounceWindowMs / 1000)}s minimum interval between signals per sensor).`
              : 'No duplicate row inserted into sensor_events.',
        });
      } else {
        setFeedback({
          tone: 'error',
          text: res.message,
        });
      }
    } finally {
      setSubmitting(null);
    }
  };

  const handleToggleTimerMode = async (enableDemo: boolean) => {
    setTogglingTimer(true);
    setTimerFeedback(null);
    try {
      const res = await onSetDemoTimerMode(enableDemo);
      setTimerFeedback(res.message);
    } finally {
      setTogglingTimer(false);
    }
  };

  const selectedPresence = selectedSeat ? getEffectivePresence(selectedSeat) : 'ABSENT';
  const selectedCountdown = selectedSeat
    ? formatCountdown(selectedSeat.graceExpiresAt, nowMs, selectedSeat.absenceTimerMode)
    : { active: false, expired: false, inWarningWindow: false, label: '—' };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sensor Monitoring & Occupancy Simulator"
        description="1:1 occupancy sensor registry (NODE-ILS-01 through NODE-ILS-30) with administrator simulation controls and database-persisted presence events."
        action={
          <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs font-semibold">
            <Radio className="h-3.5 w-3.5 text-amber-700 shrink-0" />
            <span>
              {sensorSystem.hardwareConnected
                ? 'IoT API Enabled + Simulator'
                : 'DEMO / SIMULATED MODE · No Physical Hardware Connected'}
            </span>
          </div>
        }
      />

      {/* Offline Sensor Administrator Alert Banner */}
      {offlineSeats.length > 0 && (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex flex-col gap-3 shadow-xs"
        >
          <div className="flex items-start gap-3">
            <span className="h-9 w-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-sm font-bold text-rose-900">
                Administrator Alert: {offlineSeats.length} Occupancy Sensor
                {offlineSeats.length === 1 ? ' Is' : 's Are'} Currently OFFLINE
              </h2>
              <p className="mt-1 text-xs text-rose-800 leading-relaxed">
                Unreliable or offline sensor data will <strong>never</strong> automatically create
                a student violation or release an active reservation. Authorized staff should
                investigate the affected desks below and restore sensor connectivity once verified.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {offlineSeats.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedSeatId(s.id);
                      setFeedback(null);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold border transition-colors cursor-pointer ${
                      selectedSeat?.id === s.id
                        ? 'bg-rose-700 text-white border-rose-700'
                        : 'bg-white text-rose-800 border-rose-200 hover:bg-rose-100'
                    }`}
                  >
                    {s.id} · {s.sensorNodeId}
                    {s.occupantName ? ` (Assigned: ${s.occupantErp})` : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4-Column KPI Cards: Online, Offline, PRESENT, ABSENT */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="surface-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#68748A]">Online Sensors</span>
            <span className="h-9 w-9 rounded-xl bg-[#EAF0FF] text-[#315EF2] flex items-center justify-center">
              <Wifi className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-[#101C3A] tabular-nums">
            {Math.max(0, sensorStats.total - sensorStats.offline)}
          </div>
          <div className="mt-1 text-xs text-[#68748A]">
            of {sensorStats.total} mapped (ILS-01 – ILS-30)
          </div>
        </div>
        <div className="surface-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#68748A]">Offline Sensors</span>
            <span className="h-9 w-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <WifiOff className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div
            className={`mt-3 text-3xl font-bold tabular-nums ${
              sensorStats.offline > 0 ? 'text-rose-700' : 'text-slate-700'
            }`}
          >
            {sensorStats.offline}
          </div>
          <div className="mt-1 text-xs text-[#68748A]">Zero auto-violations on offline</div>
        </div>
        <div className="surface-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#68748A]">PRESENT Sensors</span>
            <span className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <UserCheck className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-emerald-700 tabular-nums">
            {sensorStats.present}
          </div>
          <div className="mt-1 text-xs text-[#68748A]">Active physical occupancy</div>
        </div>
        <div className="surface-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#68748A]">ABSENT Sensors</span>
            <span className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <UserMinus className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-amber-700 tabular-nums">
            {sensorStats.absent}
          </div>
          <div className="mt-1 text-xs text-[#68748A]">
            {sensorStats.awayCountdowns} active {maxAwayMinutes}-min countdown
            {sensorStats.awayCountdowns === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {/* Automated 20-Minute Absence Workflow & Accelerated Demo Timer Control */}
      <div className="surface-card p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="h-8 w-8 rounded-xl bg-[#EAF0FF] text-[#315EF2] flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4" />
            </span>
            <h2 className="font-display text-sm font-bold text-[#101C3A]">
              Automated {maxAwayMinutes}-Minute Absence Engine
            </h2>
            <span
              className={`font-mono text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border ${
                sensorSystem.demoTimerEnabled
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              {sensorSystem.demoTimerEnabled
                ? 'ACCELERATED DEMO TIMER (1s = 1m)'
                : `PRODUCTION TIMER (${maxAwayMinutes} REAL MINS)`}
            </span>
          </div>
          <p className="text-xs text-[#68748A] leading-relaxed max-w-2xl">
            Runs continuously on the backend even if browsers close or devices disconnect. Sends a
            single 5-minute warning at{' '}
            <span className="font-mono font-semibold text-[#101C3A]">
              {sensorSystem.demoTimerEnabled ? `${maxAwayMinutes - 5}s` : `${maxAwayMinutes - 5}m`}
            </span>{' '}
            and automatically expires unclaimed reservations + triggers violation policy at{' '}
            <span className="font-mono font-semibold text-[#101C3A]">
              {sensorSystem.demoTimerEnabled ? `${maxAwayMinutes}s` : `${maxAwayMinutes}m`}
            </span>
            . A returning <span className="font-mono font-semibold text-[#101C3A]">PRESENT</span>{' '}
            signal before deadline cancels expiry with zero violation.
          </p>
          {timerFeedback && (
            <div className="text-xs font-semibold text-[#315EF2] pt-0.5">{timerFeedback}</div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={togglingTimer || !sensorSystem.demoTimerEnabled}
            onClick={() => void handleToggleTimerMode(false)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap ${
              !sensorSystem.demoTimerEnabled
                ? 'bg-[#101C3A] text-white border-[#101C3A] shadow-xs'
                : 'bg-white text-[#172033] border-slate-200 hover:bg-slate-50'
            }`}
          >
            Production ({maxAwayMinutes} min)
          </button>
          <button
            type="button"
            disabled={togglingTimer || sensorSystem.demoTimerEnabled}
            onClick={() => void handleToggleTimerMode(true)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap ${
              sensorSystem.demoTimerEnabled
                ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
            }`}
          >
            Demo Timer (1s = 1m)
          </button>
        </div>
      </div>

      {/* Dedicated Administrator Sensor Simulator Panel */}
      {selectedSeat && (
        <div className="surface-card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#F5F7FC]/75">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Cpu className="h-4 w-4 text-[#315EF2] shrink-0" />
                <h2 className="font-display text-sm font-bold text-[#101C3A]">
                  Administrator Sensor Simulator
                </h2>
                <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900">
                  DEMO / SIMULATED
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[#68748A]">
                Select any ILS desk to simulate presence, absence ({maxAwayMinutes}-minute
                countdown), or sensor offline alerts. Students cannot access or trigger sensor
                events.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label htmlFor="sim-seat-select" className="text-xs font-semibold text-[#68748A]">
                Target ILS:
              </label>
              <select
                id="sim-seat-select"
                value={selectedSeat.id}
                onChange={(e) => {
                  setSelectedSeatId(e.target.value);
                  setFeedback(null);
                }}
                className="px-3.5 py-2 text-xs font-mono font-semibold text-[#101C3A] bg-white border border-slate-200 rounded-xl focus:border-[#315EF2]"
              >
                {seats.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} ({s.sensorNodeId}) — {getEffectivePresence(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Selected Sensor Live Details */}
            <div className="lg:col-span-7 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs">
                <div className="p-3.5 rounded-xl bg-[#F5F7FC] border border-slate-100">
                  <div className="text-[#68748A] text-[11px]">Sensor ID</div>
                  <div className="mt-1 font-mono font-bold text-[#101C3A]">
                    {selectedSeat.sensorNodeId}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F5F7FC] border border-slate-100">
                  <div className="text-[#68748A] text-[11px]">ILS Number</div>
                  <div className="mt-1 font-mono font-bold text-[#101C3A]">{selectedSeat.id}</div>
                  <div className="text-[11px] text-[#68748A]">{selectedSeat.zone}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F5F7FC] border border-slate-100">
                  <div className="text-[#68748A] text-[11px]">Presence State</div>
                  <div className="mt-1.5">
                    <PresenceBadge state={selectedPresence} />
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F5F7FC] border border-slate-100">
                  <div className="text-[#68748A] text-[11px]">Connectivity</div>
                  <div
                    className={`mt-1 font-semibold ${
                      selectedPresence === 'OFFLINE' ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {selectedPresence === 'OFFLINE' ? 'Offline' : 'Online'}{' '}
                    <span className="font-mono text-[10px] text-[#68748A]">(SIM)</span>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F5F7FC] border border-slate-100">
                  <div className="text-[#68748A] text-[11px]">Assigned Student</div>
                  <div className="mt-1 font-semibold text-[#101C3A] truncate">
                    {selectedSeat.occupantName ?? 'Unassigned'}
                  </div>
                  {selectedSeat.occupantErp && (
                    <div className="font-mono text-[11px] text-[#68748A]">
                      ERP {selectedSeat.occupantErp}
                    </div>
                  )}
                </div>
                <div className="p-3.5 rounded-xl bg-[#F5F7FC] border border-slate-100">
                  <div className="text-[#68748A] text-[11px]">Seat Status</div>
                  <div className="mt-1">
                    <SeatStatusLabel status={selectedSeat.status} compact />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                <div className="p-3.5 rounded-xl border border-slate-100 bg-white flex items-center justify-between gap-3">
                  <span className="text-[#68748A]">Last Event Timestamp</span>
                  <span className="font-mono text-[11px] font-medium text-[#101C3A] tabular-nums">
                    {formatTimestamp(selectedSeat.lastSensorEventAt)}
                  </span>
                </div>
                <div
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                    selectedSeat.absenceWarningSentAt || selectedCountdown.inWarningWindow
                      ? 'border-rose-200 bg-rose-50/70'
                      : selectedCountdown.active
                        ? 'border-amber-200 bg-amber-50/70'
                        : 'border-slate-100 bg-white'
                  }`}
                >
                  <span className="text-[#172033] inline-flex items-center gap-1.5">
                    <Clock
                      className={`h-3.5 w-3.5 shrink-0 ${
                        selectedSeat.absenceWarningSentAt || selectedCountdown.inWarningWindow
                          ? 'text-rose-700'
                          : 'text-amber-700'
                      }`}
                    />
                    <span>
                      Absence Countdown ({maxAwayMinutes}m)
                      {selectedSeat.absenceWarningSentAt && (
                        <span className="ml-1.5 font-mono text-[10px] font-bold text-rose-700">
                          · 5m WARNING SENT
                        </span>
                      )}
                    </span>
                  </span>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      selectedPresence === 'OFFLINE' && selectedSeat.occupantErp
                        ? 'text-rose-700'
                        : selectedSeat.absenceWarningSentAt || selectedCountdown.inWarningWindow
                          ? 'text-rose-700'
                          : selectedCountdown.active
                            ? 'text-amber-800'
                            : 'text-[#68748A]'
                    }`}
                  >
                    {selectedPresence === 'OFFLINE' && selectedSeat.occupantErp
                      ? 'Paused (Offline)'
                      : selectedCountdown.active
                        ? selectedCountdown.label
                        : 'Not running'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Simulation Controls */}
            <div className="lg:col-span-5 flex flex-col gap-3.5 p-5 rounded-2xl border border-slate-200/80 bg-[#F5F7FC]/75">
              <div className="font-display text-xs font-bold text-[#101C3A]">
                Simulate Sensor Signal for {selectedSeat.id}
              </div>
              <p className="text-xs text-[#68748A] leading-relaxed">
                Every valid signal is validated against duplicate states and a{' '}
                <span className="font-mono font-semibold text-[#101C3A]">
                  {Math.round(sensorSystem.debounceWindowMs / 1000)}s
                </span>{' '}
                debounce window before being persisted to{' '}
                <span className="font-mono text-[#101C3A]">sensor_events</span>.
              </p>

              <div className="grid grid-cols-1 gap-2.5 mt-1">
                <button
                  type="button"
                  disabled={submitting !== null}
                  onClick={() => void handleSimulate('PRESENT')}
                  className="w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-between shadow-xs transition-all cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <UserCheck className="h-4 w-4 shrink-0" />
                    {submitting === 'PRESENT' ? 'Sending PRESENT…' : 'Simulate Student PRESENT'}
                  </span>
                  <span className="font-mono text-[11px] opacity-90">OCCUPIED</span>
                </button>

                <button
                  type="button"
                  disabled={submitting !== null}
                  onClick={() => void handleSimulate('ABSENT')}
                  className="w-full px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-between shadow-xs transition-all cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <UserMinus className="h-4 w-4 shrink-0" />
                    {submitting === 'ABSENT' ? 'Sending ABSENT…' : 'Simulate Student ABSENT'}
                  </span>
                  <span className="font-mono text-[11px] opacity-90">
                    {selectedSeat.occupantErp ? `${maxAwayMinutes}m AWAY` : 'AVAILABLE'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={submitting !== null}
                  onClick={() => void handleSimulate('OFFLINE')}
                  className="w-full px-4 py-3 rounded-xl bg-[#101C3A] hover:bg-[#172554] disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-between shadow-xs transition-all cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <WifiOff className="h-4 w-4 shrink-0" />
                    {submitting === 'OFFLINE' ? 'Sending OFFLINE…' : 'Simulate Sensor OFFLINE'}
                  </span>
                  <span className="font-mono text-[11px] opacity-90">ALERT ONLY</span>
                </button>
              </div>

              {feedback && (
                <div
                  className={`mt-1 p-3.5 rounded-xl border text-xs leading-relaxed ${
                    feedback.tone === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : feedback.tone === 'warning'
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {feedback.tone === 'success' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold">{feedback.text}</div>
                      {feedback.detail && (
                        <div className="mt-1 text-[11px] opacity-85 font-mono">
                          {feedback.detail}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* All 30 Sensor Nodes Table */}
      <div className="surface-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F5F7FC] border border-slate-200/80 rounded-xl w-fit">
            {(['ALL', 'PRESENT', 'ABSENT', 'OFFLINE'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStateFilter(tab)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  stateFilter === tab
                    ? 'bg-[#101C3A] text-white shadow-xs'
                    : 'text-[#68748A] hover:text-[#101C3A]'
                }`}
              >
                {tab === 'ALL' ? `All 30 Sensors` : tab}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="h-4 w-4 text-[#68748A] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ILS, Sensor ID, or student…"
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl text-[#172033] focus:border-[#315EF2]"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-[#F5F7FC] text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                <th className="py-3.5 px-4">Sensor ID</th>
                <th className="py-3.5 px-4">ILS Number</th>
                <th className="py-3.5 px-4">Presence State</th>
                <th className="py-3.5 px-4">Connectivity</th>
                <th className="py-3.5 px-4">Assigned Student</th>
                <th className="py-3.5 px-4">Absence Countdown</th>
                <th className="py-3.5 px-4">Last Event</th>
                <th className="py-3.5 px-4 text-right">Simulate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredSeats.map((seat) => {
                const presence = getEffectivePresence(seat);
                const countdown = formatCountdown(
                  seat.graceExpiresAt,
                  nowMs,
                  seat.absenceTimerMode
                );
                const isSelected = selectedSeat?.id === seat.id;

                return (
                  <tr
                    key={seat.id}
                    onClick={() => {
                      setSelectedSeatId(seat.id);
                      setFeedback(null);
                    }}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#EAF0FF]/60'
                        : presence === 'OFFLINE'
                          ? 'bg-rose-50/45 hover:bg-rose-50/80'
                          : 'hover:bg-[#F5F7FC]/75'
                    }`}
                  >
                    <td className="py-3.5 px-4 font-mono font-semibold text-[#101C3A] whitespace-nowrap">
                      {seat.sensorNodeId}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="font-mono font-bold text-[#101C3A]">{seat.id}</span>
                      <span className="ml-2 text-[#68748A]">{seat.zone}</span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <PresenceBadge state={presence} />
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`font-semibold ${
                          presence === 'OFFLINE' ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {presence === 'OFFLINE' ? 'Offline' : 'Online'}
                      </span>
                      <span className="ml-1.5 font-mono text-[10px] text-[#68748A]">SIM</span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {seat.occupantName ? (
                        <>
                          <span className="font-semibold text-[#101C3A]">{seat.occupantName}</span>
                          <span className="ml-1.5 font-mono text-[#68748A]">
                            ({seat.occupantErp})
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums whitespace-nowrap">
                      {presence === 'OFFLINE' && seat.occupantErp ? (
                        <span className="text-rose-700 font-semibold">Paused · Offline</span>
                      ) : countdown.active ? (
                        <span
                          className={`font-semibold ${
                            seat.absenceWarningSentAt ||
                            countdown.inWarningWindow ||
                            countdown.expired
                              ? 'text-rose-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {countdown.label}
                          {seat.absenceWarningSentAt ? ' · 5m WARN' : ''}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#68748A] tabular-nums whitespace-nowrap">
                      {formatTimestamp(seat.lastSensorEventAt)}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSeatId(seat.id);
                          setFeedback(null);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#315EF2] text-white'
                            : 'text-[#315EF2] hover:bg-[#EAF0FF]'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredSeats.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-xs text-[#68748A]">
                    No sensors match the active filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Database Sensor Events Log */}
      <div className="surface-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-bold text-[#101C3A]">
              Recorded Sensor Events Log
            </h2>
            <p className="text-xs text-[#68748A]">
              Every accepted presence, absence, and offline signal stored in the database.
            </p>
          </div>
          <span className="font-mono text-xs font-semibold text-[#315EF2] bg-[#EAF0FF] px-2.5 py-1 rounded-lg tabular-nums">
            Latest {sensorEvents.length} events
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-[#F5F7FC] text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                <th className="py-3 px-4">Event ID</th>
                <th className="py-3 px-4">ILS</th>
                <th className="py-3 px-4">Sensor ID</th>
                <th className="py-3 px-4">State</th>
                <th className="py-3 px-4">Origin</th>
                <th className="py-3 px-4">Details</th>
                <th className="py-3 px-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {sensorEvents.slice(0, 25).map((ev) => {
                const state: SensorPresenceState =
                  ev.signalState ??
                  (ev.presenceStatus === 'Present'
                    ? 'PRESENT'
                    : ev.presenceStatus === 'Unknown'
                      ? 'OFFLINE'
                      : 'ABSENT');
                return (
                  <tr key={ev.id} className="hover:bg-[#F5F7FC]/70 transition-colors">
                    <td className="py-3 px-4 font-mono text-[#101C3A] whitespace-nowrap">
                      {ev.id}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-[#101C3A] whitespace-nowrap">
                      {ev.seatId}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#68748A] whitespace-nowrap">
                      {ev.sensorId}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <PresenceBadge state={state} />
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`font-mono text-[11px] font-semibold ${
                          ev.isSimulated !== false ? 'text-amber-700' : 'text-[#0F8B7C]'
                        }`}
                      >
                        {ev.isSimulated !== false ? 'DEMO / SIMULATED' : 'IoT Hardware'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#172033] max-w-md truncate">
                      {ev.note ?? ev.source}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[#68748A] tabular-nums whitespace-nowrap">
                      {ev.timestamp}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collapsible Future Physical IoT Hardware API Contract */}
      <div className="surface-card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowIotDocs((prev) => !prev)}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-[#F5F7FC]/70 transition-colors cursor-pointer"
        >
          <div>
            <h2 className="font-display text-sm font-bold text-[#101C3A]">
              Future Physical IoT Hardware Integration Endpoint
            </h2>
            <p className="mt-0.5 text-xs text-[#68748A]">
              Status:{' '}
              <span className="font-semibold text-[#101C3A]">
                {sensorSystem.hardwareConnected
                  ? 'Server API key configured — ready to accept hardware payloads'
                  : 'Not connected yet — operating in DEMO / SIMULATED mode'}
              </span>
            </p>
          </div>
          {showIotDocs ? (
            <ChevronUp className="h-4 w-4 text-[#68748A] shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[#68748A] shrink-0" />
          )}
        </button>

        {showIotDocs && (
          <div className="px-6 pb-6 pt-3 border-t border-slate-100 space-y-3 text-xs text-[#172033]">
            <p className="leading-relaxed">
              When physical desk occupancy sensors (PIR, ToF, or pressure nodes) are installed at
              IBA Main Campus, set the server environment secret{' '}
              <code className="font-mono px-1.5 py-0.5 bg-[#EAF0FF] text-[#315EF2] rounded">
                IOT_SENSOR_API_KEY
              </code>{' '}
              and configure your campus IoT gateway to send authenticated HTTPS requests to:
            </p>
            <div className="p-4 rounded-xl bg-[#101C3A] text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed">
              <div>POST {sensorSystem.iotEndpoint}</div>
              <div>Content-Type: application/json</div>
              <div>X-Sensor-API-Key: &lt;server IOT_SENSOR_API_KEY&gt;</div>
              <div className="mt-2 text-[#2DD4BF]">
                {`{ "sensorId": "NODE-ILS-05", "state": "PRESENT" | "ABSENT" | "OFFLINE" }`}
              </div>
            </div>
            <p className="text-[#68748A]">
              Both simulated and future hardware signals pass through the same server-side
              duplicate filter, {Math.round(sensorSystem.debounceWindowMs / 1000)}-second debounce
              guard, 20-minute absence countdown engine, and offline violation-protection safeguard.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
