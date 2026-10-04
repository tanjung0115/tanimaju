import { Navigate } from "react-router-dom";
import { UserRole, useAuth } from "@/context/AuthContext";
import { LoadingScreen } from "@/components/LoadingSpinner";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  allowedRoles?: UserRole[];
  exactRoles?: UserRole[];
}

export default function ProtectedRoute({
  children,
  requireAdmin = false,
  allowedRoles,
  exactRoles,
}: ProtectedRouteProps) {
  const { loading, isAuthenticated, hasRole, user } = useAuth();

  // Show loading while checking authentication
  if (loading) {
    return <LoadingScreen />;
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If admin is required but user is not admin
  if (
    (requireAdmin && !hasRole("admin")) ||
    (allowedRoles && !hasRole(allowedRoles)) ||
    (exactRoles && (!user || !exactRoles.includes(user.role)))
  ) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
