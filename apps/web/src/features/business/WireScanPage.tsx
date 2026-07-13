import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  collection, doc, onSnapshot, updateDoc, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Loader2, Search, ArrowLeft, Layers
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

interface WireReel {
  gauge: string;
  color: string;
  length: string;
  status: 'in_stock' | 'low' | 'empty';
}

interface WireRod {
  id: string;
  name: string;
  reels: WireReel[];
}

export function WireScanPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const [rods, setRods] = useState<WireRod[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Sync with Firestore
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    const q = collection(db, `businesses/${tenantId}/wire_rods`);
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WireRod));
      // Sort alphabetically by name
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      setRods(list);
      setLoading(false);
    }, (err) => {
      console.error(err);
      toast.error("Failed to load wires");
      setLoading(false);
    });
    return () => unsubscribe();
  }, [tenantId]);

  // Filtered reels list for rapid tapping
  const filteredReels = useMemo(() => {
    const queryStr = searchQuery.toLowerCase().trim();
    const result: Array<{ rod: WireRod; reel: WireReel; reelIndex: number }> = [];

    rods.forEach(rod => {
      if (rod.reels) {
        rod.reels.forEach((reel, index) => {
          if (!queryStr) {
            result.push({ rod, reel, reelIndex: index });
          } else {
            const matches = 
              rod.name.toLowerCase().includes(queryStr) ||
              reel.gauge.toLowerCase().includes(queryStr) ||
              reel.color.toLowerCase().includes(queryStr) ||
              reel.status.toLowerCase().includes(queryStr);
            if (matches) {
              result.push({ rod, reel, reelIndex: index });
            }
          }
        });
      }
    });
    return result;
  }, [rods, searchQuery]);

  // Update status handler
  const handleUpdateStatus = async (rodId: string, reelIndex: number, newStatus: 'in_stock' | 'low' | 'empty') => {
    const actionKey = `${rodId}-${reelIndex}`;
    setUpdatingId(actionKey);
    try {
      const rodRef = doc(db, `businesses/${tenantId}/wire_rods`, rodId);
      const rod = rods.find(r => r.id === rodId);
      if (!rod) return;

      const currentReels = [...(rod.reels || [])];
      if (reelIndex < currentReels.length) {
        currentReels[reelIndex] = {
          ...currentReels[reelIndex],
          status: newStatus
        };
        await updateDoc(rodRef, {
          reels: currentReels,
          updatedAt: serverTimestamp()
        });
        toast.success("Inventory updated");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col p-4 pb-12 select-none">
      {/* Mobile Header */}
      <header className="flex items-center gap-3 mb-4 py-2 shrink-0">
        <button 
          onClick={() => navigate(`/business/${tenantId}/overview`)}
          className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-2xl hover:text-white text-zinc-400 active:scale-95 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-black tracking-wider uppercase leading-none">
            Wire Wall Scanner
          </h1>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">
            Report low or empty reels
          </p>
        </div>
      </header>

      {/* Floating search box */}
      <div className="relative mb-4 shrink-0">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          placeholder="Search by gauge or color..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-xs text-white placeholder-zinc-600 outline-none focus:border-indigo-500 transition-all font-semibold"
        />
      </div>

      {/* List content */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-xs text-zinc-400 font-semibold uppercase tracking-widest">Loading reels...</p>
          </div>
        ) : filteredReels.length === 0 ? (
          <div className="text-center py-16 px-6 bg-zinc-900/40 rounded-2xl border border-zinc-850">
            <Layers className="w-10 h-10 text-zinc-650 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-zinc-400">No wire reels found</h3>
            <p className="text-xs text-zinc-600 mt-1 max-w-xs mx-auto">
              Try adjusting your search query, or populate the spreadsheet dashboard first.
            </p>
          </div>
        ) : (
          filteredReels.map(({ rod, reel, reelIndex }) => {
            const isUpdating = updatingId === `${rod.id}-${reelIndex}`;

            return (
              <div 
                key={`${rod.id}-${reelIndex}`}
                className="bg-zinc-900 border border-zinc-850/80 rounded-2xl p-4 flex flex-col gap-3 shadow-md"
              >
                {/* Header info */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[9px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
                      {rod.name} • Pos {reelIndex + 1}
                    </span>
                    <h2 className="text-sm font-black text-white mt-1.5 leading-none">
                      {reel.gauge} {reel.color ? `(${reel.color})` : ''}
                    </h2>
                  </div>
                  {reel.length && (
                    <span className="text-[10px] bg-zinc-950 border border-zinc-800 px-2 py-1 rounded text-zinc-400 font-bold shrink-0">
                      {reel.length}
                    </span>
                  )}
                </div>

                {/* Status Options Button Grid */}
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <button
                    onClick={() => handleUpdateStatus(rod.id, reelIndex, 'in_stock')}
                    disabled={isUpdating}
                    className={cn(
                      "py-2.5 px-2 border rounded-xl text-[10px] font-extrabold flex flex-col items-center gap-1.5 active:scale-95 transition-all cursor-pointer",
                      reel.status === 'in_stock' 
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" 
                        : "bg-zinc-950 border-zinc-850 text-zinc-500"
                    )}
                  >
                    <span className={cn("w-2 h-2 rounded-full", reel.status === 'in_stock' ? "bg-emerald-500" : "bg-zinc-700")} />
                    In Stock
                  </button>

                  <button
                    onClick={() => handleUpdateStatus(rod.id, reelIndex, 'low')}
                    disabled={isUpdating}
                    className={cn(
                      "py-2.5 px-2 border rounded-xl text-[10px] font-extrabold flex flex-col items-center gap-1.5 active:scale-95 transition-all cursor-pointer",
                      reel.status === 'low' 
                        ? "bg-amber-500/20 border-amber-500 text-amber-400" 
                        : "bg-zinc-950 border-zinc-850 text-zinc-500"
                    )}
                  >
                    <span className={cn("w-2 h-2 rounded-full animate-pulse", reel.status === 'low' ? "bg-amber-500" : "bg-zinc-700")} />
                    Low Stock
                  </button>

                  <button
                    onClick={() => handleUpdateStatus(rod.id, reelIndex, 'empty')}
                    disabled={isUpdating}
                    className={cn(
                      "py-2.5 px-2 border rounded-xl text-[10px] font-extrabold flex flex-col items-center gap-1.5 active:scale-95 transition-all cursor-pointer",
                      reel.status === 'empty' 
                        ? "bg-rose-500/20 border-rose-500 text-rose-400" 
                        : "bg-zinc-950 border-zinc-850 text-zinc-500"
                    )}
                  >
                    <span className={cn("w-2 h-2 rounded-full", reel.status === 'empty' ? "bg-rose-500 animate-ping-once" : "bg-zinc-700")} />
                    Out / Empty
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
