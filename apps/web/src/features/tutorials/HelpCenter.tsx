import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, ArrowRight, BookOpen, Clock, 
  HelpCircle, Check, Play, GraduationCap, RefreshCw,
  QrCode, MapPin, ShieldCheck, AlertTriangle
} from 'lucide-react';
import { SLIDE_TUTORIALS } from './slideTutorialsData';
import { getTutorialsData } from './tutorialsData';
import { ITEMS } from '../business/BusinessSidebar';
import { resolvePermissions } from '../../lib/auth/permissions';
import type { PermissionKey } from '../../lib/auth/permissions';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc, query as fsQuery, collection, where, getDocs, setDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';

interface HelpCenterProps {
  activeTab: string;
}

export function HelpCenter({ activeTab }: HelpCenterProps) {
  const navigate = useNavigate();
  const { tenantId } = useParams();
  const { user, permissions, isSuperAdmin } = useAuthStore();
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);

  const isAdmin = isSuperAdmin || permissions?.['settings.manage'] || permissions?.['timeclock.manage'];

  // Fetch all tutorial completions (for admin view)
  const { data: completions, refetch: refetchCompletions } = useQuery({
    queryKey: ['tutorial-completions', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const snap = await getDocs(collection(db, `businesses/${tenantId}/tutorial_completions`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as any);
    },
    enabled: !!tenantId && !!isAdmin
  });

  // Fetch all staff members (for admin view)
  const { data: allStaff } = useQuery({
    queryKey: ['business-staff-list', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as any);
    },
    enabled: !!tenantId && !!isAdmin
  });

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

  // Find if activeTab specifies a specific tutorial slide-deck
  const selectedTutorialId = activeTab.replace('help_', '');
  const currentTutorial = SLIDE_TUTORIALS.find(t => t.id === selectedTutorialId);

  // Fetch unique views (visible only to Admin)
  const { data: views = [] } = useQuery({
    queryKey: ['tutorial-views', tenantId, selectedTutorialId],
    queryFn: async () => {
      if (!tenantId || !selectedTutorialId) return [];
      const q = fsQuery(
        collection(db, `businesses/${tenantId}/tutorial_views`),
        where('tutorialId', '==', selectedTutorialId)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => doc.data() as any);
    },
    enabled: !!tenantId && !!selectedTutorialId && !!isAdmin
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

  const tutorialsDataMap = getTutorialsData(business, staffMember, permissions);
  const currentDocGuide = tutorialsDataMap[selectedTutorialId];

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);

  // Reset indices when activeTab changes
  useEffect(() => {
    setCurrentSlideIndex(0);
    setCompleted(false);
    setActiveSectionIndex(0);
  }, [activeTab]);

  // Record a unique view when this guide is opened
  useEffect(() => {
    if (selectedTutorialId && tenantId && user && selectedTutorialId !== 'overview') {
      const recordView = async () => {
        try {
          const docId = `${user.uid}_${selectedTutorialId}`;
          const docRef = doc(db, `businesses/${tenantId}/tutorial_views`, docId);
          await setDoc(docRef, {
            userId: user.uid,
            tutorialId: selectedTutorialId,
            viewedAt: serverTimestamp()
          }, { merge: true });
        } catch (e) {
          console.warn("Failed to record page/tutorial view:", e);
        }
      };
      recordView();
    }
  }, [selectedTutorialId, tenantId, user]);

  const handleStartTutorial = (id: string) => {
    navigate(`/business/${tenantId}/help_${id}`);
  };

  const handleBackToOverview = () => {
    navigate(`/business/${tenantId}/help_overview`);
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return '';
    if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
    if (ts.toDate) return ts.toDate().toLocaleString();
    return new Date(ts).toLocaleString();
  };

  const getStaffCompletion = (staffUserId: string, tutorialId: string) => {
    return completions?.find((c: any) => c.userId === staffUserId && c.tutorialId === tutorialId);
  };

  const recordTutorialCompletion = async () => {
    if (!tenantId || !user || !currentTutorial) return;
    try {
      const docId = `${user.uid}_${currentTutorial.id}`;
      const docRef = doc(db, `businesses/${tenantId}/tutorial_completions`, docId);
      
      const completionVersion = currentTutorial.version || '1.0';
      const staffName = staffMember 
        ? `${staffMember.firstName || ''} ${staffMember.lastName || ''}`.trim() 
        : (user.displayName || user.email || 'Technician');

      await setDoc(docRef, {
        userId: user.uid,
        staffId: staffMember?.id || '',
        staffName,
        tutorialId: currentTutorial.id,
        tutorialTitle: currentTutorial.title,
        latestVersion: completionVersion,
        completedAt: serverTimestamp(),
        history: arrayUnion({
          version: completionVersion,
          completedAt: new Date()
        })
      }, { merge: true });

      if (isAdmin) {
        refetchCompletions();
      }
    } catch (e) {
      console.error("Failed to save tutorial completion:", e);
    }
  };

  const handleNext = () => {
    if (!currentTutorial) return;
    if (currentSlideIndex < currentTutorial.slides.length - 1) {
      setCurrentSlideIndex(prev => prev + 1);
    } else {
      setCompleted(true);
      recordTutorialCompletion();
    }
  };

  const handlePrev = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(prev => prev - 1);
    }
  };

  if (currentDocGuide && activeTab !== 'help_overview') {
    const sections = currentDocGuide.sections;
    const currentSection = sections[activeSectionIndex] || sections[0];

    const sidebarItem = ITEMS.find(item => item.id === selectedTutorialId);
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
      : (allStaff || [])
          .filter((st: any) => {
            const dept = departments.find((d: any) => d.id === st.departmentId);
            const resolved: any = resolvePermissions(dept?.permissions, st.individualPermissions);
            return requiredPermissions.some(p => resolved[p] === true);
          })
          .map((st: any) => `${st.firstName || ''} ${st.lastName || ''}`.trim() || st.email)
          .filter(Boolean);

    const uniqueViewsExcludingMe = views.filter((v: any) => v.userId !== user?.uid).length;

    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
        {/* Header */}
        <div className="flex items-start gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
          <button
            onClick={handleBackToOverview}
            className="p-2 border border-zinc-205 dark:border-zinc-800 hover:bg-zinc-150 dark:hover:bg-zinc-850 text-zinc-550 dark:text-zinc-400 rounded-xl transition-all cursor-pointer active:scale-95 shrink-0"
            title="Back to all tutorials"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-indigo-500/10 text-indigo-500 rounded-lg">
                <GraduationCap className="w-4 h-4 text-indigo-500" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                {currentDocGuide.category} Guide
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
              {currentDocGuide.title}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
              {currentDocGuide.description}
            </p>
          </div>
        </div>

        {/* Main Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Sidebar Menu */}
          <div className="lg:col-span-3 space-y-2 lg:sticky lg:top-4 bg-zinc-50 dark:bg-zinc-900/40 p-4 border border-zinc-200 dark:border-zinc-800 rounded-3xl">
            <p className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest px-2 mb-3">
              Guide Sections
            </p>
            <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible no-scrollbar pb-2 lg:pb-0">
              {sections.map((section, idx) => {
                const isActive = idx === activeSectionIndex;
                const SectionIcon = section.icon || HelpCircle;
                return (
                  <button
                    key={idx}
                    onClick={() => setActiveSectionIndex(idx)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all shrink-0 lg:w-full active:scale-95 border lg:border-0 ${
                      isActive
                        ? "bg-indigo-600 text-white font-bold shadow-md shadow-indigo-650/10"
                        : "bg-white dark:bg-zinc-900 lg:bg-transparent lg:dark:bg-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-205 border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <SectionIcon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-zinc-400"}`} />
                    <span className="text-xs font-semibold truncate">{section.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Content Pane */}
          <div className="lg:col-span-9 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-sm min-h-[400px] flex flex-col justify-between">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSectionIndex}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-6 flex-1"
              >
                <div className="flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-850 pb-4">
                  <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-xl">
                    {React.createElement(currentSection.icon || HelpCircle, { className: "w-5 h-5" })}
                  </div>
                  <h3 className="text-lg font-black text-zinc-900 dark:text-white tracking-tight">
                    {currentSection.title}
                  </h3>
                </div>

                <div className="text-sm font-semibold text-zinc-600 dark:text-zinc-350 leading-relaxed space-y-4">
                  {currentSection.content}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Access Control & Telemetry Bar (Visible to Admin Only) */}
            {isAdmin && (
              <div className="mt-6 pt-4 border-t border-zinc-150 dark:border-zinc-800 text-[10px] text-zinc-550 dark:text-zinc-400 flex flex-wrap items-center justify-between gap-4 bg-zinc-50/50 dark:bg-zinc-950/20 p-3.5 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 animate-in fade-in duration-200">
                <div className="space-y-1 min-w-0 flex-1">
                  <p className="font-extrabold uppercase tracking-wider text-zinc-450 dark:text-zinc-500 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" /> Page Access Permissions
                  </p>
                  <div className="space-y-0.5 font-medium leading-relaxed">
                    <p className="truncate">
                      <strong className="text-zinc-700 dark:text-zinc-305">Departments:</strong>{' '}
                      {allowedDepts.length > 0 ? allowedDepts.join(', ') : 'None (Strict Overrides Only)'}
                    </p>
                    <p className="truncate">
                      <strong className="text-zinc-700 dark:text-zinc-305">Staff Members:</strong>{' '}
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

            {/* Navigation Controls */}
            <div className="border-t border-zinc-105 dark:border-zinc-850 pt-5 mt-6 flex items-center justify-between gap-4 shrink-0 flex-wrap">
              <button
                disabled={activeSectionIndex === 0}
                onClick={() => setActiveSectionIndex(prev => prev - 1)}
                className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 text-zinc-650 dark:text-zinc-450 hover:bg-zinc-50 dark:hover:bg-zinc-850 disabled:opacity-40 disabled:hover:bg-transparent rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95"
              >
                Previous Section
              </button>
              
              <span className="text-[10px] font-extrabold text-zinc-455 dark:text-zinc-500 uppercase tracking-widest">
                Section {activeSectionIndex + 1} of {sections.length}
              </span>

              {activeSectionIndex < sections.length - 1 ? (
                <button
                  onClick={() => setActiveSectionIndex(prev => prev + 1)}
                  className="px-5 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-indigo-500/10 transition-all cursor-pointer active:scale-95"
                >
                  Next Section
                </button>
              ) : (
                <button
                  onClick={handleBackToOverview}
                  className="px-5 py-2 bg-zinc-900 hover:bg-zinc-850 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 shadow-sm"
                >
                  Back to Academy
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentTutorial || activeTab === 'help_overview') {
    // Render Catalog/Overview of all PowerPoint tutorials
    return (
      <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
        {/* Banner */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-zinc-950 border border-indigo-900/50 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="space-y-2 relative z-15">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-indigo-500/20 text-indigo-400 rounded-lg">
                <GraduationCap className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
                UpfittersOS Academy
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Help Center & Slide Tutorials</h1>
            <p className="text-sm text-zinc-400 font-semibold leading-relaxed max-w-xl">
              Learn how to operate the platform with slide-deck presentations and interactive mockups. Check out our detailed walkthroughs below.
            </p>
          </div>
          <div className="shrink-0 relative z-10">
            <div className="w-16 h-16 bg-indigo-650/20 border border-indigo-550/30 rounded-2xl flex items-center justify-center text-indigo-400 shadow-md">
              <BookOpen className="w-8 h-8" />
            </div>
          </div>
        </div>

        {/* Grid of Tutorials */}
        <div className="space-y-4">
          <h2 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-wider">Available Slide Decks</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {SLIDE_TUTORIALS.map((t) => {
              const TutorialIcon = t.icon;
              return (
                <div 
                  key={t.id}
                  onClick={() => handleStartTutorial(t.id)}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/50 dark:hover:border-indigo-500/30 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 group cursor-pointer flex flex-col justify-between h-56 hover:-translate-y-0.5 active:scale-[0.99]"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                        <TutorialIcon className="w-5 h-5" />
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-550 font-bold uppercase tracking-wider">
                        <Clock className="w-3.5 h-3.5" />
                        {t.estimatedTime} read
                      </div>
                    </div>
                    <div>
                      <h3 className="text-base font-black text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {t.title}
                      </h3>
                      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-450 mt-1.5 leading-relaxed">
                        {t.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-black text-indigo-650 dark:text-indigo-400 uppercase tracking-wider pt-4 border-t border-zinc-100 dark:border-zinc-850">
                    <Play className="w-3.5 h-3.5" /> Start Slideshow
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* System & Feature Guides */}
        <div className="space-y-4 pt-6 border-t border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-wider">System & Feature Guides</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(tutorialsDataMap).map(([id, guide]) => {
              const GuideIcon = guide.sections[0]?.icon || BookOpen;
              return (
                <div 
                  key={id}
                  onClick={() => navigate(`/business/${tenantId}/help_${id}`)}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/50 dark:hover:border-indigo-500/30 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 group cursor-pointer flex flex-col justify-between h-56 hover:-translate-y-0.5 active:scale-[0.99]"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 bg-indigo-500/10 text-indigo-655 dark:text-indigo-400 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                        <GuideIcon className="w-5 h-5" />
                      </div>
                      <div className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border bg-indigo-500/5 text-indigo-600 dark:text-indigo-405 border-indigo-500/20">
                        {guide.category}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-base font-black text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {guide.title}
                      </h3>
                      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-450 mt-1.5 leading-relaxed line-clamp-2">
                        {guide.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-black text-indigo-650 dark:text-indigo-400 uppercase tracking-wider pt-4 border-t border-zinc-100 dark:border-zinc-850">
                    <BookOpen className="w-3.5 h-3.5" /> Read Documentation
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dynamic Staff Completion Logs (Visible only to Admin) */}
        {isAdmin && allStaff && allStaff.length > 0 && (
          <div className="space-y-4 pt-6 border-t border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Check className="w-5 h-5 text-emerald-500" />
                  Staff Onboarding Tutorial Tracker
                </h2>
                <p className="text-xs text-zinc-550 dark:text-zinc-400 mt-1">
                  Monitor which onboarding guides have been read by technicians and track active version compliance.
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
                      <th className="py-3.5 px-6 font-extrabold text-xs uppercase tracking-wider text-zinc-450 dark:text-zinc-500">
                        Staff Member
                      </th>
                      {SLIDE_TUTORIALS.map(t => (
                        <th key={t.id} className="py-3.5 px-6 font-extrabold text-xs uppercase tracking-wider text-zinc-450 dark:text-zinc-500">
                          {t.title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
                    {allStaff.map((staff: any) => {
                      const hasAccount = !!staff.userId;
                      return (
                        <React.Fragment key={staff.id}>
                          <tr 
                            onClick={() => {
                              if (hasAccount) {
                                setExpandedStaffId(expandedStaffId === staff.id ? null : staff.id);
                              }
                            }}
                            className={`hover:bg-zinc-50/50 dark:hover:bg-zinc-950/30 transition-colors ${
                              hasAccount ? 'cursor-pointer' : ''
                            }`}
                          >
                            <td className="py-4 px-6 font-semibold">
                              <div>
                                <span className="font-bold text-zinc-900 dark:text-white block text-sm">
                                  {staff.firstName} {staff.lastName}
                                </span>
                                <span className="text-zinc-450 dark:text-zinc-500 text-[11px] font-mono">
                                  {staff.email}
                                </span>
                              </div>
                            </td>

                            {SLIDE_TUTORIALS.map(t => {
                              if (!hasAccount) {
                                return (
                                  <td key={t.id} className="py-4 px-6 text-zinc-400 dark:text-zinc-500 italic">
                                    Invite Pending
                                  </td>
                                );
                              }
                              
                              const comp = getStaffCompletion(staff.userId, t.id);
                              if (!comp) {
                                return (
                                  <td key={t.id} className="py-4 px-6">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700">
                                      Unread
                                    </span>
                                  </td>
                                );
                              }

                              const isUpToDate = comp.latestVersion === t.version;
                              return (
                                <td key={t.id} className="py-4 px-6">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    isUpToDate
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                  }`}>
                                    {isUpToDate ? `Read (v${comp.latestVersion})` : `Outdated (v${comp.latestVersion})`}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>

                          {/* Collapsible history view */}
                          {expandedStaffId === staff.id && hasAccount && (
                            <tr>
                              <td colSpan={SLIDE_TUTORIALS.length + 1} className="bg-zinc-50/50 dark:bg-zinc-950/20 px-8 py-4 border-t border-b border-zinc-150 dark:border-zinc-850">
                                <div className="space-y-3">
                                  <h4 className="text-[10px] font-extrabold text-zinc-450 dark:text-zinc-500 uppercase tracking-widest">
                                    Version Read History - {staff.firstName} {staff.lastName}
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {SLIDE_TUTORIALS.map(t => {
                                      const comp = getStaffCompletion(staff.userId, t.id);
                                      const history = comp?.history || [];
                                      return (
                                        <div key={t.id} className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-155 dark:border-zinc-800 rounded-2xl space-y-2 shadow-xs">
                                          <p className="font-bold text-zinc-800 dark:text-zinc-200 text-xs">
                                            {t.title}
                                          </p>
                                          {history.length > 0 ? (
                                            <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                                              {history.map((h: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between text-[11px] text-zinc-550 dark:text-zinc-450">
                                                  <span className="font-bold">Version {h.version}</span>
                                                  <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-550">
                                                    {formatTimestamp(h.completedAt)}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <p className="text-[11px] text-zinc-450 italic">Not read yet.</p>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Render PowerPoint Deck Slide Player
  const slides = currentTutorial.slides;
  const currentSlide = slides[currentSlideIndex];

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Deck Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackToOverview}
            className="p-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-150 dark:hover:bg-zinc-850 text-zinc-550 dark:text-zinc-400 rounded-xl transition-all cursor-pointer active:scale-95"
            title="Back to all tutorials"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
              {currentTutorial.title}
            </h1>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
              Slide Deck Tutorial • <Clock className="w-3 h-3 text-zinc-400" /> {currentTutorial.estimatedTime} read
            </p>
          </div>
        </div>
        
        {/* Progress Dots */}
        <div className="flex items-center gap-1.5">
          {slides.map((_, idx) => (
            <button
              key={idx}
              disabled={completed}
              onClick={() => setCurrentSlideIndex(idx)}
              className={`h-2.5 rounded-full transition-all duration-300 ${
                idx === currentSlideIndex
                  ? "w-6 bg-indigo-600 dark:bg-indigo-500"
                  : "w-2.5 bg-zinc-250 dark:bg-zinc-800 hover:bg-zinc-400 dark:hover:bg-zinc-700"
              }`}
              title={`Jump to slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1 rounded-full overflow-hidden">
        <div 
          className="bg-indigo-600 dark:bg-indigo-500 h-full transition-all duration-300"
          style={{ width: `${((currentSlideIndex + (completed ? 1 : 0)) / slides.length) * 100}%` }}
        />
      </div>

      {/* Slide Content */}
      <AnimatePresence mode="wait">
        {!completed ? (
          <motion.div
            key={currentSlideIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            {/* Left side: Text Details (Slide content) */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 dark:bg-indigo-500/20 px-3 py-1 rounded-full">
                  {currentSlide.subtitle || `Slide ${currentSlideIndex + 1} of ${slides.length}`}
                </span>
                
                <h2 className="text-xl md:text-2xl font-black text-zinc-905 dark:text-white tracking-tight leading-snug">
                  {currentSlide.title}
                </h2>

                <ul className="space-y-3.5 pt-2">
                  {currentSlide.bulletPoints.map((point, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm font-semibold text-zinc-650 dark:text-zinc-350 leading-relaxed">
                      <div className="w-5 h-5 bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-650 dark:text-indigo-400 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-black">
                        ✓
                      </div>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>

                {/* Dynamic Configuration Cards based on Firestore Data */}
                {selectedTutorialId === 'clocking_in_out' && currentSlideIndex === 1 && (
                  <div className="mt-6 p-4 rounded-2xl border bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-450 dark:text-zinc-400 font-extrabold uppercase tracking-widest flex items-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5 text-indigo-505 dark:text-indigo-400" />
                        Live QR Code Requirement
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                        business?.timeclockRequireQR 
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 dark:border-amber-500/30" 
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/30"
                      }`}>
                        {business?.timeclockRequireQR ? "Enforced" : "Not Required"}
                      </span>
                    </div>
                    <div className="text-xs space-y-1.5 leading-relaxed">
                      <p className="font-bold text-zinc-800 dark:text-zinc-200">
                        {business?.timeclockRequireQR ? (
                          <>
                            Hi <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{staffMember?.firstName || 'there'}</span>, 
                            QR scans are <span className="text-amber-600 dark:text-amber-400 font-black">REQUIRED</span> for mobile clock-ins at <span className="text-zinc-900 dark:text-white font-extrabold">{business?.name || 'the shop'}</span>.
                          </>
                        ) : (
                          <>
                            Hi <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{staffMember?.firstName || 'there'}</span>, 
                            QR scans are <span className="text-emerald-600 dark:text-emerald-400 font-black">NOT REQUIRED</span> at <span className="text-zinc-900 dark:text-white font-extrabold">{business?.name || 'the shop'}</span>.
                          </>
                        )}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {business?.timeclockRequireQR 
                          ? "To log your shift attendance, you must scan the active rotating QR code shown on the physical shop floor display tablet. Sharing or bookmarking URLs is blocked." 
                          : "You are allowed to clock in and out directly using the timeclock control bar at the top of your dashboard."}
                      </p>
                    </div>
                  </div>
                )}

                {selectedTutorialId === 'clocking_in_out' && currentSlideIndex === 2 && (
                  <div className="mt-6 p-4 rounded-2xl border bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-450 dark:text-zinc-400 font-extrabold uppercase tracking-widest flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-indigo-505 dark:text-indigo-400" />
                        Geofence & Location Rules
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                        (!business?.siteLat || !business?.siteLng) || business?.allowOffsiteClockIn || permissions?.['timeclock.offsite']
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/30" 
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 dark:border-rose-500/30"
                      }`}>
                        {(!business?.siteLat || !business?.siteLng) 
                          ? "Not Enforced" 
                          : (business?.allowOffsiteClockIn || permissions?.['timeclock.offsite']) 
                            ? "Bypassed" 
                            : "Restricted"}
                      </span>
                    </div>
                    <div className="text-xs space-y-1.5 leading-relaxed">
                      <p className="font-bold text-zinc-800 dark:text-zinc-200">
                        {(!business?.siteLat || !business?.siteLng) ? (
                          <>
                            Geofencing is <span className="text-emerald-600 dark:text-emerald-400 font-black">disabled</span> for <span className="text-zinc-900 dark:text-white font-extrabold">{business?.name || 'the shop'}</span>.
                          </>
                        ) : business?.allowOffsiteClockIn ? (
                          <>
                            Offsite clock-in is <span className="text-emerald-600 dark:text-emerald-400 font-black">allowed globally</span> for <span className="text-zinc-900 dark:text-white font-extrabold">{business?.name || 'the shop'}</span>.
                          </>
                        ) : permissions?.['timeclock.offsite'] ? (
                          <>
                            Hi <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{staffMember?.firstName || 'there'}</span>, you have <span className="text-emerald-600 dark:text-emerald-400 font-black">Offsite Permission</span> enabled.
                          </>
                        ) : (
                          <>
                            Hi <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{staffMember?.firstName || 'there'}</span>, you are <span className="text-rose-600 dark:text-rose-405 font-black">restricted</span> to on-site clock-ins.
                          </>
                        )}
                      </p>
                      
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 space-y-1.5">
                        {(!business?.siteLat || !business?.siteLng) ? (
                          <p>The shop coordinates are not configured in settings, meaning shift check-ins are not gated by location.</p>
                        ) : business?.allowOffsiteClockIn ? (
                          <p>You can check in from any location since offsite check-ins are globally allowed by management.</p>
                        ) : permissions?.['timeclock.offsite'] ? (
                          <p>Although the shop enforces a physical geofence, your specific user account is permitted to clock in offsite (e.g. for mobile jobs).</p>
                        ) : (
                          <>
                            <p>
                              You must be physically present within <strong className="text-zinc-900 dark:text-white">{business?.siteRadius || 500} meters</strong> of the shop to clock in.
                            </p>
                            {business?.addressStreet && (
                              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono bg-zinc-100 dark:bg-zinc-950 p-2 rounded-lg border border-zinc-200 dark:border-zinc-850">
                                Address: {business.addressStreet}, {business.addressCity}, {business.addressState} {business.addressZip}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Slide Tips */}
              {currentSlide.tips && currentSlide.tips.length > 0 && (
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-800 rounded-2xl space-y-1.5">
                  <span className="text-[10px] text-amber-500 dark:text-amber-400 font-extrabold uppercase tracking-widest block">
                    💡 Pro Tip & Best Practice
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-xs text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
                    {currentSlide.tips.map((tip, idx) => (
                      <li key={idx}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Right side: visualElement mockup representation */}
            <div className="lg:col-span-5 flex items-center justify-center min-h-[300px]">
              <div className="w-full max-w-[380px] aspect-square rounded-3xl bg-zinc-50 dark:bg-zinc-950/40 p-4 border border-zinc-150 dark:border-zinc-850 shadow-inner flex items-center justify-center">
                {currentSlide.visualElement ? (
                  currentSlide.visualElement
                ) : (
                  <div className="text-center space-y-2 p-6">
                    <HelpCircle className="w-12 h-12 text-zinc-350 mx-auto animate-pulse" />
                    <p className="text-xs font-bold text-zinc-405 uppercase tracking-wider">No mockup preview available</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          /* Completion Screen */
          <motion.div
            key="completion"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center justify-center text-center py-12 px-6 bg-white dark:bg-zinc-900 border border-zinc-155 dark:border-zinc-800 rounded-3xl shadow-sm max-w-2xl mx-auto space-y-6"
          >
            <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/5">
              <Check className="w-10 h-10 animate-bounce" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">Tutorial Completed!</h2>
              <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
                You have successfully completed the <strong>{currentTutorial.title}</strong> slide deck tutorial. You're ready to put these steps into practice!
              </p>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/30 text-emerald-650 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider rounded-full mt-2">
                <Check className="w-3.5 h-3.5 text-emerald-500" /> Completion & Version {currentTutorial.version || '1.0'} Logged
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setCurrentSlideIndex(0);
                  setCompleted(false);
                }}
                className="px-5 py-2.5 border border-zinc-200 dark:border-zinc-800 text-zinc-650 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Restart Slideshow
              </button>
              <button
                onClick={handleBackToOverview}
                className="px-6 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-600/15 transition-all cursor-pointer active:scale-95"
              >
                Finish & Exit
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deck Controls (Next/Prev) */}
      {!completed && (
        <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-850 pt-4 mt-6">
          <button
            disabled={currentSlideIndex === 0}
            onClick={handlePrev}
            className="px-5 py-2.5 border border-zinc-200 dark:border-zinc-800 text-zinc-650 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-850 disabled:opacity-40 disabled:hover:bg-transparent rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" /> Previous Slide
          </button>
          
          <span className="text-[10px] font-extrabold text-zinc-450 uppercase tracking-widest">
            {currentSlideIndex + 1} of {slides.length}
          </span>
          
          <button
            onClick={handleNext}
            className="px-6 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-500/10 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
          >
            {currentSlideIndex === slides.length - 1 ? "Complete Tutorial" : "Next Slide"} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
export default HelpCenter;
