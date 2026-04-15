import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface WorkspaceModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
    headerBadge?: React.ReactNode;
    children: React.ReactNode;
}

export function WorkspaceModal({ isOpen, onClose, title, subtitle, headerBadge, children }: WorkspaceModalProps) {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    return (
        <div 
            className={`fixed inset-0 z-50 transition-all duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none delay-150'}`}
        >
            {/* Backdrop Filter */}
            <div 
                onClick={onClose}
                className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm transition-opacity"
            ></div>

            {/* Modal Container: 
                - Mobile: Bottom Sheet snapping to bottom (max-h 90vh)
                - Desktop (md+): Centered Lightbox, max-w-5xl, max-h 90vh
            */}
            <div className={`absolute bottom-0 md:top-1/2 md:-translate-y-1/2 md:bottom-auto inset-x-0 mx-auto w-full md:max-w-5xl md:max-h-[90vh] md:rounded-3xl h-[85vh] md:h-auto bg-zinc-900 border-t md:border border-zinc-800 rounded-t-3xl shadow-[0_0_100px_rgba(0,0,0,0.8)] transform transition-transform duration-500 cubic-bezier(0.32,0.72,0,1) flex flex-col overflow-hidden ${isOpen ? 'translate-y-0 md:scale-100' : 'translate-y-full md:scale-95'}`}>
                
                {/* Header Segment */}
                <div className="flex justify-between items-center px-5 py-4 border-b border-zinc-800/50 bg-zinc-950/30 backdrop-blur-md shrink-0">
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-3">
                            {headerBadge}
                            {(title || subtitle) && (
                                <h2 className="text-zinc-100 font-bold truncate text-base lg:text-lg tracking-tight">
                                    {title}
                                </h2>
                            )}
                        </div>
                        {subtitle && <p className="text-zinc-500 text-xs font-medium tracking-wide mt-0.5">{subtitle}</p>}
                    </div>

                    <button 
                        onClick={onClose}
                        className="w-10 h-10 rounded-full bg-zinc-800/50 hover:bg-zinc-700/50 flex items-center justify-center text-zinc-400 hover:text-white transition-colors border border-transparent hover:border-zinc-600 shrink-0 ml-4"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content Body */}
                <div className="flex-1 overflow-y-auto hide-scrollbar bg-zinc-900 relative">
                    {children}
                </div>
            </div>
        </div>
    );
}
