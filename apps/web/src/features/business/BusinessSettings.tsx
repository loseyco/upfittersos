import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { submitAuditLog } from '../../lib/logging/audit';
import { Building2, MapPin, Link2, Save, Clock, Coffee, Pizza, Map } from 'lucide-react';
import { toast } from 'sonner';

export function BusinessSettings({ tenantId, initialData }: { tenantId: string; initialData?: any }) {
  const { user } = useAuthStore();
  const [isSaving, setIsSaving] = useState(false);

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
    allowOffsiteClockIn: initialData?.allowOffsiteClockIn ?? false,
    lunchPaid: initialData?.lunchPaid ?? false,
    breakPaid: initialData?.breakPaid ?? false,
    siteLat: initialData?.siteLat || '',
    siteLng: initialData?.siteLng || '',
    siteRadius: initialData?.siteRadius || 500
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
        allowOffsiteClockIn: initialData.allowOffsiteClockIn ?? false,
        lunchPaid: initialData.lunchPaid ?? false,
        breakPaid: initialData.breakPaid ?? false,
        siteLat: initialData.siteLat || '',
        siteLng: initialData.siteLng || '',
        siteRadius: initialData.siteRadius || 500
      });
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
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


  return (
    <div className="max-w-4xl space-y-8 pb-12">

      <form onSubmit={handleSave} className="space-y-8">
        
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

      </form>
    </div>
  );
}
