import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Workflow, Plus, Trash2, Edit2, Loader2, ArrowRight, Clock, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';

interface CanvasMeta {
    id: string;
    tenantId: string;
    name: string;
    description: string;
    status?: string;
    updatedAt?: { toDate?: () => Date; toMillis?: () => number } | Date | string | null;
    createdAt?: { toDate?: () => Date; toMillis?: () => number } | Date | string | null;
    updatedBy?: string;
}

const getMillis = (ts: CanvasMeta['updatedAt']): number => {
    if (!ts) return 0;
    if (typeof ts === 'object') {
        if ('toMillis' in ts && typeof (ts as any).toMillis === 'function') {
            return (ts as any).toMillis();
        }
        if (ts instanceof Date) {
            return ts.getTime();
        }
        if ('toDate' in ts && typeof (ts as any).toDate === 'function') {
            return (ts as any).toDate().getTime();
        }
    }
    if (typeof ts === 'string') {
        const parsed = Date.parse(ts);
        return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
};

export function CanvasGalleryTab({ tenantId, onOpenCanvas }: { tenantId: string, onOpenCanvas: (canvasId: string) => void }) {
    const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const { user, permissions, isSuperAdmin } = useAuthStore();
    
    const hasViewPermission = isSuperAdmin || permissions['whiteboards.view'];
    const hasManagePermission = isSuperAdmin || permissions['whiteboards.manage'];

    const formatTime = (ts: unknown) => {
        if (!ts) return '';
        try {
            const date = (ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as { toDate?: () => Date }).toDate === 'function')
                ? (ts as { toDate: () => Date }).toDate()
                : new Date(ts as string | number);
            return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
        } catch {
            return '';
        }
    };

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
                const timeA = getMillis(a.updatedAt);
                const timeB = getMillis(b.updatedAt);
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
        if (!hasManagePermission) return;
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
                updatedBy: user?.displayName || user?.email || 'Unknown User',
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
        if (!hasManagePermission) return;
        const newName = window.prompt("Edit Canvas Name:", canvas.name);
        if (!newName || newName.trim().length === 0 || newName === canvas.name) return;

        try {
            await updateDoc(doc(db, 'business_canvases', canvas.id), {
                name: newName.trim(),
                updatedBy: user?.displayName || user?.email || 'Unknown User',
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error(err);
            toast.error("Failed to rename whiteboard.");
        }
    };

    const handleArchive = async (e: React.MouseEvent, canvasId: string) => {
        e.stopPropagation();
        if (!hasManagePermission) return;
        if (!window.confirm("Archive this Whiteboard? It will be hidden from your default gallery.")) return;

        try {
            await updateDoc(doc(db, 'business_canvases', canvasId), {
                status: 'archived',
                updatedBy: user?.displayName || user?.email || 'Unknown User',
                updatedAt: serverTimestamp()
            });
            toast.success("Whiteboard archived");
        } catch (err) {
            console.error(err);
            toast.error("Failed to archive whiteboard.");
        }
    };

    if (!hasViewPermission) {
        return (
            <div className="p-12 text-center bg-zinc-950 min-h-screen flex flex-col items-center justify-center">
                <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mb-6">
                    <ShieldAlert className="w-10 h-10 text-rose-500" />
                </div>
                <h3 className="text-xl font-black text-white mb-2">Access Restricted</h3>
                <p className="text-zinc-500 max-w-sm">
                    Your account does not have the required permissions to view whiteboards. Please contact your administrator.
                </p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-zinc-950 font-bold text-zinc-500 uppercase tracking-widest text-sm min-h-[300px]">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-accent" />
                Loading Gallery...
            </div>
        );
    }

    const filteredCanvases = canvases.filter(canvas => {
        const matchesStatus = showArchived ? canvas.status === 'archived' : canvas.status !== 'archived';
        const matchesSearch = canvas.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesStatus && matchesSearch;
    });

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
                    
                    {hasManagePermission && (
                        <button 
                            onClick={handleCreateCanvas}
                            disabled={isCreating}
                            className="flex items-center justify-center gap-2 px-6 py-3 bg-accent text-zinc-950 font-bold rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-50"
                        >
                            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
                            New Whiteboard
                        </button>
                    )}
                </div>

                <div className="mb-6 flex flex-col sm:flex-row gap-4 justify-between items-center w-full">
                    <div className="relative w-full sm:max-w-md">
                        <input
                            type="text"
                            placeholder="Search canvases by name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-2.5 text-zinc-500 hover:text-white text-xs"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    
                    <div className="flex justify-end gap-2 w-full sm:w-auto">
                        <button 
                            onClick={() => setShowArchived(!showArchived)}
                            className={`text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-colors ${showArchived ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300'}`}
                        >
                            {showArchived ? 'Hide Archived' : 'Show Archived'}
                        </button>
                    </div>
                </div>

                {filteredCanvases.length === 0 ? (
                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-3xl p-16 text-center">
                        <div className="w-20 h-20 bg-zinc-900 rounded-2xl flex items-center justify-center mb-6">
                            <Workflow className="w-10 h-10 text-zinc-700" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">No Whiteboards Found</h3>
                        <p className="text-zinc-500 max-w-md mb-8">
                            {searchQuery ? "No canvases match your search criteria." : "Start mapping out your business processes by creating your first logic board."}
                        </p>
                        {hasManagePermission && !searchQuery && (
                            <button 
                                onClick={handleCreateCanvas}
                                className="flex items-center gap-2 px-6 py-3 bg-zinc-800 text-white font-bold rounded-xl hover:bg-zinc-700 transition-colors"
                            >
                                <Plus className="w-5 h-5" />
                                Create Canvas
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredCanvases.map(canvas => (
                            <div 
                                key={canvas.id}
                                onClick={() => onOpenCanvas(canvas.id)}
                                className={`group relative bg-zinc-900 border rounded-2xl p-6 transition-all cursor-pointer flex flex-col min-h-[220px] ${
                                    canvas.status === 'archived' ? 'border-zinc-800/50 opacity-70 hover:opacity-100 hover:border-zinc-600' : 'border-zinc-800 hover:border-accent hover:shadow-[0_0_30px_rgba(14,165,233,0.1)]'
                                }`}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="w-12 h-12 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-center group-hover:scale-110 group-hover:border-accent/40 transition-all">
                                        <Workflow className={`w-6 h-6 ${canvas.status === 'archived' ? 'text-zinc-500' : 'text-accent'}`} />
                                    </div>
                                    <div className="flex gap-2">
                                        {hasManagePermission && (
                                            <button 
                                                onClick={(e) => handleEditName(e, canvas)}
                                                className="p-2 text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                title="Rename Canvas"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                        )}
                                        {hasManagePermission && canvas.status !== 'archived' && (
                                            <button 
                                                onClick={(e) => handleArchive(e, canvas.id)}
                                                className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                title="Archive Canvas"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                    
                                <h3 className="text-xl font-bold text-white mb-2 line-clamp-2">{canvas.name}</h3>
                                
                                <div className="mt-auto flex items-center justify-between text-zinc-500 font-bold text-[10px] uppercase tracking-widest pt-5">
                                    <div className="flex flex-col gap-1 w-full max-w-[140px]">
                                        <span className="flex items-center gap-1.5 opacity-60"><Clock className="w-3 h-3"/> Last Entry</span>
                                        {canvas.updatedAt ? (
                                            <span className="truncate text-zinc-400 normal-case tracking-normal">
                                                {formatTime(canvas.updatedAt)} <br/>
                                                <span className="opacity-70 font-medium">by {canvas.updatedBy ? canvas.updatedBy.split(' ')[0] : 'System'}</span>
                                            </span>
                                        ) : (
                                            <span className="truncate text-zinc-600">Pending Sync</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 group-hover:text-accent transition-colors ml-auto bg-zinc-950 p-2 rounded-lg border border-zinc-800 shrink-0">
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
