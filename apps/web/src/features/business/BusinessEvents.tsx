import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, addDoc, query, orderBy, deleteDoc, doc, updateDoc, getDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { MapPin, Plus, ArrowLeft, Calendar, Map, Car, Hotel, Ticket, Info, Map as MapIcon, Star, ExternalLink, Trash2, Edit2, Save, X, Tag } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useAuthStore } from '../../lib/auth/store';
import { useLocationStore } from '../../lib/store/locationStore';

// Custom icons to avoid Leaflet default marker issues in React
const eventIcon = L.divIcon({
  className: 'custom-event-icon',
  html: `<div style="background-color: #4f46e5; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

const userPingIcon = L.divIcon({
  className: 'custom-user-icon',
  html: `<div style="background-color: #ec4899; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const poiIcon = L.divIcon({
  className: 'custom-poi-icon',
  html: `<div style="background-color: #f59e0b; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

function MapClickHandler({ isTagging, onTag }: { isTagging: boolean, onTag: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (isTagging) {
        onTag(e.latlng.lat, e.latlng.lng);
      }
    }
  });
  return null;
}

export function BusinessEvents({ tenantId, eventId }: { tenantId: string, eventId: string | null }) {
  const navigate = useNavigate();
  const selectedEventId = eventId;
  const setSelectedEventId = (id: string | null) => {
    navigate(id ? `/business/${tenantId}/events/${id}` : `/business/${tenantId}/events`);
  };
  
  const { user } = useAuthStore();
  const { isSharing: isGlobalSharing, targetEventId, startSharing, stopSharing } = useLocationStore();
  const [isEditing, setIsEditing] = useState(false);
  const [isTagging, setIsTagging] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  const isSharingThisEvent = isGlobalSharing && targetEventId === selectedEventId;

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile', user?.uid],
    queryFn: async () => {
      if (!user?.uid) return null;
      const snap = await getDoc(doc(db, 'users', user.uid));
      return snap.exists() ? snap.data() : null;
    },
    enabled: !!user?.uid
  });

  const { data: events, isLoading, refetch } = useQuery({
    queryKey: ['business-events', tenantId],
    queryFn: async () => {
      const q = query(collection(db, `businesses/${tenantId}/business_events`), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    enabled: !!tenantId && tenantId !== 'GLOBAL'
  });

  const toggleLocationSharing = (targetEventId: string) => {
    if (isGlobalSharing) {
      stopSharing();
    } else {
      startSharing(targetEventId);
    }
  };

  const handleMapTagClick = async (lat: number, lng: number) => {
    const tagName = prompt('What is this location? (e.g. Main Entrance, Food Stall)');
    if (tagName && selectedEventId) {
      const selectedEvent = events?.find(e => e.id === selectedEventId);
      if (selectedEvent) {
        const currentPois = selectedEvent.pois || [];
        await updateDoc(doc(db, `businesses/${tenantId}/business_events`, selectedEventId), {
          pois: [...currentPois, { name: tagName, lat, lng, createdAt: new Date().toISOString() }]
        });
        setIsTagging(false);
        refetch();
      }
    } else {
      setIsTagging(false);
    }
  };

  const handleDeleteEvent = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this event? This cannot be undone.')) {
      await deleteDoc(doc(db, `businesses/${tenantId}/business_events`, id));
      if (selectedEventId === id) setSelectedEventId(null);
      refetch();
    }
  };

  const handleStartEdit = (event: any) => {
    setEditForm({ ...event });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedEventId || !tenantId || tenantId === 'GLOBAL') return;
    
    // Clean up before saving to avoid writing 'id' inside the doc
    const dataToSave = { ...editForm };
    delete dataToSave.id;

    await updateDoc(doc(db, `businesses/${tenantId}/business_events`, selectedEventId), dataToSave);
    setIsEditing(false);
    refetch();
  };

  const handleAddDemoEvent = async () => {
    if (!tenantId || tenantId === 'GLOBAL') return;
    await addDoc(collection(db, `businesses/${tenantId}/business_events`), {
      name: 'NHRA Route 66 Nationals',
      location: 'Route 66 Raceway, Joliet, IL',
      lat: 41.4641,
      lng: -88.0751,
      date: 'May 16th',
      passes: 'General Passes & Snap-on Hospitality Guest Passes',
      parking: 'General parking is free. Expect traffic at I-80/Route 53 interchange; use Briggs St. exit and Laraway Rd. as an alternate route.',
      hotels: 'Near track: Hampton Inn (I-80/I-55), Wingate by Wyndham, Red Roof Inn. Race View Farms offers adjacent camping.',
      vendors: 'NHRA Nitro Alley features sponsor displays, interactive activities, and merch. Open pit access allows close-up views of the 10,000-hp machines.',
      entertainment: 'Pit access is the main attraction. Download the NASCAR Tracks app for live schedules and updates.',
      viewingTips: 'Best seats: ~200ft down-track from the starting line for the best view of the launch and Christmas Tree. Grandstands are slightly splayed for good finish line angles.',
      maps: 'Download NASCAR Tracks app or visit route66raceway.com for official pit and track maps.',
      sourceLinks: [
        { title: 'Route 66 Raceway Official Site', url: 'https://www.route66raceway.com/' },
        { title: 'NHRA Event Details', url: 'https://www.nhra.com/' },
        { title: 'Nearby Hotels (Expedia)', url: 'https://www.expedia.com/Hotel-Search?destination=Joliet%2C+Illinois' }
      ],
      pois: [
        { name: 'Snap-on Hospitality Tent', lat: 41.4650, lng: -88.0760, createdAt: new Date().toISOString() },
        { name: 'Nitro Alley Main Entrance', lat: 41.4630, lng: -88.0740, createdAt: new Date().toISOString() }
      ],
      createdAt: new Date().toISOString()
    });
    refetch();
  };

  if (isLoading) {
    return <div className="p-16 flex items-center justify-center text-zinc-500 animate-pulse">Loading events...</div>;
  }

  const selectedEvent = events?.find(e => e.id === selectedEventId);

  if (selectedEvent) {
    const pings = events?.filter(e => e.eventId === selectedEvent.id && e.name === '📍 Staff Location Ping') || [];
    
    // Only show active pings (updated within the last 5 minutes)
    const now = new Date().getTime();
    const activePings = pings.filter(ping => {
      if (!ping.createdAt) return false;
      const pingTime = new Date(ping.createdAt).getTime();
      return (now - pingTime) < 5 * 60 * 1000;
    });

    const eventHasCoords = selectedEvent.lat && selectedEvent.lng;
    const pois = selectedEvent.pois || [];

    return (
      <div className="animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={() => { setSelectedEventId(null); setIsEditing(false); setIsTagging(false); }}
            className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors py-3 pr-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Events
          </button>
          
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="flex items-center gap-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-5 py-3 rounded-xl text-sm font-semibold transition-colors"
                >
                  <X className="w-5 h-5" /> Cancel
                </button>
                <button 
                  onClick={handleSaveEdit}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-colors"
                >
                  <Save className="w-5 h-5" /> Save Changes
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => handleStartEdit(selectedEvent)}
                  className="flex items-center gap-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-5 py-3 rounded-xl text-sm font-semibold transition-colors"
                >
                  <Edit2 className="w-5 h-5" /> Edit Event
                </button>
                <button 
                  onClick={(e) => handleDeleteEvent(selectedEvent.id, e)}
                  className="flex items-center gap-2 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-500/10 dark:hover:bg-red-500/20 dark:text-red-400 px-5 py-3 rounded-xl text-sm font-semibold transition-colors"
                >
                  <Trash2 className="w-5 h-5" /> Delete
                </button>
              </>
            )}
          </div>
        </div>

        {/* ... (Edit Form Block) ... */}
        {isEditing ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden mb-8 p-8">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6">Edit Event Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Event Name</label>
                <input 
                  type="text" 
                  value={editForm.name || ''} 
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Date</label>
                <input 
                  type="text" 
                  value={editForm.date || ''} 
                  onChange={(e) => setEditForm({...editForm, date: e.target.value})}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Location</label>
                <input 
                  type="text" 
                  value={editForm.location || ''} 
                  onChange={(e) => setEditForm({...editForm, location: e.target.value})}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div className="space-y-2 flex gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Latitude</label>
                  <input 
                    type="number" 
                    value={editForm.lat || ''} 
                    onChange={(e) => setEditForm({...editForm, lat: parseFloat(e.target.value)})}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Longitude</label>
                  <input 
                    type="number" 
                    value={editForm.lng || ''} 
                    onChange={(e) => setEditForm({...editForm, lng: parseFloat(e.target.value)})}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>
              <div className="space-y-2 col-span-full">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Passes & Tickets</label>
                <textarea 
                  value={editForm.passes || ''} 
                  onChange={(e) => setEditForm({...editForm, passes: e.target.value})}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div className="space-y-2 col-span-full">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Parking & Transit</label>
                <textarea 
                  value={editForm.parking || ''} 
                  onChange={(e) => setEditForm({...editForm, parking: e.target.value})}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div className="space-y-2 col-span-full">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Hotels & Lodging</label>
                <textarea 
                  value={editForm.hotels || ''} 
                  onChange={(e) => setEditForm({...editForm, hotels: e.target.value})}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div className="space-y-2 col-span-full">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Vendors & Activities</label>
                <textarea 
                  value={editForm.vendors || ''} 
                  onChange={(e) => setEditForm({...editForm, vendors: e.target.value})}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden mb-8">
            <div className="p-8 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                    Company Outing
                  </span>
                  {selectedEvent.date && <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1"><Calendar className="w-3 h-3" /> {selectedEvent.date}</span>}
                </div>
                <h2 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">{selectedEvent.name}</h2>
                <p className="text-zinc-500 dark:text-zinc-400 mt-2 flex items-center gap-1">
                  <MapPin className="w-4 h-4" /> {selectedEvent.location || 'Location TBA'}
                </p>
              </div>
              <button 
                onClick={() => toggleLocationSharing(selectedEvent.id)}
                className={`flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-base font-bold transition-all shadow-md shrink-0 ${
                  isSharingThisEvent 
                    ? 'bg-rose-500 text-white active:bg-rose-600 active:shadow-sm' 
                    : 'bg-indigo-600 text-white active:bg-indigo-700 active:shadow-sm'
                }`}
              >
                <MapPin className={`w-6 h-6 ${isSharingThisEvent ? 'animate-pulse' : ''}`} />
                {isSharingThisEvent ? 'Stop Sharing Location' : 'Share Live Location'}
              </button>
            </div>

            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 bg-zinc-50/50 dark:bg-zinc-900/50">
              {selectedEvent.passes && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Ticket className="w-4 h-4 text-indigo-500" /> Passes & Tickets
                  </h3>
                  <p className="text-zinc-600 dark:text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{selectedEvent.passes}</p>
                </div>
              )}
              
              {selectedEvent.parking && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Car className="w-4 h-4 text-amber-500" /> Parking & Transit
                  </h3>
                  <p className="text-zinc-600 dark:text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{selectedEvent.parking}</p>
                </div>
              )}

              {selectedEvent.hotels && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Hotel className="w-4 h-4 text-emerald-500" /> Hotels & Lodging
                  </h3>
                  <p className="text-zinc-600 dark:text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{selectedEvent.hotels}</p>
                </div>
              )}

              {selectedEvent.vendors && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-500" /> Vendors & Activities
                  </h3>
                  <p className="text-zinc-600 dark:text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{selectedEvent.vendors}</p>
                </div>
              )}

              {selectedEvent.viewingTips && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Star className="w-4 h-4 text-purple-500" /> Viewing Tips
                  </h3>
                  <p className="text-zinc-600 dark:text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{selectedEvent.viewingTips}</p>
                </div>
              )}

              {selectedEvent.maps && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <MapIcon className="w-4 h-4 text-rose-500" /> Maps & Routing
                  </h3>
                  <p className="text-zinc-600 dark:text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{selectedEvent.maps}</p>
                </div>
              )}
            </div>
            
            {selectedEvent.sourceLinks && selectedEvent.sourceLinks.length > 0 && (
              <div className="p-8 border-t border-zinc-200 dark:border-zinc-800">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-4">Official Sources</h3>
                <div className="flex flex-wrap gap-3">
                  {selectedEvent.sourceLinks.map((link: any, i: number) => (
                    <a 
                      key={i} 
                      href={link.url} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center gap-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-3 rounded-xl text-sm font-bold transition-colors"
                    >
                      {link.title} <ExternalLink className="w-4 h-4" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Live Aerial Map Integration */}
        {!isEditing && eventHasCoords && (
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Live Aerial Map</h3>
              <button
                onClick={() => setIsTagging(!isTagging)}
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  isTagging 
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 ring-2 ring-amber-500' 
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }`}
              >
                <Tag className="w-4 h-4" />
                {isTagging ? 'Click Map to Tag Location...' : 'Add Map Tag'}
              </button>
            </div>
            
            <div className={`h-[500px] w-full rounded-2xl overflow-hidden border-2 shadow-sm relative z-0 transition-colors ${isTagging ? 'border-amber-500 cursor-crosshair' : 'border-zinc-200 dark:border-zinc-800'}`}>
              <MapContainer 
                center={[selectedEvent.lat, selectedEvent.lng]} 
                zoom={16} 
                scrollWheelZoom={false} 
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
                
                <MapClickHandler isTagging={isTagging} onTag={handleMapTagClick} />

                {/* Main Event Marker */}
                <Marker position={[selectedEvent.lat, selectedEvent.lng]} icon={eventIcon}>
                  <Popup>
                    <strong>{selectedEvent.name}</strong><br/>
                    {selectedEvent.location}
                  </Popup>
                </Marker>

                {/* Tagged POI Markers */}
                {pois.map((poi: any, i: number) => (
                  <Marker key={i} position={[poi.lat, poi.lng]} icon={poiIcon}>
                    <Popup>
                      <strong>{poi.name}</strong><br/>
                      Point of Interest
                    </Popup>
                  </Marker>
                ))}

                {/* Staff Ping Markers */}
                {activePings.map(ping => (
                  ping.lat && ping.lng ? (
                    <Marker key={ping.id} position={[ping.lat, ping.lng]} icon={userPingIcon}>
                      <Popup>
                        <strong>{ping.userName || 'Staff Member'}</strong><br/>
                        Updated: {new Date(ping.createdAt).toLocaleTimeString()}
                      </Popup>
                    </Marker>
                  ) : null
                ))}
              </MapContainer>
            </div>
          </div>
        )}

        {/* Location Pings */}
        {!isEditing && (
          <div className="mt-8">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Location Pings Feed</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {activePings.length === 0 && (
                <p className="text-zinc-500 dark:text-zinc-400 text-sm col-span-full">No active locations being shared right now.</p>
              )}
              {activePings.map(ping => (
                <div key={ping.id} className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm flex flex-col">
                  {ping.lat && ping.lng ? (
                    <div className="h-32 w-full bg-zinc-100 dark:bg-zinc-900 relative z-0 border-b border-zinc-200 dark:border-zinc-700">
                      <MapContainer 
                        center={[ping.lat, ping.lng]} 
                        zoom={18} 
                        scrollWheelZoom={false} 
                        zoomControl={false}
                        dragging={false}
                        style={{ height: '100%', width: '100%' }}
                      >
                        <TileLayer
                          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        />
                        <Marker position={[ping.lat, ping.lng]} icon={userPingIcon} />
                      </MapContainer>
                    </div>
                  ) : (
                    <div className="h-32 w-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center border-b border-zinc-200 dark:border-zinc-700">
                      <span className="text-xs text-zinc-400 font-mono">No GPS Data</span>
                    </div>
                  )}
                  
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-full bg-pink-100 dark:bg-pink-500/20 flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{ping.userName || 'Staff Member'}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">Updated {new Date(ping.createdAt).toLocaleTimeString()}</p>
                      </div>
                    </div>
                    {ping.notes && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900/50 p-2 rounded-md mt-3 border border-zinc-100 dark:border-zinc-800 truncate">
                        {ping.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Business Events & Outings</h2>
        <button 
          onClick={handleAddDemoEvent}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Add Demo Event
        </button>
      </div>

      {!events || events.filter(e => !e.eventId).length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-16 shadow-sm flex flex-col items-center justify-center text-center">
          <Map className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-4" />
          <p className="text-zinc-500 dark:text-zinc-400 font-medium text-lg">No events scheduled yet.</p>
          <p className="text-zinc-400 dark:text-zinc-500 mt-2 text-sm">Add a demo event to see the new details page.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.filter(e => !e.eventId).map(event => (
            <div 
              key={event.id}
              onClick={() => setSelectedEventId(event.id)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm hover:border-indigo-500 transition-all cursor-pointer flex flex-col relative group"
            >
              <button 
                onClick={(e) => handleDeleteEvent(event.id, e)}
                className="absolute top-4 right-4 text-red-500 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-full p-2.5 transition-colors"
                title="Delete Event"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              
              <div className="flex items-center gap-2 mb-3 mt-2">
                <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 text-xs font-semibold px-3 py-1 rounded-full">
                  Company Outing
                </span>
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white transition-colors pr-10">{event.name}</h3>
              {event.date && (
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> {event.date}
                </p>
              )}
              {event.location && (
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-2 flex items-center gap-2 truncate">
                  <MapPin className="w-4 h-4 shrink-0" /> {event.location}
                </p>
              )}
              <div className="mt-auto pt-6 flex justify-end">
                <span className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-transform group-hover:translate-x-1">
                  View Details &rarr;
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
