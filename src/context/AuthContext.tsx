import { apiFetch } from "@/lib/api";
// src/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

interface User {
  id: number;
  username: string;
  email: string;
  role: UserRole;
}

export type UserRole = "admin" | "user" | "petani" | "penyuluh";

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isPetani: boolean;
  isPenyuluh: boolean;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const API_URL = import.meta.env.VITE_API_URL;

  const checkAuth = useCallback(async () => {
    try {
      // Server identity is authoritative; never grant roles from cached browser data.
      const response = await apiFetch(`${API_URL}/auth/me`, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          setUser(data.user);
          localStorage.setItem("user", JSON.stringify(data.user));
        } else {
          setUser(null);
          localStorage.removeItem("user");
          localStorage.removeItem("authToken");
        }
      } else if (response.status === 401) {
        // Token is invalid/expired - clear stored data
        setUser(null);
        localStorage.removeItem("user");
        localStorage.removeItem("authToken");
      } else {
        // Other errors (500, etc.)
        console.error("Auth check failed with status:", response.status);
        setUser(null);
        localStorage.removeItem("user");
        localStorage.removeItem("authToken");
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      setUser(null);
      localStorage.removeItem("user");
      localStorage.removeItem("authToken");
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  const login = async (email: string, password: string, remember: boolean = false): Promise<boolean> => {
    try {
      setLoading(true);
      const response = await apiFetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password, remember }),
      });

      const data = await response.json();

      if (data.success && data.user) {
        setUser(data.user);
        localStorage.setItem("user", JSON.stringify(data.user));
        localStorage.removeItem("authToken");
        return true;
      } else {
        return false;
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await apiFetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout request failed:", error);
    } finally {
      setUser(null);
      localStorage.removeItem("user");
      localStorage.removeItem("authToken");
    }
  };

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const value: AuthContextType = {
    user,
    role: user?.role || null,
    loading,
    login,
    logout,
    checkAuth,
    isAuthenticated: !!user,
    isAdmin: user?.role === "admin",
    isPetani: user?.role === "petani" || user?.role === "user",
    isPenyuluh: user?.role === "penyuluh",
    hasRole: (roles) => {
      if (!user) return false;
      const allowedRoles = Array.isArray(roles) ? roles : [roles];
      if (user.role === "user" && allowedRoles.includes("petani")) {
        return true;
      }
      return allowedRoles.includes(user.role);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
