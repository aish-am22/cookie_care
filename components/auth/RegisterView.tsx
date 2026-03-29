import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CookieCareLogo } from '../Icons';

export const RegisterView: React.FC = () => {
  const { register, showLogin } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await register(email, password, fullName || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="flex flex-col items-center mb-8">
          <CookieCareLogo className="h-12 w-auto text-brand-blue mb-3" />
          <h1 className="text-2xl font-bold text-[var(--text-headings)]">Create your account</h1>
          <p className="mt-1 text-sm text-[var(--text-primary)]">Start using Cookie Care for free</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-8 shadow-sm space-y-5"
        >
          {/* Error banner */}
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Full name */}
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-[var(--text-primary)] mb-1">
              Full name <span className="text-[var(--text-primary)]/60">(optional)</span>
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isLoading}
              className="w-full px-4 py-2.5 text-sm bg-[var(--bg-primary)] text-[var(--text-headings)] border border-[var(--border-primary)] rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition duration-150 disabled:opacity-60"
              placeholder="Jane Smith"
            />
          </div>

          {/* Email */}
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

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[var(--text-primary)] mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="w-full px-4 py-2.5 text-sm bg-[var(--bg-primary)] text-[var(--text-headings)] border border-[var(--border-primary)] rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition duration-150 disabled:opacity-60"
              placeholder="Min. 8 characters, upper + lower + number"
            />
            <p className="mt-1 text-xs text-[var(--text-primary)]/70">
              Must be at least 8 characters with uppercase, lowercase, and a number.
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-white bg-brand-blue rounded-lg shadow-sm hover:bg-brand-blue-light focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating account…
              </span>
            ) : (
              'Create account'
            )}
          </button>

          {/* Login link */}
          <p className="text-center text-sm text-[var(--text-primary)]">
            Already have an account?{' '}
            <button
              type="button"
              onClick={showLogin}
              className="font-semibold text-brand-blue hover:underline"
            >
              Sign in
            </button>
          </p>
        </form>
      </div>
    </div>
  );
};
