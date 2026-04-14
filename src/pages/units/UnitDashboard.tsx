import { useParams, useNavigate } from 'react-router-dom';
import { CarFront, ArrowLeft } from 'lucide-react';

export const UnitDashboard = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                    <ArrowLeft className="w-5 h-5 text-zinc-400" />
                </button>
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center border border-blue-500/30">
                    <CarFront className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight">Active Chassis Build</h1>
                    <p className="text-zinc-400 text-sm font-mono mt-1">Vehicle Node ID: {id}</p>
                </div>
            </div>

            <div className="bg-zinc-900 border border-white/5 rounded-3xl p-8 flex flex-col items-center justify-center min-h-[400px]">
                <h2 className="text-xl font-bold text-white mb-2">Vehicle Operations Interface</h2>
                <p className="text-zinc-500 text-center max-w-md">
                    This module is currently being scaffolded. Eventually, this will display the active Work Order, Labor Clock, and Custom Equipment BOM for this specific unit.
                </p>
            </div>
        </div>
    );
};
