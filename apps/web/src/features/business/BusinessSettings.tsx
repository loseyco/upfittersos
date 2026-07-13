import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { doc, updateDoc } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useQueryClient } from '@tanstack/react-query';
import { submitAuditLog } from '../../lib/logging/audit';
import { 
  Building2, MapPin, Link2, Save, Clock, Coffee, Pizza, Map, Monitor, 
  Palette, AlertTriangle, BellRing, Upload, Trash2, Loader2, Target, Wifi
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

export function BusinessSettings({ tenantId, initialData }: { tenantId: string; initialData?: any }) {
  const { user, permissions, isSuperAdmin } = useAuthStore();
  const canManage = isSuperAdmin || permissions['settings.manage'];
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    legalName: initialData?.legalName || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    addressStreet: initialData?.addressStreet || '',
    addressCity: initialData?.addressCity || '',
    addressState: initialData?.addressState || '',
    addressZip: initialData?.addressZip || '',
    companyCamToken: initialData?.companyCamToken || '',
    companyCamRefreshToken: initialData?.companyCamRefreshToken || '',
    easyPostApiKey: initialData?.easyPostApiKey || '',
    timeclockEnabled: initialData?.timeclockEnabled ?? false,
    timeclockRequireQR: initialData?.timeclockRequireQR ?? false,
    allowOffsiteClockIn: initialData?.allowOffsiteClockIn ?? false,
    lunchPaid: initialData?.lunchPaid ?? false,
    breakPaid: initialData?.breakPaid ?? false,
    siteLat: initialData?.siteLat || '',
    siteLng: initialData?.siteLng || '',
    siteRadius: initialData?.siteRadius || 500,
    logoUrl: initialData?.logoUrl || '',
    // Payroll Settings
    payrollWeekEndDay: initialData?.payrollWeekEndDay ?? 0,
    payrollCycle: initialData?.payrollCycle || 'weekly',
    // Monitor Settings
    monitorUrgentThreshold: initialData?.monitorUrgentThreshold || 4,
    monitorStaleThreshold: initialData?.monitorStaleThreshold || 24,
    monitorColorBlocked: initialData?.monitorColorBlocked || '#b91c1c',
    monitorColorUrgent: initialData?.monitorColorUrgent || '#d97706',
    monitorColorOverdue: initialData?.monitorColorOverdue || '#b91c1c',
    monitorColorActive: initialData?.monitorColorActive || '#1d4ed8',
    monitorColorEmpty: initialData?.monitorColorEmpty || '#27272a',
    // Global Notifications
    globalNotifyBayArrivals: initialData?.globalNotifyBayArrivals ?? true,
    globalNotifyReadyForQA: initialData?.globalNotifyReadyForQA ?? true,
    globalNotifyReadyForCustomer: initialData?.globalNotifyReadyForCustomer ?? true,
    globalNotifyStaleBays: initialData?.globalNotifyStaleBays ?? true,
    globalNotifyBlockers: initialData?.globalNotifyBlockers ?? true,
    globalNotifyMissingParts: initialData?.globalNotifyMissingParts ?? true,
    globalNotifyBayUpdates: initialData?.globalNotifyBayUpdates ?? true,
    // Upfitting Goals
    upfittingWeeklyHoursTarget: initialData?.upfittingWeeklyHoursTarget ?? 250,
    upfittingWeeklyJobsTarget: initialData?.upfittingWeeklyJobsTarget ?? 5,
    guestWifiSsid: initialData?.guestWifiSsid || 'SAE - Guest',
    guestWifiPassword: initialData?.guestWifiPassword || '8557232878'
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        legalName: initialData.legalName || '',
        email: initialData.email || '',
        phone: initialData.phone || '',
        addressStreet: initialData.addressStreet || '',
        addressCity: initialData.addressCity || '',
        addressState: initialData.addressState || '',
        addressZip: initialData.addressZip || '',
        companyCamToken: initialData.companyCamToken || '',
        companyCamRefreshToken: initialData.companyCamRefreshToken || '',
        easyPostApiKey: initialData.easyPostApiKey || '',
        timeclockEnabled: initialData.timeclockEnabled ?? false,
        timeclockRequireQR: initialData.timeclockRequireQR ?? false,
        allowOffsiteClockIn: initialData.allowOffsiteClockIn ?? false,
        lunchPaid: initialData.lunchPaid ?? false,
        breakPaid: initialData.breakPaid ?? false,
        siteLat: initialData.siteLat || '',
        siteLng: initialData.siteLng || '',
        siteRadius: initialData.siteRadius || 500,
        logoUrl: initialData.logoUrl || '',
        payrollWeekEndDay: initialData.payrollWeekEndDay ?? 0,
        payrollCycle: initialData.payrollCycle || 'weekly',
        monitorUrgentThreshold: initialData.monitorUrgentThreshold || 4,
        monitorStaleThreshold: initialData.monitorStaleThreshold || 24,
        monitorColorBlocked: initialData.monitorColorBlocked || '#b91c1c',
        monitorColorUrgent: initialData.monitorColorUrgent || '#d97706',
        monitorColorOverdue: initialData.monitorColorOverdue || '#b91c1c',
        monitorColorActive: initialData.monitorColorActive || '#1d4ed8',
        monitorColorEmpty: initialData.monitorColorEmpty || '#27272a',
        globalNotifyBayArrivals: initialData.globalNotifyBayArrivals ?? true,
        globalNotifyReadyForQA: initialData.globalNotifyReadyForQA ?? true,
        globalNotifyReadyForCustomer: initialData.globalNotifyReadyForCustomer ?? true,
        globalNotifyStaleBays: initialData.globalNotifyStaleBays ?? true,
        globalNotifyBlockers: initialData.globalNotifyBlockers ?? true,
        globalNotifyMissingParts: initialData.globalNotifyMissingParts ?? true,
        globalNotifyBayUpdates: initialData.globalNotifyBayUpdates ?? true,
        upfittingWeeklyHoursTarget: initialData.upfittingWeeklyHoursTarget ?? 250,
        upfittingWeeklyJobsTarget: initialData.upfittingWeeklyJobsTarget ?? 5,
        guestWifiSsid: initialData.guestWifiSsid || 'SAE - Guest',
        guestWifiPassword: initialData.guestWifiPassword || '8557232878'
      });
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setFormData(prev => ({ ...prev, [e.target.name]: value }));
  };

  const handleGetCurrentLocation = () => {
    navigator.geolocation.getCurrentPosition((position) => {
      setFormData(prev => ({
        ...prev,
        siteLat: position.coords.latitude.toString(),
        siteLng: position.coords.longitude.toString()
      }));
      toast.success("Location updated");
    }, (err) => {
      toast.error("Failed to get location: " + err.message);
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenantId || tenantId === 'GLOBAL') return;
    
    setIsUploading(true);
    const uploadPromise = (async () => {
      const fileExt = file.name.split('.').pop() || 'png';
      const storageRef = ref(storage, `businesses/${tenantId}/logo_${Date.now()}.${fileExt}`);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);
      
      setFormData(prev => ({ ...prev, logoUrl: downloadUrl }));
      
      await updateDoc(doc(db, 'businesses', tenantId), {
        logoUrl: downloadUrl,
        updatedAt: new Date()
      });
      
      queryClient.invalidateQueries({ queryKey: ['tenant-dashboard-business', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['business', tenantId] });
      
      if (user) {
        await submitAuditLog(tenantId, {
          userId: user.uid,
          actionType: 'DATA_MUTATION',
          targetEntityId: tenantId,
          details: { action: 'UPLOADED_BUSINESS_LOGO', logoUrl: downloadUrl }
        });
      }
      
      return downloadUrl;
    })();

    toast.promise(uploadPromise, {
      loading: 'Uploading logo...',
      success: 'Logo uploaded successfully!',
      error: 'Failed to upload logo'
    });

    try {
      await uploadPromise;
    } catch (err) {
      console.error('Failed to upload logo:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleLogoRemove = async () => {
    if (!tenantId || tenantId === 'GLOBAL') return;
    
    setIsUploading(true);
    const removePromise = (async () => {
      setFormData(prev => ({ ...prev, logoUrl: '' }));
      
      await updateDoc(doc(db, 'businesses', tenantId), {
        logoUrl: '',
        updatedAt: new Date()
      });
      
      queryClient.invalidateQueries({ queryKey: ['tenant-dashboard-business', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['business', tenantId] });
      
      if (user) {
        await submitAuditLog(tenantId, {
          userId: user.uid,
          actionType: 'DATA_MUTATION',
          targetEntityId: tenantId,
          details: { action: 'REMOVED_BUSINESS_LOGO' }
        });
      }
    })();

    toast.promise(removePromise, {
      loading: 'Removing logo...',
      success: 'Logo removed successfully',
      error: 'Failed to remove logo'
    });

    try {
      await removePromise;
    } catch (err) {
      console.error('Failed to remove logo:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || tenantId === 'GLOBAL' || !user) return;
    setIsSaving(true);
    
    const savePromise = (async () => {
      await updateDoc(doc(db, 'businesses', tenantId), {
        ...formData,
        updatedAt: new Date()
      });

      // Rule 14 Telemetry
      await submitAuditLog(tenantId, {
        userId: user.uid,
        actionType: 'DATA_MUTATION',
        targetEntityId: tenantId,
        details: { action: 'UPDATED_BUSINESS_SETTINGS', changedFields: Object.keys(formData) }
      });
    })();

    toast.promise(savePromise, {
      loading: 'Saving changes...',
      success: 'Settings updated successfully',
      error: 'Failed to save settings'
    });

    try {
      await savePromise;
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };


  const handleTestNotification = () => {
    toast.info('PATROL ALERT TEST', {
      description: 'This is a preview of the emergency notification system.',
      duration: 5000,
      className: 'cop-lights-toast',
    });
  };

  return (
    <div className="max-w-4xl space-y-8 pb-12">

      <form onSubmit={handleSave} className="space-y-8">
        <fieldset disabled={!canManage} className="space-y-8 border-0 p-0 m-0 min-w-0">
        
        {/* Basic Information */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-500/10 rounded-lg">
              <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Basic Information</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Core identity and contact details for the business.</p>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Logo Upload Section */}
            <div className="md:col-span-2 flex flex-col sm:flex-row gap-6 items-center p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800/80 mb-2">
              <div className="relative w-28 h-28 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center overflow-hidden shrink-0 shadow-sm group">
                {formData.logoUrl ? (
                  <img src={formData.logoUrl} alt="Business Logo Preview" className="w-full h-full object-contain p-2" />
                ) : (
                  <div className="text-center p-2 flex flex-col items-center justify-center">
                    <Building2 className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mb-1" />
                    <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">No Logo</span>
                  </div>
                )}
                
                {isUploading && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}
              </div>
              
              <div className="flex-1 space-y-2 text-center sm:text-left">
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white">Business Logo</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md">
                  Upload a high-quality logo (PNG, JPG, SVG or WebP). This logo will represent your company across the site, customized printed QR codes, and device icons.
                </p>
                <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                  <label className={cn(
                    "px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-sm flex items-center gap-1.5 active:scale-95",
                    isUploading && "opacity-50 pointer-events-none"
                  )}>
                    <Upload className="w-3.5 h-3.5" />
                    {formData.logoUrl ? 'Change Logo' : 'Upload Logo'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={isUploading} />
                  </label>
                  
                  {formData.logoUrl && (
                    <button
                      type="button"
                      onClick={handleLogoRemove}
                      disabled={isUploading}
                      className="px-4 py-2 bg-rose-600/10 hover:bg-rose-600 text-rose-600 hover:text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Business Name</label>
              <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Legal Name</label>
              <input type="text" name="legalName" value={formData.legalName} onChange={handleChange} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Email Address</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Phone Number</label>
              <input type="text" name="phone" value={formData.phone} onChange={handleChange} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white" />
            </div>
          </div>
        </section>

        {/* Physical Address */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="p-2 bg-orange-50 dark:bg-orange-500/10 rounded-lg">
              <MapPin className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Physical Address</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Headquarters or main operating location.</p>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Street Address</label>
              <input type="text" name="addressStreet" value={formData.addressStreet} onChange={handleChange} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">City</label>
                <input type="text" name="addressCity" value={formData.addressCity} onChange={handleChange} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">State</label>
                <input type="text" name="addressState" value={formData.addressState} onChange={handleChange} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">ZIP Code</label>
                <input type="text" name="addressZip" value={formData.addressZip} onChange={handleChange} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white" />
              </div>
            </div>
          </div>
        </section>

        {/* Timeclock Configuration */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg">
              <Clock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Timeclock System</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Configure staff attendance and break policies.</p>
            </div>
          </div>
          <div className="p-6 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm font-medium">Enable Timeclock</span>
                  </div>
                  <input type="checkbox" name="timeclockEnabled" checked={formData.timeclockEnabled} onChange={handleChange} className="w-5 h-5 accent-indigo-600" />
                </div>
                <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm font-medium">Require QR Code for Mobile Timeclock</span>
                  </div>
                  <input type="checkbox" name="timeclockRequireQR" checked={formData.timeclockRequireQR} onChange={handleChange} className="w-5 h-5 accent-indigo-600" />
                </div>
                <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm font-medium">Allow Offsite Clock-in</span>
                  </div>
                  <input type="checkbox" name="allowOffsiteClockIn" checked={formData.allowOffsiteClockIn} onChange={handleChange} className="w-5 h-5 accent-indigo-600" />
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Pizza className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm font-medium">Lunch Break is Paid</span>
                  </div>
                  <input type="checkbox" name="lunchPaid" checked={formData.lunchPaid} onChange={handleChange} className="w-5 h-5 accent-indigo-600" />
                </div>
                <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Coffee className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm font-medium">Normal Break is Paid</span>
                  </div>
                  <input type="checkbox" name="breakPaid" checked={formData.breakPaid} onChange={handleChange} className="w-5 h-5 accent-indigo-600" />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Map className="w-4 h-4 text-zinc-400" />
                  <label className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Business Site Coordinates</label>
                </div>
                <button type="button" onClick={handleGetCurrentLocation} className="text-xs font-bold text-indigo-600 hover:text-indigo-500 flex items-center gap-1.5 transition-colors">
                  <MapPin className="w-3 h-3" /> Use Current Location
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">Latitude</label>
                  <input type="text" name="siteLat" value={formData.siteLat} onChange={handleChange} placeholder="e.g. 41.1234" className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white font-mono text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">Longitude</label>
                  <input type="text" name="siteLng" value={formData.siteLng} onChange={handleChange} placeholder="e.g. -73.5678" className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white font-mono text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">Geofence Radius (meters)</label>
                  <input type="number" name="siteRadius" value={formData.siteRadius} onChange={handleChange} placeholder="500" className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white font-mono text-sm" />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-zinc-400" />
                <label className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Payroll & Time Period Settings</label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Payroll Week Ending Day</label>
                  <select 
                    name="payrollWeekEndDay" 
                    value={formData.payrollWeekEndDay} 
                    onChange={(e) => setFormData(prev => ({ ...prev, payrollWeekEndDay: Number(e.target.value) }))}
                    className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white text-sm"
                  >
                    <option value={0}>Sunday (Week runs Monday to Sunday)</option>
                    <option value={1}>Monday (Week runs Tuesday to Monday)</option>
                    <option value={2}>Tuesday (Week runs Wednesday to Tuesday)</option>
                    <option value={3}>Wednesday (Week runs Thursday to Wednesday)</option>
                    <option value={4}>Thursday (Week runs Friday to Thursday)</option>
                    <option value={5}>Friday (Week runs Saturday to Friday)</option>
                    <option value={6}>Saturday (Week runs Sunday to Saturday)</option>
                  </select>
                  <p className="text-[11px] text-zinc-500 mt-1">Defines the boundaries for weekly and pay-period time calculations and reports.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Payroll Cycle Frequency</label>
                  <select 
                    name="payrollCycle" 
                    value={formData.payrollCycle} 
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white text-sm"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly (2 Weeks)</option>
                  </select>
                  <p className="text-[11px] text-zinc-500 mt-1">Specify how often employees are paid to customize the default audit views.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        {/* Monitor & Dashboard Settings */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg">
              <Monitor className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Monitor & Dashboard</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Configure thresholds and visual priorities for shop floor monitors.</p>
            </div>
          </div>
          <div className="p-6 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Urgent Threshold (Hours)
                </label>
                <input 
                  type="number" 
                  name="monitorUrgentThreshold" 
                  value={formData.monitorUrgentThreshold} 
                  onChange={handleChange} 
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white"
                  placeholder="e.g. 4"
                />
                <p className="text-[11px] text-zinc-500 mt-1">Jobs due in less than this many hours will turn Amber.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Stale Threshold (Hours)
                </label>
                <input 
                  type="number" 
                  name="monitorStaleThreshold" 
                  value={formData.monitorStaleThreshold} 
                  onChange={handleChange} 
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white"
                  placeholder="e.g. 24"
                />
                <p className="text-[11px] text-zinc-500 mt-1">Jobs with no updates for this long will pulse Red.</p>
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 mb-4">
                <Palette className="w-4 h-4 text-zinc-400" />
                <label className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Monitor Color Themes</label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Priority / Blocked (Red)</label>
                  <div className="flex items-center gap-2">
                    <input type="color" name="monitorColorBlocked" value={formData.monitorColorBlocked} onChange={handleChange} className="w-8 h-8 rounded border-none cursor-pointer p-0 bg-transparent" />
                    <input type="text" name="monitorColorBlocked" value={formData.monitorColorBlocked} onChange={handleChange} className="flex-1 min-w-0 text-[10px] font-mono bg-transparent border-none dark:text-white p-0" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Issue / Soon Due (Yellow)</label>
                  <div className="flex items-center gap-2">
                    <input type="color" name="monitorColorUrgent" value={formData.monitorColorUrgent} onChange={handleChange} className="w-8 h-8 rounded border-none cursor-pointer p-0 bg-transparent" />
                    <input type="text" name="monitorColorUrgent" value={formData.monitorColorUrgent} onChange={handleChange} className="flex-1 min-w-0 text-[10px] font-mono bg-transparent border-none dark:text-white p-0" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Normal (Blue)</label>
                  <div className="flex items-center gap-2">
                    <input type="color" name="monitorColorActive" value={formData.monitorColorActive} onChange={handleChange} className="w-8 h-8 rounded border-none cursor-pointer p-0 bg-transparent" />
                    <input type="text" name="monitorColorActive" value={formData.monitorColorActive} onChange={handleChange} className="flex-1 min-w-0 text-[10px] font-mono bg-transparent border-none dark:text-white p-0" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Empty (Gray)</label>
                  <div className="flex items-center gap-2">
                    <input type="color" name="monitorColorEmpty" value={formData.monitorColorEmpty} onChange={handleChange} className="w-8 h-8 rounded border-none cursor-pointer p-0 bg-transparent" />
                    <input type="text" name="monitorColorEmpty" value={formData.monitorColorEmpty} onChange={handleChange} className="flex-1 min-w-0 text-[10px] font-mono bg-transparent border-none dark:text-white p-0" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Upfitting Production Goals */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg">
              <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Upfitting Production Goals</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Configure weekly targets to track shop throughput and efficiency.</p>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-2">
                  Weekly Target Hours (Combined)
                </label>
                <input 
                  type="number" 
                  name="upfittingWeeklyHoursTarget" 
                  value={formData.upfittingWeeklyHoursTarget} 
                  onChange={handleChange} 
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white"
                  placeholder="e.g. 250"
                  min="1"
                />
                <p className="text-[11px] text-zinc-500 mt-1">Target weekly hours for the Upfitting department (flat-rate book hours and hourly work combined).</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-2">
                  Weekly Target Jobs Completed
                </label>
                <input 
                  type="number" 
                  name="upfittingWeeklyJobsTarget" 
                  value={formData.upfittingWeeklyJobsTarget} 
                  onChange={handleChange} 
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white"
                  placeholder="e.g. 5"
                  min="1"
                />
                <p className="text-[11px] text-zinc-500 mt-1">Target weekly completed jobs for the shop throughput goals.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Guest Network Settings */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg">
              <Wifi className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Guest Network Settings</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Configure Guest WiFi details for visitor screens (e.g. Conference Room TV).</p>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Guest WiFi SSID (Network Name)
                </label>
                <input 
                  type="text" 
                  name="guestWifiSsid" 
                  value={formData.guestWifiSsid} 
                  onChange={handleChange} 
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white"
                  placeholder="e.g. SAE Guest"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Guest WiFi Password
                </label>
                <input 
                  type="text" 
                  name="guestWifiPassword" 
                  value={formData.guestWifiPassword} 
                  onChange={handleChange} 
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white"
                  placeholder="e.g. saeguest1"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Global Notifications */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="p-2 bg-rose-50 dark:bg-rose-500/10 rounded-lg">
              <BellRing className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Global Notification Controls</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Determine which automated alerts are active across the entire platform.</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <div>
                <span className="text-sm font-bold text-zinc-900 dark:text-white block mb-0.5">Bay Arrivals</span>
                <span className="text-xs text-zinc-500">Alert staff when a vehicle enters a bay</span>
              </div>
              <input type="checkbox" name="globalNotifyBayArrivals" checked={formData.globalNotifyBayArrivals} onChange={handleChange} className="w-5 h-5 accent-indigo-600" />
            </div>
            <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <div>
                <span className="text-sm font-bold text-zinc-900 dark:text-white block mb-0.5">General Bay Updates</span>
                <span className="text-xs text-zinc-500">Alert staff when a user updates a bay's status, notes, or ETA</span>
              </div>
              <input type="checkbox" name="globalNotifyBayUpdates" checked={formData.globalNotifyBayUpdates} onChange={handleChange} className="w-5 h-5 accent-indigo-600" />
            </div>
            <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <div>
                <span className="text-sm font-bold text-zinc-900 dark:text-white block mb-0.5">Stale Bays Warning</span>
                <span className="text-xs text-zinc-500">Alert staff when a bay has been inactive beyond the threshold</span>
              </div>
              <input type="checkbox" name="globalNotifyStaleBays" checked={formData.globalNotifyStaleBays} onChange={handleChange} className="w-5 h-5 accent-indigo-600" />
            </div>
            <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <div>
                <span className="text-sm font-bold text-zinc-900 dark:text-white block mb-0.5">Job Ready for QC</span>
                <span className="text-xs text-zinc-500">Alert staff when a job's status changes to "Ready for QC"</span>
              </div>
              <input type="checkbox" name="globalNotifyReadyForQA" checked={formData.globalNotifyReadyForQA} onChange={handleChange} className="w-5 h-5 accent-indigo-600" />
            </div>
            <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <div>
                <span className="text-sm font-bold text-zinc-900 dark:text-white block mb-0.5">Job Ready for Customer</span>
                <span className="text-xs text-zinc-500">Alert staff when a job's status changes to "Ready for Customer"</span>
              </div>
              <input type="checkbox" name="globalNotifyReadyForCustomer" checked={formData.globalNotifyReadyForCustomer} onChange={handleChange} className="w-5 h-5 accent-indigo-600" />
            </div>
            <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <div>
                <span className="text-sm font-bold text-zinc-900 dark:text-white block mb-0.5">Active Blockers</span>
                <span className="text-xs text-zinc-500">Alert staff when a blocker is added to a job or bay</span>
              </div>
              <input type="checkbox" name="globalNotifyBlockers" checked={formData.globalNotifyBlockers} onChange={handleChange} className="w-5 h-5 accent-indigo-600" />
            </div>
            <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <div>
                <span className="text-sm font-bold text-zinc-900 dark:text-white block mb-0.5">Missing Parts Requests</span>
                <span className="text-xs text-zinc-500">Alert staff when missing parts are requested</span>
              </div>
              <input type="checkbox" name="globalNotifyMissingParts" checked={formData.globalNotifyMissingParts} onChange={handleChange} className="w-5 h-5 accent-indigo-600" />
            </div>
            
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-zinc-900 dark:text-white block">Preview Alert System</span>
                <span className="text-xs text-zinc-500">Test the "Patrol Mode" cop light notification effect</span>
              </div>
              <button 
                type="button"
                onClick={handleTestNotification}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors shadow-lg shadow-rose-900/20"
              >
                Trigger Test Alert
              </button>
            </div>
          </div>
        </section>

        {/* API Integrations */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="p-2 bg-purple-50 dark:bg-purple-500/10 rounded-lg">
              <Link2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">API & Integrations</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Tokens and keys for third-party services.</p>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">CompanyCam Access Token</label>
              <input type="password" name="companyCamToken" value={formData.companyCamToken} onChange={handleChange} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white font-mono text-sm" placeholder="wR9hCSKpZIT0..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">CompanyCam Refresh Token</label>
              <input type="password" name="companyCamRefreshToken" value={formData.companyCamRefreshToken} onChange={handleChange} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white font-mono text-sm" />
            </div>
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">EasyPost API Key</label>
              <input type="password" name="easyPostApiKey" value={formData.easyPostApiKey} onChange={handleChange} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all dark:text-white font-mono text-sm" />
            </div>
          </div>
        </section>


        </fieldset>

        {canManage && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium shadow-sm shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {isSaving ? 'Saving Changes...' : 'Save Settings'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
