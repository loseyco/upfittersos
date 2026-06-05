import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { useNavigate } from 'react-router-dom';
import { 
  Play, FileText, Plus, CheckCircle2, Trash2, Edit3, 
  Workflow, ExternalLink, PlusCircle, ChevronDown, ChevronUp, RefreshCw, 
  ShieldCheck, BookOpen
} from 'lucide-react';
import { SOPBuilder } from './SOPBuilder';
import { SOPRunner } from './SOPRunner';
import { SOPReader } from './SOPReader';
import type { SOPTemplate, SOPRun } from './sopsData';

interface SOPCenterProps {
  activeTab: string;
}

export function SOPCenter({ activeTab: _activeTab }: SOPCenterProps) {
  const navigate = useNavigate();
  const { tenantId, user } = useAuthStore();
  const [subTab, setSubTab] = useState<'runs' | 'templates' | 'history'>('runs');
  
  // Navigation states for child components
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeReadTemplateId, setActiveReadTemplateId] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateData, setEditingTemplateData] = useState<SOPTemplate | null>(null);
  
  // Modal states
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [linkedJobId, setLinkedJobId] = useState('');

  // Expandable row states
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [expandedComplianceTemplateId, setExpandedComplianceTemplateId] = useState<string | null>(null);

  // Fetch SOP templates
  const { data: templates = [], refetch: refetchTemplates, isLoading: isTemplatesLoading } = useQuery({
    queryKey: ['sop-templates', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/sops`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as SOPTemplate & { id: string });
    },
    enabled: !!tenantId
  });

  // Fetch SOP runs
  const { data: runs = [], refetch: refetchRuns, isLoading: isRunsLoading } = useQuery({
    queryKey: ['sop-runs', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/sop_runs`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as SOPRun & { id: string });
    },
    enabled: !!tenantId
  });

  // Fetch SOP completions (Compliance Read Acknowledgments)
  const { data: completions = [], refetch: refetchCompletions } = useQuery({
    queryKey: ['sop-completions', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/sop_completions`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as any);
    },
    enabled: !!tenantId
  });

  // Fetch Jobs list to link
  const { data: activeJobs = [] } = useQuery({
    queryKey: ['runner-jobs-list', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/jobs`));
      return snap.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          jobNo: data.jobNo || data.job_Number || 'N/A', 
          vehicleName: data.vehicleName || data.vehicle_Name || 'Unknown Vehicle',
          customerName: data.customerName || data.customer_Name || 'Unknown Customer'
        };
      });
    },
    enabled: !!tenantId
  });

  // Fetch all departments
  const { data: departments = [] } = useQuery({
    queryKey: ['runner-departments', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/departments`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as { id: string; name: string });
    }
  });

  // Fetch all staff
  const { data: staffList = [] } = useQuery({
    queryKey: ['runner-staff-list', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as any);
      return list.filter((s: any) => s.isArchived !== true && !s.fireDate) as { id: string; name: string; departmentId: string }[];
    },
    enabled: !!tenantId
  });

  // Fetch Staff details for User Name
  const { data: currentStaff } = useQuery({
    queryKey: ['runner-current-staff', tenantId, user?.uid],
    queryFn: async () => {
      if (!tenantId || !user?.uid) return null;
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      const match = snap.docs.find(doc => doc.data().userId === user.uid);
      return match ? { id: match.id, ...match.data() } as any : null;
    },
    enabled: !!tenantId && !!user?.uid
  });

  const handleStartWorkflow = async () => {
    if (!selectedTemplateId) return;
    const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
    if (!selectedTemplate) return;

    try {
      const userName = currentStaff?.name || user?.email || 'System User';
      const initialStepId = selectedTemplate.steps[0]?.id || 'step_1';

      const payload: SOPRun = {
        sopId: selectedTemplateId,
        title: `${selectedTemplate.title} Run`,
        linkedJobId: linkedJobId || undefined,
        status: 'active',
        currentStepId: initialStepId,
        startedAt: Date.now(),
        startedBy: currentStaff?.id || user?.uid || 'unknown',
        startedByName: userName,
        history: []
      };

      const docRef = await addDoc(collection(db, `businesses/${tenantId}/sop_runs`), payload);
      setShowStartModal(false);
      setSelectedTemplateId('');
      setLinkedJobId('');
      refetchRuns();
      setActiveRunId(docRef.id);
    } catch (err) {
      console.error('Error starting SOP Run:', err);
      alert('Failed to launch SOP run workflow.');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this SOP template? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/sops`, id));
      refetchTemplates();
    } catch (err) {
      console.error('Error deleting template:', err);
    }
  };

  const handleDeleteRun = async (id: string) => {
    if (!confirm('Are you sure you want to delete this active workflow run?')) return;
    try {
      await deleteDoc(doc(db, `businesses/${tenantId}/sop_runs`, id));
      refetchRuns();
    } catch (err) {
      console.error('Error deleting run:', err);
    }
  };

  // Resolve compliance status of current technician for a template
  const getTechComplianceStatus = (tmpl: SOPTemplate & { id: string }) => {
    if (!currentStaff) return { code: 'unread', label: 'Unread', badgeClass: 'bg-rose-500/10 text-rose-500 border-rose-500/20' };
    const userComps = completions.filter(c => c.sopId === tmpl.id && c.staffId === currentStaff.id);
    if (userComps.length === 0) {
      return { code: 'unread', label: 'Unread', badgeClass: 'bg-rose-500/10 text-rose-500 border-rose-500/20' };
    }
    const currentVer = tmpl.version || 1;
    const hasLatest = userComps.some(c => c.version === currentVer);
    if (hasLatest) {
      return { code: 'compliant', label: `v${currentVer} Acknowledged`, badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
    }
    const maxRead = Math.max(...userComps.map(c => c.version || 1));
    return { code: 'out_of_date', label: `Out of Date (Read v${maxRead})`, badgeClass: 'bg-amber-500/10 text-amber-505 border-amber-500/20' };
  };

  // Resolve compliance status of a specific staff member for a template
  const getStaffComplianceForTemplate = (tmpl: SOPTemplate & { id: string }, staffId: string) => {
    const staffComps = completions.filter(c => c.sopId === tmpl.id && c.staffId === staffId);
    if (staffComps.length === 0) {
      return { label: 'Unread', color: 'text-rose-500 bg-rose-500/5 border-rose-500/10' };
    }
    const currentVer = tmpl.version || 1;
    const hasLatest = staffComps.some(c => c.version === currentVer);
    if (hasLatest) {
      return { label: `Compliant (v${currentVer})`, color: 'text-emerald-500 bg-emerald-500/5 border-emerald-500/10' };
    }
    const maxRead = Math.max(...staffComps.map(c => c.version || 1));
    return { label: `Out of Date (v${maxRead})`, color: 'text-amber-505 bg-amber-500/5 border-amber-500/10' };
  };

  // Switch views if child components are active
  if (isBuilding) {
    return (
      <SOPBuilder
        tenantId={tenantId!}
        onBack={() => setIsBuilding(false)}
        onSaveSuccess={() => {
          setIsBuilding(false);
          refetchTemplates();
        }}
      />
    );
  }

  if (editingTemplateId) {
    return (
      <SOPBuilder
        tenantId={tenantId!}
        templateId={editingTemplateId}
        initialTemplate={editingTemplateData}
        onBack={() => {
          setEditingTemplateId(null);
          setEditingTemplateData(null);
        }}
        onSaveSuccess={() => {
          setEditingTemplateId(null);
          setEditingTemplateData(null);
          refetchTemplates();
        }}
      />
    );
  }

  if (activeRunId) {
    return (
      <SOPRunner
        tenantId={tenantId!}
        runId={activeRunId}
        onBack={() => {
          setActiveRunId(null);
          refetchRuns();
        }}
      />
    );
  }

  if (activeReadTemplateId) {
    return (
      <SOPReader
        tenantId={tenantId!}
        templateId={activeReadTemplateId}
        onBack={() => setActiveReadTemplateId(null)}
        onComplete={() => {
          setActiveReadTemplateId(null);
          refetchCompletions();
        }}
      />
    );
  }

  const activeRuns = runs.filter(r => r.status === 'active');
  const completedRuns = runs.filter(r => r.status === 'completed');

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-950 to-indigo-950 border border-indigo-900/40 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="space-y-2 relative z-15">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-indigo-500/20 text-indigo-400 rounded-lg">
              <Workflow className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
              SOP Workflow Engine
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Custom Operations SOPs</h1>
          <p className="text-sm text-zinc-400 font-semibold leading-relaxed max-w-xl">
            Design dynamic procedures and track checklist completions in real-time. Link workflows to active jobs and assign tasks to departments or techs.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 relative z-10">
          <button
            onClick={() => setIsBuilding(true)}
            className="px-5 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-600/15 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
          >
            <Plus className="w-4 h-4" /> Create Custom SOP
          </button>
          <button
            onClick={() => setShowStartModal(true)}
            className="px-5 py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
          >
            <Play className="w-3.5 h-3.5 text-emerald-500" /> Start SOP Workflow
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-855 pb-px">
        <div className="flex gap-6">
          <button
            onClick={() => setSubTab('runs')}
            className={`pb-4 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
              subTab === 'runs' 
                ? 'border-indigo-600 dark:border-indigo-500 text-indigo-650 dark:text-indigo-400' 
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-350'
            }`}
          >
            Active Workflows ({activeRuns.length})
          </button>
          <button
            onClick={() => setSubTab('templates')}
            className={`pb-4 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
              subTab === 'templates' 
                ? 'border-indigo-600 dark:border-indigo-500 text-indigo-650 dark:text-indigo-400' 
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-350'
            }`}
          >
            SOP Templates ({templates.length})
          </button>
          <button
            onClick={() => setSubTab('history')}
            className={`pb-4 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
              subTab === 'history' 
                ? 'border-indigo-600 dark:border-indigo-500 text-indigo-650 dark:text-indigo-400' 
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-350'
            }`}
          >
            History Log ({completedRuns.length})
          </button>
        </div>
      </div>

      {/* Loading state */}
      {(isTemplatesLoading || isRunsLoading) && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
          <span className="text-sm font-bold text-zinc-550">Loading operations records...</span>
        </div>
      )}

      {/* Tab Content Panels */}
      {!isTemplatesLoading && !isRunsLoading && (
        <div>
          {/* Subtab 1: Active Runs */}
          {subTab === 'runs' && (
            activeRuns.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-4 shadow-sm mt-6">
                <Workflow className="w-12 h-12 text-zinc-400 dark:text-zinc-550 mx-auto" />
                <h3 className="text-base font-black text-zinc-900 dark:text-white uppercase tracking-wider">No Active SOP Workflows</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
                  There are no procedures currently active on the shop floor. Click **Start SOP Workflow** to launch a checklist on a vehicle.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeRuns.map(run => {
                  const tmpl = templates.find(t => t.id === run.sopId);
                  const stepCount = tmpl?.steps?.length || 0;
                  const currentStepIdx = tmpl?.steps?.findIndex(s => s.id === run.currentStepId) ?? 0;
                  const percent = stepCount > 0 ? Math.round((currentStepIdx / stepCount) * 100) : 0;
                  const currentStep = tmpl?.steps[currentStepIdx];
                  const linkedJob = activeJobs.find(j => j.id === run.linkedJobId);

                  return (
                    <div 
                      key={run.id}
                      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-3xl shadow-sm flex flex-col justify-between h-64 hover:border-indigo-500/50 transition-all duration-300 relative overflow-hidden"
                    >
                      <div className="space-y-3.5">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[9px] font-black uppercase text-indigo-650 dark:text-indigo-400 bg-indigo-500/10 dark:bg-indigo-500/20 px-2 py-0.5 rounded-full">
                              Active Run
                            </span>
                            <h3 className="text-sm font-black text-zinc-900 dark:text-white mt-1.5 truncate max-w-[170px]" title={tmpl?.title || run.title}>
                              {tmpl?.title || run.title}
                            </h3>
                          </div>
                          
                          <button
                            onClick={() => handleDeleteRun(run.id!)}
                            className="p-1.5 text-zinc-400 hover:text-rose-500 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {linkedJob && (
                          <div className="text-[10px] bg-zinc-50 dark:bg-zinc-950 p-2 rounded-xl border border-zinc-150 dark:border-zinc-850 space-y-0.5">
                            <p className="font-extrabold text-zinc-700 dark:text-zinc-350">Linked Job #{linkedJob.jobNo}</p>
                            <p className="text-zinc-450 dark:text-zinc-500 font-semibold truncate">{linkedJob.vehicleName} • {linkedJob.customerName}</p>
                          </div>
                        )}

                        {currentStep && (
                          <div className="space-y-1">
                            <p className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest">Current Active Task</p>
                            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-250 truncate">{currentStep.title}</p>
                          </div>
                        )}
                      </div>

                      {/* Progress Bar & Run Button */}
                      <div className="space-y-3.5 pt-4 border-t border-zinc-100 dark:border-zinc-850 mt-4">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-bold text-zinc-550 uppercase font-semibold">
                            <span>Progress ({percent}%)</span>
                            <span>Step {currentStepIdx + 1}/{stepCount}</span>
                          </div>
                          <div className="w-full bg-zinc-100 dark:bg-zinc-950 h-1.5 rounded-full overflow-hidden border border-zinc-150 dark:border-zinc-850">
                            <div 
                              className="bg-indigo-650 dark:bg-indigo-500 h-full transition-all duration-300"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>

                        <button
                          onClick={() => setActiveRunId(run.id!)}
                          className="w-full py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer active:scale-95 shadow-md shadow-indigo-500/10 transition-all"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" /> Open Checklist
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* Subtab 2: Templates (Includes Version & Compliance Badging + Audit Board) */}
          {subTab === 'templates' && (
            templates.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-4 shadow-sm mt-6">
                <FileText className="w-12 h-12 text-zinc-400 dark:text-zinc-555 mx-auto" />
                <h3 className="text-base font-black text-zinc-900 dark:text-white uppercase tracking-wider">No SOP Templates Yet</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
                  You haven't defined any operational guidelines. Click **Create Custom SOP** to design your first custom checklist.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {templates.map(tmpl => {
                  const dept = tmpl.category === 'department' ? departments.find(d => d.id === tmpl.departmentId)?.name : null;
                  const compliance = getTechComplianceStatus(tmpl);
                  const isAuditExpanded = expandedComplianceTemplateId === tmpl.id;

                  return (
                    <div key={tmpl.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden transition-all">
                      <div className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="space-y-2 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-[9px] font-black uppercase border px-2 py-0.5 rounded-full ${
                              tmpl.category === 'department' 
                                ? 'bg-amber-500/10 text-amber-550 border-amber-500/20' 
                                : 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20'
                            }`}>
                              {tmpl.category === 'department' ? `Department: ${dept || 'General'}` : 'Company Wide'}
                            </span>
                            <span className="text-[9px] font-black uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-405 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 rounded-full">
                              Version {tmpl.version || 1}
                            </span>
                            <span className={`text-[9px] font-black uppercase border px-2 py-0.5 rounded-full ${compliance.badgeClass}`}>
                              {compliance.label}
                            </span>
                          </div>

                          <h3 className="text-sm font-black text-zinc-900 dark:text-white truncate">
                            {tmpl.title}
                          </h3>
                          <p className="text-xs font-semibold text-zinc-550 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                            {tmpl.description || 'No description provided.'}
                          </p>
                        </div>

                        {/* Actions block */}
                        <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-stretch md:self-auto justify-end border-t md:border-t-0 pt-3 md:pt-0 border-zinc-100 dark:border-zinc-850">
                          {compliance.code !== 'compliant' ? (
                            <button
                              onClick={() => setActiveReadTemplateId(tmpl.id!)}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-750 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-500/15"
                            >
                              <BookOpen className="w-3.5 h-3.5" /> Read & Sign
                            </button>
                          ) : (
                            <button
                              onClick={() => setActiveReadTemplateId(tmpl.id!)}
                              className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-650 dark:text-zinc-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                            >
                              Review Handbook
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setSelectedTemplateId(tmpl.id!);
                              setShowStartModal(true);
                            }}
                            className="px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-850 dark:text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                          >
                            <Play className="w-3 h-3 fill-current" /> Run Workflow
                          </button>

                          <button
                            onClick={() => setExpandedComplianceTemplateId(isAuditExpanded ? null : tmpl.id!)}
                            className="p-2 border border-zinc-205 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-400 cursor-pointer"
                            title="Compliance Audit Dashboard"
                          >
                            <ShieldCheck className={`w-4 h-4 ${isAuditExpanded ? 'text-indigo-400' : ''}`} />
                          </button>

                          <button
                            onClick={() => {
                              setEditingTemplateId(tmpl.id!);
                              setEditingTemplateData(tmpl);
                            }}
                            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-400 cursor-pointer"
                            title="Edit Template"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteTemplate(tmpl.id!)}
                            className="p-2 hover:bg-rose-500/10 hover:text-rose-505 rounded-xl text-zinc-400 cursor-pointer"
                            title="Delete Template"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Compliance Audit Expander Panel */}
                      {isAuditExpanded && (
                        <div className="bg-zinc-50/50 dark:bg-zinc-950/20 p-5 border-t border-zinc-100 dark:border-zinc-850 animate-in slide-in-from-top-4 duration-300">
                          <h4 className="text-[10px] font-black uppercase text-zinc-450 tracking-wider mb-3 flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-indigo-500" /> Compliance Sign-Off Audit Dashboard
                          </h4>

                          {staffList.length === 0 ? (
                            <p className="text-xs text-zinc-500 font-semibold italic">No staff members in directory to audit.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              {staffList.map(st => {
                                const stDept = departments.find(d => d.id === st.departmentId)?.name || 'General';
                                const compStatus = getStaffComplianceForTemplate(tmpl, st.id);

                                return (
                                  <div key={st.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 rounded-2xl flex justify-between items-center text-xs">
                                    <div className="min-w-0">
                                      <p className="font-bold text-zinc-900 dark:text-white truncate">{st.name}</p>
                                      <p className="text-[10px] text-zinc-405 mt-0.5 uppercase tracking-wide">{stDept}</p>
                                    </div>
                                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border shrink-0 ml-2 ${compStatus.color}`}>
                                      {compStatus.label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* Subtab 3: History */}
          {subTab === 'history' && (
            completedRuns.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-4 shadow-sm mt-6">
                <CheckCircle2 className="w-12 h-12 text-zinc-400 dark:text-zinc-550 mx-auto" />
                <h3 className="text-base font-black text-zinc-900 dark:text-white uppercase tracking-wider">No Workflow History</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
                  No checklists have reached full completion yet. Once completed, audited timelines will display here.
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/50 dark:bg-zinc-950/40 border-b border-zinc-100 dark:border-zinc-850 text-[10px] font-black uppercase text-zinc-450 tracking-wider">
                      <th className="p-4 pl-6">Workflow Title</th>
                      <th className="p-4">Linked Job</th>
                      <th className="p-4">Started By</th>
                      <th className="p-4">Completed At</th>
                      <th className="p-4 pr-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850 text-xs font-semibold dark:text-zinc-300">
                    {completedRuns.map(run => {
                      const tmpl = templates.find(t => t.id === run.sopId);
                      const isExpanded = expandedHistoryId === run.id;
                      const linkedJob = activeJobs.find(j => j.id === run.linkedJobId);

                      return (
                        <React.Fragment key={run.id}>
                          <tr className="hover:bg-zinc-50/30 dark:hover:bg-zinc-900/30 transition-colors">
                            <td className="p-4 pl-6 font-bold text-zinc-900 dark:text-white">
                              {tmpl?.title || run.title}
                            </td>
                            <td className="p-4">
                              {linkedJob ? (
                                <button 
                                  onClick={() => navigate(`/business/${tenantId}/job/${run.linkedJobId}`)}
                                  className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                                >
                                  Job #{linkedJob.jobNo}
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              ) : (
                                <span className="text-zinc-500">None</span>
                              )}
                            </td>
                            <td className="p-4 text-zinc-550 dark:text-zinc-400">
                              {run.startedByName}
                            </td>
                            <td className="p-4 text-zinc-550 dark:text-zinc-400 font-mono text-[11px]">
                              {run.completedAt ? new Date(run.completedAt).toLocaleString() : 'N/A'}
                            </td>
                            <td className="p-4 pr-6 text-right">
                              <button
                                onClick={() => setExpandedHistoryId(isExpanded ? null : run.id!)}
                                className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ml-auto cursor-pointer"
                              >
                                {isExpanded ? 'Collapse' : 'Inspect'} 
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Step timeline log */}
                          {isExpanded && (
                            <tr className="bg-zinc-50/50 dark:bg-zinc-950/20">
                              <td colSpan={5} className="p-6 pl-12 pr-12 border-t border-b border-zinc-150 dark:border-zinc-850">
                                <div className="space-y-4">
                                  <h4 className="text-[10px] font-black uppercase text-zinc-450 tracking-wider">Completed Steps Timeline Checklist</h4>
                                  <div className="relative border-l border-zinc-200 dark:border-zinc-800 ml-2 pl-6 space-y-5">
                                    {run.history?.map((hist, hIdx) => (
                                      <div key={hIdx} className="relative">
                                        <div className="absolute -left-9 top-0.5 w-6 h-6 rounded-full bg-emerald-500/10 border-2 border-emerald-500 text-emerald-505 dark:bg-zinc-950 flex items-center justify-center">
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="space-y-1">
                                          <div className="flex justify-between items-center text-[11px] font-bold text-zinc-800 dark:text-zinc-200 uppercase">
                                            <span>{hist.title}</span>
                                            <span className="font-mono text-[9px] text-zinc-405 font-normal">{new Date(hist.completedAt).toLocaleString()}</span>
                                          </div>
                                          <p className="text-[10px] text-zinc-450">
                                            Signed by: <strong>{hist.completedByName}</strong>
                                          </p>
                                          {hist.choiceSelected && (
                                            <p className="text-[10px] font-bold text-amber-550">Choice path selected: "{hist.choiceSelected}"</p>
                                          )}
                                          {hist.inputsData && Object.keys(hist.inputsData).length > 0 && (
                                            <div className="mt-1.5 bg-white dark:bg-zinc-950 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 max-w-sm">
                                              <p className="text-[9px] font-black uppercase text-zinc-500 mb-1">Recorded Data:</p>
                                              <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
                                                {Object.entries(hist.inputsData).map(([l, v]) => (
                                                  <div key={l}>
                                                    <span className="text-zinc-500 font-bold">{l}:</span> <span className="text-indigo-400 font-bold">{String(v)}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
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
            )
          )}
        </div>
      )}

      {/* Start SOP Workflow Launcher Modal */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-xs select-none">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-lg font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-1.5">
                <Play className="w-5 h-5 text-emerald-500" /> Start Workflow Checklist
              </h3>
              <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold mt-1">
                Select a custom SOP template and optionally link it to a vehicle/job details ticket.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-extrabold uppercase text-zinc-500">Choose SOP Template</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-500 dark:text-white cursor-pointer"
                >
                  <option value="">-- Choose Template --</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.title} (v{t.version || 1} • {t.steps?.length || 0} steps)</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-extrabold uppercase text-zinc-500">Link to Vehicle Job (Optional)</label>
                <select
                  value={linkedJobId}
                  onChange={(e) => setLinkedJobId(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-500 dark:text-white cursor-pointer"
                >
                  <option value="">-- No Linked Job --</option>
                  {activeJobs.map(job => (
                    <option key={job.id} value={job.id}>
                      Job #{job.jobNo} - {job.vehicleName} ({job.customerName})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-3">
              <button
                onClick={() => {
                  setShowStartModal(false);
                  setSelectedTemplateId('');
                  setLinkedJobId('');
                }}
                className="flex-1 py-2.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-xl text-xs font-black uppercase tracking-wider text-zinc-500 cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                disabled={!selectedTemplateId}
                onClick={handleStartWorkflow}
                className="flex-1 py-2.5 bg-indigo-650 hover:bg-indigo-755 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-600/15 cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <PlusCircle className="w-4 h-4" /> Start Run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default SOPCenter;
