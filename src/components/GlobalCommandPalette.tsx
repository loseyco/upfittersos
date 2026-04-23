import React, { useEffect, useState } from 'react';
import { DashboardCommandHub } from './dashboard/DashboardCommandHub';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

// Expose a manual trigger if buttons need it
export const openGlobalSearch = () => window.dispatchEvent(new CustomEvent('open-global-search'));
export const closeGlobalSearch = () => window.dispatchEvent(new CustomEvent('close-global-search'));

export function GlobalCommandPalette() {
    const [isOpen, setIsOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const handlerOpen = () => setIsOpen(true);
        const handlerClose = () => setIsOpen(false);

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                setIsOpen(true);
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        window.addEventListener('open-global-search', handlerOpen);
        window.addEventListener('close-global-search', handlerClose);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('open-global-search', handlerOpen);
            window.removeEventListener('close-global-search', handlerClose);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    if (!isOpen) return null;

    const handleAction = (actionType: string, payload?: string) => {
        setIsOpen(false);
        if (actionType === 'customer') {
            navigate(payload ? `/business/customers?id=${payload}` : '/business/customers');
        } else if (actionType === 'vehicle') {
            navigate(payload ? `/business/vehicles?vin=${payload}` : '/business/vehicles');
        } else if (actionType === 'open_job') {
            navigate(payload ? `/business/jobs?id=${payload}` : '/business/jobs');
        } else if (actionType === 'open_staff') {
            navigate(`/business/admin?tab=staff`); // Simple generic routing
        } else if (actionType === 'scan') {
            window.dispatchEvent(new CustomEvent('open-global-scanner'));
        } else if (actionType === 'estimate') {
            navigate('/business/jobs'); // Usually launches wizard
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-3xl relative">
                <button 
                    onClick={() => setIsOpen(false)}
                    className="absolute -top-12 right-0 p-2 text-zinc-500 hover:text-white transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>
                <div 
                    className="bg-transparent"
                    onClick={(e) => e.stopPropagation()}
                >
                    <DashboardCommandHub 
                        onAction={handleAction as any}
                    />
                </div>
            </div>
            
            {/* Click outside to close (behind the modal container) */}
            <div className="absolute inset-0 z-[-1]" onClick={() => setIsOpen(false)}></div>
        </div>
    );
}
