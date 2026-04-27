import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { Clock, ShieldCheck, Activity } from 'lucide-react';
import { api } from '../../lib/api';
import { useWakeLock } from '../../hooks/useWakeLock';

export function TimeclockKiosk() {
    const { id: tenantId } = useParams<{ id: string }>();
    
    // Explicitly lock the device screen while Kiosk is active
    useWakeLock(true);
    
    const [currentTime, setCurrentTime] = useState(new Date());
    const [qrPayload, setQrPayload] = useState<string>('');
    const [refreshProgress, setRefreshProgress] = useState(100);
    const [businessName, setBusinessName] = useState<string>('Secure Terminal');
    
    // Dev Tooling: Track a Local IP Override for QR scanning testing
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const [devIpOverride, setDevIpOverride] = useState<string>('192.168.86.68');
    
    // Config: Refresh QR every 15 seconds for tight security
    const ROTATION_SECONDS = 15;

    useEffect(() => {
        // Fetch Business Name for branding
        if (tenantId) {
            api.get(`/businesses/${tenantId}`).then(res => {
                if (res.data?.name) setBusinessName(res.data.name);
            }).catch(console.error);
        }
    }, [tenantId]);

    useEffect(() => {
        const generateOtp = () => {
            // Payload: SAE_KIOSK_OTP:tenantId:timestamp
            const payload = `SAE_KIOSK_OTP:${tenantId}:${Date.now()}`;
            // Base64 encode it and append as a URL parameter for OS-native deep linking
            const encodedPayload = btoa(payload);
            
            // Resolve base URL for the QR code
            let baseUrl = window.location.origin;
            if (isLocalhost && devIpOverride) {
                baseUrl = `http://${devIpOverride}:${window.location.port}`;
            }
            
            const url = `${baseUrl}/business/time?kiosk=${encodedPayload}`;
            setQrPayload(url);
            setRefreshProgress(100);
        };

        generateOtp();

        const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000);
        
        const qrInterval = setInterval(() => {
            generateOtp();
        }, ROTATION_SECONDS * 1000);

        const progressInterval = setInterval(() => {
            setRefreshProgress(prev => Math.max(0, prev - (100 / (ROTATION_SECONDS * 10))));
        }, 100); // Smooth progress bar

        return () => {
            clearInterval(timeInterval);
            clearInterval(qrInterval);
            clearInterval(progressInterval);
        };
    }, [tenantId, isLocalhost, devIpOverride]);

    // Hardcode layout logic to prevent browser locale bugs with spacing
    const hours = currentTime.getHours() % 12 || 12;
    const minutes = currentTime.getMinutes().toString().padStart(2, '0');
    const secondsString = currentTime.getSeconds().toString().padStart(2, '0');
    const ampm = currentTime.getHours() >= 12 ? 'PM' : 'AM';
    const dateString = currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden font-sans">
            
            {/* Ambient Background Styling */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent/20 rounded-full blur-[150px] pointer-events-none opacity-50"></div>
            
            {/* Top Bar Navigation for Admins */}
            <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-10">
                <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900/80 backdrop-blur-md rounded-xl text-zinc-500 font-bold text-sm border border-zinc-800">
                    <Clock className="w-4 h-4" /> Operations Terminal
                </div>
                <div className="flex bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl items-center gap-2 text-emerald-500 text-xs font-black uppercase tracking-widest">
                    <ShieldCheck className="w-4 h-4" /> Secure Mode Active
                </div>
            </div>

            {/* Main Center UI */}
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-12 lg:gap-24">
                
                {/* Left Side: Clock & Instructions */}
                <div className="flex flex-col items-center md:items-start text-center md:text-left">
                    <h1 className="text-2xl font-bold text-zinc-500 mb-2 uppercase tracking-widest">{businessName}</h1>
                    
                    <div className="flex items-baseline font-black leading-none mb-2 tracking-tighter tabular-nums gap-2">
                        <span className="text-white text-8xl lg:text-[10rem]">{hours}:{minutes}</span>
                        <span className="text-accent/80 text-4xl font-bold ml-2">:{secondsString}</span>
                        <span className="text-zinc-500 text-3xl font-bold ml-4">{ampm}</span>
                    </div>
                    
                    <div className="text-2xl text-zinc-400 font-bold mb-12">
                        {dateString}
                    </div>

                    <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 max-w-md w-full">
                        <h2 className="text-white font-black text-xl mb-4 flex items-center gap-3">
                            <Activity className="w-6 h-6 text-accent" />
                            How to Punch
                        </h2>
                        <ul className="space-y-4">
                            <li className="flex items-start gap-4">
                                <span className="bg-accent text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm shrink-0">1</span>
                                <p className="text-zinc-400">Scan the secure QR Code on the right.</p>
                            </li>
                            <li className="flex items-start gap-4">
                                <span className="bg-accent text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm shrink-0">2</span>
                                <p className="text-zinc-400">Confirm your punch in the app.</p>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Right Side: Dynamic QR Code */}
                <div className="flex flex-col items-center bg-white p-8 rounded-[2rem] shadow-[0_0_100px_rgba(255,255,255,0.1)] relative overflow-hidden group">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-200">
                        <div 
                            className="h-full bg-accent transition-all duration-100 ease-linear"
                            style={{ width: `${refreshProgress}%` }}
                        />
                    </div>
                    
                    {qrPayload ? (
                        <>
                            <div className="mb-6 rounded-xl overflow-hidden border-8 border-transparent">
                                <QRCode 
                                    value={qrPayload}
                                    size={300}
                                    level="H"
                                    className="bg-white"
                                />
                            </div>
                            <p className="text-zinc-400 font-mono text-xs uppercase tracking-widest font-bold">
                                Code Refreshes In {Math.ceil((refreshProgress / 100) * ROTATION_SECONDS)}s
                            </p>

                            {/* Dev Tooling specifically to let the user override Localhost for camera testing */}
                            {isLocalhost && (
                                <div className="mt-8 pt-4 border-t border-zinc-200/50 w-full flex flex-col items-center">
                                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mb-2">Dev Local IP Bind</span>
                                    <input 
                                        type="text" 
                                        value={devIpOverride}
                                        onChange={e => setDevIpOverride(e.target.value)}
                                        placeholder="192.168.x.x"
                                        className="bg-zinc-100 border border-zinc-200 text-zinc-600 font-mono text-xs p-2 rounded-lg text-center w-36 outline-none focus:border-accent"
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="w-[300px] h-[300px] flex items-center justify-center bg-zinc-100 rounded-xl mb-6">
                            <Activity className="w-12 h-12 text-zinc-300 animate-pulse" />
                        </div>
                    )}
                </div>

            </div>

        </div>
    );
}
