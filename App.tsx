
import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginView } from './components/auth/LoginView';
import { RegisterView } from './components/auth/RegisterView';
import { ForgotPasswordView } from './components/auth/ForgotPasswordView';
import { ResetPasswordView } from './components/auth/ResetPasswordView';
import { DashboardView } from './components/dashboard/DashboardView';
import { SettingsView } from './components/settings/SettingsView';
import { CookieCareLogo, SunIcon, MoonIcon, CheckCircleIcon, ScaleIcon, ShieldCheckIcon } from './components/Icons';
import { CookieScannerView } from './components/CookieScannerView';
import { LegalReviewerView } from './components/LegalReviewerView';
import { VulnerabilityScannerView } from './components/VulnerabilityScannerView';

const ThemeToggle: React.FC<{ theme: string, toggleTheme: () => void }> = ({ theme, toggleTheme }) => (
    <button
        onClick={toggleTheme}
        className="p-2 rounded-full text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
        aria-label="Toggle theme"
    >
        {theme === 'dark' ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
);

type View = 'dashboard' | 'scanner' | 'legal' | 'vulnerability' | 'settings';

const UserMenu: React.FC = () => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
        aria-label="User menu"
      >
        <span className="w-7 h-7 rounded-full bg-brand-blue flex items-center justify-center text-white text-xs font-bold select-none">
          {(user?.fullName ?? user?.email ?? 'U')[0].toUpperCase()}
        </span>
        <span className="hidden sm:inline max-w-[140px] truncate">{user?.fullName ?? user?.email}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-52 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl shadow-lg py-1 z-50">
          <div className="px-4 py-2 border-b border-[var(--border-primary)]">
            <p className="text-xs font-semibold text-[var(--text-headings)] truncate">{user?.fullName ?? 'Account'}</p>
            <p className="text-xs text-[var(--text-primary)] truncate">{user?.email}</p>
          </div>
          <button
            onClick={async () => { setOpen(false); await logout(); }}
            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};

