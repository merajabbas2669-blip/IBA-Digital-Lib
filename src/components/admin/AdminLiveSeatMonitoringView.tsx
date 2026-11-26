import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  History,
  Radio,
  Unlock,
  Wrench,
} from 'lucide-react';
import {
  AdminInterventionLog,
  ILSSeat,
  ReservationRecord,
  SeatStatus,
  SeatZone,
} from '../../types/ils';
import { PageHeader, SeatStatusLabel } from '../shared/DesignSystem';

interface AdminLiveSeatMonitoringViewProps {
  seats: ILSSeat[];
  reservations: ReservationRecord[];
  interventions: AdminInterventionLog[];
  onUpdateStatus: (
    seatId: string,
    status: SeatStatus,
    note?: string
  ) => Promise<{ ok: boolean; message: string }>;
  onReleaseReservation: (
    reservationId: string,
    reason?: string
  ) => Promise<{ ok: boolean; message: string }>;
}

const SEAT_STATUS_TILE_STYLE: Record<SeatStatus, string> = {
  available:
    'border-emerald-200/90 bg-emerald-50/55 hover:border-emerald-400 hover:bg-emerald-50/90',
  occupied: 'border-rose-200/90 bg-rose-50/50 hover:border-rose-400 hover:bg-rose-50/90',
  away: 'border-amber-200/90 bg-amber-50/60 hover:border-amber-400 hover:bg-amber-50/95',
  maintenance: 'border-slate-200/90 bg-slate-100/75 hover:border-slate-400 hover:bg-slate-100',
};

const SEAT_DOT_STYLE: Record<SeatStatus, string> = {
  available: 'bg-emerald-500',
  occupied: 'bg-rose-500',
  away: 'bg-amber-500',
  maintenance: 'bg-slate-400',
};

function formatPktDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}

