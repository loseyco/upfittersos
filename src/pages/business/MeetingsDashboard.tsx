import { useState, useEffect } from 'react';
import { Calendar, Trash2, Plus, RefreshCw, X, Users, Presentation, Users as UsersIcon, Truck, Briefcase, Video, CheckSquare, Link2, ExternalLink, Bold, List, ListOrdered, Heading1 } from 'lucide-react';
import toast from 'react-hot-toast';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, Timestamp, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';

export function MeetingsDashboard() {
    const [meetings, setMeetings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Dependencies
    const [staff, setStaff] = useState<any[]>([]);
    const [canvases, setCanvases] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [jobs, setJobs] = useState<any[]>([]);

    // Form State
    const [showAddForm, setShowAddForm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');
    const [meetingUrl, setMeetingUrl] = useState('');
    const [notes, setNotes] = useState('');
    const [actionItems, setActionItems] = useState<any[]>([]);
    const [newActionText, setNewActionText] = useState('');
    const [activeTab, setActiveTab] = useState<'workspace' | 'settings'>('workspace');
    const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
    const [selectedCanvases, setSelectedCanvases] = useState<string[]>([]);
    const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
    const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
    const [selectedJobs, setSelectedJobs] = useState<string[]>([]);

    const [editMode, setEditMode] = useState<any | null>(null);

    const { currentUser, tenantId } = useAuth();
    const { checkPermission } = usePermissions();

    const canManage = checkPermission('manage_meetings');
    const canViewAll = checkPermission('view_meetings');

    const fetchMeetings = async () => {
        try {
            setLoading(true);
            let q;
            if (canManage || canViewAll) {
                q = query(
                    collection(db, 'businesses', tenantId as string, 'meetings'),
                    orderBy('date', 'desc')
                );
            } else if (currentUser) {
                q = query(
                    collection(db, 'businesses', tenantId as string, 'meetings'),
                    where('staffIds', 'array-contains', currentUser.uid),
                    orderBy('date', 'desc')
                );
            } else {
                setMeetings([]);
                setLoading(false);
                return;
            }

            const snapshot = await getDocs(q);
            setMeetings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
            console.error(err);
            toast.error("Failed to load meetings.");
        } finally {
            setLoading(false);
        }
    };

    const fetchDependencies = async () => {
        try {
            // Fetch Staff
            const staffRes = await api.get(`/businesses/${tenantId}/staff`);
            setStaff(staffRes.data);

            // Fetch Canvases
            const canvasSnapshot = await getDocs(query(collection(db, 'business_canvases'), where('tenantId', '==', tenantId)));
            setCanvases(canvasSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            
            // Try fetching others via API where possible
            try {
                const [custRes, vehRes, jobRes] = await Promise.all([
                    api.get(`/customers?tenantId=${tenantId}`),
                    api.get(`/vehicles?tenantId=${tenantId}`),
                    api.get(`/jobs?tenantId=${tenantId}`)
                ]);
                setCustomers(custRes.data);
                setVehicles(vehRes.data);
                setJobs(jobRes.data);
            } catch (err) {
                console.error("Failed to load extended api dependencies", err);
            }
        } catch (err) {
            console.error("Failed to load dependencies", err);
        }
    };

    useEffect(() => {
        if (!tenantId || tenantId === 'unassigned') return;
        fetchMeetings();
        fetchDependencies();
    }, [tenantId]);

    // Debounced auto-save specifically for Meeting Notes
    useEffect(() => {
        if (!editMode) return;
        
        // Skip save if there are no changes
        const originalNotes = editMode.notes || '';
        if (originalNotes === notes) return;

        const timer = setTimeout(async () => {
            try {
                await updateDoc(doc(db, 'businesses', tenantId as string, 'meetings', editMode.id), { 
                    notes,
                    updatedAt: Timestamp.now() 
                });
                setEditMode((prev: any) => prev ? { ...prev, notes } : null);
            } catch (err) {
                console.error("Auto-save failed:", err);
            }
        }, 1200);

        return () => clearTimeout(timer);
    }, [notes, editMode, tenantId]);

    const insertMarkdown = (prefix: string, isBlock: boolean = false) => {
        const textarea = document.getElementById('meeting-notes-editor') as HTMLTextAreaElement;
        if (!textarea) return;
        
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = notes;
        
        let newText = '';
        let newCursor = start;
        let finalSelectionLength = 0;

        if (isBlock) {
            const lastNewLine = text.substring(0, start).lastIndexOf('\n');
            const lineStart = lastNewLine + 1;
            newText = text.substring(0, lineStart) + prefix + ' ' + text.substring(lineStart);
            newCursor = end + prefix.length + 1;
        } else {
            const selectedMatch = text.substring(start, end);
            newText = text.substring(0, start) + prefix + selectedMatch + prefix + text.substring(end);
            newCursor = start + prefix.length;
            finalSelectionLength = selectedMatch.length;
        }
        
        setNotes(newText);
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(newCursor, newCursor + finalSelectionLength);
        }, 0);
    };

    const handleNotesKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter') {
            const target = e.target as HTMLTextAreaElement;
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const text = target.value;

            const beforeCursor = text.substring(0, start);
            const lastNewLine = beforeCursor.lastIndexOf('\n');
            const currentLine = beforeCursor.substring(lastNewLine + 1);

            const bulletMatch = currentLine.match(/^(\s*)([-*]\s)(.*)/);
            const taskMatch = currentLine.match(/^(\s*)(-\s\[[ x]\]\s)(.*)/);
            const numberMatch = currentLine.match(/^(\s*)(\d+\.\s)(.*)/);

            if (taskMatch || bulletMatch || numberMatch) {
                e.preventDefault();
                
                let prefix = '';
                if (taskMatch) {
                    if (!taskMatch[3].trim()) {
                        setNotes(text.substring(0, start - currentLine.length) + text.substring(end));
                        return;
                    }
                    prefix = `\n${taskMatch[1]}- [ ] `;
                } else if (bulletMatch) {
                    if (!bulletMatch[3].trim()) {
                        setNotes(text.substring(0, start - currentLine.length) + text.substring(end));
                        return;
                    }
                    prefix = `\n${bulletMatch[1]}${bulletMatch[2]}`;
                } else if (numberMatch) {
                    if (!numberMatch[3].trim()) {
                        setNotes(text.substring(0, start - currentLine.length) + text.substring(end));
                        return;
                    }
                    const nextNum = parseInt(numberMatch[2]) + 1;
                    prefix = `\n${numberMatch[1]}${nextNum}. `;
                }

                const newText = text.substring(0, start) + prefix + text.substring(end);
                setNotes(newText);
                
                setTimeout(() => {
                    target.setSelectionRange(start + prefix.length, start + prefix.length);
                }, 0);
            }
        }
    };

    const resetForm = () => {
        setTitle('');
        setDate('');
        setMeetingUrl('');
        setNotes('');
        setActionItems([]);
        setNewActionText('');
        setActiveTab('workspace');
        setSelectedStaff([]);
        setSelectedCanvases([]);
        setSelectedCustomers([]);
        setSelectedVehicles([]);
        setSelectedJobs([]);
        setEditMode(null);
        setShowAddForm(false);
    };

    const startEdit = (meeting: any) => {
        setEditMode(meeting);
        setTitle(meeting.title || '');
        setDate(meeting.date || '');
        setMeetingUrl(meeting.meetingUrl || '');
        setNotes(meeting.notes || '');
        setActionItems(meeting.actionItems || []);
        setNewActionText('');
        setActiveTab('workspace');
        setSelectedStaff(meeting.staffIds || []);
        setSelectedCanvases(meeting.canvasIds || []);
        setSelectedCustomers(meeting.customerIds || []);
        setSelectedVehicles(meeting.vehicleIds || []);
        setSelectedJobs(meeting.jobIds || []);
        setShowAddForm(true);
    };

    const handleSaveMeeting = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !date) return toast.error("Title and Date are required.");
        
        try {
            setIsSubmitting(true);
            
            const meetingData = {
                title,
                date,
                meetingUrl,
                notes,
                actionItems,
                staffIds: selectedStaff,
                canvasIds: selectedCanvases,
                customerIds: selectedCustomers,
                vehicleIds: selectedVehicles,
                jobIds: selectedJobs,
                updatedAt: Timestamp.now()
            };

            if (editMode) {
                await updateDoc(doc(db, 'businesses', tenantId as string, 'meetings', editMode.id), meetingData);
                toast.success("Meeting updated successfully");
            } else {
                await addDoc(collection(db, 'businesses', tenantId as string, 'meetings'), {
                    ...meetingData,
                    createdAt: Timestamp.now()
                });
                toast.success("Meeting scheduled successfully");
            }
            
            resetForm();
            fetchMeetings();
        } catch (err) {
            console.error(err);
            toast.error("Failed to save meeting parameters");
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleActionItem = async (itemId: string, completed: boolean) => {
        const updatedItems = actionItems.map(i => i.id === itemId ? { ...i, completed } : i);
        setActionItems(updatedItems);
        if (editMode) {
            try { await updateDoc(doc(db, 'businesses', tenantId as string, 'meetings', editMode.id), { actionItems: updatedItems }); } catch (e) { console.error(e); }
        }
    };

    const addActionItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newActionText.trim()) return;
        const newItem = { id: Date.now().toString(), text: newActionText.trim(), completed: false };
        const updatedItems = [...actionItems, newItem];
        setActionItems(updatedItems);
        setNewActionText('');
        if (editMode) {
            try { await updateDoc(doc(db, 'businesses', tenantId as string, 'meetings', editMode.id), { actionItems: updatedItems }); } catch (e) { console.error(e); }
        }
    };

    const removeActionItem = async (itemId: string) => {
        const updatedItems = actionItems.filter(i => i.id !== itemId);
        setActionItems(updatedItems);
        if (editMode) {
            try { await updateDoc(doc(db, 'businesses', tenantId as string, 'meetings', editMode.id), { actionItems: updatedItems }); } catch (e) { console.error(e); }
        }
    };

    const handleDelete = async (meetingId: string) => {
        if (!window.confirm("Permanently delete this meeting record?")) return;
        try {
            await deleteDoc(doc(db, 'businesses', tenantId as string, 'meetings', meetingId));
            toast.success("Meeting removed");
            fetchMeetings();
        } catch (err) {
            toast.error("Failed to delete meeting");
        }
    };

    const toggleSelection = (id: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
        setter(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    if (loading && meetings.length === 0) {
        return <div className="p-8 text-zinc-500 font-bold text-center">Loading Meetings...</div>;
    }

    return (
        <div className="flex flex-col h-[100dvh] pt-16 bg-zinc-950">
            {/* Header */}
            <div className="p-4 bg-zinc-900 border-b border-zinc-800 shrink-0 flex items-center justify-between">
                <div>
                    <h3 className="text-white font-bold tracking-tight flex items-center gap-3">
                        Meetings & Notes
                        <span className="px-2 py-0.5 rounded-md bg-accent/20 text-accent text-[10px] font-black uppercase tracking-widest border border-accent/30">Alpha</span>
                    </h3>
                    <p className="text-zinc-500 text-xs mt-0.5">Track team meetings, logical canvases, and attendee minutes.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={fetchMeetings} className="p-2 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    {canManage && (
                        <button 
                            onClick={() => { resetForm(); setShowAddForm(true); }}
                            className="bg-accent hover:bg-accent-hover text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
                        >
                            <Plus className="w-4 h-4" /> New Meeting
                        </button>
                    )}
                </div>
            </div>

            {/* Main Content View Container */}
            <div className="flex-1 overflow-hidden flex flex-row">
                
                {/* List View */}
                <div className={`flex-1 overflow-y-auto ${showAddForm ? 'hidden lg:block border-r border-zinc-800 lg:max-w-md xl:max-w-lg' : ''}`}>
                    {meetings.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center h-full">
                            <Calendar className="w-12 h-12 text-zinc-800 mb-4" />
                            <h3 className="text-lg font-bold text-white mb-1">No Meetings Scheduled</h3>
                            <p className="text-zinc-500 text-sm">Create a meeting to track notes and whiteboard logic.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-zinc-800/50">
                            {meetings.map((meeting) => (
                                <div 
                                    key={meeting.id} 
                                    onClick={() => startEdit(meeting)}
                                    className="p-5 hover:bg-zinc-800/40 transition-colors group flex flex-col gap-3 cursor-pointer"
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="font-bold text-white text-lg group-hover:text-accent transition-colors">{meeting.title}</h4>
                                            <span className="text-xs text-accent font-mono uppercase mt-1 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {meeting.date}</span>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {meeting.meetingUrl && (
                                                <a onClick={(e) => e.stopPropagation()} href={meeting.meetingUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-blue-500/10 text-blue-400 hover:text-white hover:bg-blue-500 hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] rounded-lg mr-2 flex items-center gap-2 text-xs font-bold transition-all" title="Join Video Meeting">
                                                    <Video className="w-4 h-4" /> Join
                                                </a>
                                            )}
                                            {canManage && (
                                                <button onClick={(e) => { e.stopPropagation(); handleDelete(meeting.id); }} className="p-2 bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-zinc-500 transition-colors" title="Delete Meeting">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {meeting.notes && (
                                        <p className="text-sm text-zinc-400 line-clamp-2 leading-relaxed">
                                            {meeting.notes}
                                        </p>
                                    )}

                                    <div className="flex items-center gap-4 mt-2">
                                        {meeting.staffIds?.length > 0 && (
                                            <div className="flex z-0 items-center text-xs text-zinc-500 font-bold gap-1.5">
                                                <Users className="w-3.5 h-3.5 text-zinc-600" />
                                                {meeting.staffIds.length} Attendees
                                            </div>
                                        )}
                                        {meeting.canvasIds?.length > 0 && (
                                            <div className="flex items-center text-xs text-zinc-500 font-bold gap-1.5">
                                                <Presentation className="w-3.5 h-3.5 text-blue-500/70" />
                                                {meeting.canvasIds.length} Workflows
                                            </div>
                                        )}
                                        {meeting.customerIds?.length > 0 && (
                                            <div className="flex items-center text-xs text-zinc-500 font-bold gap-1.5">
                                                <UsersIcon className="w-3.5 h-3.5 text-emerald-500/70" />
                                                {meeting.customerIds.length} Clients
                                            </div>
                                        )}
                                        {meeting.vehicleIds?.length > 0 && (
                                            <div className="flex items-center text-xs text-zinc-500 font-bold gap-1.5">
                                                <Truck className="w-3.5 h-3.5 text-purple-500/70" />
                                                {meeting.vehicleIds.length} Fleet Orgs
                                            </div>
                                        )}
                                        {meeting.jobIds?.length > 0 && (
                                            <div className="flex items-center text-xs text-zinc-500 font-bold gap-1.5">
                                                <Briefcase className="w-3.5 h-3.5 text-orange-500/70" />
                                                {meeting.jobIds.length} Jobs
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Editor Slide-over Matrix Context */}
                {showAddForm && (
                    <div className="flex-1 bg-zinc-950 flex flex-col h-full overflow-hidden shrink-0 min-w-0 transition-all z-10 w-full lg:w-auto relative border-l border-zinc-800">
                        <div className="pt-6 px-6 border-b border-zinc-800 flex flex-col gap-4 bg-zinc-900/50 backdrop-blur-md shrink-0">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                                        <Calendar className="w-5 h-5 text-accent" /> {title || "New Meeting Record"}
                                    </h3>
                                    {date && <p className="text-sm text-zinc-500 font-mono mt-1 px-7">{date.replace('T', ' ')}</p>}
                                </div>
                                <div className="flex items-center gap-3">
                                    {meetingUrl && (
                                        <a href={meetingUrl} target="_blank" rel="noopener noreferrer" className="bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                                            <Video className="w-4 h-4" /> <span className="hidden md:inline">Join Call</span>
                                        </a>
                                    )}
                                    <button onClick={resetForm} className="text-zinc-500 hover:text-white transition-colors bg-zinc-800 p-2 rounded-xl" title="Close Workspace">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                            
                            {/* Tabs Header */}
                            <div className="flex items-center gap-6 mt-2">
                                <button
                                    onClick={() => setActiveTab('workspace')}
                                    className={`pb-3 px-1 border-b-2 transition-colors text-sm font-black uppercase tracking-widest shrink-0 ${activeTab === 'workspace' ? 'border-accent text-accent' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    Workspace
                                </button>
                                <button
                                    onClick={() => setActiveTab('settings')}
                                    className={`pb-3 px-1 border-b-2 transition-colors text-sm font-black uppercase tracking-widest shrink-0 ${activeTab === 'settings' ? 'border-accent text-accent' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    Settings
                                </button>
                            </div>
                        </div>

                        {activeTab === 'workspace' && (
                            <div className="flex-1 overflow-y-auto p-6 lg:p-8 relative custom-scrollbar flex flex-col gap-8">
                                
                                {/* Link Bar */}
                                {(selectedCanvases.length > 0 || selectedCustomers.length > 0 || selectedVehicles.length > 0 || selectedJobs.length > 0) && (
                                    <div className="flex flex-col gap-2">
                                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                            <Link2 className="w-3.5 h-3.5 text-zinc-400" /> Linked Resources
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedCanvases.map(id => {
                                                const canvas = canvases.find(c => c.id === id);
                                                return canvas ? (
                                                    <a key={id} href={`/business/canvases?canvasId=${id}`} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:text-white hover:bg-blue-500/30 transition-all text-xs font-bold">
                                                        <Presentation className="w-3.5 h-3.5" /> {canvas.name || 'Untitled Canvas'} <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
                                                    </a>
                                                ) : null;
                                            })}
                                            {selectedCustomers.map(id => {
                                                const c = customers.find(c => c.id === id);
                                                return c ? (
                                                    <button type="button" key={id} onClick={() => window.location.href = `/business/manage?tab=customers`} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:text-white hover:bg-emerald-500/30 transition-all text-xs font-bold">
                                                        <UsersIcon className="w-3.5 h-3.5" /> {c.firstName} {c.lastName} <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
                                                    </button>
                                                ) : null;
                                            })}
                                            {selectedJobs.map(id => {
                                                const job = jobs.find(j => j.id === id);
                                                return job ? (
                                                    <button type="button" key={id} onClick={() => window.location.href = `/business/manage?tab=jobs`} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-300 hover:text-white hover:bg-orange-500/30 transition-all text-xs font-bold">
                                                        <Briefcase className="w-3.5 h-3.5" /> {job.title} <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
                                                    </button>
                                                ) : null;
                                            })}
                                            {selectedVehicles.map(id => {
                                                const v = vehicles.find(v => v.id === id);
                                                return v ? (
                                                    <button type="button" key={id} onClick={() => window.location.href = `/business/manage?tab=vehicles`} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:text-white hover:bg-purple-500/30 transition-all text-xs font-bold">
                                                        <Truck className="w-3.5 h-3.5" /> {v.year} {v.make} <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
                                                    </button>
                                                ) : null;
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Live Notes Area */}
                                <div className="flex flex-col flex-1 min-h-[400px]">
                                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 flex items-center justify-between">
                                        <span>Meeting Notes & Minutes</span>
                                        <span className="text-zinc-600 font-medium normal-case tracking-normal">Auto-saves implicitly</span>
                                    </label>
                                    
                                    <div className="flex flex-col flex-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-inner focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/50 transition-all">
                                        {/* Toolbar */}
                                        {canManage && (
                                            <div className="px-3 py-2 border-b border-zinc-800/50 bg-zinc-950/30 flex items-center gap-1 shrink-0">
                                                <button type="button" onClick={() => insertMarkdown('**')} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors" title="Bold">
                                                    <Bold className="w-3.5 h-3.5" />
                                                </button>
                                                <button type="button" onClick={() => insertMarkdown('###', true)} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors" title="Heading">
                                                    <Heading1 className="w-3.5 h-3.5" />
                                                </button>
                                                <div className="w-px h-4 bg-zinc-800 mx-1"></div>
                                                <button type="button" onClick={() => insertMarkdown('-', true)} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors" title="Bullet List">
                                                    <List className="w-3.5 h-3.5" />
                                                </button>
                                                <button type="button" onClick={() => insertMarkdown('1.', true)} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors" title="Numbered List">
                                                    <ListOrdered className="w-3.5 h-3.5" />
                                                </button>
                                                <button type="button" onClick={() => insertMarkdown('- [ ]', true)} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors" title="To-Do List">
                                                    <CheckSquare className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        )}
                                        <textarea
                                            id="meeting-notes-editor"
                                            placeholder="Record key decisions, action items, and discussion points... Use toolbar or type '-' for a bullet."
                                            value={notes}
                                            onChange={e => setNotes(e.target.value)}
                                            onKeyDown={handleNotesKeyDown}
                                            disabled={!canManage}
                                            className="flex-1 w-full bg-transparent px-4 py-4 text-sm focus:outline-none text-zinc-200 resize-none min-h-[300px] leading-relaxed custom-scrollbar"
                                        />
                                    </div>
                                    <p className="text-[10px] text-zinc-600 font-bold mt-2 text-right">Markdown automatically continues lists on Enter.</p>
                                </div>

                                {/* Action Items List */}
                                <div className="flex flex-col">
                                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <CheckSquare className="w-4 h-4 text-emerald-500" /> Action Items / To-Dos
                                    </label>
                                    
                                    <div className="space-y-2 mb-4">
                                        {actionItems.map(item => (
                                            <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${item.completed ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
                                                <input 
                                                    type="checkbox"
                                                    checked={item.completed}
                                                    onChange={(e) => toggleActionItem(item.id, e.target.checked)}
                                                    disabled={!canManage}
                                                    className="w-5 h-5 rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer disabled:opacity-50 grid place-content-center appearance-none checked:bg-emerald-500 checked:border-emerald-500 checked:before:content-[''] checked:before:w-2 checked:before:h-3 checked:before:border-r-2 checked:before:border-b-2 checked:before:border-white checked:before:rotate-45 checked:before:-translate-y-0.5"
                                                />
                                                <span className={`flex-1 text-sm font-medium ${item.completed ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                                                    {item.text}
                                                </span>
                                                {canManage && (
                                                    <button type="button" onClick={() => removeActionItem(item.id)} className="text-zinc-600 hover:text-red-400 p-1 rounded-lg hover:bg-red-500/10 transition-colors">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {actionItems.length === 0 && <p className="text-xs text-zinc-600 italic py-2">No action items added yet.</p>}
                                    </div>
                                    
                                    {canManage && (
                                        <div className="flex gap-2">
                                            <input 
                                                type="text" 
                                                placeholder="Quick to-do... e.g. Send updated pitch deck"
                                                value={newActionText}
                                                onChange={e => setNewActionText(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        addActionItem(e as any);
                                                    }
                                                }}
                                                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:bg-zinc-950 text-white transition-all shadow-inner"
                                            />
                                            <button type="button" onClick={addActionItem} disabled={!newActionText.trim()} className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white px-6 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50">
                                                Add Item
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="h-4"></div>
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div className="flex-1 overflow-y-auto p-6 lg:p-8 relative custom-scrollbar">
                                <form id="meetingForm" onSubmit={handleSaveMeeting} className="space-y-8 max-w-3xl">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Meeting Title</label>
                                            <input 
                                                type="text" required placeholder="e.g. Q3 Production Review"
                                                value={title} onChange={e => setTitle(e.target.value)} disabled={!canManage}
                                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent focus:bg-zinc-950 text-white transition-all shadow-inner disabled:opacity-50"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Date & Time</label>
                                            <input 
                                                type="datetime-local" required
                                                value={date} onChange={e => setDate(e.target.value)} disabled={!canManage}
                                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent focus:bg-zinc-950 text-white transition-all shadow-inner [color-scheme:dark] disabled:opacity-50"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1 flex items-center gap-2">
                                            <Video className="w-3.5 h-3.5 text-blue-500" />
                                            Meeting URL / Join Link
                                        </label>
                                        <input 
                                            type="url" placeholder="https://zoom.us/j/..."
                                            value={meetingUrl} onChange={e => setMeetingUrl(e.target.value)} disabled={!canManage}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent focus:bg-zinc-950 text-white transition-all shadow-inner disabled:opacity-50 font-mono"
                                        />
                                    </div>

                                    <div className="pt-6 border-t border-zinc-800/50">
                                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4 ml-1 flex items-center gap-2">
                                            <Users className="w-3.5 h-3.5 text-zinc-400" /> Attendees / Staff Involved
                                        </label>
                                        
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {selectedStaff.length === 0 && <span className="text-xs text-zinc-600">No staff added yet.</span>}
                                            {selectedStaff.map(uid => {
                                                const user = staff.find(s => s.uid === uid);
                                                return (
                                                    <div key={uid} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-white text-xs font-bold">
                                                        {user?.displayName || user?.email?.split('@')[0] || uid.substring(0, 8)}
                                                        {canManage && (
                                                            <button type="button" onClick={() => toggleSelection(uid, setSelectedStaff)} className="text-zinc-500 hover:text-white transition-colors">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        
                                        {canManage && (
                                            <select 
                                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent focus:bg-zinc-950 text-white transition-all shadow-inner custom-scrollbar"
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        toggleSelection(e.target.value, setSelectedStaff);
                                                        e.target.value = "";
                                                    }
                                                }}
                                                defaultValue=""
                                            >
                                                <option value="" disabled>+ Add Staff Member...</option>
                                                {staff.filter(u => !selectedStaff.includes(u.uid)).map(user => (
                                                    <option key={user.uid} value={user.uid}>
                                                        {user.displayName || user.email?.split('@')[0]}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>

                                    <div className="pt-6 border-t border-zinc-800/50">
                                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4 ml-1 flex items-center gap-2">
                                            <Presentation className="w-3.5 h-3.5 text-blue-500" /> Linked Visual Logic / Whiteboards
                                        </label>
                                        
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {selectedCanvases.length === 0 && <span className="text-xs text-zinc-600">No whiteboards linked.</span>}
                                            {selectedCanvases.map(id => {
                                                const canvas = canvases.find(c => c.id === id);
                                                return (
                                                    <div key={id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-100 text-xs font-bold">
                                                        {canvas?.name || 'Untitled Whiteboard Canvas'}
                                                        {canManage && (
                                                            <button type="button" onClick={() => toggleSelection(id, setSelectedCanvases)} className="text-zinc-500 hover:text-white transition-colors">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {canManage && canvases.length > 0 && (
                                            <select 
                                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent focus:bg-zinc-950 text-zinc-400 transition-all shadow-inner custom-scrollbar"
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        toggleSelection(e.target.value, setSelectedCanvases);
                                                        e.target.value = "";
                                                    }
                                                }}
                                                defaultValue=""
                                            >
                                                <option value="" disabled>+ Link a logic whiteboard...</option>
                                                {canvases.filter(c => !selectedCanvases.includes(c.id)).map(canvas => (
                                                    <option key={canvas.id} value={canvas.id}>
                                                        {canvas.name || 'Untitled Whiteboard Canvas'} • {canvas.id.slice(-8)}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                        {canvases.length === 0 && <p className="text-xs text-zinc-600 mt-2">No logic canvases exist in this workspace.</p>}
                                    </div>
                                    
                                    <div className="pt-6 border-t border-zinc-800/50">
                                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4 ml-1 flex items-center gap-2">
                                            <Briefcase className="w-3.5 h-3.5 text-orange-500" /> Reference Jobs
                                        </label>
                                        
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {selectedJobs.length === 0 && <span className="text-xs text-zinc-600">No jobs linked.</span>}
                                            {selectedJobs.map(id => {
                                                const job = jobs.find(j => j.id === id);
                                                return (
                                                    <div key={id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-100 text-xs font-bold">
                                                        {job?.title || `Job #${id.substring(0,6)}`}
                                                        {canManage && (
                                                            <button type="button" onClick={() => toggleSelection(id, setSelectedJobs)} className="text-zinc-500 hover:text-white transition-colors">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        
                                        {canManage && jobs.length > 0 && (
                                            <select 
                                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent focus:bg-zinc-950 text-zinc-400 transition-all shadow-inner custom-scrollbar"
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        toggleSelection(e.target.value, setSelectedJobs);
                                                        e.target.value = "";
                                                    }
                                                }}
                                                defaultValue=""
                                            >
                                                <option value="" disabled>+ Link a job...</option>
                                                {jobs.filter(j => !selectedJobs.includes(j.id)).map(job => (
                                                    <option key={job.id} value={job.id}>
                                                        {job.title || `Job #${job.id.substring(0,8)}`}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-zinc-800/50">
                                        <div>
                                            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4 ml-1 flex items-center gap-2">
                                                <UsersIcon className="w-3.5 h-3.5 text-emerald-500" /> Clients / Customers
                                            </label>
                                            
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {selectedCustomers.length === 0 && <span className="text-xs text-zinc-600">No customers linked.</span>}
                                                {selectedCustomers.map(id => {
                                                    const c = customers.find(c => c.id === id);
                                                    return (
                                                        <div key={id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-100 text-xs font-bold">
                                                            {c?.firstName} {c?.lastName} {c?.company ? `(${c.company})` : ''}
                                                            {canManage && (
                                                                <button type="button" onClick={() => toggleSelection(id, setSelectedCustomers)} className="text-zinc-500 hover:text-white transition-colors">
                                                                    <X className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {canManage && customers.length > 0 && (
                                                <select 
                                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-accent focus:bg-zinc-950 text-zinc-400 transition-all shadow-inner custom-scrollbar"
                                                    onChange={(e) => {
                                                        if (e.target.value) {
                                                            toggleSelection(e.target.value, setSelectedCustomers);
                                                            e.target.value = "";
                                                        }
                                                    }}
                                                    defaultValue=""
                                                >
                                                    <option value="" disabled>+ Link a customer...</option>
                                                    {customers.filter(c => !selectedCustomers.includes(c.id)).map(c => (
                                                        <option key={c.id} value={c.id}>
                                                            {c.firstName} {c.lastName} {c.company ? `(${c.company})` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4 ml-1 flex items-center gap-2">
                                                <Truck className="w-3.5 h-3.5 text-purple-500" /> Fleet / Vehicles
                                            </label>
                                            
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {selectedVehicles.length === 0 && <span className="text-xs text-zinc-600">No vehicles linked.</span>}
                                                {selectedVehicles.map(id => {
                                                    const v = vehicles.find(v => v.id === id);
                                                    return (
                                                        <div key={id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-100 text-xs font-bold">
                                                            {v ? `${v.year} ${v.make} ${v.model}` : 'Vehicle'}
                                                            {canManage && (
                                                                <button type="button" onClick={() => toggleSelection(id, setSelectedVehicles)} className="text-zinc-500 hover:text-white transition-colors">
                                                                    <X className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {canManage && vehicles.length > 0 && (
                                                <select 
                                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-accent focus:bg-zinc-950 text-zinc-400 transition-all shadow-inner custom-scrollbar"
                                                    onChange={(e) => {
                                                        if (e.target.value) {
                                                            toggleSelection(e.target.value, setSelectedVehicles);
                                                            e.target.value = "";
                                                        }
                                                    }}
                                                    defaultValue=""
                                                >
                                                    <option value="" disabled>+ Link a vehicle...</option>
                                                    {vehicles.filter(v => !selectedVehicles.includes(v.id)).map(v => (
                                                        <option key={v.id} value={v.id}>
                                                            {v.year} {v.make} {v.model} - {v.vin?.substring(v.vin.length - 6) || 'No VIN'}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    </div>
                                    <div className="h-10"></div> {/* Bottom Padding */}
                                </form>
                            </div>
                        )}

                        <div className="p-4 border-t border-zinc-800 bg-zinc-900 shrink-0 flex justify-end gap-3 px-6 lg:px-8 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-20">
                            {canManage && (
                                <button 
                                    onClick={(e) => handleSaveMeeting(e as any)}
                                    disabled={isSubmitting} 
                                    className="w-full bg-accent text-white hover:bg-accent-hover font-bold py-3.5 px-8 rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                                    {isSubmitting ? 'Saving Updates...' : 'Save Meeting Record'}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