const DashboardIcon: React.FC = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const navItems: Array<{ view: View; label: string; icon: React.ReactNode }> = [
  { view: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { view: 'scanner', label: 'Cookie Scanner', icon: <CheckCircleIcon className="h-5 w-5" /> },
  { view: 'legal', label: 'Legal Review', icon: <ScaleIcon className="h-5 w-5" /> },
  { view: 'vulnerability', label: 'Vulnerability Scanner', icon: <ShieldCheckIcon className="h-5 w-5" /> },
];

const MenuIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const MainApp: React.FC = () => {
  const [theme, setTheme] = useState('light');
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    document.documentElement.classList.toggle('dark', savedTheme === 'dark');
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const NavTab: React.FC<{ view: View; label: string; icon: React.ReactNode }> = ({ view, label, icon }) => {
    const isActive = activeView === view;
    return (
      <button
        onClick={() => { setActiveView(view); setIsSidebarOpen(false); }}
        className={`flex w-full items-center space-x-2.5 px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200 ${
          isActive
            ? 'bg-white text-[var(--text-headings)] shadow-[0_10px_30px_rgba(15,23,42,0.10)]'
            : 'text-[var(--text-primary)] hover:bg-white/65'
        }`}
        aria-current={isActive ? 'page' : undefined}
      >
        <span className={isActive ? 'text-brand-blue' : ''}>{icon}</span>
        <span>{label}</span>
      </button>
    );
  };

  const pageMeta: Record<View, { title: string; description: string }> = {
    dashboard: {
      title: 'Compliance Workspace',
      description: 'Your compliance overview — scans, risk trends, and recent activity at a glance.',
    },
    scanner: {
      title: 'Cookie Scanner',
      description: 'Real-time reports on cookies, trackers, and potential compliance issues for GDPR & CCPA.',
    },
    legal: {
      title: 'Legal Review',
      description: 'AI-powered contract analysis, drafting, and negotiation assistance.',
    },
    vulnerability: {
      title: 'Vulnerability Scanner',
      description: 'AI-driven security scans to find website vulnerabilities and get remediation plans.',
    },
    settings: {
      title: 'Settings',
      description: 'Manage your account, password, sessions, and notification preferences.',
    },
  };

  const handleNavigate = (v: string) => {
    if (['dashboard', 'scanner', 'legal', 'vulnerability', 'settings'].includes(v)) {
      setActiveView(v as View);
    }
  };

  const SidebarContent = () => (
    <div className="h-full flex flex-col rounded-[28px] bg-white/55 border border-white/70 shadow-[0_18px_45px_rgba(124,58,237,0.12)] p-5">
      <div className="flex items-center gap-3 px-1">
        <CookieCareLogo className="h-9 w-auto text-brand-blue" />
        <h1 className="text-lg font-bold text-[var(--text-headings)] tracking-tight">Cookie Care</h1>
      </div>

      <div className="mt-7 space-y-1.5">
        {navItems.map(item => (
          <NavTab key={item.view} view={item.view} label={item.label} icon={item.icon} />
        ))}
        <NavTab view="settings" label="Settings" icon={<SunIcon className="h-5 w-5" />} />
      </div>

      <div className="mt-auto space-y-3">
        <div className="rounded-2xl border border-white/80 bg-white/80 p-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-primary)]/75">Workspace</p>
          <p className="mt-1 text-sm text-[var(--text-headings)]">v1.0 Enterprise</p>
          <div className="mt-2 flex justify-start">
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          </div>
        </div>
        <UserMenu />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--app-shell-bg)] font-sans text-[var(--text-primary)]">
      <div className="absolute inset-y-0 left-0 hidden w-[320px] lg:block" style={{ background: 'var(--sidebar-gradient)' }} />

      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-950/35 backdrop-blur-[1px] z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className="hidden lg:block fixed left-4 top-4 bottom-4 w-[288px] z-50">
        <SidebarContent />
      </aside>

      <aside className={`fixed inset-y-0 left-0 z-50 w-[288px] p-4 transition-transform duration-300 lg:hidden ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </aside>

      <div className="relative lg:pl-[308px]">
        <div className="p-3 sm:p-4 lg:p-5">
          <div className="min-h-[calc(100vh-1.5rem)] lg:min-h-[calc(100vh-2.5rem)] bg-white rounded-[28px] border border-[var(--border-primary)] shadow-[0_22px_65px_rgba(15,23,42,0.08)] p-4 sm:p-6 lg:p-8">
            <header className="flex items-start justify-between gap-4 pb-5 border-b border-[var(--border-primary)]">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs sm:text-sm text-[var(--text-primary)]">
                  <span>Workspace</span>
                  <span className="opacity-50">/</span>
                  <span className="font-semibold text-[var(--text-headings)]">{pageMeta[activeView].title}</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-headings)]">{pageMeta[activeView].title}</h2>
                <p className="text-sm sm:text-base text-[var(--text-primary)] max-w-3xl">{pageMeta[activeView].description}</p>
              </div>
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="inline-flex lg:hidden h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-primary)] text-[var(--text-primary)] hover:text-[var(--text-headings)]"
                aria-label="Open navigation"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
            </header>

            <main className="mt-6">
              {activeView === 'settings' && <SettingsView onBack={() => setActiveView('dashboard')} />}
              {activeView === 'dashboard' && <DashboardView onNavigate={handleNavigate} />}
              {activeView === 'scanner' && <CookieScannerView />}
              {activeView === 'legal' && <LegalReviewerView />}
              {activeView === 'vulnerability' && <VulnerabilityScannerView />}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
};

const AppShell: React.FC = () => {
  const { view, showLogin, resetPasswordToken } = useAuth();

  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full animate-spin"
            style={{ border: '4px solid var(--border-primary)', borderTopColor: 'var(--brand-blue, hsl(210,90%,50%))' }}
          />
          <p className="text-sm text-[var(--text-primary)]">Loading…</p>
        </div>
      </div>
    );
  }

  if (view === 'login') return <LoginView />;
  if (view === 'register') return <RegisterView />;
  if (view === 'forgot-password') return <ForgotPasswordView onBack={showLogin} />;
  if (view === 'reset-password' && resetPasswordToken) {
    return <ResetPasswordView token={resetPasswordToken} onSuccess={showLogin} />;
  }
  if (view === 'verify-email') return <LoginView />;
  return <MainApp />;
};

const App: React.FC = () => (
  <AuthProvider>
    <AppShell />
  </AuthProvider>
);

export default App;
