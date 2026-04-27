import { useState, useEffect } from 'react';
import { getApplications, updateApplicationStatus } from '../../../lib/careers';
import type { CareerApplication } from '../../../lib/careers';
import { Briefcase, Loader2, User, Phone, Mail, Link as LinkIcon, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

export function CareerApplicationsTab({ tenantId: _tenantId }: { tenantId: string }) {
    const [applications, setApplications] = useState<CareerApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedApp, setSelectedApp] = useState<CareerApplication | null>(null);

    useEffect(() => {
        fetchApplications();
    }, []);

    const fetchApplications = async () => {
        try {
            setLoading(true);
            const data = await getApplications(_tenantId);
            setApplications(data);
        } catch (error) {
            console.error(error);
            toast.error("Failed to load applications.");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (id: string, newStatus: CareerApplication['status']) => {
        try {
            await updateApplicationStatus(id, newStatus);
            setApplications(applications.map(app => app.id === id ? { ...app, status: newStatus } : app));
            if (selectedApp?.id === id) {
                setSelectedApp({ ...selectedApp, status: newStatus });
            }
            toast.success(`Marked as ${newStatus}`);
        } catch (error) {
            console.error(error);
            toast.error("Status update failed");
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Pending': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
            case 'Reviewed': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            case 'Interviewing': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
            case 'Hired': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
            case 'Rejected': return 'bg-red-500/10 text-red-500 border-red-500/20';
            default: return 'bg-zinc-800 text-zinc-400 border-zinc-700';
        }
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center p-6 text-zinc-500">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="h-full flex px-4 pt-4 md:px-8 md:pt-6">
            {/* List View */}
            <div className={`flex flex-col flex-1 h-full max-w-4xl mx-auto transition-all ${selectedApp ? 'hidden md:flex md:w-1/3 md:max-w-xs md:pr-6' : 'w-full'}`}>
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Job Applications</h2>
                        <p className="text-zinc-500 text-sm">Review career submissions</p>
                    </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl flex-1 overflow-hidden flex flex-col">
                    <div className="overflow-y-auto p-2 space-y-2">
                        {applications.length === 0 ? (
                            <div className="text-center p-8 text-zinc-500">
                                <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                <p className="text-sm">No applications found.</p>
                            </div>
                        ) : (
                            applications.map(app => (
                                <button
                                    key={app.id}
                                    onClick={() => setSelectedApp(app)}
                                    className={`w-full text-left p-4 rounded-xl border transition-all ${selectedApp?.id === app.id ? 'bg-zinc-800 border-accent/40' : 'bg-zinc-950/50 border-zinc-800 hover:border-zinc-700'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-white text-sm">{app.personalInfo.firstName} {app.personalInfo.lastName}</h3>
                                        <span className={`text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded border ${getStatusColor(app.status)}`}>
                                            {app.status}
                                        </span>
                                    </div>
                                    <p className="text-zinc-400 text-xs mb-1 truncate">{app.position}</p>
                                    <p className="text-zinc-500 text-[10px] truncate">{app.submittedAt?.toDate() ? new Date(app.submittedAt.toDate()).toLocaleDateString() : 'Unknown Date'}</p>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Detail View */}
            <div className={`flex-1 h-full pb-6 overflow-y-auto ${!selectedApp ? 'hidden md:flex' : 'flex'}`}>
                {selectedApp ? (
                    <div className="w-full bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden flex flex-col">
                        
                        {/* Header Banner */}
                        <div className="bg-zinc-900 border-b border-zinc-800 p-6 md:p-8 flex flex-col md:flex-row gap-6 justify-between items-start">
                            <div>
                                <div className="flex gap-2 items-center mb-2">
                                    <h2 className="text-3xl font-black text-white">{selectedApp.personalInfo.firstName} {selectedApp.personalInfo.lastName}</h2>
                                    <span className={`text-[10px] uppercase font-bold tracking-widest px-2 py-1 rounded border ${getStatusColor(selectedApp.status)}`}>
                                        {selectedApp.status}
                                    </span>
                                </div>
                                <p className="text-indigo-400 font-bold mb-4">{selectedApp.position}</p>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm text-zinc-400">
                                    <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-zinc-500" /> <a href={`mailto:${selectedApp.personalInfo.email}`} className="hover:text-white transition">{selectedApp.personalInfo.email}</a></div>
                                    <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-zinc-500" /> {selectedApp.personalInfo.phone || 'N/A'}</div>
                                    <div className="flex items-center gap-2"><LinkIcon className="w-4 h-4 text-zinc-500" /> {selectedApp.websiteUrls ? <a href={selectedApp.websiteUrls.startsWith('http') ? selectedApp.websiteUrls : `https://${selectedApp.websiteUrls}`} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300">Links Attached</a> : 'No links'}</div>
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-2 w-full md:w-auto shrink-0 bg-zinc-950 p-4 rounded-xl border border-zinc-800/80">
                                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1 text-center">Change Status</span>
                                <div className="flex flex-wrap gap-2 justify-center">
                                    {['Pending', 'Reviewed', 'Interviewing'].map((s) => (
                                        <button key={s} onClick={() => handleUpdateStatus(selectedApp.id!, s as any)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${selectedApp.status === s ? 'bg-zinc-800 text-white border-zinc-700' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2 justify-center pt-2">
                                    <button onClick={() => handleUpdateStatus(selectedApp.id!, 'Hired')} className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold border bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20 transition">Hire</button>
                                    <button onClick={() => handleUpdateStatus(selectedApp.id!, 'Rejected')} className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold border bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20 transition">Reject</button>
                                </div>
                                <button onClick={() => setSelectedApp(null)} className="md:hidden mt-2 text-xs text-zinc-500 hover:text-white py-1">Close Detail View</button>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
                            
                            {/* Summary / Cover Letter */}
                            <section>
                                <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2"><FileText className="w-4 h-4" /> Cover Letter & Summary</h3>
                                <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed">
                                    {selectedApp.coverLetter || <span className="text-zinc-600 italic">No summary provided.</span>}
                                </div>
                            </section>

                            <hr className="border-zinc-800/80" />

                            {/* Experience */}
                            <section>
                                <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Briefcase className="w-4 h-4" /> Professional Experience</h3>
                                {selectedApp.experience?.length ? (
                                    <div className="space-y-4">
                                        {selectedApp.experience.map((exp, i) => (
                                            <div key={i} className="flex gap-4">
                                                <div className="flex flex-col items-center">
                                                    <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5"></div>
                                                    {i !== selectedApp.experience.length - 1 && <div className="w-0.5 h-full bg-zinc-800 mt-2"></div>}
                                                </div>
                                                <div className="pb-4 border-b border-zinc-800/50 w-full last:border-0 last:pb-0">
                                                    <h4 className="text-white font-bold">{exp.title}</h4>
                                                    <div className="text-xs font-bold text-indigo-400 mb-2">{exp.company} <span className="text-zinc-600 font-normal ml-2">{exp.startDate} - {exp.endDate}</span></div>
                                                    <p className="text-zinc-400 text-sm leading-relaxed">{exp.description}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-zinc-600 italic text-sm">No experience listed.</p>
                                )}
                            </section>

                            <hr className="border-zinc-800/80" />

                            {/* References */}
                            <section>
                                <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2"><User className="w-4 h-4" /> References</h3>
                                {selectedApp.references?.length ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {selectedApp.references.map((ref, i) => (
                                            <div key={i} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                                                <h4 className="text-white font-bold text-sm mb-1">{ref.name}</h4>
                                                <p className="text-zinc-500 text-xs mb-3">{ref.relationship}</p>
                                                <div className="space-y-1">
                                                    {ref.phone && <div className="flex items-center gap-2 text-xs text-zinc-400"><Phone className="w-3 h-3 text-zinc-600" /> {ref.phone}</div>}
                                                    {ref.email && <div className="flex items-center gap-2 text-xs text-zinc-400"><Mail className="w-3 h-3 text-zinc-600" /> {ref.email}</div>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-zinc-600 italic text-sm">No references listed.</p>
                                )}
                            </section>

                            {selectedApp.personalInfo.address && (
                                <>
                                    <hr className="border-zinc-800/80" />
                                    <section>
                                        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-2">Location</h3>
                                        <p className="text-zinc-400 text-sm">{selectedApp.personalInfo.address}</p>
                                    </section>
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-zinc-900 border border-zinc-800 rounded-3xl opacity-50">
                        <Briefcase className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-zinc-400">Select an Application</h2>
                        <p className="text-zinc-500 max-w-sm mt-2">Click on an application from the list to review their experience, cover letter, and references.</p>
                    </div>
                )}
            </div>

        </div>
    );
}
