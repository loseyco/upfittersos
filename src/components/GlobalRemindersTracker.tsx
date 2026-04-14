import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';
import { Bell } from 'lucide-react';

export interface CustomReminder {
    id: string;
    time: string; // "HH:MM" 24-hour format
    message: string;
    enabled: boolean;
    days?: string[]; // optional recurring days, 0=Sunday, 1=Monday...
    monthDay?: number; // optional day of the month, 1-31
    sound?: boolean;
    speak?: boolean;
}

const playBeep = () => {
    try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
        console.log('Audio API error', e);
    }
};

export function GlobalRemindersTracker() {
    const { currentUser } = useAuth();
    const [reminders, setReminders] = useState<CustomReminder[]>([]);
    
    // We keep track of the last run to ensure we don't duplicate notifications in the same minute
    const triggeredIdsRef = useRef<Record<string, string>>({}); // id -> 'YYYY-MM-DD-HH:MM'

    useEffect(() => {
        if (!currentUser) {
            setReminders([]);
            return;
        }

        const unsubscribe = onSnapshot(doc(db, 'users', currentUser.uid), (docSn) => {
            if (docSn.exists()) {
                const data = docSn.data();
                if (data.customReminders && Array.isArray(data.customReminders)) {
                    setReminders(data.customReminders as CustomReminder[]);
                } else {
                    setReminders([]);
                }
            }
        });

        return () => unsubscribe();
    }, [currentUser]);

    useEffect(() => {
        if (!reminders.length) return;

        const checkReminders = () => {
            const now = new Date();
            const currentHour = now.getHours().toString().padStart(2, '0');
            const currentMinute = now.getMinutes().toString().padStart(2, '0');
            const currentTimeStr = `${currentHour}:${currentMinute}`;
            const dateStr = now.toISOString().split('T')[0];
            const currentDayOfWeek = now.getDay().toString(); // 0-6
            
            reminders.forEach(reminder => {
                if (!reminder.enabled) return;
                
                // If it has day specific logic (Days of week)
                if (reminder.days && reminder.days.length > 0 && !reminder.days.includes(currentDayOfWeek)) {
                    return;
                }

                // If it has month specific logic (Day of month)
                if (reminder.monthDay) {
                    if (now.getDate() !== reminder.monthDay) {
                        return;
                    }
                }

                if (reminder.time === currentTimeStr) {
                    const uniqueRunId = `${dateStr}-${currentTimeStr}`;
                    const lastRun = triggeredIdsRef.current[reminder.id];
                    
                    if (lastRun !== uniqueRunId) {
                        triggeredIdsRef.current[reminder.id] = uniqueRunId;
                        
                        // Fire the local application notification
                        toast((t) => (
                            <div className="flex flex-col gap-2 w-full max-w-sm">
                                <style>{`
                                    @keyframes police-strobe {
                                        0%, 20% { box-shadow: 0 0 40px rgba(239, 68, 68, 0.5) inset, 0 0 30px rgba(239, 68, 68, 0.8); border-color: #ef4444; }
                                        25%, 45% { box-shadow: 0 0 10px rgba(24, 24, 27, 0.5); border-color: #27272a; }
                                        50%, 70% { box-shadow: 0 0 40px rgba(59, 130, 246, 0.5) inset, 0 0 30px rgba(59, 130, 246, 0.8); border-color: #3b82f6; }
                                        75%, 100% { box-shadow: 0 0 10px rgba(24, 24, 27, 0.5); border-color: #27272a; }
                                    }
                                    .police-toast {
                                        animation: police-strobe 0.6s infinite !important;
                                        background: #09090b !important;
                                        border: 2px solid transparent;
                                    }
                                `}</style>
                                <div className="flex items-start gap-3">
                                    <Bell className="text-white w-6 h-6 animate-pulse shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                        <p className="text-lg font-black text-white uppercase tracking-wider">{reminder.message}</p>
                                        <p className="text-xs text-zinc-400 mt-1 font-bold">ALARM TRIGGED AT {reminder.time}</p>
                                    </div>
                                    <button
                                        onClick={() => toast.dismiss(t.id)}
                                        className="text-zinc-400 hover:text-white transition-colors bg-zinc-900 border border-zinc-700 hover:border-zinc-500 rounded-md p-2 shadow-lg"
                                    >
                                        <span className="text-xs font-black uppercase tracking-widest leading-none">Acknowledge</span>
                                    </button>
                                </div>
                            </div>
                        ), {
                            duration: Infinity,
                            id: `alarm_${reminder.id}_${uniqueRunId}`,
                            className: 'police-toast',
                            style: {
                                color: '#fff',
                                padding: '16px',
                                minWidth: '320px',
                                borderRadius: '12px'
                            }
                        });
                        
                        // Try Native Notification if granted
                        if ('Notification' in window && Notification.permission === 'granted') {
                            new Notification('Reminder', {
                                body: reminder.message,
                            });
                        }

                        // Play sound if enabled
                        if (reminder.sound) {
                            playBeep();
                        }

                        // Speak if enabled
                        if (reminder.speak && 'speechSynthesis' in window) {
                            const utterance = new SpeechSynthesisUtterance(reminder.message);
                            window.speechSynthesis.speak(utterance);
                        }
                    }
                }
            });
        };

        const interval = setInterval(checkReminders, 15000); // Check every 15 seconds
        checkReminders(); // Initial check

        return () => clearInterval(interval);
    }, [reminders]);

    return null; // Silent component
}
