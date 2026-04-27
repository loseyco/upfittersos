import { useAuthStore } from '../../lib/auth/store';
import { TopNav } from '../../components/layout/TopNav';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Building2, AppWindow, LayoutTemplate } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserProfileModal } from '../users/UserProfileModal';
import { usePageTitle } from '../../lib/hooks/usePageTitle';

export function TenantDashboard() {
  usePageTitle('Dashboard');
  const { user, tenantId } = useAuthStore();
  const navigate = useNavigate();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  
  const { data: business, isLoading } = useQuery({
    queryKey: ['business', tenantId],
    queryFn: async () => {
      if (!tenantId || tenantId === 'GLOBAL') return null;
      const snap = await getDoc(doc(db, 'businesses', tenantId));
      return snap.exists() ? { id: snap.id, ...snap.data() } as { id: string; name: string } : null;
    },
    enabled: !!tenantId && tenantId !== 'GLOBAL'
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col transition-colors">
      <TopNav />
      <div className="p-8 flex-1 max-w-6xl mx-auto w-full">
        {isLoading ? (
          <div className="flex animate-pulse items-center gap-4 mb-8">
            <div className="w-14 h-14 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
            <div className="h-8 w-64 bg-zinc-200 dark:bg-zinc-800 rounded-lg"></div>
          </div>
        ) : (
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl flex items-center justify-center shadow-sm">
              <Building2 className="w-7 h-7 text-indigo-500" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">{business?.name || 'Unknown Shop'}</h1>
              <p className="text-zinc-500 dark:text-zinc-400 mt-1">Tenant OS</p>
            </div>
          </div>
        )}

        <div className="mt-8 border border-zinc-200 dark:border-zinc-800 shadow-sm rounded-xl p-8 bg-white dark:bg-zinc-900">
          <p className="text-zinc-600 dark:text-zinc-400">
            Shop operations and modular tools go here.
            <br />
            Authenticated as <strong className="text-zinc-900 dark:text-zinc-200">{user?.email}</strong>
          </p>

          {/* User Profile Component Testing Ground */}
          <div className="mt-8 pt-8 border-t border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">UI Architecture Tests</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              The `UserProfileForm` has been abstracted into a headless component. It can be dynamically rendered inside any presentation wrapper (Sheet, Modal, Page) while maintaining identical global TanStack Query cache synchronization.
              <br /><br />
              <strong>Test Sheet:</strong> Click your user icon in the top right navigation.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                 onClick={() => setIsProfileModalOpen(true)}
                 className="h-14 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl flex items-center justify-center gap-2 active:scale-[0.95] transition-all shadow-lg shadow-indigo-600/20"
              >
                <AppWindow className="w-5 h-5" />
                Test Centered Modal
              </button>
              <button
                 onClick={() => navigate(`/business/${tenantId}/profile`)}
                 className="h-14 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl flex items-center justify-center gap-2 active:scale-[0.95] transition-all shadow-lg shadow-emerald-600/20"
              >
                <LayoutTemplate className="w-5 h-5" />
                Test Standalone Page
              </button>
            </div>
          </div>
        </div>

        <UserProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
      </div>
    </div>
  );
}
