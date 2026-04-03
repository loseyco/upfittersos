import re
with open(r"c:\_Projects\SAEGroup\src\pages\business\admin\MeetingsAdminTab.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports
content = content.replace(
    "import { Calendar, Trash2, Edit2, Plus, RefreshCw, X, Users, Presentation, Users as UsersIcon, Truck, Briefcase, Video } from 'lucide-react';",
    "import { Calendar, Trash2, Edit2, Plus, RefreshCw, X, Users, Presentation, Users as UsersIcon, Truck, Briefcase, Video, CheckSquare, Link2, ExternalLink } from 'lucide-react';"
)

# 2. State
content = content.replace(
    "const [notes, setNotes] = useState('');",
    "const [notes, setNotes] = useState('');\n    const [actionItems, setActionItems] = useState<any[]>([]);\n    const [newActionText, setNewActionText] = useState('');\n    const [activeTab, setActiveTab] = useState<'workspace' | 'settings'>('workspace');"
)

# 3. resetForm
content = content.replace(
    "setNotes('');\n        setSelectedStaff([]);",
    "setNotes('');\n        setActionItems([]);\n        setNewActionText('');\n        setActiveTab('workspace');\n        setSelectedStaff([]);"
)

# 4. startEdit
content = content.replace(
    "setNotes(meeting.notes || '');\n        setSelectedStaff(meeting.staffIds || []);",
    "setNotes(meeting.notes || '');\n        setActionItems(meeting.actionItems || []);\n        setNewActionText('');\n        setActiveTab('workspace');\n        setSelectedStaff(meeting.staffIds || []);"
)

# 5. meetingData
content = content.replace(
    "notes,\n                staffIds: selectedStaff,",
    "notes,\n                actionItems,\n                staffIds: selectedStaff,"
)

# 6. Action Functions
funcs = """        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleActionItem = async (itemId: string, completed: boolean) => {
        const updatedItems = actionItems.map(i => i.id === itemId ? { ...i, completed } : i);
        setActionItems(updatedItems);
        if (editMode) {
            try { await updateDoc(doc(db, 'businesses', tenantId, 'meetings', editMode.id), { actionItems: updatedItems }); } catch (e) { console.error(e); }
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
            try { await updateDoc(doc(db, 'businesses', tenantId, 'meetings', editMode.id), { actionItems: updatedItems }); } catch (e) { console.error(e); }
        }
    };

    const removeActionItem = async (itemId: string) => {
        const updatedItems = actionItems.filter(i => i.id !== itemId);
        setActionItems(updatedItems);
        if (editMode) {
            try { await updateDoc(doc(db, 'businesses', tenantId, 'meetings', editMode.id), { actionItems: updatedItems }); } catch (e) { console.error(e); }
        }
    };"""
content = content.replace("        } finally {\n            setIsSubmitting(false);\n        }\n    };", funcs)

# 7. UI Replace
ui_start_marker = "{/* Editor Slide-over Matrix Context */}"
parts = content.split(ui_start_marker)

new_ui = """{/* Active Meeting Workspace */}
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
                                
                                {/* Link Bar (New feature based on user feedback) */}
                                {(selectedCanvases.length > 0 || selectedCustomers.length > 0 || selectedVehicles.length > 0 || selectedJobs.length > 0) && (
                                    <div className="flex flex-col gap-2">
                                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                            <Link2 className="w-3.5 h-3.5 text-zinc-400" /> Linked Resources
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedCanvases.map(id => {
                                                const canvas = canvases.find(c => c.id === id);
                                                return canvas ? (
                                                    <a key={id} href={`/business/manage?tab=canvases&canvasId=${id}`} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:text-white hover:bg-blue-500/30 transition-all text-xs font-bold">
                                                        <Presentation className="w-3.5 h-3.5" /> {canvas.name || 'Untitled Canvas'} <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
                                                    </a>
                                                ) : null;
                                            })}
                                            {selectedCustomers.map(id => {
                                                const c = customers.find(c => c.id === id);
                                                return c ? (
                                                    <a key={id} href={`/business/manage?tab=customers`} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:text-white hover:bg-emerald-500/30 transition-all text-xs font-bold">
                                                        <UsersIcon className="w-3.5 h-3.5" /> {c.firstName} {c.lastName} <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
                                                    </a>
                                                ) : null;
                                            })}
                                            {selectedJobs.map(id => {
                                                const job = jobs.find(j => j.id === id);
                                                return job ? (
                                                    <a key={id} href={`/business/manage?tab=jobs`} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-300 hover:text-white hover:bg-orange-500/30 transition-all text-xs font-bold">
                                                        <Briefcase className="w-3.5 h-3.5" /> {job.title} <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
                                                    </a>
                                                ) : null;
                                            })}
                                            {selectedVehicles.map(id => {
                                                const v = vehicles.find(v => v.id === id);
                                                return v ? (
                                                    <a key={id} href={`/business/manage?tab=fleet`} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:text-white hover:bg-purple-500/30 transition-all text-xs font-bold">
                                                        <Truck className="w-3.5 h-3.5" /> {v.year} {v.make} <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
                                                    </a>
                                                ) : null;
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Live Notes Area */}
                                <div className="flex flex-col flex-1 min-h-[300px]">
                                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3 flex items-center justify-between">
                                        <span>Meeting Notes & Minutes</span>
                                        <span className="text-zinc-600 font-medium normal-case tracking-normal">Supports Markdown</span>
                                    </label>
                                    <textarea 
                                        placeholder="Record key decisions, action items, and discussion points..."
                                        value={notes} onChange={e => setNotes(e.target.value)} disabled={!canManage}
                                        className="flex-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4 text-sm focus:outline-none focus:border-accent focus:bg-zinc-950 text-white transition-all resize-y shadow-inner disabled:opacity-50 min-h-[300px] font-mono"
                                    />
                                    <p className="text-[10px] text-zinc-600 font-bold mt-2 text-right">Click 'Save Meeting Record' to preserve notes.</p>
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
                                                    <button onClick={() => removeActionItem(item.id)} className="text-zinc-600 hover:text-red-400 p-1 rounded-lg hover:bg-red-500/10 transition-colors">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {actionItems.length === 0 && <p className="text-xs text-zinc-600 italic py-2">No action items added yet.</p>}
                                    </div>
                                    
                                    {canManage && (
                                        <form onSubmit={addActionItem} className="flex gap-2">
                                            <input 
                                                type="text" 
                                                placeholder="Quick to-do... e.g. Send updated pitch deck"
                                                value={newActionText}
                                                onChange={e => setNewActionText(e.target.value)}
                                                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:bg-zinc-950 text-white transition-all shadow-inner"
                                            />
                                            <button type="submit" disabled={!newActionText.trim()} className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white px-6 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50">
                                                Add Item
                                            </button>
                                        </form>
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
"""

content = parts[0] + new_ui
with open(r"c:\_Projects\SAEGroup\src\pages\business\admin\MeetingsAdminTab.tsx", "w", encoding="utf-8") as f:
    f.write(content)
