/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MorningMeetingBoard } from '../MorningMeetingBoard'
import { updateDoc } from 'firebase/firestore'

// Declare types for global functions added in setup
declare global {
  var __emitSnapshot: (path: string, data: any[]) => void
  var __setMockAuth: (permissions: Record<string, boolean>, isSuperAdmin?: boolean) => void
}

describe('MorningMeetingBoard - Core Checklist Features', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default to edit permissions for manager/foreman
    __setMockAuth({ 'tasks.manage': true }, false)
  })

  const loadMockData = () => {
    // 1. Emit departments
    __emitSnapshot('businesses/test-tenant/departments', [
      { id: 'dept-fast', name: 'FAST Team' },
      { id: 'dept-fab', name: 'Fabrication' },
    ])

    // 2. Emit staff with mock dailyTags
    __emitSnapshot('businesses/test-tenant/staff', [
      { 
        id: 'staff1', 
        firstName: 'John', 
        lastName: 'Doe', 
        departmentId: 'dept-fast', 
        jobTitle: 'Lead Tech',
        dailyTags: [
          { id: 'tag1', text: 'Assemble fast wiring harness', completed: false },
          { id: 'tag2', text: 'Clean workstation', completed: true }
        ]
      },
      { 
        id: 'staff2', 
        firstName: 'Jane', 
        lastName: 'Smith', 
        departmentId: 'dept-fab', 
        jobTitle: 'Fabricator',
        dailyTags: []
      },
    ])
  }

  it('renders standard header, clock, search, and layout controls', async () => {
    render(<MorningMeetingBoard tenantId="test-tenant" />)
    
    // Expect board loading state initially
    expect(screen.getByText(/Loading daily meeting board.../i)).toBeInTheDocument()

    // Load data to dismiss loader
    await act(async () => {
      loadMockData()
    })

    // Expect header, clock container, search and layout switcher to be visible
    expect(screen.getByText(/Morning Meeting Board/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Search staff, tasks.../i)).toBeIn571 = screen.getByPlaceholderText(/Search staff, tasks.../i)
    expect(screen.getByText('Lanes')).toBeInTheDocument()
    expect(screen.getByText('Grid')).toBeInTheDocument()
  })

  it('reconciles and displays staff members grouped under their departments correctly', async () => {
    render(<MorningMeetingBoard tenantId="test-tenant" />)
    
    await act(async () => {
      loadMockData()
    })

    // Departments headers
    expect(screen.getByText('FAST Team')).toBeInTheDocument()
    expect(screen.getByText('Fabrication')).toBeInTheDocument()

    // Staff names and job titles
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('Lead Tech')).toBeInTheDocument()
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    expect(screen.getByText('Fabricator')).toBeInTheDocument()

    // Staff initials avatar
    expect(screen.getByText('JD')).toBeInTheDocument()
    expect(screen.getByText('JS')).toBeInTheDocument()

    // Checklist tasks
    expect(screen.getByText('Assemble fast wiring harness')).toBeInTheDocument()
    expect(screen.getByText('Clean workstation')).toBeInTheDocument()
    expect(screen.getByText('No tasks added for today')).toBeInTheDocument() // Jane has no tasks
  })

  it('toggles layout mode from lanes to grid', async () => {
    render(<MorningMeetingBoard tenantId="test-tenant" />)
    
    await act(async () => {
      loadMockData()
    })

    const gridBtn = screen.getByText('Grid')
    const lanesBtn = screen.getByText('Lanes')

    // Initial is lanes
    expect(lanesBtn).toHaveClass('bg-zinc-800')

    await act(async () => {
      fireEvent.click(gridBtn)
    })

    // Layout class updates
    expect(gridBtn).toHaveClass('bg-zinc-800')
    expect(lanesBtn).not.toHaveClass('bg-zinc-800')
  })

  it('filters roster and tasks by search query', async () => {
    render(<MorningMeetingBoard tenantId="test-tenant" />)
    
    await act(async () => {
      loadMockData()
    })

    const searchInput = screen.getByPlaceholderText(/Search staff, tasks.../i)
    
    // Search for "Jane" (displays Jane Smith, hides John Doe)
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Jane' } })
    })

    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument()

    // Search for a task text "wiring" (displays John Doe, hides Jane Smith)
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'wiring' } })
    })

    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument()

    // Search for non-existent match
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Zack' } })
    })

    expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument()
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument()
    expect(screen.getByText(/No Staff Found/i)).toBeInTheDocument()
  })

  it('triggers Firestore updateDoc when adding a new task', async () => {
    render(<MorningMeetingBoard tenantId="test-tenant" />)
    
    await act(async () => {
      loadMockData()
    })

    // Find input under Jane Smith (index 1 or by placeholder/staff context)
    const inputs = screen.getAllByPlaceholderText('Add task for today...')
    expect(inputs).toHaveLength(2)

    // Add task for Jane Smith (inputs[1])
    await act(async () => {
      fireEvent.change(inputs[1], { target: { value: 'Install transit shelving' } })
    })

    const addButtons = screen.getAllByTitle('Add tag')
    expect(addButtons).toHaveLength(2)

    await act(async () => {
      fireEvent.click(addButtons[1])
    })

    // Assert updateDoc was called with updated dailyTags list
    expect(updateDoc).toHaveBeenCalledTimes(1)
    const callArgs = vi.mocked(updateDoc).mock.calls[0]
    expect(callArgs[0]).toEqual({ type: 'doc', path: 'businesses/test-tenant/staff/staff2' })
    expect(callArgs[1].dailyTags).toHaveLength(1)
    expect(callArgs[1].dailyTags[0]).toMatchObject({
      text: 'Install transit shelving',
      completed: false
    })
  })

  it('triggers Firestore updateDoc when toggling a task completed status', async () => {
    render(<MorningMeetingBoard tenantId="test-tenant" />)
    
    await act(async () => {
      loadMockData()
    })

    // Toggle "Assemble fast wiring harness" (currently uncompleted)
    const taskItem = screen.getByText('Assemble fast wiring harness')
    
    await act(async () => {
      fireEvent.click(taskItem)
    })

    // Assert updateDoc was called with the toggled status
    expect(updateDoc).toHaveBeenCalledTimes(1)
    const callArgs = vi.mocked(updateDoc).mock.calls[0]
    expect(callArgs[0]).toEqual({ type: 'doc', path: 'businesses/test-tenant/staff/staff1' })
    expect(callArgs[1].dailyTags[0]).toMatchObject({
      id: 'tag1',
      text: 'Assemble fast wiring harness',
      completed: true // Toggled to true
    })
  })

  it('triggers Firestore updateDoc when deleting a task', async () => {
    render(<MorningMeetingBoard tenantId="test-tenant" />)
    
    await act(async () => {
      loadMockData()
    })

    // Delete "Clean workstation" (tag2)
    const deleteButtons = screen.getAllByTitle('Delete task')
    expect(deleteButtons).toHaveLength(2)

    await act(async () => {
      fireEvent.click(deleteButtons[1]) // Second delete button belongs to tag2
    })

    // Assert updateDoc was called with the task removed from list
    expect(updateDoc).toHaveBeenCalledTimes(1)
    const callArgs = vi.mocked(updateDoc).mock.calls[0]
    expect(callArgs[0]).toEqual({ type: 'doc', path: 'businesses/test-tenant/staff/staff1' })
    expect(callArgs[1].dailyTags).toHaveLength(1)
    expect(callArgs[1].dailyTags[0].id).toBe('tag1') // tag2 was deleted
  })

  it('enforces permissions: read-only board prevents actions and hides input/delete buttons', async () => {
    // Set permissions to read-only (empty)
    __setMockAuth({}, false)

    render(<MorningMeetingBoard tenantId="test-tenant" />)
    
    await act(async () => {
      loadMockData()
    })

    // Inputs and delete buttons should not be present
    expect(screen.queryByPlaceholderText('Add task for today...')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Add tag')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Delete task')).not.toBeInTheDocument()

    // Clicking a task should not trigger updateDoc
    const taskItem = screen.getByText('Assemble fast wiring harness')
    await act(async () => {
      fireEvent.click(taskItem)
    })

    expect(updateDoc).not.toHaveBeenCalled()
  })
})
