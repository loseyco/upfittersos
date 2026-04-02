import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { LayoutGrid, Bug, Loader2 } from 'lucide-react';
import { APP_NAME } from '../../lib/constants';

interface ChangelogEntry {
    id: string;
    version: string;
    date: string;
    title: string;
    description: string;
    features?: string[];
    fixes?: string[];
    createdAt?: any;
}

export const ChangelogDoc = () => {
    const [entries, setEntries] = useState<ChangelogEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchChangelogs = async () => {
            try {
                const q = query(collection(db, 'changelogs'), orderBy('createdAt', 'desc'));
                const querySnapshot = await getDocs(q);
                const fetchedEntries = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as ChangelogEntry[];
                setEntries(fetchedEntries);
            } catch (error) {
                console.error("Failed to fetch changelogs:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchChangelogs();
    }, []);

    return (
        <div className="animate-in fade-in max-w-3xl prose-invert pb-20">
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-4">Release Notes</h1>
            <p className="text-zinc-400 text-lg leading-relaxed mb-12">
                A chronological record of new features, optimizations, and architectural enhancements released to the {APP_NAME} platform.
            </p>

            <div className="space-y-12">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
                        <Loader2 className="w-8 h-8 animate-spin mb-4 text-accent" />
                        <span className="font-bold text-sm uppercase tracking-widest">Retrieving Timeline...</span>
                    </div>
                ) : entries.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-2xl">
                        No changelog entries established yet.
                    </div>
                ) : (
                    entries.map((entry) => (
                        <section key={entry.id} className="relative">
                            <div className="flex flex-col md:flex-row gap-6">
                                {/* Timeline Metadata Node */}
                                <div className="shrink-0 w-32 border-b md:border-b-0 md:border-r border-zinc-800 pb-4 md:pb-0 pt-2 pr-6">
                                    <div className="font-black text-white text-xl tracking-tight mb-1">{entry.version}</div>
                                    <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{entry.date}</div>
                                </div>
                                
                                {/* Changelog Body */}
                                <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8">
                                    <h2 className="text-2xl font-bold text-white mb-2">{entry.title}</h2>
                                    <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                                        {entry.description}
                                    </p>
                                    
                                    <div className="space-y-6">
                                        {entry.features && entry.features.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-3">
                                                    <LayoutGrid className="w-4 h-4 text-emerald-400" />
                                                    <h3 className="text-emerald-400 font-bold text-xs uppercase tracking-widest">Features</h3>
                                                </div>
                                                <ul className="space-y-2">
                                                    {entry.features.map((feature, i) => (
                                                        <li key={i} className="flex items-start gap-2 text-sm text-zinc-300 bg-black/40 p-2.5 rounded-lg border border-zinc-800/50">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 mt-1.5 shrink-0" />
                                                            {feature}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {entry.fixes && entry.fixes.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Bug className="w-4 h-4 text-blue-400" />
                                                    <h3 className="text-blue-400 font-bold text-xs uppercase tracking-widest">Fixes</h3>
                                                </div>
                                                <ul className="space-y-2">
                                                    {entry.fixes.map((fix, i) => (
                                                        <li key={i} className="flex items-start gap-2 text-sm text-zinc-300 bg-black/40 p-2.5 rounded-lg border border-zinc-800/50">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50 mt-1.5 shrink-0" />
                                                            {fix}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>
                    ))
                )}
            </div>
        </div>
    );
};
