import { useState, useEffect } from 'react';
import {
  ShieldCheck, BookOpen, FileSpreadsheet, ClipboardList,
  GraduationCap, AlertTriangle, Plus, Search, CheckCircle2,
  Flame, LifeBuoy, UserCheck, ChevronRight, Trash2, Settings
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection, getDocs, addDoc, doc, setDoc, deleteDoc,
  serverTimestamp, query, orderBy, getDoc
} from 'firebase/firestore';
import { db } from '../../../lib/firebase/config';
import { useAuthStore } from '../../../lib/auth/store';

interface SafetyManagerProps {
  tenantId: string;
  activeTab?: string;
}

// ---------------------------------------------------------------------------
// Standard OSHA 1910 Reference Templates (Real Federal Standards)
// ---------------------------------------------------------------------------
const CORE_OSHA_STANDARDS = [
  {
    code: '1910.132',
    title: 'Personal Protective Equipment (PPE)',
    category: 'General Safety',
    description: 'Requires assessment of shop hazard areas, provision of appropriate eye/face, hand, foot, and head protection, and mandatory staff training.',
    requirements: [
      'Conduct written hazard assessment for all upfitting & fabrication bays',
      'Provide OSHA-approved safety glasses (ANSI Z87.1) for all shop personnel',
      'Mandatory steel-toe footwear in active work areas',
      'Ensure availability of cut-resistant gloves for sheet metal & harness work'
    ],
    severity: 'High'
  },
  {
    code: '1910.1200',
    title: 'Hazard Communication (HazCom / SDS)',
    category: 'Chemical Safety',
    description: 'Governs hazardous chemicals, container labeling, availability of Safety Data Sheets (SDS), and employee right-to-know training.',
    requirements: [
      'Maintain an updated electronic and printed SDS binder accessible to all staff',
      'Ensure secondary chemical containers are labeled with GHS pictograms',
      'Annual HazCom right-to-know refresher training for technicians',
      'Proper flammable storage cabinets for aerosol, solvent, and paint storage'
    ],
    severity: 'Critical'
  },
  {
    code: '1910.147',
    title: 'Lockout / Tagout (LOTO)',
    category: 'Electrical & Machinery',
    description: 'Control of hazardous energy sources during servicing and maintenance of shop machinery, vehicle high-voltage batteries, and power tools.',
    requirements: [
      'Written energy control procedures for vehicle lifts, air compressors, and presses',
      'Provide standardized LOTO padlocks and danger tags to authorized techs',
      'High-voltage EV/Hybrid battery disconnect protocols for upfitters',
      'Annual inspection of LOTO procedures and authorized employee audit'
    ],
    severity: 'Critical'
  },
  {
    code: '1910.107',
    title: 'Spray Finishing & Painting',
    category: 'Fire & Ventilation',
    description: 'Standards for spray booths, flammable liquid storage, spray application, and fire protection equipment.',
    requirements: [
      'Approved spray booth with continuous mechanical ventilation',
      'Explosion-proof electrical fixtures within 20 feet of spray area',
      'Proper grounding and bonding of containers during spray transfer',
      'Respirator fit testing and medical clearance for spray technicians'
    ],
    severity: 'High'
  },
  {
    code: '1910.252',
    title: 'Welding, Cutting, & Brazing',
    category: 'Hot Work',
    description: 'Fire prevention, personnel protection, health protection, and ventilation during welding and metal cutting operations.',
    requirements: [
      'Hot work permit protocol when welding near flammable vehicle interiors',
      'Welding curtains and shade 10-12 helmets for arc welding',
      'Designated fire watch 30 minutes post welding/cutting activities',
      'Compressed gas cylinder securing (upright chained) and cap protection'
    ],
    severity: 'High'
  },
  {
    code: '1910.151',
    title: 'Medical Services & Eyewash Stations',
    category: 'First Aid',
    description: 'Requires immediate emergency eyewash access (within 10 seconds / 55 feet) where corrosive chemicals or battery acid are handled.',
    requirements: [
      'Plumbed or self-contained emergency eyewash stations tested weekly',
      'Fully stocked First Aid stations in Main Shop and Fabrication area',
      'At least 2 staff members per shift certified in First Aid / CPR / AED',
      'Clear unobstructed path to eyewash stations at all times'
    ],
    severity: 'Critical'
  },
  {
    code: '1910.178',
    title: 'Powered Industrial Trucks & Lifts',
    category: 'Equipment Safety',
    description: 'Covers operation, maintenance, and safety inspections of forklifts, vehicle lifts, and overhead hoists.',
    requirements: [
      'Formal 3-year operator training & evaluation for all forklift drivers',
      'Pre-shift daily checklist inspection for forklifts and vehicle lifts',
      'Weight capacity ratings clearly posted on all 2-post and 4-post lifts',
      'Safety latch mechanism checks performed monthly by certified vendor'
    ],
    severity: 'High'
  },
  {
    code: '1910.303',
    title: 'Electrical Safety & Panel Clearances',
    category: 'Electrical',
    description: 'Requires clear working space around electrical panels, proper grounding, and prohibition of temporary flexible cord abuse.',
    requirements: [
      '3-foot clear working space in front of all breaker panels (no clutter)',
      'GFCI protection for outlets within 6 feet of sinks or water sources',
      'Industrial heavy-duty cords only; extension cords prohibited as permanent wiring',
      'Prompt replacement of worn, frayed, or damaged power tool cords'
    ],
    severity: 'Medium'
  }
];

