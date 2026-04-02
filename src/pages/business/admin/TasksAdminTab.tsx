import { useState, useEffect } from 'react';
import { ClipboardList, Trash2, Edit2, Plus, RefreshCw } from 'lucide-react';
import { api } from '../../../lib/api';
import toast from 'react-hot-toast';

export function TasksAdminTab({ tenantId }: { tenantId: string }) {
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [staff, setStaff] = useState<any[]>([]);
    
    // Form State
    const [showAddForm, setShowAddForm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [taskTitle, setTaskTitle] = useState('');
    const [taskType, setTaskType] = useState('Standard');
    const [taskAssignee, setTaskAssignee] = useState('');

    const fetchTasks = async () => {
        try {
            const res = await api.get(`/tasks?tenantId=${tenantId}`);
            setTasks(res.data);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load tasks.");
        } finally {
            setLoading(false);
        }
    };

    const fetchStaff = async () => {
        try {
            const res = await api.get(`/businesses/${tenantId}/staff`);
            setStaff(res.data);
            if (res.data.length > 0) {
                setTaskAssignee(res.data[0].uid);
            }
        } catch (err) {
            console.error("Failed to load staff for task assignment", err);
        }
    };

    useEffect(() => {
        fetchTasks();
        fetchStaff();
    }, [tenantId]);

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!taskTitle || !taskAssignee) return toast.error("Title and Assignee are required.");
        
        try {
            setIsSubmitting(true);
            await api.post('/tasks', {
                title: taskTitle,
                type: taskType,
                assigneeUid: taskAssignee,
                tenantId
            });
            toast.success("Task assigned successfully");
            setShowAddForm(false);
            setTaskTitle('');
            fetchTasks();
        } catch (err) {
            console.error(err);
            toast.error("Failed to create task");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleStatus = async (taskId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
        try {
            await api.put(`/tasks/${taskId}`, { status: newStatus });
            toast.success(`Task marked as ${newStatus}`);
            fetchTasks();
        } catch (err) {
            toast.error("Failed to update task status");
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        if (!window.confirm("Permanently delete this task?")) return;
        try {
            await api.delete(`/tasks/${taskId}`);
            toast.success("Task removed");
            fetchTasks();
        } catch (err) {
            toast.error("Failed to remove task");
        }
    };

    if (loading) {
        return <div className="p-8 text-zinc-500 font-bold text-center">Loading Tasks...</div>;
    }

    return (
        <div className="flex flex-col h-full bg-zinc-950">
            {/* Quick Add Bar */}
            <div className="p-4 bg-zinc-900 border-b border-zinc-800 shrink-0 flex items-center justify-between">
                <div>
                    <h3 className="text-white font-bold tracking-tight">Assigned Tasks</h3>
                    <p className="text-zinc-500 text-xs mt-0.5">Manage tasks assigned to your staff.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={fetchTasks} className="p-2 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="bg-accent hover:bg-accent-hover text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
                    >
                        {showAddForm ? 'Cancel' : <><Plus className="w-4 h-4" /> Assign New Task</>}
                    </button>
                </div>
            </div>

            {/* Inline Add Form */}
            {showAddForm && (
                <form onSubmit={handleCreateTask} className="p-4 bg-zinc-900 border-b border-zinc-800 shrink-0 flex flex-col md:flex-row items-end gap-4">
                    <div className="flex-1 w-full relative">
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Task Title</label>
                        <input 
                            type="text" 
                            required
                            placeholder="e.g. Inspect vehicle bay 4..."
                            value={taskTitle}
                            onChange={e => setTaskTitle(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent text-white"
                        />
                    </div>
                    <div className="w-full md:w-48 shrink-0 relative">
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Directive Type</label>
                        <select 
                            value={taskType}
                            onChange={e => setTaskType(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent text-white appearance-none cursor-pointer"
                        >
                            <option value="Standard">Standard</option>
                            <option value="Maintenance">Maintenance</option>
                            <option value="Diagnostic">Diagnostic</option>
                            <option value="Administrative">Administrative</option>
                            <option value="Urgent">Urgent</option>
                        </select>
                    </div>
                    <div className="w-full md:w-64 shrink-0 relative">
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Assign to Staff</label>
                        <select 
                            required
                            value={taskAssignee}
                            onChange={e => setTaskAssignee(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent text-white appearance-none cursor-pointer"
                        >
                            <option value="" disabled>Select Staff Member</option>
                            {staff.map(user => (
                                <option key={user.uid} value={user.uid}>
                                    {user.displayName || user.email} {user.jobTitle ? `(${user.jobTitle})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="w-full md:w-auto bg-white/10 hover:bg-white text-zinc-300 hover:text-black disabled:opacity-50 font-black px-6 py-2 rounded-lg flex items-center justify-center transition-colors text-sm"
                    >
                        {isSubmitting ? 'Dispatching...' : 'Dispatch Task'}
                    </button>
                </form>
            )}

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-zinc-900/50 border-b border-zinc-800 text-xs font-black text-zinc-500 uppercase tracking-widest shrink-0">
                <div className="col-span-5 md:col-span-4">Title</div>
                <div className="col-span-4 md:col-span-3">Assigned To</div>
                <div className="hidden md:block col-span-3">Status</div>
                <div className="col-span-3 md:col-span-2 text-right">Actions</div>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-y-auto">
                {tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <ClipboardList className="w-12 h-12 text-zinc-800 mb-4" />
                        <h3 className="text-lg font-bold text-white mb-1">No Tasks Found</h3>
                        <p className="text-zinc-500 text-sm">There are no tasks assigned yet.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-800/50">
                        {tasks.map((task) => (
                            <div key={task.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-zinc-900/30 transition-colors group">
                                <div className="col-span-5 md:col-span-4 flex flex-col">
                                    <span className="font-bold text-sm text-zinc-200 group-hover:text-white transition-colors">{task.title}</span>
                                    <span className="text-xs text-zinc-500 font-mono uppercase mt-0.5">{task.type}</span>
                                </div>
                                <div className="col-span-4 md:col-span-3 flex items-center text-xs font-bold text-zinc-400">
                                    {/* Try to resolve staff name locally */}
                                    {staff.find(s => s.uid === task.assigneeUid)?.displayName || staff.find(s => s.uid === task.assigneeUid)?.email || (
                                        <span className="font-mono text-[10px] bg-zinc-900 px-2 py-1 rounded border border-zinc-800 truncate block text-center">
                                            {task.assigneeUid.substring(0, 8)}...
                                        </span>
                                    )}
                                </div>
                                <div className="hidden md:flex col-span-3 items-center">
                                    <button 
                                        onClick={() => handleToggleStatus(task.id, task.status)}
                                        className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded border transition-colors ${task.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20'}`}
                                    >
                                        {task.status}
                                    </button>
                                </div>
                                <div className="col-span-3 md:col-span-2 flex items-center justify-end gap-2">
                                    <button 
                                        title="View Details"
                                        className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteTask(task.id)}
                                        title="Delete Task"
                                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
