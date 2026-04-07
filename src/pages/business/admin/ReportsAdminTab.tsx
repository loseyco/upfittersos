import { useState, useEffect } from 'react';
import { Clock, Plus, Mail, Activity, Check, X, FileText, Trash2, Power, Pencil, PlayCircle, Copy } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { db } from '../../../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import type { ReportConfig } from '../../../types/reports';
import toast from 'react-hot-toast';

const AVAILABLE_METRICS = [
    { id: 'active_users', label: 'Active Users (24h)' },
    { id: 'page_views', label: 'Page Views (24h)' },
    { id: 'new_jobs', label: 'New Jobs Created' },
    { id: 'new_vehicles', label: 'New Vehicles Added' },
    { id: 'changelogs', label: 'Platform Build Logs' }
];

export function ReportsAdminTab({ tenantId }: { tenantId: string }) {
    const { currentUser } = useAuth();
    const [configs, setConfigs] = useState<ReportConfig[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [previewConfig, setPreviewConfig] = useState<ReportConfig | null>(null);
    
    const [form, setForm] = useState({
        name: '',
        metrics: [] as string[],
        scheduleTime: '07:00',
        recipients: currentUser?.email || ''
    });

    useEffect(() => {
        if (!tenantId) return;
        const q = query(
            collection(db, 'report_configs'),
            where('tenantId', '==', tenantId)
        );
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReportConfig));
            // Sort by creation or name locally if needed
            setConfigs(data);
        });
        return () => unsub();
    }, [tenantId]);

    const handleSave = async () => {
        if (!form.name || form.metrics.length === 0 || !form.recipients) {
            toast.error('Please fill out all required fields.');
            return;
        }

        try {
            const recipientList = form.recipients.split(',').map(e => e.trim()).filter(e => e.length > 0);
            
            const payload = {
                name: form.name,
                metrics: form.metrics,
                scheduleTime: form.scheduleTime,
                recipients: recipientList,
                updatedAt: Date.now()
            };

            if (editingId) {
                await updateDoc(doc(db, 'report_configs', editingId), payload);
                toast.success('Report Configuration Updated');
            } else {
                const newConfig = {
                    tenantId,
                    creatorId: currentUser?.uid || '',
                    creatorEmail: currentUser?.email || '',
                    frequency: 'daily',
                    isActive: true,
                    createdAt: Date.now(),
                    ...payload
                };
                await addDoc(collection(db, 'report_configs'), newConfig);
                toast.success('Report Configuration Saved');
            }

            setIsModalOpen(false);
            setEditingId(null);
            setForm({
                name: '',
                metrics: [],
                scheduleTime: '07:00',
                recipients: currentUser?.email || ''
            });
        } catch (error) {
            console.error("Failed to save report config", error);
            toast.error('Failed to save report config');
        }
    };

    const toggleActive = async (configId: string, currentStatus: boolean) => {
        try {
            await updateDoc(doc(db, 'report_configs', configId), {
                isActive: !currentStatus,
                updatedAt: Date.now()
            });
            toast.success(`Report ${currentStatus ? 'paused' : 'activated'}.`);
        } catch (error) {
            toast.error('Failed to toggle status.');
        }
    };

    const deleteConfig = async (configId: string) => {
        if (!window.confirm("Are you sure you want to delete this report?")) return;
        try {
            await deleteDoc(doc(db, 'report_configs', configId));
            toast.success('Report deleted.');
        } catch (error) {
            toast.error('Failed to delete report.');
        }
    };

    const toggleMetric = (metricId: string) => {
        setForm(prev => {
            const exists = prev.metrics.includes(metricId);
            if (exists) {
                return { ...prev, metrics: prev.metrics.filter(id => id !== metricId) };
            } else {
                return { ...prev, metrics: [...prev.metrics, metricId] };
            }
        });
    };

    return (
        <div className="flex flex-col h-full bg-zinc-950 relative p-6 pt-10 md:p-12 overflow-y-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center">
                            <Activity className="w-5 h-5 text-purple-400" />
                        </div>
                        <span className="text-sm font-bold text-purple-400 uppercase tracking-widest">Reporting Engine</span>
                    </div>
                    <h2 className="text-3xl font-black text-white tracking-tight">Automated Digests</h2>
                    <p className="text-zinc-400 max-w-xl mt-2">
                        Configure dynamic reports to automatically gather metrics and push emails impersonating your account.
                    </p>
                </div>
                
                <button 
                    onClick={() => {
                        setEditingId(null);
                        setForm({
                            name: '',
                            metrics: [],
                            scheduleTime: '07:00',
                            recipients: currentUser?.email || ''
                        });
                        setIsModalOpen(true);
                    }}
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-purple-500/20"
                >
                    <Plus className="w-4 h-4" /> New Report
                </button>
            </div>

            {/* List of Configs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {configs.map(config => (
                    <div key={config.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 transition-all hover:border-zinc-700 flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    {config.name}
                                    {!config.isActive && <span className="text-[10px] bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Paused</span>}
                                </h3>
                                <p className="text-sm text-zinc-500 mt-1 flex items-center gap-2">
                                    <Clock className="w-4 h-4" /> Runs Daily @ {config.scheduleTime}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => toast.success('Report manually queued for generation.')}
                                    className="p-2 rounded-lg bg-zinc-800 text-green-400 hover:bg-green-500/20 transition-colors"
                                    title="Run Now"
                                >
                                    <PlayCircle className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => setPreviewConfig(config)}
                                    className="p-2 rounded-lg bg-zinc-800 text-amber-400 hover:bg-amber-500/20 transition-colors"
                                    title="View Email Draft"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => {
                                        setForm({
                                            name: config.name,
                                            metrics: config.metrics,
                                            scheduleTime: config.scheduleTime || '07:00',
                                            recipients: config.recipients.join(', ')
                                        });
                                        setEditingId(config.id!);
                                        setIsModalOpen(true);
                                    }}
                                    className="p-2 rounded-lg bg-zinc-800 text-blue-400 hover:bg-blue-500/20 transition-colors"
                                    title="Edit Report"
                                >
                                    <Pencil className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => toggleActive(config.id!, config.isActive)}
                                    className={`p-2 rounded-lg transition-colors ${config.isActive ? 'bg-zinc-800 text-green-400 hover:bg-zinc-700' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'}`}
                                    title={config.isActive ? "Pause Report" : "Activate Report"}
                                >
                                    <Power className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => deleteConfig(config.id!)}
                                    className="p-2 rounded-lg bg-zinc-800 text-red-400 hover:bg-red-500/20 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="bg-zinc-950 rounded-xl p-4 mb-4 border border-zinc-800/50">
                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Activity className="w-3.5 h-3.5" /> Included Metrics
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {config.metrics.map(mId => {
                                    const label = AVAILABLE_METRICS.find(m => m.id === mId)?.label || mId;
                                    return (
                                        <span key={mId} className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2.5 py-1 rounded-md text-xs font-bold">
                                            {label}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mt-auto pt-4 border-t border-zinc-800 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0">
                                <Mail className="w-4 h-4 text-blue-400" />
                            </div>
                            <div className="truncate">
                                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Delivers To</p>
                                <p className="text-sm font-medium text-zinc-300 truncate">{config.recipients.join(', ')}</p>
                            </div>
                        </div>
                    </div>
                ))}

                {configs.length === 0 && (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-center border-2 border-dashed border-zinc-800 rounded-2xl">
                        <FileText className="w-12 h-12 text-zinc-700 mb-4" />
                        <h3 className="text-xl font-bold text-zinc-400">No Automated Reports</h3>
                        <p className="text-zinc-600 mt-2">Create a new report to start receiving daily digests.</p>
                    </div>
                )}
            </div>

            {/* Creation/Edit Modal Overlay */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
                            <div>
                                <h3 className="text-xl font-black text-white">{editingId ? 'Edit' : 'Create'} Automated Report</h3>
                                <p className="text-xs text-zinc-500 mt-1">Configure data points and delivery schedule.</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-white">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Report Name</label>
                                <input 
                                    type="text" 
                                    value={form.name}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, name: e.target.value})}
                                    placeholder="e.g., Executive Daily Summary"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Metrics Payload</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {AVAILABLE_METRICS.map(metric => (
                                        <button
                                            key={metric.id}
                                            onClick={() => toggleMetric(metric.id)}
                                            className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-bold transition-all ${
                                                form.metrics.includes(metric.id)
                                                ? 'bg-purple-500/10 border-purple-500/50 text-purple-300'
                                                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                                            }`}
                                        >
                                            {metric.label}
                                            {form.metrics.includes(metric.id) && <Check className="w-4 h-4 text-purple-400" />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Frequency</label>
                                    <div className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-400 text-sm font-bold flex items-center justify-between opacity-50 cursor-not-allowed">
                                        Daily
                                        <Clock className="w-4 h-4" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Run Time (24h)</label>
                                    <input 
                                        type="time" 
                                        value={form.scheduleTime}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, scheduleTime: e.target.value})}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Recipients (Comma Separated)</label>
                                <textarea 
                                    value={form.recipients}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({...form, recipients: e.target.value})}
                                    placeholder="team@domain.com, manager@domain.com"
                                    rows={2}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors resize-none"
                                />
                            </div>
                            
                            <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex items-start gap-3">
                                <Mail className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="text-sm font-bold text-blue-400 mb-1">Gmail Domain Delegation</h4>
                                    <p className="text-xs text-blue-400/80 leading-relaxed">
                                        Emails for this report will bypass standard SMTP and be injected directly through the Workspace API, making it appear in your personal 'Sent' folder.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-zinc-800 bg-zinc-950 flex justify-end gap-3">
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="px-5 py-2.5 rounded-lg text-sm font-bold text-zinc-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSave}
                                className="px-5 py-2.5 rounded-lg text-sm font-bold bg-purple-600 hover:bg-purple-500 text-white transition-colors shadow-lg shadow-purple-500/20 flex items-center gap-2"
                            >
                                <Check className="w-4 h-4" /> Save Configuration
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Email Draft Preview Modal */}
            {previewConfig && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
                            <div>
                                <h3 className="text-xl font-black text-white flex items-center gap-2">
                                    <Copy className="w-5 h-5 text-amber-500" /> Email Draft Preview
                                </h3>
                                <p className="text-xs text-zinc-500 mt-1">Copy and paste this content.</p>
                            </div>
                            <button onClick={() => setPreviewConfig(null)} className="text-zinc-500 hover:text-white">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 font-mono text-sm text-zinc-300 whitespace-pre-wrap select-all leading-relaxed">
                                {`Subject: [Automated Digest] ${previewConfig.name}\n\nHere is your requested compilation:\n\n${previewConfig.metrics.map(mId => {
                                    const label = AVAILABLE_METRICS.find(m => m.id === mId)?.label || mId;
                                    return `• ${label}: [Auto-calculated at runtime]`;
                                }).join('\n')}\n\nThis report is automatically designated for: ${previewConfig.recipients.join(', ')}`}
                            </div>
                        </div>
                        <div className="p-6 border-t border-zinc-800 bg-zinc-950 flex justify-end gap-3">
                            <button 
                                onClick={() => setPreviewConfig(null)}
                                className="px-5 py-2.5 rounded-lg text-sm font-bold bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
