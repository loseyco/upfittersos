import { useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { db } from '../../../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { FileText, Calculator, Plus, Search, Truck, ArrowRight, User } from 'lucide-react';

export function EstimateHub() {
    const { tenantId } = useAuth();
    const navigate = useNavigate();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [estimates, setEstimates] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [customers, setCustomers] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    useEffect(() => {
        if (!tenantId) return;

        setLoading(true);

        const unsubJobs = onSnapshot(query(collection(db, 'jobs'), where('tenantId', '==', tenantId)), (s) => {
            const fetched = s.docs.map(d => ({ id: d.id, ...d.data() }));
            fetched.sort((a: any, b: any) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?._seconds ? a.createdAt._seconds * 1000 : 0);
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?._seconds ? b.createdAt._seconds * 1000 : 0);
                return timeB - timeA;
            });
            setEstimates(fetched);
            setLoading(false);
        });

        const unsubCustomers = onSnapshot(query(collection(db, 'customers'), where('tenantId', '==', tenantId)), (s) => {
            setCustomers(s.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('tenantId', '==', tenantId)), (s) => {
            setVehicles(s.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubJobs();
            unsubCustomers();
            unsubVehicles();
        };
    }, [tenantId]);

    const getCustomerName = (cId: string) => {
        const c = customers.find(x => x.id === cId);
        if (!c) return 'Unknown Customer';
        return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || 'Unknown Customer';
    };

    const getVehicleName = (vId: string) => {
        const v = vehicles.find(x => x.id === vId);
        if (!v) return 'No Vehicle';
        return `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() || 'Unknown Vehicle';
    };

    const calculateGrandTotal = (job: any) => {
        const parts = job.parts?.reduce((acc: any, part: any) => acc + (Number(part.price) * Number(part.quantity)), 0) || 0;
        const tasksParts = job.tasks?.reduce((tAcc: any, task: any) => {
             return tAcc + (task.parts || []).reduce((pAcc: any, part: any) => pAcc + (Number(part.price) * Number(part.quantity)), 0);
        }, 0) || 0;
        const labor = job.laborLines?.reduce((acc: any, line: any) => acc + (Number(line.rate) * Number(line.hours)), 0) || 0;
        const tasksLabor = job.tasks?.reduce((tAcc: any, task: any) => {
             return tAcc + (Number(task.bookTime) * Number(task.laborRate || 0));
        }, 0) || 0;
        const customer = customers.find(c => c.id === job.customerId);
        const txRateStr = customer?.taxRate;
        const txRateDecimal = (txRateStr !== undefined && txRateStr !== '') ? (Number(txRateStr) / 100) : 0.0825;
        
        return (parts + tasksParts + labor + tasksLabor) * (1 + txRateDecimal);
    };

    const filteredEstimates = estimates.filter(e => {
        const isArchived = e.status === 'Archived' || e.status === 'archived';
        
        if (statusFilter === 'All') {
            // Show all when searching, but visually segregate later
        } else if (statusFilter === 'Archived') {
            if (!isArchived) return false;
        } else {
            if (statusFilter === 'Estimate') {
                if (!['Estimate', 'Draft', 'Pending Approval'].includes(e.status)) return false;
            } else if (e.status !== statusFilter) {
                return false;
            }
        }
        
        return (e.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
               getCustomerName(e.customerId).toLowerCase().includes(searchQuery.toLowerCase()) ||
               getVehicleName(e.vehicleId).toLowerCase().includes(searchQuery.toLowerCase()) ||
               e.id.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const displayActive = filteredEstimates.filter(e => !['Archived', 'archived', 'Declined', 'declined'].includes(e.status));
    const displayArchived = filteredEstimates.filter(e => ['Archived', 'archived', 'Declined', 'declined'].includes(e.status));

    return (
        <div className="min-h-screen bg-zinc-950 p-4 md:p-8 flex flex-col relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="max-w-6xl mx-auto w-full relative z-10 flex-1">
                <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-white flex items-center gap-3">
                            <Calculator className="w-8 h-8 text-indigo-400" />
                            Job Manager
                        </h1>
                        <p className="text-zinc-400 font-medium tracking-wide mt-1">Manage draft quotes and build new jobs natively.</p>
                    </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col min-h-[500px]">
                    <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                        <div className="relative max-w-sm w-full">
                            <Search className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
                            <input 
                                type="text"
                                placeholder="Search jobs..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                        </div>
                        
                        <div className="flex bg-zinc-950 border border-zinc-800 p-1 rounded-xl overflow-x-auto custom-scrollbar">
                            {['All', 'Estimate', 'Approved', 'In Progress', 'Ready for QC', 'Ready for Delivery', 'Delivered', 'Declined', 'Archived'].map(status => {
                                const count = status === 'All' 
                                    ? estimates.filter(e => !['Archived', 'archived', 'Declined', 'declined'].includes(e.status)).length 
                                    : (status === 'Archived' 
                                        ? estimates.filter(e => ['Archived', 'archived'].includes(e.status)).length 
                                        : (status === 'Declined'
                                            ? estimates.filter(e => ['Declined', 'declined'].includes(e.status)).length
                                            : (status === 'Estimate'
                                                ? estimates.filter(e => ['Estimate', 'Draft', 'Pending Approval'].includes(e.status)).length
                                                : estimates.filter(e => e.status === status).length)));
                                
                                return (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`px-4 py-2 text-xs font-bold font-mono uppercase tracking-widest rounded-lg transition-colors shrink-0 flex items-center gap-2 ${statusFilter === status ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
                                >
                                    {status}
                                    <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${statusFilter === status ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-500'}`}>{count}</span>
                                </button>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => navigate('/business/jobs/new')}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all font-mono tracking-widest uppercase text-xs ml-auto"
                        >
                            <Plus className="w-4 h-4"/> New Job
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex-1 flex items-center justify-center text-zinc-500 font-bold animate-pulse">Loading Jobs...</div>
                    ) : (displayActive.length === 0 && displayArchived.length === 0) ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-zinc-800 rounded-2xl">
                            <FileText className="w-12 h-12 text-zinc-700 mb-4" />
                            <h3 className="text-lg font-bold text-white mb-2">No active jobs found</h3>
                            <p className="text-zinc-500 text-sm max-w-sm mb-6">Create a new job to define the scope, parts, and labor for an upcoming project.</p>
                            <button
                                onClick={() => navigate('/business/jobs/new')}
                                className="bg-white hover:bg-zinc-200 text-black font-bold px-6 py-3 rounded-xl transition-colors font-mono tracking-widest uppercase text-xs shadow-xl"
                            >
                                Build New Job
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-12">
                            {displayActive.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {displayActive.map(job => (
                                        <div 
                                            key={job.id} 
                                            onClick={() => navigate(`/business/jobs/${job.id}`)}
                                            className="bg-zinc-950 border border-zinc-800 hover:border-indigo-500/50 rounded-2xl p-5 cursor-pointer group transition-all hover:shadow-2xl hover:shadow-indigo-500/10 flex flex-col"
                                        >
                                            <div className="flex justify-between items-start mb-4">
                                                <div className={`font-bold text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-md border ${
                                                    job.status === 'Estimate' 
                                                        ? 'bg-zinc-800 text-zinc-300 border-zinc-700' 
                                                        : job.status === 'Approved'
                                                        ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                                        : job.status === 'In Progress'
                                                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                                        : job.status === 'Completed' || job.status === 'Delivered'
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                                }`}>
                                                    {job.status === 'Estimate' ? 'DRAFT' : job.status}
                                                </div>
                                                <span className="text-zinc-500 font-mono text-xs">#{job.id.substring(0,6).toUpperCase()}</span>
                                            </div>
                                            <h3 className="text-lg font-black text-white mb-1 group-hover:text-indigo-400 transition-colors line-clamp-1">{job.title || 'Untitled'}</h3>
                                            <p className="text-zinc-500 text-xs mb-4 line-clamp-2 min-h-[32px]">{job.description || 'No description provided.'}</p>
                                            
                                            <div className="flex-1 space-y-2 mb-4">
                                                <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium bg-zinc-900 px-3 py-2 rounded-lg">
                                                    <User className="w-3.5 h-3.5 text-zinc-500" />
                                                    <span className="truncate">{getCustomerName(job.customerId)}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium bg-zinc-900 px-3 py-2 rounded-lg">
                                                    <Truck className="w-3.5 h-3.5 text-zinc-500" />
                                                    <span className="truncate">{getVehicleName(job.vehicleId)}</span>
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-end border-t border-zinc-800/50 pt-4 mt-auto">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Est. Build Cost</span>
                                                    <span className="text-white font-mono font-black">${calculateGrandTotal(job).toFixed(2)}</span>
                                                </div>
                                                <div className="text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center text-xs font-bold uppercase tracking-widest">
                                                    Open <ArrowRight className="w-3.5 h-3.5 ml-1" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {displayArchived.length > 0 && (statusFilter === 'All' || statusFilter === 'Archived' || statusFilter === 'Declined') && (
                                <div className="space-y-4">
                                    {statusFilter === 'All' && (
                                        <div className="flex items-center gap-4">
                                            <div className="flex-1 h-px bg-zinc-800"></div>
                                            <h3 className="text-zinc-500 font-bold font-mono text-sm tracking-widest uppercase">Archived & Declined</h3>
                                            <div className="flex-1 h-px bg-zinc-800"></div>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-75">
                                        {displayArchived.map(job => (
                                            <div 
                                                key={job.id} 
                                                onClick={() => navigate(`/business/jobs/${job.id}`)}
                                                className="bg-zinc-950/50 border border-zinc-800/50 hover:border-indigo-500/50 rounded-2xl p-5 cursor-pointer group transition-all hover:shadow-2xl hover:shadow-indigo-500/10 flex flex-col"
                                            >
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className={`font-bold text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-md border bg-zinc-900/50 ${job.status === 'Declined' || job.status === 'declined' ? 'text-red-400 border-red-500/20' : 'text-zinc-500 border-zinc-800'}`}>
                                                        {job.status === 'Declined' || job.status === 'declined' ? 'DECLINED' : 'ARCHIVED'}
                                                    </div>
                                                    <span className="text-zinc-500/50 font-mono text-xs">#{job.id.substring(0,6).toUpperCase()}</span>
                                                </div>
                                                <h3 className="text-lg font-black text-white mb-1 group-hover:text-indigo-400 transition-colors line-clamp-1">{job.title || 'Untitled'}</h3>
                                                <p className="text-zinc-500 text-xs mb-4 line-clamp-2 min-h-[32px]">{job.description || 'No description provided.'}</p>
                                                
                                                {job.revivedToJobId && (
                                                    <div className="mb-4 bg-indigo-500/10 border border-indigo-500/20 rounded-lg py-2 px-3 flex items-center gap-2">
                                                        <ArrowRight className="w-4 h-4 text-indigo-400" />
                                                        <div>
                                                            <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest leading-none">Revived As</div>
                                                            <div className="text-xs text-white font-mono mt-0.5">#{job.revivedToJobId.substring(0, 6).toUpperCase()}</div>
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                <div className="flex-1 space-y-2 mb-4">
                                                    <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium bg-zinc-900/50 px-3 py-2 rounded-lg border border-zinc-800/50">
                                                        <User className="w-3.5 h-3.5 text-zinc-600" />
                                                        <span className="truncate">{getCustomerName(job.customerId)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium bg-zinc-900/50 px-3 py-2 rounded-lg border border-zinc-800/50">
                                                        <Truck className="w-3.5 h-3.5 text-zinc-600" />
                                                        <span className="truncate">{getVehicleName(job.vehicleId)}</span>
                                                    </div>
                                                </div>

                                                <div className="flex justify-between items-end border-t border-zinc-800/30 pt-4 mt-auto">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Est. Build Cost</span>
                                                        <span className="text-zinc-400 font-mono font-black">${calculateGrandTotal(job).toFixed(2)}</span>
                                                    </div>
                                                    <div className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center text-xs font-bold uppercase tracking-widest">
                                                        Open <ArrowRight className="w-3.5 h-3.5 ml-1" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
