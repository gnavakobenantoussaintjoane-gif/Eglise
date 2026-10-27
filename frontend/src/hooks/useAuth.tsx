import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Permissions, Profile, Session } from '../types';

interface LoginInput {
  email: string;
  password: string;
}

interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  city?: string;
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  permissions: Permissions | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  isMedia: boolean;
  canManageDepartments: boolean;
  login: (input: LoginInput) => Promise<Session>;
  register: (input: RegisterInput) => Promise<Session>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SESSION_KEY = ['session'] as const;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: SESSION_KEY,
    queryFn: ({ signal }) => api.get<Session>('/auth/session', undefined, signal),
    staleTime: 60_000,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => api.post<Session>('/auth/login', input),
    onSuccess: (session) => {
      queryClient.setQueryData(SESSION_KEY, session);
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const registerMutation = useMutation({
    mutationFn: (input: RegisterInput) => api.post<Session>('/auth/register', input),
    onSuccess: (session) => {
      queryClient.setQueryData(SESSION_KEY, session);
    },
  });

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    queryClient.setQueryData(SESSION_KEY, { profile: null, permissions: null, status: null });
    queryClient.removeQueries({ queryKey: ['notifications'] });
  }, [queryClient]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: SESSION_KEY });
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => {
    const session = sessionQuery.data ?? null;
    const permissions = session?.permissions ?? null;
    return {
      session,
      profile: session?.profile ?? null,
      permissions,
      isLoading: sessionQuery.isLoading,
      isAuthenticated: Boolean(session?.profile),
      isApproved: Boolean(permissions?.isApproved),
      isAdmin: Boolean(permissions?.isAdmin),
      isMedia: Boolean(permissions?.isMedia),
      canManageDepartments: Boolean(permissions?.canManageDepartments),
      login: (input) => loginMutation.mutateAsync(input),
      register: (input) => registerMutation.mutateAsync(input),
      logout,
      refresh,
    };
  }, [sessionQuery.data, sessionQuery.isLoading, loginMutation, registerMutation, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans un <AuthProvider>.');
  return context;
}
