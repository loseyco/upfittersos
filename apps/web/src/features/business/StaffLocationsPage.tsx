import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Map, Loader2 } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { toast } from 'sonner';

// Custom Leaflet staff marker icon
const staffMarkerIcon = L.divIcon({
  className: 'custom-staff-marker-icon',
  html: `<div style="background-color: #4f46e5; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; overflow: hidden;"><span style="color: white; font-size: 14px; font-weight: bold; line-height: 1;">👤</span></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  return null;
}

export function StaffLocationsPage({ tenantId }: { tenantId: string }) {
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(13);

  // Fetch staff with lastLocation and clocked-in status
  const { data: staffList, isLoading } = useQuery({
    queryKey: ['business-staff-locations', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      
      // 1. Fetch all non-archived staff
      const staffSnap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      const staffDocs = staffSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(s => !s.isArchived);

      // 2. Fetch active sessions (currently clocked in)
      const sessionsQuery = query(
        collection(db, `businesses/${tenantId}/time_sessions`),
        where('status', '==', 'active')
      );
      const sessionsSnap = await getDocs(sessionsQuery);
      const activeSessions = sessionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      // 3. Merge them
      return staffDocs.map(staff => {
        const session = activeSessions.find(sess => sess.userId === staff.userId);
        const isClockedIn = !!session;

        // If clocked in, check if the session itself has coords
        let hasSessionCoords = false;
        let sessionCoords = null;
        if (session?.clockIn?.lat !== undefined && session?.clockIn?.lat !== null) {
          hasSessionCoords = true;
          sessionCoords = {
            lat: session.clockIn.lat,
            lng: session.clockIn.lng,
            accuracy: session.clockIn.accuracy || null,
            type: session.clockIn.type || 'gps',
            action: 'Clocked In',
            updatedAt: session.clockIn.timestamp
          };
        }

        // Determine coordinates to display on map: prefer staff.lastLocation, fallback to active session coords
        const hasStaffCoords = staff.lastLocation && staff.lastLocation.lat !== null && staff.lastLocation.lng !== null;
        const bestCoords = hasStaffCoords ? staff.lastLocation : (hasSessionCoords ? sessionCoords : null);

        return {
          ...staff,
          isClockedIn,
          displayLocation: bestCoords
        };
      }).filter(s => s.isClockedIn || (s.displayLocation && s.displayLocation.lat !== null && s.displayLocation.lng !== null));
    },
    enabled: !!tenantId
  });

  // Automatically center map on first staff location initially
  useEffect(() => {
    const listWithCoords = staffList?.filter((s: any) => s.displayLocation && s.displayLocation.lat !== null && s.displayLocation.lng !== null) || [];
    if (listWithCoords.length > 0) {
      const firstLoc = listWithCoords[0].displayLocation;
      setMapCenter([firstLoc.lat, firstLoc.lng]);
    } else {
      setMapCenter(null);
    }
  }, [staffList]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Staff Locations Map</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Real-time last updated coordinates of clocked-in team members and active tasks.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Side: Staff Directory List */}
        <div className="lg:col-span-1 border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 p-4 shadow-sm flex flex-col max-h-[70vh] overflow-y-auto no-scrollbar">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Staff List</h3>
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-zinc-500 text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
              Loading staff locations...
            </div>
          ) : !staffList || staffList.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 italic py-4">
              No staff members are clocked in or have location updates.
            </p>
          ) : (
            <div className="space-y-2">
              {staffList.map((staff: any) => {
                const hasGPS = staff.displayLocation && staff.displayLocation.lat !== null && staff.displayLocation.lng !== null;
                const locType = staff.displayLocation?.type || 'gps';
                return (
                  <div
                    key={staff.id}
                    onClick={() => {
                      if (hasGPS) {
                        setMapCenter([staff.displayLocation.lat, staff.displayLocation.lng]);
                        setMapZoom(locType === 'ip' ? 12 : 16); // wider view for IP approx location
                      } else {
                        toast.error(`${staff.firstName} ${staff.lastName} has no GPS coordinates recorded.`);
                      }
                    }}
                    className={`p-3 border rounded-xl cursor-pointer transition-all ${
                      hasGPS 
                        ? 'border-zinc-100 dark:border-zinc-800/60 hover:border-zinc-300 dark:hover:border-zinc-750 bg-zinc-50/50 dark:bg-zinc-950/20 hover:bg-zinc-100 dark:hover:bg-zinc-800/40' 
                        : 'border-rose-105 dark:border-rose-950/30 bg-rose-50/10 dark:bg-rose-950/5 hover:bg-rose-50/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-zinc-900 dark:text-white text-sm truncate">
                        {staff.firstName} {staff.lastName}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {staff.isClockedIn && (
                          <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            IN
                          </span>
                        )}
                        {hasGPS ? (
                          locType === 'ip' ? (
                            <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20" title="Approximate location resolved from IP address">
                              IP
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded bg-indigo-500/10 text-indigo-500 border border-indigo-500/20" title="High-accuracy GPS location">
                              GPS
                            </span>
                          )
                        ) : (
                          <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded bg-rose-500/10 text-rose-500 border border-rose-500/20" title="GPS permissions disabled or offline">
                            NO GPS
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-indigo-500 uppercase font-black mt-0.5">
                      {staff.role || 'Staff'} {staff.techNumber ? `• Tech #${staff.techNumber}` : ''}
                    </div>
                    {staff.displayLocation ? (
                      <div className="mt-2 text-xs border-t border-zinc-100 dark:border-zinc-850 pt-2 text-zinc-500 dark:text-zinc-400 space-y-1">
                        <div>
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">Action:</span> {staff.displayLocation.action}
                        </div>
                        <div className="text-[10px] text-zinc-450 dark:text-zinc-400 font-medium">
                          Source: {locType === 'ip' ? 'Approximate (IP Fallback)' : 'Device GPS (High Accuracy)'}
                        </div>
                        <div className="block text-[9px] text-zinc-400 font-mono">
                          {staff.displayLocation.updatedAt?.toDate 
                            ? staff.displayLocation.updatedAt.toDate().toLocaleString() 
                            : new Date(staff.displayLocation.updatedAt).toLocaleString()}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] text-rose-500/80 italic">
                        No location data received. Ensure browser GPS permission is enabled.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Map Container */}
        <div className="lg:col-span-3 border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm overflow-hidden h-[70vh] relative z-0">
          {mapCenter ? (
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              className="w-full h-full"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {staffList?.filter((s: any) => s.displayLocation && s.displayLocation.lat !== null && s.displayLocation.lng !== null).map((staff: any) => (
                <Marker
                  key={staff.id}
                  position={[staff.displayLocation.lat, staff.displayLocation.lng]}
                  icon={staffMarkerIcon}
                >
                  <Popup>
                    <div className="text-zinc-900 p-1">
                      <h4 className="font-bold text-sm">{staff.firstName} {staff.lastName}</h4>
                      <p className="text-[10px] text-indigo-650 font-black uppercase mt-0.5">
                        {staff.role || 'Staff'} {staff.techNumber ? `• Tech #${staff.techNumber}` : ''}
                      </p>
                      <div className="mt-2 text-xs border-t border-zinc-100 pt-1.5 space-y-1">
                        <p><strong>Last Action:</strong> {staff.displayLocation.action}</p>
                        <p><strong>Source:</strong> {staff.displayLocation.type === 'ip' ? 'IP Address (Approximate)' : 'GPS Device (High Accuracy)'}</p>
                        <p>
                          <strong>Time:</strong>{' '}
                          {staff.displayLocation.updatedAt?.toDate 
                            ? staff.displayLocation.updatedAt.toDate().toLocaleString() 
                            : new Date(staff.displayLocation.updatedAt).toLocaleString()}
                        </p>
                        {staff.displayLocation.accuracy && (
                          <p className="text-[10px] text-zinc-400">
                            <strong>Accuracy:</strong> ±{Math.round(staff.displayLocation.accuracy)}m
                          </p>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
              <MapController center={mapCenter} zoom={mapZoom} />
            </MapContainer>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center text-zinc-400 bg-zinc-50 dark:bg-zinc-950/20">
              <Map className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-4" />
              <p className="text-sm">No locations available to display on the map.</p>
              <p className="text-xs text-zinc-500 mt-1">Wait for staff to clock in/out or perform activities with GPS active.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
