import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { ShieldCheck, MonitorSmartphone, KeySquare } from 'lucide-react';
import { toast } from 'sonner';

async function importPublicKey(spkiBase64: string) {
  const binaryDerString = atob(spkiBase64);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }
  return await window.crypto.subtle.importKey(
    "spki",
    binaryDer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
}

async function encryptPayload(publicKey: CryptoKey, payloadString: string) {
  const encoded = new TextEncoder().encode(payloadString);
  const encrypted = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, encoded);
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

export function TvPairingApprove() {
  const [searchParams] = useSearchParams();
  const { user, tenantId } = useAuthStore();
  const navigate = useNavigate();
  
  const [pin, setPin] = useState(searchParams.get('pin') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Basic access check
    if (!tenantId) {
      toast.error('You must be logged into a tenant to pair a TV.');
      navigate('/');
    }
  }, [tenantId, navigate]);

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || pin.length !== 6) return toast.error('Please enter the 6-digit PIN shown on the TV.');
    if (!email || !password) return toast.error('Please enter the generic Monitor account credentials.');
    if (!tenantId) return toast.error('No tenant context found.');

    setIsSubmitting(true);
    try {
      const docRef = doc(db, 'tv_pairings', pin);
      const snap = await getDoc(docRef);
      
      if (!snap.exists()) {
        throw new Error('Invalid or expired PIN.');
      }

      const data = snap.data();
      if (!data.publicKey) {
        throw new Error('TV did not provide a secure pairing key.');
      }

      // Import the TV's public key
      const publicKey = await importPublicKey(data.publicKey);

      // Create payload
      const payload = JSON.stringify({
        email,
        password,
        tenantId
      });

      // Encrypt payload
      const encryptedBase64 = await encryptPayload(publicKey, payload);

      // Send back to TV
      await updateDoc(docRef, {
        encryptedPayload: encryptedBase64,
        updatedAt: new Date()
      });

      toast.success('TV paired successfully! Check the TV screen.');
      setTimeout(() => navigate('/'), 2000);

    } catch (err: any) {
      toast.error(err.message || 'Failed to pair TV.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl border border-zinc-200 p-8 max-w-md w-full">
        <div className="flex items-center justify-center w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl mx-auto mb-6">
          <MonitorSmartphone className="w-8 h-8" />
        </div>
        
        <h1 className="text-2xl font-black text-center text-zinc-900 mb-2 tracking-tight">Pair TV Monitor</h1>
        <p className="text-zinc-500 text-center mb-8 font-medium">
          Enter the PIN shown on the TV and provide the generic Monitor account credentials to securely log the TV in.
        </p>

        <form onSubmit={handlePair} className="space-y-5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">TV PIN Code</label>
            <input 
              type="text" 
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0,6))}
              className="w-full text-center text-3xl font-black tracking-[0.5em] p-4 bg-zinc-100 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all"
              placeholder="000000"
              maxLength={6}
              required
            />
          </div>

          <div className="pt-4 border-t border-zinc-100">
            <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Monitor Account Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 bg-zinc-50 border border-zinc-200 focus:border-indigo-500 rounded-xl outline-none font-medium"
              placeholder="monitor@yourshop.com"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Monitor Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 bg-zinc-50 border border-zinc-200 focus:border-indigo-500 rounded-xl outline-none font-medium"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="bg-indigo-50 text-indigo-700 text-xs p-4 rounded-xl flex items-start gap-3 mt-6">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <p className="font-medium">
              Credentials are end-to-end encrypted using RSA. They are never sent in plain text and are immediately deleted from the database.
            </p>
          </div>

          <button 
            type="submit"
            disabled={isSubmitting || pin.length !== 6}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <KeySquare className="w-5 h-5" />
                Securely Pair TV
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
