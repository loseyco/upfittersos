import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { Workflow, Plus, Trash2, Edit2, Loader2, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

interface CanvasMeta {
    id: string;
    tenantId: string;
    name: string;
    description: string;
    updatedAt?: any;
    createdAt?: any;
}

export function CanvasGalleryTab({ tenantId, onOpenCanvas }: { tenantId: string, onOpenCanvas: (canvasId: string) => void }) {
    const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL') return;

        // Automatically upgrade the legacy v1 workspace canvas to the v2 standard
        const migrateLegacyCanvas = async () => {
            try {
                const legacyDocRef = doc(db, 'business_canvases', tenantId);
                const legacySnap = await getDoc(legacyDocRef);
                if (legacySnap.exists()) {
                    const data = legacySnap.data();
                    if (!data.tenantId) {
                        await updateDoc(legacyDocRef, {
                            tenantId,
                            name: 'Primary Process Canvas',
                            description: 'Recovered from system upgrade',
                            updatedAt: serverTimestamp(),
                            createdAt: serverTimestamp()
                        });
                        console.log("Legacy Workspace Canvas successfully recovered and mounted into Gallery Mode.");
                    }
                }
            } catch (err) {
                console.error("Migration check failed:", err);
            }
        };
        migrateLegacyCanvas();

        const q = query(collection(db, 'business_canvases'), where('tenantId', '==', tenantId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: CanvasMeta[] = [];
            snapshot.forEach(docSnap => {
                list.push({ id: docSnap.id, ...docSnap.data() } as CanvasMeta);
            });
            // Sort by latest
            list.sort((a, b) => {
                const timeA = a.updatedAt?.toMillis?.() || 0;
                const timeB = b.updatedAt?.toMillis?.() || 0;
                return timeB - timeA;
            });
            
            setCanvases(list);
            setIsLoading(false);
        }, (err) => {
            console.error("Failed to load canvases", err);
            toast.error("Failed to load whiteboard gallery.");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [tenantId]);

    const handleCreateCanvas = async () => {
        const name = window.prompt("Enter a name for the new Whiteboard Canvas:");
        if (!name || name.trim().length === 0) return;

        setIsCreating(true);
        try {
            await addDoc(collection(db, 'business_canvases'), {
                tenantId,
                name: name.trim(),
                description: '',
                nodes: [],
                edges: [],
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp()
            });
            toast.success("New Whiteboard Created");
        } catch (err) {
            console.error("Create canvas error", err);
            toast.error("Failed to create whiteboard.");
        } finally {
            setIsCreating(false);
        }
    };

    const handleEditName = async (e: React.MouseEvent, canvas: CanvasMeta) => {
        e.stopPropagation();
        const newName = window.prompt("Edit Canvas Name:", canvas.name);
        if (!newName || newName.trim().length === 0 || newName === canvas.name) return;

        try {
            await updateDoc(doc(db, 'business_canvases', canvas.id), {
                name: newName.trim(),
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error(err);
            toast.error("Failed to rename whiteboard.");
        }
    };

    const handleDelete = async (e: React.MouseEvent, canvasId: string) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to completely delete this Whiteboard? This cannot be undone.")) return;

        try {
            await deleteDoc(doc(db, 'business_canvases', canvasId));
            toast.success("Whiteboard deleted");
        } catch (err) {
            console.error(err);
            toast.error("Failed to delete whiteboard.");
        }
    };

    if (isLoading) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-zinc-950 font-bold text-zinc-500 uppercase tracking-widest text-sm">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-accent" />
                Loading Gallery...
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col overflow-y-auto bg-zinc-950 p-6 md:p-10">
            <div className="max-w-6xl w-full mx-auto">
                
                <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-800 pb-6 mb-8 gap-6">
                    <div>
                        <h1 className="text-3xl font-black text-white flex items-center gap-3">
                            <Workflow className="w-8 h-8 text-accent" />
                            Workflow Whiteboards
                        </h1>
                        <p className="text-sm text-zinc-500 mt-2 max-w-2xl">
                            Create and manage infinite logic canvases to organize your operational procedures, software lifecycles, and staff workflows.
                        </p>
                    </div>
                    
                    <button 
                        onClick={handleCreateCanvas}
                        disabled={isCreating}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-accent text-zinc-950 font-bold rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-50"
                    >
                        {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
                        New Whiteboard
                    </button>
                </div>

                {canvases.length === 0 ? (
                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-3xl p-16 text-center">
                        <div className="w-20 h-20 bg-zinc-900 rounded-2xl flex items-center justify-center mb-6">
                            <Workflow className="w-10 h-10 text-zinc-700" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">No Whiteboards Yet</h3>
                        <p className="text-zinc-500 max-w-md mb-8">
                            Start mapping out your business processes or technical requirements by creating your first logic board.
                        </p>
                        <button 
                            onClick={handleCreateCanvas}
                            className="flex items-center gap-2 px-6 py-3 bg-zinc-800 text-white font-bold rounded-xl hover:bg-zinc-700 transition-colors"
                        >
                            <Plus className="w-5 h-5" />
                            Create Canvas
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {canvases.map(canvas => (
                            <div 
                                key={canvas.id}
                                onClick={() => onOpenCanvas(canvas.id)}
                                className="group relative bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-accent hover:shadow-[0_0_30px_rgba(14,165,233,0.1)] transition-all cursor-pointer flex flex-col min-h-[220px]"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="w-12 h-12 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-center group-hover:scale-110 group-hover:border-accent/40 transition-all">
                                        <Workflow className="w-6 h-6 text-accent" />
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={(e) => handleEditName(e, canvas)}
                                            className="p-2 text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                            title="Rename Canvas"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={(e) => handleDelete(e, canvas.id)}
                                            className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                            title="Delete Canvas"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                
                                <h3 className="text-xl font-bold text-white mb-2 line-clamp-2">{canvas.name}</h3>
                                
                                <div className="mt-auto pt-6 flex items-center justify-between text-zinc-500 font-bold text-xs uppercase tracking-wider">
                                    <div className="flex items-center gap-1.5">
                                        Last Updated
                                    </div>
                                    <div className="flex items-center gap-2 group-hover:text-accent transition-colors">
                                        Open Canvas <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
