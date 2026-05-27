/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CanvasGalleryTab } from '../CanvasGalleryTab';
import { WorkflowCanvasTab } from '../WorkflowCanvasTab';

// Global types declared in setup.ts
declare global {
  var __emitSnapshot: (path: string, data: any[]) => void;
  var __setMockAuth: (permissions: Record<string, boolean>, isSuperAdmin?: boolean) => void;
  var __firestoreListeners: Record<string, any>;
}

// 1. Mock lucide-react to elegantly catch any requested icon
vi.mock('lucide-react', () => {
  const IconMock = (name: string) => {
    const Component = (props: any) => React.createElement('span', { ...props, 'data-testid': `icon-${name}` }, name);
    Component.displayName = name;
    return Component;
  };
  const icons = [
    'Workflow', 'Lightbulb', 'Star', 'Bug', 'AlertTriangle', 'ArrowUp', 'ArrowDown', 'Minus',
    'Trash2', 'Edit2', 'Plus', 'GripVertical', 'ChevronUp', 'ChevronDown', 'Palette', 'X',
    'Loader2', 'Save', 'ArrowLeft', 'Info', 'ShieldAlert', 'ArrowRight', 'Clock'
  ];
  const mockExports: Record<string, any> = {};
  icons.forEach(icon => {
    mockExports[icon] = IconMock(icon);
  });
  return mockExports;
});

// 2. Mock @xyflow/react as specified by Milestone 5 instructions to bypass JSDOM/Happy DOM spatial calculations
vi.mock('@xyflow/react', () => {
  return {
    ReactFlow: React.forwardRef(({ children, onInit, nodes, edges, nodeTypes, onNodesChange, onEdgesChange, onConnect, onConnectEnd, onNodeDoubleClick, className, ...rest }: any, ref: any) => {
      React.useEffect(() => {
        if (onInit) {
          onInit({
            screenToFlowPosition: (pos: any) => ({ x: pos.x, y: pos.y }),
            fitView: vi.fn(),
          });
        }
      }, [onInit]);

      return (
        <div data-testid="react-flow" className="react-flow" ref={ref} {...rest}>
          <div data-testid="react-flow-pane" className="react-flow__pane">
            <div data-testid="nodes-container">
              {nodes?.map((node: any) => {
                const NodeComp = nodeTypes?.[node.type] || (() => <div>{node.data.label}</div>);
                return (
                  <div key={node.id} data-testid={`node-wrapper-${node.id}`}>
                    <NodeComp id={node.id} data={node.data} selected={false} type={node.type} />
                  </div>
                );
              })}
            </div>
            {children}
          </div>
        </div>
      );
    }),
    Handle: ({ id, type, position, className, style }: any) => (
      <div data-testid={`handle-${id}`} className={className} style={style} data-handle-type={type} data-handle-position={position} />
    ),
    Position: {
      Left: 'left',
      Right: 'right',
      Top: 'top',
      Bottom: 'bottom',
    },
    useUpdateNodeInternals: () => vi.fn(),
    NodeResizer: () => <div data-testid="node-resizer" />,
    BaseEdge: ({ path, style }: any) => <path d={path} style={style} data-testid="base-edge" />,
    EdgeLabelRenderer: ({ children }: any) => <div data-testid="edge-label-renderer">{children}</div>,
    getSmoothStepPath: ({ sourceX, sourceY, targetX, targetY }: any) => {
      const labelX = (sourceX + targetX) / 2 || 0;
      const labelY = (sourceY + targetY) / 2 || 0;
      return ['dummy-path', labelX, labelY];
    },
    useReactFlow: () => ({
      setEdges: vi.fn(),
      screenToFlowPosition: (pos: any) => ({ x: pos.x, y: pos.y }),
      fitView: vi.fn(),
    }),
    applyNodeChanges: (changes: any, nds: any) => nds,
    applyEdgeChanges: (changes: any, eds: any) => eds,
    addEdge: (edge: any, eds: any) => [...eds, edge],
    Panel: ({ children, position, className }: any) => <div data-testid={`panel-${position}`} className={className}>{children}</div>,
    Background: () => <div data-testid="background" />,
    BackgroundVariant: {
      Dots: 'dots',
      Lines: 'lines',
      Cross: 'cross',
    },
    Controls: () => <div data-testid="controls" />,
  };
});

// 3. Mock sonner for toast notifications
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

