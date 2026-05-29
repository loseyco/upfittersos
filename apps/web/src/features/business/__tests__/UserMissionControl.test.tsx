/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserMissionControl } from '../UserMissionControl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

declare global {
  var __setMockAuth: (permissions: Record<string, boolean>, isSuperAdmin?: boolean, user?: any) => void;
  var __emitSnapshot: (path: string, data: any[]) => void;
}

// Mock routing since useNavigate is used
vi.mock('react-router-dom', () => {
  return {
    useNavigate: () => vi.fn(),
    useParams: () => ({}),
    useLocation: () => ({ pathname: '/' }),
    Link: ({ children, to, ...props }: any) => React.createElement('a', { href: to, ...props }, children)
  };
});

// Mock auth store
const mockAuth = {
  user: { uid: 'user-123', email: 'tech@upfitters.com', displayName: 'Tech User' },
  impersonatedStaff: null,
  permissions: { 'dashboard.customize': true } as Record<string, boolean>,
  isSuperAdmin: false
};

vi.mock('../../lib/auth/store', () => {
  return {
    useAuthStore: () => mockAuth
  };
});

let listeners: Record<string, any> = {};
let updatedDocs: Record<string, any> = {};
let setDocs: Record<string, any> = {};
let addedDocs: any[] = [];

vi.mock('firebase/firestore', () => {
  return {
    getFirestore: vi.fn(() => ({})),
    collection: vi.fn((db, path) => ({ type: 'collection', path })),
    query: vi.fn((colRef, ...constraints) => ({ type: 'query', colRef, constraints })),
    where: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
    limit: vi.fn((n) => ({ type: 'limit', n })),
    orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    doc: vi.fn((db, path, id) => ({ type: 'doc', path: id ? `${path}/${id}` : path })),
    updateDoc: vi.fn(async (ref: any, data: any) => {
      updatedDocs[ref.path] = data;
      return Promise.resolve();
    }),
    setDoc: vi.fn(async (ref: any, data: any) => {
      setDocs[ref.path] = data;
      return Promise.resolve();
    }),
    addDoc: vi.fn(async (col: any, data: any) => {
      addedDocs.push({ colPath: col.path, data });
      return Promise.resolve({ id: 'new-session-id' });
    }),
    getDoc: vi.fn(async (ref: any) => {
      return {
        exists: () => true,
        data: () => ({
          status: 'active',
          breaks: [],
          jobs: []
        })
      };
    }),
    getDocs: vi.fn(async (q: any) => {
      return {
        empty: true,
        docs: []
      };
    }),
    onSnapshot: vi.fn((ref: any, callback: any) => {
      const path = ref.path || (ref.colRef && ref.colRef.path);
      if (path) {
        listeners[path] = callback;
      }
      return () => {
        if (path) {
          delete listeners[path];
        }
      };
    }),
    collectionGroup: vi.fn((db, path) => ({ type: 'collectionGroup', path })),
    serverTimestamp: vi.fn(() => 'mock-timestamp')
  };
});

