import { useState, useCallback, useEffect, useRef } from 'react';
import { applyNodeChanges, applyEdgeChanges, addEdge, Panel, Background, BackgroundVariant, ReactFlow, Controls } from '@xyflow/react';
import type { Connection, Edge, Node, NodeChange, EdgeChange, ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { IdeaNode } from './canvas/IdeaNode';
import { IdeaEdge } from './canvas/IdeaEdge';
import { db } from '../../../lib/firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Loader2, Save, Plus, X, ArrowLeft, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';

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
    const { currentUser } = useAuth();
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

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL') return;
        
        let isMounted = true;
        const docRef = doc(db, 'business_canvases', canvasId);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setCanvasName(data.name || 'Untitled Canvas');

                // If we are actively driving/dragging on this client, ignore incoming snaps to prevent jitter
                // We'll safely re-sync on the next snapshot AFTER our own save completes and resets the flag.
                if (hasUnsavedChangesRef.current) return;
                
                const loadedNodes = (data.nodes || []).map((node: Node) => {
                    // Backwards compatibility migration
                    const migratedOutputs = node.data.outputs || [{ id: `out_${node.id}`, label: 'Next' }];
                    
                    return {
                        ...node,
                        data: {
                            ...node.data,
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
                    // Sanitize old corrupted edges where dragging backwards caused React Flow to save target handles into source slots
                    let safeSourceHandle = edge.sourceHandle;
                    let safeTargetHandle = edge.targetHandle;
                    
                    // Legacy sanitization: Force old multi-directional targets directly into the sole universal target pin
                    safeTargetHandle = 'target';
                    
                    // Legacy sanitization: if the source was right/bottom/left/top/default, default it to the new array standard
                    if (!safeSourceHandle || safeSourceHandle === 'left' || safeSourceHandle === 'top' || safeSourceHandle === 'right' || safeSourceHandle === 'bottom' || safeSourceHandle === 'default') {
                         safeSourceHandle = `out_${edge.source}`; 
                    }

                    return {
                        ...edge,
                        sourceHandle: safeSourceHandle,
                        targetHandle: safeTargetHandle,
                        type: 'idea', // Force old default edges into our custom component
                        data: {
                            ...edge.data,
                            onInsertNode: handleInsertNodeClick,
                            onLabelDrag: () => { hasUnsavedChangesRef.current = true; }
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
                // Document doesn't exist, just mark as loaded so they have a blank canvas
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId, canvasId]);

    const handleSave = useCallback(async () => {
        if (!tenantId || tenantId === 'GLOBAL') return;
        setIsSaving(true);
        // Remove functions from nodes mapping to clean up the object for Firestore
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
            return {
                ...n,
                data: cleanData
            };
        });

        const cleanEdges = edges.map(e => {
            const cleanData = { ...e.data };
            delete cleanData.onInsertNode;
            delete cleanData.onLabelDrag;
            return JSON.parse(JSON.stringify({ ...e, data: cleanData }));
        });

        try {
            await setDoc(doc(db, 'business_canvases', canvasId), {
                nodes: cleanNodes,
                edges: cleanEdges,
                updatedBy: currentUser?.displayName || currentUser?.email || 'Unknown User',
                updatedAt: new Date()
            }, { merge: true });
            hasUnsavedChangesRef.current = false;
        } catch (err) {
            console.error("Failed to save canvas", err);
            toast.error("Failed to save canvas.");
        } finally {
            setIsSaving(false);
        }
    }, [nodes, edges, tenantId, canvasId]);

    // Autosave mechanism
    useEffect(() => {
        if (!isCanvasLoaded || !hasUnsavedChangesRef.current) return;
        const timer = setTimeout(() => {
            handleSave();
        }, 1500); // 1.5s debounce
        return () => clearTimeout(timer);
    }, [nodes, edges, isCanvasLoaded, handleSave]);

    // Initial load auto-zoom
    useEffect(() => {
        if (isCanvasLoaded && rfInstance && nodes.length > 0) {
            setTimeout(() => {
                rfInstance.fitView({ duration: 800, padding: 0.3 });
            }, 100);
        }
    // Only run this when the canvas officially flips to loaded, or rfInstance becomes ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCanvasLoaded, rfInstance]);

    const handleDeleteNode = useCallback((id: string) => {
        setNodes((nds) => nds.filter(node => node.id !== id));
        setEdges((eds) => eds.filter(edge => edge.source !== id && edge.target !== id));
        hasUnsavedChangesRef.current = true;
    }, []);

    const handleAddOutput = useCallback((nodeId: string, label: string = 'Action Route') => {
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId) {
                const currentOutputs = (node.data.outputs as any[]) || [{ id: `out_${node.id}`, label: 'Next' }];
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
    }, []);

    const handleEditOutput = useCallback((nodeId: string, outputId: string, newLabel: string) => {
        if (newLabel && newLabel.trim().length > 0) {
            setNodes((nds) => nds.map((node) => {
                if (node.id === nodeId) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            outputs: ((node.data.outputs as any[]) || []).map((out: any) => out.id === outputId ? { ...out, label: newLabel.trim() } : out)
                        }
                    };
                }
                return node;
            }));
            hasUnsavedChangesRef.current = true;
        }
    }, []);

    const handleDeleteOutput = useCallback((nodeId: string, outputId: string) => {
        if (!window.confirm("Delete this output route? Any connected wires will be cut.")) return;
        
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId) {
                // Prevent deleting the very last output
                if (((node.data.outputs as any[]) || []).length <= 1) return node;
                
                return {
                    ...node,
                    data: {
                        ...node.data,
                        outputs: (node.data.outputs as any[]).filter((out: any) => out.id !== outputId)
                    }
                };
            }
            return node;
        }));
        // Prune orphaned edges
        setEdges((eds) => eds.filter(edge => edge.sourceHandle !== outputId));
        hasUnsavedChangesRef.current = true;
    }, []);

    const handleReorderOutputs = useCallback((nodeId: string, newOutputs: any[]) => {
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
    }, []);

    const handleOutputColorChange = useCallback((nodeId: string, outputId: string, color: string) => {
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId) {
                return {
                    ...node,
                    data: {
                        ...node.data,
                        outputs: ((node.data.outputs as any[]) || []).map((out: any) => out.id === outputId ? { ...out, color } : out)
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
    }, []);

    const handleNodeColorChange = useCallback((nodeId: string, color: string) => {
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
    }, []);

    const onNodesChange = useCallback(
        (changes: NodeChange[]) => {
            setNodes((nds) => applyNodeChanges(changes, nds));
            hasUnsavedChangesRef.current = true;
        },
        []
    );

    const onEdgesChange = useCallback(
        (changes: EdgeChange[]) => {
            setEdges((eds) => applyEdgeChanges(changes, eds));
            hasUnsavedChangesRef.current = true;
        },
        []
    );

    const onConnect = useCallback(
        (params: Connection) => {
            const sourceNode = nodesRef.current.find(n => n.id === params.source);
            const sourcePin = ((sourceNode?.data?.outputs || []) as any[]).find(p => p.id === params.sourceHandle);
            const routeColor = sourcePin?.color || '#0ea5e9';

            const newEdge = { 
                ...params, 
                type: 'idea',
                animated: true, 
                style: { stroke: routeColor, strokeWidth: 2 },
                data: { 
                    onInsertNode: handleInsertNodeClick,
                    onLabelDrag: () => { hasUnsavedChangesRef.current = true; }
                }
            };
            setEdges((eds) => addEdge(newEdge, eds));
            hasUnsavedChangesRef.current = true;
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    const handleEditNodeClick = useCallback((id: string) => {
        // Read directly from the running ref to avoid stale closures attached to old loaded node callbacks
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
    }, []);

    const handleInsertNodeClick = useCallback((id: string) => {
        setInsertNodeTargetEdgeId(id);
        setEditingNodeId(null);
        setQuickAddSource(null);
        setQuickAddPosition(null);
        setNewNodeData({ label: '', description: '', type: 'workflow', priority: 'normal' });
        setShowModal(true);
    }, []);

    const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
        handleEditNodeClick(node.id);
    }, [handleEditNodeClick]);

    const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, connectionState: any) => {
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
    }, [rfInstance]);

    const handleDoubleClick = useCallback((event: React.MouseEvent) => {
        if (!rfInstance) return;
        const target = event.target as HTMLElement;
        // Only trigger if we clicked strictly on the empty canvas void!
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
    }, [rfInstance]);

    const handleSaveNode = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (editingNodeId) {
            setNodes(nds => nds.map(n => n.id === editingNodeId ? {
                ...n,
                data: { ...n.data, ...newNodeData }
            } : n));
        } else {
            const id = `node_${Date.now()}`;
            
            // If inserting between an edge, calc the halfway point
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
                // Remove the old edge and place the new node inline
                setEdges(eds => [
                    ...eds.filter(e => e.id !== edgeToReplace.id), // Remove original edge
                    {
                        id: `e_${edgeToReplace.source}-${id}`,
                        type: 'idea',
                        source: edgeToReplace.source,
                        sourceHandle: edgeToReplace.sourceHandle,
                        target: id,
                        targetHandle: 'target', // Universal Target
                        animated: true,
                        style: edgeToReplace.style || { stroke: '#0ea5e9', strokeWidth: 2 }, // Inherit original wire color profile
                        data: { 
                            onInsertNode: handleInsertNodeClick,
                            onLabelDrag: () => { hasUnsavedChangesRef.current = true; }
                        }
                    },
                    {
                        id: `e_${id}-${edgeToReplace.target}`,
                        type: 'idea',
                        source: id,
                        sourceHandle: `out_${id}`, // Uses new native default pin
                        target: edgeToReplace.target,
                        targetHandle: edgeToReplace.targetHandle,
                        animated: true,
                        style: { stroke: '#0ea5e9', strokeWidth: 2 },
                        data: { 
                            onInsertNode: handleInsertNodeClick,
                            onLabelDrag: () => { hasUnsavedChangesRef.current = true; }
                        }
                    }
                ]);
            } else if (quickAddSource) {
                // Blueprint Logic: Nodes ALWAYS output from Pins -> input into Targets
                // If dragged backwards from a universal Target input, the new node is the Source.
                const newEdgeSource = quickAddIsTarget ? id : quickAddSource;
                const newEdgeTarget = quickAddIsTarget ? quickAddSource : id;
                
                const newEdgeSourceHandle = quickAddIsTarget ? `out_${id}` : quickAddSourceHandle;
                const newEdgeTargetHandle = 'target'; // Always injects to Universal Target!

                const srcNode = nodes.find(n => n.id === newEdgeSource);
                const outPin = ((srcNode?.data?.outputs || []) as any[]).find(p => p.id === newEdgeSourceHandle);
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
                        onInsertNode: handleInsertNodeClick,
                        onLabelDrag: () => { hasUnsavedChangesRef.current = true; }
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
            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 font-bold text-zinc-500 uppercase tracking-widest text-sm">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-accent" />
                Loading Topology...
            </div>
        );
    }

    return (
        <div className="w-full h-full bg-zinc-950 relative" onDoubleClick={handleDoubleClick}>
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
                onConnectEnd={onConnectEnd as any}
                onNodeDoubleClick={onNodeDoubleClick}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
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
                    <button 
                        onClick={() => setShowModal(true)}
                        className="bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 px-4 py-2.5 rounded-xl font-bold text-sm shadow-xl flex items-center gap-2 transition-colors"
                    >
                        <Plus className="w-4 h-4" /> Add Node
                    </button>
                    <div className="bg-zinc-900 border border-zinc-700 px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-400 shadow-xl flex items-center justify-center gap-2">
                        {isSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin text-accent" /> Auto-saving...</> : <><Save className="w-3.5 h-3.5" /> Saved</>}
                    </div>
                </Panel>
            </ReactFlow>

            {/* Instructions Floating Panel */}
            {showInstructions ? (
                <div className="absolute bottom-6 left-6 z-10 w-80 bg-zinc-900/90 backdrop-blur-md border border-zinc-800/80 rounded-xl p-4 shadow-2xl flex flex-col pointer-events-auto">
                    <div className="flex items-center justify-between mb-3 border-b border-zinc-800/80 pb-2">
                        <div className="flex items-center gap-2 text-zinc-300 font-bold text-sm">
                            <Info className="w-4 h-4 text-blue-400" />
                            Canvas Controls
                        </div>
                        <button onClick={() => setShowInstructions(false)} className="text-zinc-500 hover:text-red-400 transition-colors p-1 bg-zinc-800/50 hover:bg-zinc-800 rounded">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <ul className="text-[11px] text-zinc-400 space-y-3 leading-relaxed">
                        <li>• <strong className="text-zinc-200">Double-Click Canvas:</strong> Instantly spawn a new node.</li>
                        <li>• <strong className="text-zinc-200">Batch Dragging:</strong> Hold <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-200 border border-zinc-700">Shift</code> and drag, or <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-200 border border-zinc-700">Ctrl</code> + click, to move multiple nodes at once.</li>
                        <li>• <strong className="text-zinc-200">Drag Wires:</strong> Pull blue routing pins from the right side to create connections.</li>
                        <li>• <strong className="text-zinc-200">Wire Actions:</strong> Hover wires and tap <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-200 border border-zinc-700">+</code> to insert a node seamlessly, or <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-200 border border-zinc-700">x</code> to cut.</li>
                        <li>• <strong className="text-zinc-200">Output Pins:</strong> Click <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-200 border border-zinc-700">+</code> on a node to add a new route. Rename pins inline, and reorder using the arrows.</li>
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

            {/* Modal for creating a node */}
            {showModal && (
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
                                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Title</label>
                                <input 
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
                                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Description <span className="text-zinc-700">(Optional)</span></label>
                                <textarea 
                                    value={newNodeData.description}
                                    onChange={e => setNewNodeData({...newNodeData, description: e.target.value})}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-accent resize-y min-h-[80px]"
                                    placeholder="Brief details about what happens in this step..."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Type</label>
                                    <select 
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
                                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Priority</label>
                                    <select 
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
