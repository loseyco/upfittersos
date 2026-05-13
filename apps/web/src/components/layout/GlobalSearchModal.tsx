import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Users, CarFront, Briefcase, Package, Loader2, MapPin, UserCircle2, Box } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, limit, query, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { useSearchStore } from '../../lib/store/searchStore';
import { toast } from 'sonner';
import { VehicleDetailsModal, EditVehicleModal } from '../../features/business/VehiclesManager';
import { JobDetailsModal } from '../../features/business/JobDetailsModal';
import { CustomerDetailsModal } from '../../features/business/CustomerDetailsModal';
import { ZoneDetailsModal } from '../../features/business/ZoneModals';
import { ConfirmModal } from '../ConfirmModal';

type SearchResult = {
  id: string;
  type: 'Customer' | 'Vehicle' | 'Job' | 'Inventory' | 'Bay' | 'Staff' | 'Package';
  title: string;
  subtitle: string;
  searchString: string;
  rawData: any;
};

export function GlobalSearchModal() {
  const navigate = useNavigate();
  const { tenantId } = useAuthStore();
  const { isOpen, open, close, searchQuery, setSearchQuery } = useSearchStore();
  const queryClient = useQueryClient();
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const inputRef = useRef<HTMLInputElement>(null);

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
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },
    enabled: isOpen && !!tenantId && tenantId !== 'GLOBAL'
  });

  const getSource = (row: any) => {
    const isQB = row.tags?.includes('QuickBooks') || 
                 row.notes?.includes('Imported via QBWC') || 
                 !!row.ListID || !!row.qb_ListID || 
                 !!row.quickbooksId;
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
        isQB ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20'
      }`}>
        {isQB ? 'QuickBooks' : 'Native'}
      </span>
    );
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow Ctrl+F or Cmd+F
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        open();
      }
      if (e.key === 'Escape') {
        if (editingVehicle) setEditingVehicle(null);
        else if (selectedResult) setSelectedResult(null);
        else close();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedResult, editingVehicle]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSelectedResult(null);
      setEditingVehicle(null);
    }
  }, [isOpen]);

  const { data: searchIndex, isLoading } = useQuery({
    queryKey: ['global-search-index', tenantId],
    queryFn: async () => {
      if (!tenantId || tenantId === 'GLOBAL') return [];
      
      const results: SearchResult[] = [];
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
          searchTerms: [data.company, data.address, data.notes, data.firstName, data.lastName]
        })),
        fetchCollection('vehicles', 'Vehicle', data => ({
          title: `${data.year || ''} ${data.make || ''} ${data.model || ''}`.trim() || 'Unknown Vehicle',
          subtitle: `VIN: ${data.vin || 'N/A'} • ${data.customerName || 'No Customer'}`,
          searchTerms: [data.vin, data.licensePlate, data.color, data.customerName, data.notes]
        })),
        fetchCollection('jobs', 'Job', data => ({
          title: data.title || data.Name || data.FullName || 'Unnamed Job',
          subtitle: `Status: ${data.status || data.JobStatus || 'Pending'} • ${data.description || data.notes || ''}`.substring(0, 100),
          searchTerms: [data.jobNumber, data.description, data.notes, data.customerName, data.vin]
        })),
        fetchCollection('inventory_items', 'Inventory', data => ({
          title: data.name || data.FullName || data.Name || 'Unnamed Item',
          subtitle: `SKU: ${data.sku || data.SalesDesc || 'N/A'} • Stock: ${data.quantityOnHand || data.QuantityOnHand || 0}`,
          searchTerms: [data.sku, data.description, data.notes, data.category]
        })),
        fetchCollection('zones', 'Bay', data => ({
          title: data.name || 'Unnamed Bay',
          subtitle: `Type: ${data.type || 'Other'} • ${data.allowMultiple ? 'Multi-Vehicle Lot' : (data.currentVehicleVin ? `Occupied by ${data.currentVehicleVin}` : 'Empty')}`,
          searchTerms: [data.type, data.currentVehicleVin, data.notes]
        })),
        fetchCollection('staff', 'Staff', data => ({
          title: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.name || data.displayName || 'Unnamed Staff',
          subtitle: [data.role, data.email, data.phone].filter(Boolean).join(' • ') || 'No contact info',
          searchTerms: [data.role, data.email, data.phone, data.notes, data.firstName, data.lastName]
        })),
        fetchCollection('shipments', 'Package', data => ({
          title: data.description || data.trackingNumber || 'Unnamed Package',
          subtitle: `Tracking: ${data.trackingNumber || 'N/A'} • Location: ${data.location || 'Unknown'} • Status: ${data.status || 'Received'}`,
          searchTerms: [data.trackingNumber, data.carrier, data.location, data.notes]
        }))
      ]);

      return results;
    },
    enabled: isOpen && !!tenantId && tenantId !== 'GLOBAL',
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  const getFilteredResults = () => {
    if (!searchIndex || !searchQuery.trim()) return [];
    
    const queryStr = searchQuery.toLowerCase();
    const results = searchIndex.filter(item => item.searchString.includes(queryStr));

    // Group by type

    // Group by type
    const grouped = results.reduce((acc, curr) => {
      if (!acc[curr.type]) acc[curr.type] = [];
      acc[curr.type].push(curr);
      return acc;
    }, {} as Record<string, SearchResult[]>);

    return grouped;
  };

  function handleResultClick(item: SearchResult) {
    if (item.type === 'Staff') {
      navigate(`/business/${tenantId}/performance?staffName=${encodeURIComponent(item.title)}`);
      close();
      return;
    }
    setSelectedResult(item);
  }

  const filteredGroups = getFilteredResults();
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
            placeholder="Search database (Ctrl+F)..."
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
                    {items.map(item => (
                      <button
                        key={item.id}
                        onClick={() => handleResultClick(item)}
                        className="w-full text-left px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-xl transition-colors flex flex-col gap-1 group"
                      >
                        <span className="font-semibold text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {item.title}
                        </span>
                        <span className="text-xs text-zinc-500 truncate">
                          {item.subtitle}
                        </span>
                      </button>
                    ))}
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

      {/* Details Overlay */}
      {selectedResult && selectedResult.type === 'Vehicle' && !editingVehicle && (
        <VehicleDetailsModal 
          tenantId={tenantId as string}
          vehicle={{ id: selectedResult.id, ...selectedResult.rawData }}
          onClose={() => setSelectedResult(null)}
          onEdit={() => {
            setEditingVehicle({ id: selectedResult.id, ...selectedResult.rawData });
          }}
          onArchive={async () => {
            if (window.confirm("Are you sure you want to archive this vehicle?")) {
              try {
                await updateDoc(doc(db, `businesses/${tenantId}/vehicles`, selectedResult.id), { isArchived: true });
                toast.success("Vehicle archived");
                queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/vehicles`] });
                queryClient.invalidateQueries({ queryKey: ['global-search-index', tenantId] });
                setSelectedResult(null);
                close(); // Close search to refresh state
              } catch (e) {
                toast.error("Failed to archive vehicle");
              }
            }
          }}
          getSource={getSource}
          onConfirmAction={setConfirmConfig}
        />
      )}

      {selectedResult && selectedResult.type === 'Job' && (
        <JobDetailsModal 
          tenantId={tenantId as string}
          job={{ id: selectedResult.id, ...selectedResult.rawData }}
          onClose={() => setSelectedResult(null)}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ['global-search-index', tenantId] });
          }}
        />
      )}

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

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />

      {editingVehicle && (
        <EditVehicleModal
          tenantId={tenantId as string}
          vehicle={editingVehicle}
          onClose={() => setEditingVehicle(null)}
          onSaved={(updatedData: any) => {
            // Update the selected result's raw data to reflect the changes immediately
            if (selectedResult) {
              setSelectedResult({
                ...selectedResult,
                rawData: { ...selectedResult.rawData, ...updatedData },
                title: `${updatedData.year || ''} ${updatedData.make || ''} ${updatedData.model || ''}`.trim() || 'Unknown Vehicle',
                subtitle: `VIN: ${editingVehicle.vin || 'N/A'} • ${updatedData.customerName || 'No Customer'}`
              });
            }
            queryClient.invalidateQueries({ queryKey: ['generic-grid', `businesses/${tenantId}/vehicles`] });
            queryClient.invalidateQueries({ queryKey: ['global-search-index', tenantId] });
            setEditingVehicle(null);
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
