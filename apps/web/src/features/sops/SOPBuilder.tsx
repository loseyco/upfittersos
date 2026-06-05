import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Plus, Trash2, Save, ArrowLeft, Split, Database, 
  ChevronDown, ChevronUp, AlertCircle 
} from 'lucide-react';
import type { SOPStep, SOPTemplate } from './sopsData';

interface SOPBuilderProps {
  tenantId: string;
  templateId?: string | null;
  initialTemplate?: SOPTemplate | null;
  onBack: () => void;
  onSaveSuccess: () => void;
}

export function SOPBuilder({ tenantId, templateId, initialTemplate, onBack, onSaveSuccess }: SOPBuilderProps) {
  const [title, setTitle] = useState(initialTemplate?.title || '');
  const [description, setDescription] = useState(initialTemplate?.description || '');
  const [category, setCategory] = useState<'company' | 'department'>(initialTemplate?.category || 'company');
  const [departmentId, setDepartmentId] = useState(initialTemplate?.departmentId || '');
  
  // Re-generate steps with unique IDs if editing
  const [steps, setSteps] = useState<SOPStep[]>(() => {
    if (initialTemplate?.steps && initialTemplate.steps.length > 0) {
      return initialTemplate.steps;
    }
    return [
      {
        id: 'step_1',
        title: 'Step 1: Intake Checklist',
        instructions: 'Initial walkaround of the vehicle to check it in.',
        type: 'standard',
        assigneeType: 'anyone'
      }
    ];
  });

  const [activeStepId, setActiveStepId] = useState<string>('step_1');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Fetch departments list
  const { data: departments = [] } = useQuery({
    queryKey: ['builder-departments', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/departments`));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as { id: string; name: string });
    }
  });

  // Fetch staff directory
  const { data: staffList = [] } = useQuery({
    queryKey: ['builder-staff', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as any);
      return list.filter((s: any) => s.isArchived !== true && !s.fireDate) as { id: string; name: string }[];
    }
  });

  const activeStep = steps.find(s => s.id === activeStepId) || steps[0];

  const handleUpdateStep = (updatedStep: SOPStep) => {
    setSteps(prev => prev.map(s => s.id === updatedStep.id ? updatedStep : s));
  };

  const handleAddStep = () => {
    const nextNum = steps.length + 1;
    const newId = `step_${Date.now()}`;
    const newStep: SOPStep = {
      id: newId,
      title: `Step ${nextNum}: New Instruction`,
      instructions: 'Enter instructions here...',
      type: 'standard',
      assigneeType: 'anyone'
    };
    setSteps(prev => [...prev, newStep]);
    setActiveStepId(newId);
  };

  const handleDeleteStep = (id: string) => {
    if (steps.length <= 1) {
      setValidationError('SOP must contain at least one step.');
      return;
    }
    const filtered = steps.filter(s => s.id !== id);
    setSteps(filtered);
    if (activeStepId === id) {
      setActiveStepId(filtered[0].id);
    }
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= steps.length) return;
    
    const nextSteps = [...steps];
    const temp = nextSteps[index];
    nextSteps[index] = nextSteps[nextIndex];
    nextSteps[nextIndex] = temp;
    setSteps(nextSteps);
  };

  const handleSave = async () => {
    setValidationError(null);
    if (!title.trim()) {
      setValidationError('Workflow title is required.');
      return;
    }
    if (category === 'department' && !departmentId) {
      setValidationError('Please select a department for this SOP.');
      return;
    }

    // Validate branching logic
    for (const step of steps) {
      if (step.type === 'conditional') {
        if (!step.choices || step.choices.length === 0) {
          setValidationError(`Conditional Step "${step.title}" must have at least one choice defined.`);
          return;
        }
        for (const choice of step.choices) {
          if (!choice.nextStepId) {
            setValidationError(`Please configure where choice "${choice.label}" in "${step.title}" routes to.`);
            return;
          }
        }
      }
      if (step.type === 'input') {
        if (!step.inputs || step.inputs.length === 0) {
          setValidationError(`Data Input Step "${step.title}" must have at least one field defined.`);
          return;
        }
        for (const input of step.inputs) {
          if (!input.label.trim()) {
            setValidationError(`Please name the inputs fields in step "${step.title}".`);
            return;
          }
        }
      }
    }

    const currentVersion = initialTemplate ? (initialTemplate.version || 1) + 1 : 1;

    const payload: SOPTemplate = {
      title: title.trim(),
      description: description.trim(),
      category,
      departmentId: category === 'department' ? departmentId : '',
      steps,
      version: currentVersion,
      createdAt: initialTemplate?.createdAt || Date.now()
    };

    try {
      if (templateId) {
        // Edit template
        await updateDoc(doc(db, `businesses/${tenantId}/sops`, templateId), payload as any);
      } else {
        // Create new template
        await addDoc(collection(db, `businesses/${tenantId}/sops`), payload);
      }
      onSaveSuccess();
    } catch (err) {
      console.error('Error saving SOP template:', err);
      setValidationError('Failed to save template to database. Please try again.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-850 text-zinc-500 rounded-xl transition-all cursor-pointer active:scale-95"
            title="Back to SOPs list"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
              {templateId ? 'Edit SOP Workflow' : 'Create Custom SOP Workflow'}
            </h1>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {templateId ? 'Modify existing operational checklist' : 'Build a new conditional procedure template'}
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="px-6 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-600/15 transition-all flex items-center gap-2 cursor-pointer active:scale-95 self-stretch sm:self-auto justify-center"
        >
          <Save className="w-4 h-4" /> Save Template
        </button>
      </div>

      {validationError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-550 text-xs font-semibold">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Main Settings Card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl space-y-4 shadow-sm">
        <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400">General Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-extrabold uppercase text-zinc-500">Workflow Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Vehicle Intake & Damage Mapping"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-500 dark:text-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-extrabold uppercase text-zinc-500">Categorization</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-500 dark:text-white cursor-pointer"
            >
              <option value="company">Company-wide</option>
              <option value="department">By Department</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-extrabold uppercase text-zinc-500">Description / Scope</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Mandatory steps for incoming customer vehicle intake"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-500 dark:text-white"
            />
          </div>

          {category === 'department' && (
            <div className="space-y-1 animate-in slide-in-from-top-2">
              <label className="text-xs font-extrabold uppercase text-zinc-500">Department Assignee</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-500 dark:text-white cursor-pointer"
              >
                <option value="">-- Choose Department --</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Steps Editor Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Timeline List */}
        <div className="lg:col-span-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-3xl space-y-4">
          <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <span className="text-sm font-black uppercase tracking-wider text-zinc-400">Step Outline</span>
            <button
              onClick={handleAddStep}
              className="p-1.5 bg-indigo-500/10 text-indigo-505 dark:text-indigo-400 hover:bg-indigo-650 hover:text-white rounded-lg transition-all text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Step
            </button>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 no-scrollbar">
            {steps.map((step, idx) => (
              <div 
                key={step.id} 
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex justify-between items-center ${
                  activeStepId === step.id 
                    ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-550 dark:border-indigo-500/50' 
                    : 'bg-zinc-50/40 dark:bg-zinc-950/20 border-zinc-200 dark:border-zinc-850 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/40'
                }`}
                onClick={() => setActiveStepId(step.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase bg-zinc-200 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">
                      {idx + 1}
                    </span>
                    <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded border ${
                      step.type === 'conditional' 
                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
                        : step.type === 'input' 
                          ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20' 
                          : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                    }`}>
                      {step.type}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-zinc-850 dark:text-white mt-1.5 truncate">{step.title}</p>
                </div>

                <div className="flex items-center gap-1.5 ml-2">
                  <button 
                    disabled={idx === 0}
                    onClick={(e) => { e.stopPropagation(); moveStep(idx, 'up'); }}
                    className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-400 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    disabled={idx === steps.length - 1}
                    onClick={(e) => { e.stopPropagation(); moveStep(idx, 'down'); }}
                    className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-400 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteStep(step.id); }}
                    className="p-1 hover:bg-rose-500/10 hover:text-rose-500 rounded text-zinc-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Step Config details */}
        <div className="lg:col-span-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl space-y-6">
          <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3 flex justify-between items-center">
            <span className="text-sm font-black uppercase tracking-wider text-zinc-450">Step Configuration</span>
            <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">Editing Mode</span>
          </div>

          {/* Title & Instructions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-extrabold uppercase text-zinc-500">Step Label / Header</label>
              <input
                type="text"
                value={activeStep.title}
                onChange={(e) => handleUpdateStep({ ...activeStep, title: e.target.value })}
                placeholder="e.g. Verify Customer Records"
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-500 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-extrabold uppercase text-zinc-500">Step Interaction Model</label>
              <select
                value={activeStep.type}
                onChange={(e) => handleUpdateStep({ 
                  ...activeStep, 
                  type: e.target.value as any,
                  choices: e.target.value === 'conditional' ? [{ label: 'Yes', nextStepId: '' }, { label: 'No', nextStepId: '' }] : undefined,
                  inputs: e.target.value === 'input' ? [{ label: 'Notes', type: 'text', required: true }] : undefined
                })}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-500 dark:text-white cursor-pointer"
              >
                <option value="standard">Standard Checkoff (Standard)</option>
                <option value="conditional">If-This-Then-That Branching (Conditional)</option>
                <option value="input">Data Capture Form (Input)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-extrabold uppercase text-zinc-500">Detailed Instructions for Staff</label>
            <textarea
              rows={3}
              value={activeStep.instructions}
              onChange={(e) => handleUpdateStep({ ...activeStep, instructions: e.target.value })}
              placeholder="e.g. Open the customer index worksheet, check for existing vehicle history..."
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-500 dark:text-white"
            />
          </div>

          {/* Assignee Config */}
          <div className="bg-zinc-50/50 dark:bg-zinc-950/40 p-4 rounded-2xl border border-zinc-150 dark:border-zinc-850 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Step Routing & Assignment</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold uppercase text-zinc-500">Who executes this step?</label>
                <select
                  value={activeStep.assigneeType}
                  onChange={(e) => handleUpdateStep({ 
                    ...activeStep, 
                    assigneeType: e.target.value as any,
                    assignedDepartmentId: '',
                    assignedStaffId: ''
                  })}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-500 dark:text-white cursor-pointer"
                >
                  <option value="anyone">Anyone (Public)</option>
                  <option value="department">Role / Department</option>
                  <option value="staff">Specific Staff Member</option>
                </select>
              </div>

              {activeStep.assigneeType === 'department' && (
                <div className="space-y-1 animate-in slide-in-from-top-2">
                  <label className="text-[10px] font-extrabold uppercase text-zinc-500">Select Department Role</label>
                  <select
                    value={activeStep.assignedDepartmentId || ''}
                    onChange={(e) => handleUpdateStep({ ...activeStep, assignedDepartmentId: e.target.value })}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-500 dark:text-white cursor-pointer"
                  >
                    <option value="">-- Choose Department --</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {activeStep.assigneeType === 'staff' && (
                <div className="space-y-1 animate-in slide-in-from-top-2">
                  <label className="text-[10px] font-extrabold uppercase text-zinc-500">Select Staff Member</label>
                  <select
                    value={activeStep.assignedStaffId || ''}
                    onChange={(e) => handleUpdateStep({ ...activeStep, assignedStaffId: e.target.value })}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-500 dark:text-white cursor-pointer"
                  >
                    <option value="">-- Choose Staff Member --</option>
                    {staffList.map(st => (
                      <option key={st.id} value={st.id}>{st.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Conditional Branching Controls */}
          {activeStep.type === 'conditional' && (
            <div className="bg-amber-500/5 dark:bg-amber-500/10 p-4 rounded-2xl border border-amber-500/20 space-y-4 animate-in slide-in-from-top-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black uppercase text-amber-500 tracking-wider flex items-center gap-1">
                  <Split className="w-4 h-4" /> Conditional Branching Paths
                </span>
                <button
                  onClick={() => {
                    const choices = activeStep.choices ? [...activeStep.choices] : [];
                    choices.push({ label: `Option ${choices.length + 1}`, nextStepId: '' });
                    handleUpdateStep({ ...activeStep, choices });
                  }}
                  className="px-2 py-1 bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-white transition-colors rounded-lg text-[10px] font-black uppercase cursor-pointer"
                >
                  + Add Path Choice
                </button>
              </div>

              <div className="space-y-2.5">
                {activeStep.choices?.map((choice: { label: string; nextStepId: string }, choiceIdx: number) => (
                  <div key={choiceIdx} className="flex flex-col sm:flex-row gap-3 items-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl">
                    <div className="w-full sm:flex-1 space-y-1">
                      <label className="text-[9px] font-extrabold uppercase text-zinc-500">User Choice Option Label</label>
                      <input
                        type="text"
                        value={choice.label}
                        onChange={(e) => {
                          const choices = [...(activeStep.choices || [])];
                          choices[choiceIdx].label = e.target.value;
                          handleUpdateStep({ ...activeStep, choices });
                        }}
                        placeholder="e.g. Yes"
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-xs focus:outline-none focus:border-indigo-555 dark:text-white"
                      />
                    </div>

                    <div className="w-full sm:flex-1 space-y-1">
                      <label className="text-[9px] font-extrabold uppercase text-zinc-500">Route to step</label>
                      <select
                        value={choice.nextStepId}
                        onChange={(e) => {
                          const choices = [...(activeStep.choices || [])];
                          choices[choiceIdx].nextStepId = e.target.value;
                          handleUpdateStep({ ...activeStep, choices });
                        }}
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-xs focus:outline-none focus:border-indigo-500 dark:text-white cursor-pointer"
                      >
                        <option value="">-- Choose Routing Target --</option>
                        <option value="next_index">(Go to next chronological step)</option>
                        <option value="end_workflow">Complete & End Workflow</option>
                        {steps.filter(s => s.id !== activeStep.id).map((otherStep, oIdx) => (
                          <option key={otherStep.id} value={otherStep.id}>
                            Step {oIdx + 1}: {otherStep.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={() => {
                        const choices = activeStep.choices?.filter((_, cIndex: number) => cIndex !== choiceIdx);
                        handleUpdateStep({ ...activeStep, choices });
                      }}
                      className="p-2 bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all cursor-pointer mt-3 sm:mt-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Data Inputs configuration */}
          {activeStep.type === 'input' && (
            <div className="bg-cyan-500/5 dark:bg-cyan-500/10 p-4 rounded-2xl border border-cyan-500/20 space-y-4 animate-in slide-in-from-top-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black uppercase text-cyan-500 tracking-wider flex items-center gap-1">
                  <Database className="w-4 h-4" /> Data Capture Fields
                </span>
                <button
                  onClick={() => {
                    const inputs = activeStep.inputs ? [...activeStep.inputs] : [];
                    inputs.push({ label: `Field Name ${inputs.length + 1}`, type: 'text', required: true });
                    handleUpdateStep({ ...activeStep, inputs });
                  }}
                  className="px-2 py-1 bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500 hover:text-white transition-colors rounded-lg text-[10px] font-black uppercase cursor-pointer"
                >
                  + Add Input Field
                </button>
              </div>

              <div className="space-y-2.5">
                {activeStep.inputs?.map((input: { label: string; type: 'text' | 'date' | 'checkbox'; required: boolean }, inpIdx: number) => (
                  <div key={inpIdx} className="flex flex-col sm:flex-row gap-3 items-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl">
                    <div className="w-full sm:flex-2 space-y-1">
                      <label className="text-[9px] font-extrabold uppercase text-zinc-500">Field Label / Question</label>
                      <input
                        type="text"
                        value={input.label}
                        onChange={(e) => {
                          const inputs = [...(activeStep.inputs || [])];
                          inputs[inpIdx].label = e.target.value;
                          handleUpdateStep({ ...activeStep, inputs });
                        }}
                        placeholder="e.g. CompanyCam Link"
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-xs focus:outline-none focus:border-indigo-500 dark:text-white"
                      />
                    </div>

                    <div className="w-full sm:flex-1 space-y-1">
                      <label className="text-[9px] font-extrabold uppercase text-zinc-500">Field Type</label>
                      <select
                        value={input.type}
                        onChange={(e) => {
                          const inputs = [...(activeStep.inputs || [])];
                          inputs[inpIdx].type = e.target.value as any;
                          handleUpdateStep({ ...activeStep, inputs });
                        }}
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-xs focus:outline-none focus:border-indigo-505 dark:text-white cursor-pointer"
                      >
                        <option value="text">Short Text</option>
                        <option value="date">Calendar Date</option>
                        <option value="checkbox">Toggle Box (Checkbox)</option>
                      </select>
                    </div>

                    <div className="w-full sm:w-auto flex items-center gap-2 mt-4 sm:mt-0 select-none">
                      <input
                        type="checkbox"
                        id={`req_${inpIdx}`}
                        checked={input.required}
                        onChange={(e) => {
                          const inputs = [...(activeStep.inputs || [])];
                          inputs[inpIdx].required = e.target.checked;
                          handleUpdateStep({ ...activeStep, inputs });
                        }}
                        className="w-4 h-4 rounded text-indigo-650 cursor-pointer"
                      />
                      <label htmlFor={`req_${inpIdx}`} className="text-[10px] font-extrabold uppercase text-zinc-550 cursor-pointer">
                        Required
                      </label>
                    </div>

                    <button
                      onClick={() => {
                        const inputs = activeStep.inputs?.filter((_, iIndex: number) => iIndex !== inpIdx);
                        handleUpdateStep({ ...activeStep, inputs });
                      }}
                      className="p-2 bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all cursor-pointer mt-3 sm:mt-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default SOPBuilder;
