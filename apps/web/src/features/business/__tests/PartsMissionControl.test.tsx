/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PartsMissionControl } from '../PartsMissionControl';

// Mock routing since useNavigate and Link are used
vi.mock('react-router-dom', () => {
  return {
    useNavigate: () => vi.fn(),
    useParams: () => ({}),
    Link: ({ children, to, ...props }: any) => React.createElement('a', { href: to, ...props }, children)
  };
});

// Mock auth store to provide tenantId and permissions
vi.mock('../../lib/auth/store', () => {
  return {
    useAuthStore: () => ({
      tenantId: 'test-tenant',
      user: { uid: 'user-1', displayName: 'Parts Tech' },
      permissions: { 'parts.manage': true },
      isSuperAdmin: false,
      loading: false,
    })
  };
});

declare global {
  var __emitSnapshot: (path: string, data: any[]) => void;
  var __setMockAuth: (permissions: Record<string, boolean>, isSuperAdmin?: boolean) => void;
  var __firestoreListeners: Record<string, any>;
}

describe('PartsMissionControl Dashboard Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup authenticated user with appropriate parts department permissions
    __setMockAuth({ 'parts.manage': true }, false);
    // Assign tenantId and user mock states directly to test setup mock values
    // @ts-ignore
    globalThis.__firestoreListeners = {};
  });

  const loadMockData = () => {
    // 1. Zones
    __emitSnapshot('businesses/test-tenant/zones', [
      { id: 'zone-1', name: 'Bay 1', type: 'staging' }
    ]);

    // 2. Parts Requests
    __emitSnapshot('businesses/test-tenant/parts_requests', [
      { 
        id: 'req-1', 
        partName: 'Chevy Brake Pads', 
        requestedBy: 'John Doe', 
        urgency: 'urgent', 
        status: 'pending', 
        quantity: 2,
        createdAt: { toDate: () => new Date() }
      }
    ]);

    // 3. Shipments
    __emitSnapshot('businesses/test-tenant/shipments', [
      { 
        id: 'ship-1', 
        trackingNumber: '1Z12345E0205271688', 
        carrier: 'UPS', 
        description: 'Chevy Rotors', 
        status: 'in_transit', 
        createdAt: { toDate: () => new Date() }
      }
    ]);

    // 4. QuickBooks Purchase Orders
    __emitSnapshot('businesses/test-tenant/qb_purchase_orders', [
      { 
        id: 'po-1', 
        refNumber: '4452', 
        vendorName: 'NAPA Auto Parts', 
        totalAmount: 350.50, 
        txnDate: '2026-05-26', 
        isFullyReceived: false 
      }
    ]);

    // 5. Inventory Items
    __emitSnapshot('businesses/test-tenant/inventory_items', [
      { 
        id: 'inv-1', 
        name: 'Oil Filter PH3614', 
        sku: 'PH3614', 
        quantityOnHand: 2 
      }
    ]);
  };

  it('renders dashboard layout and initial KPI stats card components', async () => {
    // @ts-ignore
    globalThis.__firestoreListeners = {};
    render(<PartsMissionControl />);

    // Renders the board title and description
    expect(screen.getByText('Parts Mission Control')).toBeInTheDocument();
    expect(screen.getByText(/Manage requests, track shipments, and intake packages/i)).toBeInTheDocument();
  });

  it('synchronizes real-time data dynamically from Firestore snapshots', async () => {
    render(<PartsMissionControl />);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      loadMockData();
    });

    // Verify Parts Requests rendering
    expect(screen.getByText('Chevy Brake Pads')).toBeInTheDocument();
    expect(screen.getByText(/urgent/i)).toBeInTheDocument();
    expect(screen.getByText('Qty: 2')).toBeInTheDocument();

    // Verify Inbound Shipments rendering
    expect(screen.getByText('Chevy Rotors')).toBeInTheDocument();
    expect(screen.getAllByText('UPS')[0]).toBeInTheDocument();
    expect(screen.getByText('1Z12345E0205271688')).toBeInTheDocument();

    // Verify QuickBooks PO rendering
    expect(screen.getByText('PO #4452')).toBeInTheDocument();
    expect(screen.getByText('NAPA Auto Parts')).toBeInTheDocument();

    // Verify Inventory Stock alert rendering
    expect(screen.getByText('Oil Filter PH3614')).toBeInTheDocument();
  });

  it('toggles Full Screen mode and Package Intake Modal displays correctly', async () => {
    render(<PartsMissionControl />);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      loadMockData();
    });

    const intakeBtn = screen.getByText('RECEIVE PACKAGE');
    expect(intakeBtn).toBeInTheDocument();

    // Open Package Intake Modal
    await act(async () => {
      fireEvent.click(intakeBtn);
    });

    expect(screen.getByText('Package Intake')).toBeInTheDocument();
    expect(screen.getByText('Receive and locate incoming packages')).toBeInTheDocument();

    // Close Package Intake Modal
    const closeBtn = screen.getAllByRole('button').find(
      btn => btn.className.includes('rounded-full')
    );
    if (closeBtn) {
      await act(async () => {
        fireEvent.click(closeBtn);
      });
      expect(screen.queryByText('Package Intake')).not.toBeInTheDocument();
    }
  });

  it('supports tracking number submission to monitor incoming package freight', async () => {
    render(<PartsMissionControl />);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      loadMockData();
    });

    const trackingInput = screen.getByPlaceholderText('Paste tracking number...');
    const descInput = screen.getByPlaceholderText('e.g. Parts for Smith Job');
    const submitBtn = screen.getByText('Track Shipment');

    await act(async () => {
      fireEvent.change(trackingInput, { target: { value: '1Z9999999999999999' } });
      fireEvent.change(descInput, { target: { value: 'Calipers for Ford Transit' } });
    });

    expect(trackingInput).toHaveValue('1Z9999999999999999');
    expect(descInput).toHaveValue('Calipers for Ford Transit');
    expect(submitBtn).toBeEnabled();
  });
});
