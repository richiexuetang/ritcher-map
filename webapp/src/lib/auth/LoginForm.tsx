'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from './AuthContext';
import { ApiError } from '../api/client';

export interface LoginFormProps {
  onClose?: () => void;
}

/** Extract a list of user-facing error messages from a thrown error.
 *  Handles the 422 validation envelope {error: string[]} (ARRAY). */
function errorMessages(err: unknown): string[] {
  if (err instanceof ApiError) {
    const body = err.body;
    if (body && typeof body === 'object' && 'error' in body) {
      const e = (body as { error: unknown }).error;
      if (Array.isArray(e)) {
        return e.map((m) => String(m));
      }
      if (typeof e === 'string') return [e];
    }
    return [err.message];
  }
  if (err instanceof Error) return [err.message];
  return ['Something went wrong'];
}

export const LoginForm: React.FC<LoginFormProps> = ({ onClose }) => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors([]);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
      onClose?.();
    } catch (err) {
      setErrors(errorMessages(err));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'));
    setErrors([]);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          {mode === 'login' ? 'Log in' : 'Create account'}
        </h2>
        {onClose && (
          <button
            type="button"
            className="appearance-none border-0 bg-transparent text-fg-dim text-[22px] leading-none cursor-pointer hover:text-fg"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        )}
      </div>

      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-[13px] text-fg-dim">
          <span>Email</span>
          <input
            type="email"
            className="input"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />
        </label>

        <label className="flex flex-col gap-1 text-[13px] text-fg-dim">
          <span>Password</span>
          <input
            type="password"
            className="input"
            autoComplete={
              mode === 'login' ? 'current-password' : 'new-password'
            }
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />
        </label>

        {errors.length > 0 && (
          <ul className="m-0 pl-[18px] text-danger text-[13px]" role="alert">
            {errors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting}
        >
          {submitting
            ? 'Please wait…'
            : mode === 'login'
              ? 'Log in'
              : 'Sign up'}
        </button>
      </form>

      <button
        type="button"
        className="appearance-none border-0 bg-transparent text-fg-dim text-[13px] cursor-pointer self-center hover:text-fg"
        onClick={toggleMode}
        disabled={submitting}
      >
        {mode === 'login'
          ? "Don't have an account? Sign up"
          : 'Already have an account? Log in'}
      </button>
    </div>
  );
};
