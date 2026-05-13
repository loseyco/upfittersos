import { useState, useEffect } from 'react';
import { X, CheckSquare } from 'lucide-react';
import { doc, getDoc, collection, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { toast } from 'sonner';

interface TaskTemplateModalProps {
  tenantId: string;
  templateId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function TaskTemplateModal({ tenantId, templateId, onClose, onSuccess }: TaskTemplateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [partsNeeded, setPartsNeeded] = useState('');
  const [instructions, setInstructions] = useState('');
  const [defaultBookTime, setDefaultBookTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(!!templateId);

  useEffect(() => {
    if (!templateId) return;
    const fetchTemplate = async () => {
      try {
        const docSnap = await getDoc(doc(db, `businesses/${tenantId}/tasks`, templateId));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setName(data.name || '');
          setDescription(data.description || '');
          setPartsNeeded(data.partsNeeded || '');
          setInstructions(data.instructions || '');
          setDefaultBookTime(data.defaultBookTime?.toString() || '');
        }
      } catch (err) {
        console.error('Error fetching template:', err);
        toast.error('Failed to load template details');
      } finally {
        setIsLoading(false);
      }
    };
    fetchTemplate();
  }, [templateId, tenantId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Task Name is required');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const templateData = {
        name: name.trim(),
        description: description.trim(),
        partsNeeded: partsNeeded.trim(),
        instructions: instructions.trim(),
        defaultBookTime: Number(defaultBookTime) || 0,
        updatedAt: serverTimestamp(),
      };

      if (templateId) {
        await updateDoc(doc(db, `businesses/${tenantId}/tasks`, templateId), templateData);
        toast.success('Task template updated');
      } else {
        await addDoc(collection(db, `businesses/${tenantId}/tasks`), {
          ...templateData,
          createdAt: serverTimestamp()
        });
        toast.success('Task template created');
      }
      onSuccess();
    } catch (err) {
      console.error('Error saving template:', err);
      toast.error('Failed to save template');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50 shrink-0">
          <h2 className="text-lg font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
            <CheckSquare className="w-5 h-5 text-indigo-500" />
            {templateId ? 'Edit Task Template' : 'Add Task Template'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-zinc-500">Loading...</div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-3">
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Task Name *</label>
                <input 
                  type="text" 
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="e.g. Install Front Bumper"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Book Time (h)</label>
                <input 
                  type="number" 
                  step="0.1"
                  min="0"
                  value={defaultBookTime}
                  onChange={(e) => setDefaultBookTime(e.target.value)}
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="e.g. 1.5"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Brief Description</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none h-20"
                placeholder="What is the goal of this task?"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Parts & Materials Needed</label>
              <textarea 
                value={partsNeeded}
                onChange={(e) => setPartsNeeded(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none h-20"
                placeholder="List required parts here (e.g. Bumper assembly, 4x M8 bolts...)"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Standard Operating Procedure (SOP) / Instructions</label>
              <textarea 
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none h-40"
                placeholder="Step 1: ...&#10;Step 2: ..."
              />
            </div>

            <div className="pt-4 flex gap-3">
              <button 
                type="button" 
                onClick={onClose} 
                className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
