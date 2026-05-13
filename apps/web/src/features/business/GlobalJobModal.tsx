import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { JobDetailsModal } from './JobDetailsModal';

export function GlobalJobModal({ tenantId }: { tenantId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const jobId = searchParams.get('jobId');
  const [job, setJob] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (jobId && tenantId) {
      const fetchJob = async () => {
        setIsLoading(true);
        try {
          const snap = await getDoc(doc(db, `businesses/${tenantId}/jobs`, jobId));
          if (snap.exists()) {
            setJob({ id: snap.id, ...snap.data() });
          } else {
            setJob(null);
          }
        } catch (err) {
          console.error('Error fetching global job modal:', err);
          setJob(null);
        } finally {
          setIsLoading(false);
        }
      };
      fetchJob();
    } else {
      setJob(null);
    }
  }, [jobId, tenantId]);

  if (!jobId) return null;

  const handleClose = () => {
    searchParams.delete('jobId');
    setSearchParams(searchParams);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!job) return null;

  return (
    <JobDetailsModal
      tenantId={tenantId}
      job={job}
      onClose={handleClose}
      onUpdate={() => {
        // We don't need to do anything specific here, as the background list
        // will update automatically via Firestore onSnapshot
      }}
    />
  );
}
