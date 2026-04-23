import { Navigate } from 'react-router-dom';

export function RootRedirect() {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
        return <Navigate to="/mobile" replace />;
    }
    return <Navigate to="/workspace" replace />;
}
