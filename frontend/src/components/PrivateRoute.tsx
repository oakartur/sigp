import { useContext } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

interface PrivateRouteProps {
  children: ReactNode;
}

export default function PrivateRoute({ children }: PrivateRouteProps) {
  const { token } = useContext(AuthContext);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
