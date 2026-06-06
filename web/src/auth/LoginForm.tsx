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
    <div className="rm-login">
      <div className="rm-login__header">
        <h2 className="rm-login__title">
          {mode === 'login' ? 'Log in' : 'Create account'}
        </h2>
        {onClose && (
          <button
            type="button"
            className="rm-login__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        )}
      </div>

      <form className="rm-login__form" onSubmit={handleSubmit}>
        <label className="rm-login__label">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />
        </label>

        <label className="rm-login__label">
          <span>Password</span>
          <input
            type="password"
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
          <ul className="rm-login__errors" role="alert">
            {errors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        )}

        <button
          type="submit"
          className="rm-login__submit"
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
        className="rm-login__toggle"
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
