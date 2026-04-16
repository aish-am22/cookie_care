import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { userApi, type UserProfile, type Session } from '../../api/userApi';

const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-[var(--bg-tertiary)] rounded ${className}`} />
);

const Alert: React.FC<{ type: 'error' | 'success'; message: string }> = ({ type, message }) => (
  <div className={`rounded-lg px-4 py-3 text-sm border ${
    type === 'error'
      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
      : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
  }`}>
    {message}
  </div>
);

const ProfileSection: React.FC = () => {
  const { user } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    userApi.getProfile().then(p => {
      setProfile(p);
      setFullName(p.fullName ?? '');
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setAlert(null);
    try {
      const updated = await userApi.updateProfile({ fullName });
      setProfile(updated);
      setAlert({ type: 'success', message: 'Profile updated successfully.' });
    } catch (err) {
      setAlert({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-[var(--text-headings)]">Profile Information</h3>
        <p className="text-sm text-[var(--text-primary)] mt-1">Update your display name.</p>
      </div>
      <form onSubmit={handleSave} className="space-y-4 max-w-sm">
        {alert && <Alert type={alert.type} message={alert.message} />}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Full name</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            disabled={saving}
            required
            className="w-full px-4 py-2.5 text-sm bg-[var(--bg-primary)] text-[var(--text-headings)] border border-[var(--border-primary)] rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition duration-150 disabled:opacity-60"
            placeholder="Your full name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Email address</label>
          <input
            type="email"
            value={profile?.email ?? user?.email ?? ''}
            disabled
            className="w-full px-4 py-2.5 text-sm bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-primary)] rounded-lg opacity-70 cursor-not-allowed"
          />
          <p className="text-xs text-[var(--text-primary)] mt-1 opacity-70">Email cannot be changed at this time.</p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center px-5 py-2 text-sm font-semibold text-white bg-brand-blue rounded-lg hover:bg-brand-blue-light focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving…
            </span>
          ) : 'Save changes'}
        </button>
      </form>

      <div className="border-t border-[var(--border-primary)] pt-6">
        <h4 className="text-sm font-semibold text-[var(--text-headings)] mb-3">Account Details</h4>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm max-w-sm">
          {[
            { label: 'Role', value: profile?.role ?? '—' },
            { label: 'Account status', value: profile?.isActive ? 'Active' : 'Inactive' },
            { label: 'Email verified', value: profile?.isEmailVerified ? 'Yes ✓' : 'Not verified' },
            { label: 'Member since', value: profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—' },
          ].map(({ label, value }) => (
            <React.Fragment key={label}>
              <dt className="text-[var(--text-primary)] font-medium">{label}</dt>
              <dd className="text-[var(--text-headings)]">{value}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
    </div>
  );
};

const PasswordSection: React.FC = () => {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [alert, setAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlert(null);
    if (form.newPassword !== form.confirmPassword) {
      setAlert({ type: 'error', message: 'New passwords do not match.' });
      return;
    }
    setLoading(true);
    try {
      await userApi.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setAlert({ type: 'success', message: 'Password changed successfully.' });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setAlert({ type: 'error', message: err instanceof Error ? err.message : 'Failed to change password.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-[var(--text-headings)]">Change Password</h3>
        <p className="text-sm text-[var(--text-primary)] mt-1">Ensure your account uses a strong, unique password.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        {alert && <Alert type={alert.type} message={alert.message} />}
        {([
          { id: 'currentPassword', label: 'Current password', autoComplete: 'current-password' },
          { id: 'newPassword', label: 'New password', autoComplete: 'new-password' },
          { id: 'confirmPassword', label: 'Confirm new password', autoComplete: 'new-password' },
        ] as const).map(({ id, label, autoComplete }) => (
          <div key={id}>
            <label htmlFor={id} className="block text-sm font-medium text-[var(--text-primary)] mb-1">{label}</label>
            <input
              id={id}
              type="password"
              autoComplete={autoComplete}
              required
              value={form[id]}
              onChange={handleChange(id)}
              disabled={loading}
              className="w-full px-4 py-2.5 text-sm bg-[var(--bg-primary)] text-[var(--text-headings)] border border-[var(--border-primary)] rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition duration-150 disabled:opacity-60"
              placeholder="••••••••"
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center px-5 py-2 text-sm font-semibold text-white bg-brand-blue rounded-lg hover:bg-brand-blue-light focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Updating…
            </span>
          ) : 'Update password'}
        </button>
      </form>
    </div>
  );
};

const EmailVerificationSection: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [alert, setAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    userApi.getProfile().then(setProfile).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSend = async () => {
    setSending(true);
    setAlert(null);
    try {
      await userApi.sendVerificationEmail();
      setAlert({ type: 'success', message: 'Verification email sent! Check your inbox.' });
    } catch (err) {
      setAlert({ type: 'error', message: err instanceof Error ? err.message : 'Failed to send verification email.' });
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Skeleton className="h-24 w-full" />;

  const isVerified = profile?.isEmailVerified ?? user?.isEmailVerified;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-[var(--text-headings)]">Email Verification</h3>
        <p className="text-sm text-[var(--text-primary)] mt-1">Verify your email address for enhanced account security.</p>
      </div>
      {alert && <Alert type={alert.type} message={alert.message} />}
      <div className="flex items-center gap-3 p-4 bg-[var(--bg-tertiary)] rounded-xl max-w-sm">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
          isVerified
            ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
            : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
        }`}>
          {isVerified ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--text-headings)]">{profile?.email ?? user?.email}</p>
          <p className={`text-xs ${isVerified ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
            {isVerified ? 'Verified' : 'Not verified'}
          </p>
        </div>
      </div>
      {!isVerified && (
        <button
          onClick={handleSend}
          disabled={sending}
          className="flex items-center justify-center px-5 py-2 text-sm font-semibold text-white bg-brand-blue rounded-lg hover:bg-brand-blue-light focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {sending ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Sending…
            </span>
          ) : 'Send verification email'}
        </button>
      )}
    </div>
  );
};

const SessionsSection: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const [alert, setAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await userApi.getSessions();
      setSessions(data);
    } catch (err) {
      setAlert({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load sessions.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSessions(); }, []);

  const handleRevoke = async (sessionId: string) => {
    setRevoking(sessionId);
    setAlert(null);
    try {
      await userApi.revokeSession(sessionId);
      setSessions(s => s.filter(x => x.id !== sessionId));
      setAlert({ type: 'success', message: 'Session revoked.' });
    } catch (err) {
      setAlert({ type: 'error', message: err instanceof Error ? err.message : 'Failed to revoke session.' });
    } finally {
      setRevoking(null);
    }
  };

  const handleRevokeAll = async () => {
    setConfirmRevokeAll(false);
    setRevokingAll(true);
    setAlert(null);
    try {
      const result = await userApi.revokeAllSessions();
      await loadSessions();
      setAlert({ type: 'success', message: `Revoked ${result.count} session(s).` });
    } catch (err) {
      setAlert({ type: 'error', message: err instanceof Error ? err.message : 'Failed to revoke sessions.' });
    } finally {
      setRevokingAll(false);
    }
  };

  function parseUA(ua: string | null): string {
    if (!ua) return 'Unknown device';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return ua.slice(0, 40);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-headings)]">Active Sessions</h3>
          <p className="text-sm text-[var(--text-primary)] mt-1">Devices currently signed in to your account.</p>
        </div>
        {sessions.length > 1 && (
          !confirmRevokeAll ? (
            <button
              onClick={() => setConfirmRevokeAll(true)}
              disabled={revokingAll}
              className="px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Revoke all
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-primary)]">Are you sure?</span>
              <button
                onClick={handleRevokeAll}
                disabled={revokingAll}
                className="px-2 py-1 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {revokingAll ? 'Revoking…' : 'Yes, revoke all'}
              </button>
              <button
                onClick={() => setConfirmRevokeAll(false)}
                className="px-2 py-1 text-xs font-medium text-[var(--text-primary)] border border-[var(--border-primary)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          )
        )}
      </div>

      {alert && <Alert type={alert.type} message={alert.message} />}

      <div className="space-y-2 max-w-lg">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="p-4 bg-[var(--bg-tertiary)] rounded-xl flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-6 w-14 rounded-lg" />
            </div>
          ))
        ) : sessions.length === 0 ? (
          <p className="text-sm text-[var(--text-primary)] py-4">No active sessions found.</p>
        ) : (
          sessions.map((session) => (
            <div key={session.id} className="p-4 bg-[var(--bg-tertiary)] rounded-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] flex items-center justify-center text-[var(--text-primary)] flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-headings)]">{parseUA(session.userAgent)}</p>
                <p className="text-xs text-[var(--text-primary)] truncate">
                  {session.ipAddress ? `${session.ipAddress} · ` : ''}
                  Last active {new Date(session.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(session.id)}
                disabled={revoking === session.id}
                className="px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                {revoking === session.id ? '…' : 'Revoke'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

type SettingsTab = 'profile' | 'security' | 'sessions' | 'email';

export const SettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'security', label: 'Password' },
    { id: 'email', label: 'Email' },
    { id: 'sessions', label: 'Sessions' },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row gap-6">
        {/* Sidebar tabs */}
        <nav className="sm:w-44 flex sm:flex-col gap-1 flex-shrink-0 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg text-left transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-brand-blue text-white shadow-sm'
                  : 'text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 min-h-64">
          {activeTab === 'profile' && <ProfileSection />}
          {activeTab === 'security' && <PasswordSection />}
          {activeTab === 'email' && <EmailVerificationSection />}
          {activeTab === 'sessions' && <SessionsSection />}
        </div>
      </div>
    </div>
  );
};
