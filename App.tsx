
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

const MainApp: React.FC = () => {
  const [theme, setTheme] = useState('dark');
  const [activeView, setActiveView] = useState<View>('dashboard');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
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
        onClick={() => setActiveView(view)}
        className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-semibold rounded-md transition-colors duration-200 ${
          isActive
            ? 'bg-brand-blue text-white shadow-sm'
            : 'text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
        }`}
        aria-current={isActive ? 'page' : undefined}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  };

  const descriptions: Record<View, string> = {
    dashboard: 'Your compliance overview — scans, risk trends, and recent activity at a glance.',
    scanner: 'Real-time reports on cookies, trackers, and potential compliance issues for GDPR & CCPA.',
    legal: 'AI-powered contract analysis, drafting, and negotiation assistance.',
    vulnerability: 'AI-driven security scans to find website vulnerabilities and get remediation plans.',
    settings: 'Manage your account, password, sessions, and notification preferences.',
  };

  const handleNavigate = (v: string) => {
    if (['dashboard', 'scanner', 'legal', 'vulnerability', 'settings'].includes(v)) {
      setActiveView(v as View);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] font-sans text-[var(--text-primary)] flex flex-col">
      <header className="bg-[var(--bg-primary)]/80 backdrop-blur-sm sticky top-0 z-50 border-b border-[var(--border-primary)]">
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CookieCareLogo className="h-8 w-auto text-brand-blue" />
            <h1 className="text-xl font-bold text-[var(--text-headings)] tracking-tight">
              Cookie Care
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
            <UserMenu />
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex-grow">
        {activeView === 'settings' ? (
          <div className="max-w-4xl mx-auto">
            <SettingsView onBack={() => setActiveView('dashboard')} />
          </div>
        ) : (
          <>
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-3xl sm:text-5xl font-extrabold text-[var(--text-headings)] leading-tight">
                Holistic Compliance Analysis Engine
              </h2>
              <p className="mt-4 text-lg text-[var(--text-primary)] max-w-2xl mx-auto">
                {descriptions[activeView]}
              </p>
            </div>

            <div className="max-w-4xl mx-auto mt-10">
              <div className="flex justify-center items-center p-1.5 bg-[var(--bg-tertiary)] rounded-lg space-x-2 flex-wrap gap-y-1">
                <NavTab view="dashboard" label="Dashboard" icon={<DashboardIcon />} />
                <NavTab view="scanner" label="Cookie Scanner" icon={<CheckCircleIcon className="h-5 w-5" />} />
                <NavTab view="legal" label="Legal Review" icon={<ScaleIcon className="h-5 w-5" />} />
                <NavTab view="vulnerability" label="Vulnerability Scanner" icon={<ShieldCheckIcon className="h-5 w-5" />} />
              </div>
            </div>

            <div className="mt-8 max-w-6xl mx-auto">
              {activeView === 'dashboard' && <DashboardView onNavigate={handleNavigate} />}
              {activeView === 'scanner' && <CookieScannerView />}
              {activeView === 'legal' && <LegalReviewerView />}
              {activeView === 'vulnerability' && <VulnerabilityScannerView />}
            </div>
          </>
        )}
      </main>

      <footer className="text-center py-6 text-sm text-[var(--text-primary)]/80">
        <p>&copy; {new Date().getFullYear()} Cookie Care. All rights reserved.</p>
      </footer>
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
