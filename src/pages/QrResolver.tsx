import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Loader2, AlertTriangle, ScanLine, ArrowLeft } from 'lucide-react';

export function QrResolver() {
    const { tagId } = useParams();
    const navigate = useNavigate();
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!tagId) {
            setError(true);
            return;
        }

        const resolveTag = async () => {
            try {
                // 1. Check Internal DB Registry (Direct ID match)
                const docRef = doc(db, 'vehicles', tagId);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    navigate(`/business/vehicles?jobId=${docSnap.id}`, { replace: true });
                    return;
                }

                // 2. Check Assigned External Tracking Tags Array
                const q = query(collection(db, 'vehicles'), where('trackingTags', 'array-contains', tagId));
                const snap = await getDocs(q);

                if (!snap.empty) {
                    const vehicleDoc = snap.docs[0];
                    navigate(`/business/vehicles?jobId=${vehicleDoc.id}`, { replace: true });
                } else {
                    setError(true);
                }
            } catch (err) {
                console.error("Resolution error:", err);
                setError(true);
            }
        };

        resolveTag();
    }, [tagId, navigate]);

    if (error) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
                <div className="bg-red-500/10 border border-red-500/20 w-16 h-16 flex items-center justify-center rounded-2xl mb-6">
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <h1 className="text-2xl font-black text-white tracking-tight mb-2">Unlinked Hardware Tag</h1>
                <p className="text-zinc-500 max-w-sm mb-8">This QR payload ({tagId}) is securely verified by UpfittersOS but has not yet been assigned to a registered fleet asset.</p>
                <div className="flex flex-col gap-3 w-full max-w-xs mx-auto">
                    <button onClick={() => navigate('/business/vehicles')} className="w-full bg-accent hover:bg-accent-hover text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                        <ScanLine className="w-4 h-4" /> Go to Intake Desk to Assign
                    </button>
                    <button onClick={() => navigate('/')} className="w-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors border border-zinc-800">
                        <ArrowLeft className="w-4 h-4" /> Return to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-accent mb-6" />
            <h1 className="text-sm font-black text-white uppercase tracking-widest animate-pulse">Resolving Payload...</h1>
            <p className="text-zinc-500 font-mono text-[10px] mt-2">{tagId}</p>
        </div>
    );
}
