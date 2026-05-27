/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MorningMeetingBoard } from '../MorningMeetingBoard'

// Declare types for global functions added in setup
declare global {
  var __emitSnapshot: (path: string, data: any[]) => void
  var __setMockAuth: (permissions: Record<string, boolean>, isSuperAdmin?: boolean) => void
}

describe('MorningMeetingBoard - Stress, Fallback, and Adversarial Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __setMockAuth({ 'tasks.manage': true }, false)
  })

  it('renders gracefully with a completely empty roster and displays No Staff Found', async () => {
    render(<MorningMeetingBoard tenantId="test-tenant" />)
    
    await act(async () => {
      __emitSnapshot('businesses/test-tenant/departments', [])
      __emitSnapshot('businesses/test-tenant/staff', [])
    })

    // Roster matches no staff fallback message
    expect(screen.getByText(/No Staff Found/i)).toBeInTheDocument()
    expect(screen.getByText(/No staff members matched your current filters or search query/i)).toBeInTheDocument()
  })

  it('handles missing, null, or undefined fields on staff members without crashing', async () => {
    render(<MorningMeetingBoard tenantId="test-tenant" />)

    await act(async () => {
      __emitSnapshot('businesses/test-tenant/departments', [
        { id: 'dept-fast', name: 'FAST Team' }
      ])
      __emitSnapshot('businesses/test-tenant/staff', [
        { 
          id: 'staff-corrupted', 
          firstName: 'John', 
          lastName: 'Doe', 
          departmentId: 'dept-fast', 
          jobTitle: undefined,   // Undefined jobTitle fallback test
          dailyTags: undefined   // Undefined dailyTags fallback test
        }
      ])
    })

    // Renders technician name and defaults job title to "Technician"
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('Technician')).toBeInTheDocument()
    
    // Shows default empty tags fallback
    expect(screen.getByText('No tasks added for today')).toBeInTheDocument()
  })

  it('should render 50 technicians and 10 departments efficiently without lag', async () => {
    const startTime = performance.now();
    
    render(<MorningMeetingBoard tenantId="stress-tenant" />);
    
    // 10 departments
    const departments = Array.from({ length: 10 }, (_, i) => ({
      id: `dept-${i}`,
      name: `Department-${i}`
    }));

    // 50 staff members distributed among departments
    const staffMembers = Array.from({ length: 50 }, (_, i) => ({
      id: `staff-${i}`,
      firstName: `Staff-${i}`,
      lastName: 'Technician',
      departmentId: `dept-${i % 10}`,
      jobTitle: 'Technician',
      dailyTags: Array.from({ length: i % 4 }, (_, j) => ({
        id: `tag-${i}-${j}`,
        text: `Task description ${i} - ${j}`,
        completed: j % 2 === 0
      }))
    }));

    await act(async () => {
      __emitSnapshot('businesses/stress-tenant/departments', departments)
      __emitSnapshot('businesses/stress-tenant/staff', staffMembers)
    })

    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    // Verify execution remains fast (under 400ms for massive reconciliation and layout rendering)
    expect(renderTime).toBeLessThan(400);

    // Verify all departments headers render
    departments.forEach(dept => {
      expect(screen.getByText(dept.name)).toBeInTheDocument();
    });

    // Verify a selection of staff and tasks are present
    expect(screen.getByText('Staff-0 Technician')).toBeInTheDocument();
    expect(screen.getByText('Staff-49 Technician')).toBeInTheDocument();
  });
})
