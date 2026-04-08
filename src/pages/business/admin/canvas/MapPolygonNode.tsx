import { Handle, Position, useStore, useReactFlow, NodeToolbar } from '@xyflow/react';
import { useState } from 'react';
import { Truck, User, Info, ClipboardList, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function MapPolygonNode({ data, selected, id }: any) {
    const { points, width, height, color = '#3b82f6', label, status = 'Clear', onPointsUpdated } = data;
    
    const transform = useStore((s) => s.transform);
    const { updateNodeData } = useReactFlow();
    const navigate = useNavigate();
    
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
            case 'Working': 
            case 'In Progress': return '#3b82f6'; // blue-500
            case 'Approved': return '#10b981'; // emerald-500
            case 'Estimate': return '#6366f1'; // indigo-500
            case 'Ready for QC':
            case 'Ready for Delivery': return '#f59e0b'; // amber-500
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
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <svg width="100%" height="100%" viewBox={`0 0 ${width || 100} ${height || 100}`} preserveAspectRatio="none" style={{ overflow: 'visible', pointerEvents: 'none' }}>
                <polygon 
                    className={selected && draggingIdx === null && data.canManage !== false ? "drag-handle" : ""}
                    points={pointString} 
                    fill={getStatusFill()} 
                    fillOpacity={selected || isHovered ? (status === 'Clear' ? 0.2 : 0.6) : fillOpacity} 
                    stroke={color} 
                    strokeWidth={selected || isHovered ? 3 : 2}
                    style={{ transition: 'all 0.2s', pointerEvents: 'all', cursor: selected && draggingIdx === null && data.canManage !== false ? 'grab' : 'default' }}
                />
            </svg>
            {/* Rich Hover Card Overlay */}
            {label && !data.disableTooltip && (
                <div 
                    className="absolute group z-50 nodrag nopan"
                    style={{ 
                        left: '50%', 
                        top: '50%', 
                        transform: 'translate(-50%, -50%)',
                    }}
                >
                    {/* The Blue Info Circle (Target) */}
                    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-500 text-white font-bold border-[1.5px] border-white shadow-lg cursor-help transition-transform hover:scale-110">
                        <span className="text-[12px] leading-none mb-[1px]">i</span>
                    </div>

                    {/* Invisible Bridge */}
                    <div className="absolute bottom-[24px] left-1/2 -translate-x-1/2 w-16 h-4"></div>

                    {/* The Popup Card */}
                    <div 
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 min-w-64 bg-zinc-950 border border-zinc-700 shadow-2xl rounded-2xl p-4 flex flex-col gap-3 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transform translate-y-2 group-hover:translate-y-0 transition-all duration-200"
                    >
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full shadow-inner" style={{ backgroundColor: color }}></div>
                                <div className="font-bold text-white text-sm truncate">{label}</div>
                            </div>
                            
                            {status !== 'Clear' && (
                                <div className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                    (status === 'Working' || status === 'In Progress') ? 'bg-blue-500/20 text-blue-400' : 
                                    status === 'Approved' ? 'bg-emerald-500/20 text-emerald-400' :
                                    status === 'Estimate' ? 'bg-indigo-500/20 text-indigo-400' :
                                    (status === 'Ready for QC' || status === 'Ready for Delivery') ? 'bg-amber-500/20 text-amber-400' :
                                    status === 'Blocked' ? 'bg-red-500/20 text-red-400' : 
                                    status === 'Needs Help' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-zinc-800 text-zinc-400'
                                }`}>
                                    {status}
                                </div>
                            )}
                        </div>

                        <div className={`text-xs font-semibold flex items-center gap-2 ${data.jobName ? 'text-blue-400' : 'text-zinc-500'}`}>
                            <ClipboardList className="w-4 h-4" />
                            {data.jobName || 'No Active Job'}
                        </div>
                        <div className={`text-xs font-semibold flex items-center gap-2 ${data.currentVehicle ? 'text-amber-400' : 'text-zinc-500'}`}>
                            <Truck className="w-4 h-4" />
                            {data.currentVehicle || 'No Vehicle Assigned'}
                        </div>
                        <div className={`text-xs font-semibold flex items-center gap-2 ${data.assignedTech ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            <User className="w-4 h-4" />
                            {data.assignedTech || 'No Staff Assigned'}
                        </div>
                        <div className="text-[10px] font-medium text-zinc-500 uppercase flex items-center justify-between mt-1">
                            <span className="flex items-center gap-1"><Info className="w-3 h-3" /> {data.nodeType || 'Zone'}</span>
                        </div>

                        <div className="pt-3 mt-1 border-t border-zinc-800">
                            {(!data.tenantId || !id) ? (
                                <button disabled className="w-full bg-zinc-800/50 text-zinc-500 font-bold py-2.5 rounded-lg text-xs flex justify-center items-center gap-2 cursor-not-allowed">
                                    Unlinked Zone
                                </button>
                            ) : (
                                <button 
                                    type="button" 
                                    onPointerDown={(e) => {
                                        e.stopPropagation();
                                        navigate(`/business/areas/${id}`);
                                    }}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-lg text-xs transition-colors flex justify-center items-center gap-2"
                                >
                                    View Area Details <ExternalLink className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
