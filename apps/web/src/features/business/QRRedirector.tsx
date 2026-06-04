import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth/store';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, serverTimestamp, collectionGroup, query, where, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  QrCode, Car, Briefcase, Search, Check, 
  Loader2, ArrowRight, Link2
} from 'lucide-react';
import { toast } from 'sonner';

type LinkType = 'vehicle' | 'job' | 'url';

// Geofence calculation helper using Haversine formula
function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180; // φ, λ in radians
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in meters
}

export function QRRedirector() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, tenantId, loading: authLoading } = useAuthStore();

  const scanLoggedRef = useRef(false);

  const logScan = async (
    scanTenantId: string,
    targetType: string,
    targetId: string,
    targetLabel: string,
    scannedStickerId?: string
  ) => {
    if (scanLoggedRef.current) return;
    scanLoggedRef.current = true;

    // 1. Client-side User Agent, Referrer info
    const ua = navigator.userAgent;
    let deviceType = 'desktop';
    if (/tablet|ipad|playbook|silk/i.test(ua.toLowerCase())) {
      deviceType = 'tablet';
    } else if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua.toLowerCase())) {
      deviceType = 'mobile';
    }

    let browser = 'Other';
    if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';
    else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';

    let os = 'Other';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('Linux')) os = 'Linux';

    // 2. Fetch IP and Geolocation
    let ip = '';
    let geo: any = {};
    try {
      const res = await fetch('https://freeipapi.com/api/json');
      if (res.ok) {
        const data = await res.json();
        ip = data.ipAddress || '';
        geo = {
          city: data.cityName || '',
          region: data.regionName || '',
          country: data.countryName || '',
          latitude: data.latitude || null,
          longitude: data.longitude || null
        };
      }
    } catch (err) {
      console.warn('Silent IP geo-lookup failed:', err);
    }

    // 3. Determine if "In-House" or "In the Wild"
    let locationType: 'in_house' | 'in_the_wild' = 'in_the_wild';
    
    // Try fetching business settings for geofence if we have scanTenantId
    let siteLat = '';
    let siteLng = '';
    let siteRadius = 500;
    try {
      const bizDoc = await getDoc(doc(db, 'businesses', scanTenantId));
      if (bizDoc.exists()) {
        const bizData = bizDoc.data();
        siteLat = bizData.siteLat || '';
        siteLng = bizData.siteLng || '';
        siteRadius = parseInt(bizData.siteRadius, 10) || 500;
      }
    } catch (e) {
      console.warn('Failed to fetch business geofence:', e);
    }

    if (user && tenantId === scanTenantId) {
      // Logged in staff members are in_house
      locationType = 'in_house';
    } else if (geo.latitude && geo.longitude && siteLat && siteLng) {
      const distance = getDistanceInMeters(
        geo.latitude,
        geo.longitude,
        parseFloat(siteLat),
        parseFloat(siteLng)
      );
      if (distance <= siteRadius) {
        locationType = 'in_house';
      }
    }

    // 4. User details
    const scanUser = user ? {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || 'Staff'
    } : null;

    // 5. Write log to Firestore
    try {
      await addDoc(collection(db, `businesses/${scanTenantId}/qr_scans`), {
        stickerId: scannedStickerId || null,
        targetType,
        targetId,
        targetLabel,
        tenantId: scanTenantId,
        scannedAt: serverTimestamp(),
        user: scanUser,
        isStaff: !!user && tenantId === scanTenantId,
        userAgent: ua,
        referrer: document.referrer || 'Direct Scan',
        deviceType,
        browser,
        os,
        locationType,
        ip,
        geo
      });
    } catch (err) {
      console.error('Failed to log QR scan:', err);
    }
  };

  // Route Parameters
  const t = searchParams.get('t'); // Tenant ID
  const sid = searchParams.get('sid'); // Pre-printed Sticker ID (e.g. UPFT-1001)
  
  // Legacy query parameters (direct links)
  const v = searchParams.get('v'); // Direct VIN
  const j = searchParams.get('j'); // Direct Job ID
  const p = searchParams.get('p'); // Direct Part ID

  // Component States
  const [resolving, setResolving] = useState(true);
  const [assignedTarget, setAssignedTarget] = useState<any>(null);
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(null);
  
  // Assignment form states
  const [linkType, setLinkType] = useState<LinkType>('vehicle');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isLinking, setIsLinking] = useState(false);

  // Firestore collections loaded for searching
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loadingSearchData, setLoadingSearchData] = useState(false);

  // Check Sticker Status
  useEffect(() => {
    if (authLoading) return;

    const currentPath = window.location.pathname + window.location.search;
    const targetTenant = t || tenantId;

    // Helper to trigger direct redirects with logging
    const handleDirectRedirect = async (type: string, id: string, label: string, path: string) => {
      if (targetTenant) {
        await logScan(targetTenant, type, id, label);
      }
      if (!user) {
        localStorage.setItem('pendingQrRedirect', currentPath);
        navigate('/login');
      } else {
        navigate(path);
      }
    };

    // If direct legacy parameters are present, handle them immediately (backwards compatibility)
    if (v) {
      handleDirectRedirect(
        'vehicle',
        v,
        `VIN: ${v}`,
        `/business/${targetTenant}/vehicles?vin=${encodeURIComponent(v)}`
      );
      return;
    }
    if (j) {
      // Fetch job details first to log a beautiful title if possible
      (async () => {
        let label = `Job ID: ${j}`;
        if (targetTenant) {
          try {
            const jobSnap = await getDoc(doc(db, `businesses/${targetTenant}/jobs`, j));
            if (jobSnap.exists()) {
              const data = jobSnap.data();
              label = data.jobNumber ? `Job #${data.jobNumber} - ${data.title}` : data.title;
            }
          } catch (e) {
            console.warn("Failed to fetch job details for direct link scan logging:", e);
          }
        }
        await handleDirectRedirect(
          'job',
          j,
          label,
          `/business/${targetTenant}/job/${j}`
        );
      })();
      return;
    }
    if (p) {
      handleDirectRedirect(
        'part',
        p,
        `Part Query: ${p}`,
        `/business/${targetTenant}/items?search=${encodeURIComponent(p)}`
      );
      return;
    }

    // Resolve unassigned Sticker ID
    if (sid) {
      setResolving(true);
      const fallbackTenant = tenantId || t;

      const processStickerData = async (data: any, computedTenantId: string) => {
        setResolvedTenantId(computedTenantId);
        
        if (data?.assignedTo) {
          setAssignedTarget(data.assignedTo);
          
          // Log scan
          await logScan(
            computedTenantId,
            data.assignedTo.type,
            data.assignedTo.id,
            data.assignedTo.label || `${data.assignedTo.type}: ${data.assignedTo.id}`,
            sid
          );

          // Handle redirects
          if (data.assignedTo.type === 'url') {
            const url = data.assignedTo.id.startsWith('http') ? data.assignedTo.id : `https://${data.assignedTo.id}`;
            window.location.href = url;
          } else if (data.assignedTo.type === 'vehicle') {
            if (!user) {
              localStorage.setItem('pendingQrRedirect', currentPath);
              navigate('/login');
            } else {
              navigate(`/business/${computedTenantId}/vehicles?vin=${encodeURIComponent(data.assignedTo.id)}`);
            }
          } else if (data.assignedTo.type === 'job') {
            if (!user) {
              localStorage.setItem('pendingQrRedirect', currentPath);
              navigate('/login');
            } else {
              navigate(`/business/${computedTenantId}/job/${data.assignedTo.id}`);
            }
          }
          return true;
        }

        // Unassigned sticker scanned
        await logScan(
          computedTenantId,
          'unassigned',
          sid,
          `Unassigned Sticker ${sid}`,
          sid
        );

        if (!user) {
          localStorage.setItem('pendingQrRedirect', currentPath);
          navigate('/login');
          return false;
        }

        setResolving(false);
        loadSearchLists(computedTenantId);
        return false;
      };

      const handleFallback = async () => {
        if (fallbackTenant) {
          setResolvedTenantId(fallbackTenant);
          
          await logScan(
            fallbackTenant,
            'unassigned',
            sid,
            `Unassigned/Fallback Sticker ${sid}`,
            sid
          );

          if (!user) {
            localStorage.setItem('pendingQrRedirect', currentPath);
            navigate('/login');
            return;
          }

          setResolving(false);
          loadSearchLists(fallbackTenant);
        } else {
          toast.error("Sticker not registered in the database.");
          setResolving(false);
        }
      };

      // 1. Try direct lookup first (Faster, bypasses collection group permission constraints)
      if (fallbackTenant) {
        const directStickerRef = doc(db, `businesses/${fallbackTenant}/qr_stickers`, sid);
        getDoc(directStickerRef).then((snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const computedTenantId = data.tenantId || fallbackTenant;
            processStickerData(data, computedTenantId);
          } else {
            // Try collectionGroup query as secondary fallback
            const stickersQuery = query(collectionGroup(db, 'qr_stickers'), where('id', '==', sid));
            getDocs(stickersQuery).then((groupSnap) => {
              if (!groupSnap.empty) {
                const stickerDoc = groupSnap.docs[0];
                const data = stickerDoc.data();
                const computedTenantId = data.tenantId || stickerDoc.ref.parent.parent?.id || fallbackTenant;
                processStickerData(data, computedTenantId);
              } else {
                handleFallback();
              }
            }).catch((err) => {
              console.warn("Secondary collectionGroup query lookup skipped:", err);
              handleFallback();
            });
          }
        }).catch((err) => {
          console.error("Direct sticker lookup error, falling back:", err);
          handleFallback();
        });
      } else {
        handleFallback();
      }
    } else {
      // Fallback if no params are supplied
      if (targetTenant) {
        navigate(`/business/${targetTenant}/overview`);
      } else {
        navigate('/login');
      }
    }
  }, [user, tenantId, authLoading, sid, t, v, j, p, navigate]);

  // Load vehicles and jobs collections for real-time search autocompletion
  const loadSearchLists = async (targetTenant: string) => {
    if (!targetTenant) return;
    setLoadingSearchData(true);
    try {
      // Load Vehicles
      const vehSnap = await getDocs(collection(db, `businesses/${targetTenant}/vehicles`));
      const vehs = vehSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((item: any) => !item.isArchived);
      setVehicles(vehs);

      // Load Jobs
      const jobSnap = await getDocs(collection(db, `businesses/${targetTenant}/jobs`));
      const jbs = jobSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((item: any) => item.status !== 'Closed' && item.status !== 'Completed');
      setJobs(jbs);
    } catch (e) {
      console.error("Error loading registry collections for QR assignment:", e);
      toast.error("Failed to load database index. Please reload.");
    } finally {
      setLoadingSearchData(false);
    }
  };

  // Get matching results based on search filter
  const getFilteredItems = () => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    if (linkType === 'vehicle') {
      return vehicles.filter(veh => 
        (veh.vin || '').toLowerCase().includes(query) ||
        (veh.make || '').toLowerCase().includes(query) ||
        (veh.model || '').toLowerCase().includes(query) ||
        String(veh.year || '').toLowerCase().includes(query) ||
        (veh.customerName || '').toLowerCase().includes(query)
      ).slice(0, 5); // Return top 5 matches
    } else {
      return jobs.filter(job => 
        String(job.jobNumber || '').toLowerCase().includes(query) ||
        (job.title || '').toLowerCase().includes(query) ||
        (job.customerName || '').toLowerCase().includes(query)
      ).slice(0, 5);
    }
  };

  const matches = getFilteredItems();

  // Commit Assignment link to Firestore
  const handleAssign = async () => {
    const targetTenant = resolvedTenantId || tenantId;
    if (!targetTenant || !sid || !selectedItem || !user) return;
    
    setIsLinking(true);
    const stickerRef = doc(db, `businesses/${targetTenant}/qr_stickers`, sid);

    let labelText = '';
    if (linkType === 'vehicle') {
      labelText = `${selectedItem.year || ''} ${selectedItem.make || ''} ${selectedItem.model || 'Vehicle'} (VIN: ${selectedItem.vin || selectedItem.id})`;
    } else if (linkType === 'job') {
      labelText = selectedItem.jobNumber ? `Job #${selectedItem.jobNumber} - ${selectedItem.title}` : selectedItem.title;
    } else {
      labelText = `Custom Link: ${selectedItem.id}`;
    }

    try {
      // 1. Create/Update sticker mapping
      await setDoc(stickerRef, {
        id: sid,
        tenantId: targetTenant,
        assignedTo: {
          type: linkType,
          id: selectedItem.id,
          label: labelText
        },
        assignedAt: serverTimestamp(),
        assignedBy: user.uid,
        assignedByName: user.displayName || user.email || 'Technician'
      });

      // 2. Link sticker ID inside the target document (Vehicle or Job)
      if (linkType === 'vehicle') {
        const vehRef = doc(db, `businesses/${targetTenant}/vehicles`, selectedItem.id);
        await updateDoc(vehRef, { qrStickerId: sid });
      } else if (linkType === 'job') {
        const jobRef = doc(db, `businesses/${targetTenant}/jobs`, selectedItem.id);
        await updateDoc(jobRef, { qrStickerId: sid });
      }

      toast.success(`Sticker ${sid} successfully linked!`);
      
      // 3. Open newly linked page
      if (linkType === 'vehicle') {
        navigate(`/business/${targetTenant}/vehicles?vin=${encodeURIComponent(selectedItem.vin || selectedItem.id)}`);
      } else if (linkType === 'job') {
        navigate(`/business/${targetTenant}/job/${selectedItem.id}`);
      } else {
        window.location.href = selectedItem.id.startsWith('http') ? selectedItem.id : `https://${selectedItem.id}`;
      }
    } catch (err: any) {
      console.error("Failed to link sticker:", err);
      toast.error(`Assignment failed: ${err.message}`);
    } finally {
      setIsLinking(false);
    }
  };

  // If redirecting resolved target
  if (resolving || assignedTarget) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center p-4 select-none relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] mix-blend-screen" />
          <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[150px] mix-blend-screen" />
        </div>

        <div className="relative z-10 w-full max-w-sm text-center bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="relative inline-flex items-center justify-center p-5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl animate-pulse">
            <QrCode className="w-10 h-10" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl font-bold tracking-tight text-white">UpfittersOS QR</h2>
            <p className="text-zinc-400 text-xs font-semibold tracking-wider uppercase">Secure Dynamic Redirector</p>
          </div>

          <div className="flex items-center justify-center gap-3 px-4 py-3 bg-zinc-950/40 rounded-xl border border-zinc-800/40">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
            <span className="text-sm font-semibold text-zinc-300">Resolving target record...</span>
          </div>

          <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">
            Checking assignments for Sticker: {sid || 'Direct Link'}
          </p>
        </div>
      </div>
    );
  }

  // Render Sticker Assignment UI
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Background Gradients */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[150px] mix-blend-screen" />
      </div>

      <div className="relative z-10 w-full max-w-md bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col gap-6">
        
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-zinc-800/60 pb-5">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20">
            <QrCode className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 text-[10px] font-black uppercase tracking-wider rounded-md">
                Unassigned QR
              </span>
            </div>
            <h3 className="font-black text-white text-lg mt-1">Sticker ID: <span className="font-mono text-indigo-400">{sid}</span></h3>
          </div>
        </div>

        {/* Form Selector */}
        <div className="space-y-4">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Assign Sticker To:</p>
          <div className="grid grid-cols-3 gap-2 bg-zinc-950/40 p-1 rounded-xl border border-zinc-800/40">
            <button
              onClick={() => {
                setLinkType('vehicle');
                setSearchQuery('');
                setSelectedItem(null);
              }}
              className={`flex items-center justify-center gap-1 py-2.5 rounded-lg text-[10px] font-bold transition-all ${
                linkType === 'vehicle'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Car className="w-3 h-3 shrink-0" />
              Vehicle
            </button>
            <button
              onClick={() => {
                setLinkType('job');
                setSearchQuery('');
                setSelectedItem(null);
              }}
              className={`flex items-center justify-center gap-1 py-2.5 rounded-lg text-[10px] font-bold transition-all ${
                linkType === 'job'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Briefcase className="w-3 h-3 shrink-0" />
              Job
            </button>
            <button
              onClick={() => {
                setLinkType('url');
                setSearchQuery('');
                setSelectedItem(null);
              }}
              className={`flex items-center justify-center gap-1 py-2.5 rounded-lg text-[10px] font-bold transition-all ${
                linkType === 'url'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Link2 className="w-3 h-3 shrink-0" />
              Custom URL
            </button>
          </div>
        </div>

        {/* Search & Autocomplete or Custom URL input */}
        {linkType === 'url' ? (
          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">
              Enter Custom URL / Destination
            </label>
            <div className="relative">
              <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="e.g., customsite.com/docs, google.com"
                value={searchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  if (val.trim()) {
                    setSelectedItem({ id: val.trim(), title: val.trim() });
                  } else {
                    setSelectedItem(null);
                  }
                }}
                className="w-full pl-10 pr-4 py-3 bg-zinc-950/40 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-bold"
              />
            </div>
            <p className="text-[10px] text-zinc-500 leading-normal">
              Any scan of this QR code will automatically redirect users to this exact link destination.
            </p>
          </div>
        ) : (
          <div className="space-y-3 relative">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">
              Search {linkType === 'vehicle' ? 'Vehicle vin/make/cust...' : 'Active Jobs/Work Orders...'}
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder={linkType === 'vehicle' ? "Type to search Vehicle VIN or Owner..." : "Type to search Job # or Customer..."}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedItem(null);
                }}
                className="w-full pl-10 pr-4 py-3 bg-zinc-950/40 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-bold"
              />
            </div>

          {/* Search Result Suggestions List */}
          {searchQuery && !selectedItem && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-800 shadow-2xl rounded-2xl overflow-hidden z-25 max-h-48 overflow-y-auto custom-scrollbar animate-in slide-in-from-top-1 fade-in duration-200">
              {loadingSearchData ? (
                <div className="p-4 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" /> Loading registry...
                </div>
              ) : matches.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500 italic">No matching records found</div>
              ) : (
                matches.map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedItem(item);
                      setSearchQuery(
                        linkType === 'vehicle'
                          ? `${item.year || ''} ${item.make || ''} ${item.model || ''} (${item.vin || item.id})`
                          : `${item.jobNumber ? '#' + item.jobNumber + ' - ' : ''}${item.title}`
                      );
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-zinc-800/50 flex items-center justify-between border-b border-zinc-800/40 text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      {linkType === 'vehicle' ? (
                        <>
                          <span className="block font-black text-white truncate">{item.year} {item.make} {item.model}</span>
                          <span className="block text-[10px] text-zinc-500 font-mono truncate mt-0.5">VIN: {item.vin || 'N/A'} • Cust: {item.customerName || 'None'}</span>
                        </>
                      ) : (
                        <>
                          <span className="block font-black text-white truncate">{item.title}</span>
                          <span className="block text-[10px] text-zinc-500 font-mono truncate mt-0.5">Job #{item.jobNumber || 'Native'} • Cust: {item.customerName || 'Walk-in'}</span>
                        </>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400 transition-colors shrink-0 ml-2" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

        {/* Selected target preview card */}
        {selectedItem && (
          <div className="p-4 bg-emerald-500/5 border border-emerald-500/25 rounded-2xl flex items-center justify-between animate-in zoom-in-95 duration-200">
            <div className="min-w-0">
              <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block mb-0.5">Selected Target</span>
              <p className="font-extrabold text-white text-xs truncate">
                {linkType === 'vehicle' 
                  ? `${selectedItem.year || ''} ${selectedItem.make || ''} ${selectedItem.model || ''}`
                  : (linkType === 'job' ? selectedItem.title : `Custom URL Destination`)
                }
              </p>
              <p className="text-[10px] font-mono text-zinc-400 truncate mt-0.5">
                {linkType === 'vehicle' 
                  ? `VIN: ${selectedItem.vin || selectedItem.id}` 
                  : (linkType === 'job' ? `Job #: ${selectedItem.jobNumber || 'Native'}` : selectedItem.id)
                }
              </p>
            </div>
            <div className="p-2 bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 rounded-xl">
              <Check className="w-4 h-4" />
            </div>
          </div>
        )}

        {/* Action button */}
        <div className="pt-4 border-t border-zinc-800/40">
          <button
            onClick={handleAssign}
            disabled={!selectedItem || isLinking}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98]"
          >
            {isLinking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Linking Sticker & Navigating...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Link Sticker & Open Record
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
