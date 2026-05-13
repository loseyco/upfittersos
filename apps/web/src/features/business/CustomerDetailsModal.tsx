import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Users, Mail, Phone, MapPin, Edit2, Trash2, X, Car } from 'lucide-react';
import { ConfirmModal } from '../../components/ConfirmModal';
import { VehicleDetailsModal, EditVehicleModal } from './VehiclesManager';
import { useAuthStore } from '../../lib/auth/store';
import { useBetaUserCount } from '../../lib/hooks/useBetaUserCount';

export function CustomerDetailsModal(props: any) {
  const permissions = useAuthStore(state => state.permissions);
  const isBeta = permissions['experimental.new_modals'] === true;

  if (isBeta) {
    return <BetaCustomerDetailsModal {...props} />;
  }
  return <LegacyCustomerDetailsModal {...props} />;
}

function BetaCustomerDetailsModal({ tenantId, customer, onClose, onEdit, onDelete }: any) {
  useBetaUserCount(tenantId);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

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
    const fetchVehicles = async () => {
      try {
        const customerName = customer.name || customer.company || '';
        if (!customerName) {
          setLoadingVehicles(false);
          return;
        }

        const q = query(
          collection(db, `businesses/${tenantId}/vehicles`),
          where('customerName', '==', customerName)
        );
        const snap = await getDocs(q);
        const fetchedVehicles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setVehicles(fetchedVehicles);
      } catch (err) {
        console.error('Failed to fetch customer vehicles', err);
      } finally {
        setLoadingVehicles(false);
      }
    };

    fetchVehicles();
  }, [tenantId, customer]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden max-h-[90vh] flex flex-col border border-purple-500/20" onClick={e => e.stopPropagation()}>
        <div className="relative h-32 bg-gradient-to-r from-purple-600 to-purple-800 shrink-0">
           <div className="absolute -bottom-12 left-8 p-1 bg-white dark:bg-zinc-900 rounded-3xl">
             <div className="w-24 h-24 bg-purple-500/10 rounded-2xl flex items-center justify-center border border-purple-500/20">
               <Users className="w-10 h-10 text-purple-600" />
             </div>
           </div>
           <div className="absolute top-4 left-4 flex gap-2">
             <span className="px-3 py-1 bg-black/30 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-lg border border-white/10 shadow-sm flex items-center gap-1.5">
               <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" /> Beta
             </span>
           </div>
           <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-all">
             <X className="w-5 h-5" />
           </button>
        </div>

        <div className="pt-16 px-8 pb-8 overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-black text-zinc-900 dark:text-white leading-tight">
                {customer.name || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.company}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest">{customer.company || 'Private Client'}</span>
                <span className="text-zinc-300 dark:text-zinc-700">•</span>
                <span className="text-xs font-mono text-zinc-500">{customer.id}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                autoFocus
                onClick={onEdit}
                className="p-3 bg-purple-50 hover:bg-purple-100 dark:bg-purple-500/10 dark:hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-xl transition-colors font-bold text-sm flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" /> Edit Details (E)
              </button>
              <button 
                onClick={onDelete}
                className="p-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">Contact Details</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                    <div className="p-2 bg-purple-50 dark:bg-purple-500/10 rounded-lg text-purple-600 dark:text-purple-400"><Mail className="w-4 h-4" /></div>
                    <span className="text-sm font-medium">{customer.email || 'No email provided'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                    <div className="p-2 bg-purple-50 dark:bg-purple-500/10 rounded-lg text-purple-600 dark:text-purple-400"><Phone className="w-4 h-4" /></div>
                    <span className="text-sm font-medium">{customer.mobilePhone || 'No phone provided'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                    <div className="p-2 bg-purple-50 dark:bg-purple-500/10 rounded-lg text-purple-600 dark:text-purple-400"><MapPin className="w-4 h-4" /></div>
                    <span className="text-sm font-medium">{customer.address || 'No address provided'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">System Information</h3>
                <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500 font-medium">Source</span>
                    <span className="text-xs font-bold text-zinc-900 dark:text-white px-2 py-0.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-sm">{customer.source || 'Native'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500 font-medium">Status</span>
                    <span className="text-xs font-bold text-emerald-500 uppercase">{customer.status || 'Active'}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <span className="text-xs text-zinc-500 font-medium">Created</span>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {customer.createdAt?.toDate ? customer.createdAt.toDate().toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
              
              {customer.notes && (
                <div>
                  <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">Internal Notes</h3>
                  <div className="p-4 bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10 rounded-2xl">
                    <p className="text-sm text-amber-900/70 dark:text-amber-200/50 italic leading-relaxed">
                      "{customer.notes}"
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-8">
            <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-4">Associated Vehicles</h3>
            {loadingVehicles ? (
              <p className="text-sm text-zinc-500">Loading vehicles...</p>
            ) : vehicles.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {vehicles.map(v => (
                  <div 
                    key={v.id} 
                    onClick={() => setSelectedVehicle(v)}
                    className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center gap-3 cursor-pointer hover:border-purple-500/50 hover:bg-purple-50 dark:hover:bg-purple-500/5 transition-all"
                  >
                    <div className="p-2 bg-purple-500/10 rounded-xl">
                      <Car className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-900 dark:text-white">
                        {v.year} {v.make} {v.model}
                      </p>
                      <p className="text-xs text-zinc-500 font-mono mt-0.5">{v.vin}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 italic p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-center">
                No vehicles found for this customer.
              </p>
            )}
          </div>
        </div>
      </div>
      
      {selectedVehicle && !editingVehicle && (
        <VehicleDetailsModal 
          tenantId={tenantId}
          vehicle={selectedVehicle}
          onConfirmAction={setConfirmConfig}
          onClose={() => setSelectedVehicle(null)}
          onEdit={() => {
            setEditingVehicle(selectedVehicle);
            setSelectedVehicle(null);
          }}
          getSource={getSource}
        />
      )}

      {editingVehicle && (
        <EditVehicleModal
          tenantId={tenantId}
          vehicle={editingVehicle}
          onClose={() => setEditingVehicle(null)}
          onSaved={(updatedData: any) => {
             const newVehicles = vehicles.map(v => v.id === editingVehicle.id ? { ...editingVehicle, ...updatedData } : v);
             setVehicles(newVehicles);
             setSelectedVehicle({ ...editingVehicle, ...updatedData });
             setEditingVehicle(null);
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
    </div>
  );
}

function LegacyCustomerDetailsModal({ tenantId, customer, onClose, onEdit, onDelete }: any) {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

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
    const fetchVehicles = async () => {
      try {
        const customerName = customer.name || customer.company || '';
        if (!customerName) {
          setLoadingVehicles(false);
          return;
        }

        const q = query(
          collection(db, `businesses/${tenantId}/vehicles`),
          where('customerName', '==', customerName)
        );
        const snap = await getDocs(q);
        const fetchedVehicles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setVehicles(fetchedVehicles);
      } catch (err) {
        console.error('Failed to fetch customer vehicles', err);
      } finally {
        setLoadingVehicles(false);
      }
    };

    fetchVehicles();
  }, [tenantId, customer]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="relative h-32 bg-blue-600 shrink-0">
           <div className="absolute -bottom-12 left-8 p-1 bg-white dark:bg-zinc-900 rounded-3xl">
             <div className="w-24 h-24 bg-blue-500/10 rounded-2xl flex items-center justify-center">
               <Users className="w-10 h-10 text-blue-600" />
             </div>
           </div>
           <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-all">
             <X className="w-5 h-5" />
           </button>
        </div>

        <div className="pt-16 px-8 pb-8 overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-black text-zinc-900 dark:text-white leading-tight">
                {customer.name || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.company}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{customer.company || 'Private Client'}</span>
                <span className="text-zinc-300 dark:text-zinc-700">•</span>
                <span className="text-xs font-mono text-blue-500">{customer.id}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={onEdit}
                className="p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl hover:text-blue-500 transition-colors"
              >
                <Edit2 className="w-5 h-5" />
              </button>
              <button 
                onClick={onDelete}
                className="p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">Contact Details</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                    <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg"><Mail className="w-4 h-4" /></div>
                    <span className="text-sm font-medium">{customer.email || 'No email provided'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                    <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg"><Phone className="w-4 h-4" /></div>
                    <span className="text-sm font-medium">{customer.mobilePhone || 'No phone provided'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                    <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg"><MapPin className="w-4 h-4" /></div>
                    <span className="text-sm font-medium">{customer.address || 'No address provided'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">System Information</h3>
                <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500 font-medium">Source</span>
                    <span className="text-xs font-bold text-zinc-900 dark:text-white px-2 py-0.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-sm">{customer.source || 'Native'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500 font-medium">Status</span>
                    <span className="text-xs font-bold text-emerald-500 uppercase">{customer.status || 'Active'}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <span className="text-xs text-zinc-500 font-medium">Created</span>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {customer.createdAt?.toDate ? customer.createdAt.toDate().toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
              
              {customer.notes && (
                <div>
                  <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">Internal Notes</h3>
                  <div className="p-4 bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10 rounded-2xl">
                    <p className="text-sm text-amber-900/70 dark:text-amber-200/50 italic leading-relaxed">
                      "{customer.notes}"
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-8">
            <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-4">Associated Vehicles</h3>
            {loadingVehicles ? (
              <p className="text-sm text-zinc-500">Loading vehicles...</p>
            ) : vehicles.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {vehicles.map(v => (
                  <div 
                    key={v.id} 
                    onClick={() => setSelectedVehicle(v)}
                    className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center gap-3 cursor-pointer hover:border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-500/5 transition-all"
                  >
                    <div className="p-2 bg-blue-500/10 rounded-xl">
                      <Car className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-900 dark:text-white">
                        {v.year} {v.make} {v.model}
                      </p>
                      <p className="text-xs text-zinc-500 font-mono mt-0.5">{v.vin}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 italic p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-center">
                No vehicles found for this customer.
              </p>
            )}
          </div>
        </div>
      </div>
      
      {selectedVehicle && !editingVehicle && (
        <VehicleDetailsModal 
          tenantId={tenantId}
          vehicle={selectedVehicle}
          onConfirmAction={setConfirmConfig}
          onClose={() => setSelectedVehicle(null)}
          onEdit={() => {
            setEditingVehicle(selectedVehicle);
            setSelectedVehicle(null);
          }}
          getSource={getSource}
        />
      )}

      {editingVehicle && (
        <EditVehicleModal
          tenantId={tenantId}
          vehicle={editingVehicle}
          onClose={() => setEditingVehicle(null)}
          onSaved={(updatedData: any) => {
             const newVehicles = vehicles.map(v => v.id === editingVehicle.id ? { ...editingVehicle, ...updatedData } : v);
             setVehicles(newVehicles);
             setSelectedVehicle({ ...editingVehicle, ...updatedData });
             setEditingVehicle(null);
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
    </div>
  );
}
