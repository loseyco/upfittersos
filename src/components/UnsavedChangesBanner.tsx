import { AlertCircle, Save } from 'lucide-react';

interface UnsavedChangesBannerProps {
    hasChanges: boolean;
    onSave: () => void;
    onDiscard: () => void;
    isSaving?: boolean;
}

export function UnsavedChangesBanner({ hasChanges, onSave, onDiscard, isSaving = false }: UnsavedChangesBannerProps) {
    if (!hasChanges) return null;

    return (
        <div className="fixed bottom-0 sm:bottom-6 left-0 right-0 sm:left-1/2 sm:-translate-x-1/2 w-full sm:max-w-2xl z-50 p-4 sm:p-0">
            <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row items-center justify-between p-4 gap-4 animate-in slide-in-from-bottom-5 fade-in duration-300">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl shrink-0">
                        <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-white font-bold text-sm tracking-wide">Unsaved Changes</h4>
                        <p className="text-zinc-400 text-xs text-balance">You have modified this profile. Please save your changes.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-end">
                    <button 
                        onClick={onDiscard}
                        disabled={isSaving}
                        className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                    >
                        Discard
                    </button>
                    <button 
                        onClick={onSave}
                        disabled={isSaving}
                        className="px-5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-bold uppercase tracking-widest rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                        <Save className="w-3.5 h-3.5" />
                        {isSaving ? 'Saving...' : 'Save Now'}
                    </button>
                </div>
            </div>
        </div>
    );
}
