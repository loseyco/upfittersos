import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Send, BellRing, BellOff, Hash, Users, Zap, CircleUser } from 'lucide-react';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

interface Message {
    id: string;
    text: string;
    senderId: string;
    senderName: string;
    tenantId: string;
    channelId?: string;
    createdAt: any;
}

export const Messenger: React.FC = () => {
    const { currentUser, tenantId, role, roles } = useAuth();
    const { permissionStatus, isSubscribing, requestPermissionAndSaveToken } = usePushNotifications();
    
    const [allMessages, setAllMessages] = useState<Message[]>([]);
    const [staff, setStaff] = useState<any[]>([]);
    const [departments, setDepartments] = useState<any[]>([]);
    const [activeChannelId, setActiveChannelId] = useState('general');
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!tenantId) return;

        // Fetch all tenant messages globally to avoid dynamic composite index requirements 
        // We will natively segregate them into specific channels on the client thread.
        const q = query(
            collection(db, 'messages'),
            where('tenantId', '==', tenantId),
            orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Message[];
            setAllMessages(fetched);
        });

        return () => unsubscribe();
    }, [tenantId]);

    useEffect(() => {
        if (!tenantId) return;
        const loadStaffAndDepts = async () => {
            try {
                const [staffRes, bizRes] = await Promise.all([
                    api.get(`/businesses/${tenantId}/staff`),
                    api.get(`/businesses/${tenantId}`)
                ]);
                setStaff(staffRes.data || []);
                setDepartments(bizRes.data?.departments || []);
            } catch (err) {
                console.error("Failed to load staff list or departments for Messenger:", err);
            }
        };
        loadStaffAndDepts();
    }, [tenantId]);

    const activeMessages = allMessages.filter(m => (m.channelId || 'general') === activeChannelId);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeMessages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !currentUser || !tenantId) return;

        try {
            await addDoc(collection(db, 'messages'), {
                text: newMessage,
                senderId: currentUser.uid,
                senderName: currentUser.displayName || currentUser.email || 'Unknown User',
                tenantId: tenantId,
                channelId: activeChannelId,
                createdAt: serverTimestamp()
            });
            setNewMessage('');
        } catch (error) {
            console.error("Failed to send message", error);
            toast.error("Failed to transmit payload.");
        }
    };

    const handleEnablePush = async () => {
        const success = await requestPermissionAndSaveToken();
        if (success) {
            toast.success("Push Alerts Enabled!");
        } else {
            toast.error("Failed to authorize push channel.");
        }
    };

    const myStaffRecord = staff.find(s => s.uid === currentUser?.uid);
    const assignedDepartmentNames = (myStaffRecord?.departmentRoles || []).map((dr: any) => dr.departmentName);
    if (myStaffRecord?.department && typeof myStaffRecord.department === 'string') {
        assignedDepartmentNames.push(myStaffRecord.department);
    }
    const arrayRoles = roles && roles.length > 0 ? roles : (role ? [role] : []);
    const isSuperAdmin = arrayRoles.includes('system_owner') || arrayRoles.includes('super_admin') || arrayRoles.includes('business_owner');

    const channels = [
        { id: 'general', name: 'Global Network', icon: Hash, desc: 'Business-wide communications' },
        ...departments.filter(d => isSuperAdmin || assignedDepartmentNames.includes(d.name)).map(d => ({
            id: `dept_${d.id}`,
            name: d.name,
            icon: Users,
            desc: `${d.name} Department Comms`
        }))
    ];

    const activeChannel = channels.find(c => c.id === activeChannelId) 
        || { id: activeChannelId, name: staff.find(s => `dm_${[currentUser?.uid, s.uid].sort().join('_')}` === activeChannelId)?.displayName || 'Direct Message', icon: CircleUser, desc: 'Encrypted Person-to-Person Direct Message' };

    return (
        <div className="flex flex-col h-full bg-zinc-950 overflow-hidden w-full relative">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[120px] pointer-events-none opacity-50"></div>

            <div className="flex h-full w-full relative z-10 p-4 md:p-6 pb-20">
                <div className="max-w-6xl w-full mx-auto flex flex-col md:flex-row gap-4 h-[calc(100vh-8rem)]">
                    
                    {/* Chat Sidebar */}
                    <div className="w-full md:w-64 bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col shrink-0 overflow-hidden shadow-2xl">
                        <div className="p-4 border-b border-zinc-800/50 bg-zinc-900/50">
                            <h2 className="text-sm font-black text-white tracking-widest uppercase flex items-center gap-2">
                                <Zap className="w-4 h-4 text-accent" /> Network Array
                            </h2>
                            <p className="text-[10px] text-zinc-500 mt-1 font-medium">Select a secure communication frequency.</p>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {channels.map(channel => {
                                const isActive = activeChannelId === channel.id;
                                
                                return (
                                    <button 
                                        key={channel.id}
                                        onClick={() => setActiveChannelId(channel.id)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                                            isActive 
                                            ? 'bg-accent/15 border-accent/30 text-white shadow-[inset_0_0_20px_rgba(var(--color-accent),0.1)]' 
                                            : 'border-transparent text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                                        } border`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'bg-zinc-800 text-zinc-500'}`}>
                                            <channel.icon className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <span className="font-bold text-xs truncate block tracking-wide">{channel.name}</span>
                                            <span className="text-[9px] truncate block opacity-70 mt-0.5">{channel.desc}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        
                        <div className="p-4 border-y border-zinc-800/50 bg-zinc-900/50">
                            <h2 className="text-[10px] font-black text-zinc-500 tracking-widest uppercase">Direct Comms</h2>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {staff.filter(s => s.uid !== currentUser?.uid).map(user => {
                                const dmId = `dm_${[currentUser?.uid, user.uid].sort().join('_')}`;
                                const isActive = activeChannelId === dmId;
                                
                                return (
                                    <button 
                                        key={user.uid}
                                        onClick={() => setActiveChannelId(dmId)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                                            isActive 
                                            ? 'bg-accent/15 border-accent/30 text-white shadow-[inset_0_0_20px_rgba(var(--color-accent),0.1)]' 
                                            : 'border-transparent text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                                        } border`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'bg-zinc-800 text-zinc-500'}`}>
                                            <CircleUser className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <span className="font-bold text-xs truncate block tracking-wide">{user.displayName || user.email}</span>
                                            <span className="text-[9px] truncate block opacity-70 mt-0.5">{user.role?.replace('_', ' ') || 'Staff'}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Device Push Status Widget */}
                        <div className="p-4 border-t border-zinc-800 bg-zinc-950/30">
                           {permissionStatus === 'granted' ? (
                                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-lg border border-emerald-500/20">
                                    <BellRing className="w-3 h-3" />
                                    <span>Signal Secured</span>
                                </div>
                            ) : (
                                <button 
                                    onClick={handleEnablePush}
                                    disabled={isSubscribing}
                                    className="w-full flex items-center justify-center gap-2 text-xs font-bold text-black bg-white hover:bg-zinc-200 px-3 py-2 rounded-lg transition-transform active:scale-95 disabled:opacity-50"
                                >
                                    <BellOff className="w-3 h-3" />
                                    <span>{isSubscribing ? 'Negotiating...' : 'Enable Core Push'}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Main Chat Window */}
                    <div className="flex-1 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 shadow-2xl rounded-2xl flex flex-col overflow-hidden relative">
                        
                        {/* Channel Header */}
                        <div className="p-4 border-b border-zinc-800/80 bg-zinc-900/50 flex flex-col z-10 shadow-sm shrink-0">
                            <div className="flex items-center gap-3">
                                <activeChannel.icon className="w-5 h-5 text-accent" />
                                <div>
                                    <h3 className="text-lg font-black text-white">{activeChannel.name}</h3>
                                    <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold block mt-0.5">End-to-End Environment Encryption</span>
                                </div>
                            </div>
                        </div>

                        {/* Message Feed */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 relative z-0">
                            {activeMessages.length === 0 ? (
                                <div className="flex h-full flex-col items-center justify-center text-zinc-600 gap-4 opacity-50">
                                    <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                                        <Hash className="w-8 h-8 text-zinc-500" />
                                    </div>
                                    <p className="text-sm font-medium tracking-wide">Frequency '{activeChannel.name}' is silent. Execute transmission.</p>
                                </div>
                            ) : (
                                activeMessages.map((msg, index) => {
                                    const isMe = msg.senderId === currentUser?.uid;
                                    const showName = !isMe && (index === 0 || activeMessages[index - 1].senderId !== msg.senderId);
                                    
                                    return (
                                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                            <div className="flex flex-col max-w-[85%] md:max-w-[65%]">
                                                {showName && (
                                                    <span className="text-[10px] font-bold text-zinc-500 mb-1 ml-1 tracking-wide uppercase">
                                                        {msg.senderName}
                                                    </span>
                                                )}
                                                <div className={`px-4 py-3 shadow-lg text-sm leading-relaxed ${
                                                    isMe 
                                                    ? 'bg-accent text-white rounded-2xl rounded-br-sm' 
                                                    : 'bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-2xl rounded-bl-sm'
                                                }`}>
                                                    {msg.text}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} className="h-2" />
                        </div>

                        {/* Compose Bar */}
                        <div className="p-4 bg-zinc-950/80 border-t border-zinc-800 shrink-0 z-10 w-full relative">
                            <form onSubmit={handleSendMessage} className="flex gap-3 relative max-w-full">
                                <input 
                                    type="text" 
                                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-5 py-3.5 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent text-white placeholder:text-zinc-600 text-sm shadow-inner transition-all w-full"
                                    placeholder={`Transmit to ${activeChannel.name}...`}
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                />
                                <button 
                                    type="submit"
                                    disabled={!newMessage.trim()}
                                    className="bg-accent text-white rounded-xl hover:bg-accent-hover transition-all disabled:opacity-50 disabled:scale-100 hover:scale-105 active:scale-95 flex items-center justify-center w-12 shrink-0 shadow-lg"
                                >
                                    <Send size={18} className={`${newMessage.trim() ? '-translate-x-0.5 -translate-y-0.5' : 'translate-x-0 translate-y-0'} transition-transform`} />
                                </button>
                            </form>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};
