import { UserProfileForm } from './UserProfileForm';
import { TopNav } from '../../components/layout/TopNav';
import { User as UserIcon, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function UserProfilePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col transition-colors">
      <TopNav />
      <div className="p-8 flex-1 max-w-2xl mx-auto w-full flex flex-col pt-12">
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white mb-6 transition-colors w-fit group"
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-200 dark:bg-zinc-800 group-hover:bg-zinc-300 dark:group-hover:bg-zinc-700 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </div>
          <span className="font-medium">Go Back</span>
        </button>

        <div className="flex items-center gap-4 mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
            <UserIcon className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">Standalone Page Profile</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">This is a massive, dedicated route for user settings.</p>
          </div>
        </div>

        <div className="border border-zinc-200 dark:border-zinc-800 shadow-sm rounded-3xl p-10 bg-white dark:bg-zinc-900 flex-1">
          <UserProfileForm />
        </div>
      </div>
    </div>
  );
}