describe('UserMissionControl Gating, Layout, Toggles, Drag-and-Drop & Firestore Integration', () => {
  
  beforeEach(() => {
    // vi.useFakeTimers();
    vi.clearAllMocks();
    listeners = {};
    updatedDocs = {};
    setDocs = {};
    addedDocs = [];

    // Default mock auth in local mock
    mockAuth.permissions = { 'dashboard.customize': true };
    mockAuth.isSuperAdmin = false;
    mockAuth.user = { uid: 'user-123', email: 'tech@upfitters.com', displayName: 'Tech User' };

    // Sync with setup's global mock auth store
    if (typeof __setMockAuth === 'function') {
      __setMockAuth(mockAuth.permissions, mockAuth.isSuperAdmin, mockAuth.user);
    }
  });

  afterEach(() => {
    // vi.useRealTimers();
  });

  const emitCollection = (path: string, items: any[]) => {
    const callback = listeners[path];
    if (callback) {
      callback({
        docs: items.map(item => ({
          id: item.id,
          data: () => item,
          ref: { path: `${path}/${item.id}` }
        })),
        size: items.length,
        forEach: (cb: any) => items.forEach(item => cb({ id: item.id, data: () => item, ref: { path: `${path}/${item.id}` } }))
      });
    }
  };

  const emitDoc = (path: string, data: any) => {
    const callback = listeners[path];
    if (callback) {
      callback({
        exists: () => !!data,
        data: () => data
      });
    }
  };

  it('renders correctly with authorization gating based on dashboard.customize', async () => {
    mockAuth.permissions = { 'dashboard.customize': true };
    mockAuth.isSuperAdmin = false;
    if (typeof __setMockAuth === 'function') __setMockAuth(mockAuth.permissions, mockAuth.isSuperAdmin, mockAuth.user);

    const { rerender } = render(<UserMissionControl tenantId="test-tenant" />);
    
    // Switch to Personalized
    const personalizedBtn = screen.getByText('Personalized');
    fireEvent.click(personalizedBtn);
    
    // We should see "Manage Dashboard Cards" / settings button or customizable handles
    expect(screen.getByTitle('Manage Dashboard Cards')).toBeInTheDocument();

    // 2. Without customize permission
    mockAuth.permissions = {};
    if (typeof __setMockAuth === 'function') __setMockAuth(mockAuth.permissions, mockAuth.isSuperAdmin, mockAuth.user);
    rerender(<UserMissionControl tenantId="test-tenant" />);
    
    // Settings cog and other customize hooks should be hidden
    expect(screen.queryByTitle('Manage Dashboard Cards')).not.toBeInTheDocument();
  });

  it('toggles viewMode between Classic and Personalized and loads/saves settings from/to Firestore', async () => {
    mockAuth.permissions = { 'dashboard.customize': true };
    if (typeof __setMockAuth === 'function') __setMockAuth(mockAuth.permissions, mockAuth.isSuperAdmin, mockAuth.user);
    render(<UserMissionControl tenantId="test-tenant" />);

    // Renders classic view first by default
    expect(screen.getByPlaceholderText(/Quick search/i)).toBeInTheDocument();

    // Toggle to Personalized
    const personalizedBtn = screen.getByText('Personalized');
    fireEvent.click(personalizedBtn);

    // Should load card elements
    expect(screen.getByText('Time Clock')).toBeInTheDocument();
    expect(screen.getByText('Job Details')).toBeInTheDocument();
    
    // Firestore should receive the auto-saved view mode change
    await waitFor(() => {
      expect(setDocs['businesses/test-tenant/staff_dashboard_configs/user-123']).toBeDefined();
    }, { timeout: 2000 });
  });

  it('supports hiding and minimizing dashboard cards in Personalized mode', async () => {
    mockAuth.permissions = { 'dashboard.customize': true };
    if (typeof __setMockAuth === 'function') __setMockAuth(mockAuth.permissions, mockAuth.isSuperAdmin, mockAuth.user);
    render(<UserMissionControl tenantId="test-tenant" />);

    // Toggle to Personalized
    fireEvent.click(screen.getByText('Personalized'));

    // Open manage cards drawer
    const settingsBtn = screen.getByTitle('Manage Dashboard Cards');
    fireEvent.click(settingsBtn);

    expect(screen.getByText('Manage Dashboard Cards')).toBeInTheDocument();

    // Click Time Clock toggle to hide it
    const timeClockToggle = screen.getAllByText('Time Clock')[0];
    fireEvent.click(timeClockToggle);

    // Auto-saves layout visibility change to Firestore
    await waitFor(() => {
      expect(setDocs['businesses/test-tenant/staff_dashboard_configs/user-123']).toBeDefined();
    }, { timeout: 2000 });
  });

  it('supports drag-and-drop to reorder card templates', async () => {
    mockAuth.permissions = { 'dashboard.customize': true };
    if (typeof __setMockAuth === 'function') __setMockAuth(mockAuth.permissions, mockAuth.isSuperAdmin, mockAuth.user);
    render(<UserMissionControl tenantId="test-tenant" />);

    // Toggle to Personalized
    fireEvent.click(screen.getByText('Personalized'));

    const timeClockCard = screen.getAllByText('Time Clock')[0].closest('[draggable="true"]');
    const jobDetailsCard = screen.getAllByText('Job Details')[0].closest('[draggable="true"]');

    expect(timeClockCard).toBeInTheDocument();
    expect(jobDetailsCard).toBeInTheDocument();

    // Simulate drag and drop
    fireEvent.dragStart(timeClockCard!, { dataTransfer: { effectAllowed: 'move' } });
    fireEvent.dragOver(jobDetailsCard!, { dataTransfer: {} });
    fireEvent.drop(jobDetailsCard!, { dataTransfer: {} });
    fireEvent.dragEnd(timeClockCard!);

    // Reorders settings and persists to Firestore
    await waitFor(() => {
      expect(setDocs['businesses/test-tenant/staff_dashboard_configs/user-123']).toBeDefined();
      expect(setDocs['businesses/test-tenant/staff_dashboard_configs/user-123'].layout).toBeDefined();
    }, { timeout: 2000 });
  });

  it('implements interactive Time Clock operations correctly with Firestore persistence', async () => {
    mockAuth.permissions = { 'dashboard.customize': true };
    if (typeof __setMockAuth === 'function') __setMockAuth(mockAuth.permissions, mockAuth.isSuperAdmin, mockAuth.user);
    
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <UserMissionControl tenantId="test-tenant" viewMode="time" />
      </QueryClientProvider>
    );

    // Emit active time punch session list
    emitCollection('businesses/test-tenant/time_sessions', []);

    // 1. Clock In
    const clockInBtn = screen.getByText('Clock In');
    fireEvent.click(clockInBtn);

    await waitFor(() => {
      expect(addedDocs.length).toBe(1);
      expect(addedDocs[0].colPath).toBe('businesses/test-tenant/time_sessions');
      expect(addedDocs[0].data.status).toBe('active');
    });
  });
});
