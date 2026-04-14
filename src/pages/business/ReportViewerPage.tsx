import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { BarChart3, ArrowLeft, Loader2, Calendar, FileText, LayoutDashboard, Copy } from 'lucide-react';
import type { GeneratedReport } from '../../types/reports';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

export function ReportViewerPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { tenantId } = useAuth();
    
    const [report, setReport] = useState<GeneratedReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchReport = async () => {
            if (!id) return;
            try {
                const snap = await getDoc(doc(db, 'generated_reports', id));
                if (!snap.exists()) {
                    setError('Report not found or has been deleted.');
                    setLoading(false);
                    return;
                }
                
                const data = { id: snap.id, ...snap.data() } as GeneratedReport;
                // Enforce tenant scoping unless system_owner
                if (data.tenantId !== tenantId && tenantId !== 'GLOBAL') {
                    setError('Unauthorized cross-tenant access attempt.');
                    setLoading(false);
                    return;
                }

                setReport(data);
                setLoading(false);
            } catch (err) {
                console.error("Failed to fetch report:", err);
                setError('Failed to load report data.');
                setLoading(false);
            }
        };

        fetchReport();
    }, [id, tenantId]);

    const handleCopyHtml = async () => {
        if (!report) return;
        try {
            const blob = new Blob([report.summary], { type: 'text/html' });
            const clipboardItem = new window.ClipboardItem({ 'text/html': blob });
            await navigator.clipboard.write([clipboardItem]);
            toast.success('Report HTML copied to clipboard! You can paste this directly into Gmail.');
        } catch (err) {
            console.error('Copy failed:', err);
            toast.error('Failed to copy rich text. Your browser may not support ClipboardItem.');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 text-purple-500 animate-spin mb-4" />
                <p className="text-zinc-500 text-sm font-bold uppercase tracking-widest">Decrypting Report payload...</p>
            </div>
        );
    }

    if (error || !report) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
                <FileText className="w-16 h-16 text-zinc-800 mb-6" />
                <h2 className="text-2xl font-black text-white tracking-tight mb-2">Access Denied</h2>
                <p className="text-zinc-500 max-w-md">{error}</p>
                <button onClick={() => navigate('/dashboard')} className="mt-8 text-purple-400 hover:text-white transition-colors flex items-center gap-2 font-bold">
                    <ArrowLeft className="w-4 h-4" /> Return to Hub
                </button>
            </div>
        );
    }

    // Format the date
    const runDate = new Date(report.runAt).toLocaleString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center pt-8 md:pt-16 px-4 pb-20 overflow-y-auto">
            {/* Nav */}
            <div className="w-full max-w-4xl flex justify-between items-center mb-8">
                <button onClick={() => navigate(-1)} className="text-zinc-500 hover:text-white font-bold text-sm bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-xl flex items-center gap-2 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <div className="flex items-center gap-2 text-zinc-500 text-sm font-bold bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-xl">
                    <LayoutDashboard className="w-4 h-4" /> Upfitters OS
                </div>
            </div>

            {/* Content Container */}
            <div className="w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden shadow-purple-500/10">
                {/* Header */}
                <div className="p-8 md:p-12 border-b border-zinc-800 bg-zinc-950/50 flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex items-center justify-center">
                            <BarChart3 className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-purple-500 uppercase tracking-widest mb-1">Automated Digest</p>
                            <h1 className="text-3xl font-black text-white tracking-tight">System Report</h1>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2 text-zinc-400 text-sm font-medium mt-4 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                        <Calendar className="w-4 h-4 text-zinc-500" />
                        Generated on {runDate}
                    </div>
                </div>

                {/* Summary / Body */}
                <div className="p-8 md:p-12 prose prose-invert max-w-none relative">
                    <button 
                        onClick={handleCopyHtml}
                        className="absolute top-4 right-4 md:top-8 md:right-8 bg-zinc-800 hover:bg-purple-500 text-zinc-300 hover:text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors border border-zinc-700 shadow-md"
                    >
                        <Copy className="w-3.5 h-3.5" /> Copy Email Template
                    </button>
                    <div 
                        className="text-zinc-300 leading-relaxed font-medium mt-8 md:mt-2"
                        dangerouslySetInnerHTML={{ __html: report.summary }}
                    />
                </div>

                {/* Raw metrics payload for debugging or deep inspection if needed */}
                <div className="p-8 md:p-12 border-t border-zinc-800 bg-zinc-950">
                    <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Raw Metric Payload</h3>
                    <pre className="bg-black border border-zinc-800 p-4 rounded-xl text-xs text-zinc-400 overflow-x-auto font-mono">
                        {JSON.stringify(report.data, null, 2)}
                    </pre>
                </div>
            </div>
        </div>
    );
}
