import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, addDoc, doc, getDoc, updateDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase/config';
import { TrendingUp, Plus, X, Briefcase, UserCheck, Search, ChevronDown, Maximize2, Minimize2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../../lib/utils';
import { SalesPipeline } from './SalesPipeline';
import { SalesProspects } from './SalesProspects';
import { SalesActivities } from './SalesActivities';
import { SalesAnalytics } from './SalesAnalytics';

interface SalesCrmManagerProps {
  tenantId: string;
  activeTab?: string;
}

export function SalesCrmManager({ tenantId, activeTab }: SalesCrmManagerProps) {
  const getSubTabFromActiveTab = (tab?: string): 'pipeline' | 'prospects' | 'activities' | 'analytics' => {
    if (tab === 'sales_prospects') return 'prospects';
    if (tab === 'sales_activities') return 'activities';
    if (tab === 'sales_analytics') return 'analytics';
    return 'pipeline';
  };

  const [activeSubTab, setActiveSubTab] = useState<'pipeline' | 'prospects' | 'activities' | 'analytics'>(() => 
    getSubTabFromActiveTab(activeTab)
  );

  useEffect(() => {
    if (activeTab) {
      setActiveSubTab(getSubTabFromActiveTab(activeTab));
    }
  }, [activeTab]);

  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(err => {
        console.error(err);
        toast.error('Unable to enter fullscreen mode');
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false));
      }
    }
  };

  useEffect(() => {
    const handleFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  const [isAddProspectOpen, setIsAddProspectOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

  // Helper to normalize customer objects from either native customers or qb_customers
  const normalizeCustomer = (c: any) => {
    const name = (
      c.name || 
      c.displayName || 
      c.DisplayName || 
      c.FullyQualifiedName || 
      c.companyName || 
      c.CompanyName || 
      (c.GivenName && c.FamilyName ? `${c.GivenName} ${c.FamilyName}` : '') || 
      ''
    ).trim();

    const contactPerson = (
      c.contactPerson || 
      c.givenName || 
      c.GivenName || 
      (c.GivenName && c.FamilyName ? `${c.GivenName} ${c.FamilyName}` : '') || 
      c.PrimaryContactName ||
      c.primaryContactName ||
      ''
    ).trim();

    const email = (
      c.email || 
      c.primaryEmailAddr || 
      (typeof c.PrimaryEmailAddr === 'string' ? c.PrimaryEmailAddr : c.PrimaryEmailAddr?.Address) || 
      (typeof c.primaryEmailAddr === 'object' ? c.primaryEmailAddr?.Address : '') || 
      c.Email ||
      ''
    ).trim();

    const phone = (
      c.phone || 
      c.mobilePhone || 
      c.MobilePhone || 
      c.primaryPhone || 
      (typeof c.PrimaryPhone === 'string' ? c.PrimaryPhone : c.PrimaryPhone?.FreeFormNumber) || 
      (typeof c.primaryPhone === 'object' ? c.primaryPhone?.FreeFormNumber : '') || 
      c.Phone ||
      ''
    ).trim();

    const notes = c.notes || c.Notes || '';
    const isQB = !!(c.quickbooksId || c.FullyQualifiedName || c.Notes?.includes('QB') || c.source === 'QuickBooks');

    return {
      id: c.id,
      name,
      contactPerson,
      email,
      phone,
      notes,
      pipelineStage: c.pipelineStage || 'existing',
      value: Number(c.value) || 0,
      assignedTo: c.assignedTo || null,
      assignedToName: c.assignedToName || 'Unassigned',
      source: isQB ? 'QuickBooks Sync' : 'Direct Account'
    };
  };

  // Fetch Existing Customers (from both native customers & QuickBooks synced qb_customers)
  const { data: customerList = [], refetch: refetchCustomers } = useQuery({
    queryKey: ['customers-list-crm', tenantId],
    queryFn: async () => {
      const [nativeSnap, qbSnap] = await Promise.all([
        getDocs(collection(db, `businesses/${tenantId}/customers`)),
        getDocs(collection(db, `businesses/${tenantId}/qb_customers`))
      ]);

      const nativeList = nativeSnap.docs.map(doc => normalizeCustomer({ id: doc.id, ...doc.data() }));
      const qbList = qbSnap.docs.map(doc => normalizeCustomer({ id: doc.id, ...doc.data() }));

      const map = new Map<string, any>();
      [...nativeList, ...qbList].forEach(cust => {
        if (!cust.name) return;
        const key = cust.name.toLowerCase();
        if (!map.has(key)) {
          map.set(key, cust);
        }
      });

      return Array.from(map.values());
    }
  });
  


  // Fetch Prospects
  const { data: prospects = [], refetch: refetchProspects } = useQuery({
    queryKey: ['sales-prospects', tenantId],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/sales_prospects`),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
    }
  });

  // Combine real sales prospects with all unimported customers into 'existing' or saved stage
  const allProspects = useMemo(() => {
    const list = [...prospects];

    customerList.forEach(cust => {
      const custName = (cust.name || '').toLowerCase().trim();
      if (!custName) return;

      const alreadyInProspects = prospects.some(p => (p.name || '').toLowerCase().trim() === custName);
      if (!alreadyInProspects) {
        list.push({
          id: `cust_${cust.id}`,
          customerId: cust.id,
          name: cust.name,
          contactPerson: cust.contactPerson || '',
          email: cust.email || '',
          phone: cust.phone || '',
          value: cust.value || 0,
          status: cust.pipelineStage || 'existing',
          source: cust.source || 'QuickBooks Sync',
          notes: cust.notes || 'Master Customer Account',
          assignedTo: cust.assignedTo || null,
          assignedToName: cust.assignedToName || 'Unassigned',
          isVirtualCustomer: true
        });
      }
    });

    return list;
  }, [prospects, customerList]);

  // Fetch Activities
  const { data: activities = [], refetch: refetchActivities } = useQuery({
    queryKey: ['sales-activities', tenantId],
    queryFn: async () => {
      const q = query(
        collection(db, `businesses/${tenantId}/sales_activities`),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
    }
  });

  // Fetch Staff Directory for Assignment
  const { data: staffList = [] } = useQuery({
    queryKey: ['staff-list', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      return snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(s => !s.isArchived && !s.isDeviceAccount);
    }
  });

  // Form State for Quick Lead Add
  const [newProspect, setNewProspect] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    value: '',
    status: 'lead',
    notes: '',
    assignedTo: '',
    source: 'Website'
  });

  const handleAddProspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProspect.name.trim()) return;

    try {
      const selectedRep = staffList.find(s => s.id === newProspect.assignedTo);
      const repName = selectedRep ? `${selectedRep.firstName} ${selectedRep.lastName}` : 'Unassigned';

      const trimmedName = newProspect.name.trim().toLowerCase();
      const existing = customerList.find(c => (c.name || '').toLowerCase().trim() === trimmedName);

      // Create deal in sales_prospects collection
      await addDoc(collection(db, `businesses/${tenantId}/sales_prospects`), {
        name: newProspect.name.trim(),
        contactPerson: newProspect.contactPerson.trim() || existing?.contactPerson || '',
        email: newProspect.email.trim() || existing?.email || '',
        phone: newProspect.phone.trim() || existing?.phone || '',
        value: Number(newProspect.value) || 0,
        status: newProspect.status,
        notes: newProspect.notes.trim() || existing?.notes || '',
        assignedTo: newProspect.assignedTo || null,
        assignedToName: repName,
        source: newProspect.source,
        customerId: existing ? existing.id : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      if (existing) {
        // Also update stage on master customer record
        const nativeRef = doc(db, `businesses/${tenantId}/customers`, existing.id);
        const nativeSnap = await getDoc(nativeRef);
        const data = {
          pipelineStage: newProspect.status,
          status: newProspect.status,
          updatedAt: serverTimestamp()
        };

        if (nativeSnap.exists()) {
          await updateDoc(nativeRef, data);
        } else {
          const qbRef = doc(db, `businesses/${tenantId}/qb_customers`, existing.id);
          await updateDoc(qbRef, data);
        }
      } else {
        // Create 1 master customer record in customers
        await addDoc(collection(db, `businesses/${tenantId}/customers`), {
          name: newProspect.name.trim(),
          contactPerson: newProspect.contactPerson.trim(),
          email: newProspect.email.trim(),
          phone: newProspect.phone.trim(),
          value: Number(newProspect.value) || 0,
          pipelineStage: newProspect.status,
          status: newProspect.status,
          notes: newProspect.notes.trim(),
          assignedTo: newProspect.assignedTo || null,
          assignedToName: repName,
          source: newProspect.source,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      toast.success(`Added deal for "${newProspect.name}" in ${newProspect.status.toUpperCase()} stage!`);
      refetchProspects();
      refetchCustomers();
      setIsAddProspectOpen(false);
      
      // Reset form
      setNewProspect({
        name: '',
        contactPerson: '',
        email: '',
        phone: '',
        value: '',
        status: 'lead',
        notes: '',
        assignedTo: '',
        source: 'Website'
      });

      refetchProspects();
    } catch (err) {
      console.error(err);
      toast.error('Failed to add prospect');
    }
  };

 


  // Metrics Calculations
  const activeProspects = prospects.filter(p => p.status !== 'won' && p.status !== 'lost');
  const wonProspects = prospects.filter(p => p.status === 'won');
  const lostProspects = prospects.filter(p => p.status === 'lost');

  const totalPipelineValue = activeProspects.reduce((sum, p) => sum + (p.value || 0), 0);
  const totalWonValue = wonProspects.reduce((sum, p) => sum + (p.value || 0), 0);
  
  const totalDecided = wonProspects.length + lostProspects.length;
  const winRate = totalDecided > 0 ? Math.round((wonProspects.length / totalDecided) * 100) : 0;

  return (
    <div className={cn(
      "space-y-6 animate-in fade-in duration-500",
      isFullscreen && "fixed inset-0 z-[99999] bg-zinc-950 p-6 overflow-y-auto w-screen h-screen m-0"
    )}>
      
      {/* Sales Overview Banner */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-transparent opacity-100 transition-opacity duration-300" />
        
        <div className="flex items-center gap-4 relative">
          <div className="p-3 bg-indigo-500/10 rounded-2xl">
            <TrendingUp className="w-8 h-8 text-indigo-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Sales & CRM Department</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Track prospects, log client interactions, and manage your deals lifecycle.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 relative">
          {/* Quick Metrics */}
          <div className="flex items-center gap-6 px-6 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <div className="text-center">
              <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block">Active Pipeline</span>
              <span className="text-base font-bold text-zinc-900 dark:text-white">${totalPipelineValue.toLocaleString()}</span>
            </div>
            <div className="w-[1px] h-8 bg-zinc-200 dark:bg-zinc-800" />
            <div className="text-center">
              <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block">Win Rate</span>
              <span className="text-base font-bold text-emerald-500">{winRate}%</span>
            </div>
            <div className="w-[1px] h-8 bg-zinc-200 dark:bg-zinc-800" />
            <div className="text-center">
              <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block">Won Deals</span>
              <span className="text-base font-bold text-indigo-500">${totalWonValue.toLocaleString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button 
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Display"}
              className="flex items-center gap-2 px-4 py-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-zinc-800 dark:text-zinc-200 rounded-2xl text-xs font-extrabold transition-all border border-zinc-200 dark:border-zinc-700/80 active:scale-95 shrink-0"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4 text-indigo-500" /> : <Maximize2 className="w-4 h-4 text-indigo-500" />}
              <span className="hidden sm:inline">
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </span>
            </button>

            <button 
              onClick={() => setIsAddProspectOpen(true)}
              className="flex items-center gap-2.5 px-6 py-3.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-2xl text-sm font-black shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95 shrink-0 border border-indigo-400/30"
            >
              <Plus className="w-5 h-5 text-white" />
              <span>+ Add New Prospect</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sub-tab Rendering */}
      <div>
        {activeSubTab === 'pipeline' && (
          <SalesPipeline 
            tenantId={tenantId} 
            prospects={allProspects} 
            staffList={staffList}
            onUpdate={() => { refetchProspects(); refetchCustomers(); }} 
            onOpenAddProspect={() => setIsAddProspectOpen(true)}
          />
        )}
        {activeSubTab === 'prospects' && (
          <SalesProspects 
            tenantId={tenantId} 
            prospects={allProspects} 
            staffList={staffList} 
            activities={activities}
            onUpdate={refetchProspects} 
            onActivityLogged={refetchActivities}
          />
        )}
        {activeSubTab === 'activities' && (
          <SalesActivities 
            tenantId={tenantId} 
            prospects={allProspects} 
            activities={activities} 
            onUpdate={refetchActivities} 
          />
        )}
        {activeSubTab === 'analytics' && (
          <SalesAnalytics 
            prospects={allProspects} 
            activities={activities} 
            staffList={staffList}
          />
        )}
      </div>

      {/* Add Lead / Prospect Modal */}
      {isAddProspectOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setIsAddProspectOpen(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="font-bold text-lg text-zinc-900 dark:text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-500" />
                Add New Prospect
              </h3>
              <button onClick={() => setIsAddProspectOpen(false)} className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddProspect} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto no-scrollbar">
              
              {customerList.length > 0 && (
                <div className="p-3.5 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/60 relative">
                  <label className="block text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-indigo-500" /> Pull From Customer Directory
                    </span>
                    <span className="text-[9px] text-zinc-400 font-semibold uppercase">Type to filter</span>
                  </label>

                  <div className="relative">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={customerSearchQuery}
                      onFocus={() => setIsCustomerDropdownOpen(true)}
                      onChange={(e) => {
                        setCustomerSearchQuery(e.target.value);
                        setIsCustomerDropdownOpen(true);
                      }}
                      placeholder="Type customer name to search & auto-fill..."
                      className="w-full pl-9 pr-8 py-2 bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold text-zinc-900 dark:text-white placeholder-zinc-400 focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all"
                    />
                    {customerSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerSearchQuery('');
                          setIsCustomerDropdownOpen(false);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-white p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    )}
                  </div>

                  {/* Filtered Customer Search Results Popup */}
                  {isCustomerDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 max-h-60 overflow-y-auto p-1.5 space-y-1 animate-in fade-in-50 duration-150">
                      {(() => {
                        const queryText = customerSearchQuery.toLowerCase().trim();
                        const filtered = customerList.filter(c => {
                          const name = (c.name || c.displayName || c.companyName || '').toLowerCase();
                          const contact = (c.contactPerson || c.givenName || '').toLowerCase();
                          const email = (c.email || c.primaryEmailAddr || '').toLowerCase();
                          const phone = (c.phone || c.primaryPhone || '').toLowerCase();
                          return !queryText || name.includes(queryText) || contact.includes(queryText) || email.includes(queryText) || phone.includes(queryText);
                        });

                        if (filtered.length === 0) {
                          return (
                            <div className="p-3 text-center text-xs text-zinc-400 font-medium">
                              No matching customers found
                            </div>
                          );
                        }

                        return filtered.map(c => {
                          const custName = c.name || c.displayName || c.companyName || 'Unnamed';
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setNewProspect(prev => ({
                                  ...prev,
                                  name: custName,
                                  contactPerson: c.contactPerson || c.givenName || prev.contactPerson,
                                  email: c.email || c.primaryEmailAddr || prev.email,
                                  phone: c.phone || c.primaryPhone || prev.phone,
                                  source: c.source || 'QuickBooks Sync',
                                  notes: c.notes ? `[Customer Record Linked] ${c.notes}` : prev.notes
                                }));
                                setCustomerSearchQuery(custName);
                                setIsCustomerDropdownOpen(false);
                                toast.success(`Auto-filled details for ${custName}`);
                              }}
                              className="w-full flex items-center justify-between px-3 py-2 text-left rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-colors group cursor-pointer"
                            >
                              <div>
                                <div className="text-xs font-bold text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                  {custName}
                                </div>
                                {(c.contactPerson || c.email || c.phone) && (
                                  <div className="text-[10px] text-zinc-400 font-medium truncate max-w-[280px]">
                                    {[c.contactPerson, c.email, c.phone].filter(Boolean).join(' • ')}
                                  </div>
                                )}
                              </div>
                              <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900 dark:group-hover:text-indigo-300">
                                {c.source || 'Customer'}
                              </span>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Prospect Name / Company Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. City Fleet Contract, ACME Corp"
                  value={newProspect.name}
                  onChange={e => setNewProspect(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Contact Person</label>
                  <input 
                    type="text" 
                    placeholder="e.g. John Doe"
                    value={newProspect.contactPerson}
                    onChange={e => setNewProspect(prev => ({ ...prev, contactPerson: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Estimated Value ($)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-bold">$</span>
                    <input 
                      type="number" 
                      placeholder="5000"
                      value={newProspect.value}
                      onChange={e => setNewProspect(prev => ({ ...prev, value: e.target.value }))}
                      className="w-full pl-8 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Email</label>
                  <input 
                    type="email" 
                    placeholder="john@example.com"
                    value={newProspect.email}
                    onChange={e => setNewProspect(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Phone</label>
                  <input 
                    type="text" 
                    placeholder="555-0199"
                    value={newProspect.phone}
                    onChange={e => setNewProspect(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Pipeline Stage</label>
                  <select 
                    value={newProspect.status}
                    onChange={e => setNewProspect(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all"
                  >
                    <option value="lead">1. Lead In</option>
                    <option value="contacted">2. Contacted</option>
                    <option value="meeting">3. Meeting Scheduled</option>
                    <option value="proposal">4. Proposal Sent</option>
                    <option value="negotiation">5. Negotiation</option>
                    <option value="won">6. Won (Closed)</option>
                    <option value="lost">7. Lost (Closed)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Lead Source</label>
                  <select 
                    value={newProspect.source}
                    onChange={e => setNewProspect(prev => ({ ...prev, source: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all"
                  >
                    <option value="Website">Website</option>
                    <option value="Text Message">Text Message (SMS)</option>
                    <option value="Phone Call">Phone Call / Inbound</option>
                    <option value="Referral">Referral</option>
                    <option value="Cold Call">Cold Call / Outreach</option>
                    <option value="QuickBooks Sync">QuickBooks Sync</option>
                    <option value="Advertisement">Advertisement</option>
                    <option value="Trade Show">Trade Show</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Assigned Representative</label>
                <select 
                  value={newProspect.assignedTo}
                  onChange={e => setNewProspect(prev => ({ ...prev, assignedTo: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all"
                >
                  <option value="">Unassigned</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{`${s.firstName} ${s.lastName}`}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Initial Notes / Details</label>
                <textarea 
                  rows={3}
                  placeholder="Provide scope details, fleet count, product requests, etc..."
                  value={newProspect.notes}
                  onChange={e => setNewProspect(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all resize-none"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsAddProspectOpen(false)}
                  className="flex-1 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-colors shadow-lg shadow-indigo-500/10"
                >
                  Create Prospect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
