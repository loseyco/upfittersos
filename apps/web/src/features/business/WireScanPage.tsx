import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  collection, addDoc, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Loader2, ArrowLeft, Send
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';

export function WireScanPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Parts request form state
  const [partName, setPartName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('pcs');
  const [urgency, setUrgency] = useState<'normal' | 'urgent'>('normal');
  const [notes, setNotes] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [isSubmittingPart, setIsSubmittingPart] = useState(false);

  // Set default requester name
  useEffect(() => {
    if (user) {
      setRequestedBy(user.displayName || user.email?.split('@')[0] || '');
    }
  }, [user]);

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
      <header className="flex items-center gap-3 mb-6 py-2 shrink-0">
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
            Request parts or hardware
          </p>
        </div>
      </header>

      {/* Hardware Request Form */}
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
                  : "bg-zinc-900 border-zinc-850 text-zinc-550"
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
                  : "bg-zinc-900 border-zinc-850 text-zinc-550"
              )}
            >
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
    </div>
  );
}
