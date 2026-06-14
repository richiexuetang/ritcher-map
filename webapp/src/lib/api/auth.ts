import { apiSend, apiGet } from './client';
import type { AuthResponse, MeResponse } from '../types';

/** Public login (200). */
export function login(email: string, password: string): Promise<AuthResponse> {
  return apiSend<AuthResponse>('POST', '/auth/login', { email, password });
}

/** Public register (201). */
export function register(email: string, password: string): Promise<AuthResponse> {
  return apiSend<AuthResponse>('POST', '/auth/register', { email, password });
}

/** Current account (authed). */
export function getMe(): Promise<MeResponse> {
  return apiGet<MeResponse>('/account/me', { auth: true });
}
