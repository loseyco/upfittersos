// @ts-nocheck
import { useStore, useReactFlow } from '@xyflow/react';
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
    
    // Rotation State
    const [isRotating, setIsRotating] = useState(false);
    const [startRotatePoints, setStartRotatePoints] = useState<{x:number,y:number}[]|null>(null);
    const [startMouseAngle, setStartMouseAngle] = useState(0);

    const pointString = points?.map((p: any) => `${p.x},${p.y}`).join(' ') || '';

    const getMouseAngle = (e: React.PointerEvent) => {
        const svgEl = e.currentTarget.closest('svg');
        if (!svgEl) return 0;
        const rect = svgEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        return Math.atan2(e.clientY - cy, e.clientX - cx);
    };

    const handleRotatePointerDown = (e: React.PointerEvent) => {
        if (data.canManage === false) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsRotating(true);
        setStartRotatePoints([...points]);
        setStartMouseAngle(getMouseAngle(e));
    };

    const handleRotatePointerMove = (e: React.PointerEvent) => {
        if (!isRotating || !startRotatePoints) return;
        e.stopPropagation();
        
        const currentAngle = getMouseAngle(e);
        const delta = currentAngle - startMouseAngle;

        const cx = (width || 100) / 2;
        const cy = (height || 100) / 2;
        const cos = Math.cos(delta);
        const sin = Math.sin(delta);

        const newPoints = startRotatePoints.map(p => {
            const nx = (cos * (p.x - cx)) - (sin * (p.y - cy)) + cx;
            const ny = (sin * (p.x - cx)) + (cos * (p.y - cy)) + cy;
            return { x: nx, y: ny };
        });
        
        updateNodeData(id, { points: newPoints });
    };

    const handleRotatePointerUp = (e: React.PointerEvent) => {
        if (!isRotating) return;
        e.stopPropagation();
        e.currentTarget.releasePointerCapture(e.pointerId);
        setIsRotating(false);
        setStartRotatePoints(null);
        
        if (onPointsUpdated) {
            onPointsUpdated(id, points); 
        }
    };

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
                    className={selected && draggingIdx === null && !isRotating && data.canManage !== false ? "drag-handle" : ""}
                    points={pointString} 
                    fill={getStatusFill()} 
                    fillOpacity={selected || isHovered ? (status === 'Clear' ? 0.2 : 0.6) : fillOpacity} 
                    stroke={color} 
                    strokeWidth={selected || isHovered ? 3 : 2}
                    style={{ transition: 'all 0.2s', pointerEvents: 'all', cursor: selected && draggingIdx === null && !isRotating && data.canManage !== false ? 'grab' : 'default' }}
                />

                {/* Handles */}
                {selected && data.canManage !== false && (
                    <g>
                        {/* Rotation Knob */}
                        <line 
                            x1={(width || 100) / 2} 
                            y1={0} 
                            x2={(width || 100) / 2} 
                            y2={-24} 
                            stroke={color} 
                            strokeWidth={2} 
                        />
                        <circle
                            className="nodrag nopan"
                            cx={(width || 100) / 2}
                            cy={-24}
                            r={6}
                            fill="#ffffff"
                            stroke={color}
                            strokeWidth={2}
                            onPointerDown={handleRotatePointerDown}
                            onPointerMove={handleRotatePointerMove}
                            onPointerUp={handleRotatePointerUp}
                            style={{ pointerEvents: 'all', cursor: 'alias' }}
                        />
                        {/* Corner Points */}
                        {points?.map((p: any, idx: number) => (
                            <circle
                                className="nodrag nopan"
                                key={`pt-${idx}`}
                                cx={p.x}
                                cy={p.y}
                                r={5}
                                fill="#ffffff"
                                stroke={color}
                                strokeWidth={2}
                                onPointerDown={(e) => handlePointerDown(e, idx)}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                style={{ pointerEvents: 'all', cursor: 'crosshair', transition: 'r 0.1s' }}
                            />
                        ))}
                    </g>
                )}
            </svg>
        </div>
    );
}
