import React, { useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { IBACrestMark, SafeImage } from '../shared/DesignSystem';
import { ConfirmDialog, PullToRefresh, SyncErrorBanner, useToast } from '../shared/UxPrimitives';

export interface NavItemConfig<T extends string> {
  id: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeCount?: number;
  section?: string;
}

export interface BottomNavItemConfig<T extends string> {
  id: T | '__more__';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeCount?: number;
  isActive?: boolean;
  onPress?: () => void;
}

interface PortalShellProps<T extends string> {
  portalTitle: string;
  portalRoleLabel: string;
  navItems: NavItemConfig<T>[];
  bottomNavItems?: BottomNavItemConfig<T>[];
  activeRoute: T;
  onSelectRoute: (route: T) => void;
  userName: string;
  userMeta: string;
  userAvatar: string;
  accountOriginLabel: string;
  headerActions?: React.ReactNode;
  mobileHeaderTitle?: string;
  mobileBackTarget?: T | null;
  mobileRightAction?: React.ReactNode;
  hideMobileTopBar?: boolean;
  onRefresh?: () => Promise<boolean | void>;
  syncError?: string | null;
  confirmLogout?: boolean;
  onLogout: () => void;
  children: React.ReactNode;
}

export function PortalShell<T extends string>({
  portalTitle,
  portalRoleLabel,
  navItems,
  bottomNavItems,
  activeRoute,
  onSelectRoute,
  userName,
  userMeta,
  userAvatar,
  accountOriginLabel,
  headerActions,
  mobileHeaderTitle,
  mobileBackTarget,
  mobileRightAction,
  hideMobileTopBar = false,
  onRefresh,
  syncError,
  confirmLogout = true,
  onLogout,
  children,
}: PortalShellProps<T>) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [retryingSync, setRetryingSync] = useState(false);
  const { pushToast } = useToast();

  const requestLogout = () => {
    setMobileOpen(false);
    if (confirmLogout) {
      setLogoutConfirmOpen(true);
    } else {
      onLogout();
    }
  };

  const handleRefreshAction = async () => {
    if (!onRefresh) return;
    setRetryingSync(true);
    const result = await onRefresh();
    setRetryingSync(false);
    if (result === false) {
      pushToast({
        tone: 'error',
        title: 'Refresh failed',
        description: 'Could not sync latest library status. Please try again.',
        actionLabel: 'Retry',
        onAction: () => void handleRefreshAction(),
      });
    } else {
      pushToast({
        tone: 'success',
        title: 'Synced live status',
        description: 'Seat availability and account records are up to date.',
        durationMs: 2400,
      });
    }
  };

  const activeItem = navItems.find((item) => item.id === activeRoute);

  const groupedNav = navItems.reduce<
    Array<{ section: string | undefined; items: NavItemConfig<T>[] }>
  >((acc, item) => {
    const last = acc[acc.length - 1];
    if (last && last.section === item.section) {
      last.items.push(item);
    } else {
      acc.push({ section: item.section, items: [item] });
    }
    return acc;
  }, []);

  const handleNavigate = (route: T) => {
    onSelectRoute(route);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderSidebarContent = (isCompact: boolean) => (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#101C3A] via-[#132145] to-[#172554] text-slate-100 select-none">
      {/* Brand Header */}
      <div
        className={`h-16 flex items-center border-b border-white/10 shrink-0 ${
          isCompact ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <IBACrestMark light />
          {!isCompact && (
            <div className="min-w-0">
              <div className="font-display font-bold text-[14px] text-white tracking-tight truncate">
                IBA Digital Library
              </div>
              <div className="text-[11px] font-medium text-[#19B6A4] truncate">
                {portalRoleLabel}
              </div>
            </div>
          )}
        </div>

        {/* Desktop collapse button (expanded state) */}
        {!isCompact && (
          <button
            type="button"
            onClick={() => setDesktopCollapsed(true)}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className="hidden lg:inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}

        {/* Mobile close button */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Expand toggle when compact on desktop */}
      {isCompact && (
        <div className="hidden lg:flex justify-center pt-3 pb-1 shrink-0">
          <button
            type="button"
            onClick={() => setDesktopCollapsed(false)}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Navigation Links */}
      <nav
        className={`flex-1 overflow-y-auto py-4 space-y-5 ${isCompact ? 'px-2.5' : 'px-3'}`}
        aria-label={portalTitle}
      >
        {groupedNav.map((group, idx) => (
          <div key={group.section ?? `group-${idx}`} className="space-y-1">
            {group.section && !isCompact && (
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400/80">
                {group.section}
              </div>
            )}
            {group.section && isCompact && idx > 0 && (
              <div className="mx-3 my-2 border-t border-white/10" aria-hidden="true" />
            )}

            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeRoute;
              const hasBadge = typeof item.badgeCount === 'number' && item.badgeCount > 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  title={isCompact ? item.label : undefined}
                  onClick={() => handleNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative w-full flex items-center rounded-xl text-[13px] font-medium transition-all duration-150 cursor-pointer ${
                    isCompact
                      ? 'justify-center h-11 px-0'
                      : 'justify-between gap-2.5 px-3 py-2.5 text-left min-h-[44px]'
                  } ${
                    isActive
                      ? 'bg-[#315EF2] text-white shadow-[0_8px_18px_-6px_rgba(49,94,242,0.65)]'
                      : 'text-slate-300/90 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  <span className={`flex items-center min-w-0 ${isCompact ? '' : 'gap-3'}`}>
                    <Icon
                      className={`h-[17px] w-[17px] shrink-0 transition-colors ${
                        isActive ? 'text-white' : 'text-slate-400'
                      }`}
                    />
                    {!isCompact && <span className="truncate">{item.label}</span>}
                  </span>

                  {hasBadge && !isCompact && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md font-mono text-[11px] tabular-nums font-semibold shrink-0 ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-[#19B6A4]/20 text-[#2DD4BF]'
                      }`}
                    >
                      {item.badgeCount}
                    </span>
                  )}

                  {hasBadge && isCompact && (
                    <span
                      className="absolute top-1.5 right-2 h-2 w-2 rounded-full bg-[#19B6A4] ring-2 ring-[#101C3A]"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User Identity Footer */}
      <div
        className={`border-t border-white/10 shrink-0 ${
          isCompact ? 'p-3 space-y-2.5' : 'p-4 space-y-3'
        }`}
      >
        <div
          className={`flex items-center ${
            isCompact
              ? 'justify-center'
              : 'gap-3 rounded-xl bg-white/[0.05] p-2.5 border border-white/[0.07]'
          } min-w-0`}
        >
          <SafeImage
            src={userAvatar}
            alt={userName}
            fallbackLabel={userName}
            className="h-9 w-9 rounded-xl object-cover shrink-0 border border-white/20"
          />
          {!isCompact && (
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">{userName}</div>
              <div className="text-[11px] text-slate-300/80 truncate font-mono tabular-nums mt-0.5">
                {userMeta}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={requestLogout}
          title={isCompact ? 'Sign Out' : undefined}
          aria-label="Sign Out"
          className={`w-full flex items-center justify-center gap-2 rounded-xl text-xs font-semibold text-slate-200 bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.08] transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap min-h-[44px] ${
            isCompact ? 'h-10 px-0' : 'px-3 py-2.5'
          }`}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          {!isCompact && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  const hasBottomNav = Boolean(bottomNavItems && bottomNavItems.length > 0);

  return (
    <div className="min-h-screen bg-[#F5F7FC] text-[#172033] flex overflow-x-clip">
      {/* Desktop Persistent Collapsible Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 fixed inset-y-0 left-0 z-30 border-r border-[#101C3A]/20 transition-[width] duration-200 ease-out ${
          desktopCollapsed ? 'w-[78px]' : 'w-[268px]'
        }`}
      >
        {renderSidebarContent(desktopCollapsed)}
      </aside>

      {/* Mobile Drawer Overlay (accessible from top bar when needed) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#0A1329]/60 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-[280px] max-w-[85vw] h-full shadow-2xl z-10">
            {renderSidebarContent(false)}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-200 ease-out ${
          desktopCollapsed ? 'lg:pl-[78px]' : 'lg:pl-[268px]'
        }`}
      >
        {/* Desktop Contextual Top Bar (lg+) */}
        <header className="hidden lg:flex sticky top-0 z-20 h-16 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-8 items-center justify-between gap-4">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
            <span className="text-[#68748A] font-medium whitespace-nowrap shrink-0">
              {portalTitle}
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            <span className="font-display font-bold text-[#101C3A] truncate">
              {activeItem?.label ?? portalTitle}
            </span>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden xl:inline text-xs font-medium text-[#68748A] whitespace-nowrap">
              {accountOriginLabel}
            </span>
            {headerActions}
            <button
              type="button"
              onClick={requestLogout}
              className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 hover:border-slate-300 text-xs font-semibold text-[#101C3A] transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
            >
              <LogOut className="h-3.5 w-3.5 text-[#68748A] shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        {/* Mobile Deep Navy Top App Bar (< lg) — Hidden only on views that render their own full-bleed Navy mobile hero */}
        {!hideMobileTopBar && (
          <header className="lg:hidden sticky top-0 z-30 bg-[#101C3A] text-white px-3 pt-safe h-14 flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-1.5 min-w-0">
              {mobileBackTarget ? (
                <button
                  type="button"
                  onClick={() => handleNavigate(mobileBackTarget)}
                  aria-label="Go back"
                  className="min-h-[44px] min-w-[44px] -ml-1 flex items-center justify-center rounded-xl text-blue-100 hover:bg-white/10 active:bg-white/15 cursor-pointer shrink-0"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  aria-label="Open menu"
                  className="min-h-[44px] min-w-[44px] -ml-1 flex items-center justify-center rounded-xl text-blue-100 hover:bg-white/10 active:bg-white/15 cursor-pointer shrink-0"
                >
                  <Menu className="h-5 w-5" />
                </button>
              )}
              {!mobileBackTarget && <IBACrestMark light size="xs" className="mr-1" />}
              <span className="font-display font-bold text-[15px] text-white tracking-tight truncate">
                {mobileHeaderTitle ?? activeItem?.label ?? portalTitle}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">{mobileRightAction}</div>
          </header>
        )}

        {/* Active Viewport with Pull-to-Refresh, Sync Retry Banner, and Smooth Transitions */}
        <main
          className={`flex-1 w-full max-w-[1320px] mx-auto ${
            hideMobileTopBar ? 'px-0 pt-0 lg:px-8 lg:pt-8' : 'px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8'
          } ${
            hasBottomNav
              ? 'pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8'
              : 'pb-8'
          }`}
        >
          <PullToRefresh onRefresh={onRefresh ? handleRefreshAction : undefined}>
            {syncError && (
              <div className={hideMobileTopBar ? 'px-4 pt-3 lg:px-0 lg:pt-0' : ''}>
                <SyncErrorBanner
                  message={syncError}
                  retrying={retryingSync}
                  onRetry={() => void handleRefreshAction()}
                />
              </div>
            )}
            <div key={activeRoute} className="animate-view-enter">
              {children}
            </div>
          </PullToRefresh>
        </main>
      </div>

      {/* Fixed Mobile Bottom Navigation Bar (< lg) */}
      {hasBottomNav && bottomNavItems && (
        <nav
          aria-label="Mobile Navigation"
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/85 shadow-[0_-8px_24px_-12px_rgba(16,28,58,0.14)] pb-safe"
        >
          <div
            className="grid items-center h-[66px] max-w-lg mx-auto px-1"
            style={{
              gridTemplateColumns: `repeat(${bottomNavItems.length}, minmax(0, 1fr))`,
            }}
          >
            {bottomNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                typeof item.isActive === 'boolean' ? item.isActive : item.id === activeRoute;
              const hasBadge = typeof item.badgeCount === 'number' && item.badgeCount > 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.onPress) {
                      item.onPress();
                    } else if (item.id !== '__more__') {
                      handleNavigate(item.id);
                    }
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[54px] rounded-xl px-0.5 transition-all cursor-pointer active:scale-[0.95] ${
                    isActive ? 'text-[#315EF2]' : 'text-[#68748A] hover:text-[#101C3A]'
                  }`}
                >
                  {/* Crisp top active bar indicator */}
                  <span
                    aria-hidden="true"
                    className={`absolute top-0 left-1/2 -translate-x-1/2 h-[3px] rounded-b-full transition-all duration-150 ${
                      isActive ? 'w-7 bg-[#315EF2]' : 'w-0 bg-transparent'
                    }`}
                  />
                  <span
                    className={`relative flex items-center justify-center h-7 w-11 rounded-full transition-colors ${
                      isActive ? 'bg-[#EAF0FF]' : ''
                    }`}
                  >
                    <Icon
                      className={`h-[20px] w-[20px] shrink-0 ${
                        isActive ? 'text-[#315EF2] stroke-[2.25]' : 'text-[#68748A]'
                      }`}
                    />
                    {hasBadge && (
                      <span className="absolute -top-0.5 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-600 text-white font-mono text-[9px] font-bold leading-[16px] text-center tabular-nums">
                        {item.badgeCount! > 9 ? '9+' : item.badgeCount}
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-[10px] leading-tight truncate max-w-full px-0.5 ${
                      isActive ? 'font-bold text-[#315EF2]' : 'font-medium text-[#68748A]'
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* Accessible Sign Out Confirmation Dialog */}
      <ConfirmDialog
        open={logoutConfirmOpen}
        title="Sign out of IBA Digital Library?"
        description={`You are currently signed in as ${userName} (${userMeta}). Any active ILS reservation will remain tracked by the backend system.`}
        confirmLabel="Sign Out"
        cancelLabel="Stay Signed In"
        tone="danger"
        icon={<LogOut className="h-5 w-5" />}
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          onLogout();
        }}
        onCancel={() => setLogoutConfirmOpen(false)}
      />
    </div>
  );
}
