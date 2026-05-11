import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { CheckCircle, Clock, ExternalLink } from 'lucide-react';

interface FeedbackReport {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  tenantId: string | null;
  type: 'bug' | 'feature' | 'general';
  description: string;
  imageUrl: string | null;
  route: string;
  status: 'open' | 'resolved';
  createdAt: any;
}

export function FeedbackReports() {
  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'feedback_reports'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: FeedbackReport[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as FeedbackReport);
      });
      setReports(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    try {
      await updateDoc(doc(db, 'feedback_reports', id), {
        status: currentStatus === 'open' ? 'resolved' : 'open',
      });
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  if (loading) {
    return <div className="p-8 text-neutral-400">Loading reports...</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Feedback & Issues</h1>
          <p className="text-neutral-400">Review user feedback, feature requests, and bug reports.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <div key={report.id} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex flex-col">
            {report.imageUrl ? (
              <div className="aspect-video bg-neutral-950 relative group">
                <img src={report.imageUrl} alt="Feedback Screenshot" className="w-full h-full object-cover" />
                <a 
                  href={report.imageUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-2"
                >
                  <ExternalLink size={20} /> View Full
                </a>
              </div>
            ) : (
              <div className="aspect-video bg-neutral-950 flex items-center justify-center text-neutral-600">
                No Screenshot
              </div>
            )}
            
            <div className="p-5 flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                  report.type === 'bug' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                  report.type === 'feature' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                  'bg-green-500/10 text-green-400 border border-green-500/20'
                }`}>
                  {report.type}
                </span>
                <span className="text-xs text-neutral-500">
                  {report.createdAt?.toDate().toLocaleDateString() || 'Just now'}
                </span>
              </div>

              <p className="text-sm text-neutral-300 mb-4 flex-1 whitespace-pre-wrap">
                {report.description}
              </p>

              <div className="mt-auto border-t border-neutral-800 pt-4 flex flex-col gap-2">
                <div className="text-xs text-neutral-500 truncate">
                  <span className="text-neutral-400">User:</span> {report.userEmail || report.userName || 'Anonymous'}
                </div>
                <div className="text-xs text-neutral-500 truncate">
                  <span className="text-neutral-400">Route:</span> {report.route}
                </div>
                {report.tenantId && (
                  <div className="text-xs text-neutral-500 truncate">
                    <span className="text-neutral-400">Tenant:</span> {report.tenantId}
                  </div>
                )}
                
                <button
                  onClick={() => handleToggleStatus(report.id, report.status)}
                  className={`mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                    report.status === 'open' 
                      ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700' 
                      : 'bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20'
                  }`}
                >
                  {report.status === 'open' ? (
                    <><Clock size={16} /> Mark Resolved</>
                  ) : (
                    <><CheckCircle size={16} /> Resolved</>
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}

        {reports.length === 0 && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-neutral-800 rounded-xl">
            <p className="text-neutral-400">No feedback reports found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
