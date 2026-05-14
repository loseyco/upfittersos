import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase/config';
import { useAuthStore } from '../../../lib/auth/store';
import { Send, User as UserIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';

interface JobChatProps {
  tenantId: string;
  jobId: string;
}

interface ChatMessage {
  id: string;
  message: string;
  senderId: string;
  senderName: string;
  createdAt: any;
  isSystem: boolean;
}

export const JobChat: React.FC<JobChatProps> = ({ tenantId, jobId }) => {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tenantId || !jobId) return;

    const q = query(
      collection(db, `businesses/${tenantId}/jobs/${jobId}/chat_messages`),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      setMessages(msgs);
    }, (err) => {
      console.error("Job chat listener error:", err);
      toast.error("You don't have permission to view this chat.");
    });

    return () => unsubscribe();
  }, [tenantId, jobId]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    setIsSending(true);
    try {
      await addDoc(collection(db, `businesses/${tenantId}/jobs/${jobId}/chat_messages`), {
        message: newMessage.trim(),
        senderId: user.uid,
        senderName: user.displayName || user.email || 'Staff',
        createdAt: serverTimestamp(),
        isSystem: false
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Messages Area */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 italic">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.senderId === user?.uid;
            const showHeader = index === 0 || messages[index - 1].senderId !== msg.senderId || messages[index - 1].isSystem !== msg.isSystem;

            if (msg.isSystem) {
              return (
                <div key={msg.id} className="flex justify-center my-4">
                  <span className="px-3 py-1 bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs rounded-full font-medium">
                    {msg.message}
                  </span>
                </div>
              );
            }

            return (
              <div key={msg.id} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                {showHeader && (
                  <div className={cn(
                    "flex items-center gap-1.5 mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-500",
                    isMe ? "mr-1 flex-row-reverse text-indigo-500/70" : "ml-1"
                  )}>
                    <UserIcon className="w-2.5 h-2.5" />
                    <span>{msg.senderName}</span>
                  </div>
                )}
                <div className={cn(
                  "max-w-[85%] px-4 py-2.5 rounded-2xl shadow-sm",
                  isMe 
                    ? "bg-indigo-600 text-white rounded-br-sm" 
                    : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-bl-sm"
                )}>
                  <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.message}</p>
                </div>
                <span className={cn(
                  "text-[10px] text-zinc-400 mt-1",
                  isMe ? "mr-1" : "ml-1"
                )}>
                  {formatTime(msg.createdAt)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
        <form onSubmit={handleSendMessage} className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              placeholder="Type a message..."
              className="w-full max-h-32 min-h-[44px] bg-zinc-100 dark:bg-zinc-800/50 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900 rounded-xl px-4 py-3 text-sm resize-none custom-scrollbar outline-none transition-all"
              rows={1}
            />
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim() || isSending}
            className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors shadow-sm shrink-0 mb-0.5"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
};
