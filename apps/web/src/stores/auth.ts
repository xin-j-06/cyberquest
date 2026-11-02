import { defineStore } from 'pinia';
import { api, clearStoredSession } from '../api';
import { connectRealtime, disconnectRealtime } from '../realtime';
import type { AuthResponse, AuthUser } from '@cyberquest/shared';

type User = AuthUser;

function restore<T>(key: string): T | undefined {
  try { return JSON.parse(sessionStorage.getItem(key) ?? '') as T; } catch { return undefined; }
}

export const useAuth = defineStore('auth', {
  state: () => ({ token: sessionStorage.getItem('cq_token') ?? '', user: restore<User>('cq_user') as User | undefined }),
  actions: {
    clearSession() {
      this.token = '';
      this.user = undefined;
      clearStoredSession();
      disconnectRealtime();
    },
    save(payload: { user: User; accessToken: string }) {
      this.token = payload.accessToken;
      this.user = payload.user;
      sessionStorage.setItem('cq_token', payload.accessToken);
      sessionStorage.setItem('cq_user', JSON.stringify(payload.user));
      localStorage.removeItem('cq_token');
      localStorage.removeItem('cq_user');
      connectRealtime(payload.accessToken);
    },
    async login(email: string, password: string) {
      this.clearSession();
      this.save(await api<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }));
    },
    async adminLogin(password: string) {
      this.clearSession();
      this.save(await api<AuthResponse>('/auth/admin-login', { method: 'POST', body: JSON.stringify({ password }) }));
    },
    async register(input: { username: string; email: string; password: string }) {
      this.clearSession();
      this.save(await api<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) }));
    },
    async logout() {
      try { if (this.token) await api('/auth/logout', { method: 'POST' }); } finally {
        this.clearSession();
      }
    },
  },
});
