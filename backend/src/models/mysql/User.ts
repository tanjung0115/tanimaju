// backend/src/models/mysql/User.ts
export type UserRole = 'admin' | 'user' | 'petani' | 'penyuluh';

export const ASSIGNABLE_REGISTRATION_ROLES = ['petani', 'penyuluh'] as const;
export type AssignableRegistrationRole = typeof ASSIGNABLE_REGISTRATION_ROLES[number];

export interface User {
  id: number;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  status?: 'pending' | 'approved' | 'rejected';
  is_active: boolean;
  session_key?: string | null;
  session_expired_at?: Date | null;
  created_at: Date;
  updated_at: Date;
  petani_profile_id?: number | null;
}

export interface LoginRequest {
  email: string;
  password: string;
  remember?: boolean;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  user?: {
    id: number;
    username: string;
    email: string;
    role: UserRole;
  };
  token?: string;
  sessionKey?: string;
  sessionExpiresAt?: string;
}

export interface JWTPayload {
  userId: number;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}
