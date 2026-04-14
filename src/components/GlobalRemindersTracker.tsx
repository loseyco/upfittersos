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
}

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
                
                // If it has day specific logic
                if (reminder.days && reminder.days.length > 0 && !reminder.days.includes(currentDayOfWeek)) {
                    return;
                }

                if (reminder.time === currentTimeStr) {
                    const uniqueRunId = `${dateStr}-${currentTimeStr}`;
                    const lastRun = triggeredIdsRef.current[reminder.id];
                    
                    if (lastRun !== uniqueRunId) {
                        triggeredIdsRef.current[reminder.id] = uniqueRunId;
                        
                        // Fire the local application notification
                        toast(reminder.message, {
                            icon: <Bell className="text-accent w-5 h-5 animate-bounce" />,
                            duration: 12000,
                            id: `alarm_${reminder.id}_${uniqueRunId}`,
                            style: {
                                background: '#18181b', // match standard zinc-950 context but explicit
                                color: '#fff',
                                borderColor: '#0ea5e9' // accent border for alarms
                            }
                        });
                        
                        // Try Native Notification if granted
                        if ('Notification' in window && Notification.permission === 'granted') {
                            new Notification('Reminder', {
                                body: reminder.message,
                            });
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
