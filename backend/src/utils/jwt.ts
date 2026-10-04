// backend/src/utils/jwt.ts
import jwt from 'jsonwebtoken';
import { JWTPayload } from '../models/mysql/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key';
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || JWT_SECRET === 'your-fallback-secret-key' || JWT_SECRET.length < 32)) {
  throw new Error('Production requires a unique JWT_SECRET of at least 32 characters.');
}
const JWT_EXPIRES_IN = '7d'; // Token berlaku 7 hari
const JWT_REMEMBER_EXPIRES_IN = '30d'; // Token "remember me" berlaku 30 hari

export const generateToken = (payload: Omit<JWTPayload, 'iat' | 'exp'>, remember: boolean = false): string => {
  const expiresIn = remember ? JWT_REMEMBER_EXPIRES_IN : JWT_EXPIRES_IN;
  
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn,
    issuer: 'tanimaju-backend',
    audience: 'tanimaju-frontend'
  });
};

export const verifyToken = (token: string): JWTPayload | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'tanimaju-backend',
      audience: 'tanimaju-frontend',
      algorithms: ['HS256']
    }) as JWTPayload;
    
    return decoded;
  } catch {
    return null;
  }
};

export const getTokenFromHeader = (authHeader: string | undefined): string | null => {
  if (!authHeader) return null;
  
  // Mengecek format "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
};

export const getExpirationTime = (remember: boolean = false): Date => {
  const now = new Date();
  const expirationDays = remember ? 30 : 7;
  return new Date(now.getTime() + (expirationDays * 24 * 60 * 60 * 1000));
};
