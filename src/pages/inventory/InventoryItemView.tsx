import { useParams, useNavigate } from 'react-router-dom';
import { Box, ArrowLeft } from 'lucide-react';

export const InventoryItemView = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                    <ArrowLeft className="w-5 h-5 text-zinc-400" />
                </button>
                <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center border border-amber-500/30">
                    <Box className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight">Inventory Details</h1>
                    <p className="text-zinc-400 text-sm font-mono mt-1">Catalog Item: {id}</p>
                </div>
            </div>

            <div className="bg-zinc-900 border border-white/5 rounded-3xl p-8 flex flex-col items-center justify-center min-h-[400px]">
                <h2 className="text-xl font-bold text-white mb-2">Asset Catalog Management</h2>
                <p className="text-zinc-500 text-center max-w-md">
                    You have successfully resolved an Inventory QR sticker. This screen will house the stock levels, bin location changes, and assignment history.
                </p>
            </div>
        </div>
    );
};
