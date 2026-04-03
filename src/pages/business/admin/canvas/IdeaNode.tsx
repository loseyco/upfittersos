import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, NodeResizer } from '@xyflow/react';
import { Workflow, Lightbulb, Star, Bug, AlertTriangle, ArrowUp, ArrowDown, Minus, Trash2, Edit2, Plus, GripVertical, ChevronUp, ChevronDown, Palette } from 'lucide-react';

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

const STANDARD_COLORS = [
    { bg: '#3f3f46', name: 'Neutral' },
    { bg: '#0ea5e9', name: 'Blue' },
    { bg: '#ef4444', name: 'Red' },
    { bg: '#f59e0b', name: 'Amber' },
    { bg: '#10b981', name: 'Green' },
    { bg: '#8b5cf6', name: 'Purple' },
    { bg: '#ec4899', name: 'Pink' },
];

export const IdeaNode = memo(({ id, data, selected }: any) => {
    const outputs = (data.outputs as any[]) || [{ id: 'default', label: 'Next' }];
    const updateNodeInternals = useUpdateNodeInternals();

    useEffect(() => {
        // Violently force React Flow to recalculate its hidden spatial geometry bounds whenever the output array morphs.
        // If this isn't called, the wires will stay pinned to their old phantom visual coordinates after handles reorder.
        updateNodeInternals(id);
    }, [outputs, id, updateNodeInternals]);

    const [editingOutputId, setEditingOutputId] = useState<string | null>(null);
    const [addingNew, setAddingNew] = useState(false);
    const [tempValue, setTempValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const [draggedOutputId, setDraggedOutputId] = useState<string | null>(null);

    // Auto-focus dynamic inputs
    useEffect(() => {
        if ((editingOutputId || addingNew) && inputRef.current) {
            inputRef.current.focus();
        }
    }, [editingOutputId, addingNew]);

    // HTML-5 Native Array Drag/Drop Resorting (Bound to outputs via GripVertical handlers)
    const handleDragStart = (e: React.DragEvent, outId: string) => {
        setDraggedOutputId(outId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); 
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedOutputId || draggedOutputId === targetId || !data.onReorderOutputs) return;
        
        const newOutputs = [...outputs];
        const sourceIdx = newOutputs.findIndex((o: any) => o.id === draggedOutputId);
        const targetIdx = newOutputs.findIndex((o: any) => o.id === targetId);
        
        if (sourceIdx !== -1 && targetIdx !== -1) {
            const [removed] = newOutputs.splice(sourceIdx, 1);
            newOutputs.splice(targetIdx, 0, removed);
            data.onReorderOutputs(id, newOutputs);
        }
        setDraggedOutputId(null);
    };

    const handleMoveOutput = (e: React.MouseEvent, currentIndex: number, direction: 'up' | 'down') => {
        e.stopPropagation();
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= outputs.length || !data.onReorderOutputs) return;

        const newOutputs = [...outputs];
        const temp = newOutputs[currentIndex];
        newOutputs[currentIndex] = newOutputs[targetIndex];
        newOutputs[targetIndex] = temp;
        
        data.onReorderOutputs(id, newOutputs);
    };

    return (
        <>
            <NodeResizer minWidth={240} minHeight={Math.max(120, 100 + (outputs.length * 36))} isVisible={selected} lineClassName="border-blue-500/50" handleClassName="h-3 w-3 bg-blue-500 border border-zinc-950 rounded shadow-md" />
            <div 
                className={`w-full min-h-full min-w-[240px] bg-zinc-900/90 backdrop-blur-md rounded-xl flex flex-col shadow-xl transition-colors group ${
                    selected ? 'shadow-accent/20' : ''
                }`}
                style={{ borderWidth: '2px', borderColor: data.color || (selected ? '#0ea5e9' : '#3f3f46') }}
            >
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
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 items-center">
                        {data.onNodeColorChange && (
                            <div className="relative group/ncolor flex items-center h-full">
                                <button className="opacity-0 group-hover:opacity-100 transition-colors p-1" onClick={e => e.stopPropagation()} title="Node Border Color">
                                    <Palette className="w-4 h-4 hover:scale-110 transition-transform" style={{ color: data.color || '#3f3f46' }} />
                                </button>
                                <div className="absolute right-0 top-[100%] pt-1 hidden group-hover/ncolor:block z-50">
                                    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-1.5 gap-1 shadow-2xl flex flex-wrap w-[4.5rem]">
                                        {STANDARD_COLORS.map(c => (
                                            <button 
                                                key={c.bg} 
                                                onClick={(e) => { e.stopPropagation(); data.onNodeColorChange(id, c.bg); }} 
                                                className="w-3.5 h-3.5 rounded-full border border-zinc-950 focus:outline-none hover:scale-125 transition-transform shadow-sm m-[1px]" 
                                                style={{ backgroundColor: c.bg }} 
                                                title={c.name} 
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
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
                {outputs.map((out: any, index: number) => (
                    <div 
                        key={out.id} 
                        className={`nodrag relative flex justify-end items-center h-8 group/pin px-2 transition-colors ${draggedOutputId === out.id ? 'opacity-30' : 'hover:bg-zinc-800/50'}`}
                        draggable={!editingOutputId}
                        onDragStart={(e) => handleDragStart(e, out.id)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, out.id)}
                        onDragEnd={() => setDraggedOutputId(null)}
                    >
                        <div className="flex items-center gap-1 flex-1 pl-1">
                            {data.onOutputColorChange && !editingOutputId && (
                                <div className="relative group/color flex items-center h-full">
                                    <button 
                                        className="opacity-0 group-hover/pin:opacity-100 transition-colors p-1 z-10 relative"
                                        onClick={e => e.stopPropagation()}
                                        title="Wire Color"
                                    >
                                        <Palette className="w-3.5 h-3.5 hover:scale-110 transition-transform" style={{ color: out.color || '#0ea5e9' }} />
                                    </button>
                                    <div className="absolute left-0 top-[100%] pt-1 hidden group-hover/color:block z-[60]">
                                        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-1.5 gap-1 shadow-2xl flex flex-wrap w-[4.5rem]">
                                            {STANDARD_COLORS.map(c => (
                                                <button 
                                                    key={c.bg} 
                                                    onClick={(e) => { e.stopPropagation(); data.onOutputColorChange(id, out.id, c.bg); }} 
                                                    className="w-3.5 h-3.5 rounded-full border border-zinc-950 focus:outline-none hover:scale-125 transition-transform shadow-sm m-[1px]" 
                                                    style={{ backgroundColor: c.bg }} 
                                                    title={c.name} 
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {outputs.length > 1 && !editingOutputId && (
                                <div className="flex flex-col opacity-0 group-hover/pin:opacity-100 transition-opacity mr-1">
                                    <button 
                                        disabled={index === 0}
                                        onClick={(e) => handleMoveOutput(e, index, 'up')}
                                        className="text-zinc-500 hover:text-white disabled:opacity-0 p-1 hover:bg-zinc-800 rounded transition-colors"
                                    >
                                        <ChevronUp className="w-3 h-3" />
                                    </button>
                                    <button 
                                        disabled={index === outputs.length - 1}
                                        onClick={(e) => handleMoveOutput(e, index, 'down')}
                                        className="text-zinc-500 hover:text-white disabled:opacity-0 p-1 hover:bg-zinc-800 rounded transition-colors"
                                    >
                                        <ChevronDown className="w-3 h-3" />
                                    </button>
                                </div>
                            )}
                            {outputs.length > 1 && !editingOutputId && (
                                <GripVertical className="w-3.5 h-3.5 text-zinc-700 cursor-grab opacity-0 group-hover/pin:opacity-100 hover:text-zinc-400 active:cursor-grabbing transition-colors" />
                            )}
                            {data.onDeleteOutput && outputs.length > 1 && !editingOutputId && (
                                <button 
                                    className="opacity-0 group-hover/pin:opacity-100 text-zinc-600 hover:text-red-400 transition-all p-0.5"
                                    onClick={(e) => { e.stopPropagation(); data.onDeleteOutput(id, out.id); }}
                                    title="Delete Route"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            )}
                            {data.onEditOutput && !editingOutputId && (
                                <button 
                                    className="opacity-0 group-hover/pin:opacity-100 text-zinc-600 hover:text-blue-400 transition-all p-0.5"
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setEditingOutputId(out.id);
                                        setTempValue(out.label);
                                    }}
                                    title="Edit Logic Requirement"
                                >
                                    <Edit2 className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                        
                        {editingOutputId === out.id ? (
                            <input 
                                ref={inputRef}
                                className="w-[110px] bg-zinc-950 border border-accent rounded px-1.5 py-0.5 text-[10px] uppercase font-bold text-white mr-4 outline-none"
                                value={tempValue}
                                onChange={e => setTempValue(e.target.value)}
                                onBlur={() => {
                                    if (tempValue.trim() && tempValue !== out.label) {
                                        data.onEditOutput(id, out.id, tempValue.trim());
                                    }
                                    setEditingOutputId(null);
                                }}
                                onKeyDown={e => {
                                    e.stopPropagation();
                                    if (e.key === 'Enter') e.currentTarget.blur();
                                }}
                            />
                        ) : (
                            <span className="text-[11px] uppercase tracking-wider text-white font-bold mr-4 pointer-events-none drop-shadow-sm">{out.label}</span>
                        )}
                        
                        {/* The Actual Source Handle corresponding to this outcome */}
                        <Handle 
                            type="source" 
                            position={Position.Right} 
                            id={out.id} 
                            className="!w-4 !h-4 !-mr-[10px] !border-2 !border-zinc-900 cursor-crosshair transition-colors" 
                            style={{ 
                                top: '50%', 
                                transform: 'translateY(-50%)', 
                                backgroundColor: out.color || '#0ea5e9' 
                            }}
                        />
                    </div>
                ))}

                {/* Inline Add Field logic */}
                {addingNew && (
                    <div className="relative flex justify-end items-center h-8 px-2 bg-zinc-800/20">
                        <input 
                            ref={inputRef}
                            className="w-[110px] bg-zinc-950 border border-green-500/50 rounded px-1.5 py-0.5 text-[10px] uppercase font-bold text-white mr-4 outline-none ml-auto"
                            value={tempValue}
                            onChange={e => setTempValue(e.target.value)}
                            onBlur={() => {
                                if (tempValue.trim() && data.onAddOutput) {
                                    data.onAddOutput(id, tempValue.trim());
                                }
                                setAddingNew(false);
                            }}
                            onKeyDown={e => {
                                e.stopPropagation();
                                if (e.key === 'Enter') e.currentTarget.blur();
                            }}
                            placeholder="NEW ROUTE"
                        />
                    </div>
                )}

                {/* Add Route Button */}
                {data.onAddOutput && !addingNew && (
                    <div className="flex justify-end pr-[22px] pt-1 pb-1">
                        <button 
                            className="w-4 h-4 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-500 hover:text-green-400 hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100"
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                setTempValue('');
                                setAddingNew(true);
                            }}
                            title="Add Blueprint Route"
                        >
                            <Plus className="w-3 h-3" />
                        </button>
                    </div>
                )}
            </div>
        </div>
        </>
    );
});
