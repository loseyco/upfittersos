import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { ArrowLeft, Clock, MapPin, Users } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow } from '@vis.gl/react-google-maps';
import { api } from '../../lib/api';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

interface StaffLocation {
    userId: string;
    lat: number;
    lng: number;
    accuracy: number;
    timestamp: string;
}

export function FieldMapPage() {
    const { tenantId } = useAuth();
    const navigate = useNavigate();
    const { checkPermission, loading } = usePermissions();
    
    const [locations, setLocations] = useState<StaffLocation[]>([]);
    const [staffProfiles, setStaffProfiles] = useState<Record<string, any>>({});
    const [selectedLocation, setSelectedLocation] = useState<StaffLocation | null>(null);

    useEffect(() => {
        if (!tenantId || tenantId === 'GLOBAL') return;
        
        // Fetch staff profiles to enrich the map pins
        const fetchStaff = async () => {
            try {
                const res = await api.get(`/businesses/${tenantId}/staff`);
                const profileMap: Record<string, any> = {};
                res.data.forEach((s: any) => {
                    profileMap[s.uid] = s;
                });
                setStaffProfiles(profileMap);
            } catch (err) {
                console.error("Failed to load staff profiles for map", err);
            }
        };
        fetchStaff();

        // Listen for live location updates
        const unsub = onSnapshot(collection(db, 'businesses', tenantId, 'staff_locations'), (snap) => {
            const locs = snap.docs.map(d => ({ ...d.data(), userId: d.id } as StaffLocation));
            
            // Filter stale locations (e.g. older than 2 hours)
            const recentLocs = locs.filter(l => {
                if (!l.timestamp) return false;
                const hoursOld = (Date.now() - new Date(l.timestamp).getTime()) / 3600000;
                return hoursOld < 2; 
            });
            
            setLocations(recentLocs);
        });

        return () => unsub();
    }, [tenantId]);

    if (loading) return <div className="min-h-screen bg-zinc-950"></div>;

    if (!checkPermission('manage_jobs') && !checkPermission('manage_staff')) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center p-6 text-white">
                <h2 className="text-2xl font-black mb-2">Access Denied</h2>
                <p className="text-zinc-500 mb-6">You do not have clearance to access the interactive field operations map.</p>
                <button onClick={() => navigate('/workspace')} className="text-accent flex items-center gap-2 hover:text-white transition-colors">
                    <ArrowLeft className="w-4 h-4"/> Back to Hub
                </button>
            </div>
        );
    }

    if (!GOOGLE_MAPS_API_KEY) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center p-6 text-white">
                <MapPin className="w-12 h-12 text-zinc-600 mb-4" />
                <h2 className="text-2xl font-black mb-2">Google Maps Key Missing</h2>
                <p className="text-zinc-400 mb-6 max-w-sm">Please provide <code className="bg-zinc-800 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> in your environment variables to enable the interactive field map.</p>
                <button onClick={() => navigate('/workspace')} className="text-accent flex items-center gap-2 hover:text-white transition-colors">
                    <ArrowLeft className="w-4 h-4"/> Back to Hub
                </button>
            </div>
        );
    }

    // Default center coords (if no locations, maybe just default somewhere... maybe USA center)
    const center = locations.length > 0 
        ? { lat: locations[0].lat, lng: locations[0].lng } 
        : { lat: 39.8283, lng: -98.5795 };
        
    return (
        <div className="flex flex-col h-full w-full bg-zinc-950 absolute inset-0 z-50">
            {/* Header Toolbar */}
            <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 md:px-8 bg-zinc-900/90 backdrop-blur-md shrink-0 shadow-lg relative z-10">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate('/workspace')}
                        className="flex items-center justify-center w-10 h-10 rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-widest mb-0.5">
                            <MapPin className="w-3 h-3" /> Live Operations
                        </div>
                        <h1 className="text-lg md:text-xl font-black text-white leading-none">Field Map</h1>
                    </div>
                </div>
                <div className="flex items-center gap-4 text-sm font-bold text-zinc-400">
                    <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
                        <Users className="w-4 h-4 text-blue-400" />
                        <span>{locations.length} Active in Field</span>
                    </div>
                </div>
            </div>

            {/* Map Area */}
            <div className="flex-1 w-full bg-zinc-900 relative">
                <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                    <Map
                        defaultZoom={locations.length > 0 ? 11 : 4}
                        defaultCenter={center}
                        mapId="FIELD_OPS_MAP"
                        className="w-full h-full"
                        disableDefaultUI={true}
                        zoomControl={true}
                    >
                        {locations.map((loc) => {
                            return (
                                <AdvancedMarker 
                                    key={loc.userId} 
                                    position={{ lat: loc.lat, lng: loc.lng }}
                                    onClick={() => setSelectedLocation(loc)}
                                >
                                    <Pin background={'#2563eb'} borderColor={'#1e40af'} glyphColor={'#fff'} />
                                </AdvancedMarker>
                            );
                        })}

                        {selectedLocation && (
                            <InfoWindow
                                position={{ lat: selectedLocation.lat, lng: selectedLocation.lng }}
                                onCloseClick={() => setSelectedLocation(null)}
                                headerDisabled={true}
                            >
                                <div className="text-zinc-900 min-w-[200px] p-1 font-sans">
                                    <h3 className="font-bold text-base mb-1">
                                        {staffProfiles[selectedLocation.userId] ? 
                                            (staffProfiles[selectedLocation.userId].displayName || 
                                             `${staffProfiles[selectedLocation.userId].firstName || ''} ${staffProfiles[selectedLocation.userId].lastName || ''}`.trim() || 
                                             staffProfiles[selectedLocation.userId].email)
                                             : 'Unknown Tech'}
                                    </h3>
                                    {staffProfiles[selectedLocation.userId]?.jobTitle && (
                                        <p className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-2">
                                            {staffProfiles[selectedLocation.userId].jobTitle}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                                        <Clock className="w-3.5 h-3.5" />
                                        Last seen: {new Date(selectedLocation.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium mt-1">
                                        <MapPin className="w-3.5 h-3.5" />
                                        Accuracy: ±{Math.round(selectedLocation.accuracy)}m
                                    </div>
                                </div>
                            </InfoWindow>
                        )}
                    </Map>
                </APIProvider>
            </div>
        </div>
    );
}