export function SafetyManager({ tenantId, activeTab: initialRoute }: SafetyManagerProps) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const mapRouteToTab = (route?: string) => {
    if (route === 'safety_standards') return 'standards';
    if (route === 'safety_sds') return 'sds';
    if (route === 'safety_incidents') return 'incidents';
    if (route === 'safety_inspections') return 'inspections';
    if (route === 'safety_training') return 'training';
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<'overview' | 'standards' | 'sds' | 'incidents' | 'inspections' | 'training'>(
    mapRouteToTab(initialRoute)
  );

  // Search & Modals
  const [searchTerm, setSearchTerm] = useState('');
  const [sdsSearch, setSdsSearch] = useState('');
  const [showNewIncidentModal, setShowNewIncidentModal] = useState(false);
  const [showNewSdsModal, setShowNewSdsModal] = useState(false);
  const [showNewCertModal, setShowNewCertModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Forms
  const [incidentForm, setIncidentForm] = useState({
    title: '',
    type: 'Near-Miss',
    severity: 'Low',
    location: 'Upfitter Bay',
    reporter: user?.displayName || user?.email || '',
    description: '',
    actionTaken: '',
    lostTime: false,
    incidentDate: new Date().toISOString().split('T')[0]
  });

  const [sdsForm, setSdsForm] = useState({
    name: '',
    manufacturer: '',
    hazardClass: 'Flammable Liquid',
    location: 'Main Bay Storage',
    ghsCode: 'GHS02, GHS07',
    emergencyFirstAid: '',
    docUrl: ''
  });

  const [certForm, setCertForm] = useState({
    staffName: '',
    certTitle: 'OSHA 10-Hour General Industry',
    category: 'OSHA Standards',
    issueDate: new Date().toISOString().split('T')[0],
    expDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: ''
  });

  const [settingsForm, setSettingsForm] = useState({
    trackingStartDate: new Date().toISOString().split('T')[0],
    emergencyContacts: [
      { title: 'Shop Safety Manager', phone: '(555) 019-2831', desc: 'Direct On-Site Lead' },
      { title: 'OSHA Reporting Hotline', phone: '1-800-321-6742', desc: 'Federal 24/7 Helpline' },
      { title: 'Poison Control Center', phone: '1-800-222-1222', desc: 'Emergency Chemical Triage' },
      { title: 'Local Emergency Medical', phone: '911', desc: 'Fire / Rescue Services' }
    ]
  });

  // ---------------------------------------------------------------------------
  // Firestore Queries
  // ---------------------------------------------------------------------------

  // Incidents Query
  const { data: incidentsList = [] } = useQuery({
    queryKey: ['safety_incidents', tenantId],
    queryFn: async () => {
      const q = query(collection(db, `businesses/${tenantId}/safety_incidents`), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  });

  // SDS Query
  const { data: sdsList = [] } = useQuery({
    queryKey: ['safety_sds', tenantId],
    queryFn: async () => {
      const q = query(collection(db, `businesses/${tenantId}/safety_sds`), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  });

  // Certifications Query
  const { data: certsList = [] } = useQuery({
    queryKey: ['safety_certifications', tenantId],
    queryFn: async () => {
      const q = query(collection(db, `businesses/${tenantId}/safety_certifications`), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  });

  // Active Staff Directory Query
  const { data: activeStaffList = [] } = useQuery({
    queryKey: ['active_staff_directory', tenantId],
    queryFn: async () => {
      try {
        const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
        return snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(s => !s.isArchived && !s.fireDate)
          .map(s => {
            const fullName = `${s.firstName || ''} ${s.lastName || ''}`.trim();
            return {
              id: s.id,
              name: s.name || (fullName.length > 0 ? fullName : s.displayName || s.email || 'Unnamed Staff')
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch (err) {
        console.warn('Could not fetch active staff:', err);
        return [];
      }
    }
  });

  // Auto-select default staff name when staff list loads
  useEffect(() => {
    if (!certForm.staffName && activeStaffList.length > 0) {
      setCertForm(prev => ({ ...prev, staffName: activeStaffList[0].name }));
    }
  }, [activeStaffList]);

  // OSHA Standards Status Overrides Query
  const { data: standardsStatusMap = {} } = useQuery({
    queryKey: ['safety_standards', tenantId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, `businesses/${tenantId}/safety_standards`));
      const map: Record<string, { status: string; notes?: string }> = {};
      snap.docs.forEach(d => {
        map[d.id] = d.data() as any;
      });
      return map;
    }
  });

  // Safety Settings Query
  const { data: safetySettings } = useQuery({
    queryKey: ['safety_settings', tenantId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, `businesses/${tenantId}/safety_settings`, 'config'));
      if (snap.exists()) {
        const data = snap.data();
        setSettingsForm({
          trackingStartDate: data.trackingStartDate || new Date().toISOString().split('T')[0],
          emergencyContacts: data.emergencyContacts || settingsForm.emergencyContacts
        });
        return data;
      }
      return null;
    }
  });

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const addIncidentMutation = useMutation({
    mutationFn: async (data: typeof incidentForm) => {
      await addDoc(collection(db, `businesses/${tenantId}/safety_incidents`), {
        ...data,
        status: 'Open',
        createdAt: serverTimestamp()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety_incidents', tenantId] });
      setShowNewIncidentModal(false);
      setIncidentForm({
        title: '',
        type: 'Near-Miss',
        severity: 'Low',
        location: 'Upfitter Bay',
        reporter: user?.displayName || user?.email || '',
        description: '',
        actionTaken: '',
        lostTime: false,
        incidentDate: new Date().toISOString().split('T')[0]
      });
    }
  });

  const deleteIncidentMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, `businesses/${tenantId}/safety_incidents`, id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety_incidents', tenantId] });
    }
  });

  const addSdsMutation = useMutation({
    mutationFn: async (data: typeof sdsForm) => {
      await addDoc(collection(db, `businesses/${tenantId}/safety_sds`), {
        ...data,
        createdAt: serverTimestamp()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety_sds', tenantId] });
      setShowNewSdsModal(false);
      setSdsForm({
        name: '',
        manufacturer: '',
        hazardClass: 'Flammable Liquid',
        location: 'Main Bay Storage',
        ghsCode: 'GHS02, GHS07',
        emergencyFirstAid: '',
        docUrl: ''
      });
    }
  });

  const deleteSdsMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, `businesses/${tenantId}/safety_sds`, id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety_sds', tenantId] });
    }
  });

  const addCertMutation = useMutation({
    mutationFn: async (data: typeof certForm) => {
      await addDoc(collection(db, `businesses/${tenantId}/safety_certifications`), {
        ...data,
        createdAt: serverTimestamp()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety_certifications', tenantId] });
      setShowNewCertModal(false);
      setCertForm({
        staffName: '',
        certTitle: 'OSHA 10-Hour General Industry',
        category: 'OSHA Standards',
        issueDate: new Date().toISOString().split('T')[0],
        expDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes: ''
      });
    }
  });

  const deleteCertMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, `businesses/${tenantId}/safety_certifications`, id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety_certifications', tenantId] });
    }
  });

  const updateStandardStatusMutation = useMutation({
    mutationFn: async ({ code, status }: { code: string; status: string }) => {
      await setDoc(doc(db, `businesses/${tenantId}/safety_standards`, code), {
        status,
        updatedAt: serverTimestamp()
      }, { merge: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety_standards', tenantId] });
    }
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (data: typeof settingsForm) => {
      await setDoc(doc(db, `businesses/${tenantId}/safety_settings`, 'config'), {
        ...data,
        updatedAt: serverTimestamp()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety_settings', tenantId] });
      setShowSettingsModal(false);
    }
  });

  // ---------------------------------------------------------------------------
  // Dynamic Calculations (Real Data)
  // ---------------------------------------------------------------------------

  // Calculate Days Without Lost-Time Incident
  const calculateDaysWithoutIncident = () => {
    // Find most recent lost-time or high-severity injury incident
    const injuryIncidents = (incidentsList as any[]).filter(
      i => i.lostTime || i.type === 'Minor Injury' || i.type === 'Injury' || i.severity === 'Critical'
    );

    let baselineDate = safetySettings?.trackingStartDate
      ? new Date(safetySettings.trackingStartDate)
      : new Date();

    if (injuryIncidents.length > 0) {
      const mostRecent = injuryIncidents.reduce((latest, current) => {
        const currentDate = new Date(current.incidentDate || current.createdAt?.toDate?.() || Date.now());
        return currentDate > latest ? currentDate : latest;
      }, new Date(0));
      baselineDate = mostRecent;
    }

    const diffTime = Math.abs(Date.now() - baselineDate.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysWithoutIncident = calculateDaysWithoutIncident();

  // Calculate Real OSHA Compliance Score
  const calculateComplianceScore = () => {
    let compliantCount = 0;
    CORE_OSHA_STANDARDS.forEach(std => {
      const currentStatus = standardsStatusMap[std.code]?.status || 'Compliant';
      if (currentStatus === 'Compliant') compliantCount++;
    });
    return Math.round((compliantCount / CORE_OSHA_STANDARDS.length) * 100);
  };

  const complianceScore = calculateComplianceScore();

  // Calculate Real Cert Statuses
  const getCertStatus = (expDate: string) => {
    if (!expDate) return 'Valid';
    const exp = new Date(expDate).getTime();
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    if (exp < now) return 'Expired';
    if (exp - now < thirtyDays) return 'Expiring Soon';
    return 'Valid';
  };

  const pendingCertsCount = (certsList as any[]).filter(
    c => getCertStatus(c.expDate) === 'Expired' || getCertStatus(c.expDate) === 'Expiring Soon'
  ).length;

  const contactsList = safetySettings?.emergencyContacts || settingsForm.emergencyContacts;

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-zinc-900 via-emerald-950 to-zinc-900 p-6 md:p-8 border border-emerald-900/40 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-inner">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2">
                  Safety & OSHA Compliance Center
                </h1>
                <p className="text-sm text-emerald-400/90 font-medium">
                  Live Environmental Health & Safety, OSHA 1910 Standards, SDS Binders & Incident Logs
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowNewIncidentModal(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-rose-950/40 border border-rose-500/30 transition-all transform active:scale-95"
            >
              <AlertTriangle className="h-4 w-4" />
              Report Incident / Near-Miss
            </button>
            <button
              onClick={() => setShowNewSdsModal(true)}
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2.5 rounded-xl font-semibold text-sm border border-zinc-700 transition-all"
            >
              <Plus className="h-4 w-4 text-emerald-400" />
              Add SDS Sheet
            </button>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl border border-zinc-700 transition-all"
              title="Safety Configuration & Emergency Contacts"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Ambient background glow */}
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800 overflow-x-auto pb-1 no-scrollbar">
        {[
          { id: 'overview', label: 'Safety Overview', icon: ShieldCheck },
          { id: 'standards', label: 'OSHA Standards', icon: BookOpen },
          { id: 'sds', label: 'SDS & HazMat Binders', icon: FileSpreadsheet, badge: sdsList.length },
          { id: 'incidents', label: 'Incident & Near-Miss Log', icon: ClipboardList, badge: incidentsList.length },
          { id: 'training', label: 'Training & Certs', icon: GraduationCap, badge: certsList.length }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2.5 px-4 py-2.5 font-bold text-sm rounded-t-xl transition-all whitespace-nowrap border-b-2 ${
                isActive
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-emerald-400' : 'text-zinc-400'}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`px-2 py-0.5 text-xs rounded-full font-bold ${
                  isActive ? 'bg-emerald-500/30 text-emerald-300' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: SAFETY OVERVIEW & DASHBOARD */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metrics Grid (Calculated from Real Data) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Days Without Lost-Time Incident</span>
                <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Flame className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">{daysWithoutIncident}</span>
                <span className="text-xs text-emerald-400 font-semibold">Days Active</span>
              </div>
              <p className="mt-2 text-xs text-zinc-400">Calculated from logged shop incidents.</p>
            </div>

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">OSHA Compliance Score</span>
                <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-emerald-400">{complianceScore}%</span>
                <span className="text-xs text-zinc-400 font-semibold">OSHA 1910 Evaluated</span>
              </div>
              <div className="mt-2 w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${complianceScore}%` }} />
              </div>
            </div>

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Active HazMat SDS Sheets</span>
                <span className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <FileSpreadsheet className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">{sdsList.length}</span>
                <span className="text-xs text-emerald-400 font-semibold">In Database</span>
              </div>
              <p className="mt-2 text-xs text-zinc-400">Chemical inventory sheets digitized.</p>
            </div>

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Pending Cert Renewals</span>
                <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <GraduationCap className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className={`text-3xl font-black ${pendingCertsCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {pendingCertsCount}
                </span>
                <span className="text-xs text-zinc-400 font-semibold">Staff Members</span>
              </div>
              <p className="mt-2 text-xs text-zinc-400">Certifications expiring or expired.</p>
            </div>
          </div>

          {/* Emergency Response Quick Action Bar */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                <LifeBuoy className="h-4 w-4 text-emerald-400" />
                Shop Floor Emergency Action Stations & Contacts
              </h3>
              <button
                onClick={() => setShowSettingsModal(true)}
                className="text-xs text-emerald-400 hover:underline font-semibold"
              >
                Configure Contacts
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {contactsList.map((item: any, i: number) => (
                <div key={i} className="p-4 bg-zinc-950/70 border border-zinc-800/80 rounded-xl hover:border-emerald-500/30 transition-all">
                  <span className="text-xs font-semibold text-zinc-400">{item.desc}</span>
                  <div className="font-bold text-white text-base mt-1">{item.title}</div>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm font-mono font-bold">
                    {item.phone}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Real Incident Activity Feed */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-emerald-400" />
                  Recent Logged Incidents & Reports
                </h3>
                <button
                  onClick={() => setActiveTab('incidents')}
                  className="text-xs text-emerald-400 hover:underline font-semibold flex items-center gap-1"
                >
                  View All ({incidentsList.length}) <ChevronRight className="h-3 w-3" />
                </button>
              </div>

              {incidentsList.length === 0 ? (
                <div className="p-8 text-center bg-zinc-950/40 border border-dashed border-zinc-800 rounded-xl space-y-3">
                  <ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto" />
                  <div className="text-sm font-bold text-zinc-300">No Incidents Logged Yet</div>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    Your safety log is clean. Use the "Report Incident / Near-Miss" button to log safety occurrences.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(incidentsList as any[]).slice(0, 4).map(inc => (
                    <div key={inc.id} className="p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-xs font-bold rounded-md ${
                            inc.severity === 'High' || inc.severity === 'Critical'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : inc.severity === 'Medium'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}>
                            {inc.type} • {inc.severity}
                          </span>
                          <span className="text-xs text-zinc-500 font-mono">{inc.incidentDate || inc.date}</span>
                        </div>
                        <h4 className="text-sm font-bold text-white">{inc.title}</h4>
                        <p className="text-xs text-zinc-400 line-clamp-1">{inc.description}</p>
                      </div>

                      <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                        {inc.status || 'Open'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* OSHA Compliance Status */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-amber-400" />
                  OSHA Standards Status
                </h3>
                <button
                  onClick={() => setActiveTab('standards')}
                  className="text-xs text-emerald-400 hover:underline font-semibold"
                >
                  Manage
                </button>
              </div>

              <div className="space-y-3">
                {CORE_OSHA_STANDARDS.slice(0, 5).map(std => {
                  const status = standardsStatusMap[std.code]?.status || 'Compliant';
                  return (
                    <div key={std.code} className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-mono font-bold text-amber-400">OSHA {std.code}</div>
                        <div className="text-xs font-semibold text-zinc-200 line-clamp-1">{std.title}</div>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                        status === 'Compliant'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : status === 'Action Required'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: OSHA STANDARDS DIRECTORY & STATUS TOGGLE */}
      {/* ========================================================================= */}
      {activeTab === 'standards' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">OSHA General Industry 1910 Compliance Directory</h2>
              <p className="text-xs text-zinc-400">Set and update compliance status for federal standards enforced in upfitting shops.</p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search standards or requirement..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 w-full sm:w-64"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {CORE_OSHA_STANDARDS.filter(s =>
              s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
              s.code.includes(searchTerm) ||
              s.category.toLowerCase().includes(searchTerm.toLowerCase())
            ).map(std => {
              const currentStatus = standardsStatusMap[std.code]?.status || 'Compliant';
              return (
                <div key={std.code} className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4 hover:border-emerald-500/30 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md font-mono text-xs font-bold">
                          29 CFR {std.code}
                        </span>
                        <span className="text-xs text-zinc-400 font-semibold">{std.category}</span>
                      </div>
                      <h3 className="text-base font-bold text-white mt-1.5">{std.title}</h3>
                    </div>

                    {/* Interactive Status Selector */}
                    <select
                      value={currentStatus}
                      onChange={e => updateStandardStatusMutation.mutate({ code: std.code, status: e.target.value })}
                      className={`px-3 py-1 text-xs font-bold rounded-full border focus:outline-none cursor-pointer ${
                        currentStatus === 'Compliant'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : currentStatus === 'Action Required'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      <option value="Compliant" className="bg-zinc-900 text-white">Compliant</option>
                      <option value="Action Required" className="bg-zinc-900 text-white">Action Required</option>
                      <option value="In Review" className="bg-zinc-900 text-white">In Review</option>
                    </select>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed">{std.description}</p>

                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Required Shop Protocols:</h4>
                    <ul className="space-y-1.5">
                      {std.requirements.map((req, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs text-zinc-300">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SDS & HAZMAT BINDERS (100% REAL FIRESTORE DATA) */}
      {/* ========================================================================= */}
      {activeTab === 'sds' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Safety Data Sheet (SDS / MSDS) Binders</h2>
              <p className="text-xs text-zinc-400">OSHA 1910.1200 Hazard Communication chemical inventory.</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search chemical or SDS name..."
                  value={sdsSearch}
                  onChange={e => setSdsSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 w-full sm:w-64"
                />
              </div>

              <button
                onClick={() => setShowNewSdsModal(true)}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg transition-all shrink-0"
              >
                <Plus className="h-4 w-4" />
                Add SDS Item
              </button>
            </div>
          </div>

          {sdsList.length === 0 ? (
            <div className="p-12 text-center bg-zinc-900/60 border border-dashed border-zinc-800 rounded-2xl space-y-4 shadow-xl">
              <FileSpreadsheet className="h-12 w-12 text-emerald-500/60 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">No Safety Data Sheets Added Yet</h3>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  Add SDS sheets for paints, solvents, adhesives, battery electrolyte, and compressed gases used in your shop.
                </p>
              </div>
              <button
                onClick={() => setShowNewSdsModal(true)}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg transition-all"
              >
                <Plus className="h-4 w-4" />
                Add First SDS Sheet
              </button>
            </div>
          ) : (
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/60 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                      <th className="p-4">Chemical & Product Name</th>
                      <th className="p-4">Manufacturer</th>
                      <th className="p-4">Hazard Classification</th>
                      <th className="p-4">Storage Location</th>
                      <th className="p-4">GHS Pictograms</th>
                      <th className="p-4">Emergency Triage</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 text-sm">
                    {(sdsList as any[]).filter(s =>
                      s.name?.toLowerCase().includes(sdsSearch.toLowerCase()) ||
                      s.manufacturer?.toLowerCase().includes(sdsSearch.toLowerCase())
                    ).map(sds => (
                      <tr key={sds.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="p-4 font-bold text-white flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-emerald-400 shrink-0" />
                          {sds.name}
                        </td>
                        <td className="p-4 text-zinc-300 font-medium">{sds.manufacturer}</td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {sds.hazardClass}
                          </span>
                        </td>
                        <td className="p-4 text-zinc-300 text-xs font-mono">{sds.location}</td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 text-xs font-mono font-bold bg-zinc-800 text-zinc-300 rounded border border-zinc-700">
                            {sds.ghsCode || 'N/A'}
                          </span>
                        </td>
                        <td className="p-4 text-xs text-zinc-400 max-w-xs">{sds.emergencyFirstAid}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => deleteSdsMutation.mutate(sds.id)}
                            className="p-1.5 text-zinc-500 hover:text-rose-400 transition-colors"
                            title="Delete SDS Record"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: INCIDENT & NEAR-MISS LOG (100% REAL FIRESTORE DATA) */}
      {/* ========================================================================= */}
      {activeTab === 'incidents' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Incident & Near-Miss Reporting Log</h2>
              <p className="text-xs text-zinc-400">Record injury reports, equipment damage, near-misses, and corrective action plans.</p>
            </div>

            <button
              onClick={() => setShowNewIncidentModal(true)}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg transition-all self-start sm:self-auto"
            >
              <AlertTriangle className="h-4 w-4" />
              Report New Incident
            </button>
          </div>

          {incidentsList.length === 0 ? (
            <div className="p-12 text-center bg-zinc-900/60 border border-dashed border-zinc-800 rounded-2xl space-y-4 shadow-xl">
              <ClipboardList className="h-12 w-12 text-zinc-600 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">No Incidents Logged</h3>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  Keep your shop safe by logging near-misses, first aid occurrences, and equipment issues promptly.
                </p>
              </div>
              <button
                onClick={() => setShowNewIncidentModal(true)}
                className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg transition-all"
              >
                <AlertTriangle className="h-4 w-4" />
                Report First Incident
              </button>
            </div>
          ) : (
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/60 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                      <th className="p-4">Date & Severity</th>
                      <th className="p-4">Title & Description</th>
                      <th className="p-4">Location</th>
                      <th className="p-4">Reported By</th>
                      <th className="p-4">Corrective Action</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 text-sm">
                    {(incidentsList as any[]).map(inc => (
                      <tr key={inc.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="p-4 space-y-1">
                          <div className="text-xs text-zinc-400 font-mono">{inc.incidentDate || inc.date}</div>
                          <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded ${
                            inc.severity === 'High' || inc.severity === 'Critical'
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {inc.type} ({inc.severity})
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-white">{inc.title}</div>
                          <div className="text-xs text-zinc-400 mt-0.5">{inc.description}</div>
                        </td>
                        <td className="p-4 text-xs text-zinc-300 font-medium">{inc.location}</td>
                        <td className="p-4 text-xs text-zinc-300">{inc.reporter}</td>
                        <td className="p-4 text-xs text-zinc-400 max-w-xs">{inc.actionTaken}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => deleteIncidentMutation.mutate(inc.id)}
                            className="p-1.5 text-zinc-500 hover:text-rose-400 transition-colors"
                            title="Delete Incident Record"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: STAFF TRAINING & CERTIFICATIONS (100% REAL DATA) */}
      {/* ========================================================================= */}
      {activeTab === 'training' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Staff Safety Certifications Matrix</h2>
              <p className="text-xs text-zinc-400">Track OSHA 10/30, Forklift licenses, LOTO qualifications, and First Aid certifications.</p>
            </div>

            <button
              onClick={() => setShowNewCertModal(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg transition-all self-start sm:self-auto"
            >
              <Plus className="h-4 w-4" />
              Add Certification
            </button>
          </div>

          {certsList.length === 0 ? (
            <div className="p-12 text-center bg-zinc-900/60 border border-dashed border-zinc-800 rounded-2xl space-y-4 shadow-xl">
              <GraduationCap className="h-12 w-12 text-emerald-500/60 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">No Certifications Recorded</h3>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  Log staff safety credentials, forklift certifications, CPR cards, and OSHA 10/30 completions.
                </p>
              </div>
              <button
                onClick={() => setShowNewCertModal(true)}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg transition-all"
              >
                <Plus className="h-4 w-4" />
                Add Staff Certification
              </button>
            </div>
          ) : (
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/60 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                      <th className="p-4">Staff Member</th>
                      <th className="p-4">Certification Title</th>
                      <th className="p-4">Category</th>
                      <th className="p-4">Issue Date</th>
                      <th className="p-4">Expiration Date</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 text-sm">
                    {(certsList as any[]).map(c => {
                      const status = getCertStatus(c.expDate);
                      return (
                        <tr key={c.id} className="hover:bg-zinc-800/40 transition-colors">
                          <td className="p-4 font-bold text-white flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-emerald-400" />
                            {c.staffName}
                          </td>
                          <td className="p-4 text-zinc-200 font-medium">{c.certTitle}</td>
                          <td className="p-4 text-xs text-zinc-400">{c.category}</td>
                          <td className="p-4 text-xs font-mono text-zinc-400">{c.issueDate}</td>
                          <td className="p-4 text-xs font-mono text-zinc-300">{c.expDate}</td>
                          <td className="p-4">
                            <span className={`px-3 py-1 text-xs font-bold rounded-full border ${
                              status === 'Valid'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : status === 'Expiring Soon'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            }`}>
                              {status}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => deleteCertMutation.mutate(c.id)}
                              className="p-1.5 text-zinc-500 hover:text-rose-400 transition-colors"
                              title="Delete Certification Record"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REPORT NEW INCIDENT */}
      {/* ========================================================================= */}
      {showNewIncidentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-500" />
                Report Incident or Near-Miss
              </h3>
              <button
                onClick={() => setShowNewIncidentModal(false)}
                className="text-zinc-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase">Incident Title</label>
                <input
                  type="text"
                  placeholder="e.g. Frayed Lift Cord / Near-Miss Slip"
                  value={incidentForm.title}
                  onChange={e => setIncidentForm({ ...incidentForm, title: e.target.value })}
                  className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase">Report Type</label>
                  <select
                    value={incidentForm.type}
                    onChange={e => setIncidentForm({ ...incidentForm, type: e.target.value })}
                    className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
                  >
                    <option value="Near-Miss">Near-Miss</option>
                    <option value="First-Aid">First-Aid</option>
                    <option value="Minor Injury">Minor Injury</option>
                    <option value="Property Damage">Property Damage</option>
                    <option value="Equipment Failure">Equipment Failure</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase">Severity</label>
                  <select
                    value={incidentForm.severity}
                    onChange={e => setIncidentForm({ ...incidentForm, severity: e.target.value })}
                    className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase">Incident Date</label>
                  <input
                    type="date"
                    value={incidentForm.incidentDate}
                    onChange={e => setIncidentForm({ ...incidentForm, incidentDate: e.target.value })}
                    className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase">Shop Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Upfitter Bay 4"
                    value={incidentForm.location}
                    onChange={e => setIncidentForm({ ...incidentForm, location: e.target.value })}
                    className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase">Description of What Happened</label>
                <textarea
                  rows={3}
                  placeholder="Provide clear details..."
                  value={incidentForm.description}
                  onChange={e => setIncidentForm({ ...incidentForm, description: e.target.value })}
                  className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase">Corrective Action Taken</label>
                <input
                  type="text"
                  placeholder="e.g. Cleared spill, unplugged tool"
                  value={incidentForm.actionTaken}
                  onChange={e => setIncidentForm({ ...incidentForm, actionTaken: e.target.value })}
                  className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="lostTime"
                  checked={incidentForm.lostTime}
                  onChange={e => setIncidentForm({ ...incidentForm, lostTime: e.target.checked })}
                  className="h-4 w-4 rounded bg-zinc-950 border-zinc-800 text-rose-600 focus:ring-rose-500"
                />
                <label htmlFor="lostTime" className="text-xs font-semibold text-zinc-300">
                  Lost-Time Injury (Resets Days-Without-Incident Counter)
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
              <button
                onClick={() => setShowNewIncidentModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => addIncidentMutation.mutate(incidentForm)}
                disabled={!incidentForm.title || !incidentForm.description || addIncidentMutation.isPending}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg transition-all disabled:opacity-50"
              >
                {addIncidentMutation.isPending ? 'Submitting...' : 'Submit Safety Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD SDS ITEM */}
      {/* ========================================================================= */}
      {showNewSdsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
                Add New Safety Data Sheet (SDS)
              </h3>
              <button
                onClick={() => setShowNewSdsModal(false)}
                className="text-zinc-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase">Chemical / Product Name</label>
                <input
                  type="text"
                  placeholder="e.g. Synthetic Degreaser Spray"
                  value={sdsForm.name}
                  onChange={e => setSdsForm({ ...sdsForm, name: e.target.value })}
                  className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase">Manufacturer</label>
                <input
                  type="text"
                  placeholder="e.g. 3M Commercial Solutions"
                  value={sdsForm.manufacturer}
                  onChange={e => setSdsForm({ ...sdsForm, manufacturer: e.target.value })}
                  className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase">Hazard Class</label>
                  <input
                    type="text"
                    placeholder="e.g. Flammable Liquid"
                    value={sdsForm.hazardClass}
                    onChange={e => setSdsForm({ ...sdsForm, hazardClass: e.target.value })}
                    className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase">Shop Storage Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Bay 2 Cabinet"
                    value={sdsForm.location}
                    onChange={e => setSdsForm({ ...sdsForm, location: e.target.value })}
                    className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase">Emergency First Aid Triage Summary</label>
                <textarea
                  rows={2}
                  placeholder="e.g. In case of eye contact, flush with eyewash station for 15 minutes."
                  value={sdsForm.emergencyFirstAid}
                  onChange={e => setSdsForm({ ...sdsForm, emergencyFirstAid: e.target.value })}
                  className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
              <button
                onClick={() => setShowNewSdsModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => addSdsMutation.mutate(sdsForm)}
                disabled={!sdsForm.name || !sdsForm.manufacturer || addSdsMutation.isPending}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all disabled:opacity-50"
              >
                {addSdsMutation.isPending ? 'Saving...' : 'Save SDS Sheet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD CERTIFICATION */}
      {/* ========================================================================= */}
      {showNewCertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-emerald-400" />
                Add Staff Safety Certification
              </h3>
              <button
                onClick={() => setShowNewCertModal(false)}
                className="text-zinc-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase">Staff Member Name</label>
                <select
                  value={certForm.staffName}
                  onChange={e => setCertForm({ ...certForm, staffName: e.target.value })}
                  className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="" disabled>Select active staff member...</option>
                  {activeStaffList.map(staff => (
                    <option key={staff.id} value={staff.name} className="bg-zinc-900 text-white">
                      {staff.name}
                    </option>
                  ))}
                  {activeStaffList.length === 0 && (
                    <option value="" disabled className="bg-zinc-900 text-zinc-500">
                      No active staff found in directory
                    </option>
                  )}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase">Certification Title</label>
                <input
                  type="text"
                  placeholder="e.g. Forklift Operator License / LOTO Authorized"
                  value={certForm.certTitle}
                  onChange={e => setCertForm({ ...certForm, certTitle: e.target.value })}
                  className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase">Issue Date</label>
                  <input
                    type="date"
                    value={certForm.issueDate}
                    onChange={e => setCertForm({ ...certForm, issueDate: e.target.value })}
                    className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase">Expiration Date</label>
                  <input
                    type="date"
                    value={certForm.expDate}
                    onChange={e => setCertForm({ ...certForm, expDate: e.target.value })}
                    className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
              <button
                onClick={() => setShowNewCertModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => addCertMutation.mutate(certForm)}
                disabled={!certForm.staffName || !certForm.certTitle || addCertMutation.isPending}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all disabled:opacity-50"
              >
                {addCertMutation.isPending ? 'Saving...' : 'Save Certification'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CONFIGURATION & EMERGENCY CONTACTS */}
      {/* ========================================================================= */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Settings className="h-5 w-5 text-emerald-400" />
                Safety Center Settings
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-zinc-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase">Safety Incident Baseline Start Date</label>
                <input
                  type="date"
                  value={settingsForm.trackingStartDate}
                  onChange={e => setSettingsForm({ ...settingsForm, trackingStartDate: e.target.value })}
                  className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-zinc-500 mt-1">Used to calculate days without incident if no lost-time injuries are logged.</p>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase mb-2 block">Emergency Contacts</label>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {settingsForm.emergencyContacts.map((contact, idx) => (
                    <div key={idx} className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={contact.title}
                          onChange={e => {
                            const updated = [...settingsForm.emergencyContacts];
                            updated[idx].title = e.target.value;
                            setSettingsForm({ ...settingsForm, emergencyContacts: updated });
                          }}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                          placeholder="Contact Title"
                        />
                        <input
                          type="text"
                          value={contact.phone}
                          onChange={e => {
                            const updated = [...settingsForm.emergencyContacts];
                            updated[idx].phone = e.target.value;
                            setSettingsForm({ ...settingsForm, emergencyContacts: updated });
                          }}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-mono"
                          placeholder="Phone Number"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => saveSettingsMutation.mutate(settingsForm)}
                disabled={saveSettingsMutation.isPending}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all disabled:opacity-50"
              >
                {saveSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
