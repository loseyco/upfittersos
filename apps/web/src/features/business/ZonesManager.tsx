import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, doc, setDoc, updateDoc, serverTimestamp, onSnapshot, query, addDoc, limit, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { Plus, MapPin, Warehouse, Briefcase, LayoutDashboard, AlertTriangle, Clock, MessageSquare, ShoppingCart } from 'lucide-react';

import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { VehicleDetailsModal } from './VehiclesManager';
// VinScanner import removed as it is unused
import { ConfirmModal } from '../../components/ConfirmModal';
import { QuickAddVehicleModal } from './VehicleSelector';
import type { Vehicle } from './VehicleSelector';
import { QuickAddJobModal } from './JobSelectionComponents';


import { ZoneDetailsModal } from './ZoneModals';
import type { Zone } from './ZoneModals';

// Vehicle interface moved to VehicleSelector.tsx

const zoneTypeIcons = {
  bay: Warehouse,
  parking: MapPin,
  office: Briefcase,
  other: LayoutDashboard,
};

export function ZonesManager({ tenantId }: { tenantId: string }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneType, setNewZoneType] = useState<'bay' | 'parking' | 'office' | 'other'>('bay');
  const [newZoneAllowMultiple, setNewZoneAllowMultiple] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [partsRequests, setPartsRequests] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || 'bay';
  const initialOccupancy = searchParams.get('occupancy') || 'occupied';
  const initialZoneId = searchParams.get('zone') || null;

  const [filterType, setFilterType] = useState<string>(initialType);
  const [filterOccupancy, setFilterOccupancy] = useState<string>(initialOccupancy);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(initialZoneId);
  const selectedZone = selectedZoneId ? zones.find(z => z.id === selectedZoneId) || null : null;
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [quickAddVin, setQuickAddVin] = useState<{zoneId: string, vin: string} | null>(null);
  const [quickAddJob, setQuickAddJob] = useState<{zoneId: string, title: string, vin: string | null} | null>(null);
  const { user } = useAuthStore();
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






  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/zones`));
    const unsub = onSnapshot(q, (snap) => {
      const data: Zone[] = [];
      snap.forEach(doc => data.push({ id: doc.id, ...doc.data() } as Zone));
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setZones(data);
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/jobs`));
    const unsub = onSnapshot(q, (snap) => {
      setJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/parts_requests`));
    const unsub = onSnapshot(q, (snap) => {
      setPartsRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/vehicles`), limit(1000));
    const unsub = onSnapshot(q, (snap) => {
      const data: Vehicle[] = [];
      const seen = new Set();
      snap.forEach(doc => {
        const v = { id: doc.id, ...doc.data() } as Vehicle;
        const key = (v.vin || v.id).toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          data.push(v);
        }
      });
      setVehicles(data);
    });
    return () => unsub();
  }, [tenantId]);

  // Smart Default: If filtering for occupied but nothing is occupied, show all
  useEffect(() => {
    if (zones.length > 0 && filterOccupancy === 'occupied') {
      const hasOccupied = zones.some(z => z.currentVehicleVin || (z.currentVehicleVins && z.currentVehicleVins.length > 0));
      if (!hasOccupied) {
        setFilterOccupancy('all');
        setFilterType('all');
      }
    }
  }, [zones, filterOccupancy]);

  const filteredZones = zones.filter(zone => {
    if (zone.isArchived) return false;
    const typeMatch = filterType === 'all' || zone.type === filterType;
    const hasSingle = !!zone.currentVehicleVin;
    const hasMultiple = !!(zone.currentVehicleVins && zone.currentVehicleVins.length > 0);
    const isOccupied = hasSingle || hasMultiple;
    const occupancyMatch = filterOccupancy === 'all' || 
      (filterOccupancy === 'occupied' && isOccupied) || 
      (filterOccupancy === 'empty' && !isOccupied);
    return typeMatch && occupancyMatch;
  });

  const handleAddZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneName.trim() || !tenantId) return;
    try {
      const newZoneRef = doc(collection(db, `businesses/${tenantId}/zones`));
      await setDoc(newZoneRef, {
        name: newZoneName.trim(),
        type: newZoneType,
        allowMultiple: newZoneAllowMultiple,
        currentVehicleVin: null,
        currentVehicleVins: [],
        createdAt: serverTimestamp(),
        createdBy: user?.uid || 'system'
      });
      setNewZoneName('');
      setNewZoneAllowMultiple(false);
      setIsAdding(false);
      toast.success("Zone created");
    } catch (err) {
      console.error("Error adding zone:", err);
      toast.error("Failed to add zone");
    }
  };

  const handleArchiveZone = async (zoneId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Archive Zone',
      message: 'Are you sure you want to archive this zone? It will be hidden from active lists but historical assignments will be preserved.',
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), { isArchived: true });
          toast.success("Zone archived");
        } catch (err) {
          console.error("Error archiving zone:", err);
          toast.error("Failed to archive zone");
        }
      }
    });
  };



  const handleAssignVehicle = async (zoneId: string, vin: string, actionType: 'assign' | 'remove' | 'clear' | 'remove_job' = 'assign', jobId: string | null = null) => {
    try {
      const trimmedVin = vin.trim().toUpperCase();
      let finalJobId = jobId;

      // If no jobId provided, try to find one linked to this VIN
      if (actionType === 'assign' && trimmedVin && !finalJobId) {
        const linkedJob = jobs.find(j => (j.vehicleId || '').toUpperCase() === trimmedVin);
        if (linkedJob) {
          finalJobId = linkedJob.id;
          toast.info(`Auto-assigned Job #${linkedJob.jobNumber || linkedJob.id.substring(0, 5)} found for this VIN.`);
        }
      }
      const zone = zones.find(z => z.id === zoneId);
      const previousVin = zone?.currentVehicleVin || null;
      const previousJobId = zone?.currentJobId || null;
      const previousVins = zone?.currentVehicleVins || [];
      const previousAssignedAt = zone?.lastAssignedAt || null;
      
      // AUTO-MOVE: If this VIN or Job is already in another zone, clear it from there first
      if (actionType === 'assign' && (trimmedVin || jobId)) {
        const otherZones = zones.filter(z => z.id !== zoneId);
        for (const oz of otherZones) {
          let needsClear = false;
          let movedVin = null;
          let movedJobId = null;

          if (trimmedVin && oz.currentVehicleVin === trimmedVin) {
            needsClear = true;
            movedVin = oz.currentVehicleVin;
            movedJobId = oz.currentJobId;
          } else if (jobId && oz.currentJobId === jobId) {
            needsClear = true;
            movedVin = oz.currentVehicleVin;
            movedJobId = oz.currentJobId;
          } else if (trimmedVin && oz.currentVehicleVins?.includes(trimmedVin)) {
            needsClear = true;
            movedVin = trimmedVin;
            movedJobId = null; // Open lots don't have single job IDs usually
          }
          
          if (needsClear) {
            // Log move event
            await addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
              zoneId: oz.id,
              zoneName: oz.name,
              vin: movedVin,
              jobId: movedJobId,
              assignedAt: serverTimestamp(),
              assignedBy: user?.uid || 'system',
              assignedByEmail: user?.email || null,
              assignedByName: user?.displayName || null,
              action: 'cleared',
              notes: `Auto-moved to ${zone?.name || 'new location'}`
            });

            // Update the previous zone
            if (oz.allowMultiple) {
              const newVins = (oz.currentVehicleVins || []).filter(v => v !== trimmedVin);
              await updateDoc(doc(db, `businesses/${tenantId}/zones`, oz.id), { currentVehicleVins: newVins });
            } else {
              await updateDoc(doc(db, `businesses/${tenantId}/zones`, oz.id), { 
                currentVehicleVin: null, 
                currentJobId: null 
              });
            }
            toast.info(`Moved from ${oz.name} to ${zone?.name}`);
          }
        }
      }
      
      if (actionType === 'assign' && trimmedVin && trimmedVin.length < 10) {
        toast.error(`"${trimmedVin}" is too short to be a valid VIN. Please scan a valid vehicle barcode.`);
        return;
      }

      if (zone?.allowMultiple) {
        if (actionType === 'assign') {
          if (trimmedVin && previousVins.includes(trimmedVin)) {
            toast.info("Vehicle already in this lot.");
            return;
          }
        }
        if (actionType === 'remove' && !trimmedVin) return; // Need a vin to remove
      } else {
        if (actionType === 'assign' && trimmedVin && zone?.currentVehicleVin === trimmedVin && jobId === zone?.currentJobId) {
          toast.info("This assignment is already active in this bay.");
          return;
        }
      }

      const undoAssignment = async () => {
        try {
          if (zone?.allowMultiple) {
             await setDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), { currentVehicleVins: previousVins, lastAssignedAt: previousAssignedAt }, { merge: true });
          } else {
             await setDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), { 
               currentVehicleVin: previousVin, 
               currentJobId: previousJobId,
               lastAssignedAt: previousAssignedAt 
             }, { merge: true });
          }
          
          await addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
            zoneId,
            zoneName: zone?.name || 'Unknown Zone',
            vin: zone?.allowMultiple ? trimmedVin : previousVin,
            jobId: previousJobId,
            assignedAt: serverTimestamp(),
            assignedBy: user?.uid || 'system',
            assignedByEmail: user?.email || null,
            assignedByName: user?.displayName || null,
            action: 'undo_assignment'
          });
          toast.success("Assignment undone.");
        } catch(e) {
          toast.error("Failed to undo assignment.");
        }
      };

      // If replacing an existing assignment in a single bay, log a clear event for the old one first
      if (!zone?.allowMultiple && actionType === 'assign' && (previousVin || previousJobId)) {
        const isDifferent = (trimmedVin && trimmedVin !== previousVin) || (jobId && jobId !== previousJobId);
        if (isDifferent) {
          await addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
            zoneId,
            zoneName: zone?.name || 'Unknown Zone',
            vin: previousVin,
            jobId: previousJobId,
            assignedAt: serverTimestamp(),
            assignedBy: user?.uid || 'system',
            assignedByEmail: user?.email || null,
            assignedByName: user?.displayName || null,
            action: 'cleared',
            notes: 'Auto-cleared for new assignment'
          });
        }
      }

      if (zone?.allowMultiple) {
        if (actionType === 'assign') {
          const newVins = [...previousVins, trimmedVin];
          await setDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), { currentVehicleVins: newVins, lastAssignedAt: serverTimestamp() }, { merge: true });
        } else if (actionType === 'remove') {
          const newVins = previousVins.filter(v => v !== trimmedVin);
          await setDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), { currentVehicleVins: newVins, lastAssignedAt: serverTimestamp() }, { merge: true });
        }
      } else if (actionType === 'remove_job') {
        const updateData: any = {
          currentJobId: null,
          lastAssignedAt: serverTimestamp()
        };
        await setDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), updateData, { merge: true });
      } else {
        const vinChanged = trimmedVin !== previousVin;
        const updateData: any = {
          currentVehicleVin: actionType === 'assign' ? (trimmedVin || null) : null,
          currentJobId: actionType === 'assign' ? (finalJobId || null) : null,
        };
        
        if (vinChanged) {
          updateData.lastAssignedAt = serverTimestamp();
        }

        await setDoc(doc(db, `businesses/${tenantId}/zones`, zoneId), updateData, { merge: true });
      }

      const jobData = finalJobId ? jobs.find((j: any) => j.id === finalJobId) : null;
      const vehicleData = trimmedVin ? vehicles.find((v: any) => v.vin === trimmedVin) : null;

      await addDoc(collection(db, `businesses/${tenantId}/zone_assignments`), {
        zoneId,
        zoneName: zone?.name || 'Unknown Zone',
        vin: trimmedVin || null,
        jobId: finalJobId || null,
        customerName: jobData?.customerName || vehicleData?.customerName || null,
        jobTitle: jobData?.title || null,
        assignedAt: serverTimestamp(),
        assignedBy: user?.uid || 'system',
        assignedByEmail: user?.email || null,
        assignedByName: user?.displayName || null,
        action: actionType === 'assign' && (trimmedVin || finalJobId) ? 'assigned' : (actionType === 'remove_job' ? 'job_cleared' : 'cleared')
      });

      if (actionType === 'assign' && trimmedVin) {
        const vehicleRef = doc(db, `businesses/${tenantId}/vehicles`, trimmedVin);
        const vehicleDoc = await getDoc(vehicleRef);
        
        if (!vehicleDoc.exists()) {
          // Fetch comprehensive details from NHTSA API
          let details: any = { year: '', make: '', model: '', bodyClass: '', driveType: '', gvwr: '' };
          if (trimmedVin.length === 17) {
            try {
              const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${trimmedVin}?format=json`);
              const data = await res.json();
              const result = data.Results?.[0];
              if (result && result.Make && result.ErrorCode && result.ErrorCode.startsWith('0')) {
                details = { year: result.ModelYear || '', make: result.Make || '', model: result.Model || '', bodyClass: result.BodyClass || '', driveType: result.DriveType || '', gvwr: result.GVWR || '' };
              }
            } catch (apiErr) {
              console.warn("NHTSA API fetch failed", apiErr);
            }
          }

          await setDoc(vehicleRef, { vin: trimmedVin, ...details, tenantId, createdAt: serverTimestamp(), arrivedAt: serverTimestamp(), source: 'Zone Manager' });
          
          if (details.make) {
            toast.success(`Identified: ${details.year} ${details.make} ${details.model}`, { action: { label: 'Undo', onClick: undoAssignment } });
          } else {
            toast.warning("Vehicle not found in database. You may need to enter details manually.", { action: { label: 'Undo', onClick: undoAssignment } });
          }
        } else {
          // Vehicle exists. Try auto-decode if it's missing make/model
          const data = vehicleDoc.data();
          
          // Auto-mark as arrived if missing
          if (!data.arrivedAt && !data.departedAt) {
            await updateDoc(vehicleRef, { arrivedAt: serverTimestamp(), updatedAt: serverTimestamp() });
          }

          if (!data.make && trimmedVin.length === 17) {
            try {
              const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${trimmedVin}?format=json`);
              const apiData = await res.json();
              const result = apiData.Results?.[0];
              if (result && result.Make && result.ErrorCode && result.ErrorCode.startsWith('0')) {
                await updateDoc(vehicleRef, { year: result.ModelYear || '', make: result.Make || '', model: result.Model || '', bodyClass: result.BodyClass || '', driveType: result.DriveType || '', gvwr: result.GVWR || '', updatedAt: serverTimestamp() });
                toast.success(`Updated missing vehicle data: ${result.ModelYear || ''} ${result.Make} ${result.Model || ''}`, { action: { label: 'Undo', onClick: undoAssignment } });
              } else {
                 toast.success(zone?.allowMultiple ? `Vehicle added to lot.` : `Vehicle assigned to bay.`, { action: { label: 'Undo', onClick: undoAssignment } });
              }
            } catch (apiErr) {
              console.warn("NHTSA API backfill failed", apiErr);
              toast.success(zone?.allowMultiple ? `Vehicle added to lot.` : `Vehicle assigned to bay.`, { action: { label: 'Undo', onClick: undoAssignment } });
            }
          } else {
            toast.success(zone?.allowMultiple ? `Vehicle added to lot.` : `Vehicle assigned to bay.`, { action: { label: 'Undo', onClick: undoAssignment } });
          }
        }
      } else {
        toast.success(zone?.allowMultiple ? `Removed vehicle from lot.` : `Cleared vehicle from bay.`, { action: { label: 'Undo', onClick: undoAssignment } });
      }
    } catch (err) {
      console.error("Error in vehicle assignment:", err);
      toast.error("Failed to assign vehicle");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Facility Zones & Bays</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Track vehicle locations across your facility.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
              {['all', 'occupied', 'empty'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setFilterOccupancy(opt)}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                    filterOccupancy === opt 
                      ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm' 
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            
            <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
              {['all', 'bay', 'parking', 'office'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setFilterType(opt)}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                    filterType === opt 
                      ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm' 
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                  }`}
                >
                  {opt === 'all' ? 'all' : opt}
                </button>
              ))}
            </div>

            {filteredZones.length < zones.length && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl">
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  Showing {filteredZones.length} of {zones.length}
                </span>
                <button 
                  onClick={() => { setFilterType('all'); setFilterOccupancy('all'); }}
                  className="text-[10px] font-bold text-zinc-400 hover:text-indigo-600 underline uppercase"
                >
                  Show All
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Zone
          </button>
        </div>
      </div>

      {isAdding && (
        <form onSubmit={handleAddZone} className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm animate-in fade-in slide-in-from-top-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Zone Name</label>
              <input
                type="text"
                required
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
                placeholder="e.g. Bay 1"
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="sm:w-48">
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Type</label>
              <select
                value={newZoneType}
                onChange={(e) => setNewZoneType(e.target.value as any)}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option value="bay">Service Bay</option>
                <option value="parking">Parking Spot</option>
                <option value="office">Office</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="sm:w-48">
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Capacity</label>
              <select
                value={newZoneAllowMultiple ? 'multiple' : 'single'}
                onChange={(e) => setNewZoneAllowMultiple(e.target.value === 'multiple')}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option value="single">Single Vehicle</option>
                <option value="multiple">Multiple (Open Lot)</option>
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" className="px-6 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold">
                Save
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredZones.map(zone => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            vehicles={vehicles}
            jobs={jobs}
            partsRequests={partsRequests}
            onSelect={() => setSelectedZoneId(zone.id)}
          />
        ))}

        {filteredZones.length < zones.length && (
          <button
            onClick={() => { setFilterType('all'); setFilterOccupancy('all'); }}
            className="flex flex-col items-center justify-center p-8 bg-zinc-50 dark:bg-zinc-900/50 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl hover:border-indigo-500/50 hover:bg-indigo-50/30 dark:hover:bg-indigo-500/5 transition-all group"
          >
            <div className="p-4 bg-white dark:bg-zinc-800 rounded-2xl shadow-sm mb-4 group-hover:scale-110 transition-transform">
              <LayoutDashboard className="w-8 h-8 text-indigo-500" />
            </div>
            <h3 className="font-bold text-zinc-900 dark:text-white mb-1">Show All Zones</h3>
            <p className="text-sm text-zinc-500">{zones.length - filteredZones.length} more zones are hidden</p>
          </button>
        )}
      </div>

      {selectedZone && !selectedVehicle && (
        <ZoneDetailsModal 
          zone={selectedZone} 
          tenantId={tenantId}
          vehicles={vehicles}
          jobs={jobs}
          partsRequests={partsRequests}
          onClose={() => setSelectedZoneId(null)}
          onAssign={(vin: string, jobId?: string) => handleAssignVehicle(selectedZone.id, vin, 'assign', jobId)}
          onClear={() => handleAssignVehicle(selectedZone.id, '', 'clear')}
          onRemoveVehicle={(vin: string) => handleAssignVehicle(selectedZone.id, vin, 'remove')}
          onRemoveJob={() => handleAssignVehicle(selectedZone.id, selectedZone.currentVehicleVin || '', 'remove_job')}
          onDelete={() => {
            handleArchiveZone(selectedZone.id);
            setSelectedZoneId(null);
          }}
          onQuickAddRequest={(vin: string) => setQuickAddVin({ zoneId: selectedZone.id, vin })}
          onQuickAddJobRequest={(title: string) => setQuickAddJob({ zoneId: selectedZone.id, title, vin: selectedZone.currentVehicleVin })}
          onOpenVehicle={(vin: string) => {
            const v = vehicles.find(veh => veh.vin === vin);
            if (v) setSelectedVehicle(v);
          }}
        />
      )}

      {selectedVehicle && (
        <VehicleDetailsModal
          tenantId={tenantId}
          vehicle={selectedVehicle}
          onClose={() => setSelectedVehicle(null)}
          onConfirmAction={setConfirmConfig}
          onEdit={() => {}} // Could wire this up to edit if needed, but view-only is fine for now

          getSource={(row: any) => {
            const isQB = row.tags?.includes('QuickBooks') || row.notes?.includes('Imported via QBWC') || !!row.ListID || !!row.qb_ListID || !!row.quickbooksId;
            return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${isQB ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20'}`}>{isQB ? 'QuickBooks' : 'Native'}</span>;
          }}
        />
      )}

      {quickAddVin && (
        <QuickAddVehicleModal
          tenantId={tenantId}
          initialVin={quickAddVin.vin}
          onClose={() => setQuickAddVin(null)}
          onAssign={(vin) => handleAssignVehicle(quickAddVin.zoneId, vin)}
        />
      )}

      {quickAddJob && (
        <QuickAddJobModal 
          tenantId={tenantId}
          initialTitle={quickAddJob.title}
          initialVin={quickAddJob.vin || undefined}
          onClose={() => setQuickAddJob(null)}
          onSuccess={(jobId) => {
            handleAssignVehicle(quickAddJob.zoneId, quickAddJob.vin || '', 'assign', jobId);
            setQuickAddJob(null);
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

// VinSelector moved to VehicleSelector.tsx

// JobSelector moved to JobSelectionComponents.tsx

function ZoneCard({ zone, vehicles, jobs, partsRequests, onSelect }: { zone: Zone, vehicles: any[], jobs: any[], partsRequests: any[], onSelect: () => void }) {
  const Icon = zoneTypeIcons[zone.type as keyof typeof zoneTypeIcons] || LayoutDashboard;
  const vehicle = vehicles.find((v: any) => v.vin === zone.currentVehicleVin);
  const job = jobs.find((j: any) => j.id === zone.currentJobId);
  const zoneVehicles = zone.allowMultiple ? (zone.currentVehicleVins || []).map((vin: string) => vehicles.find((v: any) => v.vin === vin)).filter(Boolean) : [];
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!vehicle && zoneVehicles.length === 0) return;
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [vehicle, zoneVehicles.length]);
  
  const timeInArea = () => {
    const timestamp = zone.lastAssignedAt || zone.updatedAt || zone.createdAt;
    if (!timestamp) return null;

    let date;
    if (typeof timestamp.toDate === 'function') date = timestamp.toDate();
    else if (timestamp.seconds !== undefined) date = new Date(timestamp.seconds * 1000);
    else if (timestamp._seconds !== undefined) date = new Date(timestamp._seconds * 1000);
    else date = new Date(timestamp);
    
    if (isNaN(date.getTime())) return null;

    const diff = Math.floor((now - date.getTime()) / 1000);
    if (diff < 0) return 'Just now';
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <button 
      onClick={onSelect}
      className="w-full text-left bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-indigo-500/30 transition-all group relative overflow-hidden"
    >

      
      <div className="flex items-center gap-4 mb-4">
        <div className={`p-3 rounded-xl ${vehicle ? 'bg-indigo-500/10 text-indigo-500' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-0.5">{zone.type}</p>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg text-zinc-900 dark:text-white leading-tight truncate">
              {zone.name || 'Unnamed Bay'}
            </h3>
            {(() => {
              const target = job || zone;
              const legacyBlocker = target?.blocker ? [{ message: target.blocker, status: 'active' }] : [];
              const activeBlockers = (target?.blockers || legacyBlocker).filter((b: any) => b.status === 'active');
              const isBlocked = activeBlockers.length > 0 || target?.status === 'Blocked' || job?.status === 'Blocked' || zone?.status === 'Blocked';

              return (
                <div className="flex items-center gap-1">
                  {isBlocked && (
                    <span title={activeBlockers.length > 0 ? activeBlockers.map((b: any) => b.message).join('\n') : 'Marked as Blocked'} className="flex items-center gap-1 text-[10px] font-black uppercase text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded shrink-0 animate-pulse">
                      <AlertTriangle className="w-3 h-3" /> {activeBlockers.length > 1 ? `${activeBlockers.length} Blockers` : 'Blocked'}
                    </span>
                  )}
                  {(() => {
                    const currentVin = job?.vehicleVin || zone?.currentVehicleVin;
                    const relevantParts = partsRequests.filter((pr: any) => {
                      const status = (pr.status || '').toLowerCase();
                      const isActive = ['pending', 'received', 'ordered'].includes(status);
                      if (!isActive) return false;
                      
                      if (job?.id && pr.jobId === job.id) return true;
                      if (zone?.id && pr.zoneId === zone.id) return true;
                      if (currentVin && pr.vin === currentVin) return true;
                      
                      return false;
                    });
                    const receivedCount = relevantParts.filter((pr: any) => (pr.status || '').toLowerCase() === 'received').length;

                    if (relevantParts.length === 0) return null;
                    return (
                      <span title={relevantParts.map((p: any) => p.partName).join('\n')} className={`flex items-center gap-1 text-[10px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${receivedCount > 0 ? 'bg-emerald-500 text-white animate-pulse' : 'bg-amber-500/10 text-amber-500'}`}>
                        <ShoppingCart className="w-3 h-3" /> {receivedCount > 0 ? 'Parts Arrived' : `${relevantParts.length} Parts`}
                      </span>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
      
      <div className="mb-4 flex flex-col gap-1.5 px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-xl">
        {(() => {
          const etaRaw = job?.expectedFinishTime || job?.eta || zone.eta;
          if (!etaRaw) {
            return (
              <div className="flex items-center gap-2 text-xs opacity-60">
                <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span className="font-medium text-zinc-500 uppercase tracking-tighter">No ETA Set</span>
              </div>
            );
          }

          const etaDate = typeof etaRaw.toDate === 'function' ? etaRaw.toDate() : new Date(etaRaw);
          const now = new Date();
          const diffMs = etaDate.getTime() - now.getTime();
          const isOverdue = diffMs < 0;
          const absDiff = Math.abs(diffMs);
          
          const hours = Math.floor(absDiff / 3600000);
          const minutes = Math.floor((absDiff % 3600000) / 60000);
          const timeLabel = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

          return (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <Clock className={`w-3.5 h-3.5 ${isOverdue ? 'text-red-500 animate-blink' : 'text-indigo-500'} shrink-0`} />
                <span className="font-medium text-zinc-600 dark:text-zinc-400 truncate">
                  ETA: <span className="text-zinc-900 dark:text-white font-bold">
                    {etaDate.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </span>
              </div>
              <span className={cn(
                "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                isOverdue 
                  ? "bg-red-500 text-white animate-blink" 
                  : diffMs < 3600000 // Less than 1 hour
                    ? "bg-amber-500 text-white"
                    : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
              )}>
                {isOverdue ? `Overdue ${timeLabel}` : `Due in ${timeLabel}`}
              </span>
            </div>
          );
        })()}

        {job?.notes && (
           <div className="flex items-start gap-2 text-xs">
             <MessageSquare className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
             <span className="font-medium text-zinc-500 dark:text-zinc-500 line-clamp-2 italic">{job.notes}</span>
           </div>
        )}
      </div>

      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
        {zone.allowMultiple ? (
          zoneVehicles.length > 0 ? (
            <div>
              <div className="flex justify-between items-start mb-1">
                <h4 className="font-bold text-zinc-900 dark:text-white text-sm">
                  {zoneVehicles.length} Vehicle{zoneVehicles.length === 1 ? '' : 's'} Parked
                </h4>
                <p className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded">Lot</p>
              </div>
              <div className="flex flex-col gap-1 mt-2">
                {zoneVehicles.slice(0, 2).map((v: any) => (
                  <p key={v.vin} className="text-xs text-zinc-500 truncate">
                    • {v.year} {v.make} {v.model || v.vin}
                  </p>
                ))}
                {zoneVehicles.length > 2 && <p className="text-[10px] text-zinc-400 italic mt-1">+{zoneVehicles.length - 2} more</p>}
              </div>
            </div>
          ) : (
            <p className="text-sm font-medium text-zinc-400 italic py-2">Empty Lot</p>
          )
        ) : (vehicle || job) ? (
          <div>
            {job && (
              <div className="flex items-center gap-1.5 mb-2">
                <div className="p-1 bg-emerald-500/10 rounded">
                  <Briefcase className="w-3 h-3 text-emerald-500" />
                </div>
                <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">{job.title}</p>
              </div>
            )}
            <div className="flex justify-between items-start mb-1">
              <h4 className="font-bold text-zinc-900 dark:text-white text-sm">
                {vehicle 
                  ? (`${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || `VIN: ${vehicle.vin}`) 
                  : 'No Vehicle Linked'}
              </h4>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <p className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded">
                  {timeInArea() || '--'}
                </p>
                {zone.updatedAt && (
                  <p className="text-[9px] font-medium text-zinc-400 uppercase tracking-tighter">
                    Upd: {(() => {
                      const ts = zone.updatedAt;
                      const date = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
                      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    })()}
                  </p>
                )}
              </div>
            </div>
            {vehicle && <p className="text-xs text-zinc-500 font-mono mb-1">{vehicle.vin}</p>}
            {(vehicle?.customerName || job?.customerName) ? (
              <p className="text-[10px] text-zinc-400 truncate italic">{vehicle?.customerName || job?.customerName}</p>
            ) : (
              <p className="text-[10px] text-red-500/60 font-bold uppercase tracking-widest mt-1">Missing Job/Customer</p>
            )}
          </div>
        ) : (
          <p className="text-sm font-medium text-zinc-400 italic py-2">Empty</p>
        )}
      </div>
    </button>
  );
}


// QuickAddVehicleModal moved to VehicleSelector.tsx
