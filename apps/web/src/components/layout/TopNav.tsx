import { signOut } from 'firebase/auth';
import { useState } from 'react';
import { auth, db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { submitAuditLog } from '../../lib/logging/audit';
import { LogOut, User as UserIcon, Sun, Moon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '../../lib/theme/store';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfileSheet } from '../../features/users/UserProfileSheet';
import { useLocationStore } from '../../lib/store/locationStore';
import { GlobalLocationTracker } from '../telemetry/GlobalLocationTracker';
import { MapPin } from 'lucide-react';

export function TopNav() {
  const { user, isSuperAdmin, tenantId } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const { isSharing, stopSharing } = useLocationStore();
  const navigate = useNavigate();
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Rule 16: Fetch Business metadata natively via cached query
  const { data: business } = useQuery({
    queryKey: ['business', tenantId],
    queryFn: async () => {
      if (!tenantId || tenantId === 'GLOBAL') return null;
      const snap = await getDoc(doc(db, 'businesses', tenantId as string));
      return snap.exists() ? { id: snap.id, ...snap.data() } as { id: string; name: string } : null;
    },
    enabled: !!tenantId && tenantId !== 'GLOBAL'
  });

  const handleLogout = async () => {
    if (user) {
      submitAuditLog(isSuperAdmin ? 'GLOBAL' : (tenantId || 'GLOBAL'), {
        userId: user.uid,
        actionType: 'LOGOUT',
      });
    }
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center justify-between px-6 sticky top-0 z-50 transition-colors">
      <div className="flex items-center gap-4">
        <img src="/favicon.png" alt="UpFittersOS Icon" className="w-8 h-8 rounded-lg" />
        <span className="text-zinc-900 dark:text-white font-medium tracking-tight">UpFittersOS</span>
        {isSuperAdmin && <span className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-md border border-blue-500/20 font-medium whitespace-nowrap">Super Admin</span>}
        {tenantId && tenantId !== 'GLOBAL' && business && (
          <span className="px-2 py-1 bg-indigo-500/10 text-indigo-400 text-xs rounded-md border border-indigo-500/20 font-medium whitespace-nowrap">
            {business.name}
          </span>
        )}
      </div>

      <div className="flex items-center gap-6">
        {isSharing && (
          <button 
            onClick={stopSharing} 
            className="flex items-center gap-2 bg-rose-500/10 text-rose-500 active:bg-rose-500 active:text-white px-3 h-8 sm:h-10 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all ring-1 ring-rose-500/30 mr-2"
            title="Stop sharing location"
          >
            <span className="relative flex h-2 w-2 sm:h-2.5 sm:w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 sm:h-2.5 sm:w-2.5 bg-rose-500"></span>
            </span>
            Stop Sharing
          </button>
        )}

        <button
          onClick={toggleTheme}
          className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-all active:scale-[0.95]"
          title="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5 sm:w-6 sm:h-6" /> : <Moon className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>
        <button
          onClick={() => setIsProfileOpen(true)}
          className="flex items-center justify-center gap-3 h-10 sm:h-12 px-2 sm:px-4 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-all active:scale-[0.95]"
        >
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-zinc-200 dark:bg-zinc-900 flex items-center justify-center border border-zinc-300 dark:border-zinc-700 shadow-sm">
            <UserIcon className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-600 dark:text-zinc-300" />
          </div>
          <span className="hidden sm:block font-medium text-zinc-900 dark:text-zinc-100">{user?.email}</span>
        </button>
        <button 
          onClick={handleLogout}
          className="flex items-center justify-center gap-2 h-10 sm:h-12 px-3 sm:px-4 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-xl transition-all active:scale-[0.95] border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 text-sm font-medium"
        >
          <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="hidden sm:inline">Switch Account</span>
        </button>
      </div>

      <UserProfileSheet isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <GlobalLocationTracker />
    </div>
  );
}
