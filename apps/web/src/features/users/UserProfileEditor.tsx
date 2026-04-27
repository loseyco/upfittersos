import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { submitAuditLog } from '../../lib/logging/audit';
import { X, Save, User as UserIcon } from 'lucide-react';

interface UserProfile {
  firstName: string;
  lastName: string;
  phone: string;
}

export function UserProfileEditor({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, isSuperAdmin, tenantId } = useAuthStore();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<UserProfile>({ firstName: '', lastName: '', phone: '' });

  const { data: profile, isLoading } = useQuery({
    queryKey: ['userProfile', user?.uid],
    queryFn: async () => {
      if (!user?.uid) return null;
      const snap = await getDoc(doc(db, 'users', user.uid));
      return snap.exists() ? snap.data() as UserProfile : null;
    },
    enabled: isOpen && !!user?.uid
  });

  useEffect(() => {
    if (profile) setFormData((prev) => ({ ...prev, ...profile }));
  }, [profile]);

  const mutation = useMutation({
    mutationFn: async (newData: UserProfile) => {
      if (!user?.uid) throw new Error('No user authenticated');
      await setDoc(doc(db, 'users', user.uid), newData, { merge: true });
      
      // Rule 14 Telemetry Engine Hit
      await submitAuditLog(isSuperAdmin ? 'GLOBAL' : (tenantId || 'GLOBAL'), {
        userId: user.uid,
        actionType: 'DATA_MUTATION',
        targetEntityId: user.uid,
        details: { action: 'UPDATED_PROFILE', ...newData }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile', user?.uid] });
      onClose();
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity" 
        onClick={onClose} 
      />
      
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl z-[101] flex flex-col transform">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <UserIcon className="w-6 h-6 text-blue-500" />
            </div>
            Profile Details
          </h2>
          {/* Rule 15 Oversized Close Target */}
          <button 
            onClick={onClose} 
            className="w-14 h-14 flex items-center justify-center rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors active:scale-[0.92]"
          >
            <X className="w-8 h-8" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="animate-pulse space-y-6">
               <div className="h-14 bg-zinc-200 dark:bg-zinc-800 rounded-xl w-full"></div>
               <div className="h-14 bg-zinc-200 dark:bg-zinc-800 rounded-xl w-full"></div>
               <div className="h-14 bg-zinc-200 dark:bg-zinc-800 rounded-xl w-full"></div>
            </div>
          ) : (
            <form id="profile-form" onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">First Name</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={e => setFormData(f => ({ ...f, firstName: e.target.value }))}
                  className="w-full h-14 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-xl px-4 text-lg text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all shadow-sm"
                  placeholder="John"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Last Name</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={e => setFormData(f => ({ ...f, lastName: e.target.value }))}
                  className="w-full h-14 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-xl px-4 text-lg text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all shadow-sm"
                  placeholder="Doe"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                  className="w-full h-14 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-xl px-4 text-lg text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all shadow-sm"
                  placeholder="(555) 123-4567"
                />
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <button
            type="submit"
            form="profile-form"
            disabled={mutation.isPending}
            className="w-full h-16 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-lg rounded-2xl flex items-center justify-center gap-3 active:scale-[0.96] transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
          >
            <Save className="w-6 h-6" />
            {mutation.isPending ? 'Syncing...' : 'Save Context'}
          </button>
        </div>
      </div>
    </>
  );
}
