import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HelpCircle, GraduationCap, BookOpen } from 'lucide-react';
import { useTutorialStore } from './useTutorialStore';
import { getTutorialsData } from './tutorialsData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, doc, getDoc, setDoc, serverTimestamp, query as fsQuery, where } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
 
export function TutorialModal() {
  const { isOpen, activeTabId, closeTutorial } = useTutorialStore();
  const navigate = useNavigate();
  const { tenantId } = useParams();
  const { user, permissions, isSuperAdmin } = useAuthStore();
  
  const isAdmin = isSuperAdmin || permissions?.['settings.manage'] || permissions?.['staff.manage'];

  // Fetch Business Settings for Timeclock config
  const { data: business } = useQuery({
    queryKey: ['business-settings', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const snap = await getDoc(doc(db, 'businesses', tenantId));
      return snap.exists() ? { id: snap.id, ...snap.data() } as any : null;
    },
    enabled: !!tenantId
  });

  // Fetch Current Staff Member details
  const { data: staffMember } = useQuery({
    queryKey: ['current-staff', tenantId, user?.uid],
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

  // Record a unique view when this modal is opened
  useEffect(() => {
    if (isOpen && activeTabId && tenantId && user) {
      const recordView = async () => {
        try {
          const docId = `${user.uid}_${activeTabId}`;
          const docRef = doc(db, `businesses/${tenantId}/tutorial_views`, docId);
          await setDoc(docRef, {
            userId: user.uid,
            tutorialId: activeTabId,
            viewedAt: serverTimestamp()
          }, { merge: true });
        } catch (e) {
          console.warn("Failed to record page/tutorial view:", e);
        }
      };
      recordView();
    }
  }, [isOpen, activeTabId, tenantId, user]);

  // Fetch unique views (visible only to Admin)
  const { data: views = [] } = useQuery({
    queryKey: ['tutorial-views', tenantId, activeTabId],
    queryFn: async () => {
      if (!tenantId || !activeTabId) return [];
      const q = fsQuery(
        collection(db, `businesses/${tenantId}/tutorial_views`),
        where('tutorialId', '==', activeTabId)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => doc.data() as any);
    },
    enabled: !!tenantId && !!activeTabId && !!isAdmin
  });

  const uniqueViewsExcludingMe = views.filter((v: any) => v.userId !== user?.uid).length;

  // Lock scrolling on main page when modal is open
  useBodyScrollLock(isOpen);



  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeTutorial();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeTutorial]);

  if (!isOpen || !activeTabId) return null;

  const tutorials = getTutorialsData(business, staffMember, permissions);
  const tutorial = tutorials[activeTabId];

  // Fallback if tutorial data doesn't exist yet
  const fallbackTutorial = {
    title: activeTabId.replace('qb_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + " Tutorial",
    description: "Learn how to use this section of the platform.",
    category: "System Documentation",
    quickSteps: [
      {
        title: "Explore Features",
        description: "Click through this page to view standard lists, configurations, and dashboards.",
        icon: BookOpen
      },
      {
        title: "Read Full Guides",
        description: "Navigate to the Help Center to view full detailed system documentation.",
        icon: GraduationCap
      }
    ],
    sections: [
      {
        title: "Overview",
        icon: HelpCircle,
        content: (
          <div className="space-y-4">
            <p className="text-sm text-zinc-650 dark:text-zinc-400 font-semibold leading-relaxed">
              We are currently finalizing the detailed, interactive walkthrough for the <strong>{activeTabId.replace('qb_', '').replace(/_/g, ' ')}</strong> features.
            </p>
            <p className="text-xs text-zinc-500 font-semibold leading-relaxed">
              If you have immediate questions, please consult with your system administrator or refer to the general onboarding guidelines in the staff settings.
            </p>
          </div>
        )
      }
    ]
  };

  const activeTutorial = tutorial || fallbackTutorial;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md animate-in fade-in duration-300"
        onClick={closeTutorial}
      >
        <motion.div
          initial={{ y: 30, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] md:max-h-[80vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b border-zinc-150 dark:border-zinc-850 flex items-start justify-between gap-4 shrink-0 bg-zinc-50/50 dark:bg-zinc-900/40">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-indigo-500/10 text-indigo-500 rounded-lg">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                  {activeTutorial.category} Tutorial
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
                {activeTutorial.title}
              </h2>
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 leading-normal max-w-2xl">
                {activeTutorial.description}
              </p>
            </div>
            <button
              onClick={closeTutorial}
              className="p-2 text-zinc-450 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-all shrink-0 active:scale-95"
              title="Close Tutorial"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main Container */}
          <div className="p-6 md:p-8 space-y-6 overflow-y-auto max-h-[60vh] no-scrollbar">
            {/* Description card */}
            <div className="bg-indigo-50/20 dark:bg-indigo-950/10 border border-indigo-100/50 dark:border-indigo-900/20 rounded-2xl p-5 space-y-2">
              <h3 className="text-xs font-black text-indigo-650 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" />
                Quick Guide Summary
              </h3>
              <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-350 leading-relaxed">
                {activeTutorial.description}
              </p>
            </div>

            {/* Quick How-To Steps */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-zinc-450 dark:text-zinc-550 uppercase tracking-[0.2em] mb-1">
                Quick How-To Steps
              </h3>
              <div className="flex flex-col gap-3">
                {(activeTutorial.quickSteps || []).map((step, idx) => {
                  const StepIcon = step.icon || HelpCircle;
                  return (
                    <div 
                      key={idx}
                      className="flex items-start gap-4 p-4 bg-zinc-50/50 dark:bg-zinc-950/40 border border-zinc-150 dark:border-zinc-850 rounded-2xl hover:border-indigo-500/20 dark:hover:border-indigo-500/20 transition-all duration-205"
                    >
                      <div className="flex flex-col items-center shrink-0">
                        <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 flex items-center justify-center font-black text-xs border border-indigo-500/10">
                          {idx + 1}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                          <StepIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          {step.title}
                        </h4>
                        <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 leading-relaxed">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Telemetry Log (Visible to Admin Only) */}
            {isAdmin && (
              <div className="mt-6 pt-4 border-t border-zinc-150 dark:border-zinc-850 text-[10px] text-zinc-550 dark:text-zinc-450 flex items-center justify-between gap-4 bg-zinc-50/50 dark:bg-zinc-950/10 p-3.5 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 animate-in fade-in duration-200">
                <p className="font-extrabold uppercase tracking-wider text-zinc-450 dark:text-zinc-500">
                  Admin Stats (Views Tracker):
                </p>
                <div className="flex items-center gap-4">
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-450">
                    Unique Views: <strong className="text-sm font-black text-indigo-650 dark:text-indigo-400 font-mono">{views.length}</strong>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-550 font-bold ml-1.5">({uniqueViewsExcludingMe} excluding yours)</span>
                  </p>
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="border-t border-zinc-100 dark:border-zinc-850 pt-5 flex items-center justify-between gap-4">
              <button
                onClick={closeTutorial}
                className="px-5 py-2.5 border border-zinc-200 dark:border-zinc-800 text-zinc-650 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95"
              >
                Close Overview
              </button>
              
              <button
                onClick={() => {
                  closeTutorial();
                  navigate(`/business/${tenantId}/help_${activeTabId}`);
                }}
                className="px-6 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-550/15 transition-all cursor-pointer active:scale-95 flex items-center gap-2"
              >
                <BookOpen className="w-4 h-4" /> Read Full Help Document
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
export default TutorialModal;
