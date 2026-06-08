import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useJobPartsStatus } from '../hooks/useJobPartsStatus';

declare global {
  var __emitSnapshot: (path: string, data: any[]) => void;
}

function TestComponent({ tenantId, jobId }: { tenantId: string; jobId: string }) {
  const { data, isLoading } = useJobPartsStatus(tenantId, jobId);

  if (isLoading) return <div>Loading...</div>;
  if (!data) return <div>No data</div>;

  return (
    <div>
      <span data-testid="status">{data.status}</span>
      <span data-testid="totalParts">{data.totalParts}</span>
      <span data-testid="receivedParts">{data.receivedParts}</span>
      <span data-testid="latestEta">
        {data.latestEta ? data.latestEta.toISOString() : 'null'}
      </span>
    </div>
  );
}

describe('useJobPartsStatus Real-time Sync Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders No Parts Needed when no parts requests exist', async () => {
    render(<TestComponent tenantId="test-tenant" jobId="job-1" />);

    // Initially should be in loading state
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Emit empty snapshots for parts requests and shipments
    await act(async () => {
      globalThis.__emitSnapshot('businesses/test-tenant/parts_requests', []);
      globalThis.__emitSnapshot('businesses/test-tenant/shipments', []);
    });

    // Should display 'No Parts Needed'
    expect(screen.getByTestId('status').textContent).toBe('No Parts Needed');
    expect(screen.getByTestId('totalParts').textContent).toBe('0');
    expect(screen.getByTestId('receivedParts').textContent).toBe('0');
  });

  it('renders Ready when all parts are received, fulfilled, delivered, or inventoried', async () => {
    render(<TestComponent tenantId="test-tenant" jobId="job-1" />);

    await act(async () => {
      globalThis.__emitSnapshot('businesses/test-tenant/parts_requests', [
        { id: 'req-1', jobId: 'job-1', status: 'received', partName: 'Part A' },
        { id: 'req-2', jobId: 'job-1', status: 'fulfilled', partName: 'Part B' },
        { id: 'req-3', jobId: 'job-1', status: 'delivered', partName: 'Part C' },
        { id: 'req-4', jobId: 'job-1', status: 'inventoried', partName: 'Part D' },
      ]);
      globalThis.__emitSnapshot('businesses/test-tenant/shipments', []);
    });

    expect(screen.getByTestId('status').textContent).toBe('Ready');
    expect(screen.getByTestId('totalParts').textContent).toBe('4');
    expect(screen.getByTestId('receivedParts').textContent).toBe('4');
  });

  it('renders Blocked when a pending request is missing a shipment or ETA', async () => {
    render(<TestComponent tenantId="test-tenant" jobId="job-1" />);

    await act(async () => {
      // req-1 is pending (which is a pending status in the aggregation logic)
      globalThis.__emitSnapshot('businesses/test-tenant/parts_requests', [
        { id: 'req-1', jobId: 'job-1', status: 'pending', partName: 'Part A' },
      ]);
      globalThis.__emitSnapshot('businesses/test-tenant/shipments', []);
    });

    expect(screen.getByTestId('status').textContent).toBe('Blocked');
    expect(screen.getByTestId('totalParts').textContent).toBe('1');
    expect(screen.getByTestId('receivedParts').textContent).toBe('0');
  });

  it('renders Pending with ETA when all pending parts have shipments and at least one has an ETA', async () => {
    render(<TestComponent tenantId="test-tenant" jobId="job-1" />);

    const etaDate = new Date();
    etaDate.setDate(etaDate.getDate() + 3);

    await act(async () => {
      // req-1 is ordered (which is not pending, so requestsWithoutShipment length is 0)
      globalThis.__emitSnapshot('businesses/test-tenant/parts_requests', [
        { id: 'req-1', jobId: 'job-1', status: 'ordered', partName: 'Part A' },
      ]);
      globalThis.__emitSnapshot('businesses/test-tenant/shipments', [
        { id: 'ship-1', jobId: 'job-1', status: 'pending', eta: etaDate.toISOString() },
      ]);
    });

    expect(screen.getByTestId('status').textContent).toBe('Pending with ETA');
    expect(screen.getByTestId('totalParts').textContent).toBe('1');
    expect(screen.getByTestId('receivedParts').textContent).toBe('0');
    expect(new Date(screen.getByTestId('latestEta').textContent!).getTime()).toBe(etaDate.getTime());
  });
});
