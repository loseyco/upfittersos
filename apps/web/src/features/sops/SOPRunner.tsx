import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc, updateDoc, collection, getDocs, query as fsQuery, where } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { 
  ArrowLeft, CheckCircle2, Clock, User, ShieldAlert,
  ArrowRight, ExternalLink, CheckSquare, RefreshCw
} from 'lucide-react';
import type { SOPRun, SOPStep } from './sopsData';
import { useNavigate } from 'react-router-dom';

interface SOPRunnerProps {
  tenantId: string;
  runId: string;
  onBack: () => void;
}

export function SOPRunner({ tenantId, runId, onBack }: SOPRunnerProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [selectedChoice, setSelectedChoice] = useState<string>('');
  const [inputsData, setInputsData] = useState<Record<string, any>>({});
  const [inputErrors, setInputErrors] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch Current Staff Member details
  const { data: currentStaff } = useQuery({
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

  // Fetch Active SOP Run details
  const { data: run, refetch: refetchRun } = useQuery({
    queryKey: ['sop-run', tenantId, runId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, `businesses/${tenantId}/sop_runs`, runId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as SOPRun;
    }
  });

  // Fetch Original SOP Template to get steps definition
  const { data: template } = useQuery({
    queryKey: ['sop-template', tenantId, run?.sopId],
    queryFn: async () => {
      if (!run?.sopId) return null;
      const snap = await getDoc(doc(db, `businesses/${tenantId}/sops`, run.sopId));
      if (!snap.exists()) return null;
      return snap.data() as { title: string; steps: SOPStep[] };
    },
    enabled: !!run?.sopId
  });

  // Fetch Linked Job if any
  const { data: linkedJob } = useQuery({
    queryKey: ['run-linked-job', tenantId, run?.linkedJobId],
    queryFn: async () => {
      if (!run?.linkedJobId) return null;
      const snap = await getDoc(doc(db, `businesses/${tenantId}/jobs`, run.linkedJobId));
      return snap.exists() ? { id: snap.id, ...snap.data() } as any : null;
    },
    enabled: !!run?.linkedJobId
  });

  // Fetch all departments for label mapping
  const { data: departments = [] } = useQuery({
    queryKey: ['runner-departments', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/departments`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as { id: string; name: string });
    }
  });

  // Fetch all staff for label mapping
  const { data: staffList = [] } = useQuery({
    queryKey: ['runner-staff', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as any);
      return list.filter((s: any) => s.isArchived !== true && !s.fireDate) as { id: string; name: string }[];
    }
  });

  if (!run || !template) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <span className="text-sm font-bold text-zinc-550">Loading workflow execution...</span>
      </div>
    );
  }

  const steps = template.steps;
  const currentStepIndex = steps.findIndex(s => s.id === run.currentStepId);
  const currentStep = steps[currentStepIndex] || steps[0];

  // Resolve Assignee name for display
  const getAssigneeLabel = (step: SOPStep) => {
    if (step.assigneeType === 'anyone') return 'Anyone (Public)';
    if (step.assigneeType === 'department') {
      const d = departments.find(dept => dept.id === step.assignedDepartmentId);
      return d ? `${d.name} Department` : 'Specific Department';
    }
    const s = staffList.find(st => st.id === step.assignedStaffId);
    return s ? `${s.name} (Staff)` : 'Specific Staff Member';
  };

  // Check Gating Permissions
  const canExecute = () => {
    if (!currentStaff) return false;
    if (currentStep.assigneeType === 'anyone') return true;
    if (currentStep.assigneeType === 'department') {
      return currentStaff.departmentId === currentStep.assignedDepartmentId;
    }
    if (currentStep.assigneeType === 'staff') {
      return currentStaff.id === currentStep.assignedStaffId;
    }
    return false;
  };

  const handleInputChange = (fieldLabel: string, val: any) => {
    setInputsData(prev => ({ ...prev, [fieldLabel]: val }));
    setInputErrors(prev => ({ ...prev, [fieldLabel]: false }));
  };

  const handleSubmitStep = async () => {
    if (!canExecute() || isSubmitting) return;

    // Validate inputs if this is an input step
    if (currentStep.type === 'input' && currentStep.inputs) {
      const errors: Record<string, boolean> = {};
      let hasError = false;
      for (const input of currentStep.inputs) {
        if (input.required) {
          const val = inputsData[input.label];
          if (val === undefined || val === null || val === '' || val === false) {
            errors[input.label] = true;
            hasError = true;
          }
        }
      }
      if (hasError) {
        setInputErrors(errors);
        return;
      }
    }

    // Validate choice if this is conditional
    if (currentStep.type === 'conditional' && !selectedChoice) {
      alert('Please select an option before continuing.');
      return;
    }

    setIsSubmitting(true);

    try {
      const userName = currentStaff?.name || user?.email || 'Unknown Tech';
      
      const newHistoryItem = {
        stepId: currentStep.id,
        title: currentStep.title,
        completedAt: Date.now(),
        completedBy: currentStaff?.id || user?.uid || 'unknown',
        completedByName: userName,
        choiceSelected: currentStep.type === 'conditional' ? selectedChoice : undefined,
        inputsData: currentStep.type === 'input' ? inputsData : undefined
      };

      const updatedHistory = [...(run.history || []), newHistoryItem];

      // Resolve Next Step ID
      let nextStepId = '';
      if (currentStep.type === 'conditional') {
        const choice = currentStep.choices?.find(c => c.label === selectedChoice);
        if (choice) {
          if (choice.nextStepId === 'next_index') {
            const nextStep = steps[currentStepIndex + 1];
            nextStepId = nextStep ? nextStep.id : 'end_workflow';
          } else {
            nextStepId = choice.nextStepId;
          }
        }
      } else {
        const nextStep = steps[currentStepIndex + 1];
        nextStepId = nextStep ? nextStep.id : 'end_workflow';
      }

      const isCompleted = nextStepId === 'end_workflow' || nextStepId === 'end';
      
      const updatePayload: Partial<SOPRun> = {
        history: updatedHistory,
        currentStepId: isCompleted ? 'completed' : nextStepId,
        status: isCompleted ? 'completed' : 'active',
        completedAt: isCompleted ? Date.now() : undefined
      };

      await updateDoc(doc(db, `businesses/${tenantId}/sop_runs`, runId), updatePayload as any);

      // Reset local state
      setSelectedChoice('');
      setInputsData({});
      refetchRun();
    } catch (err) {
      console.error('Error advancing workflow step:', err);
      alert('Failed to save step to database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isUserAssignee = canExecute();

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-850 text-zinc-500 rounded-xl transition-all cursor-pointer active:scale-95"
            title="Back to all workflows"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
              {template.title}
            </h1>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              Active Workflow Execution • <Clock className="w-3.5 h-3.5" /> Started {new Date(run.startedAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {linkedJob && (
          <button
            onClick={() => navigate(`/business/${tenantId}/job/${run.linkedJobId}`)}
            className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-850 dark:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            Linked Job: #{linkedJob.jobNo || linkedJob.job_Number || 'View'}
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Main Execution Card */}
      {run.status === 'active' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Instructions Box */}
          <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl space-y-4 shadow-sm">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 dark:bg-indigo-500/20 px-3 py-1 rounded-full">
                Step {currentStepIndex + 1} of {steps.length}
              </span>
              <span className="text-xs font-bold text-zinc-400 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-zinc-500" /> Assignee: {getAssigneeLabel(currentStep)}
              </span>
            </div>

            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight leading-snug">
              {currentStep.title}
            </h2>

            <div className="text-sm text-zinc-600 dark:text-zinc-350 leading-relaxed font-semibold bg-zinc-50/50 dark:bg-zinc-950/20 p-4 rounded-2xl border border-zinc-150 dark:border-zinc-850 whitespace-pre-wrap">
              {currentStep.instructions}
            </div>
          </div>

          {/* Form Actions Box */}
          <div className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl space-y-4 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
              Sign-Off Control
            </h3>

            {isUserAssignee ? (
              <div className="space-y-4">
                {/* Standard step type */}
                {currentStep.type === 'standard' && (
                  <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl text-center space-y-2 select-none">
                    <CheckSquare className="w-10 h-10 text-emerald-500 mx-auto animate-pulse" />
                    <p className="text-xs font-bold text-zinc-650 dark:text-zinc-350 leading-relaxed">
                      Confirm you have read the instructions and completed the required task.
                    </p>
                  </div>
                )}

                {/* Conditional Branching step type */}
                {currentStep.type === 'conditional' && (
                  <div className="space-y-2.5">
                    <label className="text-xs font-extrabold uppercase text-zinc-500 block">Select the correct routing path:</label>
                    <div className="space-y-2">
                      {currentStep.choices?.map((choice, idx) => (
                        <label 
                          key={idx}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            selectedChoice === choice.label 
                              ? 'bg-indigo-50/50 dark:bg-indigo-950/25 border-indigo-500 text-indigo-650 dark:text-indigo-400' 
                              : 'bg-zinc-50/50 dark:bg-zinc-950/20 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100/40'
                          }`}
                        >
                          <input 
                            type="radio" 
                            name="sop_choice"
                            checked={selectedChoice === choice.label}
                            onChange={() => setSelectedChoice(choice.label)}
                            className="w-4 h-4 text-indigo-600 cursor-pointer"
                          />
                          <span className="text-xs font-bold">{choice.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data Input step type */}
                {currentStep.type === 'input' && (
                  <div className="space-y-3">
                    <label className="text-xs font-extrabold uppercase text-zinc-500 block">Provide Required Information:</label>
                    {currentStep.inputs?.map((input, idx) => (
                      <div key={idx} className="space-y-1">
                        <label className="text-[10px] font-extrabold uppercase text-zinc-450">
                          {input.label} {input.required && <span className="text-rose-500 font-bold">*</span>}
                        </label>
                        
                        {input.type === 'text' && (
                          <input 
                            type="text" 
                            value={inputsData[input.label] || ''}
                            onChange={(e) => handleInputChange(input.label, e.target.value)}
                            placeholder="Type answer..."
                            className={`w-full bg-zinc-50 dark:bg-zinc-950 border rounded-xl p-2.5 text-xs text-white focus:outline-none ${
                              inputErrors[input.label] ? 'border-rose-500' : 'border-zinc-200 dark:border-zinc-800 focus:border-indigo-500'
                            }`}
                          />
                        )}

                        {input.type === 'date' && (
                          <input 
                            type="date" 
                            value={inputsData[input.label] || ''}
                            onChange={(e) => handleInputChange(input.label, e.target.value)}
                            className={`w-full bg-zinc-50 dark:bg-zinc-950 border rounded-xl p-2.5 text-xs focus:outline-none dark:text-white cursor-pointer ${
                              inputErrors[input.label] ? 'border-rose-500' : 'border-zinc-200 dark:border-zinc-800 focus:border-indigo-500'
                            }`}
                          />
                        )}

                        {input.type === 'checkbox' && (
                          <label className="flex items-center gap-2.5 p-2 bg-zinc-50/50 dark:bg-zinc-950/20 border border-zinc-200 dark:border-zinc-800 rounded-xl cursor-pointer select-none">
                            <input 
                              type="checkbox" 
                              checked={!!inputsData[input.label]}
                              onChange={(e) => handleInputChange(input.label, e.target.checked)}
                              className="w-4 h-4 rounded text-indigo-650 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Mark Completed / True</span>
                          </label>
                        )}
                        {inputErrors[input.label] && (
                          <span className="text-[9px] font-bold text-rose-500 uppercase tracking-wide">This field is required.</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  disabled={isSubmitting}
                  onClick={handleSubmitStep}
                  className="w-full py-3 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-600/15 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  Confirm & Advance <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col items-center text-center space-y-3">
                <div className="w-12 h-12 bg-rose-500/10 text-rose-550 border border-rose-500/20 rounded-full flex items-center justify-center shadow-inner">
                  <ShieldAlert className="w-6 h-6 text-rose-500 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider">Access Restricted</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
                    This step is assigned to <strong className="text-indigo-600 dark:text-indigo-400">{getAssigneeLabel(currentStep)}</strong>. You are currently logged in as {currentStaff?.name || user?.email || 'Guest'}.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Completion Screen */
        <div className="flex flex-col items-center justify-center text-center py-12 px-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-sm max-w-2xl mx-auto space-y-6">
          <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/5">
            <CheckCircle2 className="w-10 h-10 animate-bounce" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">Workflow Completed!</h2>
            <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
              All steps in the procedure have been completed and audited. The workflow results are recorded in the history log.
            </p>
          </div>

          <button
            onClick={onBack}
            className="px-6 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-650/15 transition-all cursor-pointer active:scale-95"
          >
            Back to SOP Center
          </button>
        </div>
      )}

      {/* History Timeline */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl space-y-4 shadow-sm">
        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
          Workflow Audit Log / Timeline
        </h3>

        {(!run.history || run.history.length === 0) ? (
          <div className="text-center py-6 text-zinc-550 text-xs font-semibold">
            No steps have been completed yet. Timeline is empty.
          </div>
        ) : (
          <div className="relative border-l border-zinc-150 dark:border-zinc-800 ml-4 pl-6 space-y-6">
            {run.history.map((hist, idx) => (
              <div key={idx} className="relative">
                {/* Timeline Dot */}
                <div className="absolute -left-9 top-1 w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-500 border-2 border-emerald-550 dark:bg-zinc-950 flex items-center justify-center z-10">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>

                <div className="space-y-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">{hist.title}</h4>
                    <span className="text-[9px] font-mono text-zinc-400">
                      {new Date(hist.completedAt).toLocaleString()}
                    </span>
                  </div>
                  
                  <p className="text-[10px] text-zinc-550 dark:text-zinc-400 font-semibold">
                    Completed by: <strong className="text-zinc-800 dark:text-zinc-200">{hist.completedByName}</strong>
                  </p>

                  {/* Choice Selected */}
                  {hist.choiceSelected && (
                    <div className="mt-1">
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded border bg-amber-500/10 text-amber-550 border-amber-500/20">
                        Selected: {hist.choiceSelected}
                      </span>
                    </div>
                  )}

                  {/* Inputs Captured */}
                  {hist.inputsData && Object.keys(hist.inputsData).length > 0 && (
                    <div className="mt-2 bg-zinc-50 dark:bg-zinc-950 p-2 rounded-lg border border-zinc-150 dark:border-zinc-850 max-w-md">
                      <p className="text-[9px] font-black uppercase text-zinc-450 tracking-wider mb-1">Captured Data:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] font-mono">
                        {Object.entries(hist.inputsData).map(([label, val]) => (
                          <div key={label} className="truncate">
                            <span className="text-zinc-500 font-bold">{label}:</span> <span className="text-indigo-400 font-extrabold">{String(val)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
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
export default SOPRunner;
