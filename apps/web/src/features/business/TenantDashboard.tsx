import { useAuthStore } from '../../lib/auth/store';
import { TopNav } from '../../components/layout/TopNav';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Building2, Menu } from 'lucide-react';
import { useState } from 'react';
import { GenericDataGrid } from './GenericDataGrid';
import { BusinessEvents } from './BusinessEvents';
import { useParams, useNavigate } from 'react-router-dom';
import { BusinessSidebar } from './BusinessSidebar';

import { MissionControl } from './MissionControl';
import { usePageTitle } from '../../lib/hooks/usePageTitle';
import { ShipmentsTracker } from './ShipmentsTracker';

import { BusinessSettings } from './BusinessSettings';
import { ZonesManager } from './ZonesManager';
export function TenantDashboard() {
  usePageTitle('Dashboard');
  const { tenantId } = useAuthStore();
  const navigate = useNavigate();
  const params = useParams();
  
  const splat = params['*'] || '';
  const pathParts = splat.split('/').filter(Boolean);
  
  const activeTab = pathParts[0] || 'overview';
  const eventId = pathParts[1] || null;
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleTabClick = (tabId: string) => {
    navigate(`/business/${tenantId}/${tabId}`);
    setIsSidebarOpen(false);
  };



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

  const customerColumns = [
    { 
      key: 'name', 
      label: 'Customer Name',
      format: (_: any, row: any) => {
        const name = `${row.firstName || ''} ${row.lastName || ''}`.trim();
        return <span className="font-semibold">{name || row.company || row.nickName || 'Unnamed'}</span>;
      }
    },
    { key: 'email', label: 'Email' },
    { key: 'mobilePhone', label: 'Phone' },
    { 
      key: 'status', 
      label: 'Status',
      format: (val: any) => (
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
          val === 'Active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
        }`}>
          {val || 'Active'}
        </span>
      )
    },
    { key: 'source', label: 'Source', format: (_: any, row: any) => getSource(row) }
  ];

  const jobColumns = [
    { key: 'title', label: 'Job Title' },
    { key: 'status', label: 'Status' },
    { key: 'priority', label: 'Priority' },
    { key: 'source', label: 'Source', format: (_: any, row: any) => getSource(row) }
  ];

  const itemColumns = [
    { key: 'name', label: 'Item Name' },
    { key: 'sku', label: 'SKU' },
    { 
      key: 'price', 
      label: 'Price',
      format: (val: any) => {
        const num = Number(val || 0);
        return <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">${num.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>;
      }
    },
    { 
      key: 'quantityOnHand', 
      label: 'Stock',
      format: (val: any) => <span className={`font-bold ${Number(val) <= 0 ? 'text-red-500' : 'text-zinc-600 dark:text-zinc-400'}`}>{val ?? 0}</span>
    },
    { key: 'source', label: 'Source', format: (_: any, row: any) => getSource(row) }
  ];

  const vehicleColumns = [
    { 
      key: 'vin', 
      label: 'VIN',
      format: (val: any) => <span className="font-mono text-zinc-600 dark:text-zinc-400">{val || 'N/A'}</span>
    },
    { key: 'year', label: 'Year' },
    { key: 'make', label: 'Make' },
    { key: 'model', label: 'Model' },
    { 
      key: 'jobTitle', 
      label: 'Linked Job',
      format: (val: any) => val ? <span className="font-semibold text-indigo-500">{val}</span> : <span className="text-zinc-500">-</span>
    },
    { key: 'source', label: 'Source', format: (_: any, row: any) => getSource(row) }
  ];

  const staffColumns = [
    { 
      key: 'name', 
      label: 'Staff Member',
      format: (_: any, row: any) => {
        const name = `${row.firstName || ''} ${row.lastName || ''}`.trim() || row.displayName || row.email || 'Unnamed';
        return <span className="font-semibold text-zinc-900 dark:text-zinc-100">{name}</span>;
      }
    },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role', format: (val: any) => <span className="capitalize">{val?.replace('_', ' ') || 'Staff'}</span> },
    { key: 'department', label: 'Department' },
    { key: 'source', label: 'Source', format: (_: any, row: any) => getSource(row) }
  ];

  const { data: business, isLoading } = useQuery({
    queryKey: ['business', tenantId],
    queryFn: async () => {
      if (!tenantId || tenantId === 'GLOBAL') return null;
      const snap = await getDoc(doc(db, 'businesses', tenantId));
      if (!snap.exists()) return null;
      const data = snap.data();
      const qbData = Object.entries(data)
        .filter(([key]) => key.startsWith('qb_'))
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {} as Record<string, any>);
      return { id: snap.id, name: data.name, qbData, rawData: data } as any;
    },
    enabled: !!tenantId && tenantId !== 'GLOBAL'
  });

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors overflow-hidden">
      <BusinessSidebar 
        activeTab={activeTab} 
        setActiveTab={handleTabClick} 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopNav />
        
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-zinc-500 active:scale-95 transition-transform"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="font-bold tracking-tight truncate max-w-[200px]">
              {business?.name || 'Dashboard'}
            </h1>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 no-scrollbar">
          {!isLoading && (
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="hidden md:flex w-14 h-14 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl items-center justify-center shadow-sm">
                  <Building2 className="w-7 h-7 text-indigo-500" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">
                    {activeTab === 'overview' ? business?.name : activeTab.replace('qb_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </h1>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {activeTab === 'overview' ? 'Tenant Overview' : `Business ${activeTab.includes('qb_') ? 'Sync' : 'Operational'} Data`}
                  </p>
                </div>
              </div>
              

            </div>
          )}

          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {activeTab === 'overview' && (
              <MissionControl tenantId={tenantId!} onTabChange={handleTabClick} business={business} />
            )}

            {activeTab === 'settings' && (
              <BusinessSettings tenantId={tenantId!} initialData={business?.rawData} />
            )}

            {activeTab === 'staff' && (
              <GenericDataGrid 
                collectionPath={`businesses/${tenantId}/staff`} 
                title="Staff Management" 
                columns={staffColumns}
              />
            )}

            {activeTab === 'shipments' && (
              <ShipmentsTracker />
            )}

            {activeTab === 'customers' && (
              <GenericDataGrid 
                collectionPath={`businesses/${tenantId}/customers`} 
                title="Upfitters Customers" 
                columns={customerColumns}
              />
            )}

            {activeTab === 'jobs' && (
              <GenericDataGrid 
                collectionPath={`businesses/${tenantId}/jobs`} 
                title="Upfitters Jobs" 
                columns={jobColumns}
              />
            )}

            {activeTab === 'items' && (
              <GenericDataGrid 
                collectionPath={`businesses/${tenantId}/inventory_items`} 
                title="Upfitters Inventory" 
                columns={itemColumns}
              />
            )}

            {activeTab === 'vehicles' && (
              <GenericDataGrid 
                collectionPath={`businesses/${tenantId}/vehicles`} 
                title="Customer Vehicles" 
                columns={vehicleColumns}
              />
            )}

            {activeTab === 'tasks' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/tasks`} title="Tasks" />
            )}

            {activeTab === 'zones' && (
              <ZonesManager tenantId={tenantId!} />
            )}

            {activeTab === 'facility_maps' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/facility_maps`} title="Facility Maps" />
            )}

            {activeTab === 'canvases' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/canvases`} title="Canvases" />
            )}

            {activeTab === 'messages' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/messages`} title="Messages" />
            )}

            {activeTab === 'announcements' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/announcements`} title="Announcements" />
            )}

            {activeTab === 'qb_customers' && (
              <GenericDataGrid 
                collectionPath={`businesses/${tenantId}/qb_jobs`} 
                title="QuickBooks Raw Customers" 
                localFilter={(item) => {
                  const sl = Number(item.qb_Sublevel ?? item.Sublevel ?? 0);
                  return sl <= 1;
                }}
              />
            )}

            {activeTab === 'qb_jobs' && (
              <GenericDataGrid 
                collectionPath={`businesses/${tenantId}/qb_jobs`} 
                title="QuickBooks Raw Jobs" 
                localFilter={(item) => {
                  const sl = Number(item.qb_Sublevel ?? item.Sublevel ?? 0);
                  return sl >= 2;
                }}
              />
            )}

            {activeTab === 'qb_items' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/qb_items`} title="QuickBooks Raw Items" />
            )}

            {activeTab === 'qb_invoices' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/qb_invoices`} title="QuickBooks Raw Invoices" />
            )}

            {activeTab === 'qb_pos' && (
              <GenericDataGrid collectionPath={`businesses/${tenantId}/qb_purchase_orders`} title="QuickBooks Raw Purchase Orders" />
            )}

            {activeTab === 'events' && (
              <BusinessEvents tenantId={tenantId as string} eventId={eventId} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
