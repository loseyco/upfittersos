import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { submitAuditLog } from '../../lib/logging/audit';
import { Save, Loader2, CheckCircle2, UserCircle, MapPin, Briefcase, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

export interface UserProfile {
  firstName: string;
  middleName?: string;
  lastName: string;
  nickName?: string;
  dob?: string;
  bio?: string;
  phone?: string;
  mobilePhone?: string;
  workPhone?: string;
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  jobTitle?: string;
  department?: string;
  role?: string;
  payRate?: string | number;
  payType?: string;
  startDate?: string;
  notes?: string;
  keepScreenAwake?: boolean;
}

// Reusable oversized input component conforming to Rule 15
function FormInput({ label, value, onChange, type = "text", placeholder = "", required = false }: any) {
  return (
    <div>
      <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-14 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-xl px-4 text-lg text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all shadow-sm"
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}

// Reusable oversized toggle component conforming to Rule 15
function FormToggle({ label, description, checked, onChange }: any) {
  return (
    <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl cursor-pointer active:scale-[0.98] transition-transform" onClick={() => onChange(!checked)}>
      <div>
        <p className="font-semibold text-lg text-zinc-900 dark:text-white">{label}</p>
        {description && <p className="text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
      </div>
      <div className={`w-14 h-8 flex items-center rounded-full p-1 transition-colors ${checked ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
        <div className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
      </div>
    </div>
  );
}

export function UserProfileForm({ onComplete }: { onComplete?: () => void }) {
  const { user, isSuperAdmin, tenantId } = useAuthStore();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<UserProfile>>({});

  const { data: profile, isLoading } = useQuery({
    queryKey: ['userProfile', user?.uid],
    queryFn: async () => {
      if (!user?.uid) return null;
      const snap = await getDoc(doc(db, 'users', user.uid));
      return snap.exists() ? snap.data() as UserProfile : null;
    },
    enabled: !!user?.uid
  });

  useEffect(() => {
    if (profile) setFormData((prev) => ({ ...prev, ...profile }));
  }, [profile]);

  const mutation = useMutation({
    mutationFn: async (newData: Partial<UserProfile>) => {
      if (!user?.uid) throw new Error('No user authenticated');
      
      // Update logic maintaining createdAt via merge
      await setDoc(doc(db, 'users', user.uid), {
        ...newData,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      // Rule 14 Telemetry
      await submitAuditLog(isSuperAdmin ? 'GLOBAL' : (tenantId || 'GLOBAL'), {
        userId: user.uid,
        actionType: 'DATA_MUTATION',
        targetEntityId: user.uid,
        details: { action: 'UPDATED_PROFILE' } // Omitting full payload for generic telemetry
      });
    },
    onMutate: () => {
      toast.loading('Synchronizing context...', { id: 'save-profile' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile', user?.uid] });
      toast.success('Your profile ecosystem was synced successfully.', { 
        id: 'save-profile',
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />
      });
      if (onComplete) onComplete();
    },
    onError: (err) => {
      toast.error(`System fault: ${err.message}`, { id: 'save-profile' });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const updateField = (field: keyof UserProfile, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-8 w-full">
         <div className="h-14 bg-zinc-200 dark:bg-zinc-800 rounded-xl w-full"></div>
         <div className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-xl w-full"></div>
         <div className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-xl w-full"></div>
      </div>
    );
  }

  return (
    <form id="profile-form" onSubmit={handleSubmit} className="w-full flex flex-col min-h-full gap-8">
      
      {/* Category 1: Identity */}
      <section className="space-y-4">
        <h3 className="text-xl flex items-center gap-2 font-bold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-zinc-800 pb-2">
          <UserCircle className="w-6 h-6 text-indigo-500" /> Identity
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput label="First Name" required value={formData.firstName} onChange={(v: string) => updateField('firstName', v)} />
          <FormInput label="Last Name" required value={formData.lastName} onChange={(v: string) => updateField('lastName', v)} />
          <FormInput label="Middle Name" value={formData.middleName} onChange={(v: string) => updateField('middleName', v)} />
          <FormInput label="Nick Name" value={formData.nickName} onChange={(v: string) => updateField('nickName', v)} />
          <FormInput label="Date of Birth" type="date" value={formData.dob} onChange={(v: string) => updateField('dob', v)} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Biography</label>
          <textarea
            value={formData.bio || ''}
            onChange={(e) => updateField('bio', e.target.value)}
            className="w-full min-h-[100px] p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-xl text-lg text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y"
            placeholder="A brief background..."
          />
        </div>
      </section>

      {/* Category 2: Contact & Location */}
      <section className="space-y-4">
        <h3 className="text-xl flex items-center gap-2 font-bold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-zinc-800 pb-2">
          <MapPin className="w-6 h-6 text-emerald-500" /> Contact & Location
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput label="Mobile Phone" type="tel" value={formData.mobilePhone} onChange={(v: string) => updateField('mobilePhone', v)} />
          <FormInput label="Personal Phone" type="tel" value={formData.phone} onChange={(v: string) => updateField('phone', v)} />
          <FormInput label="Work Phone" type="tel" value={formData.workPhone} onChange={(v: string) => updateField('workPhone', v)} />
        </div>
        <div className="grid grid-cols-1 gap-4 pt-2">
          <FormInput label="Street Address" value={formData.addressStreet} onChange={(v: string) => updateField('addressStreet', v)} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <FormInput label="City" value={formData.addressCity} onChange={(v: string) => updateField('addressCity', v)} />
            </div>
            <div className="sm:col-span-1">
              <FormInput label="State" value={formData.addressState} onChange={(v: string) => updateField('addressState', v)} />
            </div>
            <div className="sm:col-span-1">
              <FormInput label="Zip Code" value={formData.addressZip} onChange={(v: string) => updateField('addressZip', v)} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-red-50 dark:bg-red-500/10 p-4 rounded-2xl border border-red-100 dark:border-red-500/20 mt-4">
          <FormInput label="Emergency Contact Name" value={formData.emergencyContactName} onChange={(v: string) => updateField('emergencyContactName', v)} />
          <FormInput label="Emergency Contact Phone" type="tel" value={formData.emergencyContactPhone} onChange={(v: string) => updateField('emergencyContactPhone', v)} />
        </div>
      </section>

      {/* Category 3: Employment */}
      <section className="space-y-4">
        <h3 className="text-xl flex items-center gap-2 font-bold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-zinc-800 pb-2">
          <Briefcase className="w-6 h-6 text-amber-500" /> Employment Details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput label="Job Title" value={formData.jobTitle} onChange={(v: string) => updateField('jobTitle', v)} />
          <FormInput label="Department" value={formData.department} onChange={(v: string) => updateField('department', v)} />
          <FormInput label="Primary Role" value={formData.role} onChange={(v: string) => updateField('role', v)} />
          <FormInput label="Start Date" type="date" value={formData.startDate} onChange={(v: string) => updateField('startDate', v)} />
          <FormInput label="Pay Rate" type="number" value={formData.payRate} onChange={(v: string) => updateField('payRate', v)} placeholder="e.g. 32" />
          <FormInput label="Pay Type" value={formData.payType} onChange={(v: string) => updateField('payType', v)} placeholder="hourly / salary" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Administrative Notes</label>
          <textarea
            value={formData.notes || ''}
            onChange={(e) => updateField('notes', e.target.value)}
            className="w-full min-h-[80px] p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-xl text-lg text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y"
            placeholder="Internal notes regarding this staff member..."
          />
        </div>
      </section>

      {/* Category 4: System Setup */}
      <section className="space-y-4">
        <h3 className="text-xl flex items-center gap-2 font-bold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-zinc-800 pb-2">
          <Settings2 className="w-6 h-6 text-zinc-500" /> Device Preferences
        </h3>
        <FormToggle 
          label="Keep Screen Awake" 
          description="Prevents the device from sleeping while UpfittersOS is open (heavy battery impact)."
          checked={formData.keepScreenAwake || false} 
          onChange={(v: boolean) => updateField('keepScreenAwake', v)} 
        />
      </section>

      <div className="pt-8 mt-auto sticky bottom-0 bg-white dark:bg-zinc-950 pb-4 border-t border-zinc-200 dark:border-zinc-800">
        <button
          type="submit"
          disabled={mutation.isPending || isLoading}
          className="w-full h-16 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xl rounded-2xl flex items-center justify-center gap-3 active:scale-[0.96] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              Syncing Core...
            </>
          ) : (
            <>
              <Save className="w-6 h-6 group-hover:scale-110 transition-transform" />
              Save Context
            </>
          )}
        </button>
      </div>
    </form>
  );
}
