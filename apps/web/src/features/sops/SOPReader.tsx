import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc, addDoc, collection, getDocs, query as fsQuery, where } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { 
  ArrowLeft, ArrowRight, BookOpen, Clock, ShieldCheck, RefreshCw
} from 'lucide-react';
import type { SOPTemplate } from './sopsData';

interface SOPReaderProps {
  tenantId: string;
  templateId: string;
  onBack: () => void;
  onComplete: () => void;
}

export function SOPReader({ tenantId, templateId, onBack, onComplete }: SOPReaderProps) {
  const { user } = useAuthStore();
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch Current Staff Member details
  const { data: currentStaff } = useQuery({
    queryKey: ['reader-current-staff', tenantId, user?.uid],
    queryFn: async () => {
      if (!tenantId || !user?.uid) return null;
      const q = fsQuery(
        collection(db, `businesses/${tenantId}/staff`),
        where('userId', '==', user.uid)
      );
      const snap = await getDocs(q);
      return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as any;
    },
    enabled: !!tenantId && !!user?.uid
  });

  // Fetch SOP Template
  const { data: template } = useQuery({
    queryKey: ['reader-template', tenantId, templateId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, `businesses/${tenantId}/sops`, templateId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as SOPTemplate;
    }
  });

  if (!template) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <span className="text-sm font-bold text-zinc-550">Loading handbook viewer...</span>
      </div>
    );
  }

  const steps = template.steps || [];
  const currentStep = steps[currentSlideIndex];
  const templateVersion = template.version || 1;

  const handleNext = () => {
    if (currentSlideIndex < steps.length - 1) {
      setCurrentSlideIndex(prev => prev + 1);
    } else {
      setCompleted(true);
    }
  };

  const handlePrev = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(prev => prev - 1);
    }
  };

  const handleAcknowledge = async () => {
    if (!agreed || !signature.trim() || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const payload = {
        sopId: templateId,
        sopTitle: template.title,
        version: templateVersion,
        staffId: currentStaff?.id || 'unknown',
        staffName: signature.trim(),
        completedAt: Date.now(),
        type: 'read'
      };

      await addDoc(collection(db, `businesses/${tenantId}/sop_completions`), payload);
      onComplete();
    } catch (err) {
      console.error('Error recording read acknowledgment:', err);
      alert('Failed to save compliance sign-off.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-850 text-zinc-500 rounded-xl transition-all cursor-pointer active:scale-95"
            title="Back to SOPs list"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
              {template.title}
            </h1>
            <p className="text-xs font-semibold text-zinc-550 uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
              Read Handbook • <Clock className="w-3.5 h-3.5 text-zinc-400" /> Version {templateVersion}
            </p>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5">
          {steps.map((_, idx) => (
            <button
              key={idx}
              disabled={completed}
              onClick={() => setCurrentSlideIndex(idx)}
              className={`h-2.5 rounded-full transition-all duration-300 ${
                idx === currentSlideIndex
                  ? "w-6 bg-indigo-650 dark:bg-indigo-500"
                  : "w-2.5 bg-zinc-250 dark:bg-zinc-800 hover:bg-zinc-400 dark:hover:bg-zinc-700"
              }`}
              title={`Jump to slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-zinc-200 dark:bg-zinc-805 h-1 rounded-full overflow-hidden">
        <div 
          className="bg-indigo-650 dark:bg-indigo-500 h-full transition-all duration-300"
          style={{ width: `${((currentSlideIndex + (completed ? 1 : 0)) / steps.length) * 100}%` }}
        />
      </div>

      {/* Slide / Acknowledgment */}
      {!completed ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl space-y-6 shadow-sm min-h-[300px] flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 dark:bg-indigo-500/20 px-3 py-1 rounded-full">
                Step {currentSlideIndex + 1} of {steps.length}
              </span>
              <span className="text-xs font-bold text-zinc-400 uppercase">
                Type: {currentStep.type}
              </span>
            </div>

            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
              {currentStep.title}
            </h2>

            <div className="text-sm text-zinc-650 dark:text-zinc-350 leading-relaxed font-semibold bg-zinc-50/50 dark:bg-zinc-950/20 p-4 rounded-2xl border border-zinc-150 dark:border-zinc-850 whitespace-pre-wrap">
              {currentStep.instructions}
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex justify-between items-center border-t border-zinc-100 dark:border-zinc-850 pt-4 mt-6">
            <button
              disabled={currentSlideIndex === 0}
              onClick={handlePrev}
              className="px-5 py-2 bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:text-white rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-40 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              Previous Step
            </button>
            <button
              onClick={handleNext}
              className="px-6 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-605/15 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              {currentSlideIndex === steps.length - 1 ? 'Go to sign-off' : 'Next Step'} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* Sign-off Form */
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 rounded-3xl shadow-sm text-center max-w-2xl mx-auto space-y-6">
          <div className="w-16 h-16 bg-indigo-500/10 text-indigo-505 border border-indigo-500/20 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <BookOpen className="w-8 h-8 text-indigo-550" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">Compliance Sign-Off</h2>
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-md mx-auto">
              Please check the box below and write your name to acknowledge that you have read and understood this operational procedure.
            </p>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-150 dark:border-zinc-850 text-left space-y-4 max-w-md mx-auto">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input 
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-650 cursor-pointer mt-0.5"
              />
              <span className="text-xs font-bold text-zinc-650 dark:text-zinc-350 leading-relaxed">
                I verify that I have read standard operating procedure <strong className="text-zinc-900 dark:text-white">"{template.title}" (Version {templateVersion})</strong> in its entirety and agree to comply with its steps.
              </span>
            </label>

            <div className="space-y-1">
              <label className="text-[10px] font-extrabold uppercase text-zinc-500">Digital Signature (Type Full Name)</label>
              <input 
                type="text"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder={currentStaff?.name || "Type your name..."}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex gap-4 max-w-md mx-auto pt-2">
            <button
              onClick={() => {
                setCompleted(false);
                setCurrentSlideIndex(steps.length - 1);
              }}
              className="flex-1 py-2.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-xl text-xs font-black uppercase tracking-wider text-zinc-500 cursor-pointer transition-all"
            >
              Review Steps
            </button>
            <button
              disabled={!agreed || !signature.trim() || isSubmitting}
              onClick={handleAcknowledge}
              className="flex-1 py-2.5 bg-emerald-650 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-500/10 cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" /> Acknowledge SOP
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export default SOPReader;
