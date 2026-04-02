import { Handle, Position, useStore, useReactFlow, NodeToolbar } from '@xyflow/react';
import { useState } from 'react';
import { Truck, User, Info, ClipboardList } from 'lucide-react';

export function MapPolygonNode({ data, selected, id }: any) {
    const { points, width, height, color = '#3b82f6', label, status = 'Clear', onPointsUpdated } = data;
    
    const transform = useStore((s) => s.transform);
    const { updateNodeData } = useReactFlow();
    
    const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
    const [isHovered, setIsHovered] = useState(false);

    const pointString = points?.map((p: any) => `${p.x},${p.y}`).join(' ') || '';

    const handlePointerDown = (e: React.PointerEvent, idx: number) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDraggingIdx(idx);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (draggingIdx === null) return;
        e.stopPropagation();
        
        const zoom = transform[2];
        const dx = e.movementX / zoom;
        const dy = e.movementY / zoom;

        const newPoints = [...points];
        newPoints[draggingIdx] = { 
            x: newPoints[draggingIdx].x + dx, 
            y: newPoints[draggingIdx].y + dy 
        };
        
        updateNodeData(id, { points: newPoints });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (draggingIdx === null) return;
        e.stopPropagation();
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDraggingIdx(null);
        
        if (onPointsUpdated) {
            onPointsUpdated(id, points); 
        }
    };

    const getStatusFill = () => {
        switch (status) {
            case 'Working': return '#22c55e'; // green-500
            case 'Blocked': return '#ef4444'; // red-500
            case 'Needs Help': return '#eab308'; // yellow-500
            default: return 'transparent';
        }
    };

    const fillOpacity = status === 'Clear' ? 0 : 0.3;

    return (
        <div 
            style={{ width: `${width || 100}px`, height: `${height || 100}px` }} 
            className="relative"
        >
            <svg width="100%" height="100%" viewBox={`0 0 ${width || 100} ${height || 100}`} preserveAspectRatio="none" style={{ overflow: 'visible', pointerEvents: 'none' }}>
                <polygon 
                    className={selected && draggingIdx === null ? "drag-handle" : ""}
                    points={pointString} 
                    fill={getStatusFill()} 
                    fillOpacity={selected || isHovered ? (status === 'Clear' ? 0.2 : 0.6) : fillOpacity} 
                    stroke={color} 
                    strokeWidth={selected || isHovered ? 3 : 2}
                    style={{ transition: 'all 0.2s', pointerEvents: 'all', cursor: selected && draggingIdx === null ? 'grab' : 'default' }}
                />
            
                <NodeToolbar isVisible={isHovered} position={Position.Top} offset={10}>
                    <div className="bg-zinc-900 border border-zinc-700 shadow-2xl rounded-xl p-3 flex flex-col gap-2 min-w-40 pointer-events-none transform transition-all duration-200">
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-2 gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full shadow-inner" style={{ backgroundColor: color }}></div>
                                <div className="font-bold text-white text-sm truncate">{label}</div>
                            </div>
                            
                            {status !== 'Clear' && (
                                <div className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                    status === 'Working' ? 'bg-green-500/20 text-green-400' : 
                                    status === 'Blocked' ? 'bg-red-500/20 text-red-400' : 
                                    status === 'Needs Help' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-zinc-800 text-zinc-400'
                                }`}>
                                    {status}
                                </div>
                            )}
                        </div>
                        <div className={`text-xs font-semibold flex items-center gap-2 ${data.jobName ? 'text-blue-400' : 'text-zinc-500'}`}>
                            <ClipboardList className="w-3.5 h-3.5" />
                            {data.jobName || 'No Active Job'}
                        </div>
                        <div className={`text-xs font-semibold flex items-center gap-2 ${data.currentVehicle ? 'text-amber-400' : 'text-zinc-500'}`}>
                            <Truck className="w-3.5 h-3.5" />
                            {data.currentVehicle || 'No Vehicle Assigned'}
                        </div>
                        <div className={`text-xs font-semibold flex items-center gap-2 ${data.assignedTech ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            <User className="w-3.5 h-3.5" />
                            {data.assignedTech || 'No Staff Assigned'}
                        </div>
                        <div className="text-[10px] font-medium text-zinc-500 uppercase flex items-center gap-1 mt-1">
                            <Info className="w-3 h-3" />
                            {data.nodeType || 'Zone'}
                        </div>
                    </div>
                </NodeToolbar>

                {label && (
                    <g 
                        transform={`translate(${(width || 100) / 2}, ${(height || 100) / 2})`}
                        onMouseEnter={() => setIsHovered(true)}
                        onMouseLeave={() => setIsHovered(false)}
                        style={{ pointerEvents: 'all', cursor: 'help' }}
                    >
                        <circle cx={0} cy={0} r={12} fill="#3b82f6" fillOpacity={0.9} />
                        <circle cx={0} cy={0} r={12} fill="transparent" stroke="#ffffff" strokeWidth="1.5" />
                        <text x={0} y={1} fill="#ffffff" fontSize="12" fontWeight="bold" textAnchor="middle" alignmentBaseline="middle" style={{ pointerEvents: 'none' }}>i</text>
                    </g>
                )}

                {/* Render Draggable Vertex Corners */}
                {selected && points?.map((p: any, idx: number) => (
                    <circle
                        key={idx}
                        cx={p.x}
                        cy={p.y}
                        r={draggingIdx === idx ? 6 : 4}
                        fill="#ffffff"
                        stroke="#ef4444"
                        strokeWidth={2}
                        onPointerDown={(e) => handlePointerDown(e, idx)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        style={{ pointerEvents: 'all', cursor: 'crosshair', transition: 'r 0.1s' }}
                    />
                ))}
            </svg>
            <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
            <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
        </div>
    );
}
