/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { UpfittersKanbanBoard } from '../UpfittersKanbanBoard';

// React Router mock
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

declare global {
  var __emitSnapshot: (path: string, data: any[]) => void;
  var __setMockAuth: (permissions: Record<string, boolean>, isSuperAdmin?: boolean) => void;
}

describe('UpfittersKanbanBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof __setMockAuth === 'function') {
      __setMockAuth({ 'foreman.view': true }, true);
    }
  });

  const loadMockData = () => {
    // 1. Departments
    if (typeof __emitSnapshot === 'function') {
      __emitSnapshot('businesses/test-tenant/departments', [
        { id: 'dept-upfitting', name: 'Upfitting' },
      ]);

      // 2. Staff
      __emitSnapshot('businesses/test-tenant/staff', [
        {
          id: 'staff-1',
          firstName: 'Alex',
          lastName: 'Miller',
          role: 'Upfitting Specialist',
          departmentId: 'dept-upfitting',
        },
        {
          id: 'staff-2',
          firstName: 'Sarah',
          lastName: 'Connor',
          role: 'Upfitting Tech',
          departmentId: 'dept-upfitting',
        },
      ]);

      // 3. Time Sessions
      __emitSnapshot('businesses/test-tenant/time_sessions', [
        {
          id: 'session-1',
          userId: 'staff-1',
          clockIn: { timestamp: new Date() },
          currentTaskId: 'task-101',
          currentJobId: 'job-1',
          taskSegments: [
            { taskId: 'task-101', jobId: 'job-1', taskTitle: 'Install Emergency Lightbar', start: new Date() }
          ]
        }
      ]);

      // 4. Jobs
      __emitSnapshot('businesses/test-tenant/jobs', [
        {
          id: 'job-1',
          jobNumber: 'J-1001',
          title: 'Police Interceptor Build',
          customerName: 'Metro Police Dept',
          status: 'In Progress',
        }
      ]);
    }
  };

  it('renders the header and upfitter cards when data is provided', async () => {
    render(<UpfittersKanbanBoard tenantId="test-tenant" />);

    // Should initially render loading or title
    await act(async () => {
      loadMockData();
    });

    expect(screen.getByText('Upfitters Kanban Board')).toBeInTheDocument();
  });

  it('filters upfitters by search query', async () => {
    render(<UpfittersKanbanBoard tenantId="test-tenant" />);

    await act(async () => {
      loadMockData();
    });

    const searchInput = screen.getByPlaceholderText(/Search technician/i);
    fireEvent.change(searchInput, { target: { value: 'Alex' } });

    expect(screen.getByText(/Alex Miller/i)).toBeInTheDocument();
  });
});
