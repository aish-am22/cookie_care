import React, { useState } from 'react';
import { CookieCareLogo } from '../Icons';
import { userApi } from '../../api/userApi';

interface ResetPasswordViewProps {
  token: string;
  onSuccess: () => void;
}

export const ResetPasswordView: React.FC<ResetPasswordViewProps> = ({ token, onSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setIsLoading(true);
    try {
      await userApi.resetPassword({ token, newPassword });
      setSuccess(true);
      setTimeout(onSuccess, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <CookieCareLogo className="h-12 w-auto text-brand-blue mb-3" />
          <h1 className="text-2xl font-bold text-[var(--text-headings)]">Set new password</h1>
          <p className="mt-1 text-sm text-[var(--text-primary)]">Enter your new password below</p>
        </div>
        {success ? (
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-[var(--text-headings)] font-semibold">Password reset successfully!</p>
            <p className="text-sm text-[var(--text-primary)]">Redirecting you to sign in…</p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-8 shadow-sm space-y-5"
          >
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                New password
              </label>
              <input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isLoading}
                className="w-full px-4 py-2.5 text-sm bg-[var(--bg-primary)] text-[var(--text-headings)] border border-[var(--border-primary)] rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition duration-150 disabled:opacity-60"
                placeholder="Min 8 chars, uppercase, lowercase, number"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                className="w-full px-4 py-2.5 text-sm bg-[var(--bg-primary)] text-[var(--text-headings)] border border-[var(--border-primary)] rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition duration-150 disabled:opacity-60"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-white bg-brand-blue rounded-lg shadow-sm hover:bg-brand-blue-light focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Resetting…
                </span>
              ) : 'Reset password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
