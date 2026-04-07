import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export function OAuthCallback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { tenantId } = useAuth();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const code = searchParams.get('code');
        
        if (!code) {
            setStatus('error');
            setErrorMsg('No authorization code found in the URL.');
            return;
        }

        const exchangeCode = async () => {
            if (!tenantId) {
                setStatus('error');
                setErrorMsg('No tenant ID found. Please refresh the page and make sure you are logged in.');
                return;
            }
            try {
                const redirectUri = window.location.origin + window.location.pathname;

                await api.post('/companycam/oauth/exchange', { 
                    code,
                    redirectUri,
                    tenantId 
                });
                
                setStatus('success');
                toast.success('CompanyCam connected successfully!');
                
                // Redirect back to settings after a short delay
                setTimeout(() => {
                    navigate('/business/manage?tab=settings');
                }, 2000);
            } catch (err: any) {
                console.error(err);
                setStatus('error');
                setErrorMsg(err?.response?.data?.error || err.message || 'Failed to exchange token');
            }
        };

        exchangeCode();
    }, [searchParams, navigate, tenantId]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            {status === 'loading' && (
                <>
                    <RefreshCw className="w-12 h-12 text-accent animate-spin" />
                    <h2 className="text-2xl font-black text-white">Connecting CompanyCam...</h2>
                    <p className="text-zinc-500">Please wait while we secure your connection.</p>
                </>
            )}
            {status === 'success' && (
                <>
                    <CheckCircle className="w-12 h-12 text-emerald-500" />
                    <h2 className="text-2xl font-black text-white">Connection Successful!</h2>
                    <p className="text-zinc-500">Redirecting you back to settings...</p>
                </>
            )}
            {status === 'error' && (
                <>
                    <XCircle className="w-12 h-12 text-red-500" />
                    <h2 className="text-2xl font-black text-white">Connection Failed</h2>
                    <p className="text-red-400">{errorMsg}</p>
                    <button 
                        onClick={() => navigate('/business/manage?tab=settings')}
                        className="mt-6 bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2 rounded-lg font-bold"
                    >
                        Return to Settings
                    </button>
                </>
            )}
        </div>
    );
}
