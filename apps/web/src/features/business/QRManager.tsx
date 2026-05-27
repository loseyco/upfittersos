import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, query, orderBy, doc, getDoc, setDoc, updateDoc, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { LogoQRCode } from '../../components/LogoQRCode';
import { useAuthStore } from '../../lib/auth/store';
import { 
  Printer, Search, Check, 
  Car, Briefcase, Hash,
  Loader2, SlidersHorizontal, Trash2, Edit2, X, Link2
} from 'lucide-react';
import { toast } from 'sonner';

type ActiveTab = 'preprint' | 'assigned';
type LabelSize = 'roll_2_2' | 'roll_1_1' | 'sheet_avery_5160';

export function QRManager({ tenantId }: { tenantId: string }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('preprint');
  const [searchQuery, setSearchQuery] = useState('');

  const [labelSize, setLabelSize] = useState<LabelSize>('roll_2_2');
  const [embedLogo, setEmbedLogo] = useState(true);
  const [customBaseUrl, setCustomBaseUrl] = useState(window.location.origin);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  // Sequential Roll Generator States
  const [seqStart, setSeqStart] = useState(1);
  const [seqCount, setSeqCount] = useState(30); 
  const [isRegistering, setIsRegistering] = useState(false);

  // Re-assignment modal states
  const [reassignSticker, setReassignSticker] = useState<any | null>(null);
  const [reassignType, setReassignType] = useState<'vehicle' | 'job'>('vehicle');
  const [reassignSearch, setReassignSearch] = useState('');
  const [selectedReassignItem, setSelectedReassignItem] = useState<any>(null);
  const [isCommitReassign, setIsCommitReassign] = useState(false);

  // Fetch Business details for Logo URL
  const { data: business } = useQuery({
    queryKey: ['business-qr-details', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const docRef = doc(db, 'businesses', tenantId);
      const snap = await getDoc(docRef);
      return snap.exists() ? { id: snap.id, ...snap.data() as any } : null;
    }
  });

  const businessLogo = business?.rawData?.logoUrl || business?.logoUrl || '';
  const businessName = business?.name || 'UpfittersOS';

  // Fetch all printed/assigned QR Stickers
  const { data: qrStickers = [], isLoading: loadingStickers, refetch: refetchStickers } = useQuery<any[]>({
    queryKey: ['qr-stickers', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const snap = await getDocs(collection(db, `businesses/${tenantId}/qr_stickers`));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  });

  // Fetch Vehicles
  const { data: vehicles = [] } = useQuery<any[]>({
    queryKey: ['qr-vehicles', tenantId],
    queryFn: async () => {
      const q = query(collection(db, `businesses/${tenantId}/vehicles`), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((v: any) => !v.isArchived);
    }
  });

  // Fetch Jobs / Work Orders
  const { data: jobs = [] } = useQuery<any[]>({
    queryKey: ['qr-jobs', tenantId],
    queryFn: async () => {
      const q = query(collection(db, `businesses/${tenantId}/jobs`), orderBy('updatedAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  });

  // Auto Scan for Sequence Collisions (Pre-populates Starting Sequence to max + 1)
  useEffect(() => {
    if (qrStickers.length > 0) {
      let maxNum = 0;
      let hasMatches = false;
      
      qrStickers.forEach(sticker => {
        const numPart = parseInt(sticker.id, 10);
        if (!isNaN(numPart) && numPart.toString() === sticker.id) {
          hasMatches = true;
          if (numPart > maxNum) {
            maxNum = numPart;
          }
        }
      });
      if (hasMatches) {
        setSeqStart(maxNum + 1);
      } else {
        setSeqStart(1);
      }
    } else {
      setSeqStart(1);
    }
  }, [qrStickers]);



  // Helper: Get generated sequential IDs list
  const getPrePrintedItems = () => {
    const list = [];
    for (let i = 0; i < seqCount; i++) {
      const num = seqStart + i;
      const id = num.toString();
      list.push({
        id,
        sequenceNumber: num,
        label: id
      });
    }
    return list;
  };

  const getFilteredItems = () => {
    const queryStr = searchQuery.toLowerCase().trim();
    if (activeTab === 'preprint') {
      const list = getPrePrintedItems();
      if (!queryStr) return list;
      return list.filter(item => item.id.toLowerCase().includes(queryStr));
    } else {
      const list = qrStickers.filter(s => s.assignedTo != null);
      if (!queryStr) return list;
      return list.filter(s => 
        s.id.toLowerCase().includes(queryStr) ||
        (s.assignedTo?.label || '').toLowerCase().includes(queryStr) ||
        (s.assignedByName || '').toLowerCase().includes(queryStr)
      );
    }
  };

  const filteredItems = getFilteredItems();



  // Commits pre-printed batch to Firestore immediately upon requesting a print
  const handlePrintPreprinted = async () => {
    setIsRegistering(true);
    const list = getPrePrintedItems();

    try {
      // Write batch sticker documents as unassigned/taken
      await Promise.all(list.map(async (item) => {
        const stickerRef = doc(db, `businesses/${tenantId}/qr_stickers`, item.id);
        const snap = await getDoc(stickerRef);
        
        if (!snap.exists()) {
          await setDoc(stickerRef, {
            id: item.id,
            tenantId: tenantId,
            assignedTo: null,
            printedAt: serverTimestamp(),
            printedBy: user?.uid || 'system',
            printedByName: user?.displayName || user?.email || 'Technician'
          });
        }
      }));

      toast.success(`Series reserved successfully in database! Generating print queue...`);
      refetchStickers();

      // Trigger print preview
      setIsPrintPreviewOpen(true);
      setTimeout(() => {
        window.print();
      }, 300);

    } catch (e: any) {
      console.error("Batch sticker commitment failed:", e);
      toast.error(`Database reservation failed: ${e.message}`);
    } finally {
      setIsRegistering(false);
    }
  };

  const handlePrint = () => {
    if (activeTab === 'preprint') {
      handlePrintPreprinted();
    }
  };

  // Unlink / Clear QR assignment mapping dynamically
  const handleUnlink = async (sticker: any) => {
    if (!window.confirm(`Are you sure you want to clear assignment for sticker ${sticker.id}? Scans will return it to unassigned setup mode.`)) return;
    
    try {
      const stickerRef = doc(db, `businesses/${tenantId}/qr_stickers`, sticker.id);
      
      // 1. Reset mapping document
      await updateDoc(stickerRef, { assignedTo: null });

      // 2. Clear target two-way reference
      const target = sticker.assignedTo;
      if (target.type === 'vehicle') {
        const q = query(collection(db, `businesses/${tenantId}/vehicles`), where('qrStickerId', '==', sticker.id));
        const snap = await getDocs(q);
        if (!snap.empty) {
          await updateDoc(snap.docs[0].ref, { qrStickerId: null });
        }
      } else if (target.type === 'job') {
        const jobRef = doc(db, `businesses/${tenantId}/jobs`, target.id);
        await updateDoc(jobRef, { qrStickerId: null }).catch(() => {});
      }

      toast.success(`Sticker ${sticker.id} successfully unlinked!`);
      refetchStickers();
      queryClient.invalidateQueries({ queryKey: ['generic-grid'] });
    } catch (e: any) {
      toast.error(`Unlink failed: ${e.message}`);
    }
  };

  // Re-Assignment Search filtered items
  const getReassignMatches = () => {
    const qStr = reassignSearch.trim().toLowerCase();
    if (!qStr) return [];
    if (reassignType === 'vehicle') {
      return vehicles.filter(v => 
        (v.vin || '').toLowerCase().includes(qStr) ||
        (v.make || '').toLowerCase().includes(qStr) ||
        (v.model || '').toLowerCase().includes(qStr) ||
        (v.year || '').toLowerCase().includes(qStr) ||
        (v.customerName || '').toLowerCase().includes(qStr)
      ).slice(0, 5);
    } else {
      return jobs.filter(j => 
        (j.jobNumber || '').toLowerCase().includes(qStr) ||
        (j.title || '').toLowerCase().includes(qStr) ||
        (j.customerName || '').toLowerCase().includes(qStr)
      ).slice(0, 5);
    }
  };

  const reassignMatches = getReassignMatches();

  const handleCommitReassign = async () => {
    if (!reassignSticker || !selectedReassignItem || !user) return;
    setIsCommitReassign(true);

    const stickerRef = doc(db, `businesses/${tenantId}/qr_stickers`, reassignSticker.id);
    let labelText = '';
    
    if (reassignType === 'vehicle') {
      labelText = `${selectedReassignItem.year || ''} ${selectedReassignItem.make || ''} ${selectedReassignItem.model || 'Vehicle'} (VIN: ${selectedReassignItem.vin || selectedReassignItem.id})`;
    } else {
      labelText = selectedReassignItem.jobNumber ? `Job #${selectedReassignItem.jobNumber} - ${selectedReassignItem.title}` : selectedReassignItem.title;
    }

    try {
      // 1. Clear old document reference if linking a vehicle
      const oldTarget = reassignSticker.assignedTo;
      if (oldTarget) {
        if (oldTarget.type === 'vehicle') {
          const q = query(collection(db, `businesses/${tenantId}/vehicles`), where('qrStickerId', '==', reassignSticker.id));
          const snap = await getDocs(q);
          if (!snap.empty) {
            await updateDoc(snap.docs[0].ref, { qrStickerId: null });
          }
        } else if (oldTarget.type === 'job') {
          const jobRef = doc(db, `businesses/${tenantId}/jobs`, oldTarget.id);
          await updateDoc(jobRef, { qrStickerId: null }).catch(() => {});
        }
      }

      // 2. Write new sticker mapping
      await updateDoc(stickerRef, {
        assignedTo: {
          type: reassignType,
          id: reassignType === 'vehicle' ? (selectedReassignItem.vin || selectedReassignItem.id) : selectedReassignItem.id,
          label: labelText
        },
        assignedAt: serverTimestamp(),
        assignedBy: user.uid,
        assignedByName: user.displayName || user.email || 'Technician'
      });

      // 3. Set new two-way link reference
      if (reassignType === 'vehicle') {
        const vehRef = doc(db, `businesses/${tenantId}/vehicles`, selectedReassignItem.id);
        await updateDoc(vehRef, { qrStickerId: reassignSticker.id });
      } else {
        const jobRef = doc(db, `businesses/${tenantId}/jobs`, selectedReassignItem.id);
        await updateDoc(jobRef, { qrStickerId: reassignSticker.id });
      }

      toast.success(`Sticker ${reassignSticker.id} successfully re-assigned!`);
      setReassignSticker(null);
      setSelectedReassignItem(null);
      setReassignSearch('');
      refetchStickers();
      queryClient.invalidateQueries({ queryKey: ['generic-grid'] });
    } catch (e: any) {
      toast.error(`Re-assignment failed: ${e.message}`);
    } finally {
      setIsCommitReassign(false);
    }
  };

  // Determine what list of labels gets drawn in print view
  const getPrintQueueData = () => {
    if (activeTab === 'preprint') {
      return getPrePrintedItems().map(item => ({
        id: item.id,
        value: `${customBaseUrl}/qr?sid=${encodeURIComponent(item.id)}`,
        title: item.id,
        sub: 'Unassigned Sticker',
        tag: ''
      }));
    }
    return [];
  };

  const printQueue = getPrintQueueData();

  return (
    <div className="space-y-6">
      {/* Dynamic Print Styles for standard rolls and Avery sheets */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-area, .printable-area * {
            visibility: visible;
          }
          .printable-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
          }
          .no-print {
            display: none !important;
          }

          /* Roll 2" x 2" Presets */
          .print-roll-2-2 {
            width: 2in;
            height: 2in;
            page-break-after: always;
            box-sizing: border-box;
            padding: 0.1in;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            border: none !important;
            background: white !important;
          }
          .print-roll-2-2 .qr-element {
            width: 1.2in !important;
            height: 1.2in !important;
          }

          /* Roll 1" x 1" Presets */
          .print-roll-1-1 {
            width: 1in;
            height: 1in;
            page-break-after: always;
            box-sizing: border-box;
            padding: 0.05in;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            border: none !important;
            background: white !important;
          }
          .print-roll-1-1 .qr-element {
            width: 0.7in !important;
            height: 0.7in !important;
          }

          /* Avery 5160 Sheet Presets */
          .print-sheet-grid {
            display: grid;
            grid-template-columns: repeat(3, 2.625in);
            grid-gap: 0.125in 0.14in;
            padding: 0.5in 0.15in;
            box-sizing: border-box;
          }
          .print-sheet-item {
            width: 2.625in;
            height: 1in;
            box-sizing: border-box;
            padding: 0.08in;
            display: flex;
            align-items: center;
            border: 1px dashed #ccc !important;
            page-break-inside: avoid;
            background: white !important;
          }
          .print-sheet-item .qr-element {
            width: 0.85in !important;
            height: 0.85in !important;
            margin-right: 0.1in;
          }
        }
      `}</style>

      {/* Main Page Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 no-print">
        {/* Selection and Customizer Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          {/* Sequential Series Config (only visible in pre-printed tab) */}
          {activeTab === 'preprint' && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden animate-in slide-in-from-top-2 duration-300">
              <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3 bg-zinc-50 dark:bg-zinc-950/40">
                <Hash className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-zinc-950 dark:text-white">Series Sequence Generator</h3>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Stickers Count</label>
                  <input 
                    type="number" 
                    value={seqCount} 
                    onChange={(e) => setSeqCount(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1.5">
                    The starting sequence number is automatically calculated in the background (<span className="font-bold text-indigo-500 font-mono">Next: {seqStart}</span>).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Print Options Card */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3 bg-zinc-50 dark:bg-zinc-950/40">
              <SlidersHorizontal className="w-5 h-5 text-indigo-500" />
              <h3 className="font-bold text-zinc-950 dark:text-white">Label Customizer</h3>
            </div>
            
            <div className="p-5 space-y-5">
              {/* Presets */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Label Size Preset</label>
                <div className="grid grid-cols-1 gap-2">
                  <button 
                    onClick={() => setLabelSize('roll_2_2')}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                      labelSize === 'roll_2_2' 
                        ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-500/10 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <div>
                      <p className="text-sm">Continuous Roll (2" x 2")</p>
                      <p className="text-[10px] opacity-75 font-normal">Standard label rolls for vehicles / keys</p>
                    </div>
                    {labelSize === 'roll_2_2' && <Check className="w-4 h-4" />}
                  </button>

                  <button 
                    onClick={() => setLabelSize('roll_1_1')}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                      labelSize === 'roll_1_1' 
                        ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-500/10 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <div>
                      <p className="text-sm">Compact Roll (1" x 1")</p>
                      <p className="text-[10px] opacity-75 font-normal">Perfect for slim key tags or toolsets</p>
                    </div>
                    {labelSize === 'roll_1_1' && <Check className="w-4 h-4" />}
                  </button>

                  <button 
                    onClick={() => setLabelSize('sheet_avery_5160')}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                      labelSize === 'sheet_avery_5160' 
                        ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-500/10 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <div>
                      <p className="text-sm">Avery 5160 Sheets</p>
                      <p className="text-[10px] opacity-75 font-normal">3 columns, 10 rows per standard letter page</p>
                    </div>
                    {labelSize === 'sheet_avery_5160' && <Check className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Logo Overlay toggle */}
              <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                <div>
                  <span className="text-sm font-bold text-zinc-900 dark:text-white block mb-0.5">Embed Logo Badge</span>
                  <span className="text-[10px] text-zinc-500">Inject business brand inside QR code center</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={embedLogo} 
                  onChange={(e) => setEmbedLogo(e.target.checked)} 
                  className="w-5 h-5 accent-indigo-600 cursor-pointer" 
                />
              </div>

              {/* Base print domain */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Base Redirect Domain</label>
                <input 
                  type="url" 
                  value={customBaseUrl} 
                  onChange={(e) => setCustomBaseUrl(e.target.value)} 
                  placeholder="https://upfittersos.com"
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-mono"
                />
              </div>

              {/* Selection Summary */}
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Queue Selection</p>
                  <p className="text-lg font-black text-zinc-900 dark:text-white mt-1">
                    {activeTab === 'preprint' ? getPrePrintedItems().length : 0} {((activeTab === 'preprint' ? getPrePrintedItems().length : 0) === 1) ? 'label' : 'labels'}
                  </p>
                </div>

                <button 
                  onClick={handlePrint}
                  disabled={activeTab !== 'preprint' || isRegistering}
                  className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95 cursor-pointer"
                >
                  {isRegistering ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4" />
                      Print Queue
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Resource Selection Panel */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            {/* Header Tabs */}
            <div className="flex border-b border-zinc-200 dark:border-zinc-800 p-2 gap-2 bg-zinc-50 dark:bg-zinc-950/40 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveTab('preprint')}
                className={`flex items-center gap-2 px-5 py-3.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === 'preprint'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm border border-zinc-200 dark:border-zinc-800/80'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <Hash className="w-4 h-4" />
                Pre-Print Rolls (Unassigned)
                <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 rounded text-xs font-black">
                  {getPrePrintedItems().length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('assigned')}
                className={`flex items-center gap-2 px-5 py-3.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === 'assigned'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm border border-zinc-200 dark:border-zinc-800/80'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <Link2 className="w-4 h-4 animate-pulse" />
                Active Stickers Manager
                <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded text-xs font-black">
                  {qrStickers.filter(s => s.assignedTo != null).length}
                </span>
              </button>

            </div>

            {/* Filters bar */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder={
                    activeTab === 'preprint' 
                      ? "Filter generated series sequence..." 
                      : "Search Sticker ID, Owner or Assigned target..."
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
            </div>

            {/* List Content */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-bold text-zinc-400 uppercase tracking-widest bg-zinc-50/50 dark:bg-zinc-950/20">
                    {activeTab === 'preprint' ? (
                      <>
                        <th className="p-4">Sequential Sticker ID</th>
                        <th className="p-4">Record Status</th>
                        <th className="p-4 text-right">Printed Link Target</th>
                      </>
                    ) : (
                      <>
                        <th className="p-4">Sticker ID</th>
                        <th className="p-4">Linked Entity Details</th>
                        <th className="p-4">Assigned By</th>
                        <th className="p-4 text-right">Actions</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {activeTab === 'preprint' ? (
                    // Generated sequential series preview
                    filteredItems.map(item => {
                      const isTaken = qrStickers.some(s => s.id.toUpperCase() === item.id.toUpperCase());
                      return (
                        <tr 
                          key={item.id}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800/10 transition-colors"
                        >
                          <td className="p-4">
                            <span className="font-mono text-zinc-900 dark:text-white font-black text-sm bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded">
                              {item.id}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded font-extrabold uppercase text-[9px] tracking-wider ${
                              isTaken 
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' 
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-450'
                            }`}>
                              {isTaken ? 'Printed / Reserved' : 'Available Series'}
                            </span>
                          </td>
                          <td className="p-4 font-mono text-[10px] text-zinc-400 text-right truncate max-w-[200px]">
                            {customBaseUrl}/qr?sid={item.id}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    // Active Stickers Manager registry
                    loadingStickers ? (
                      <tr>
                        <td colSpan={5} className="p-12 text-center text-zinc-500">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                          Loading Sticker mappings...
                        </td>
                      </tr>
                    ) : filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-12 text-center text-zinc-500 italic">
                          No active assigned stickers match your search query.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map(item => (
                        <tr 
                          key={item.id}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800/10 transition-colors"
                        >
                          <td className="p-4">
                            <span className="font-mono text-zinc-900 dark:text-white font-black text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                              {item.id}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              {item.assignedTo?.type === 'vehicle' ? (
                                <Car className="w-4 h-4 text-indigo-500 shrink-0" />
                              ) : (
                                <Briefcase className="w-4 h-4 text-emerald-500 shrink-0" />
                              )}
                              <div>
                                <span className="font-bold text-zinc-900 dark:text-white block text-xs">
                                  {item.assignedTo?.label || 'Linked Target'}
                                </span>
                                <span className="text-[9px] text-zinc-500 uppercase tracking-widest block mt-0.5">
                                  {item.assignedTo?.type} Link
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-zinc-500 font-semibold">
                            <span>{item.assignedByName || 'Staff'}</span>
                            <span className="text-[10px] block opacity-75 font-normal">
                              {item.assignedAt ? new Date(item.assignedAt.seconds * 1000).toLocaleDateString() : '--'}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button 
                                onClick={() => setReassignSticker(item)}
                                className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 rounded-lg transition-colors shadow-sm"
                                title="Adjust/Change Link Assignment"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleUnlink(item)}
                                className="p-2 text-rose-600 bg-rose-50 hover:bg-rose-100 dark:text-rose-450 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 rounded-lg transition-colors shadow-sm"
                                title="Unlink / Return Sticker to Unassigned"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Re-Assignment Modal */}
      {reassignSticker && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl max-w-md w-full flex flex-col gap-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-zinc-150 dark:border-zinc-800 pb-3">
              <h3 className="font-black text-zinc-900 dark:text-white text-lg">Adjust Assignment Mapping</h3>
              <button 
                onClick={() => {
                  setReassignSticker(null);
                  setSelectedReassignItem(null);
                  setReassignSearch('');
                }}
                className="p-1.5 text-zinc-400 hover:bg-zinc-150 dark:hover:bg-zinc-800 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-2 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800/80 leading-none">
              <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Sticker ID</span>
              <span className="font-mono font-bold text-xs text-zinc-900 dark:text-white block">{reassignSticker.id}</span>
              <span className="text-[9px] text-zinc-500 mt-1 block">Current: {reassignSticker.assignedTo?.label}</span>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">Assign Sticker To:</span>
              <div className="grid grid-cols-2 gap-1.5 bg-zinc-50 dark:bg-zinc-950 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800/80">
                <button
                  onClick={() => { setReassignType('vehicle'); setSelectedReassignItem(null); setReassignSearch(''); }}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition ${
                    reassignType === 'vehicle' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-500'
                  }`}
                >
                  <Car className="w-3.5 h-3.5" /> Vehicle
                </button>
                <button
                  onClick={() => { setReassignType('job'); setSelectedReassignItem(null); setReassignSearch(''); }}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition ${
                    reassignType === 'job' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-500'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5" /> Job
                </button>
              </div>
            </div>

            <div className="space-y-2 relative">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Search registry</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-450" />
                <input 
                  type="text"
                  placeholder="Type to search..."
                  value={reassignSearch}
                  onChange={(e) => { setReassignSearch(e.target.value); setSelectedReassignItem(null); }}
                  className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                />
              </div>

              {reassignSearch && !selectedReassignItem && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-2xl overflow-hidden z-[170] max-h-40 overflow-y-auto custom-scrollbar">
                  {reassignMatches.length === 0 ? (
                    <div className="p-3 text-center text-xs text-zinc-400 italic">No matches found</div>
                  ) : (
                    reassignMatches.map(item => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setSelectedReassignItem(item);
                          setReassignSearch(
                            reassignType === 'vehicle'
                              ? `${item.year || ''} ${item.make || ''} ${item.model || ''} (${item.vin || item.id})`
                              : `${item.jobNumber ? '#' + item.jobNumber + ' - ' : ''}${item.title}`
                          );
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-150 dark:border-zinc-800/40 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-colors flex items-center justify-between"
                      >
                        <div className="truncate pr-2">
                          <span className="font-extrabold block text-zinc-900 dark:text-white truncate">
                            {reassignType === 'vehicle' ? `${item.year} ${item.make} ${item.model}` : item.title}
                          </span>
                          <span className="text-[9px] text-zinc-400 block font-mono">
                            {reassignType === 'vehicle' ? `VIN: ${item.vin}` : `Job #${item.jobNumber}`}
                          </span>
                        </div>
                        <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {selectedReassignItem && (
              <div className="p-3 bg-emerald-500/5 border border-emerald-500/25 rounded-2xl flex items-center justify-between animate-in zoom-in-95 duration-200 text-xs leading-none">
                <div>
                  <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest block mb-0.5">New Target</span>
                  <span className="font-extrabold text-zinc-900 dark:text-white">{reassignType === 'vehicle' ? `${selectedReassignItem.year} ${selectedReassignItem.make} ${selectedReassignItem.model}` : selectedReassignItem.title}</span>
                </div>
                <Check className="w-4 h-4 text-emerald-500" />
              </div>
            )}

            <div className="pt-3 border-t border-zinc-150 dark:border-zinc-800 flex gap-2">
              <button
                onClick={() => { setReassignSticker(null); setSelectedReassignItem(null); setReassignSearch(''); }}
                className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-900 dark:text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCommitReassign}
                disabled={!selectedReassignItem || isCommitReassign}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-1.5"
              >
                {isCommitReassign ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Updating...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Link Mappings
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Sheet (Always hidden unless printed or previewing) */}
      <div className={`printable-area ${isPrintPreviewOpen ? '' : 'no-print'}`}>
        {labelSize === 'sheet_avery_5160' ? (
          // Sheet layout for standard office Avery 5160 labels
          <div className="print-sheet-grid bg-white">
            {printQueue.map(item => (
              <div key={item.id} className="print-sheet-item text-black">
                <div className="qr-element flex items-center justify-center shrink-0">
                  <LogoQRCode 
                    value={item.value} 
                    size={80} 
                    logoUrl={embedLogo ? businessLogo : undefined} 
                    businessName={businessName}
                    type="general"
                  />
                </div>
                <div className="min-w-0 flex flex-col justify-center leading-none text-left">
                  <p className="text-[8px] font-bold uppercase tracking-wider text-indigo-600">UpfittersOS</p>
                  <p className="text-[9px] font-black font-mono truncate mt-0.5">{item.title}</p>
                  <p className="text-[8px] font-bold text-zinc-700 truncate mt-0.5">{item.sub}</p>
                  {item.tag && <p className="text-[7px] text-zinc-500 truncate mt-0.5">{item.tag}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Continuous rolls (2x2 or 1x1 thermal layouts)
          <div className="flex flex-col bg-white">
            {printQueue.map(item => (
              <div 
                key={item.id} 
                className={labelSize === 'roll_2_2' ? 'print-roll-2-2' : 'print-roll-1-1'}
              >
                <div className="qr-element flex items-center justify-center shrink-0">
                  <LogoQRCode 
                    value={item.value} 
                    size={labelSize === 'roll_2_2' ? 120 : 70} 
                    logoUrl={embedLogo ? businessLogo : undefined} 
                    businessName={businessName}
                    type="general"
                  />
                </div>
                
                {/* Detailed label text below QR code */}
                <div className="w-full text-center leading-none text-black mt-1">
                  <p className="text-[8px] font-mono font-black tracking-tight select-all truncate">{item.title}</p>
                  {labelSize === 'roll_2_2' && item.sub && (
                    <p className="text-[7px] font-bold text-zinc-700 truncate mt-0.5">{item.sub}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
