import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Link2, CarFront, Box, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const RegisterQr = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    
    const [isLinking, setIsLinking] = useState(false);

    const handleCreateVehicle = async () => {
        setIsLinking(true);
        // This is a placeholder for the actual Vehicle Intake Form.
        // In a full implementation, they would type the VIN/Customer here before calling the backend.
        
        try {
            const token = await currentUser?.getIdToken();
            
            // 1. Create the new vehicle dynamically
            const vehicleRes = await fetch('https://api-saegrp.web.app/units', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    qrNodeId: id,
                    vin: 'PENDING_INTAKE',
                    status: 'Intake'
                })
            });

            const vehicleData = await vehicleRes.json();
            
            if (vehicleData.id) {
                 navigate(`/workspace/units/${vehicleData.id}`);
            }
        } catch (e) {
            console.error(e);
            setIsLinking(false);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in">
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/scan')} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                    <ArrowLeft className="w-5 h-5 text-zinc-400" />
                </button>
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center border border-purple-500/30">
                    <Link2 className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight">Blank Tag Detected</h1>
                    <p className="text-zinc-400 text-sm font-mono mt-1">Physical QR Code: {id}</p>
                </div>
            </div>

            <div className="bg-zinc-900 border border-white/5 rounded-3xl p-8">
                <h2 className="text-xl font-bold text-white mb-6">What are you sticking this tag to?</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button 
                        onClick={handleCreateVehicle}
                        disabled={isLinking}
                        className="p-6 bg-zinc-800/50 hover:bg-zinc-800 border-2 border-transparent hover:border-blue-500/30 rounded-2xl flex flex-col items-center gap-4 transition-all text-left"
                    >
                        <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center">
                            {isLinking ? <Loader2 className="w-8 h-8 text-blue-400 animate-spin" /> : <CarFront className="w-8 h-8 text-blue-400" />}
                        </div>
                        <div className="text-center">
                            <h3 className="text-white font-bold text-lg">New Vehicle Intake</h3>
                            <p className="text-zinc-400 flex-1 mt-1 text-sm">Assign this tag to a customer's keychain to track the physical chassis through the shop.</p>
                        </div>
                    </button>

                    <button 
                        onClick={() => alert("Inventory linking scaffolding pending.")}
                        disabled={isLinking}
                        className="p-6 bg-zinc-800/50 hover:bg-zinc-800 border-2 border-transparent hover:border-amber-500/30 rounded-2xl flex flex-col items-center gap-4 transition-all text-left"
                    >
                        <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center">
                            <Box className="w-8 h-8 text-amber-400" />
                        </div>
                        <div className="text-center">
                            <h3 className="text-white font-bold text-lg">Inventory Stock Code</h3>
                            <p className="text-zinc-400 flex-1 mt-1 text-sm">Bind this tag to a stockroom bin or high-value individual part for immediate scanning.</p>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};
