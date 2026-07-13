import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  collection, doc, onSnapshot, updateDoc, addDoc, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Loader2, Search, ArrowLeft, Layers, Package, Send, Plus, AlertTriangle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';

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

const HARDWARE_SUGGESTIONS = [
  '1/4-20 Hex Nut',
  '1/4-20 x 1" Bolt',
  'Ring Terminal 10AWG',
  'Heat Shrink 1/4"',
  'Zip Ties (8-inch)',
  'Butt Connector 16-14',
  'Split Loom 1/2"',
  'Grommet 3/8"'
];

export function WireScanPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'wires' | 'parts'>('wires');

  // Wires tab state
  const [rods, setRods] = useState<WireRod[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Parts request form state
  const [partName, setPartName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('pcs');
  const [urgency, setUrgency] = useState<'normal' | 'urgent'>('normal');
  const [notes, setNotes] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [isSubmittingPart, setIsSubmittingPart] = useState(false);

  // Sync with Firestore for wires
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    const q = collection(db, `businesses/${tenantId}/wire_rods`);
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WireRod));
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

  // Set default requester name
  useEffect(() => {
    if (user) {
      setRequestedBy(user.displayName || user.email?.split('@')[0] || '');
    }
  }, [user]);

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

  // Update wire status handler
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

  // Submit parts request handler
  const handleSubmitPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partName.trim()) {
      toast.error("Please enter a part or hardware description");
      return;
    }

    setIsSubmittingPart(true);
    try {
      // Append unit to partName if not pcs
      const resolvedPartName = unit !== 'pcs' 
        ? `${partName.trim()} (${unit})` 
        : partName.trim();

      const newDoc = {
        partName: resolvedPartName,
        quantity: parseInt(quantity) || 1,
        urgency,
        jobId: null,
        jobTitle: null,
        notes: notes.trim() ? `[Mobile Bin Scan] ${notes.trim()}` : '[Mobile Bin Scan]',
        status: 'pending',
        requestedBy: requestedBy.trim() || 'Shop Floor',
        requestedById: user?.uid || null,
        isArchived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, `businesses/${tenantId}/parts_requests`), newDoc);

      // Log to global activity feed
      await addDoc(collection(db, `businesses/${tenantId}/activity_feed`), {
        type: 'parts',
        title: 'Hardware/Parts Request (Mobile)',
        message: `${resolvedPartName} requested by ${requestedBy || 'Shop Floor'}`,
        timestamp: serverTimestamp(),
        severity: urgency === 'urgent' ? 'warning' : 'info',
        author: requestedBy || 'Shop Floor'
      });

      toast.success("Parts request submitted!");
      setPartName('');
      setQuantity('1');
      setUnit('pcs');
      setUrgency('normal');
      setNotes('');
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit request");
    } finally {
      setIsSubmittingPart(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-955 text-white font-sans flex flex-col p-4 pb-12 select-none">
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
            Shop Floor Assist
          </h1>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">
            Report stock or request parts
          </p>
        </div>
      </header>

      {/* Tab Switcher */}
      <div className="flex gap-2 mb-4 shrink-0 bg-zinc-900 p-1 rounded-2xl border border-zinc-850">
        <button
          onClick={() => setActiveTab('wires')}
          className={cn(
            "flex-1 py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer",
            activeTab === 'wires' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          Wire Wall
        </button>
        <button
          onClick={() => setActiveTab('parts')}
          className={cn(
            "flex-1 py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer",
            activeTab === 'parts' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Package className="w-3.5 h-3.5" />
          Request Hardware
        </button>
      </div>

      {activeTab === 'wires' ? (
        <>
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
              className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-xs text-white placeholder-zinc-650 outline-none focus:border-indigo-500 transition-all font-semibold"
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
                <p className="text-xs text-zinc-605 mt-1 max-w-xs mx-auto">
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
                            : "bg-zinc-950 border-zinc-850 text-zinc-550"
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
                            : "bg-zinc-950 border-zinc-850 text-zinc-550"
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
                            : "bg-zinc-950 border-zinc-850 text-zinc-550"
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
        </>
      ) : (
        /* Hardware Request Form */
        <form onSubmit={handleSubmitPart} className="flex-1 overflow-y-auto space-y-4 font-sans pb-6">
          {/* Part Name / Description */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">
              Part Description / Bin Name
            </label>
            <input
              type="text"
              placeholder="e.g. 1/4-20 Hex Nut, Ring Terminal..."
              value={partName}
              onChange={e => setPartName(e.target.value)}
              className="w-full px-4 py-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl text-xs text-white placeholder-zinc-650 font-semibold focus:border-indigo-500 outline-none transition-all"
            />
            
            {/* Quick Suggestions Badges */}
            <div className="flex flex-wrap gap-1.5 mt-1 pt-1.5">
              {HARDWARE_SUGGESTIONS.map(item => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setPartName(item)}
                  className="px-2.5 py-1 bg-zinc-900/60 border border-zinc-850 hover:bg-zinc-800 hover:text-white rounded-lg text-[9px] text-zinc-450 font-bold transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-2.5 h-2.5 text-indigo-500" />
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity & Unit Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">
                Quantity Needed
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                className="w-full px-4 py-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl text-xs text-white text-center font-bold focus:border-indigo-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">
                Unit Type
              </label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full px-4 py-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl text-xs text-white font-bold focus:border-indigo-500 outline-none transition-all"
              >
                <option value="pcs">Pieces (Indiv.)</option>
                <option value="box">Boxes</option>
                <option value="bag">Bags</option>
                <option value="roll">Rolls</option>
                <option value="pack">Packs</option>
              </select>
            </div>
          </div>

          {/* Urgency selection */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">
              Urgency Level
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setUrgency('normal')}
                className={cn(
                  "py-3 border rounded-2xl text-xs font-extrabold flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer",
                  urgency === 'normal' 
                    ? "bg-zinc-800 border-zinc-700 text-white" 
                    : "bg-zinc-900 border-zinc-850 text-zinc-500"
                )}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setUrgency('urgent')}
                className={cn(
                  "py-3 border rounded-2xl text-xs font-extrabold flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer",
                  urgency === 'urgent' 
                    ? "bg-rose-500/20 border-rose-500 text-rose-455 shadow-md shadow-rose-500/5" 
                    : "bg-zinc-900 border-zinc-850 text-zinc-500"
                )}
              >
                <AlertTriangle className={cn("w-3.5 h-3.5", urgency === 'urgent' ? "text-rose-500 animate-pulse" : "")} />
                Urgent
              </button>
            </div>
          </div>

          {/* Notes / Bin Loc */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">
              Bin Location / Additional Notes
            </label>
            <textarea
              placeholder="e.g. Bin 4B, needed for Ford build..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-4 py-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl text-xs text-white placeholder-zinc-650 font-semibold focus:border-indigo-500 outline-none transition-all resize-none"
            />
          </div>

          {/* Requested By Name */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">
              Your Name
            </label>
            <input
              type="text"
              placeholder="Your Name"
              value={requestedBy}
              onChange={e => setRequestedBy(e.target.value)}
              className="w-full px-4 py-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl text-xs text-white font-semibold focus:border-indigo-500 outline-none transition-all"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmittingPart}
            className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-650 hover:from-indigo-600 hover:to-purple-755 text-white font-black uppercase text-xs tracking-wider rounded-2xl shadow-xl shadow-indigo-500/10 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
          >
            {isSubmittingPart ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Submit Request to Parts List
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
