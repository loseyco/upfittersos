import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Users, CarFront, Briefcase, Package, Loader2, MapPin, UserCircle2, Box, CheckSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, limit, query, collectionGroup, where } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { useSearchStore } from '../../lib/store/searchStore';

import { CustomerDetailsModal } from '../../features/business/CustomerDetailsModal';
import { ZoneDetailsModal } from '../../features/business/ZoneModals';

type SearchResult = {
  id: string;
  type: 'Customer' | 'Vehicle' | 'Job' | 'Inventory' | 'Bay' | 'Staff' | 'Package' | 'Task';
  title: string;
  subtitle: string;
  searchString: string;
  rawData: any;
};

export function GlobalSearchModal() {
  const navigate = useNavigate();
  const { tenantId } = useAuthStore();
  const { isOpen, open, close, searchQuery, setSearchQuery } = useSearchStore();
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  // Context data for specialized modals
  const { data: allVehicles = [] } = useQuery({
    queryKey: ['global-search-vehicles', tenantId],
    queryFn: async () => {
      const q = query(collection(db, `businesses/${tenantId}/vehicles`));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    },
    enabled: isOpen && !!tenantId && tenantId !== 'GLOBAL'
  });

  const { data: allJobs = [] } = useQuery({
    queryKey: ['global-search-jobs', tenantId],
    queryFn: async () => {
      const q = query(collection(db, `businesses/${tenantId}/jobs`));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    },
    enabled: isOpen && !!tenantId && tenantId !== 'GLOBAL'
  });

  const { data: searchIndex, isLoading } = useQuery({
    queryKey: ['global-search-index', tenantId, allVehicles?.length, allJobs?.length],
    queryFn: async () => {
      if (!tenantId || tenantId === 'GLOBAL') return [];
      
      const results: SearchResult[] = [];

      // 1. Preload auxiliary collections for enrichment
      let zonesList: any[] = [];
      let staffList: any[] = [];
      try {
        const zonesSnap = await getDocs(collection(db, `businesses/${tenantId}/zones`));
        zonesList = zonesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.warn('Failed to fetch zones for global search preload', e);
      }
      try {
        const staffSnap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
        staffList = staffSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.warn('Failed to fetch staff for global search preload', e);
      }

      // Populate Staff results
      staffList.forEach(data => {
        if (data.isArchived) return;
        const title = `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.name || data.displayName || 'Unnamed Staff';
        const subtitle = [data.role, data.email, data.phone].filter(Boolean).join(' • ') || 'No contact info';
        const searchTerms = [data.role, data.email, data.phone, data.notes, data.firstName, data.lastName];
        const searchString = `${title} ${subtitle} ${searchTerms.join(' ')}`.toLowerCase();
        results.push({ id: data.id, type: 'Staff', title, subtitle, searchString, rawData: data });
      });

      // Populate Bay/Zone results
      zonesList.forEach(data => {
        if (data.isArchived) return;
        const title = data.name || 'Unnamed Bay';
        const subtitle = `Type: ${data.type || 'Other'} • ${data.allowMultiple ? 'Multi-Vehicle Lot' : (data.currentVehicleVin ? `Occupied by ${data.currentVehicleVin}` : 'Empty')}`;
        const searchTerms = [data.type, data.currentVehicleVin, data.notes];
        const searchString = `${title} ${subtitle} ${searchTerms.join(' ')}`.toLowerCase();
        results.push({ id: data.id, type: 'Bay', title, subtitle, searchString, rawData: data });
      });

      const fetchCollection = async (colName: string, type: SearchResult['type'], mapper: (doc: any) => { title: string, subtitle: string, searchTerms?: string[] }) => {
        try {
          const q = query(collection(db, `businesses/${tenantId}/${colName}`), limit(200));
          const snap = await getDocs(q);
          snap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.isArchived) return;
            const { title, subtitle, searchTerms = [] } = mapper(data);

            const searchString = `${title} ${subtitle} ${searchTerms.join(' ')}`.toLowerCase();
            results.push({ id: docSnap.id, type, title, subtitle, searchString, rawData: data });
          });
        } catch (e) {
          console.warn(`Failed to fetch ${colName} for search`, e);
        }
      };

      await Promise.all([
        fetchCollection('customers', 'Customer', data => ({
          title: data.name || data.displayName || data.CompanyName || data.FullName || 'Unnamed Customer',
          subtitle: [data.email, data.mobilePhone, data.primaryPhone].filter(Boolean).join(' • ') || 'No contact info',
          searchTerms: [data.company, data.address, data.notes, data.firstName, data.lastName, ...(data.tags || [])]
        })),
        fetchCollection('vehicles', 'Vehicle', data => ({
          title: `${data.year || ''} ${data.make || ''} ${data.model || ''}`.trim() || 'Unknown Vehicle',
          subtitle: `VIN: ${data.vin || 'N/A'} • ${data.customerName || 'No Customer'}`,
          searchTerms: [data.vin, data.licensePlate, data.color, data.customerName, data.notes]
        })),
        fetchCollection('jobs', 'Job', data => {
          const vehicle = allVehicles.find(v => v.id === data.vehicleId || v.vin === data.vehicleId);
          const vehicleInfo = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : `VIN: ${data.vehicleId || data.vin || 'N/A'}`;
          
          // Resolve bay name
          const bay = zonesList.find(z => z.id === data.bayId);
          const bayName = bay ? bay.name : '';

          // Resolve assigned staff names
          const assignedStaffFromObjects = (data.assignedStaff || []).map((s: any) => s.name || s.displayName).filter(Boolean);
          const assignedStaffFromIds = (data.assignedStaffIds || []).map((id: string) => {
            const s = staffList.find(st => st.id === id);
            return s ? `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.name : '';
          }).filter(Boolean);
          const allAssignedStaffNames = Array.from(new Set([
            ...assignedStaffFromObjects,
            ...assignedStaffFromIds,
            ...(data.assignedStaffNames || []),
            data.assignedStaffId ? (staffList.find(st => st.id === data.assignedStaffId)?.name || '') : ''
          ])).filter(Boolean);

          return {
            title: data.title || data.Name || data.FullName || 'Unnamed Job',
            subtitle: `${data.customerName || 'No Customer'} • ${vehicleInfo} • ${data.status || data.JobStatus || 'Pending'}`.substring(0, 100),
            searchTerms: [
              data.jobNumber,
              data.description,
              data.notes,
              data.customerName,
              data.vehicleId,
              data.vin,
              data.priority,
              data.status,
              data.poNumber,
              data.po_number,
              data.invoiceNumber,
              data.invoice_number,
              data.workOrderNumber,
              data.parkedLocation,
              bayName,
              ...allAssignedStaffNames,
              ...(data.tags || []),
              vehicle?.vin || '',
              vehicle?.licensePlate || '',
              vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : ''
            ].filter(Boolean)
          };
        }),
        fetchCollection('inventory_items', 'Inventory', data => ({
          title: data.name || data.FullName || data.Name || 'Unnamed Item',
          subtitle: `SKU: ${data.sku || data.SalesDesc || 'N/A'} • Stock: ${data.quantityOnHand || data.QuantityOnHand || 0}`,
          searchTerms: [data.sku, data.description, data.notes, data.category]
        })),
        fetchCollection('shipments', 'Package', data => ({
          title: data.description || data.trackingNumber || 'Unnamed Package',
          subtitle: `Tracking: ${data.trackingNumber || 'N/A'} • Location: ${data.location || 'Unknown'} • Status: ${data.status || 'Received'}`,
          searchTerms: [data.trackingNumber, data.carrier, data.location, data.notes]
        })),
        (async () => {
          try {
            const q = query(
              collectionGroup(db, 'tasks'),
              where('tenantId', '==', tenantId),
              limit(300)
            );
            const snap = await getDocs(q);
            snap.forEach(docSnap => {
              const data = docSnap.data();
              if (data.isArchived) return;
              const jobId = docSnap.ref.path.split('/')[3];
              const title = data.title || data.name || 'Unnamed Task';
              const job = allJobs.find((j: any) => j.id === jobId);
              const jobTitle = job?.title || job?.Name || '';
              const jobNumber = job?.jobNumber ? `#${job.jobNumber}` : '';
              const subtitle = `Job: ${jobNumber} ${jobTitle} • Status: ${data.status || 'Pending'}`;
              
              // Enrich task searchTerms with job's vehicle info
              const vehicle = allVehicles.find((v: any) => v.id === job?.vehicleId || v.vin === job?.vehicleId);
              const vehicleVin = vehicle?.vin || job?.vin || '';
              const vehicleInfo = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.licensePlate || ''}`.trim() : '';

              // Resolve task's assigned staff names
              const taskStaffFromObjects = (data.assignedStaff || []).map((s: any) => s.name || s.displayName).filter(Boolean);
              const taskStaffFromIds = (data.assignedStaffIds || []).map((id: string) => {
                const s = staffList.find(st => st.id === id);
                return s ? `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.name : '';
              }).filter(Boolean);
              const allTaskStaffNames = Array.from(new Set([
                ...taskStaffFromObjects,
                ...taskStaffFromIds,
                ...(data.assignedStaffNames || []),
                ...(data.assignedCrew || [])
              ])).filter(Boolean);

              // Resolve job's bay
              const jobBay = job ? zonesList.find(z => z.id === job.bayId) : null;
              const jobBayName = jobBay ? jobBay.name : '';

              const searchTerms = [
                data.description,
                data.notes,
                data.status,
                jobNumber,
                jobTitle,
                job?.customerName || '',
                job?.priority || '',
                job?.status || '',
                jobBayName,
                vehicleVin,
                vehicleInfo,
                ...allTaskStaffNames,
                ...(data.tags || [])
              ].filter(Boolean);
              const searchString = `${title} ${subtitle} ${searchTerms.join(' ')}`.toLowerCase();
              results.push({
                id: docSnap.id,
                type: 'Task',
                title,
                subtitle,
                searchString,
                rawData: { ...data, jobId }
              });
            });
          } catch (e) {
            console.warn(`Failed to fetch tasks for search`, e);
          }
        })()
      ]);

      return results;
    },
    enabled: isOpen && !!tenantId && tenantId !== 'GLOBAL',
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  const getFilteredResults = () => {
    if (!searchIndex || !searchQuery.trim()) return [];
    
    const queryStr = searchQuery.toLowerCase();
    const queryTokens = queryStr.split(/\s+/).filter(Boolean);
    
    if (queryTokens.length === 0) return [];

    const scoredResults = searchIndex
      .map(item => {
        const titleLower = item.title.toLowerCase();
        const subtitleLower = item.subtitle.toLowerCase();
        const searchStr = item.searchString;

        // ALL query tokens must match somewhere in the item's searchString
        const allTokensMatch = queryTokens.every(token => searchStr.includes(token));
        if (!allTokensMatch) return null;

        // Calculate score
        let score = 0;

        // 1. Exact match on title
        if (titleLower === queryStr) {
          score += 1000;
        }
        // 2. Prefix match on title
        else if (titleLower.startsWith(queryStr)) {
          score += 500;
        }
        // 3. Substring match of full query in title
        else if (titleLower.includes(queryStr)) {
          score += 300;
        }

        // 4. Exact match on subtitle
        if (subtitleLower === queryStr) {
          score += 200;
        }
        // 5. Substring match of full query in subtitle
        else if (subtitleLower.includes(queryStr)) {
          score += 100;
        }

        // 6. Token matching scores
        queryTokens.forEach(token => {
          const wordBoundaryRegex = new RegExp(`\\b${token}\\b`);
          if (wordBoundaryRegex.test(titleLower)) {
            score += 80;
          } else {
            const prefixRegex = new RegExp(`\\b${token}`);
            if (prefixRegex.test(titleLower)) {
              score += 40;
            } else if (titleLower.includes(token)) {
              score += 20;
            }
          }

          if (subtitleLower.includes(token)) {
            score += 10;
          }
        });

        return { item, score };
      })
      .filter((res): res is { item: SearchResult; score: number } => res !== null)
      .sort((a, b) => b.score - a.score)
      .map(res => res.item);

    // Desired display order for result categories
    const TYPE_ORDER: Record<string, number> = {
      'Job': 1,
      'Task': 2,
      'Customer': 3,
      'Vehicle': 4,
      'Bay': 5,
      'Staff': 6,
      'Inventory': 7,
      'Package': 8,
    };

    // Group by type (preserving score sorting order within each group)
    const grouped = scoredResults.reduce((acc, curr) => {
      if (!acc[curr.type]) acc[curr.type] = [];
      acc[curr.type].push(curr);
      return acc;
    }, {} as Record<string, SearchResult[]>);

    // Sort grouped keys by TYPE_ORDER so they render in a consistent order
    const sortedGrouped: Record<string, SearchResult[]> = {};
    Object.keys(grouped)
      .sort((a, b) => (TYPE_ORDER[a] || 99) - (TYPE_ORDER[b] || 99))
      .forEach(key => {
        sortedGrouped[key] = grouped[key];
      });

    return sortedGrouped;
  };

  const filteredGroups = getFilteredResults();
  const flatResults = Object.values(filteredGroups).flat();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
        return;
      }

      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (selectedResult) {
          setSelectedResult(null);
        } else {
          close();
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (flatResults.length > 0) {
          setActiveIndex(prev => (prev + 1) % flatResults.length);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (flatResults.length > 0) {
          setActiveIndex(prev => (prev - 1 + flatResults.length) % flatResults.length);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatResults.length > 0 && flatResults[activeIndex]) {
          handleResultClick(flatResults[activeIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedResult, activeIndex, flatResults]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSelectedResult(null);
    }
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        block: 'nearest'
      });
    }
  }, [activeIndex]);

  function handleResultClick(item: SearchResult) {
    if (item.type === 'Staff') {
      navigate(`/business/${tenantId}/staff/${item.id}`);
      close();
      return;
    }
    if (item.type === 'Job') {
      navigate(`/business/${tenantId}/job/${item.id}`);
      close();
      return;
    }
    if (item.type === 'Vehicle') {
      navigate(`/business/${tenantId}/vehicle/${item.id}`);
      close();
      return;
    }
    if (item.type === 'Task') {
      navigate(`/business/${tenantId}/task/${item.rawData.jobId}/${item.id}`);
      close();
      return;
    }
    setSelectedResult(item);
  }

  const hasResults = Object.keys(filteredGroups).length > 0;

  const getIcon = (type: string) => {
    switch (type) {
      case 'Customer': return <Users className="w-4 h-4" />;
      case 'Vehicle': return <CarFront className="w-4 h-4" />;
      case 'Job': return <Briefcase className="w-4 h-4" />;
      case 'Inventory': return <Package className="w-4 h-4" />;
      case 'Bay': return <MapPin className="w-4 h-4" />;
      case 'Staff': return <UserCircle2 className="w-4 h-4" />;
      case 'Package': return <Box className="w-4 h-4" />;
      case 'Task': return <CheckSquare className="w-4 h-4" />;
      default: return <Search className="w-4 h-4" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] p-4" onClick={close}>
      <div 
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200" 
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 border-b border-zinc-200 dark:border-zinc-800">
          <Search className="w-5 h-5 text-zinc-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search database (Ctrl+K)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-zinc-900 dark:text-white text-lg placeholder:text-zinc-400"
          />
          {isLoading && <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />}
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-block px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded text-[10px] font-bold text-zinc-500 uppercase tracking-wider">ESC to close</span>
            <button onClick={close} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {searchQuery.trim() && (
          <div className="max-h-[60vh] overflow-y-auto p-2 no-scrollbar">
            {!hasResults && !isLoading ? (
              <div className="p-8 text-center text-zinc-500">
                No results found for "{searchQuery}"
              </div>
            ) : (
              Object.entries(filteredGroups).map(([type, items]) => (
                <div key={type} className="mb-4 last:mb-0">
                  <div className="px-3 py-2 text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                    {getIcon(type)}
                    {type === 'Staff' ? 'Staff' : `${type}s`}
                  </div>
                  <div className="space-y-1">
                    {items.map(item => {
                      const overallIndex = flatResults.findIndex(r => r.id === item.id && r.type === item.type);
                      const isActive = overallIndex === activeIndex;
                      return (
                        <button
                          key={item.id}
                          ref={isActive ? activeItemRef : undefined}
                          onClick={() => handleResultClick(item)}
                          className={`w-full text-left px-4 py-3 rounded-xl transition-all flex flex-col gap-1 group border border-transparent ${
                            isActive
                              ? 'bg-zinc-100 dark:bg-zinc-800 border-indigo-500/30 shadow-sm'
                              : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                          }`}
                        >
                          <span className={`font-semibold transition-colors ${
                            isActive 
                              ? 'text-indigo-650 dark:text-indigo-400' 
                              : 'text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
                          }`}>
                            {item.title}
                          </span>
                          <span className="text-xs text-zinc-500 truncate">
                            {item.subtitle}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        
        {!searchQuery.trim() && (
          <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center">
              <Search className="w-6 h-6 text-zinc-400" />
            </div>
            <p className="text-zinc-500 text-sm">Start typing to search your entire business database.<br/>Includes customers, vehicles, jobs, bays, staff, and packages.</p>
          </div>
        )}
      </div>



      {selectedResult && selectedResult.type === 'Customer' && (
        <CustomerDetailsModal 
          customer={{ id: selectedResult.id, ...selectedResult.rawData }}
          onClose={() => setSelectedResult(null)}
          onEdit={() => {
            // Future: Navigate to customer manager with this ID
            navigate(`/business/${tenantId}/customers?id=${selectedResult.id}`);
            close();
          }}
          onDelete={() => {
            if (window.confirm("Are you sure you want to delete this customer?")) {
              // Implementation...
            }
          }}
        />
      )}

      {selectedResult && selectedResult.type === 'Bay' && (
        <ZoneDetailsModal 
          zone={{ id: selectedResult.id, ...selectedResult.rawData }}
          tenantId={tenantId}
          vehicles={allVehicles}
          jobs={allJobs}
          onClose={() => setSelectedResult(null)}
          onAssign={async (_vin: string, _jobId: string) => {
            // Use existing logic from ZonesManager if needed, or implement here
          }}
          onClear={() => {}}
          onOpenVehicle={(vin: string) => {
            const v = allVehicles.find(veh => veh.vin === vin);
            if (v) {
              setSelectedResult({
                id: v.id,
                type: 'Vehicle',
                title: `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim(),
                subtitle: `VIN: ${v.vin || 'N/A'}`,
                searchString: '',
                rawData: v
              });
            }
          }}
        />
      )}

      {selectedResult && !['Vehicle', 'Job', 'Customer', 'Bay'].includes(selectedResult.type) && (
        <div className="fixed inset-0 z-[110] bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedResult(null)}>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 rounded-lg">
                  {getIcon(selectedResult.type)}
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-white">{selectedResult.title}</h3>
                  <p className="text-xs font-mono text-zinc-500">{selectedResult.type} ID: {selectedResult.id}</p>
                </div>
              </div>
              <button onClick={() => setSelectedResult(null)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto bg-zinc-50 dark:bg-zinc-950/50 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {Object.entries(selectedResult.rawData).map(([key, value]) => {
                  if (typeof value === 'object' && value !== null) return null; // Skip complex objects for simple view
                  return (
                    <div key={key} className="flex flex-col">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                        {key.replace('qb_', '').replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <span className="text-zinc-900 dark:text-zinc-100 text-sm break-words font-medium">
                        {value === null || value === '' ? '--' : String(value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
