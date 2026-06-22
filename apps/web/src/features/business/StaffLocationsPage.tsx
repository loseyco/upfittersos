import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Map, Loader2 } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

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

  // Fetch staff with lastLocation
  const { data: staffLocations, isLoading } = useQuery({
    queryKey: ['business-staff-locations', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      return snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(s => !s.isArchived && s.lastLocation && s.lastLocation.lat !== null && s.lastLocation.lng !== null);
    },
    enabled: !!tenantId
  });

  // Automatically center map on first staff location initially
  useEffect(() => {
    if (staffLocations && staffLocations.length > 0) {
      const firstLoc = staffLocations[0].lastLocation;
      setMapCenter([firstLoc.lat, firstLoc.lng]);
    } else {
      setMapCenter(null);
    }
  }, [staffLocations]);

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
          ) : !staffLocations || staffLocations.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 italic py-4">
              No staff members have location updates yet.
            </p>
          ) : (
            <div className="space-y-2">
              {staffLocations.map((staff: any) => (
                <div
                  key={staff.id}
                  onClick={() => {
                    if (staff.lastLocation) {
                      setMapCenter([staff.lastLocation.lat, staff.lastLocation.lng]);
                      setMapZoom(16);
                    }
                  }}
                  className="p-3 border border-zinc-100 dark:border-zinc-800/60 hover:border-zinc-300 dark:hover:border-zinc-750 bg-zinc-50/50 dark:bg-zinc-950/20 hover:bg-zinc-100 dark:hover:bg-zinc-800/40 rounded-xl cursor-pointer transition-all"
                >
                  <div className="font-semibold text-zinc-900 dark:text-white text-sm">
                    {staff.firstName} {staff.lastName}
                  </div>
                  <div className="text-[10px] text-indigo-500 uppercase font-black mt-0.5">
                    {staff.role || 'Staff'} {staff.techNumber ? `• Tech #${staff.techNumber}` : ''}
                  </div>
                  {staff.lastLocation && (
                    <div className="mt-2 text-xs border-t border-zinc-100 dark:border-zinc-850 pt-2 text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">Action:</span> {staff.lastLocation.action}
                      <span className="block text-[9px] text-zinc-400 font-mono mt-1">
                        {staff.lastLocation.updatedAt?.toDate 
                          ? staff.lastLocation.updatedAt.toDate().toLocaleString() 
                          : new Date(staff.lastLocation.updatedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              ))}
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
              {staffLocations?.map((staff: any) => (
                <Marker
                  key={staff.id}
                  position={[staff.lastLocation.lat, staff.lastLocation.lng]}
                  icon={staffMarkerIcon}
                >
                  <Popup>
                    <div className="text-zinc-900 p-1">
                      <h4 className="font-bold text-sm">{staff.firstName} {staff.lastName}</h4>
                      <p className="text-[10px] text-indigo-650 font-black uppercase mt-0.5">
                        {staff.role || 'Staff'} {staff.techNumber ? `• Tech #${staff.techNumber}` : ''}
                      </p>
                      <div className="mt-2 text-xs border-t border-zinc-100 pt-1.5 space-y-1">
                        <p><strong>Last Action:</strong> {staff.lastLocation.action}</p>
                        <p>
                          <strong>Time:</strong>{' '}
                          {staff.lastLocation.updatedAt?.toDate 
                            ? staff.lastLocation.updatedAt.toDate().toLocaleString() 
                            : new Date(staff.lastLocation.updatedAt).toLocaleString()}
                        </p>
                        {staff.lastLocation.accuracy && (
                          <p className="text-[10px] text-zinc-400">
                            <strong>Accuracy:</strong> ±{Math.round(staff.lastLocation.accuracy)}m
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
