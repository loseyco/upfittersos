import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { currentUser, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex-1 bg-zinc-950 flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <span className="relative flex h-5 w-5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-5 w-5 bg-accent"></span>
                    </span>
                    <p className="text-zinc-500 text-sm font-bold uppercase tracking-widest animate-pulse">Authenticating</p>
                </div>
            </div>
        );
    }

    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}
