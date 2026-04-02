import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Workflow, Lightbulb, Star, Bug, AlertTriangle, ArrowUp, ArrowDown, Minus, Trash2, Edit2, Plus } from 'lucide-react';

const getTypeIcon = (t: string) => {
    switch (t) {
        case 'bug': return <Bug className="w-3.5 h-3.5 text-red-400" />;
        case 'feature': return <Star className="w-3.5 h-3.5 text-accent" />;
        case 'workflow': return <Workflow className="w-3.5 h-3.5 text-blue-400" />;
        default: return <Lightbulb className="w-3.5 h-3.5 text-amber-400" />;
    }
};

const getPriorityIcon = (p?: string) => {
    switch (p) {
        case 'urgent': return <AlertTriangle className="w-3 h-3 text-red-500" />;
        case 'high': return <ArrowUp className="w-3 h-3 text-orange-400" />;
        case 'low': return <ArrowDown className="w-3 h-3 text-zinc-500" />;
        default: return <Minus className="w-3 h-3 text-zinc-400" />;
    }
};

const getPriorityColor = (p?: string) => {
    switch (p) {
        case 'urgent': return 'text-red-500 border-red-500/30 bg-red-500/10';
        case 'high': return 'text-orange-400 border-orange-500/30 bg-orange-500/10';
        case 'low': return 'text-zinc-500 border-zinc-700 bg-zinc-800/50';
        default: return 'text-zinc-400 border-zinc-700 bg-zinc-800/80';
    }
};

export const IdeaNode = memo(({ id, data, selected }: any) => {
    // Scaffold default output if the array is missing so old nodes still function correctly
    const outputs = data.outputs || [{ id: 'default', label: 'Next' }];

    return (
        <div className={`w-[240px] bg-zinc-900/90 backdrop-blur-md border-2 rounded-xl flex flex-col shadow-xl transition-colors group ${
            selected ? 'border-accent shadow-accent/20' : 'border-zinc-700 hover:border-zinc-500'
        }`}>
            {/* Universal Target handle (The receiver) */}
            <Handle 
                type="target" 
                position={Position.Left} 
                id="target" 
                className="!w-4 !h-6 !-ml-[10px] !rounded !border-2 !border-zinc-900 !bg-zinc-400 hover:!bg-white cursor-crosshair transition-colors" 
                style={{ top: '24px' }}
            />
            
            {/* Node Header and Core Content */}
            <div className="p-3 pb-2 flex-1">
                <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-1.5">
                        <div className="p-1 rounded bg-zinc-800/80 border border-zinc-700">
                            {getTypeIcon(data.type || 'idea')}
                        </div>
                        <div className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border flex items-center gap-1 ${getPriorityColor(data.priority || 'normal')}`}>
                            {getPriorityIcon(data.priority || 'normal')}
                            {data.priority || 'normal'}
                        </div>
                    </div>
                    
                    {/* Node Actions */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        {data.onEdit && (
                            <button onClick={(e) => { e.stopPropagation(); data.onEdit(id); }} className="text-zinc-500 hover:text-blue-400 transition-colors p-1 bg-zinc-800 rounded">
                                <Edit2 className="w-3 h-3" />
                            </button>
                        )}
                        {data.onDelete && (
                            <button onClick={(e) => { e.stopPropagation(); data.onDelete(id); }} className="text-zinc-500 hover:text-red-400 transition-colors p-1 bg-zinc-800 rounded">
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="font-bold text-white text-sm leading-tight mb-1">{data.label}</div>
                
                {data.description && (
                    <div className="text-xs text-zinc-400 line-clamp-2 mt-1 whitespace-pre-wrap leading-relaxed">
                        {data.description}
                    </div>
                )}
            </div>

            {/* Dynamic Output Pins (Blueprint Logic Engine) */}
            <div className="bg-zinc-950/50 rounded-b-xl border-t border-zinc-800 mt-1 flex flex-col py-1">
                {outputs.map((out: any) => (
                    <div key={out.id} className="relative flex justify-end items-center h-8 group/pin px-2 hover:bg-zinc-800/50 transition-colors">
                        <div className="flex items-center gap-2 flex-1 pl-1">
                            {data.onDeleteOutput && outputs.length > 1 && (
                                <button 
                                    className="opacity-0 group-hover/pin:opacity-100 text-zinc-600 hover:text-red-400 transition-all p-0.5"
                                    onClick={(e) => { e.stopPropagation(); data.onDeleteOutput(id, out.id); }}
                                    title="Delete Route"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            )}
                            {data.onEditOutput && (
                                <button 
                                    className="opacity-0 group-hover/pin:opacity-100 text-zinc-600 hover:text-blue-400 transition-all p-0.5"
                                    onClick={(e) => { e.stopPropagation(); data.onEditOutput(id, out.id, out.label); }}
                                    title="Edit Logic Requirement"
                                >
                                    <Edit2 className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                        
                        <span className="text-[11px] uppercase tracking-wider text-zinc-300 font-bold mr-4 pointer-events-none">{out.label}</span>
                        
                        {/* The Actual Source Handle corresponding to this outcome */}
                        <Handle 
                            type="source" 
                            position={Position.Right} 
                            id={out.id} 
                            className="!w-4 !h-4 !-mr-[10px] !border-2 !border-zinc-900 !bg-accent hover:!bg-accent-hover cursor-crosshair transition-colors" 
                            style={{ top: '50%', transform: 'translateY(-50%)' }}
                        />
                    </div>
                ))}

                {/* Add Route Button */}
                {data.onAddOutput && (
                    <div className="flex justify-end pr-[22px] pt-1 pb-1">
                        <button 
                            className="w-4 h-4 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-500 hover:text-green-400 hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100"
                            onClick={(e) => { e.stopPropagation(); data.onAddOutput(id); }}
                            title="Add Blueprint Route"
                        >
                            <Plus className="w-3 h-3" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});