// 4. Overwrite and enrich firebase/firestore mocks to cover all canvas operations
vi.mock('firebase/firestore', () => {
  const listeners: Record<string, any> = globalThis.__firestoreListeners || {};
  return {
    getFirestore: vi.fn(() => ({})),
    collection: vi.fn((db, path) => ({ type: 'collection', path })),
    query: vi.fn((colRef, ...constraints) => ({ type: 'query', colRef, constraints })),
    where: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
    limit: vi.fn((n) => ({ type: 'limit', n })),
    orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    doc: vi.fn((db, path, id) => ({ type: 'doc', path: id ? `${path}/${id}` : path })),
    updateDoc: vi.fn(() => Promise.resolve()),
    setDoc: vi.fn(() => Promise.resolve()),
    addDoc: vi.fn(() => Promise.resolve({ id: 'new-doc-id' })),
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => null })),
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
    onSnapshot: vi.fn((queryOrCol: any, callback: any, errorCallback: any) => {
      const path = queryOrCol.path || (queryOrCol.colRef && queryOrCol.colRef.path);
      if (path) {
        listeners[path] = callback;
      }
      return () => {
        if (path) {
          delete listeners[path];
        }
      };
    }),
  };
});

describe('Workflow Whiteboards Feature Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default permissions setup
    __setMockAuth({ 'whiteboards.view': true, 'whiteboards.manage': true }, false);
  });

  describe('CanvasGalleryTab Component', () => {
    const mockCanvases = [
      {
        id: 'canvas-1',
        tenantId: 'test-tenant',
        name: 'Primary Process Canvas',
        description: 'Recovered from system upgrade',
        status: 'active',
        updatedBy: 'John Doe',
        updatedAt: { toMillis: () => 10000000, toDate: () => new Date() }
      },
      {
        id: 'canvas-2',
        tenantId: 'test-tenant',
        name: 'Secondary Logic Board',
        description: 'Operational lifecycle mapping',
        status: 'active',
        updatedBy: 'Jane Smith',
        updatedAt: { toMillis: () => 20000000, toDate: () => new Date() }
      },
      {
        id: 'canvas-archived',
        tenantId: 'test-tenant',
        name: 'Legacy Flow Chart',
        description: 'Old workflow',
        status: 'archived',
        updatedBy: 'System',
        updatedAt: { toMillis: () => 5000000, toDate: () => new Date() }
      }
    ];

    it('renders the active whiteboard cards correctly', async () => {
      const onOpenCanvas = vi.fn();
      render(<CanvasGalleryTab tenantId="test-tenant" onOpenCanvas={onOpenCanvas} />);

      await act(async () => {
        __emitSnapshot('business_canvases', mockCanvases);
      });

      expect(screen.getByText('Primary Process Canvas')).toBeInTheDocument();
      expect(screen.getByText('Secondary Logic Board')).toBeInTheDocument();
      expect(screen.queryByText('Legacy Flow Chart')).not.toBeInTheDocument();
    });

    it('supports searching/filtering canvases by text', async () => {
      render(<CanvasGalleryTab tenantId="test-tenant" onOpenCanvas={vi.fn()} />);

      await act(async () => {
        __emitSnapshot('business_canvases', mockCanvases);
      });

      const searchInput = screen.getByPlaceholderText('Search canvases by name...');
      
      // Filter for 'Secondary'
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'Secondary' } });
      });

      expect(screen.getByText('Secondary Logic Board')).toBeInTheDocument();
      expect(screen.queryByText('Primary Process Canvas')).not.toBeInTheDocument();

      // Clear search query
      const clearBtn = screen.getByText('Clear');
      await act(async () => {
        fireEvent.click(clearBtn);
      });

      expect(screen.getByText('Primary Process Canvas')).toBeInTheDocument();
      expect(screen.getByText('Secondary Logic Board')).toBeInTheDocument();
    });

    it('supports show/hide archived canvases toggle', async () => {
      render(<CanvasGalleryTab tenantId="test-tenant" onOpenCanvas={vi.fn()} />);

      await act(async () => {
        __emitSnapshot('business_canvases', mockCanvases);
      });

      const toggleBtn = screen.getByText('Show Archived');
      
      // Toggle to show archived
      await act(async () => {
        fireEvent.click(toggleBtn);
      });

      expect(screen.getByText('Legacy Flow Chart')).toBeInTheDocument();
      expect(screen.queryByText('Primary Process Canvas')).not.toBeInTheDocument();
      expect(screen.queryByText('Secondary Logic Board')).not.toBeInTheDocument();

      // Toggle back
      const hideBtn = screen.getByText('Hide Archived');
      await act(async () => {
        fireEvent.click(hideBtn);
      });

      expect(screen.getByText('Primary Process Canvas')).toBeInTheDocument();
      expect(screen.queryByText('Legacy Flow Chart')).not.toBeInTheDocument();
    });

    it('triggers new whiteboard canvas creation modal/prompt prompt', async () => {
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Brand New Whiteboard');
      render(<CanvasGalleryTab tenantId="test-tenant" onOpenCanvas={vi.fn()} />);

      await act(async () => {
        __emitSnapshot('business_canvases', mockCanvases);
      });

      const newBoardBtn = screen.getByText('New Whiteboard');
      await act(async () => {
        fireEvent.click(newBoardBtn);
      });

      expect(promptSpy).toHaveBeenCalledWith('Enter a name for the new Whiteboard Canvas:');
    });
  });

  describe('WorkflowCanvasTab Component', () => {
    const mockCanvasDetail = {
      name: 'Operations Process Canvas',
      nodes: [
        {
          id: 'node-1',
          type: 'idea',
          position: { x: 100, y: 150 },
          data: {
            label: 'Receive Order',
            description: 'Intake package from client',
            type: 'idea',
            priority: 'high',
            outputs: [
              { id: 'out-1', label: 'Approve', color: '#10b981' },
              { id: 'out-2', label: 'Reject', color: '#ef4444' }
            ]
          }
        }
      ],
      edges: []
    };

    const triggerCanvasLoad = async (canvasId: string, data: any) => {
      await act(async () => {
        const callback = globalThis.__firestoreListeners[`business_canvases/${canvasId}`];
        if (callback) {
          callback({
            exists: () => true,
            data: () => data
          });
        }
      });
    };

    it('mounts correctly and fetches realtime canvas configurations', async () => {
      render(<WorkflowCanvasTab tenantId="test-tenant" canvasId="canvas-1" onBack={vi.fn()} />);

      // Initially shows loader
      expect(screen.getByText('Loading Topology...')).toBeInTheDocument();

      // Trigger realtime load
      await triggerCanvasLoad('canvas-1', mockCanvasDetail);

      // Verify canvas metadata and nodes render correctly
      expect(screen.getByText('Operations Process Canvas')).toBeInTheDocument();
      expect(screen.getByText('Receive Order')).toBeInTheDocument();
      expect(screen.getByText('Intake package from client')).toBeInTheDocument();
    });

    it('enforces whiteboards.manage permission: editable mode configuration', async () => {
      // User has full manage rights
      __setMockAuth({ 'whiteboards.manage': true }, false);

      render(<WorkflowCanvasTab tenantId="test-tenant" canvasId="canvas-1" onBack={vi.fn()} />);
      await triggerCanvasLoad('canvas-1', mockCanvasDetail);

      // 1. Shows "Add Node" button
      expect(screen.getByRole('button', { name: /Add Node/i })).toBeInTheDocument();

      // 2. Shows auto-save notification
      expect(screen.getByText(/Saved/i)).toBeInTheDocument();

      // 3. Shows color palettes and editing triggers
      const borderPaletteButton = screen.queryAllByTitle('Node Border Color');
      expect(borderPaletteButton.length).toBeGreaterThan(0);

      // 4. Outcome modifiers are active (Plus/Trash/Edit route buttons)
      const addRouteBtn = screen.getByTitle('Add Blueprint Route');
      expect(addRouteBtn).toBeInTheDocument();

      const deleteRouteBtns = screen.getAllByTitle('Delete Route');
      expect(deleteRouteBtns.length).toBeGreaterThan(0);

      const editRouteBtns = screen.getAllByTitle('Edit Logic Requirement');
      expect(editRouteBtns.length).toBeGreaterThan(0);
    });

    it('enforces whiteboards.manage permission: read-only badge and locked UI', async () => {
      // User lacks manage rights
      __setMockAuth({ 'whiteboards.manage': false }, false);

      render(<WorkflowCanvasTab tenantId="test-tenant" canvasId="canvas-1" onBack={vi.fn()} />);
      await triggerCanvasLoad('canvas-1', mockCanvasDetail);

      // 1. Displays Read-Only badge
      expect(screen.getByText(/Read-Only Mode/i)).toBeInTheDocument();

      // 2. Hides "Add Node" button
      expect(screen.queryByRole('button', { name: /Add Node/i })).not.toBeInTheDocument();

      // 3. Hides node/canvas modifiers
      expect(screen.queryByTitle('Node Border Color')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Add Blueprint Route')).not.toBeInTheDocument(); // shouldn't exist
      expect(screen.queryByTitle('Delete Route')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Edit Logic Requirement')).not.toBeInTheDocument();
    });

    it('spawns node creation modal when double clicking empty spots', async () => {
      __setMockAuth({ 'whiteboards.manage': true }, false);

      render(<WorkflowCanvasTab tenantId="test-tenant" canvasId="canvas-1" onBack={vi.fn()} />);
      await triggerCanvasLoad('canvas-1', mockCanvasDetail);

      // Retrieve react flow pane and fire double click
      const pane = screen.getByTestId('react-flow-pane');
      await act(async () => {
        fireEvent.doubleClick(pane, { clientX: 250, clientY: 300 });
      });

      // Verify node creation modal opens
      expect(screen.getByText('Create New Node')).toBeInTheDocument();

      // Enter details and click submit
      const titleInput = screen.getByLabelText(/Title/i);
      fireEvent.change(titleInput, { target: { value: 'Inspect Parts' } });

      const submitBtn = screen.getByText('Drop Node on Canvas');
      await act(async () => {
        fireEvent.submit(submitBtn);
      });

      // Modal should close and the new node should render
      expect(screen.queryByText('Create New Node')).not.toBeInTheDocument();
      expect(screen.getByText('Inspect Parts')).toBeInTheDocument();
    });
  });
});
