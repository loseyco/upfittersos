import { UserProfileForm } from './UserProfileForm';
import { X, User as UserIcon } from 'lucide-react';

export function UserProfileModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl z-[101] flex flex-col overflow-hidden transform">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <UserIcon className="w-6 h-6 text-indigo-500" />
            </div>
            Centered Modal Profile
          </h2>
          <button 
            onClick={onClose} 
            className="w-12 h-12 flex items-center justify-center rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 transition-colors active:scale-[0.92]"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto max-h-[80vh] flex-1">
          <UserProfileForm onComplete={onClose} />
        </div>
      </div>
    </div>
  );
}
