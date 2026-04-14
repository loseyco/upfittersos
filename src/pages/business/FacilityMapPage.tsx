import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { FacilityMapTab } from './admin/FacilityMapTab';

export function FacilityMapPage() {
    const { tenantId } = useAuth();
    const navigate = useNavigate();
    const { checkPermission, loading } = usePermissions();

    if (loading) return <div className="min-h-screen bg-zinc-950"></div>;

    if (!checkPermission('view_facility_map')) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center p-6 text-white">
                <h2 className="text-2xl font-black mb-2">Access Denied</h2>
                <p className="text-zinc-500 mb-6">You do not have clearance to access the facility map.</p>
                <button onClick={() => navigate('/dashboard')} className="text-accent flex items-center gap-2 hover:text-white transition-colors">
                    <ArrowLeft className="w-4 h-4"/> Back to Hub
                </button>
            </div>
        );
    }

    if (!tenantId || tenantId === 'GLOBAL' || tenantId === 'unassigned') {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white">
                <h2 className="text-xl font-bold mb-4">No Business Assigned</h2>
                <button onClick={() => navigate('/dashboard')} className="text-accent">Back to Hub</button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full bg-zinc-950 absolute inset-0 z-50">
            {/* Header Toolbar */}
            <div className="h-14 md:h-16 border-b border-zinc-800 flex items-center justify-between px-4 md:px-8 bg-zinc-900/90 backdrop-blur-md shrink-0">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate('/dashboard')}
                        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-bold bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800"
                    >
                        <ArrowLeft className="w-4 h-4" /> Hub 
                    </button>
                    <h1 className="text-base md:text-lg font-black text-white capitalize">Facility Map</h1>
                </div>
            </div>

            {/* Map Area */}
            <div className="flex-1 overflow-hidden relative">
                <FacilityMapTab tenantId={tenantId} readOnly={true} />
            </div>
        </div>
    );
}
