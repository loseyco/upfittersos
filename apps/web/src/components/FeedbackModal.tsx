import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, Send, Loader2, Undo, Trash2, Upload, Smile, Frown, Users } from 'lucide-react';
import { domToCanvas } from 'modern-screenshot';
import { ReactSketchCanvas, type ReactSketchCanvasRef } from 'react-sketch-canvas';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase/config';
import { useAuthStore } from '../lib/auth/store';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const { user, tenantId, permissions, isSuperAdmin } = useAuthStore();
  const canLogStaff = isSuperAdmin || permissions['staff.manage'] === true;
  const location = useLocation();

  // Tab State: system feedback vs staff incident logging
  const [activeTab, setActiveTab] = useState<'system' | 'staff'>('system');

  // System Feedback Fields
  const [type, setType] = useState<'bug' | 'feature' | 'general'>('bug');

  // Staff Incident Fields
  const [staffList, setStaffList] = useState<{ id: string; firstName: string; lastName: string; }[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [incidentType, setIncidentType] = useState<'good' | 'bad'>('good');

  // Common Fields
  const [description, setDescription] = useState('');
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const canvasRef = useRef<ReactSketchCanvasRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Load active staff members
  useEffect(() => {
    if (!tenantId || !isOpen || !canLogStaff) return;
    const q = query(collection(db, `businesses/${tenantId}/staff`), orderBy('firstName', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const active = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(s => !s.isArchived)
        .map(s => ({
          id: s.id,
          firstName: s.firstName || '',
          lastName: s.lastName || '',
        }));
      setStaffList(active);
    }, (err) => {
      console.error('Error fetching staff for incident logs:', err);
    });
    return () => unsub();
  }, [tenantId, isOpen, canLogStaff]);

  const captureScreenshot = async () => {
    setIsCapturing(true);
    // Temporarily hide the modal for the screenshot
    const modalElement = document.getElementById('feedback-modal-overlay');
    if (modalElement) modalElement.style.display = 'none';

    try {
      const canvas = await domToCanvas(document.body, {
        backgroundColor: '#171717', // dark background matching the app
        filter: (element) => (element as HTMLElement).id !== 'feedback-widget-button',
      });
      const dataUrl = canvas.toDataURL('image/png');
      setScreenshotData(dataUrl);
    } catch (err) {
      console.error('Failed to take screenshot:', err);
      toast.error('Failed to take screenshot.');
    } finally {
      if (modalElement) modalElement.style.display = 'flex';
      setIsCapturing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setScreenshotData(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearScreenshot = () => {
    setScreenshotData(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUndo = () => {
    canvasRef.current?.undo();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error('Please provide a description.');
      return;
    }

    if (activeTab === 'staff' && !selectedStaffId) {
      toast.error('Please select a staff member.');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalImageUrl = null;

      if (screenshotData && canvasRef.current) {
        // Export the drawn image
        const drawnImage = await canvasRef.current.exportImage('png');
        
        // Upload to Firebase Storage
        const folder = activeTab === 'staff' ? 'staff_incidents' : 'feedback';
        const storageRef = ref(storage, `${folder}/${Date.now()}_${user?.uid || 'anonymous'}.png`);
        const uploadResult = await uploadString(storageRef, drawnImage, 'data_url');
        finalImageUrl = await getDownloadURL(uploadResult.ref);
      }

      if (activeTab === 'staff') {
        const staff = staffList.find(s => s.id === selectedStaffId);
        const staffName = staff ? `${staff.firstName} ${staff.lastName}`.trim() : 'Unknown Staff';

        await addDoc(collection(db, `businesses/${tenantId}/staff_logs`), {
          staffId: selectedStaffId,
          staffName,
          type: incidentType,
          description: description.trim(),
          imageUrl: finalImageUrl,
          loggedByUid: user?.uid || null,
          loggedByName: user?.displayName || user?.email || 'Admin',
          createdAt: serverTimestamp(),
        });

        toast.success(`Incident logged for ${staffName}!`);
      } else {
        await addDoc(collection(db, 'feedback_reports'), {
          userId: user?.uid || null,
          userEmail: user?.email || null,
          userName: user?.displayName || null,
          tenantId: tenantId || null,
          type,
          description: description.trim(),
          imageUrl: finalImageUrl,
          route: location.pathname + location.search,
          status: 'open',
          createdAt: serverTimestamp(),
        });

        toast.success('Feedback submitted successfully. Thank you!');
      }

      // Reset
      setDescription('');
      setSelectedStaffId('');
      setScreenshotData(null);
      onClose();
    } catch (err) {
      console.error('Submission failed:', err);
      toast.error('Failed to submit entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="feedback-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e: React.MouseEvent) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.95 }}
            className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex flex-col border-b border-neutral-800 shrink-0">
              <div className="flex items-center justify-between p-4 pb-2">
                <h2 className="text-lg font-semibold text-white">
                  {activeTab === 'staff' ? 'Log Staff Incident' : 'Send Feedback'}
                </h2>
                <button
                  onClick={onClose}
                  className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Secure Tab Selector for Admins */}
              {canLogStaff && (
                <div className="px-4 pb-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setActiveTab('system'); handleClearScreenshot(); }}
                    className={`flex-1 py-1.5 px-3 text-xs font-bold uppercase tracking-wider rounded-lg border transition-all ${
                      activeTab === 'system'
                        ? 'bg-neutral-800 text-white border-neutral-700 shadow-sm'
                        : 'bg-transparent text-neutral-500 border-transparent hover:text-neutral-300'
                    }`}
                  >
                    System Feedback
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveTab('staff'); handleClearScreenshot(); }}
                    className={`flex-1 py-1.5 px-3 text-xs font-bold uppercase tracking-wider rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                      activeTab === 'staff'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                        : 'bg-transparent text-neutral-500 border-transparent hover:text-neutral-300'
                    }`}
                  >
                    <Users size={12} /> Log Staff Issue
                  </button>
                </div>
              )}
            </div>

            {/* Form Content */}
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              <form onSubmit={handleSubmit} className="space-y-6">
                
                {activeTab === 'system' ? (
                  /* Standard System Feedback Types */
                  <div className="flex gap-2">
                    {(['bug', 'feature', 'general'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setType(t)}
                        className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg capitalize transition-colors ${
                          type === t
                            ? 'bg-indigo-600 text-white'
                            : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                ) : (
                  /* Staff Incident Specific Fields */
                  <div className="space-y-6">
                    {/* Staff Dropdown Selector */}
                    <div>
                      <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                        Staff Member (Who)
                      </label>
                      <select
                        required
                        value={selectedStaffId}
                        onChange={(e) => setSelectedStaffId(e.target.value)}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm transition-all"
                      >
                        <option value="">Select staff member...</option>
                        {staffList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.firstName} {s.lastName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Incident Type Button Selector */}
                    <div>
                      <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                        Incident Category
                      </label>
                      <div className="flex gap-4">
                        <button
                          type="button"
                          onClick={() => setIncidentType('good')}
                          className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold uppercase tracking-wider transition-all border flex items-center justify-center gap-2 ${
                            incidentType === 'good'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-lg shadow-emerald-500/5'
                              : 'bg-neutral-800 text-neutral-400 border-transparent hover:bg-neutral-700/60'
                          }`}
                        >
                          <Smile size={16} /> Good Thing
                        </button>
                        <button
                          type="button"
                          onClick={() => setIncidentType('bad')}
                          className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold uppercase tracking-wider transition-all border flex items-center justify-center gap-2 ${
                            incidentType === 'bad'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 shadow-lg shadow-rose-500/5'
                              : 'bg-neutral-800 text-neutral-400 border-transparent hover:bg-neutral-700/60'
                          }`}
                        >
                          <Frown size={16} /> Bad Thing
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                    Description
                  </label>
                  <textarea
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={
                      activeTab === 'staff'
                        ? 'Describe what happened. Be as objective and specific as possible...'
                        : "What's on your mind? Be as specific as possible..."
                    }
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[120px] resize-y text-sm transition-all"
                  />
                </div>

                {/* Screenshot / Photo upload area */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider">
                      Visual Context (Optional)
                    </label>
                    {screenshotData && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleUndo}
                          className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"
                          title="Undo drawing"
                        >
                          <Undo size={14} /> Undo
                        </button>
                        <button
                          type="button"
                          onClick={handleClearScreenshot}
                          className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 ml-2"
                        >
                          <Trash2 size={14} /> Remove
                        </button>
                      </div>
                    )}
                  </div>

                  {!screenshotData ? (
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={captureScreenshot}
                        disabled={isCapturing}
                        className="h-28 border-2 border-dashed border-neutral-700 rounded-xl flex flex-col items-center justify-center text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800/40 transition-all active:scale-95"
                      >
                        {isCapturing ? (
                          <>
                            <Loader2 size={20} className="animate-spin mb-2 text-indigo-400" />
                            <span className="text-xs font-medium">Capturing...</span>
                          </>
                        ) : (
                          <>
                            <Camera size={20} className="mb-2 text-neutral-500" />
                            <span className="text-xs font-bold">Capture Screen</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-28 border-2 border-dashed border-neutral-700 rounded-xl flex flex-col items-center justify-center text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800/40 transition-all active:scale-95"
                      >
                        <Upload size={20} className="mb-2 text-neutral-500" />
                        <span className="text-xs font-bold">Take / Upload Photo</span>
                      </button>

                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                      />
                    </div>
                  ) : (
                    <div className="relative border border-neutral-700 rounded-lg overflow-hidden bg-neutral-950 aspect-video">
                      <p className="absolute top-2 left-2 z-10 text-xs bg-black/60 px-2 py-1 rounded text-neutral-300 pointer-events-none">
                        Draw to highlight items / issues
                      </p>
                      <ReactSketchCanvas
                        ref={canvasRef}
                        style={{ border: 'none', width: '100%', height: '100%' }}
                        strokeWidth={4}
                        strokeColor="#ef4444" // red to stand out
                        backgroundImage={screenshotData}
                        preserveBackgroundImageAspectRatio="none"
                      />
                    </div>
                  )}
                </div>
              </form>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-neutral-800 bg-neutral-900/50 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !description.trim() || (activeTab === 'staff' && !selectedStaffId)}
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    {activeTab === 'staff' ? 'Save Log Entry' : 'Submit Feedback'}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
