import { useState, useCallback, useEffect, useRef } from 'react';
import { applyNodeChanges, applyEdgeChanges, addEdge, Panel, Background, BackgroundVariant, ReactFlow, Controls } from '@xyflow/react';
import type { Connection, Edge, Node, NodeChange, EdgeChange, ReactFlowInstance, OnConnectEnd } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { IdeaNode, type OutputPin } from './canvas/IdeaNode';
import { IdeaEdge } from './canvas/IdeaEdge';
import { db } from '../../lib/firebase/config';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Loader2, Save, Plus, X, ArrowLeft, Info, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../lib/auth/store';

const nodeTypes = {
    idea: IdeaNode,
};

const edgeTypes = {
    idea: IdeaEdge,
};

// Initial setup to avoid blank canvas errors
const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

export function WorkflowCanvasTab({ tenantId, canvasId, onBack }: { tenantId: string, canvasId: string, onBack: () => void }) {
    const { user, permissions, isSuperAdmin } = useAuthStore();
    const readOnly = !(isSuperAdmin || permissions['whiteboards.manage']);

    const [nodes, setNodes] = useState<Node[]>(initialNodes);
    const [edges, setEdges] = useState<Edge[]>(initialEdges);
    const [canvasName, setCanvasName] = useState<string>('Loading Canvas...');
    
    // Fix stale closures for functions embedded in node data
    const nodesRef = useRef(nodes);
    const hasUnsavedChangesRef = useRef(false);
    useEffect(() => {
        nodesRef.current = nodes;
    }, [nodes]);

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isCanvasLoaded, setIsCanvasLoaded] = useState(false);
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

    // Modal state for creating new node
    const [showModal, setShowModal] = useState(false);
    const [showInstructions, setShowInstructions] = useState(true);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [insertNodeTargetEdgeId, setInsertNodeTargetEdgeId] = useState<string | null>(null);
    const [quickAddSource, setQuickAddSource] = useState<string | null>(null);
    const [quickAddSourceHandle, setQuickAddSourceHandle] = useState<string | null>(null);
    const [quickAddIsTarget, setQuickAddIsTarget] = useState(false);
    const [quickAddPosition, setQuickAddPosition] = useState<{ x: number, y: number } | null>(null);
    const [newNodeData, setNewNodeData] = useState({
        label: '',
        description: '',
        type: 'idea',
        priority: 'normal'
    });


    const handleSave = useCallback(async () => {
        if (readOnly) return;
        if (!tenantId || tenantId === 'GLOBAL') return;
        setIsSaving(true);
        
        const cleanNodes = nodes.map(n => {
            const cleanData = { ...n.data };
            delete cleanData.onDelete;
            delete cleanData.onEdit;
            delete cleanData.onAddOutput;
            delete cleanData.onEditOutput;
            delete cleanData.onDeleteOutput;
            delete cleanData.onReorderOutputs;
            delete cleanData.onOutputColorChange;
            delete cleanData.onNodeColorChange;
            delete cleanData.readOnly;
            return {
                ...n,
                data: cleanData
            };
        });

        const cleanEdges = edges.map(e => {
            const cleanData = { ...e.data };
            delete cleanData.onInsertNode;
            delete cleanData.onLabelDrag;
            delete cleanData.readOnly;
            return JSON.parse(JSON.stringify({ ...e, data: cleanData }));
        });

        try {
            await setDoc(doc(db, 'business_canvases', canvasId), {
                nodes: cleanNodes,
                edges: cleanEdges,
                updatedBy: user?.displayName || user?.email || 'Unknown User',
                updatedAt: new Date()
            }, { merge: true });
            hasUnsavedChangesRef.current = false;
        } catch (err) {
            console.error("Failed to save canvas", err);
            toast.error("Failed to save canvas.");
        } finally {
            setIsSaving(false);
        }
    }, [nodes, edges, tenantId, canvasId, readOnly, user]);

    // Autosave mechanism
    useEffect(() => {
        if (readOnly) return;
        if (!isCanvasLoaded || !hasUnsavedChangesRef.current) return;
        const timer = setTimeout(() => {
            handleSave();
        }, 1500); // 1.5s debounce
        return () => clearTimeout(timer);
    }, [nodes, edges, isCanvasLoaded, handleSave, readOnly]);

    // Initial load auto-zoom
    useEffect(() => {
        if (isCanvasLoaded && rfInstance && nodes.length > 0) {
            setTimeout(() => {
                rfInstance.fitView({ duration: 800, padding: 0.3 });
            }, 100);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCanvasLoaded, rfInstance]);

    const handleDeleteNode = useCallback((id: string) => {
        if (readOnly) return;
        setNodes((nds) => nds.filter(node => node.id !== id));
        setEdges((eds) => eds.filter(edge => edge.source !== id && edge.target !== id));
        hasUnsavedChangesRef.current = true;
    }, [readOnly]);

    const handleAddOutput = useCallback((nodeId: string, label: string = 'Action Route') => {
        if (readOnly) return;
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId) {
                const currentOutputs = (node.data.outputs as OutputPin[]) || [{ id: `out_${node.id}`, label: 'Next' }];
                return {
                    ...node,
                    data: {
                        ...node.data,
                        outputs: [...currentOutputs, { id: `out_${Date.now()}`, label }]
                    }
                };
            }
            return node;
        }));
        hasUnsavedChangesRef.current = true;
    }, [readOnly]);

    const handleEditOutput = useCallback((nodeId: string, outputId: string, newLabel: string) => {
        if (readOnly) return;
        if (newLabel && newLabel.trim().length > 0) {
            setNodes((nds) => nds.map((node) => {
                if (node.id === nodeId) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            outputs: ((node.data.outputs as OutputPin[]) || []).map((out) => out.id === outputId ? { ...out, label: newLabel.trim() } : out)
                        }
                    };
                }
                return node;
            }));
            hasUnsavedChangesRef.current = true;
        }
    }, [readOnly]);

    const handleDeleteOutput = useCallback((nodeId: string, outputId: string) => {
        if (readOnly) return;
        if (!window.confirm("Delete this output route? Any connected wires will be cut.")) return;
        
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId) {
                if (((node.data.outputs as OutputPin[]) || []).length <= 1) return node;
                
                return {
                    ...node,
                    data: {
                        ...node.data,
                        outputs: (node.data.outputs as OutputPin[]).filter((out) => out.id !== outputId)
                    }
                };
            }
            return node;
        }));
        setEdges((eds) => eds.filter(edge => edge.sourceHandle !== outputId));
        hasUnsavedChangesRef.current = true;
    }, [readOnly]);

    const handleReorderOutputs = useCallback((nodeId: string, newOutputs: OutputPin[]) => {
        if (readOnly) return;
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId) {
                return {
                    ...node,
                    data: {
                        ...node.data,
                        outputs: newOutputs
                    }
                };
            }
            return node;
        }));
        hasUnsavedChangesRef.current = true;
    }, [readOnly]);

    const handleOutputColorChange = useCallback((nodeId: string, outputId: string, color: string) => {
        if (readOnly) return;
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId) {
                return {
                    ...node,
                    data: {
                        ...node.data,
                        outputs: ((node.data.outputs as OutputPin[]) || []).map((out) => out.id === outputId ? { ...out, color } : out)
                    }
                };
            }
            return node;
        }));
        setEdges((eds) => eds.map((edge) => {
            if (edge.source === nodeId && edge.sourceHandle === outputId) {
                return {
                    ...edge,
                    style: { ...edge.style, stroke: color, strokeWidth: edge.style?.strokeWidth || 2 }
                };
            }
            return edge;
        }));
        hasUnsavedChangesRef.current = true;
    }, [readOnly]);

    const handleNodeColorChange = useCallback((nodeId: string, color: string) => {
        if (readOnly) return;
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId) {
                return {
                    ...node,
                    data: {
                        ...node.data,
                        color
                    }
                };
            }
            return node;
        }));
        hasUnsavedChangesRef.current = true;
    }, [readOnly]);

    const onNodesChange = useCallback(
        (changes: NodeChange[]) => {
            if (readOnly) return;
            setNodes((nds) => applyNodeChanges(changes, nds));
            hasUnsavedChangesRef.current = true;
        },
        [readOnly]
    );

    const onEdgesChange = useCallback(
        (changes: EdgeChange[]) => {
            if (readOnly) return;
            setEdges((eds) => applyEdgeChanges(changes, eds));
            hasUnsavedChangesRef.current = true;
        },
        [readOnly]
    );

    const handleInsertNodeClick = useCallback((id: string) => {
        if (readOnly) return;
        setInsertNodeTargetEdgeId(id);
        setEditingNodeId(null);
        setQuickAddSource(null);
        setQuickAddPosition(null);
        setNewNodeData({ label: '', description: '', type: 'workflow', priority: 'normal' });
        setShowModal(true);
    }, [readOnly]);

    const onConnect = useCallback(
        (params: Connection) => {
            if (readOnly) return;
            const sourceNode = nodesRef.current.find(n => n.id === params.source);
            const sourcePin = (sourceNode?.data?.outputs as OutputPin[] || []).find(p => p.id === params.sourceHandle);
            const routeColor = sourcePin?.color || '#0ea5e9';

            const newEdge = { 
                ...params, 
                type: 'idea',
                animated: true, 
                style: { stroke: routeColor, strokeWidth: 2 },
                data: { 
                    readOnly,
                    onInsertNode: handleInsertNodeClick,
                    onLabelDrag: () => { if (!readOnly) hasUnsavedChangesRef.current = true; }
                }
            };
            setEdges((eds) => addEdge(newEdge, eds));
            hasUnsavedChangesRef.current = true;
        },
        [readOnly, handleInsertNodeClick]
    );

    const handleEditNodeClick = useCallback((id: string) => {
        if (readOnly) return;
        const nodeToEdit = nodesRef.current.find((n: Node) => n.id === id);
        if (!nodeToEdit) return;
        setEditingNodeId(nodeToEdit.id);
        setNewNodeData({
            label: (nodeToEdit.data.label as string) || '',
            description: (nodeToEdit.data.description as string) || '',
            type: (nodeToEdit.data.type as string) || 'idea',
            priority: (nodeToEdit.data.priority as string) || 'normal'
        });
        setShowModal(true);
    }, [readOnly]);

    const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
        if (readOnly) return;
        handleEditNodeClick(node.id);
    }, [handleEditNodeClick, readOnly]);

    const onConnectEnd: OnConnectEnd = useCallback((event, connectionState) => {
        if (readOnly) return;
        if (!connectionState.isValid && rfInstance) {
            const clientX = 'changedTouches' in event ? event.changedTouches[0].clientX : event.clientX;
            const clientY = 'changedTouches' in event ? event.changedTouches[0].clientY : event.clientY;
            
            const position = rfInstance.screenToFlowPosition({ x: clientX, y: clientY });
            
            const isTarget = ['top', 'left'].includes(connectionState.fromHandle?.id || '');
            
            setQuickAddSource(connectionState.fromNode?.id || null);
            setQuickAddSourceHandle(connectionState.fromHandle?.id || null);
            setQuickAddIsTarget(isTarget);
            setQuickAddPosition(position);
            setEditingNodeId(null);
            setNewNodeData({ label: '', description: '', type: 'workflow', priority: 'normal' });
            setShowModal(true);
        }
    }, [rfInstance, readOnly]);

    const handleDoubleClick = useCallback((event: React.MouseEvent) => {
        if (readOnly) return;
        if (!rfInstance) return;
        const target = event.target as HTMLElement;
        if (!target.classList.contains('react-flow__pane')) return;

        event.preventDefault();
        
        const position = rfInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });
        
        setQuickAddIsTarget(false);
        setQuickAddSource(null);
        setQuickAddSourceHandle(null);
        setQuickAddPosition(position);
        setInsertNodeTargetEdgeId(null);
        setEditingNodeId(null);
        setNewNodeData({ label: '', description: '', type: 'idea', priority: 'normal' });
        setShowModal(true);
    }, [rfInstance, readOnly]);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL') return;
        
        let isMounted = true;
        const docRef = doc(db, 'business_canvases', canvasId);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setCanvasName(data.name || 'Untitled Canvas');

                // If we are actively driving/dragging on this client, ignore incoming snaps to prevent jitter
                if (hasUnsavedChangesRef.current) return;
                
                const loadedNodes = (data.nodes || []).map((node: Node) => {
                    const migratedOutputs = (node.data.outputs as OutputPin[]) || [{ id: `out_${node.id}`, label: 'Next' }];
                    
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            readOnly,
                            outputs: migratedOutputs,
                            onDelete: handleDeleteNode,
                            onEdit: handleEditNodeClick,
                            onAddOutput: handleAddOutput,
                            onEditOutput: handleEditOutput,
                            onDeleteOutput: handleDeleteOutput,
                            onReorderOutputs: handleReorderOutputs,
                            onOutputColorChange: handleOutputColorChange,
                            onNodeColorChange: handleNodeColorChange
                        }
                    };
                });
                
                const loadedEdges = (data.edges || []).map((edge: Edge) => {
                    const safeSourceHandle = (!edge.sourceHandle || edge.sourceHandle === 'left' || edge.sourceHandle === 'top' || edge.sourceHandle === 'right' || edge.sourceHandle === 'bottom' || edge.sourceHandle === 'default') 
                        ? `out_${edge.source}` 
                        : edge.sourceHandle;
                    const safeTargetHandle = 'target';

                    return {
                        ...edge,
                        sourceHandle: safeSourceHandle,
                        targetHandle: safeTargetHandle,
                        type: 'idea',
                        data: {
                            ...edge.data,
                            readOnly,
                            onInsertNode: handleInsertNodeClick,
                            onLabelDrag: () => { if (!readOnly) hasUnsavedChangesRef.current = true; }
                        }
                    };
                });
                
                if (isMounted) {
                    setNodes(loadedNodes);
                    setEdges(loadedEdges);
                    setIsLoading(false);
                    setIsCanvasLoaded(true);
                }
            } else if (isMounted) {
                setIsLoading(false);
                setIsCanvasLoaded(true);
            }
        }, (err) => {
            console.error("Failed to load canvas data", err);
            toast.error("Failed to sync realtime workflow canvas.");
            if (isMounted) {
                setIsLoading(false);
                setIsCanvasLoaded(true);
            }
        });

        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, [
        tenantId,
        canvasId,
        readOnly,
        handleDeleteNode,
        handleEditNodeClick,
        handleAddOutput,
        handleEditOutput,
        handleDeleteOutput,
        handleReorderOutputs,
        handleOutputColorChange,
        handleNodeColorChange,
        handleInsertNodeClick
    ]);

    const handleSaveNode = (e: React.FormEvent) => {
        e.preventDefault();
        if (readOnly) return;
        
        if (editingNodeId) {
            setNodes(nds => nds.map(n => n.id === editingNodeId ? {
                ...n,
                data: { ...n.data, ...newNodeData }
            } : n));
        } else {
            const id = `node_${Date.now()}`;
            
            let calculatedPosition = quickAddPosition || { x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 100 };
            const edgeToReplace = insertNodeTargetEdgeId ? edges.find(e => e.id === insertNodeTargetEdgeId) : null;
            
            if (edgeToReplace) {
                const srcNode = nodes.find(n => n.id === edgeToReplace.source);
                const tgtNode = nodes.find(n => n.id === edgeToReplace.target);
                if (srcNode && tgtNode) {
                    calculatedPosition = {
                        x: (srcNode.position.x + tgtNode.position.x) / 2,
                        y: (srcNode.position.y + tgtNode.position.y) / 2
                    };
                }
            }
            
            const newNode: Node = {
                id,
                type: 'idea',
                position: calculatedPosition,
                data: {
                    ...newNodeData,
                    readOnly,
                    outputs: [{ id: `out_${id}`, label: 'Next' }],
                    onDelete: handleDeleteNode,
                    onEdit: handleEditNodeClick,
                    onAddOutput: handleAddOutput,
                    onEditOutput: handleEditOutput,
                    onDeleteOutput: handleDeleteOutput,
                    onReorderOutputs: handleReorderOutputs,
                    onOutputColorChange: handleOutputColorChange,
                    onNodeColorChange: handleNodeColorChange
                }
            };
            
            setNodes((nds) => [...nds, newNode]);
            
            if (edgeToReplace) {
                setEdges(eds => [
                    ...eds.filter(e => e.id !== edgeToReplace.id),
                    {
                        id: `e_${edgeToReplace.source}-${id}`,
                        type: 'idea',
                        source: edgeToReplace.source,
                        sourceHandle: edgeToReplace.sourceHandle,
                        target: id,
                        targetHandle: 'target',
                        animated: true,
                        style: edgeToReplace.style || { stroke: '#0ea5e9', strokeWidth: 2 },
                        data: { 
                            readOnly,
                            onInsertNode: handleInsertNodeClick,
                            onLabelDrag: () => { if (!readOnly) hasUnsavedChangesRef.current = true; }
                        }
                    },
                    {
                        id: `e_${id}-${edgeToReplace.target}`,
                        type: 'idea',
                        source: id,
                        sourceHandle: `out_${id}`,
                        target: edgeToReplace.target,
                        targetHandle: edgeToReplace.targetHandle,
                        animated: true,
                        style: { stroke: '#0ea5e9', strokeWidth: 2 },
                        data: { 
                            readOnly,
                            onInsertNode: handleInsertNodeClick,
                            onLabelDrag: () => { if (!readOnly) hasUnsavedChangesRef.current = true; }
                        }
                    }
                ]);
            } else if (quickAddSource) {
                const newEdgeSource = quickAddIsTarget ? id : quickAddSource;
                const newEdgeTarget = quickAddIsTarget ? quickAddSource : id;
                
                const newEdgeSourceHandle = quickAddIsTarget ? `out_${id}` : quickAddSourceHandle;
                const newEdgeTargetHandle = 'target';

                const srcNode = nodes.find(n => n.id === newEdgeSource);
                const outPin = (srcNode?.data?.outputs as OutputPin[] || []).find(p => p.id === newEdgeSourceHandle);
                const routeColor = outPin?.color || '#0ea5e9';

                setEdges(eds => addEdge({
                    id: `e_${newEdgeSource}-${newEdgeTarget}`,
                    type: 'idea',
                    source: newEdgeSource,
                    sourceHandle: newEdgeSourceHandle,
                    target: newEdgeTarget,
                    targetHandle: newEdgeTargetHandle,
                    animated: true,
                    style: { stroke: routeColor, strokeWidth: 2 },
                    data: { 
                        readOnly,
                        onInsertNode: handleInsertNodeClick,
                        onLabelDrag: () => { if (!readOnly) hasUnsavedChangesRef.current = true; }
                    }
                }, eds));
            }
            
            hasUnsavedChangesRef.current = true;
        }
        
        setShowModal(false);
        setEditingNodeId(null);
        setInsertNodeTargetEdgeId(null);
        setQuickAddSource(null);
        setQuickAddSourceHandle(null);
        setQuickAddIsTarget(false);
        setQuickAddPosition(null);
        setNewNodeData({ label: '', description: '', type: 'idea', priority: 'normal' });
    };

    if (isLoading) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 font-bold text-zinc-500 uppercase tracking-widest text-sm min-h-[300px]">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-accent" />
                Loading Topology...
            </div>
        );
    }

    return (
        <div className="w-full h-full bg-zinc-950 relative min-h-[500px]" onDoubleClick={handleDoubleClick}>
            <div className="absolute top-4 left-4 z-10 flex gap-2 items-center">
                <button 
                    onClick={onBack}
                    className="flex items-center justify-center w-8 h-8 bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold rounded-lg hover:bg-zinc-800 hover:border-zinc-700 hover:text-white transition-all shadow-lg"
                    title="Return to Gallery"
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center h-8 px-4 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800/80 text-white text-sm font-bold rounded-lg shadow-lg">
                    {canvasName}
                </div>
            </div>
            
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onInit={setRfInstance}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onConnectEnd={onConnectEnd}
                onNodeDoubleClick={onNodeDoubleClick}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                nodesDraggable={!readOnly}
                nodesConnectable={!readOnly}
                fitView
                zoomOnDoubleClick={false}
                className="bg-zinc-950"
                minZoom={0.2}
                maxZoom={4}
                defaultEdgeOptions={{
                    animated: true,
                    style: { stroke: '#52525b', strokeWidth: 2 }
                }}
            >
                <Background variant={BackgroundVariant.Dots} gap={24} size={2} color="#27272a" />
                <Controls className="bg-zinc-900 border border-zinc-800 text-white fill-white" />
                
                <Panel position="top-right" className="m-4 flex gap-2">
                    {readOnly ? (
                        <div className="bg-rose-950/85 border border-rose-900/50 px-4 py-2.5 rounded-xl text-xs font-bold text-rose-300 shadow-xl flex items-center justify-center gap-2">
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Read-Only Mode
                        </div>
                    ) : (
                        <>
                            <button 
                                onClick={() => setShowModal(true)}
                                className="bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 px-4 py-2.5 rounded-xl font-bold text-sm shadow-xl flex items-center gap-2 transition-colors"
                            >
                                <Plus className="w-4 h-4" /> Add Node
                            </button>
                            <div className="bg-zinc-900 border border-zinc-700 px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-400 shadow-xl flex items-center justify-center gap-2">
                                {isSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin text-accent" /> Auto-saving...</> : <><Save className="w-3.5 h-3.5" /> Saved</>}
                            </div>
                        </>
                    )}
                </Panel>
            </ReactFlow>

            {/* Instructions Floating Panel */}
            {showInstructions ? (
                <div className="absolute bottom-6 left-6 z-10 w-80 bg-zinc-900/90 backdrop-blur-md border border-zinc-800/80 rounded-xl p-4 shadow-2xl flex flex-col pointer-events-auto">
                    <div className="flex items-center justify-between mb-3 border-b border-zinc-800/80 pb-2">
                        <div className="flex items-center gap-2 text-zinc-300 font-bold text-sm">
                            <Info className="w-4 h-4 text-blue-400" />
                            Canvas Controls {readOnly && <span className="text-[10px] text-rose-400 font-bold ml-1">(Read-Only)</span>}
                        </div>
                        <button onClick={() => setShowInstructions(false)} className="text-zinc-500 hover:text-red-400 transition-colors p-1 bg-zinc-800/50 hover:bg-zinc-800 rounded">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <ul className="text-[11px] text-zinc-400 space-y-3 leading-relaxed">
                        {!readOnly ? (
                            <>
                                <li>• <strong className="text-zinc-200">Double-Click Canvas:</strong> Instantly spawn a new node.</li>
                                <li>• <strong className="text-zinc-200">Batch Dragging:</strong> Hold <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-200 border border-zinc-700">Shift</code> and drag, or <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-200 border border-zinc-700">Ctrl</code> + click, to move multiple nodes at once.</li>
                                <li>• <strong className="text-zinc-200">Drag Wires:</strong> Pull blue routing pins from the right side to create connections.</li>
                                <li>• <strong className="text-zinc-200">Wire Actions:</strong> Hover wires and tap <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-200 border border-zinc-700">+</code> to insert a node seamlessly, or <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-200 border border-zinc-700">x</code> to cut.</li>
                                <li>• <strong className="text-zinc-200">Output Pins:</strong> Click <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-200 border border-zinc-700">+</code> on a node to add a new route. Rename pins inline, and reorder using the arrows.</li>
                            </>
                        ) : (
                            <>
                                <li>• <strong className="text-zinc-200">Viewing Mode:</strong> You do not have permissions to edit this whiteboard.</li>
                                <li>• <strong className="text-zinc-200">Navigation:</strong> Drag the canvas to pan, scroll to zoom in/out.</li>
                                <li>• <strong className="text-zinc-200">Inspect Details:</strong> Double-click nodes or edit buttons are disabled.</li>
                            </>
                        )}
                    </ul>
                </div>
            ) : (
                <button 
                    onClick={() => setShowInstructions(true)}
                    className="absolute bottom-6 left-6 z-10 w-10 h-10 bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold rounded-lg hover:bg-zinc-800 hover:text-white hover:border-zinc-700 transition-all shadow-lg items-center justify-center pointer-events-auto flex"
                    title="Show Commands"
                >
                    <Info className="w-5 h-5 text-blue-400" />
                </button>
            )}

            {/* Modal for creating/editing a node */}
            {showModal && !readOnly && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-md shadow-2xl p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black text-white">{editingNodeId ? 'Edit Node' : 'Create New Node'}</h2>
                            <button onClick={() => {
                                setShowModal(false);
                                setEditingNodeId(null);
                                setQuickAddSource(null);
                                setInsertNodeTargetEdgeId(null);
                                setQuickAddPosition(null);
                            }} className="p-1 text-zinc-500 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSaveNode} className="space-y-4">
                            <div>
                                <label htmlFor="node-title-input" className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Title</label>
                                <input 
                                    id="node-title-input"
                                    type="text" 
                                    required
                                    autoFocus
                                    value={newNodeData.label}
                                    onChange={e => setNewNodeData({...newNodeData, label: e.target.value})}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-accent"
                                    placeholder="e.g. Receive Invoice"
                                />
                            </div>
                            <div>
                                <label htmlFor="node-desc-input" className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Description <span className="text-zinc-700">(Optional)</span></label>
                                <textarea 
                                    id="node-desc-input"
                                    value={newNodeData.description}
                                    onChange={e => setNewNodeData({...newNodeData, description: e.target.value})}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-accent resize-y min-h-[80px]"
                                    placeholder="Brief details about what happens in this step..."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="node-type-select" className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Type</label>
                                    <select 
                                        id="node-type-select"
                                        value={newNodeData.type}
                                        onChange={e => setNewNodeData({...newNodeData, type: e.target.value})}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white outline-none focus:border-accent"
                                    >
                                        <option value="workflow">Process Step</option>
                                        <option value="feature">Feature Request</option>
                                        <option value="idea">Idea</option>
                                        <option value="bug">Bug</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="node-priority-select" className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Priority</label>
                                    <select 
                                        id="node-priority-select"
                                        value={newNodeData.priority}
                                        onChange={e => setNewNodeData({...newNodeData, priority: e.target.value})}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white outline-none focus:border-accent"
                                    >
                                        <option value="low">Low</option>
                                        <option value="normal">Normal</option>
                                        <option value="high">High</option>
                                        <option value="urgent">Urgent</option>
                                    </select>
                                </div>
                            </div>
                            <div className="pt-4">
                                <button type="submit" className="w-full bg-accent hover:bg-accent-hover text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-accent/20">
                                    {editingNodeId ? 'Save Node Changes' : 'Drop Node on Canvas'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
