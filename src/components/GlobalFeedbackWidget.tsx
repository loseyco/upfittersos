import React, { useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle, X, Bug, Lightbulb, Star, Camera, UploadCloud, Loader2, Workflow } from 'lucide-react';
import { domToJpeg } from 'modern-screenshot';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export function GlobalFeedbackWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<'idea' | 'feature' | 'bug' | 'workflow'>('bug');
    const [includeScreenshot, setIncludeScreenshot] = useState(true);
    
    const { currentUser, tenantId } = useAuth();
    const location = useLocation();
    const widgetRef = useRef<HTMLDivElement>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !description.trim()) {
            toast.error("Please provide a title and description.");
            return;
        }

        setIsSubmitting(true);
        const toastId = toast.loading('Submitting feedback...');

        try {
            let screenshotUrl = null;

            if (includeScreenshot) {
                // Temporarily hide the widget so it doesn't appear in the screenshot
                if (widgetRef.current) {
                    widgetRef.current.style.display = 'none';
                }

                try {
                    const imgData = await domToJpeg(document.body, {
                        quality: 0.6,
                        scale: 1,
                        filter: (node) => (node as Element).id !== 'sae-feedback-widget'
                    });
                    
                    const storage = getStorage();
                    const fileName = `feedback_screenshots/${Date.now()}_${currentUser?.uid || 'anon'}.jpg`;
                    const storageRef = ref(storage, fileName);
                    
                    await uploadString(storageRef, imgData, 'data_url');
                    screenshotUrl = await getDownloadURL(storageRef);
                } catch (screenshotError: any) {
                    console.error("Screenshot capture failed:", screenshotError);
                    toast.error(`Screenshot failed: ${screenshotError.message || 'Unknown error'}. Submitting feedback anyway.`);
                } finally {
                    // Restore widget visibility
                    if (widgetRef.current) {
                        widgetRef.current.style.display = 'block';
                    }
                }
            }

            await addDoc(collection(db, 'feedback'), {
                title: title.trim(),
                description: description.trim(),
                type,
                priority: 'normal',
                status: type === 'workflow' ? 'planning' : 'open',
                authorId: currentUser?.uid || 'anonymous',
                authorName: currentUser?.displayName || currentUser?.email || 'Anonymous User',
                authorEmail: currentUser?.email || null,
                authorPhoto: currentUser?.photoURL || null,
                tenantId: tenantId || 'GLOBAL',
                upvotes: [currentUser?.uid].filter(Boolean),
                screenshotUrl,
                path: location.pathname,
                createdAt: serverTimestamp()
            });

            toast.success("Feedback submitted successfully!", { id: toastId });
            setIsOpen(false);
            setTitle('');
            setDescription('');
            
        } catch (err) {
            console.error("Failed to submit feedback:", err);
            toast.error("Failed to submit feedback. Please try again.", { id: toastId });
        } finally {
            setIsSubmitting(false);
        }
    };

    const getTypeIcon = (t: string) => {
        switch(t) {
            case 'bug': return <Bug className="w-4 h-4" />;
            case 'feature': return <Star className="w-4 h-4" />;
            case 'workflow': return <Workflow className="w-4 h-4" />;
            default: return <Lightbulb className="w-4 h-4" />;
        }
    };

    return (
        <div id="sae-feedback-widget" ref={widgetRef} className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
            {/* Modal */}
            {isOpen && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-80 sm:w-96 mb-4 overflow-hidden animate-in slide-in-from-bottom-5 fade-in">
                    <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
                        <div className="flex items-center gap-2">
                            <MessageCircle className="w-5 h-5 text-accent" />
                            <h3 className="font-bold text-white">Help & Feedback</h3>
                        </div>
                        <button 
                            onClick={() => setIsOpen(false)}
                            className="text-zinc-400 hover:text-white transition-colors p-1"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="p-4 space-y-4">
                        <div className="flex bg-zinc-900/50 p-1 rounded-xl border border-zinc-800">
                            {(['bug', 'feature', 'idea', 'workflow'] as const).map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setType(t)}
                                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 capitalize transition-all ${
                                        type === t 
                                        ? 'bg-zinc-800 text-white shadow-sm' 
                                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                                    }`}
                                >
                                    {getTypeIcon(t)}
                                    <span className="hidden sm:inline">{t}</span>
                                </button>
                            ))}
                        </div>

                        <div>
                            <input 
                                type="text"
                                placeholder="Summary..."
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent placeholder:text-zinc-600"
                                maxLength={100}
                                disabled={isSubmitting}
                            />
                        </div>

                        <div>
                            <textarea 
                                placeholder="Please describe the issue or idea in detail..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent placeholder:text-zinc-600 min-h-[100px] resize-y"
                                disabled={isSubmitting}
                            />
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer group">
                            <div className="relative flex items-center justify-center">
                                <input 
                                    type="checkbox"
                                    checked={includeScreenshot}
                                    onChange={(e) => setIncludeScreenshot(e.target.checked)}
                                    disabled={isSubmitting}
                                    className="peer sr-only"
                                />
                                <div className="w-5 h-5 border-2 border-zinc-700 rounded bg-zinc-900 peer-checked:bg-accent peer-checked:border-accent transition-all"></div>
                                <svg className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" viewBox="0 0 14 10" fill="none">
                                    <path d="M1 5L4.5 8.5L13 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                            <span className="text-sm text-zinc-400 font-medium group-hover:text-zinc-300 transition-colors flex items-center gap-1.5">
                                <Camera className="w-4 h-4" /> Includes Screenshot 
                            </span>
                        </label>

                        <button
                            type="submit"
                            disabled={isSubmitting || !title.trim() || !description.trim()}
                            className="w-full bg-accent hover:bg-accent-hover text-white font-bold py-2.5 rounded-xl transition-all shadow-lg shadow-accent/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                                </>
                            ) : (
                                <>
                                    <UploadCloud className="w-4 h-4" /> Submit Feedback
                                </>
                            )}
                        </button>
                    </form>
                </div>
            )}

            {/* Floating Toggle Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="bg-accent hover:bg-accent-hover text-white p-3.5 rounded-full shadow-[0_0_20px_rgba(var(--color-accent),0.3)] transition-transform hover:scale-105 group"
                    title="Send Feedback"
                >
                    <div className="relative flex items-center justify-center w-8 h-8">
                        <MessageCircle className="w-8 h-8" />
                        <span className="absolute text-lg font-black -mt-0.5">?</span>
                        <div className="absolute -top-2 -right-3 bg-red-500 rounded-full p-1 border-2 border-accent transition-colors shadow-lg group-hover:scale-110 group-hover:-rotate-12 duration-300">
                            <Bug className="w-3.5 h-3.5 text-white" />
                        </div>
                    </div>
                </button>
            )}
        </div>
    );
}
