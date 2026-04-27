import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { submitAuditLog } from '../../lib/logging/audit';
import { useAuthStore } from '../../lib/auth/store';
import { TopNav } from '../../components/layout/TopNav';
import { Plus, Building2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '../../lib/hooks/usePageTitle';

interface Business {
  id: string;
  name: string;
  createdAt: any;
}

export function BusinessManager() {
  usePageTitle('Platform Administration');
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newBusinessName, setNewBusinessName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const { data: businesses, isLoading } = useQuery({
    queryKey: ['businesses'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'businesses'));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Business));
    }
  });

  const handleAddBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBusinessName.trim() || !user) return;
    setIsAdding(true);
    try {
      const docRef = await addDoc(collection(db, 'businesses'), {
        name: newBusinessName,
        createdAt: serverTimestamp(),
      });
      
      // Rule 14 Telemetry
      await submitAuditLog('GLOBAL', {
        userId: user.uid,
        actionType: 'DATA_MUTATION',
        targetEntityId: docRef.id,
        details: { action: 'CREATED_BUSINESS', businessName: newBusinessName }
      });
      
      setNewBusinessName('');
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
    } catch (err) {
      console.error('Failed to create business:', err);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col transition-colors">
      <TopNav />
      <div className="p-8 flex-1 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">Businesses</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">Manage global tenant instances.</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Create Business Form */}
          <div className="lg:col-span-1 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 bg-white dark:bg-zinc-900 h-fit shadow-sm">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-500" />
              New Tenant
            </h2>
            <form onSubmit={handleAddBusiness} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Business Name</label>
                <input
                  type="text"
                  value={newBusinessName}
                  onChange={(e) => setNewBusinessName(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all dark:text-white"
                  placeholder="e.g. SAE Customs"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isAdding}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {isAdding ? 'Provisioning...' : 'Provision Business'}
              </button>
            </form>
          </div>

          {/* Business List */}
          <div className="lg:col-span-3">
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
              {isLoading ? (
                <div className="p-8 text-center text-zinc-500">Loading tenants...</div>
              ) : businesses?.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center">
                  <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
                    <Building2 className="w-8 h-8 text-blue-500" />
                  </div>
                  <h3 className="text-lg font-medium text-zinc-900 dark:text-white">No active tenants</h3>
                  <p className="text-zinc-500 dark:text-zinc-400 mt-2">Provision your first business entity to begin.</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {businesses?.map((b) => (
                    <div key={b.id} className="p-6 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center shadow-sm">
                          <Building2 className="w-6 h-6 text-indigo-500" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-lg">{b.name}</h4>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/business/${b.id}`)}
                          className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-medium rounded-lg transition-colors border border-zinc-200 dark:border-zinc-700"
                        >
                          Access OS
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
