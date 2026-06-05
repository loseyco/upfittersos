import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HelpCircle, GraduationCap, BookOpen, ShieldCheck } from 'lucide-react';
import { useTutorialStore } from './useTutorialStore';
import { getTutorialsData } from './tutorialsData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, doc, getDoc, setDoc, serverTimestamp, query as fsQuery, where } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { resolvePermissions } from '../../lib/auth/permissions';
import type { PermissionKey } from '../../lib/auth/permissions';
import { ITEMS } from '../business/BusinessSidebar';

export function TutorialModal() {
  const { isOpen, activeTabId, closeTutorial } = useTutorialStore();
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
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

  // Fetch departments (visible only to Admin)
  const { data: departments = [] } = useQuery({
    queryKey: ['runner-departments', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const snap = await getDocs(collection(db, `businesses/${tenantId}/departments`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as any);
    },
    enabled: !!tenantId && !!isAdmin
  });

  // Fetch staff list (visible only to Admin)
  const { data: staffList = [] } = useQuery({
    queryKey: ['business-staff-list', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as any);
    },
    enabled: !!tenantId && !!isAdmin
  });

  const sidebarItem = ITEMS.find(item => item.id === activeTabId);
  const requiredPermissions: string[] = [];
  if (sidebarItem?.permission) {
    requiredPermissions.push(sidebarItem.permission);
  }
  if (sidebarItem?.permissions) {
    requiredPermissions.push(...sidebarItem.permissions);
  }

  // Find which departments inherit permissions to view this page
  const allowedDepts = requiredPermissions.length === 0
    ? ['Everyone (Public Access)']
    : departments
        .filter((dept: any) => requiredPermissions.some(p => dept.permissions?.[p as PermissionKey] === true))
        .map((dept: any) => dept.name || 'Unnamed Department');

  // Find which staff members have access
  const allowedStaff = requiredPermissions.length === 0
    ? ['Everyone']
    : staffList
        .filter((st: any) => {
          const dept = departments.find((d: any) => d.id === st.departmentId);
          const resolved: any = resolvePermissions(dept?.permissions, st.individualPermissions);
          return requiredPermissions.some(p => resolved[p] === true);
        })
        .map((st: any) => `${st.firstName || ''} ${st.lastName || ''}`.trim() || st.email)
        .filter(Boolean);

  const uniqueViewsExcludingMe = views.filter((v: any) => v.userId !== user?.uid).length;

  // Lock scrolling on main page when modal is open
  useBodyScrollLock(isOpen);

  // Reset active section when tutorial changes
  useEffect(() => {
    setActiveSectionIndex(0);
  }, [activeTabId]);

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
  const sections = activeTutorial.sections;
  const currentSection = sections[activeSectionIndex] || sections[0];

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
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
            {/* Desktop Left / Mobile Top Section tabs selector */}
            <div className="w-full md:w-[260px] shrink-0 border-b md:border-b-0 md:border-r border-zinc-150 dark:border-zinc-850 p-4 overflow-y-auto no-scrollbar bg-zinc-50/20 dark:bg-zinc-950/10">
              <p className="hidden md:block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest px-3 mb-3">
                Tutorial Sections
              </p>
              
              {/* Horizontal scroll container on mobile, vertical list on desktop */}
              <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 no-scrollbar select-none">
                {sections.map((section, idx) => {
                  const isActive = idx === activeSectionIndex;
                  const SectionIcon = section.icon || HelpCircle;
                  return (
                    <button
                      key={idx}
                      onClick={() => setActiveSectionIndex(idx)}
                      className={`flex items-center gap-3.5 px-4.5 py-3 md:px-3 md:py-2.5 rounded-2xl md:rounded-xl text-left transition-all duration-200 shrink-0 md:w-full active:scale-95 border md:border-0 ${
                        isActive
                          ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/10 font-bold"
                          : "bg-white dark:bg-zinc-900 md:bg-transparent md:dark:bg-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 border-zinc-200 dark:border-zinc-800"
                      }`}
                    >
                      <SectionIcon className={`w-4 h-4 shrink-0 transition-transform ${isActive ? "text-white scale-110" : "text-zinc-400 group-hover:text-zinc-155"}`} />
                      <span className="text-xs font-semibold whitespace-nowrap md:whitespace-normal truncate">{section.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Content pane */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col min-h-0 bg-white dark:bg-zinc-900/20">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSectionIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-6 flex-1"
                >
                  <div className="flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-850 pb-4 shrink-0">
                    <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-xl">
                      {React.createElement(currentSection.icon || HelpCircle, { className: "w-5 h-5" })}
                    </div>
                    <h3 className="text-base md:text-lg font-black text-zinc-900 dark:text-white tracking-tight">
                      {currentSection.title}
                    </h3>
                  </div>

                  <div className="text-sm font-semibold text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-none space-y-4">
                    {currentSection.content}
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Access Control & Telemetry Bar (Visible to Admin Only) */}
              {isAdmin && (
                <div className="mt-6 pt-4 border-t border-zinc-150 dark:border-zinc-800 text-[10px] text-zinc-550 dark:text-zinc-400 flex flex-wrap items-center justify-between gap-4 bg-zinc-50/50 dark:bg-zinc-950/20 p-3.5 rounded-2xl border border-dashed border-zinc-205 dark:border-zinc-800 animate-in fade-in duration-200">
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-extrabold uppercase tracking-wider text-zinc-450 dark:text-zinc-500 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" /> Page Access Permissions
                    </p>
                    <div className="space-y-0.5 font-medium leading-relaxed">
                      <p className="truncate">
                        <strong className="text-zinc-700 dark:text-zinc-300">Departments:</strong>{' '}
                        {allowedDepts.length > 0 ? allowedDepts.join(', ') : 'None (Strict Overrides Only)'}
                      </p>
                      <p className="truncate">
                        <strong className="text-zinc-700 dark:text-zinc-300">Staff Members:</strong>{' '}
                        {allowedStaff.length > 0 ? allowedStaff.join(', ') : 'None (Role-Based Only)'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right space-y-0.5 shrink-0">
                    <p className="font-extrabold uppercase tracking-wider text-zinc-450 dark:text-zinc-500">Telemetry Log</p>
                    <p className="text-sm font-black text-indigo-650 dark:text-indigo-400 font-mono">
                      {views.length} Unique View{views.length !== 1 ? 's' : ''}
                    </p>
                    <p className="text-[9px] text-zinc-400 dark:text-zinc-550 font-bold">
                      ({uniqueViewsExcludingMe} excluding yours)
                    </p>
                  </div>
                </div>
              )}

              {/* Wizard/Navigation buttons at the bottom */}
              <div className="border-t border-zinc-100 dark:border-zinc-850 pt-5 mt-6 flex items-center justify-between gap-4 shrink-0 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    disabled={activeSectionIndex === 0}
                    onClick={() => setActiveSectionIndex(prev => prev - 1)}
                    className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-850 disabled:opacity-40 disabled:hover:bg-transparent rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeTutorial();
                      const mapping: Record<string, string> = {
                        time_details: 'clocking_in_out',
                        timeclock: 'clocking_in_out',
                        live_timeclock: 'breaks_lunches',
                      };
                      const targetHelpTab = mapping[activeTabId] || 'overview';
                      navigate(`/business/${tenantId}/help_${targetHelpTab}`);
                    }}
                    className="px-4 py-2 bg-indigo-50/60 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <BookOpen className="w-3.5 h-3.5" /> Read Full Tutorial
                  </button>
                </div>
                
                <span className="text-[10px] font-extrabold text-zinc-450 uppercase tracking-widest">
                  Section {activeSectionIndex + 1} of {sections.length}
                </span>
                {activeSectionIndex < sections.length - 1 ? (
                  <button
                    onClick={() => setActiveSectionIndex(prev => prev + 1)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md shadow-indigo-500/10 transition-all cursor-pointer active:scale-95"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    onClick={closeTutorial}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-850 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95 shadow-sm"
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
export default TutorialModal;
