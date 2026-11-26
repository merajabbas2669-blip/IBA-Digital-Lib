import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  QrCode,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useILS } from '../../context/ILSContext';
import { ASSETS } from '../../data/initialData';
import { ILSSeat, SeatStatus, SeatZone, UserRole } from '../../types/ils';
import {
  IBACrestMark,
  SafeImage,
  SeatGrid30,
  SeatLegend,
  SeatStatusLabel,
  SeatSummaryStrip,
} from '../shared/DesignSystem';

export const LandingPage: React.FC = () => {
  const {
    seats,
    seatCounts,
    pendingScannedQr,
    authBootstrap,
    loginWithCredentials,
    registerRealStudent,
    setupInitialAdminPassword,
    loginAsDemoStudent,
  } = useILS();

  const [loginRole, setLoginRole] = useState<UserRole>('student');
  const [studentAuthMode, setStudentAuthMode] = useState<'login' | 'register'>('login');

  // Login form state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Registration form state (Real student account)
  const [regErpId, setRegErpId] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regProgram, setRegProgram] = useState('BS Computer Science');
  const [regBatch, setRegBatch] = useState('Class of 2028');
  const [regPassword, setRegPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Collapsible Demo Accounts Drawer state
  const [demoDrawerOpen, setDemoDrawerOpen] = useState(false);
  const [demoSearch, setDemoSearch] = useState('');
  const [demoLoadingId, setDemoLoadingId] = useState<string | null>(null);

  // Live 30-seat preview filters
  const [selectedZone, setSelectedZone] = useState<SeatZone | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<SeatStatus | 'all'>('all');
  const [inspectedSeat, setInspectedSeat] = useState<ILSSeat | null>(null);

  const loginSectionRef = useRef<HTMLDivElement>(null);

  const filteredDemoStudents = useMemo(() => {
    const q = demoSearch.trim().toLowerCase();
    if (!q) return authBootstrap.demoStudents;
    return authBootstrap.demoStudents.filter((st) =>
      `${st.erpId} ${st.name} ${st.email} ${st.program}`.toLowerCase().includes(q)
    );
  }, [authBootstrap.demoStudents, demoSearch]);

  const handleRoleSwitch = (next: UserRole) => {
    setLoginRole(next);
    setFormError(null);
    setPassword('');
    setConfirmPassword('');
    if (next === 'admin') {
      setIdentifier(authBootstrap.adminAccount?.email ?? 's.qureshi@iba.edu.pk');
    } else {
      setIdentifier('');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (loginRole === 'admin' && authBootstrap.adminSetupRequired) {
      if (password.length < 8) {
        setFormError('Administrator password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setFormError('Passwords do not match.');
        return;
      }
      setSubmitting(true);
      const res = await setupInitialAdminPassword(password);
      setSubmitting(false);
      if (!res.ok) setFormError(res.message);
      return;
    }

    if (!identifier.trim() || !password) {
      setFormError('Please enter your institutional ID/email and password.');
      return;
    }

    setSubmitting(true);
    const res = await loginWithCredentials(identifier.trim(), password, loginRole);
    setSubmitting(false);
    if (!res.ok) setFormError(res.message);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    const res = await registerRealStudent({
      erpId: regErpId.trim(),
      fullName: regFullName.trim(),
      email: regEmail.trim(),
      program: regProgram,
      batch: regBatch,
      password: regPassword,
    });
    setSubmitting(false);
    if (!res.ok) setFormError(res.message);
  };

  const handleDemoStudentSignIn = async (erpId: string) => {
    setFormError(null);
    setDemoLoadingId(erpId);
    const res = await loginAsDemoStudent(erpId);
    setDemoLoadingId(null);
    if (!res.ok) setFormError(res.message);
  };

  const scrollToLogin = (preferredRole?: UserRole, openDemo = false) => {
    if (preferredRole) handleRoleSwitch(preferredRole);
    if (openDemo) setDemoDrawerOpen(true);
    loginSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const currentInspected = seats.find((s) => s.id === inspectedSeat?.id) ?? seats[0];

  return (
    <div className="min-h-screen bg-[#F5F7FC] text-[#172033] flex flex-col">
      {/* Top Navigation Bar — Strict 3-Zone Contract */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-8">
          <a
            href="#overview"
            className="inline-flex items-center gap-2 sm:gap-2.5 font-display text-sm sm:text-base font-bold tracking-tight text-[#101C3A] whitespace-nowrap shrink-0"
          >
            <IBACrestMark size="sm" />
            <span>IBA Digital Library</span>
          </a>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#68748A]"
          >
            <a
              href="#overview"
              className="hover:text-[#101C3A] transition-colors whitespace-nowrap shrink-0"
            >
              Overview
            </a>
            <a
              href="#availability"
              className="hover:text-[#101C3A] transition-colors whitespace-nowrap shrink-0"
            >
              Availability
            </a>
            <a
              href="#smart-ils"
              className="hover:text-[#101C3A] transition-colors whitespace-nowrap shrink-0"
            >
              Smart ILS
            </a>
            <a
              href="#portals"
              className="hover:text-[#101C3A] transition-colors whitespace-nowrap shrink-0"
            >
              Portals
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => scrollToLogin()}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#315EF2] hover:bg-[#244AD4] rounded-xl shadow-sm shadow-[#315EF2]/25 transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              Portal Sign In
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section & Dual-Role Authentication Panel */}
        <section
          id="overview"
          className="relative overflow-hidden bg-gradient-to-br from-[#0D1730] via-[#101C3A] to-[#172554] text-white"
        >
          {/* Subtle Architectural Grid Pattern */}
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern id="landing-hero-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M 36 0 L 0 0 0 36" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#landing-hero-grid)" />
          </svg>

          <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 pt-8 pb-14 lg:pt-16 lg:pb-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
              {/* Left Column: Editorial Positioning + Architectural Photo */}
              <div className="lg:col-span-7 flex flex-col justify-between gap-6 sm:gap-8">
                <div>
                  <div className="flex items-center gap-3.5">
                    <IBACrestMark light size="lg" />
                    <div className="min-w-0">
                      <div className="text-[11px] sm:text-xs font-semibold text-[#2DD4BF] tracking-wide">
                        Institute of Business Administration, Karachi
                      </div>
                      <div className="text-xs text-blue-200/85 font-medium mt-0.5">
                        Mian Muhammad Abdullah Library
                      </div>
                    </div>
                  </div>

                  <h1 className="mt-3 sm:mt-4 font-display font-bold tracking-tight text-white text-[clamp(1.75rem,3.6vw,3.35rem)] leading-[1.1] text-balance max-w-2xl">
                    Smart ILS Management System for Focused Academic Study
                  </h1>

                  <p className="mt-3.5 sm:mt-5 text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
                    Reserve, monitor, and govern all 30 Individual Learning Spaces across IBA
                    Karachi’s Digital Library. Authenticated role access, QR-verified check-in, and
                    transparent fair-use policies keep study carrels accessible for every student.
                  </p>

                  <div className="mt-5 flex items-center gap-2.5 lg:hidden">
                    <button
                      type="button"
                      onClick={() => scrollToLogin('student', false)}
                      className="flex-1 min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white text-[#101C3A] font-display text-sm font-bold shadow-lg shadow-black/20 active:scale-[0.98] transition-transform cursor-pointer"
                    >
                      <span>Get Started</span>
                      <ArrowRight className="h-4 w-4 text-[#315EF2]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollToLogin('student', true)}
                      className="min-h-[46px] px-4 py-3 rounded-2xl bg-white/10 border border-white/20 text-white text-xs font-semibold active:scale-[0.98] transition-transform cursor-pointer whitespace-nowrap"
                    >
                      Demo Accounts
                    </button>
                  </div>
                </div>

                <div className="relative rounded-2xl overflow-hidden border border-white/15 shadow-2xl shadow-black/30 aspect-[16/9] bg-[#0A1329]">
                  <SafeImage
                    src={ASSETS.heroLibrary}
                    alt="IBA Digital Library Individual Learning Spaces along sunlit glass facade"
                    fallbackLabel="IBA Digital Library — 30 Individual Learning Spaces"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0A1329]/90 via-[#0A1329]/45 to-transparent px-6 py-5 flex flex-wrap items-end justify-between gap-2 text-white">
                    <div>
                      <div className="text-xs font-semibold text-[#2DD4BF]">
                        Floor 2 · North &amp; South Wings
                      </div>
                      <div className="text-sm font-semibold mt-0.5">
                        30 Acoustic Individual Learning Spaces (ILS-01 to ILS-30)
                      </div>
                    </div>
                    <span className="font-mono text-xs tabular-nums text-blue-100 bg-white/10 border border-white/15 px-2.5 py-1 rounded-lg backdrop-blur-xs">
                      Open 08:30 – 21:30
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Dual-Role Authentication Card + Collapsible Demo Accounts */}
              <div ref={loginSectionRef} className="lg:col-span-5 flex flex-col gap-4">
                <div className="bg-white text-[#172033] border border-white/20 rounded-2xl shadow-2xl shadow-black/25 p-6 sm:p-7 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="font-display text-xl font-bold text-[#101C3A]">
                          Portal Access
                        </h2>
                        <p className="mt-1 text-xs text-[#68748A]">
                          Role-protected sign-in backed by salted credential verification.
                        </p>
                      </div>
                      <IBACrestMark size="md" />
                    </div>

                    {pendingScannedQr && (
                      <div className="mt-4 rounded-xl bg-[#EAF0FF] border border-[#DCE6FF] p-3.5 flex items-start gap-2.5 text-xs text-[#101C3A]">
                        <QrCode
                          className="h-4 w-4 text-[#315EF2] shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <span>
                          <strong>Desk QR Code Detected:</strong> Sign in with your IBA student
                          account below to verify availability and confirm your ILS reservation.
                        </span>
                      </div>
                    )}

                    {/* Interactive Role Segmented Control */}
                    <div
                      role="tablist"
                      aria-label="Select portal role"
                      className="mt-5 grid grid-cols-2 p-1 bg-[#F5F7FC] rounded-xl border border-slate-200/80"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={loginRole === 'student'}
                        onClick={() => handleRoleSwitch('student')}
                        className={`py-2.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                          loginRole === 'student'
                            ? 'bg-white text-[#101C3A] shadow-xs'
                            : 'text-[#68748A] hover:text-[#101C3A]'
                        }`}
                      >
                        Student Login
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={loginRole === 'admin'}
                        onClick={() => handleRoleSwitch('admin')}
                        className={`py-2.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                          loginRole === 'admin'
                            ? 'bg-white text-[#101C3A] shadow-xs'
                            : 'text-[#68748A] hover:text-[#101C3A]'
                        }`}
                      >
                        Administrator Login
                      </button>
                    </div>

                    {/* Student Mode Toggle: Sign In vs Register Real Account */}
                    {loginRole === 'student' && (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 text-xs">
                        <span className="text-[#68748A]">
                          {studentAuthMode === 'login'
                            ? 'Sign in with a registered student account'
                            : 'Create a real IBA student account'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setStudentAuthMode(studentAuthMode === 'login' ? 'register' : 'login');
                            setFormError(null);
                          }}
                          className="inline-flex items-center gap-1 font-semibold text-[#315EF2] hover:text-[#244AD4] hover:underline cursor-pointer whitespace-nowrap"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          <span>
                            {studentAuthMode === 'login'
                              ? 'Register Real Account'
                              : 'Back to Sign In'}
                          </span>
                        </button>
                      </div>
                    )}

                    {/* Form Area */}
                    {loginRole === 'student' && studentAuthMode === 'register' ? (
                      <form onSubmit={handleRegisterSubmit} className="mt-4 space-y-3.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="reg-erp"
                              className="block text-xs font-semibold text-[#101C3A] mb-1"
                            >
                              IBA ERP ID
                            </label>
                            <input
                              id="reg-erp"
                              type="text"
                              required
                              value={regErpId}
                              onChange={(e) => setRegErpId(e.target.value)}
                              placeholder="e.g. 28104"
                              className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-slate-200 bg-white text-[#101C3A] focus:border-[#315EF2]"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="reg-name"
                              className="block text-xs font-semibold text-[#101C3A] mb-1"
                            >
                              Full Name
                            </label>
                            <input
                              id="reg-name"
                              type="text"
                              required
                              value={regFullName}
                              onChange={(e) => setRegFullName(e.target.value)}
                              placeholder="e.g. Sara Ahmed"
                              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="reg-email"
                            className="block text-xs font-semibold text-[#101C3A] mb-1"
                          >
                            IBA Student Email
                          </label>
                          <input
                            id="reg-email"
                            type="email"
                            required
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            placeholder="s.ahmed.28104@khi.iba.edu.pk"
                            className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="reg-program"
                              className="block text-xs font-semibold text-[#101C3A] mb-1"
                            >
                              Program
                            </label>
                            <select
                              id="reg-program"
                              value={regProgram}
                              onChange={(e) => setRegProgram(e.target.value)}
                              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
                            >
                              <option value="BS Computer Science">BS Computer Science</option>
                              <option value="BBA">BBA</option>
                              <option value="BS Accounting & Finance">
                                BS Accounting &amp; Finance
                              </option>
                              <option value="BS Data Science">BS Data Science</option>
                              <option value="BS Economics & Mathematics">
                                BS Economics &amp; Mathematics
                              </option>
                              <option value="BS Social Sciences">BS Social Sciences</option>
                            </select>
                          </div>
                          <div>
                            <label
                              htmlFor="reg-batch"
                              className="block text-xs font-semibold text-[#101C3A] mb-1"
                            >
                              Batch
                            </label>
                            <input
                              id="reg-batch"
                              type="text"
                              value={regBatch}
                              onChange={(e) => setRegBatch(e.target.value)}
                              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="reg-password"
                            className="block text-xs font-semibold text-[#101C3A] mb-1"
                          >
                            Password (min 8 characters)
                          </label>
                          <input
                            id="reg-password"
                            type="password"
                            required
                            minLength={8}
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            placeholder="Create a secure password"
                            className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-white text-[#172033] focus:border-[#315EF2]"
                          />
                        </div>

                        {formError && (
                          <p
                            role="alert"
                            className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5"
                          >
                            {formError}
                          </p>
                        )}

                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] disabled:opacity-60 text-white text-sm font-semibold shadow-sm shadow-[#315EF2]/25 transition-all cursor-pointer whitespace-nowrap"
                        >
                          <span>
                            {submitting ? 'Creating Account...' : 'Create Real Student Account'}
                          </span>
                          <ArrowRight className="h-4 w-4 shrink-0" />
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleLoginSubmit} className="mt-5 space-y-4">
                        {loginRole === 'admin' && authBootstrap.adminSetupRequired && (
                          <div className="rounded-xl bg-[#F5F7FC] border border-slate-200 p-3.5 text-xs text-[#172033] space-y-1">
                            <div className="font-semibold text-[#101C3A]">
                              First-Run Administrator Password Setup
                            </div>
                            <p className="leading-relaxed text-[#68748A]">
                              Initialize the password for{' '}
                              <span className="font-mono font-semibold text-[#101C3A]">
                                {authBootstrap.adminAccount?.email ?? 's.qureshi@iba.edu.pk'}
                              </span>{' '}
                              ({authBootstrap.adminAccount?.staffId ?? 'IBA-LIB-014'}). It will be
                              salted and hashed in the database.
                            </p>
                          </div>
                        )}

                        {!(loginRole === 'admin' && authBootstrap.adminSetupRequired) && (
                          <div>
                            <label
                              htmlFor="portal-identifier"
                              className="block text-xs font-semibold text-[#101C3A] mb-1.5"
                            >
                              {loginRole === 'student'
                                ? 'IBA ERP ID or Student Email'
                                : 'Administrator Email or Staff ID'}
                            </label>
                            <input
                              id="portal-identifier"
                              type="text"
                              value={identifier}
                              onChange={(e) => setIdentifier(e.target.value)}
                              placeholder={
                                loginRole === 'student'
                                  ? 'e.g. 28104 or student@khi.iba.edu.pk'
                                  : 's.qureshi@iba.edu.pk or IBA-LIB-014'
                              }
                              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-[#172033] placeholder:text-slate-400 focus:border-[#315EF2] transition-colors"
                            />
                          </div>
                        )}

                        <div>
                          <label
                            htmlFor="portal-password"
                            className="block text-xs font-semibold text-[#101C3A] mb-1.5"
                          >
                            {loginRole === 'admin' && authBootstrap.adminSetupRequired
                              ? 'Set Administrator Password (min 8 characters)'
                              : 'Password'}
                          </label>
                          <input
                            id="portal-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password"
                            className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-[#172033] placeholder:text-slate-400 focus:border-[#315EF2] transition-colors"
                          />
                        </div>

                        {loginRole === 'admin' && authBootstrap.adminSetupRequired && (
                          <div>
                            <label
                              htmlFor="portal-confirm-password"
                              className="block text-xs font-semibold text-[#101C3A] mb-1.5"
                            >
                              Confirm Administrator Password
                            </label>
                            <input
                              id="portal-confirm-password"
                              type="password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="Re-enter password"
                              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-[#172033] placeholder:text-slate-400 focus:border-[#315EF2] transition-colors"
                            />
                          </div>
                        )}

                        {formError && (
                          <p
                            role="alert"
                            className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5"
                          >
                            {formError}
                          </p>
                        )}

                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] disabled:opacity-60 text-white text-sm font-semibold shadow-sm shadow-[#315EF2]/25 transition-all cursor-pointer whitespace-nowrap"
                        >
                          <span>
                            {submitting
                              ? 'Verifying...'
                              : loginRole === 'student'
                                ? 'Sign In to Student Portal'
                                : authBootstrap.adminSetupRequired
                                  ? 'Set Password & Open Admin Portal'
                                  : 'Sign In to Administrator Portal'}
                          </span>
                          <ArrowRight className="h-4 w-4 shrink-0" />
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                {/* Collapsible Demonstration Accounts Drawer */}
                <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl overflow-hidden text-white">
                  <button
                    type="button"
                    onClick={() => setDemoDrawerOpen((prev) => !prev)}
                    aria-expanded={demoDrawerOpen}
                    className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white">
                        Demonstration Accounts ({authBootstrap.demoStudents.length} Students · 1
                        Admin)
                      </div>
                      <div className="text-[11px] text-blue-200/80">
                        Clearly separated from real registered student accounts
                      </div>
                    </div>
                    {demoDrawerOpen ? (
                      <ChevronUp className="h-4 w-4 text-blue-200 shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-blue-200 shrink-0" />
                    )}
                  </button>

                  {demoDrawerOpen && (
                    <div className="px-5 pb-4 pt-3 border-t border-white/10 bg-white text-[#172033] space-y-3">
                      {authBootstrap.adminAccount && (
                        <div className="pb-3 border-b border-slate-100 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="font-semibold text-[#101C3A] truncate">
                              {authBootstrap.adminAccount.name}
                            </div>
                            <div className="text-[11px] text-[#68748A] font-mono truncate">
                              Demo Admin · {authBootstrap.adminAccount.staffId} ·{' '}
                              {authBootstrap.adminAccount.email}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRoleSwitch('admin')}
                            className="text-xs font-semibold text-[#315EF2] hover:underline cursor-pointer whitespace-nowrap shrink-0"
                          >
                            Admin Tab
                          </button>
                        </div>
                      )}

                      <div className="relative">
                        <Search className="h-3.5 w-3.5 text-[#68748A] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={demoSearch}
                          onChange={(e) => setDemoSearch(e.target.value)}
                          placeholder="Filter 20 demo students by ERP, name, or program..."
                          className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-[#F5F7FC] focus:bg-white focus:border-[#315EF2]"
                        />
                      </div>

                      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 pr-1">
                        {filteredDemoStudents.map((st) => (
                          <div
                            key={st.erpId}
                            className="py-2.5 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-[#101C3A] truncate">
                                {st.name}{' '}
                                <span className="font-mono font-normal text-[#68748A]">
                                  · ERP {st.erpId}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#68748A] truncate">
                                Demo Account · {st.program} · {st.status}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={demoLoadingId === st.erpId}
                              onClick={() => void handleDemoStudentSignIn(st.erpId)}
                              className="px-3 py-1.5 rounded-lg bg-[#101C3A] hover:bg-[#172554] disabled:opacity-50 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
                            >
                              {demoLoadingId === st.erpId ? 'Opening...' : 'Sign In'}
                            </button>
                          </div>
                        ))}
                        {filteredDemoStudents.length === 0 && (
                          <div className="py-4 text-center text-xs text-[#68748A]">
                            No demonstration students match your search.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Full-Width 4-Column Live Capacity Summary Strip */}
        <section aria-label="Live Library Capacity" className="max-w-[1280px] mx-auto px-4 sm:px-6 -mt-8 relative z-10">
          <SeatSummaryStrip counts={seatCounts} />
        </section>

        {/* Smart Seat Availability Concept & Live 30-Seat Preview */}
        <section id="availability" className="py-12 sm:py-16 max-w-[1280px] mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200/80">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-[#101C3A]">
                Live 30-Seat ILS Availability Floor Preview
              </h2>
              <p className="mt-1.5 text-sm text-[#68748A] max-w-2xl">
                Every Individual Learning Space is backed by the database and labeled by operational
                state while keeping occupant identities private until authenticated.
              </p>
            </div>
            <SeatLegend />
          </div>

          <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1 p-1 surface-card">
              {(['all', 'Quiet Zone A', 'Research Zone B', 'Focus Zone C'] as const).map(
                (zone) => (
                  <button
                    key={zone}
                    type="button"
                    onClick={() => setSelectedZone(zone)}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                      selectedZone === zone
                        ? 'bg-[#101C3A] text-white shadow-xs'
                        : 'text-[#68748A] hover:text-[#101C3A] hover:bg-[#F5F7FC]'
                    }`}
                  >
                    {zone === 'all' ? 'All 30 Spaces' : zone}
                  </button>
                )
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 surface-card">
              {(['all', 'available', 'occupied', 'away', 'maintenance'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedStatus(status)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                    selectedStatus === status
                      ? 'bg-[#315EF2] text-white shadow-xs'
                      : 'text-[#68748A] hover:text-[#101C3A] hover:bg-[#F5F7FC]'
                  }`}
                >
                  {status === 'all'
                    ? 'All States'
                    : status === 'away'
                      ? 'Away'
                      : status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8">
              <SeatGrid30
                seats={seats}
                selectedSeatId={currentInspected?.id ?? null}
                onSelectSeat={setInspectedSeat}
                filterZone={selectedZone}
                filterStatus={selectedStatus}
                compact
              />
            </div>

            {currentInspected && (
              <div className="lg:col-span-4 surface-card overflow-hidden">
                <div className="aspect-[4/3] bg-slate-100 border-b border-slate-100 overflow-hidden">
                  <SafeImage
                    src={ASSETS.studyPod}
                    alt={`IBA Digital Library individual learning space ${currentInspected.id}`}
                    fallbackLabel={`${currentInspected.id} Study Carrel`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-xl font-bold text-[#101C3A] tabular-nums">
                        {currentInspected.id}
                      </div>
                      <div className="text-xs text-[#68748A]">
                        {currentInspected.zone} · {currentInspected.floor}
                      </div>
                    </div>
                    <SeatStatusLabel status={currentInspected.status} />
                  </div>

                  <dl className="divide-y divide-slate-100 text-xs border-t border-slate-100">
                    <div className="py-2.5 flex justify-between gap-3">
                      <dt className="text-[#68748A]">Desk Amenities</dt>
                      <dd className="font-semibold text-[#101C3A] text-right">
                        Power Outlet, Task Lamp
                        {currentInspected.hasMonitorDock ? ', USB-C Dock' : ''}
                      </dd>
                    </div>
                    <div className="py-2.5 flex justify-between gap-3">
                      <dt className="text-[#68748A]">QR Identifier</dt>
                      <dd className="font-mono tabular-nums text-[#101C3A]">
                        {currentInspected.qrCodeToken}
                      </dd>
                    </div>
                    {currentInspected.reservedUntil && (
                      <div className="py-2.5 flex justify-between gap-3">
                        <dt className="text-[#68748A]">Reserved Until</dt>
                        <dd className="font-mono tabular-nums font-semibold text-[#101C3A]">
                          {currentInspected.reservedUntil}
                        </dd>
                      </div>
                    )}
                    {currentInspected.maintenanceNote && (
                      <div className="py-2.5 flex justify-between gap-3">
                        <dt className="text-[#68748A]">Service Note</dt>
                        <dd className="text-[#172033] text-right">
                          {currentInspected.maintenanceNote}
                        </dd>
                      </div>
                    )}
                  </dl>

                  <button
                    type="button"
                    onClick={() => scrollToLogin('student', true)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] text-white text-xs font-semibold shadow-sm shadow-[#315EF2]/20 transition-all cursor-pointer whitespace-nowrap"
                  >
                    {currentInspected.status === 'available'
                      ? `Sign In as Student to Reserve ${currentInspected.id}`
                      : 'Sign In to Student Portal'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Smart ILS Concept Mechanism Section */}
        <section id="smart-ils" className="bg-white border-y border-slate-200/80 py-16">
          <div className="max-w-[1280px] mx-auto px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl font-bold tracking-tight text-[#101C3A]">
                How Smart Seat Availability Works at IBA
              </h2>
              <p className="mt-2 text-sm text-[#68748A]">
                Connected relational records enforce fair use across all 30 study carrels with
                verifiable student ownership and administrative audit trails.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="surface-card p-6">
                <div className="flex items-center justify-between">
                  <span className="h-10 w-10 rounded-xl bg-[#EAF0FF] text-[#315EF2] flex items-center justify-center">
                    <QrCode className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-xs font-bold text-[#68748A] tabular-nums">
                    01
                  </span>
                </div>
                <h3 className="mt-4 font-display text-base font-bold text-[#101C3A]">
                  QR-Verified Desk Check-In
                </h3>
                <p className="mt-2 text-sm text-[#68748A] leading-relaxed">
                  Each of the 30 Individual Learning Spaces carries a unique QR code identifier and
                  sensor node mapping directly to persistent reservation logs.
                </p>
              </div>

              <div className="surface-card p-6">
                <div className="flex items-center justify-between">
                  <span className="h-10 w-10 rounded-xl bg-teal-50 text-[#0F8B7C] flex items-center justify-center">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-xs font-bold text-[#68748A] tabular-nums">
                    02
                  </span>
                </div>
                <h3 className="mt-4 font-display text-base font-bold text-[#101C3A]">
                  Transparent Temporarily Away State
                </h3>
                <p className="mt-2 text-sm text-[#68748A] leading-relaxed">
                  Departure and return timestamps are recorded on each reservation so legitimate
                  short breaks remain protected under the 20-minute absence countdown policy.
                </p>
              </div>

              <div className="surface-card p-6">
                <div className="flex items-center justify-between">
                  <span className="h-10 w-10 rounded-xl bg-[#EAF0FF] text-[#101C3A] flex items-center justify-center">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-xs font-bold text-[#68748A] tabular-nums">
                    03
                  </span>
                </div>
                <h3 className="mt-4 font-display text-base font-bold text-[#101C3A]">
                  Role-Enforced Library Governance
                </h3>
                <p className="mt-2 text-sm text-[#68748A] leading-relaxed">
                  Backend permissions guarantee students access only their own reservations, fines,
                  and notifications while library staff manage institutional operations.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Dual Portal Role Overview */}
        <section id="portals" className="py-16 max-w-[1280px] mx-auto px-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-bold tracking-tight text-[#101C3A]">
              Dedicated Workspaces for Students and Library Staff
            </h2>
            <p className="mt-2 text-sm text-[#68748A]">
              Separate authentication flows enforce strict role boundaries across every API route
              and database query.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="surface-card p-7 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-display text-lg font-bold text-[#101C3A]">Student Portal</h3>
                  <span className="h-10 w-10 rounded-xl bg-[#EAF0FF] text-[#315EF2] flex items-center justify-center shrink-0">
                    <UserCheck className="h-5 w-5" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#68748A]">
                  Self-service ILS booking, personal reservation history, private violation notices,
                  and ERP-linked financial ledger scoped strictly to the signed-in student.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-y-2.5 gap-x-4 text-xs font-medium text-[#172033] pt-5 border-t border-slate-100">
                  <span>· Dashboard</span>
                  <span>· Scan QR / Book ILS</span>
                  <span>· My Reservation</span>
                  <span>· Notifications</span>
                  <span>· Reservation History</span>
                  <span>· Violations &amp; Warnings</span>
                  <span>· Financial Ledger</span>
                  <span>· My Profile</span>
                </div>
              </div>
              <div className="mt-7 pt-5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => scrollToLogin('student', true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] text-white text-xs font-semibold shadow-sm shadow-[#315EF2]/20 transition-all cursor-pointer whitespace-nowrap"
                >
                  <span>Student Sign In / Demo Accounts</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-[#101C3A] via-[#172554] to-[#1D3576] text-white p-7 shadow-lg shadow-[#101C3A]/15 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-display text-lg font-bold text-white">
                    Administrator Portal
                  </h3>
                  <span className="h-10 w-10 rounded-xl bg-white/10 text-[#2DD4BF] flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-300">
                  Authorized staff oversight over all 30 Individual Learning Spaces, real and demo
                  student directories, sensor event logs, financial transactions, and fine policy.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-y-2.5 gap-x-4 text-xs font-medium text-blue-100 pt-5 border-t border-white/10">
                  <span>· Overview</span>
                  <span>· Live Seat Monitoring</span>
                  <span>· QR Code Management</span>
                  <span>· Student Management</span>
                  <span>· Reservation Management</span>
                  <span>· Sensor Monitoring</span>
                  <span>· Violations &amp; Penalties</span>
                  <span>· Financial Management</span>
                  <span>· Penalty Configuration</span>
                  <span>· System Settings</span>
                </div>
              </div>
              <div className="mt-7 pt-5 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => scrollToLogin('admin')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#19B6A4] hover:bg-[#0F8B7C] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer whitespace-nowrap"
                >
                  <span>Administrator Sign In</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-slate-200/80 py-8">
        <div className="max-w-[1280px] mx-auto px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#68748A]">
          <div className="flex items-center gap-2.5">
            <IBACrestMark size="sm" />
            <div>
              <span className="font-display font-bold text-[#101C3A]">IBA Digital Library</span>
              <span className="mx-2 text-slate-300" aria-hidden="true">
                ·
              </span>
              <span>Smart ILS Management System · University Enclave, Karachi</span>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => scrollToLogin('student', true)}
              className="hover:text-[#101C3A] transition-colors cursor-pointer whitespace-nowrap"
            >
              Student Access
            </button>
            <button
              type="button"
              onClick={() => scrollToLogin('admin')}
              className="hover:text-[#101C3A] transition-colors cursor-pointer whitespace-nowrap"
            >
              Staff Access
            </button>
            <span className="text-slate-400">© 2026 IBA Karachi</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
