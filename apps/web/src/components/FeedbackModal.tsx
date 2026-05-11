import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, Send, Loader2, Undo, Trash2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { ReactSketchCanvas, type ReactSketchCanvasRef } from 'react-sketch-canvas';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
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
  const { user, tenantId } = useAuthStore();
  const location = useLocation();
  const [type, setType] = useState<'bug' | 'feature' | 'general'>('bug');
  const [description, setDescription] = useState('');
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const canvasRef = useRef<ReactSketchCanvasRef>(null);

  // Close on ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const captureScreenshot = async () => {
    setIsCapturing(true);
    // Temporarily hide the modal for the screenshot
    const modalElement = document.getElementById('feedback-modal-overlay');
    if (modalElement) modalElement.style.display = 'none';

    try {
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#171717', // dark background matching the app
        ignoreElements: (element) => element.id === 'feedback-widget-button',
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

  const handleClearScreenshot = () => {
    setScreenshotData(null);
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

    setIsSubmitting(true);
    try {
      let finalImageUrl = null;

      if (screenshotData && canvasRef.current) {
        // Export the drawn image
        const drawnImage = await canvasRef.current.exportImage('png');
        
        // Upload to Firebase Storage
        const storageRef = ref(storage, `feedback/${Date.now()}_${user?.uid || 'anonymous'}.png`);
        const uploadResult = await uploadString(storageRef, drawnImage, 'data_url');
        finalImageUrl = await getDownloadURL(uploadResult.ref);
      }

      await addDoc(collection(db, 'feedback_reports'), {
        userId: user?.uid || null,
        userEmail: user?.email || null,
        userName: user?.displayName || null,
        tenantId: tenantId || null,
        type,
        description,
        imageUrl: finalImageUrl,
        route: location.pathname + location.search,
        status: 'open',
        createdAt: serverTimestamp(),
      });

      toast.success('Feedback submitted successfully. Thank you!');
      onClose();
    } catch (err) {
      console.error('Submission failed:', err);
      toast.error('Failed to submit feedback.');
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
            <div className="flex items-center justify-between p-4 border-b border-neutral-800 shrink-0">
              <h2 className="text-lg font-semibold text-white">Send Feedback</h2>
              <button
                onClick={onClose}
                className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form Content */}
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* Type Selection */}
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

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Description
                  </label>
                  <textarea
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's on your mind? Be as specific as possible..."
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[120px] resize-y"
                  />
                </div>

                {/* Screenshot Area */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-neutral-300">
                      Screenshot (Optional)
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
                    <button
                      type="button"
                      onClick={captureScreenshot}
                      disabled={isCapturing}
                      className="w-full h-32 border-2 border-dashed border-neutral-700 rounded-lg flex flex-col items-center justify-center text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800/50 transition-colors"
                    >
                      {isCapturing ? (
                        <>
                          <Loader2 size={24} className="animate-spin mb-2" />
                          <span className="text-sm">Capturing...</span>
                        </>
                      ) : (
                        <>
                          <Camera size={24} className="mb-2" />
                          <span className="text-sm">Capture Screenshot</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="relative border border-neutral-700 rounded-lg overflow-hidden bg-neutral-950 aspect-video">
                      <p className="absolute top-2 left-2 z-10 text-xs bg-black/60 px-2 py-1 rounded text-neutral-300 pointer-events-none">
                        Draw to highlight issues
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
                disabled={isSubmitting || !description.trim()}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-2 transition-colors shadow-lg shadow-indigo-600/20"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Submit Feedback
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
