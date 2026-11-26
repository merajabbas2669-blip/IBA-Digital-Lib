import React, { useEffect, useState } from 'react';
import { AdminPortal } from './components/admin/AdminPortal';
import { LandingPage } from './components/landing/LandingPage';
import { IBACrestMark } from './components/shared/DesignSystem';
import { ToastProvider } from './components/shared/UxPrimitives';
import { StudentPortal } from './components/student/StudentPortal';
import { ILSProvider, useILS } from './context/ILSContext';

const SPLASH_SHOWN_KEY = 'iba_ils_splash_shown_v1';

const AppSplashScreen: React.FC<{ visible: boolean }> = ({ visible }) => (
  <div
    aria-hidden={!visible}
    className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-b from-[#0C152B] via-[#101C3A] to-[#172554] text-white px-6 transition-opacity duration-500 ${
      visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
    }`}
  >
    <div className="flex flex-col items-center text-center max-w-xs">
      <IBACrestMark light size="xl" />
      <h1 className="mt-6 font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
        IBA Digital Library
      </h1>
      <p className="mt-1.5 text-xs sm:text-sm font-medium text-blue-200/85 tracking-wide">
        Smart · Connected · Efficient
      </p>
      <div className="mt-8 w-28 h-1 rounded-full bg-white/15 overflow-hidden">
        <div className="h-full w-1/2 rounded-full bg-[#315EF2] animate-pulse" />
      </div>
      <p className="mt-4 text-[11px] text-slate-400">
        Institute of Business Administration, Karachi
      </p>
    </div>
  </div>
);

const AppRouter: React.FC = () => {
  const { role, loadingData } = useILS();
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    try {
      return !window.sessionStorage.getItem(SPLASH_SHOWN_KEY);
    } catch {
      return true;
    }
  });
  const [minSplashDone, setMinSplashDone] = useState(!showSplash);

  useEffect(() => {
    if (!showSplash) return;
    const timer = window.setTimeout(() => {
      setMinSplashDone(true);
    }, 950);
    return () => window.clearTimeout(timer);
  }, [showSplash]);

  useEffect(() => {
    if (showSplash && minSplashDone && !loadingData) {
      setShowSplash(false);
      try {
        window.sessionStorage.setItem(SPLASH_SHOWN_KEY, '1');
      } catch {
        // Ignore storage restrictions
      }
    }
  }, [showSplash, minSplashDone, loadingData]);

  return (
    <>
      <AppSplashScreen visible={showSplash} />
      {role === 'student' ? (
        <StudentPortal />
      ) : role === 'admin' ? (
        <AdminPortal />
      ) : (
        <LandingPage />
      )}
    </>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <ILSProvider>
        <AppRouter />
      </ILSProvider>
    </ToastProvider>
  );
}