function formatRemainingCountdown(graceExpiresAt?: string, nowMs?: number): string {
  if (!graceExpiresAt) return 'Not applicable';
  const targetMs = new Date(graceExpiresAt).getTime();
  if (Number.isNaN(targetMs)) return '—';
  const diffSec = Math.max(0, Math.ceil((targetMs - (nowMs ?? Date.now())) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const AdminLiveSeatMonitoringView: React.FC<AdminLiveSeatMonitoringViewProps> = ({
  seats,
  reservations,
  interventions,
  onUpdateStatus,
  onReleaseReservation,
}) => {
  const [selectedSeatId, setSelectedSeatId] = useState<string>(seats[0]?.id ?? 'ILS-01');
  const [zoneFilter, setZoneFilter] = useState<'ALL' | SeatZone>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SeatStatus>('ALL');
  const [interventionReason, setInterventionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredSeats = useMemo(() => {
    return seats.filter((s) => {
      if (zoneFilter !== 'ALL' && s.zone !== zoneFilter) return false;
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      return true;
    });
  }, [seats, statusFilter, zoneFilter]);

  const selectedSeat = useMemo(
    () => seats.find((s) => s.id === selectedSeatId) ?? seats[0],
    [seats, selectedSeatId]
  );

  const seatReservations = useMemo(() => {
    if (!selectedSeat) return [];
    return reservations.filter((r) => r.seatId === selectedSeat.id);
  }, [reservations, selectedSeat]);

  const activeSeatReservation = useMemo(() => {
    return seatReservations.find(
      (r) => r.status === 'Active' || r.status === 'Temporarily Away'
    );
  }, [seatReservations]);

  const seatInterventions = useMemo(() => {
    return interventions.filter(
      (i) =>
        i.category === 'SEAT_RELEASE' ||
        i.category === 'SEAT_MAINTENANCE' ||
        i.category === 'SEAT_STATUS_OVERRIDE'
    );
  }, [interventions]);

  const showMessage = (res: { ok: boolean; message: string }) => {
    setFeedback(res);
    setTimeout(() => setFeedback(null), 4500);
  };

  const handleManualRelease = async () => {
    if (!selectedSeat) return;
    setSubmitting(true);
    try {
      const note =
        interventionReason.trim() ||
        `Manual staff release executed from Live Seat Monitoring for ${selectedSeat.id}.`;
      const res = activeSeatReservation
        ? await onReleaseReservation(activeSeatReservation.id, note)
        : await onUpdateStatus(selectedSeat.id, 'available', note);
      showMessage(res);
      if (res.ok) setInterventionReason('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMaintenanceToggle = async () => {
    if (!selectedSeat) return;
    setSubmitting(true);
    try {
      const targetStatus: SeatStatus =
        selectedSeat.status === 'maintenance' ? 'available' : 'maintenance';
      const note =
        interventionReason.trim() ||
        (targetStatus === 'maintenance'
          ? `Placed ${selectedSeat.id} under administrative maintenance.`
          : `Restored ${selectedSeat.id} to operational available status.`);
      const res = await onUpdateStatus(selectedSeat.id, targetStatus, note);
      showMessage(res);
      if (res.ok) setInterventionReason('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Seat Monitoring"
        description="Monitor all 30 Individual Learning Spaces (ILS-01 through ILS-30) in real time, inspect live occupancy and absence timers, review desk reservation history, and log manual staff interventions."
      />

      {feedback && (
        <div
          role="status"
          className={`rounded-2xl border px-4 py-3.5 text-xs font-medium shadow-xs ${
            feedback.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Filter Bar */}
      <div className="surface-card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['ALL', 'Quiet Zone A', 'Research Zone B', 'Focus Zone C'] as const).map((zone) => (
            <button
              key={zone}
              type="button"
              onClick={() => setZoneFilter(zone)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                zoneFilter === zone
                  ? 'bg-[#101C3A] text-white shadow-xs'
                  : 'bg-[#F5F7FC] text-[#68748A] hover:text-[#101C3A] hover:bg-slate-200/60'
              }`}
            >
              {zone === 'ALL' ? 'All 30 ILS' : zone}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['ALL', 'All Statuses'],
              ['available', 'Available'],
              ['occupied', 'Occupied'],
              ['away', 'Temporarily Away'],
              ['maintenance', 'Maintenance'],
            ] as const
          ).map(([st, label]) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-[#315EF2] text-white border-[#315EF2] shadow-xs'
                  : 'bg-white text-[#68748A] border-slate-200 hover:border-slate-300 hover:text-[#101C3A]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split: 30-Seat Grid + Detailed Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* 30-Seat Live Grid */}
        <section className="xl:col-span-7 surface-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
            <div>
              <h2 className="font-display text-base font-bold text-[#101C3A]">
                Live ILS Floor Grid ({filteredSeats.length} desks shown)
              </h2>
              <p className="text-xs text-[#68748A] mt-0.5">
                Click any desk tile to inspect occupancy telemetry and execute staff controls
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {filteredSeats.map((seat) => {
              const isSelected = selectedSeat?.id === seat.id;
              return (
                <button
                  key={seat.id}
                  type="button"
                  onClick={() => setSelectedSeatId(seat.id)}
                  className={`p-3.5 rounded-2xl border text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm cursor-pointer ${
                    SEAT_STATUS_TILE_STYLE[seat.status]
                  } ${isSelected ? 'ring-2 ring-[#315EF2] ring-offset-2 shadow-sm' : ''}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-xs font-bold text-[#101C3A]">{seat.id}</span>
                    <span className={`h-2.5 w-2.5 rounded-full ${SEAT_DOT_STYLE[seat.status]}`} />
                  </div>
                  <div className="mt-2 text-[11px] font-semibold text-[#172033] truncate">
                    {seat.occupantName ??
                      (seat.status === 'maintenance' ? 'Maintenance' : 'Available')}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-[#68748A] tabular-nums">
                    <span>{seat.sensorPresence ?? 'ABSENT'}</span>
                    {seat.status === 'away' && seat.graceExpiresAt ? (
                      <span className="text-amber-800 font-bold">
                        {formatRemainingCountdown(seat.graceExpiresAt, nowMs)}
                      </span>
                    ) : (
                      <span>{seat.reservedUntil ?? 'Open'}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Detailed Selected Seat Inspector (All 9 Required Fields + Manual Controls) */}
        <section className="xl:col-span-5 surface-card overflow-hidden xl:sticky xl:top-20">
          {selectedSeat ? (
            <div className="divide-y divide-slate-100">
              <div className="p-6 flex items-start justify-between gap-3 bg-[#F5F7FC]/80">
                <div>
                  <div className="text-[11px] font-semibold text-[#315EF2] uppercase tracking-wider">
                    {selectedSeat.zone} · {selectedSeat.floor}
                  </div>
                  <h2 className="text-2xl font-bold font-mono text-[#101C3A] mt-0.5">
                    {selectedSeat.id}
                  </h2>
                </div>
                <SeatStatusLabel status={selectedSeat.status} />
              </div>

              {/* Required Seat Telemetry Grid */}
              <div className="p-6 grid grid-cols-2 gap-x-4 gap-y-4 text-xs">
                <div className="rounded-xl bg-[#F5F7FC]/70 p-3">
                  <div className="text-[11px] font-medium text-[#68748A]">ILS Number</div>
                  <div className="mt-1 font-mono font-semibold text-[#101C3A]">
                    {selectedSeat.id} (#{selectedSeat.number})
                  </div>
                </div>

                <div className="rounded-xl bg-[#F5F7FC]/70 p-3">
                  <div className="text-[11px] font-medium text-[#68748A]">Assigned Student</div>
                  <div className="mt-1 font-semibold text-[#101C3A] truncate">
                    {selectedSeat.occupantName ?? 'Unassigned'}
                  </div>
                </div>

                <div className="rounded-xl bg-[#F5F7FC]/70 p-3">
                  <div className="text-[11px] font-medium text-[#68748A]">Student ID (ERP)</div>
                  <div className="mt-1 font-mono text-[#101C3A]">
                    {selectedSeat.occupantErp ?? '—'}
                  </div>
                </div>

                <div className="rounded-xl bg-[#F5F7FC]/70 p-3">
                  <div className="text-[11px] font-medium text-[#68748A]">
                    Reservation Start Time
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-[#101C3A] tabular-nums">
                    {activeSeatReservation?.startTimestamp
                      ? formatPktDateTime(activeSeatReservation.startTimestamp)
                      : selectedSeat.reservationStartTime ?? '—'}
                  </div>
                </div>

                <div className="rounded-xl bg-[#F5F7FC]/70 p-3">
                  <div className="text-[11px] font-medium text-[#68748A]">Sensor Status</div>
                  <div className="mt-1 font-mono font-semibold text-[#101C3A] flex items-center gap-1.5">
                    <Radio className="h-3.5 w-3.5 text-[#19B6A4] shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {selectedSeat.sensorPresence ?? 'ABSENT'} ({selectedSeat.sensorState})
                    </span>
                  </div>
                </div>

                <div className="rounded-xl bg-[#F5F7FC]/70 p-3">
                  <div className="text-[11px] font-medium text-[#68748A]">Departure Time</div>
                  <div className="mt-1 font-mono text-[11px] text-[#101C3A] tabular-nums">
                    {selectedSeat.departureTimestamp
                      ? formatPktDateTime(selectedSeat.departureTimestamp)
                      : selectedSeat.awaySince ?? '—'}
                  </div>
                </div>

                <div className="rounded-xl bg-[#F5F7FC]/70 p-3">
                  <div className="text-[11px] font-medium text-[#68748A]">Remaining Countdown</div>
                  <div
                    className={`mt-1 font-mono font-bold tabular-nums flex items-center gap-1.5 ${
                      selectedSeat.status === 'away' ? 'text-amber-700' : 'text-[#68748A]'
                    }`}
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {selectedSeat.status === 'away' && selectedSeat.graceExpiresAt
                        ? formatRemainingCountdown(selectedSeat.graceExpiresAt, nowMs)
                        : 'No active countdown'}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl bg-[#F5F7FC]/70 p-3">
                  <div className="text-[11px] font-medium text-[#68748A]">Expiry Time</div>
                  <div className="mt-1 font-mono text-[11px] text-[#101C3A] tabular-nums">
                    {selectedSeat.status === 'away' && selectedSeat.graceExpiresAt
                      ? formatPktDateTime(selectedSeat.graceExpiresAt)
                      : activeSeatReservation?.expiryTimestamp
                        ? formatPktDateTime(activeSeatReservation.expiryTimestamp)
                        : selectedSeat.reservedUntil ?? '—'}
                  </div>
                </div>
              </div>

              {selectedSeat.maintenanceNote && (
                <div className="px-6 py-3.5 bg-slate-50 text-xs text-[#172033]">
                  <strong className="text-[#101C3A]">Maintenance Note:</strong>{' '}
                  {selectedSeat.maintenanceNote}
                </div>
              )}

              {/* Authorized Manual Staff Interventions */}
              <div className="p-6 space-y-3.5 bg-[#F5F7FC]/40">
                <div className="font-display text-xs font-bold text-[#101C3A]">
                  Authorized Manual Interventions (Logged to Audit Trail)
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#68748A] mb-1.5">
                    Intervention Reason / Staff Note
                  </label>
                  <input
                    type="text"
                    value={interventionReason}
                    onChange={(e) => setInterventionReason(e.target.value)}
                    placeholder="e.g., Power outlet fault reported, or student requested desk release..."
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {(selectedSeat.status === 'occupied' || selectedSeat.status === 'away') && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleManualRelease()}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer whitespace-nowrap"
                    >
                      <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Manually Release Seat</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleMaintenanceToggle()}
                    className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                      selectedSeat.status === 'maintenance'
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-[#101C3A] hover:bg-[#172554] text-white'
                    }`}
                  >
                    {selectedSeat.status === 'maintenance' ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Restore to Available</span>
                      </>
                    ) : (
                      <>
                        <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Mark Under Maintenance</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Per-Seat Reservation History */}
              <div className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xs font-bold text-[#101C3A]">
                    Reservation History — {selectedSeat.id} ({seatReservations.length})
                  </h3>
                </div>
                {seatReservations.length === 0 ? (
                  <p className="text-xs text-[#68748A]">
                    No reservation records logged for {selectedSeat.id} yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto max-h-60 overflow-y-auto border border-slate-100 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#F5F7FC] border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                          <th className="py-2.5 px-3">Date &amp; Window</th>
                          <th className="py-2.5 px-3">Student</th>
                          <th className="py-2.5 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {seatReservations.slice(0, 12).map((res) => (
                          <tr key={res.id} className="hover:bg-[#F5F7FC]/70 transition-colors">
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[#172033] whitespace-nowrap tabular-nums">
                              <div>{res.date}</div>
                              <div className="text-[#68748A]">
                                {res.startTime}–{res.endTime}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-[#101C3A]">{res.studentName}</div>
                              <div className="font-mono text-[10px] text-[#68748A]">
                                ERP {res.studentErp}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-[11px] font-semibold text-[#101C3A] whitespace-nowrap">
                              {res.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {/* Recorded Manual Interventions Log */}
      <section className="surface-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 rounded-xl bg-[#EAF0FF] text-[#315EF2] flex items-center justify-center shrink-0">
              <History className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-sm font-bold text-[#101C3A]">
                Recorded Seat Manual Interventions ({seatInterventions.length})
              </h2>
              <p className="text-xs text-[#68748A]">
                Permanent database log of every manual release and maintenance status override.
              </p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F5F7FC] border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-[#68748A]">
                <th className="py-3 px-4">Timestamp (PKT)</th>
                <th className="py-3 px-4">ILS Seat</th>
                <th className="py-3 px-4">Transition</th>
                <th className="py-3 px-4">Affected Student</th>
                <th className="py-3 px-4">Documented Reason</th>
                <th className="py-3 px-4">Administrator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {seatInterventions.slice(0, 15).map((log) => (
                <tr key={log.id} className="hover:bg-[#F5F7FC]/70 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-[11px] text-[#68748A] whitespace-nowrap tabular-nums">
                    {formatPktDateTime(log.performedAt)}
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-[#101C3A] whitespace-nowrap">
                    {log.seatId ?? log.targetId}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-[#68748A] whitespace-nowrap">
                    {log.previousState ?? '—'} →{' '}
                    <strong className="text-[#101C3A]">{log.newState}</strong>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap text-[#172033]">
                    {log.studentName
                      ? `${log.studentName} (${log.studentErp})`
                      : log.studentErp ?? 'None'}
                  </td>
                  <td className="py-3.5 px-4 text-[#172033] max-w-md">{log.reason}</td>
                  <td className="py-3.5 px-4 whitespace-nowrap text-[#68748A]">
                    {log.performedByName}
                  </td>
                </tr>
              ))}
              {seatInterventions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#68748A]">
                    No manual seat interventions have been recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
