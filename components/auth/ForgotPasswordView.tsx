import React, { useState } from 'react';
import { CookieCareLogo } from '../Icons';
import { userApi } from '../../api/userApi';

interface ForgotPasswordViewProps {
  onBack: () => void;
}

export const ForgotPasswordView: React.FC<ForgotPasswordViewProps> = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await userApi.forgotPassword(email);
      setSuccess(true);
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
          <h1 className="text-2xl font-bold text-[var(--text-headings)]">Forgot password</h1>
          <p className="mt-1 text-sm text-[var(--text-primary)] text-center">
            Enter your email and we'll send you a reset link
          </p>
        </div>
        {success ? (
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-[var(--text-headings)] font-semibold">Check your email</p>
            <p className="text-sm text-[var(--text-primary)]">
              If an account exists for <strong>{email}</strong>, you'll receive a password reset link shortly.
            </p>
            <button
              onClick={onBack}
              className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-brand-blue rounded-lg hover:bg-brand-blue-light transition-all"
            >
              Back to sign in
            </button>
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
              <label htmlFor="email" className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="w-full px-4 py-2.5 text-sm bg-[var(--bg-primary)] text-[var(--text-headings)] border border-[var(--border-primary)] rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition duration-150 disabled:opacity-60"
                placeholder="you@example.com"
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
                  Sending…
                </span>
              ) : 'Send reset link'}
            </button>
            <p className="text-center text-sm text-[var(--text-primary)]">
              <button type="button" onClick={onBack} className="font-semibold text-brand-blue hover:underline">
                Back to sign in
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};
