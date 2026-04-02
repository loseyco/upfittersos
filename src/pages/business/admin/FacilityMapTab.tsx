import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { applyNodeChanges, Panel, Background, BackgroundVariant, ReactFlow, Controls, useReactFlow, ReactFlowProvider, useStore } from '@xyflow/react';
import type { Node, NodeChange, ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { MapPolygonNode } from './canvas/MapPolygonNode';
import { MapBackgroundNode } from './canvas/MapBackgroundNode';
import { db } from '../../../lib/firebase';
import { doc, setDoc, onSnapshot, deleteDoc, arrayUnion } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Loader2, Save, X, Plus, Layers, Image as ImageIcon, MousePointer2, PenTool, Trash2, MapPin, Square, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';
import { api } from '../../../lib/api';
import { usePermissions } from '../../../hooks/usePermissions';

const nodeTypes = {
    polygon: MapPolygonNode,
    background: MapBackgroundNode,
};

// Compute bounding box for an array of points
const computeBoundingBox = (points: {x: number, y: number}[]) => {
    if (!points || points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    let minX = points[0].x;
    let maxX = points[0].x;
    let minY = points[0].y;
    let maxY = points[0].y;
    points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

function MapCanvasCore({ tenantId, user, readOnly = false }: { tenantId: string, user: any, readOnly?: boolean }) {
    const { screenToFlowPosition } = useReactFlow();
    const transform = useStore((s) => s.transform);
    const { checkPermission } = usePermissions();
    const canManage = !readOnly && checkPermission('manage_facility_map');
    
    // Core state
    const [allNodes, setAllNodes] = useState<Node[]>([]);
    const [activeFloorId, setActiveFloorId] = useState<string>('default');
    const [floors, setFloors] = useState<{id: string, name: string}[]>([{id: 'default', name: 'Ground Floor'}]);
    const [baseImages, setBaseImages] = useState<Record<string, string>>({});
    const [availableAreas, setAvailableAreas] = useState<any[]>([]);
    
    // Aux Context State

    
    // Helper for Auto Coloring
    const getColorForType = (type: string) => {
        switch (type) {
            case 'Bay': return '#3b82f6';
            case 'Parking': return '#9ca3af';
            case 'Office': return '#10b981';
            case 'Equipment': return '#f59e0b';
            case 'Room': return '#8b5cf6';
            case 'Building': return '#1f2937';
            case 'Door - Garage': return '#0ea5e9';
            case 'Door - Man': return '#ef4444';
            case 'Door - Misc': return '#64748b';
            case 'Other': return '#3f3f46';
            default: return '#3b82f6';
        }
    };



    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isCanvasLoaded, setIsCanvasLoaded] = useState(false);
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

    // References for save state
    const nodesRef = useRef(allNodes);
    const hasUnsavedChangesRef = useRef(false);
    useEffect(() => {
        nodesRef.current = allNodes;
    }, [allNodes]);

    // Draw Mode State
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPolygonPoints, setCurrentPolygonPoints] = useState<{x: number, y: number}[]>([]);
    const [tempMousePos, setTempMousePos] = useState<{x: number, y: number} | null>(null);
    const [typedDistance, setTypedDistance] = useState<string>('');
    const [liveDragVertexIdx, setLiveDragVertexIdx] = useState<number | null>(null);

    // Properties Side Panel State
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const selectedNode = allNodes.find(n => n.id === selectedNodeId);

    // Vector Editor Node Re-Bounding
    const handlePointsUpdate = (id: string, newPoints: {x: number, y: number}[]) => {
        const n = allNodes.find(x => x.id === id);
        if (!n) return;

        const bbox = computeBoundingBox(newPoints);
        
        const relativePoints = newPoints.map(p => ({
            x: p.x - bbox.minX,
            y: p.y - bbox.minY
        }));
        
        const nextX = n.position.x + bbox.minX;
        const nextY = n.position.y + bbox.minY;

        setAllNodes(prev => prev.map(node => {
            if (node.id === id) {
                return {
                    ...node,
                    position: { x: nextX, y: nextY },
                    data: {
                        ...node.data,
                        width: bbox.width,
                        height: bbox.height,
                        points: relativePoints
                    }
                };
            }
            return node;
        }));
        hasUnsavedChangesRef.current = true;

        if (tenantId && tenantId !== 'GLOBAL') {
            setDoc(doc(db, 'business_zones', id), {
                width: bbox.width,
                height: bbox.height,
                points: relativePoints,
                updatedAt: new Date().toISOString(),
                lastModifiedBy: user?.displayName || user?.email || 'Unknown Staff',
                activityLogs: arrayUnion({
                    timestamp: new Date().toISOString(),
                    actor: user?.displayName || user?.email || 'Unknown Staff',
                    action: `Modified Vertex Geometry`
                })
            }, { merge: true }).catch(console.error);
        }
    };

    const currentBaseImage = baseImages[activeFloorId];

    const renderNodes = useMemo(() => {
        return allNodes
            .filter(n => n.data.floorId === activeFloorId)
            .map(n => ({
                ...n,
                draggable: canManage && n.id === selectedNodeId,
                data: {
                    ...n.data,
                    onPointsUpdated: canManage ? handlePointsUpdate : () => {}
                }
            }));
    }, [allNodes, activeFloorId, selectedNodeId, handlePointsUpdate, canManage]);
    // Add Object Modal State
    const [isObjectModalOpen, setIsObjectModalOpen] = useState(false);
    const [objFormData, setObjFormData] = useState({ name: 'New Object', widthFt: 10, lengthFt: 10, type: 'Equipment', wallHeight: 8 });

    // Ensure we only fitView once on launch
    const hasFittedViewRef = useRef(false);

    // Upload Ref
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL') return;
        
        let isMounted = true;
        const docRef = doc(db, 'business_facility_maps', tenantId);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                if (hasUnsavedChangesRef.current) return; // Wait for our save to clear the lock

                const data = docSnap.data();
                if (isMounted) {
                    setAllNodes((data.nodes || []).map((n: Node) => ({...n, dragHandle: '.drag-handle'})));
                    if (data.floors) setFloors(data.floors);
                    
                    if (!data.baseImages || Object.keys(data.baseImages).length === 0) {
                        // Auto-bootstrap satellite coordinates
                        api.get(`/businesses/${tenantId}`).then(res => {
                            const b = res.data;
                            if (b && b.addressStreet && b.addressCity) {
                                const fullAddr = `${b.addressStreet}, ${b.addressCity}, ${b.addressState || ''} ${b.addressZip || ''}`.trim();
                                setBaseImages({ 'default': `address:${fullAddr}` });
                                hasUnsavedChangesRef.current = true;
                            }
                        }).catch(console.error);
                    } else {
                        setBaseImages(data.baseImages);
                    }
                    
                    setIsLoading(false);
                    setIsCanvasLoaded(true);
                }
            } else if (isMounted) {
                // Initialize doc
                api.get(`/businesses/${tenantId}`).then(res => {
                    const b = res.data;
                    if (b && b.addressStreet && b.addressCity) {
                        const fullAddr = `${b.addressStreet}, ${b.addressCity}, ${b.addressState || ''} ${b.addressZip || ''}`.trim();
                        setBaseImages({ 'default': `address:${fullAddr}` });
                        hasUnsavedChangesRef.current = true;
                    }
                }).catch(console.error);
                
                setIsLoading(false);
                setIsCanvasLoaded(true);
            }
        }, (err) => {
            console.error("Failed to load map data", err);
            toast.error("Failed to sync facility map.");
            if (isMounted) setIsLoading(false);
        });

        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, [tenantId]);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL') return;
        const fetchAreas = async () => {
            try {
                const res = await api.get(`/areas?tenantId=${tenantId}`);
                setAvailableAreas(res.data);
            } catch (err) {
                console.error("Failed to load available areas", err);
            }
        };
        fetchAreas();
    }, [tenantId]);

    const handleLinkArea = async (areaId: string) => {
        if (!areaId) return;
        const targetArea = availableAreas.find(a => a.id === areaId);
        if (!targetArea) return;
        if (!selectedNodeId) return;
        const selectedNode = allNodes.find(x => x.id === selectedNodeId);
        if (!selectedNode) return;

        const oldId = selectedNodeId;

        // 1. Delete old auto-generated ID from business_zones, if it differs
        if (oldId !== areaId && tenantId && tenantId !== 'GLOBAL') {
            await deleteDoc(doc(db, 'business_zones', oldId)).catch(console.error);
        }

        // 2. Update React Flow node ID and inject targetArea properties
        const updatedData = {
            ...selectedNode.data,
            ...targetArea,
            points: selectedNode.data.points,
            width: selectedNode.data.width,
            height: selectedNode.data.height,
        };

        setAllNodes(prev => prev.map(n => {
            if (n.id === oldId) {
                return {
                    ...n,
                    id: areaId,
                    data: updatedData
                };
            }
            return n;
        }));

        // 3. Update business_zones for the targetArea with the new points
        if (tenantId && tenantId !== 'GLOBAL') {
            const payload = {
                ...updatedData,
                updatedAt: new Date().toISOString(),
                lastModifiedBy: user?.displayName || user?.email || 'Unknown Staff',
            };
            await setDoc(doc(db, 'business_zones', areaId), payload, { merge: true }).catch(console.error);
        }

        setSelectedNodeId(areaId);
        hasUnsavedChangesRef.current = true;
        toast.success(`Successfully linked geometry to ${targetArea.label || 'Area'}`);
        
        // Refresh available areas
        api.get(`/areas?tenantId=${tenantId}`).then(res => setAvailableAreas(res.data)).catch(console.error);
    };



    const handleSave = useCallback(async (forcedNodes?: Node[], forcedFloors?: any, forcedBaseImages?: any) => {
        if (!tenantId || tenantId === 'GLOBAL') return;
        setIsSaving(true);
        
        const rawNodes = forcedNodes || nodesRef.current;
        
        // React Flow often attaches bound functions or proxies natively to internal `data`. 
        // Firebase strictly forbids functions, so we sanitize pure data types only.
        const nodesToSave = rawNodes.map(n => ({
            ...n,
            data: Object.fromEntries(Object.entries(n.data || {}).filter(([_, v]) => typeof v !== 'function'))
        }));

        const floorsToSave = forcedFloors || floors;
        const imagesToSave = forcedBaseImages || baseImages;

        try {
            await setDoc(doc(db, 'business_facility_maps', tenantId), {
                nodes: nodesToSave,
                floors: floorsToSave,
                baseImages: imagesToSave,
                updatedAt: new Date()
            }, { merge: true });
            hasUnsavedChangesRef.current = false;
        } catch (err) {
            console.error("Failed to save map", err);
            toast.error("Failed to save map state.");
        } finally {
            setIsSaving(false);
        }
    }, [tenantId, floors, baseImages]);

    useEffect(() => {
        if (!isCanvasLoaded || !hasUnsavedChangesRef.current) return;
        const timer = setTimeout(() => {
            handleSave();
        }, 1500);
        return () => clearTimeout(timer);
    }, [allNodes, isCanvasLoaded, handleSave]);

    // Handle React Flow changes (just for moving existing nodes)
    const onNodesChange = useCallback((changes: NodeChange[]) => {
        setAllNodes((currentNodes) => {
            // Apply changes only to the nodes on the active floor
            let nextNodes = [...currentNodes];
            let activeNodes = nextNodes.filter(n => n.data.floorId === activeFloorId);
            
            // Xyflow applyNodeChanges
            const updatedActiveNodes = applyNodeChanges(changes, activeNodes);
            
            // Re-merge
            return nextNodes.map(n => {
                if (n.data.floorId !== activeFloorId) return n;
                const match = updatedActiveNodes.find(u => u.id === n.id);
                return match || n;
            });
        });
        hasUnsavedChangesRef.current = true;
    }, [activeFloorId]);

    // Handle initial zoom formatting
    useEffect(() => {
        if (!hasFittedViewRef.current && isCanvasLoaded && rfInstance && allNodes.length > 0) {
            // Short timeout lets the DOM correctly calculate SVG bounds if they just rendered
            setTimeout(() => {
                rfInstance.fitView({ padding: 0.8, maxZoom: 1.0, duration: 800 });
            }, 100);
            hasFittedViewRef.current = true;
        }
    }, [isCanvasLoaded, rfInstance, allNodes.length]);

    // Handle clicking the canvas to draw
    const onPaneClick = useCallback((event: React.MouseEvent) => {
        if (!isDrawing) {
            // Double click deselects node
            setSelectedNodeId(null);
            return;
        }
        
        // Use standard browser coordinates and strictly rely on screenToFlowPosition
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        
        setCurrentPolygonPoints(prev => [...prev, position]);
    }, [isDrawing, screenToFlowPosition]);

    // Handle right click to undo last drawing point
    const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
        event.preventDefault(); // prevent browser context menu
        if (isDrawing && currentPolygonPoints.length > 0) {
            setCurrentPolygonPoints(prev => prev.slice(0, -1));
            setTypedDistance('');
        }
    }, [isDrawing, currentPolygonPoints.length]);

    // Handle mouse movement for temp line during drawing
    const onPaneMouseMove = useCallback((event: React.MouseEvent) => {
        if (!isDrawing || currentPolygonPoints.length === 0 || liveDragVertexIdx !== null) return;
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        setTempMousePos(position);
    }, [isDrawing, currentPolygonPoints.length, screenToFlowPosition, liveDragVertexIdx]);

    // Live Draw Point Handlers
    const handleLivePointPointerDown = (e: React.PointerEvent, idx: number) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setLiveDragVertexIdx(idx);
    };

    const handleLivePointPointerMove = useCallback((e: React.PointerEvent) => {
        if (liveDragVertexIdx === null) return;
        e.stopPropagation();
        
        const zoom = transform[2];
        const dx = e.movementX / zoom;
        const dy = e.movementY / zoom;

        setCurrentPolygonPoints(prev => {
            const next = [...prev];
            next[liveDragVertexIdx] = {
                x: next[liveDragVertexIdx].x + dx,
                y: next[liveDragVertexIdx].y + dy
            };
            return next;
        });
    }, [liveDragVertexIdx, transform]);

    const handleLivePointPointerUp = (e: React.PointerEvent) => {
        if (liveDragVertexIdx === null) return;
        e.stopPropagation();
        e.currentTarget.releasePointerCapture(e.pointerId);
        setLiveDragVertexIdx(null);
    };

    const finishDrawing = useCallback(() => {
        if (currentPolygonPoints.length < 3) {
            toast.error("A polygon must have at least 3 points!");
            setCurrentPolygonPoints([]);
            setIsDrawing(false);
            setTempMousePos(null);
            return;
        }
        
        // Calculate Bounding Box to determine the node's absolute position and relative SVG coordinates
        const bbox = computeBoundingBox(currentPolygonPoints);
        
        // Shift points so they are relative to the bounding box origin (minX, minY)
        const relativePoints = currentPolygonPoints.map(p => ({
            x: p.x - bbox.minX,
            y: p.y - bbox.minY
        }));

        const calculatedColor = getColorForType(activeFloorId === 'default' ? 'Bay' : 'Room');

        const newNode: Node = {
            id: `zone_${Date.now()}`,
            type: 'polygon',
            position: { x: bbox.minX, y: bbox.minY },
            dragHandle: '.drag-handle',
            data: {
                floorId: activeFloorId,
                points: relativePoints,
                width: bbox.width,
                height: bbox.height,
                color: calculatedColor,
                label: '',
                type: 'Bay',
                wallHeight: 10
            }
        };

        setAllNodes(prev => [...prev, newNode]);
        hasUnsavedChangesRef.current = true;
        setCurrentPolygonPoints([]);
        setIsDrawing(false);
        setTempMousePos(null);
        setTypedDistance('');
        setSelectedNodeId(newNode.id); 

        // Sync to unified business_zones collection
        if (tenantId && tenantId !== 'GLOBAL') {
            setDoc(doc(db, 'business_zones', newNode.id), {
                id: newNode.id,
                tenantId,
                type: newNode.data.type,
                color: newNode.data.color,
                label: newNode.data.label,
                wallHeight: newNode.data.wallHeight,
                floorId: activeFloorId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: user?.displayName || user?.email || 'Unknown Staff',
                lastModifiedBy: user?.displayName || user?.email || 'Unknown Staff',
                activityLogs: arrayUnion({
                    timestamp: new Date().toISOString(),
                    actor: user?.displayName || user?.email || 'Unknown Staff',
                    action: `Drawn as ${newNode.data.type}`
                })
            }).catch(console.error);
        }
    }, [currentPolygonPoints, activeFloorId, tenantId]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!canManage) return;
        if (!isDrawing) {
            if (selectedNodeId && (e.key === 'Delete' || e.key === 'Backspace')) {
                if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
                setAllNodes(prev => prev.filter(n => n.id !== selectedNodeId));
                hasUnsavedChangesRef.current = true;
                if (tenantId && tenantId !== 'GLOBAL') {
                    deleteDoc(doc(db, 'business_zones', selectedNodeId)).catch(console.error);
                }
                setSelectedNodeId(null);
            }
        } else {
            // isDrawing is true
            if (e.key === 'Escape') {
                setCurrentPolygonPoints([]);
                setIsDrawing(false);
                setTempMousePos(null);
                setTypedDistance('');
            } else if (e.key === 'Backspace') {
                if (typedDistance.length > 0) {
                    setTypedDistance(prev => prev.slice(0, -1));
                } else {
                    // Undo point
                    setCurrentPolygonPoints(prev => prev.slice(0, -1));
                }
            } else if (e.key === 'z' || e.key === 'Z') {
                setCurrentPolygonPoints(prev => prev.slice(0, -1));
            } else if (e.key === 'Enter') {
                if (typedDistance.length > 0 && currentPolygonPoints.length > 0 && tempMousePos) {
                    // Commit polar tracking dimension
                    const distFt = parseFloat(typedDistance);
                    if (!isNaN(distFt)) {
                        const SCALE = 10;
                        const distPx = distFt * SCALE;

                        const lastP = currentPolygonPoints[currentPolygonPoints.length - 1];
                        const dx = tempMousePos.x - lastP.x;
                        const dy = tempMousePos.y - lastP.y;
                        const mag = Math.sqrt(dx * dx + dy * dy);
                        
                        if (mag > 0) {
                            const newX = lastP.x + (dx / mag) * distPx;
                            const newY = lastP.y + (dy / mag) * distPx;
                            setCurrentPolygonPoints(prev => [...prev, { x: newX, y: newY }]);
                        }
                    }
                    setTypedDistance('');
                } else {
                    finishDrawing();
                }
            } else if (/^[0-9.]$/.test(e.key)) {
                setTypedDistance(prev => prev + e.key);
            }
        }
    }, [isDrawing, finishDrawing, selectedNodeId, typedDistance, currentPolygonPoints, tempMousePos, tenantId]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const handleNodeClick = (_e: React.MouseEvent, node: Node) => {
        if (isDrawing) return;
        setSelectedNodeId(node.id);
    };

    const rescaleSelectedNode = (newWidthPx?: number, newHeightPx?: number) => {
        if (!selectedNodeId) return;
        const n = allNodes.find(x => x.id === selectedNodeId);
        if (!n) return;

        const currentW = n.data.width as number;
        const currentH = n.data.height as number;
        
        const nextW = newWidthPx ?? currentW;
        const nextH = newHeightPx ?? currentH;

        if (nextW <= 0 || nextH <= 0 || currentW <= 0 || currentH <= 0) return;

        const scaleX = nextW / currentW;
        const scaleY = nextH / currentH;

        const newPoints = (n.data.points as {x: number, y: number}[]).map(p => ({
            x: p.x * scaleX,
            y: p.y * scaleY
        }));

        setAllNodes(prev => prev.map(node => {
            if (node.id === selectedNodeId) {
                return {
                    ...node,
                    data: {
                        ...node.data,
                        width: nextW,
                        height: nextH,
                        points: newPoints
                    }
                };
            }
            return node;
        }));
        hasUnsavedChangesRef.current = true;

        if (tenantId && tenantId !== 'GLOBAL') {
            setDoc(doc(db, 'business_zones', selectedNodeId), {
                width: nextW,
                height: nextH,
                points: newPoints,
                updatedAt: new Date().toISOString(),
                lastModifiedBy: user?.displayName || user?.email || 'Unknown Staff',
                activityLogs: arrayUnion({
                    timestamp: new Date().toISOString(),
                    actor: user?.displayName || user?.email || 'Unknown Staff',
                    action: `Rescaled to ${nextW/10}x${nextH/10} ft`
                })
            }, { merge: true }).catch(console.error);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !tenantId) return;

        try {
            const toastId = toast.loading('Uploading floor map...', { id: 'map_upload' });
            const storage = getStorage();
            const storageRef = ref(storage, `facility_maps/${tenantId}/${activeFloorId}_background`);
            
            await uploadBytes(storageRef, file, { contentType: file.type });
            const url = await getDownloadURL(storageRef);
            
            const newBaseImages = {
                ...baseImages,
                [activeFloorId]: url
            };
            setBaseImages(newBaseImages);
            hasUnsavedChangesRef.current = true;
            await handleSave(allNodes, floors, newBaseImages); 
            
            toast.success('Map uploaded successfully.', { id: toastId });
        } catch (err) {
            console.error("Map upload failed", err);
            toast.error('Failed to upload map.', { id: 'map_upload' });
        }
    };

    const handleAddressImport = async () => {
        const address = window.prompt("Enter physical address (e.g. 123 Main St, City, ST)");
        if (!address || !tenantId) return;

        const newBaseImages = {
            ...baseImages,
            [activeFloorId]: `address:${address}`
        };
        setBaseImages(newBaseImages);
        hasUnsavedChangesRef.current = true;
        await handleSave(allNodes, floors, newBaseImages);
        toast.success(`Satellite view linked to ${address}.`);
    };

    const confirmAddObject = () => {
        if (!tenantId) return;

        const SCALE = 10;
        const wPx = objFormData.widthFt * SCALE;
        const hPx = objFormData.lengthFt * SCALE;

        const calculatedColor = getColorForType(objFormData.type);
        const pos = rfInstance ? rfInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) : { x: 0, y: 0 };
        
        pos.x -= wPx / 2;
        pos.y -= hPx / 2;

        const relativePoints = [
            { x: 0, y: 0 },
            { x: wPx, y: 0 },
            { x: wPx, y: hPx },
            { x: 0, y: hPx }
        ];

        const newNode: Node = {
            id: `zone_${Date.now()}`,
            type: 'polygon',
            position: pos,
            dragHandle: '.drag-handle',
            data: {
                floorId: activeFloorId,
                points: relativePoints,
                width: wPx,
                height: hPx,
                color: calculatedColor,
                label: 'Unassigned Geometry',
                type: 'Other',
                wallHeight: 10
            }
        };

        setAllNodes(prev => [...prev, newNode]);
        hasUnsavedChangesRef.current = true;
        setSelectedNodeId(newNode.id); 
        setIsObjectModalOpen(false);

        if (tenantId && tenantId !== 'GLOBAL') {
            setDoc(doc(db, 'business_zones', newNode.id), {
                id: newNode.id,
                tenantId,
                type: newNode.data.type,
                color: newNode.data.color,
                label: newNode.data.label,
                wallHeight: newNode.data.wallHeight,
                floorId: activeFloorId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: user?.displayName || user?.email || 'Unknown Staff',
                lastModifiedBy: user?.displayName || user?.email || 'Unknown Staff',
                activityLogs: arrayUnion({
                    timestamp: new Date().toISOString(),
                    actor: user?.displayName || user?.email || 'Unknown Staff',
                    action: `Deployed as ${newNode.data.type}`
                })
            }).catch(console.error);
        }
        
        toast.success(`Deployed ${objFormData.name} to map.`);
    };

    if (isLoading) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 font-bold text-zinc-500 uppercase tracking-widest text-sm">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-accent" />
                Loading Facility Map...
            </div>
        );
    }

    return (
        <div className="w-full h-full bg-zinc-950 relative flex overflow-hidden">
            
            {/* Left Controls - Floors & Tools */}
            <div className="w-16 flex-none bg-zinc-900 border-r border-zinc-800 flex flex-col items-center py-4 z-20">
                <div className="flex flex-col gap-2 mb-6">
                    {floors.map(floor => (
                        <button
                            key={floor.id}
                            onClick={() => {
                                setActiveFloorId(floor.id);
                                setSelectedNodeId(null);
                                setIsDrawing(false);
                                setCurrentPolygonPoints([]);
                            }}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-colors border shadow-lg ${
                                activeFloorId === floor.id 
                                ? 'bg-accent border-accent text-white' 
                                : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-400'
                            }`}
                            title={floor.name}
                        >
                            {floor.name.charAt(0)}
                        </button>
                    ))}
                    {/* Placeholder for future "Add Floor" capability */}
                    {canManage && (
                        <button className="w-10 h-10 rounded-xl flex items-center justify-center bg-zinc-950 border border-zinc-800 text-zinc-500 hover:text-white transition-colors">
                            <Plus className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <div className="h-px w-8 bg-zinc-800 mb-6"></div>

                <div className="flex flex-col gap-2 w-full px-2">
                    {canManage && (
                        <>
                            <button
                                onClick={() => {
                                    const nextState = !isDrawing;
                                    setIsDrawing(nextState);
                                    if (!nextState) {
                                        setCurrentPolygonPoints([]);
                                        setTempMousePos(null);
                                        setTypedDistance('');
                                    }
                                }}
                                className={`w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all shadow-lg ${
                                    isDrawing 
                                    ? 'bg-amber-500 border border-amber-400 text-white animate-pulse' 
                                    : 'bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-400 hover:text-white'
                                }`}
                                title="Draw Custom Free-Form Polygon"
                            >
                                <PenTool className="w-5 h-5 flex-shrink-0" />
                            </button>

                            <button
                                onClick={() => setIsObjectModalOpen(true)}
                                className="w-full aspect-square rounded-xl flex items-center justify-center bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all shadow-lg"
                                title="Add Scaled Object or Room by Dimensions"
                            >
                                <Square className="w-5 h-5" />
                            </button>
                            
                            <button
                                onClick={handleAddressImport}
                                className="w-full aspect-square rounded-xl flex items-center justify-center bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all shadow-lg"
                                title="Import Google Maps Satellite View via Address"
                            >
                                <MapPin className="w-5 h-5" />
                            </button>
                            
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full aspect-square rounded-xl flex items-center justify-center bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all shadow-lg"
                                title="Upload Map Image for this floor"
                            >
                                <ImageIcon className="w-5 h-5" />
                            </button>

                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                        </>
                    )}
                </div>
            </div>

            {/* Main Canvas Area */}
            <div className={`flex-1 relative cursor-${isDrawing ? 'crosshair' : 'default'} h-full min-h-0`}>
                <ReactFlow
                    nodes={renderNodes}
                    nodeTypes={nodeTypes}
                    edges={[]} // Maps typically don't have edges
                    onInit={setRfInstance}
                    onNodesChange={onNodesChange}
                    onNodeClick={handleNodeClick}
                    onPaneClick={onPaneClick}
                    onPaneMouseMove={onPaneMouseMove}
                    onPaneContextMenu={onPaneContextMenu}
                    className="bg-zinc-950"
                    minZoom={0.1}
                    maxZoom={5}
                    nodesDraggable={canManage && !isDrawing}
                    elementsSelectable={canManage && !isDrawing}
                    panOnDrag={isDrawing ? [1, 2] : [0, 1, 2]} // Middle/Right drag pans when drawing, else all drag
                    snapToGrid={true}
                    snapGrid={[5, 5]} // Half-foot snapping (1ft = 10px)
                >
                    <Background variant={BackgroundVariant.Dots} gap={24} size={2} color="#27272a" />
                    <Controls className="bg-zinc-900 border border-zinc-800 text-white fill-white mb-4 mr-4 shadow-2xl" />

                    {/* Backing Map Image as absolute Background strictly underneath nodes */}
                    {currentBaseImage && (
                        <div 
                            className="absolute pointer-events-none opacity-80" 
                            style={{ 
                                left: 0, top: 0, width: '4000px', height: '4000px',
                                transformOrigin: '0 0',
                                transform: `translate(${transform[0] - 2000 * transform[2]}px, ${transform[1] - 2000 * transform[2]}px) scale(${transform[2]})`,
                                zIndex: -5
                            }}
                        >
                            {currentBaseImage.startsWith('address:') ? (
                                <iframe 
                                    width="100%" 
                                    height="100%" 
                                    frameBorder="0" 
                                    style={{ border: 0, pointerEvents: 'none', borderRadius: '1rem' }}
                                    src={`https://maps.google.com/maps?q=${encodeURIComponent(currentBaseImage.replace('address:', ''))}&t=k&z=20&output=embed`}
                                    allowFullScreen={false}
                                    tabIndex={-1}
                                />
                            ) : (
                                <img src={currentBaseImage} alt="Floor Base" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            )}
                        </div>
                    )}
                </ReactFlow>

                {/* Instructional Overlay when Drawing */}
                {isDrawing && (
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900/95 backdrop-blur-md border border-amber-500/30 shadow-2xl rounded-2xl p-4 md:p-5 flex flex-col items-center pointer-events-none z-50">
                        <div className="flex items-center gap-3 text-amber-400 font-black text-sm uppercase tracking-widest mb-3">
                            <PenTool className="w-4 h-4 animate-pulse" />
                            Poly-Zone Drawing Active
                        </div>
                        <div className="flex flex-col gap-2 text-xs text-zinc-400 font-medium">
                            <div className="flex items-center gap-2"><span className="bg-zinc-800 text-white px-2 py-0.5 rounded font-bold">Left Click</span> Place a corner point</div>
                            <div className="flex items-center gap-2"><span className="bg-zinc-800 text-white px-2 py-0.5 rounded font-bold">Right Click / Backspace</span> Undo last point</div>
                            <div className="flex items-center gap-2"><span className="bg-zinc-800 text-white px-2 py-0.5 rounded font-bold">Enter</span> Complete the shape</div>
                            <div className="flex items-center gap-2"><span className="bg-zinc-800 text-white px-2 py-0.5 rounded font-bold">Escape</span> Cancel drawing</div>
                            <div className="flex items-center gap-2"><span className="bg-zinc-800 text-emerald-400 px-2 py-0.5 rounded font-bold border border-emerald-500/20">Type Numbers</span> Set precise line length</div>
                        </div>
                    </div>
                )}

                {/* If they are drawing, render the uncommitted line on top using an SVG overlay */}
                {isDrawing && currentPolygonPoints.length > 0 && rfInstance && (
                    <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
                        <svg className="w-full h-full">
                            <g transform={`translate(${transform[0]}, ${transform[1]}) scale(${transform[2]})`}>
                                <polyline 
                                    points={[
                                        ...currentPolygonPoints.map(p => `${p.x},${p.y}`),
                                        ...(tempMousePos ? [`${tempMousePos.x},${tempMousePos.y}`] : [])
                                    ].join(' ')}
                                    fill="rgba(245, 158, 11, 0.2)"
                                    stroke="#f59e0b"
                                    strokeWidth="2"
                                    strokeDasharray="4 4"
                                />
                                {currentPolygonPoints.map((p, idx) => (
                                    <circle 
                                        key={idx}
                                        cx={p.x}
                                        cy={p.y}
                                        r={(liveDragVertexIdx === idx ? 8 : 4) / transform[2]}
                                        fill="#ffffff"
                                        stroke={liveDragVertexIdx === idx ? "#ef4444" : "#f59e0b"}
                                        strokeWidth={2 / transform[2]}
                                        style={{ pointerEvents: 'all', cursor: 'grab', transition: 'r 0.1s' }}
                                        onPointerDown={(e) => handleLivePointPointerDown(e, idx)}
                                        onPointerMove={handleLivePointPointerMove}
                                        onPointerUp={handleLivePointPointerUp}
                                        onClick={(e) => e.stopPropagation()} // block ReactFlow's generic paneclick
                                    />
                                ))}
                            </g>
                        </svg>
                    </div>
                )}
                <Panel position="top-right" className="m-4">
                    <div className="bg-zinc-900 border border-zinc-700 px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-400 shadow-xl flex items-center justify-center gap-2">
                        {isSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin text-accent" /> Saving...</> : <><Save className="w-3.5 h-3.5" /> Synced</>}
                    </div>
                </Panel>
            </div>

            {/* Properties Panel Overlay */}
            {canManage && selectedNodeId && selectedNode && (
                <div className="w-80 bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl relative z-40 transform transition-transform">
                    <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Layers className="w-4 h-4 text-accent" />
                            Node Details
                        </h3>
                        <button onClick={() => setSelectedNodeId(null)} className="text-zinc-500 hover:text-white">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="p-4 space-y-4 overflow-y-auto">
                        {canManage && (
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-2 flex flex-col gap-2">
                                {availableAreas.length > 0 && (() => {
                                    const isUnassigned = !selectedNode.data.label || selectedNode.data.label === 'Unassigned Geometry';
                                    return (
                                        <>
                                            <label className="text-[10px] font-bold text-amber-500 uppercase tracking-wider block">
                                                {isUnassigned ? 'Merge with Pre-Registered Area' : 'Reassign Map Geometry'}
                                            </label>
                                            <p className="text-[10px] text-amber-500/70 mb-1 leading-snug">
                                                {isUnassigned ? 'Select an unmapped Area to inject its details here and link them.' : 'Warning: Selecting a new Area will overwrite this geometry\'s current identity.'}
                                            </p>
                                            <select 
                                                className="w-full bg-zinc-950 border border-amber-500/30 rounded-lg px-3 py-2 text-sm text-amber-500 focus:outline-none focus:border-amber-400 cursor-pointer"
                                                onChange={(e) => {
                                                    if (e.target.value) handleLinkArea(e.target.value);
                                                    e.target.value = "";
                                                }}
                                                defaultValue=""
                                            >
                                                <option value="" disabled>
                                                    {isUnassigned ? '-- Select Registry Area to Assign --' : '-- Reassign to Different Area --'}
                                                </option>
                                                {availableAreas.map(a => {
                                                    const isMapped = a.points && a.points.length > 0;
                                                    const isCurrent = a.id === selectedNodeId;
                                                    return (
                                                        <option key={a.id} value={a.id} disabled={isMapped || isCurrent}>
                                                            {a.label || 'Unnamed'} {isCurrent ? ' (This Polygon)' : isMapped ? ' (Already Mapped)' : ' (Unmapped)'}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </>
                                    );
                                })()}
                                <button 
                                    onClick={() => window.open('/business/manage?tab=areas', '_blank')}
                                    className="w-full bg-zinc-950 border border-amber-500/30 hover:border-amber-400 text-amber-500 rounded-lg px-3 py-2 text-xs font-bold transition-colors flex items-center justify-center gap-2 mt-1"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Registry: Add / Edit Areas <ExternalLink className="w-3 h-3 ml-1" />
                                </button>
                            </div>
                        )}

                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Name / Label</label>
                                <div className="text-sm font-bold text-white truncate px-1">{(selectedNode.data.label as string) || 'Unassigned Geometry'}</div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3 border-t border-zinc-800 pt-3">
                                <div>
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Type</label>
                                    <div className="text-sm text-zinc-300 font-medium px-1">{(selectedNode.data.type as string) || 'Other'}</div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Status</label>
                                    <div className="text-sm font-bold text-zinc-300 px-1">{(selectedNode.data.status as string) || 'Clear'}</div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pb-3">
                            <div>
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Width <span className="text-zinc-600">(ft)</span></label>
                                <input 
                                    type="number"
                                    disabled={!canManage}
                                    value={selectedNode.data.width !== undefined ? Number(((selectedNode.data.width as number) / 10).toFixed(2)) : 0}
                                    onChange={(e) => rescaleSelectedNode(parseFloat(e.target.value) * 10, undefined)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                                    min="0"
                                    step="0.5"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Length <span className="text-zinc-600">(ft)</span></label>
                                <input 
                                    type="number"
                                    disabled={!canManage}
                                    value={selectedNode.data.height !== undefined ? Number(((selectedNode.data.height as number) / 10).toFixed(2)) : 0}
                                    onChange={(e) => rescaleSelectedNode(undefined, parseFloat(e.target.value) * 10)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                                    min="0"
                                    step="0.5"
                                />
                            </div>
                        </div>



                        {/* Future Expansion for dynamic attributes can go here */}


                        {canManage && (
                            <div className="pt-8 w-full flex flex-col gap-3 mt-4">
                                <button 
                                    onClick={() => window.open('/business/manage?tab=areas', '_blank')}
                                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-xl py-2.5 font-bold text-sm transition-colors flex items-center justify-center gap-2"
                                >
                                    <ExternalLink className="w-4 h-4 text-accent" /> Manage Operational Data
                                </button>
                                <button 
                                    onClick={() => {
                                        if (!window.confirm("Delete this map node? The logical Area data will remain in the registry if mapped, but geometry will be destroyed.")) return;
                                        setAllNodes(prev => prev.filter(n => n.id !== selectedNodeId));
                                        hasUnsavedChangesRef.current = true;
                                        if (tenantId && tenantId !== 'GLOBAL') {
                                            deleteDoc(doc(db, 'business_zones', selectedNodeId)).catch(console.error);
                                        }
                                        setSelectedNodeId(null);
                                    }}
                                    className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl py-2.5 font-bold text-sm transition-colors flex items-center justify-center gap-2"
                                >
                                    <Trash2 className="w-4 h-4" /> Drop Node
                                </button>
                            </div>
                        )}

                    </div>
                </div>
            )}
            
            {/* Draw Mode Active Toast overlay */}
            {isDrawing && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-white px-6 py-2 rounded-full font-bold shadow-xl flex items-center gap-3 animate-bounce">
                    <MousePointer2 className="w-4 h-4" />
                    <span>
                        Drawing Active. Enter to commit shape.
                        {typedDistance ? <span className="ml-2 font-mono bg-black/20 px-2 py-0.5 rounded text-yellow-100">{typedDistance} ft</span> : <span className="ml-2 text-white/70">Type numbers to snap length.</span>}
                    </span>
                </div>
            )}

            {/* Add Object Modal */}
            {isObjectModalOpen && (
                <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-6 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-white text-lg">Deploy Spatial Geometry</h3>
                            <button onClick={() => setIsObjectModalOpen(false)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5"/></button>
                        </div>

                        <div className="bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[11px] p-3 rounded-lg leading-snug">
                            This creates an unassigned geometric zone on the map. You MUST link this footprint to an Area in your Management Registry using the side panel in order to give it a name and type.
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Width (ft)</label>
                                <input type="number" min="0.5" step="0.5" value={objFormData.widthFt} onChange={e => setObjFormData({...objFormData, widthFt: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Length (ft)</label>
                                <input type="number" min="0.5" step="0.5" value={objFormData.lengthFt} onChange={e => setObjFormData({...objFormData, lengthFt: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent" />
                            </div>
                        </div>



                        <button onClick={confirmAddObject} className="w-full bg-accent hover:bg-accent-hover text-white rounded-xl py-3 font-bold text-sm transition-colors mt-2">
                            Deploy to Map
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export function FacilityMapTab({ tenantId, readOnly = false }: { tenantId: string, readOnly?: boolean }) {
    const { currentUser } = useAuth();
    return (
        <ReactFlowProvider>
            <MapCanvasCore tenantId={tenantId} user={currentUser} readOnly={readOnly} />
        </ReactFlowProvider>
    );
}
