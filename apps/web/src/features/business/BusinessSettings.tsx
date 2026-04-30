import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../lib/auth/store';
import { doc, updateDoc, collection, getDocs, writeBatch, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { submitAuditLog } from '../../lib/logging/audit';
import { Building2, MapPin, Link2, Save, DownloadCloud } from 'lucide-react';

export function BusinessSettings({ tenantId, initialData }: { tenantId: string; initialData?: any }) {
  const { user } = useAuthStore();
  const [isSaving, setIsSaving] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [message, setMessage] = useState('');

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
    easyPostApiKey: initialData?.easyPostApiKey || ''
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
        easyPostApiKey: initialData.easyPostApiKey || ''
      });
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || tenantId === 'GLOBAL' || !user) return;
    setIsSaving(true);
    setMessage('');
    try {
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

      setMessage('Settings saved successfully.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setMessage('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMigrateLegacyVehicles = async () => {
    if (!tenantId || tenantId === 'GLOBAL') return;
    if (!window.confirm("Are you sure you want to import legacy vehicles? This will copy them from the root database to this business.")) return;
    
    setIsMigrating(true);
    setMessage('');
    try {
      const q = query(collection(db, 'vehicles'), where('tenantId', '==', tenantId));
      const rootVehiclesSnap = await getDocs(q);
      
      if (rootVehiclesSnap.empty) {
        setMessage('No legacy vehicles found to import for this business.');
        setIsMigrating(false);
        return;
      }

      const batch = writeBatch(db);
      let count = 0;

      rootVehiclesSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const destRef = doc(db, 'businesses', tenantId, 'vehicles', docSnap.id);
        
        // We do NOT delete the original, just clone it to the business sublevel.
        batch.set(destRef, {
          ...data,
          source: 'Legacy Migration',
          migratedAt: new Date(),
        }, { merge: true });
        count++;
      });

      await batch.commit();
      
      await submitAuditLog(tenantId, {
        userId: user!.uid,
        actionType: 'DATA_MUTATION',
        targetEntityId: tenantId,
        details: { action: 'MIGRATED_LEGACY_VEHICLES', count }
      });

      setMessage(`Successfully imported ${count} legacy vehicles!`);
    } catch (err) {
      console.error('Failed to migrate vehicles:', err);
      setMessage('Failed to migrate vehicles. Make sure you have Super Admin permissions.');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8 pb-12">
      {message && (
        <div className={`p-4 rounded-xl text-sm font-medium ${message.includes('success') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'}`}>
          {message}
        </div>
      )}

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

        {/* Legacy Data Management */}
        <section className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-amber-200 dark:border-amber-500/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-500/20 rounded-lg">
                <DownloadCloud className="w-5 h-5 text-amber-700 dark:text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100">Legacy Data Management</h2>
                <p className="text-sm text-amber-700 dark:text-amber-400/80">Import data from older versions of the platform.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleMigrateLegacyVehicles}
              disabled={isMigrating}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            >
              {isMigrating ? 'Importing...' : 'Import Legacy Vehicles'}
            </button>
          </div>
          <div className="p-4 px-6 text-sm text-amber-800 dark:text-amber-500/80">
            Clicking this will scan the root legacy database for any vehicles from V1 and safely copy them into this business's operational database. The original records will not be deleted.
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
