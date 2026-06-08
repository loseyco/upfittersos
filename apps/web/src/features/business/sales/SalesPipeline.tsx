import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase/config';
import { 
  User, Calendar, X, Tag,
  ChevronLeft, ChevronRight, AlertCircle, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

interface SalesPipelineProps {
  tenantId: string;
  prospects: any[];
  staffList: any[];
  onUpdate: () => void;
}

const STAGES = [
  { id: 'lead', label: 'Lead In', color: 'border-zinc-400 text-zinc-400 bg-zinc-400/5 hover:bg-zinc-400/10' },
  { id: 'contacted', label: 'Contacted', color: 'border-sky-500 text-sky-400 bg-sky-500/5 hover:bg-sky-500/10' },
  { id: 'meeting', label: 'Meeting Scheduled', color: 'border-indigo-500 text-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10' },
  { id: 'proposal', label: 'Proposal Sent', color: 'border-yellow-500 text-yellow-400 bg-yellow-500/5 hover:bg-yellow-500/10' },
  { id: 'negotiation', label: 'Negotiation', color: 'border-orange-500 text-orange-400 bg-orange-500/5 hover:bg-orange-500/10' },
  { id: 'won', label: 'Won', color: 'border-emerald-500 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10' },
  { id: 'lost', label: 'Lost', color: 'border-rose-500 text-rose-450 bg-rose-500/5 hover:bg-rose-500/10' }
] as const;

type StageId = typeof STAGES[number]['id'];

export function SalesPipeline({ tenantId, prospects, onUpdate }: SalesPipelineProps) {
  
  // Group prospects by stage
  const prospectsByStage = STAGES.reduce((acc, stage) => {
    acc[stage.id] = prospects.filter(p => p.status === stage.id);
    return acc;
  }, {} as Record<StageId, any[]>);

  // Update prospect status in Firestore
  const updateProspectStatus = async (prospectId: string, newStatus: StageId) => {
    try {
      const updates: any = {
        status: newStatus,
        updatedAt: serverTimestamp()
      };

      if (newStatus === 'won') {
        updates.wonAt = serverTimestamp();
      } else if (newStatus === 'lost') {
        updates.lostAt = serverTimestamp();
      }

      await updateDoc(doc(db, `businesses/${tenantId}/sales_prospects`, prospectId), updates);
      toast.success(`Prospect status updated to ${newStatus.toUpperCase()}`);
      onUpdate();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update stage');
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, prospectId: string) => {
    e.dataTransfer.setData('text/plain', prospectId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStage: StageId) => {
    e.preventDefault();
    const prospectId = e.dataTransfer.getData('text/plain');
    if (prospectId) {
      await updateProspectStatus(prospectId, targetStage);
    }
  };

  // Calculate days in pipeline
  const getDaysInPipeline = (createdAt: any) => {
    if (!createdAt) return '0 days';
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const diffTime = Math.abs(new Date().getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'}`;
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-6 pt-2 scrollbar-thin select-none">
      {STAGES.map((stage) => {
        const stageProspects = prospectsByStage[stage.id] || [];
        const totalValue = stageProspects.reduce((sum, p) => sum + (p.value || 0), 0);

        return (
          <div 
            key={stage.id}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, stage.id)}
            className="flex-1 min-w-[280px] max-w-[320px] flex flex-col bg-zinc-100/60 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shrink-0 transition-all"
          >
            {/* Stage Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 border text-[10px] font-black uppercase tracking-wider rounded-md ${stage.color}`}>
                  {stage.label}
                </span>
                <span className="text-[10px] font-bold text-zinc-450 dark:text-zinc-500">
                  {stageProspects.length}
                </span>
              </div>
              <span className="text-xs font-black text-zinc-600 dark:text-zinc-400 font-mono">
                ${totalValue.toLocaleString()}
              </span>
            </div>

            {/* Stage Cards Container */}
            <div className="flex-1 space-y-3 min-h-[50vh] overflow-y-auto no-scrollbar py-1">
              {stageProspects.length > 0 ? (
                stageProspects.map((prospect) => {
                  const daysInPipeline = getDaysInPipeline(prospect.createdAt);

                  return (
                    <div 
                      key={prospect.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, prospect.id)}
                      className={`
                        bg-white dark:bg-zinc-900 border rounded-2xl p-4 shadow-sm relative group cursor-grab active:cursor-grabbing transition-all hover:scale-[1.01] hover:shadow-md
                        ${stage.id === 'won' ? 'border-emerald-500/20 hover:border-emerald-500/45 dark:bg-emerald-950/5' : ''}
                        ${stage.id === 'lost' ? 'border-rose-500/20 hover:border-rose-500/40 dark:bg-rose-950/5' : 'border-zinc-200 dark:border-zinc-800'}
                      `}
                    >
                      {/* Ribbon Indicators */}
                      {stage.id === 'won' && (
                        <div className="absolute top-3 right-3 p-1 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-md border border-emerald-500/20">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                        </div>
                      )}
                      {stage.id === 'lost' && (
                        <div className="absolute top-3 right-3 p-1 bg-rose-500/10 dark:bg-rose-500/20 rounded-md border border-rose-500/20">
                          <X className="w-3.5 h-3.5 text-rose-500" />
                        </div>
                      )}

                      {/* Card Content */}
                      <h4 className="font-bold text-sm text-zinc-900 dark:text-white leading-tight pr-6 mb-1 truncate" title={prospect.name}>
                        {prospect.name}
                      </h4>

                      {prospect.contactPerson && (
                        <p className="text-[11px] font-medium text-zinc-450 dark:text-zinc-500 mb-3 truncate">
                          {prospect.contactPerson}
                        </p>
                      )}

                      {/* Tag list */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[9px] font-bold text-zinc-500 rounded-md uppercase">
                          <Tag className="w-2.5 h-2.5" />
                          {prospect.source}
                        </span>
                        {prospect.assignedToName && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[9px] font-bold text-zinc-500 rounded-md truncate max-w-[140px]">
                            <User className="w-2.5 h-2.5 text-indigo-400" />
                            {prospect.assignedToName.split(' ')[0]}
                          </span>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800/80 pt-3">
                        <span className="text-xs font-black text-zinc-700 dark:text-zinc-300 font-mono">
                          ${(prospect.value || 0).toLocaleString()}
                        </span>
                        
                        <div className="flex items-center gap-1">
                          {/* Navigation Controls for Mobile / Non-drag support */}
                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            {stage.id !== 'lead' && (
                              <button
                                onClick={() => {
                                  const idx = STAGES.findIndex(s => s.id === stage.id);
                                  if (idx > 0) updateProspectStatus(prospect.id, STAGES[idx - 1].id);
                                }}
                                className="p-1 text-zinc-450 hover:text-zinc-800 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {stage.id !== 'lost' && stage.id !== 'won' && (
                              <button
                                onClick={() => {
                                  const idx = STAGES.findIndex(s => s.id === stage.id);
                                  if (idx < STAGES.length - 1) updateProspectStatus(prospect.id, STAGES[idx + 1].id);
                                }}
                                className="p-1 text-zinc-450 hover:text-zinc-800 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <span className="text-[10px] font-bold text-zinc-400 flex items-center gap-1 font-mono">
                            <Calendar className="w-3 h-3" />
                            {daysInPipeline}
                          </span>
                        </div>
                      </div>

                    </div>
                  );
                })
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-4 text-center text-zinc-400 select-none bg-zinc-50/20 dark:bg-zinc-950/5">
                  <AlertCircle className="w-5 h-5 text-zinc-350 mb-1.5" />
                  <p className="text-[10px] font-bold uppercase tracking-wider">Empty Stage</p>
                </div>
              )}
            </div>

          </div>
        );
      })}
    </div>
  );
}
