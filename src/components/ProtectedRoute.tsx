import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect } from 'react';

export function ProtectedRoute({ children, requireSuperAdmin = false }: { children: React.ReactNode, requireSuperAdmin?: boolean }) {
    const { currentUser, loading } = useAuth();
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const location = useLocation();

    useEffect(() => {
        if (!loading && currentUser) {
            if (requireSuperAdmin) {
                currentUser.getIdTokenResult(true).then(idTokenResult => {
                    const role = idTokenResult.claims.role as string;
                    if (role === 'super_admin') {
                        setIsAuthorized(true);
                    } else {
                        setIsAuthorized(false);
                    }
                }).catch(() => setIsAuthorized(false));
            } else {
                setIsAuthorized(true);
            }
        } else if (!loading && !currentUser) {
            setIsAuthorized(false);
        }
    }, [currentUser, loading, requireSuperAdmin, location.pathname]);

    if (loading || isAuthorized === null) {
        return (
            <div className="flex-1 bg-zinc-950 flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <span className="relative flex h-5 w-5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-5 w-5 bg-accent"></span>
                    </span>
                    <p className="text-zinc-500 text-sm font-bold uppercase tracking-widest animate-pulse">Authenticating Identity...</p>
                </div>
            </div>
        );
    }

    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    if (!isAuthorized) {
        // Force redirect normal users to their explicit Sandbox / Workspace Hub
        return <Navigate to="/workspace" replace />;
    }

    return <>{children}</>;
}
