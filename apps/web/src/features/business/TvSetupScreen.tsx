import { useEffect, useState } from 'react';
import _QRCode from 'react-qr-code';
import { doc, setDoc, onSnapshot, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../../lib/firebase/config';
import { Monitor, ShieldCheck, AlertTriangle } from 'lucide-react';
import { BayMonitor } from './BayMonitor';

const QRCode = (_QRCode as any).default || _QRCode;

async function generateRsaKeyPair() {
  return await window.crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["encrypt", "decrypt"]
  );
}

async function exportPublicKey(key: CryptoKey) {
  const exported = await window.crypto.subtle.exportKey("spki", key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

async function decryptPayload(privateKey: CryptoKey, encryptedBase64: string) {
  const encrypted = new Uint8Array(atob(encryptedBase64).split("").map(c => c.charCodeAt(0)));
  const decrypted = await window.crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, encrypted);
  return new TextDecoder().decode(decrypted);
}

export function TvSetupScreen() {
  const [pin, setPin] = useState<string>('');
  const [keyPair, setKeyPair] = useState<CryptoKeyPair | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'generating' | 'waiting' | 'decrypting' | 'authenticating' | 'success'>('generating');
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    let currentPin = '';

    const initialize = async () => {
      try {
        const keys = await generateRsaKeyPair();
        setKeyPair(keys);
        const pubKeyStr = await exportPublicKey(keys.publicKey);

        // Generate a 6-digit PIN
        currentPin = Math.floor(100000 + Math.random() * 900000).toString();
        setPin(currentPin);

        // Write to Firestore
        await setDoc(doc(db, 'tv_pairings', currentPin), {
          status: 'pending',
          publicKey: pubKeyStr,
          createdAt: serverTimestamp()
        });

        setStatus('waiting');
      } catch (err: any) {
        setError('Failed to initialize secure pairing: ' + err.message);
      }
    };

    initialize();

    return () => {
      // Cleanup if component unmounts before pairing
      if (currentPin) {
        deleteDoc(doc(db, 'tv_pairings', currentPin)).catch(console.error);
      }
    };
  }, []);

  useEffect(() => {
    if (status !== 'waiting' || !pin || !keyPair) return;

    const unsub = onSnapshot(doc(db, 'tv_pairings', pin), async (snap) => {
      const data = snap.data();
      if (data && data.encryptedPayload) {
        try {
          setStatus('decrypting');
          const payloadStr = await decryptPayload(keyPair.privateKey, data.encryptedPayload);
          const payload = JSON.parse(payloadStr);

          if (!payload.email || !payload.password || !payload.tenantId) {
            throw new Error('Invalid payload received.');
          }

          setStatus('authenticating');
          await signInWithEmailAndPassword(auth, payload.email, payload.password);
          
          setTenantId(payload.tenantId);
          setStatus('success');

          // Clean up the pairing doc
          await deleteDoc(doc(db, 'tv_pairings', pin));

        } catch (err: any) {
          setError('Pairing failed: ' + err.message);
          setStatus('generating'); // Stop the loop
          // Delete the corrupted pairing doc so we don't keep trying
          await deleteDoc(doc(db, 'tv_pairings', pin)).catch(console.error);
        }
      }
    });

    return () => unsub();
  }, [pin, keyPair, status]);

  if (status === 'success' && tenantId) {
    return <BayMonitor tenantId={tenantId} />;
  }

  const pairUrl = `${window.location.origin}/pair?pin=${pin}`;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
      {error ? (
        <div className="bg-red-950/50 border-2 border-red-900 rounded-3xl p-8 max-w-2xl w-full text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-6" />
          <h2 className="text-3xl font-black text-red-500 mb-4 tracking-tight">PAIRING ERROR</h2>
          <p className="text-xl text-red-200 mb-8">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-8 rounded-xl transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : (
        <div className="bg-zinc-900 border-4 border-zinc-800 rounded-[3rem] p-12 max-w-4xl w-full flex gap-12 items-center shadow-2xl">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-8">
              <Monitor className="w-10 h-10 text-emerald-500" />
              <h1 className="text-4xl font-black tracking-tighter">TV MONITOR SETUP</h1>
            </div>
            
            <div className="space-y-6">
              <p className="text-xl text-zinc-400 font-medium">
                To connect this screen to your UpfittersOS shop floor, scan the QR code with your phone or visit:
              </p>
              <div className="bg-black rounded-2xl p-6 font-mono text-xl text-emerald-400 font-bold break-all border border-zinc-800">
                {window.location.origin}/pair
              </div>
              
              <div className="pt-6">
                <p className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-2">Secure Pairing PIN</p>
                <div className="text-7xl font-black tracking-widest text-white">
                  {pin ? `${pin.slice(0,3)} ${pin.slice(3)}` : '------'}
                </div>
              </div>
            </div>

            <div className="mt-12 flex items-center gap-3 text-emerald-500 bg-emerald-500/10 px-6 py-4 rounded-2xl w-fit">
              <ShieldCheck className="w-6 h-6" />
              <span className="font-bold tracking-widest uppercase text-sm">End-to-End Encrypted Session</span>
            </div>
          </div>

          <div className="shrink-0 bg-white p-6 rounded-3xl">
            {pin ? (
              <QRCode value={pairUrl} size={300} />
            ) : (
              <div className="w-[300px] h-[300px] bg-zinc-100 animate-pulse rounded-2xl"></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
