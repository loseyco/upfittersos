import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { CanvasGalleryTab } from './admin/CanvasGalleryTab';
import { WorkflowCanvasTab } from './admin/WorkflowCanvasTab';
import { ArrowLeft, ShieldAlert, Workflow } from 'lucide-react';

export function WorkflowWhiteboards() {
    const { tenantId } = useAuth();
    const navigate = useNavigate();
    const { checkPermission, loading } = usePermissions();
    const [searchParams] = useSearchParams();
    const [activeCanvasId, setActiveCanvasId] = useState<string | null>(searchParams.get('canvasId'));

    const canView = checkPermission('manage_canvases');

    if (loading) return <div className="min-h-screen bg-zinc-950"></div>;

    if (!canView) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center p-6">
                <ShieldAlert className="w-16 h-16 text-red-500/50 mb-6" />
                <h2 className="text-2xl font-black text-white tracking-tight mb-2">Access Denied</h2>
                <p className="text-zinc-500 max-w-md">Your profile does not have Whiteboard clearance.</p>
                <button onClick={() => navigate('/dashboard')} className="mt-8 text-accent hover:text-white transition-colors flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Return to Hub
                </button>
            </div>
        );
    }

    return (
        <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden font-sans">
            {/* Header Toolbar */}
            <div className="p-4 md:px-8 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between shrink-0 relative z-10 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <button onClick={() => activeCanvasId ? setActiveCanvasId(null) : navigate('/dashboard')} className="p-2 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                            <Workflow className="w-5 h-5 text-cyan-400" /> {activeCanvasId ? 'Canvas Document' : 'Workflow Whiteboards'}
                        </h2>
                        <p className="text-zinc-500 text-xs mt-0.5">Create and manage infinite logic canvases</p>
                    </div>
                </div>
            </div>

            {/* Dynamic Content */}
            <div className="flex-1 overflow-hidden relative">
                {activeCanvasId  
                    ? <WorkflowCanvasTab tenantId={tenantId || ''} canvasId={activeCanvasId} onBack={() => setActiveCanvasId(null)} />
                    : <CanvasGalleryTab tenantId={tenantId || ''} onOpenCanvas={setActiveCanvasId} />
                }
            </div>
        </div>
    );
}
