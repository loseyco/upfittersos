import { UserProfileForm } from './UserProfileForm';
import { X, User as UserIcon } from 'lucide-react';

export function UserProfileSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
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
            Slide-over Sheet Profile
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
          <UserProfileForm onComplete={onClose} />
        </div>
      </div>
    </>
  );
}
