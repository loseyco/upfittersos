import { useState, useEffect } from 'react';
import { PackageSearch, ExternalLink, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';

interface TrackerProps {
    deliveryId: string;
    trackingNumber: string;
    carrier: string;
    fallbackLinkOnly?: boolean;
}

export function PackageTracker({ deliveryId, trackingNumber, carrier, fallbackLinkOnly = false }: TrackerProps) {
    const [status, setStatus] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const getStaticLink = () => {
        const c = carrier.toLowerCase();
        if (c === 'ups') return `https://www.ups.com/track?tracknum=${trackingNumber}`;
        if (c === 'usps') return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
        if (c === 'fedex') return `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
        if (c === 'dhl') return `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${trackingNumber}`;
        return `https://www.google.com/search?q=${trackingNumber}`;
    };

    const fetchLiveStatus = async () => {
        if (fallbackLinkOnly || !deliveryId) return;
        setLoading(true);
        try {
            const res = await api.get(`/deliveries/${deliveryId}/tracking`);
            if (res.data.provider === 'easypost') {
                setStatus(res.data.data);
            }
        } catch (err) {
            console.error("Failed to fetch live tracking", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Initial fetch on mount
        fetchLiveStatus();
    }, [deliveryId, fallbackLinkOnly]);

    if (fallbackLinkOnly || !status) {
        return (
            <a 
                href={getStaticLink()} 
                target="_blank" 
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors border border-zinc-700 hover:border-zinc-500 hover:text-white"
            >
                <PackageSearch className="w-3 h-3" />
                Track on {carrier || 'Carrier'}
                <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
            </a>
        );
    }

    const { status: currentStatus, public_url, tracker_updates } = status;
    const latestEvent = tracker_updates && tracker_updates.length > 0 ? tracker_updates[tracker_updates.length - 1] : null;

    return (
        <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                currentStatus === 'delivered' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                currentStatus === 'in_transit' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                currentStatus === 'out_for_delivery' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                currentStatus === 'exception' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}>
                {currentStatus === 'delivered' ? <CheckCircle2 className="w-3.5 h-3.5" /> : 
                 currentStatus === 'exception' ? <AlertTriangle className="w-3.5 h-3.5" /> :
                 loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <PackageSearch className="w-3.5 h-3.5" />}
                 
                {currentStatus?.replace(/_/g, ' ').toUpperCase() || 'UNKNOWN'}
            </div>
            
            {latestEvent && (
                <span className="text-[10px] text-zinc-500 truncate max-w-[200px]">
                    {latestEvent.message}
                </span>
            )}

            {public_url && (
                <a 
                    href={public_url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 text-xs font-bold transition-colors ml-auto flex items-center gap-1"
                >
                    View <ExternalLink className="w-3 h-3" />
                </a>
            )}
        </div>
    );
}
