import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { 
  ArrowLeft, Printer, Save, Trash2, 
  RotateCcw, Car, AlertTriangle, PenTool, CheckSquare,
  Camera, Plus, X
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

// Types for the Form State
interface CheckField {
  status: string;
  explain: string;
}

interface RadioCheckField {
  status: string;
  amFm?: string;
  explain: string;
}

interface EmergencyChecks {
  lightbar: { front: boolean; side: boolean; rear: boolean; explain: string };
  opticom: CheckField;
  takedown: { front: boolean; alley: boolean; na: boolean; explain: string };
  arrowStick: { left: boolean; right: boolean; center: boolean; na: boolean; explain: string };
  grillLights: CheckField;
  pushBumper: CheckField;
  mirrorLights: CheckField;
  runningBoard: CheckField;
  sideWindows: CheckField;
  cannons: CheckField;
  taillights: CheckField;
  trunk: CheckField;
  siren: CheckField;
  horn: CheckField;
  radios: RadioCheckField;
  mics: CheckField;
  cameraSystem: CheckField;
  gunLock: CheckField;
  radar: CheckField;
  computer: CheckField;
  computerDock: CheckField;
  cage: CheckField;
  interiorLights: CheckField;
}

interface StrokePoint {
  x: number;
  y: number;
}

interface DrawingStroke {
  points: StrokePoint[];
  color: string;
  width: number;
}

export function JobIntakeFormPage({ 
  tenantId, 
  setDynamicTitle 
}: { 
  tenantId: string; 
  setDynamicTitle: (title: string | null) => void; 
}) {
  const params = useParams();
  const splat = params['*'] || '';
  const pathParts = splat.split('/').filter(Boolean);
  const jobId = pathParts[1];

  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Page title
  useEffect(() => {
    setDynamicTitle('Vehicle QC Intake Form');
    return () => setDynamicTitle(null);
  }, [setDynamicTitle]);

  // Loading & Saving States
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [job, setJob] = useState<any>(null);

  // Metadata States
  const [clientName, setClientName] = useState('');
  const [vin, setVin] = useState('');
  const [jobNumber, setJobNumber] = useState('');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [servicePerformed, setServicePerformed] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [fullUpfit, setFullUpfit] = useState(false);
  const [mileage, setMileage] = useState('');
  const [inspectedBy, setInspectedBy] = useState('');
  const [damageDiagramUrl, setDamageDiagramUrl] = useState('');
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<{ file: File; preview: string }[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // General Checks
  const [generalChecks, setGeneralChecks] = useState({
    bodyDamage: { status: '', explain: '' },
    interiorDamage: { status: '', explain: '' },
    stockLights: { status: '', explain: '' }
  });

  // Emergency Checks
  const [emergencyChecks, setEmergencyChecks] = useState<EmergencyChecks>({
    lightbar: { front: false, side: false, rear: false, explain: '' },
    opticom: { status: '', explain: '' },
    takedown: { front: false, alley: false, na: false, explain: '' },
    arrowStick: { left: false, right: false, center: false, na: false, explain: '' },
    grillLights: { status: '', explain: '' },
    pushBumper: { status: '', explain: '' },
    mirrorLights: { status: '', explain: '' },
    runningBoard: { status: '', explain: '' },
    sideWindows: { status: '', explain: '' },
    cannons: { status: '', explain: '' },
    taillights: { status: '', explain: '' },
    trunk: { status: '', explain: '' },
    siren: { status: '', explain: '' },
    horn: { status: '', explain: '' },
    radios: { status: '', amFm: '', explain: '' },
    mics: { status: '', explain: '' },
    cameraSystem: { status: '', explain: '' },
    gunLock: { status: '', explain: '' },
    radar: { status: '', explain: '' },
    computer: { status: '', explain: '' },
    computerDock: { status: '', explain: '' },
    cage: { status: '', explain: '' },
    interiorLights: { status: '', explain: '' },
  });

  // K9 Checks
  const [k9Checks, setK9Checks] = useState({
    canine: { status: '', explain: '' },
    fans: { status: '', explain: '' },
    heatAlarm: { status: '', explain: '' },
    backupCamera: { status: '', explain: '' }
  });

  // Drawing Canvas States
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<DrawingStroke | null>(null);
  const [brushColor, setBrushColor] = useState('#ef4444'); // Default Red
  const [brushWidth, setBrushWidth] = useState(3);
  const [canvasBgLoaded, setCanvasBgLoaded] = useState(false);

  // Fetch Job and Vehicle Details
  useEffect(() => {
    if (!tenantId || !jobId) return;

    let active = true;

    const loadData = async () => {
      try {
        // 1. Fetch Job
        const jobRef = doc(db, `businesses/${tenantId}/jobs`, jobId);
        const jobSnap = await getDoc(jobRef);
        
        if (!jobSnap.exists()) {
          toast.error('Job not found');
          navigate(`/business/${tenantId}/jobs`);
          return;
        }

        const jobData: any = { id: jobSnap.id, ...jobSnap.data() };
        if (!active) return;
        setJob(jobData);
 
        // Pre-fill metadata
        setClientName(jobData.customerName || '');
        setJobNumber(jobData.jobNumber || '');
        setServicePerformed(jobData.title || '');
        setInspectedBy(user?.displayName || user?.email || '');
 
        // 2. Fetch Vehicle
        let vehicleData: any = null;
        if (jobData.vehicleId) {
          const vRef = doc(db, `businesses/${tenantId}/vehicles`, jobData.vehicleId);
          const vSnap = await getDoc(vRef);
          if (vSnap.exists()) {
            vehicleData = { id: vSnap.id, ...vSnap.data() };
          }
        }
        
        if (vehicleData) {
          setVin(vehicleData.vin || '');
          setYear(vehicleData.year || '');
          setMake(vehicleData.make || '');
          setModel(vehicleData.model || '');
        }

        // 3. Load Existing Intake Form if any
        const intakeRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/intake_form`, 'current');
        const intakeSnap = await getDoc(intakeRef);

        if (intakeSnap.exists() && active) {
          const saved = intakeSnap.data();
          if (saved.clientName !== undefined) setClientName(saved.clientName);
          if (saved.vin !== undefined) setVin(saved.vin);
          if (saved.jobNumber !== undefined) setJobNumber(saved.jobNumber);
          if (saved.year !== undefined) setYear(saved.year);
          if (saved.make !== undefined) setMake(saved.make);
          if (saved.model !== undefined) setModel(saved.model);
          if (saved.servicePerformed !== undefined) setServicePerformed(saved.servicePerformed);
          if (saved.date !== undefined) setDate(saved.date);
          if (saved.fullUpfit !== undefined) setFullUpfit(saved.fullUpfit);
          if (saved.mileage !== undefined) setMileage(saved.mileage);
          if (saved.inspectedBy !== undefined) setInspectedBy(saved.inspectedBy);
          if (saved.damageDiagramUrl !== undefined) setDamageDiagramUrl(saved.damageDiagramUrl);
          if (saved.intakePhotos !== undefined) setUploadedPhotos(saved.intakePhotos || []);

          if (saved.generalChecks) setGeneralChecks(saved.generalChecks as any);
          if (saved.emergencyChecks) setEmergencyChecks(saved.emergencyChecks as any);
          if (saved.k9Checks) setK9Checks(saved.k9Checks as any);
          if (saved.strokes) setStrokes(saved.strokes || []);
        }

        setLoading(false);
      } catch (err) {
        console.error("Error loading intake form data:", err);
        toast.error("Failed to load vehicle details.");
        setLoading(false);
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [tenantId, jobId, user, navigate]);

  // Handle Canvas Drawing Logic
  const getCanvasMousePos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Map physical screen position to logical coordinate space (800 x 500)
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if ('touches' in e) {
      e.preventDefault();
    }
    const pos = getCanvasMousePos(e);
    setIsDrawing(true);
    setCurrentStroke({
      points: [pos],
      color: brushColor,
      width: brushWidth
    });
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentStroke) return;
    if ('touches' in e) {
      e.preventDefault();
    }
    const newPos = getCanvasMousePos(e);
    setCurrentStroke(prev => {
      if (!prev) return null;
      return {
        ...prev,
        points: [...prev.points, newPos]
      };
    });

    // Draw directly to canvas for real-time response
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && currentStroke.points.length > 1) {
      const p1 = currentStroke.points[currentStroke.points.length - 1];
      ctx.beginPath();
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(newPos.x, newPos.y);
      ctx.stroke();
    }
  };

  const endDrawing = () => {
    if (!isDrawing || !currentStroke) return;
    setIsDrawing(false);
    setStrokes(prev => [...prev, currentStroke]);
    setCurrentStroke(null);
  };

  const clearCanvas = () => {
    setStrokes([]);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const undoStroke = () => {
    setStrokes(prev => {
      const updated = prev.slice(0, -1);
      redrawCanvas(updated);
      return updated;
    });
  };

  const redrawCanvas = (strokesToDraw: DrawingStroke[]) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesToDraw.forEach(stroke => {
      if (stroke.points.length < 1) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    });
  };

  // Re-draw canvas strokes whenever strokes change or canvas re-mounts
  useEffect(() => {
    if (canvasBgLoaded) {
      redrawCanvas(strokes);
    }
  }, [strokes, canvasBgLoaded]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const selected = Array.from(files).map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));
    setNewPhotos(prev => [...prev, ...selected]);
  };

  const removeNewPhoto = (index: number) => {
    setNewPhotos(prev => {
      const target = prev[index];
      if (target) {
        URL.revokeObjectURL(target.preview);
      }
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const removeUploadedPhoto = (index: number) => {
    setUploadedPhotos(prev => prev.filter((_, idx) => idx !== index));
  };

  // Handle Form Submission / Save
  const handleSave = async () => {
    setSaving(true);
    try {
      let finalDamageUrl = damageDiagramUrl;

      // 1. Upload damage canvas image to storage if canvas exists
      const canvas = canvasRef.current;
      if (canvas && strokes.length > 0) {
        const uploadPromise = new Promise<string>((resolve, reject) => {
          canvas.toBlob(async (blob) => {
            if (!blob) {
              reject(new Error("Canvas blob extraction failed"));
              return;
            }
            try {
              const storageRef = ref(storage, `businesses/${tenantId}/jobs/${jobId}/intake_damage.png`);
              const snapshot = await uploadBytes(storageRef, blob);
              const downloadUrl = await getDownloadURL(snapshot.ref);
              resolve(downloadUrl);
            } catch (err) {
              reject(err);
            }
          }, 'image/png');
        });
        finalDamageUrl = await uploadPromise;
        setDamageDiagramUrl(finalDamageUrl);
      } else if (strokes.length === 0) {
        finalDamageUrl = '';
        setDamageDiagramUrl('');
      }

      // 2. Upload walk-around photos to Storage
      const uploadedUrls: string[] = [];
      for (const item of newPhotos) {
        const storageRef = ref(
          storage,
          `businesses/${tenantId}/jobs/${jobId}/intake_photos/intake_${Date.now()}_${item.file.name}`
        );
        const snapshot = await uploadBytes(storageRef, item.file);
        const url = await getDownloadURL(snapshot.ref);
        uploadedUrls.push(url);
      }
      const finalPhotosList = [...uploadedPhotos, ...uploadedUrls];
      setUploadedPhotos(finalPhotosList);
      setNewPhotos([]);

      // 3. Save document to Firestore
      const intakeRef = doc(db, `businesses/${tenantId}/jobs/${jobId}/intake_form`, 'current');
      const payload = {
        clientName,
        vin,
        jobNumber,
        year,
        make,
        model,
        servicePerformed,
        date,
        fullUpfit,
        mileage,
        inspectedBy,
        damageDiagramUrl: finalDamageUrl,
        intakePhotos: finalPhotosList,
        generalChecks,
        emergencyChecks,
        k9Checks,
        strokes, // Save stroke paths for future editing
        savedAt: new Date().toISOString(),
        savedByUid: user?.uid || '',
        savedByName: user?.displayName || user?.email || 'System'
      };

      await setDoc(intakeRef, payload);
      toast.success("Intake form saved successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save intake form.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !job) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-zinc-500 text-sm font-medium">Loading Vehicle Intake Checklist...</p>
      </div>
    );
  }

  // Loader placeholder element
  function Loader2({ className }: { className?: string }) {
    return <RotateCcw className={cn("animate-spin", className)} />;
  }

  const handlePrint = () => {
    window.print();
  };

  // SVGs for vehicle silhouette
  const renderVehicleSilhouetteSVG = () => (
    <svg viewBox="0 0 800 500" className="w-full h-auto text-zinc-400 dark:text-zinc-600 fill-none stroke-current" strokeWidth="2">
      {/* LEFT SIDE VIEW (translate 15, 30) */}
      <g transform="translate(15, 30)">
        <text x="150" y="-12" textAnchor="middle" fontSize="10" fontWeight="black" letterSpacing="0.1em" fill="currentColor" stroke="none">LEFT SIDE VIEW</text>
        {/* Wheels */}
        <circle cx="70" cy="80" r="18" />
        <circle cx="70" cy="80" r="7" />
        <line x1="70" y1="62" x2="70" y2="98" strokeWidth="1" />
        <line x1="52" y1="80" x2="88" y2="80" strokeWidth="1" />
        <circle cx="230" cy="80" r="18" />
        <circle cx="230" cy="80" r="7" />
        <line x1="230" y1="62" x2="230" y2="98" strokeWidth="1" />
        <line x1="212" y1="80" x2="248" y2="80" strokeWidth="1" />
        {/* Body Arch outline */}
        <path d="M 15 80 L 15 68 Q 15 60 22 58 L 75 48 Q 98 48 105 48 L 140 24 L 235 24 Q 248 24 250 27 L 270 52 Q 282 58 282 68 L 282 74 L 278 80 L 248 80 Q 230 62 212 80 L 88 80 Q 70 62 52 80 Z" />
        {/* Windows */}
        <path d="M 115 45 L 142 28 L 230 28 L 248 50 L 115 45 Z" strokeWidth="1.5" />
        <line x1="170" y1="28" x2="170" y2="46" strokeWidth="1.5" />
        <line x1="215" y1="28" x2="215" y2="47" strokeWidth="1.5" />
        {/* Headlight & Taillight side wraps */}
        <path d="M 15 68 L 26 66 L 24 72 Z" strokeWidth="1" />
        <path d="M 282 68 L 270 66 L 271 72 Z" strokeWidth="1" />
        {/* Door handles */}
        <line x1="152" y1="53" x2="162" y2="53" strokeWidth="2" />
        <line x1="198" y1="53" x2="208" y2="53" strokeWidth="2" />
      </g>

      {/* RIGHT SIDE VIEW (translate 485, 30) */}
      <g transform="translate(485, 30)">
        <text x="150" y="-12" textAnchor="middle" fontSize="10" fontWeight="black" letterSpacing="0.1em" fill="currentColor" stroke="none">RIGHT SIDE VIEW</text>
        {/* Wheels */}
        <circle cx="70" cy="80" r="18" />
        <circle cx="70" cy="80" r="7" />
        <line x1="70" y1="62" x2="70" y2="98" strokeWidth="1" />
        <line x1="52" y1="80" x2="88" y2="80" strokeWidth="1" />
        <circle cx="230" cy="80" r="18" />
        <circle cx="230" cy="80" r="7" />
        <line x1="230" y1="62" x2="230" y2="98" strokeWidth="1" />
        <line x1="212" y1="80" x2="248" y2="80" strokeWidth="1" />
        {/* Body outline mirrored */}
        <path d="M 285 80 L 285 68 Q 285 60 278 58 L 225 48 Q 202 48 195 48 L 160 24 L 65 24 Q 52 24 50 27 L 30 52 Q 18 58 18 68 L 18 74 L 22 80 L 52 80 Q 70 62 88 80 L 212 80 Q 230 62 248 80 Z" />
        {/* Windows */}
        <path d="M 185 45 L 158 28 L 70 28 L 52 50 L 185 45 Z" strokeWidth="1.5" />
        <line x1="130" y1="28" x2="130" y2="46" strokeWidth="1.5" />
        <line x1="85" y1="28" x2="85" y2="47" strokeWidth="1.5" />
        {/* Headlight & Taillight side wraps */}
        <path d="M 285 68 L 274 66 L 276 72 Z" strokeWidth="1" />
        <path d="M 18 68 L 30 66 L 29 72 Z" strokeWidth="1" />
        {/* Door handles */}
        <line x1="138" y1="53" x2="148" y2="53" strokeWidth="2" />
        <line x1="92" y1="53" x2="102" y2="53" strokeWidth="2" />
      </g>

      {/* TOP VIEW (translate 325, 20) */}
      <g transform="translate(325, 20)">
        <text x="75" y="-12" textAnchor="middle" fontSize="10" fontWeight="black" letterSpacing="0.1em" fill="currentColor" stroke="none">TOP VIEW</text>
        {/* Outer body outline */}
        <path d="M 45 10 Q 75 8 105 10 Q 120 40 124 80 Q 126 140 126 210 Q 124 260 118 280 Q 75 284 32 280 Q 26 260 24 210 Q 24 140 26 80 Q 30 40 45 10 Z" />
        {/* Hood lines */}
        <path d="M 30 65 Q 75 60 120 65" />
        <path d="M 50 10 Q 53 45 58 65" strokeWidth="1.5" />
        <path d="M 100 10 Q 97 45 92 65" strokeWidth="1.5" />
        {/* Windshield */}
        <path d="M 34 72 Q 75 66 116 72 Q 112 95 38 95 Z" strokeWidth="1.5" />
        {/* Panoramic Roof */}
        <rect x="36" y="98" width="78" height="85" rx="8" strokeWidth="1.5" />
        {/* Rear Window */}
        <path d="M 38 188 Q 75 194 112 188 L 116 208 Q 75 214 34 208 Z" strokeWidth="1.5" />
        {/* Spoiler & Trunk lines */}
        <path d="M 32 225 Q 75 220 118 225 L 120 235 Q 75 231 30 235 Z" strokeWidth="1.5" />
        <path d="M 26 240 Q 75 237 124 240" />
        {/* Side mirrors */}
        <path d="M 25 82 Q 15 82 12 85 Q 12 90 24 88" />
        <path d="M 125 82 Q 135 82 138 85 Q 138 90 126 88" />
      </g>

      {/* FRONT VIEW (translate 80, 260) */}
      <g transform="translate(80, 260)">
        <text x="75" y="10" textAnchor="middle" fontSize="10" fontWeight="black" letterSpacing="0.1em" fill="currentColor" stroke="none">FRONT VIEW</text>
        {/* Windshield & Roof */}
        <path d="M 35 25 L 115 25 L 128 58 L 22 58 Z" />
        {/* Grille & Bumper outer contour */}
        <path d="M 15 58 Q 5 60 8 95 Q 10 115 15 120 L 135 120 Q 140 115 142 95 Q 145 60 135 58 Z" />
        {/* Slanted Headlights */}
        <path d="M 18 64 L 40 68 L 38 78 L 18 72 Z" strokeWidth="1.5" />
        <path d="M 132 64 L 110 68 L 112 78 L 132 72 Z" strokeWidth="1.5" />
        {/* Modern Grille */}
        <path d="M 46 68 L 104 68 L 100 95 L 50 95 Z" strokeWidth="1.5" />
        <line x1="50" y1="77" x2="100" y2="77" strokeWidth="1" />
        <line x1="50" y1="86" x2="100" y2="86" strokeWidth="1" />
        {/* Lower vents / Fog lights */}
        <rect x="18" y="86" width="22" height="18" rx="3" strokeWidth="1.5" />
        <rect x="110" y="86" width="22" height="18" rx="3" strokeWidth="1.5" />
        {/* Side mirrors */}
        <path d="M 22 45 Q 10 44 14 50 Q 20 52 24 49" />
        <path d="M 128 45 Q 140 44 136 50 Q 130 52 126 49" />
        {/* Tires */}
        <rect x="18" y="120" width="20" height="14" fill="currentColor" stroke="none" />
        <rect x="112" y="120" width="20" height="14" fill="currentColor" stroke="none" />
        {/* Underbody Skid Guard */}
        <path d="M 45 120 L 105 120 L 98 126 L 52 126 Z" strokeWidth="1.5" />
      </g>

      {/* REAR VIEW (translate 570, 260) */}
      <g transform="translate(570, 260)">
        <text x="75" y="10" textAnchor="middle" fontSize="10" fontWeight="black" letterSpacing="0.1em" fill="currentColor" stroke="none">REAR VIEW</text>
        {/* Cabin/Windshield */}
        <path d="M 35 25 L 115 25 L 126 55 L 24 55 Z" />
        {/* Tailgate/Bumper body contour */}
        <path d="M 15 55 Q 5 57 8 95 Q 10 115 15 120 L 135 120 Q 140 115 142 95 Q 145 57 135 55 Z" />
        {/* Rear LED lightbar */}
        <rect x="15" y="65" width="120" height="6" rx="2" strokeWidth="1.5" />
        {/* Outer Taillights */}
        <path d="M 15 62 L 35 62 L 32 74 L 15 74 Z" strokeWidth="1.5" />
        <path d="M 135 62 L 115 62 L 118 74 L 135 74 Z" strokeWidth="1.5" />
        {/* License plate area */}
        <rect x="52" y="76" width="46" height="18" rx="2" strokeWidth="1" />
        {/* Wiper */}
        <line x1="75" y1="52" x2="90" y2="46" strokeWidth="1.5" />
        {/* Reflectors */}
        <line x1="20" y1="102" x2="36" y2="102" strokeWidth="2" />
        <line x1="114" y1="102" x2="130" y2="102" strokeWidth="2" />
        {/* Exhausts */}
        <rect x="22" y="120" width="12" height="6" rx="1" strokeWidth="1.5" />
        <rect x="116" y="120" width="12" height="6" rx="1" strokeWidth="1.5" />
        {/* Tires */}
        <rect x="18" y="120" width="20" height="14" fill="currentColor" stroke="none" />
        <rect x="112" y="120" width="20" height="14" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
      
      {/* Dynamically Inject Print Styling to isolate document layout in print mode */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Hide standard app structure entirely */
          body * {
            visibility: hidden;
            background-color: transparent !important;
          }
          /* Show print content exclusively */
          #intake-print-area, #intake-print-area * {
            visibility: visible;
          }
          #intake-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            display: block !important;
            color: black !important;
            background: white !important;
            font-size: 11px !important;
            line-height: 1.3 !important;
          }
          /* Custom layout overrides for paper margins */
          .print-grid {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px !important;
          }
          .print-full-width {
            grid-column: span 2 / span 2 !important;
          }
          .print-title {
            font-size: 20px !important;
            font-weight: 900 !important;
            border-bottom: 2px solid black !important;
            padding-bottom: 5px !important;
            margin-bottom: 12px !important;
          }
          .print-section {
            border: 1px solid #ccc !important;
            padding: 8px !important;
            border-radius: 6px !important;
            margin-bottom: 10px !important;
            page-break-inside: avoid !important;
          }
          .print-underline-input {
            border-bottom: 1px solid black !important;
            padding-bottom: 2px !important;
            display: inline-block !important;
          }
          .print-damage-canvas {
            border: 1px solid black !important;
            margin-top: 5px !important;
            width: 100% !important;
            max-width: 600px !important;
            height: auto !important;
            display: block !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }
          .print-diagram-box {
            text-align: center !important;
            page-break-inside: avoid !important;
          }
          .print-table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          .print-table th, .print-table td {
            border: 1px solid #e4e4e7 !important;
            padding: 4px 6px !important;
            text-align: left !important;
          }
          .print-checklist-grid {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 6px !important;
          }
          .print-checklist-item {
            border: 1px solid #f4f4f5 !important;
            padding: 4px !important;
            font-size: 9px !important;
          }
        }
      ` }} />

      {/* Web Application UI Header (Hidden in Print Mode) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm print-hidden no-print">
        <div className="space-y-1">
          <button 
            onClick={() => navigate(`/business/${tenantId}/job/${jobId}`)}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors text-xs font-bold uppercase tracking-wider mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Job Details
          </button>
          <h1 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight leading-none flex items-center gap-2">
            <Car className="w-6 h-6 text-indigo-500" />
            Vehicle QC Intake Form
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Fill in details, check factory/emergency systems, and print intake paperwork.</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button 
            onClick={handlePrint}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-855 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm font-bold rounded-xl transition-all shadow-sm border border-zinc-200 dark:border-zinc-800"
          >
            <Printer className="w-4 h-4 text-indigo-500" />
            Print Form
          </button>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/10 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save Intake Form
          </button>
        </div>
      </div>

      {/* Web Application UI Layout - Form Editor (Hidden in Print Mode) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start print-hidden no-print">
        
        {/* Left Column: Core Checklist Sections */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Metadata Section */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-indigo-500 uppercase tracking-[0.15em] flex items-center gap-2">
              <CheckSquare className="w-4 h-4" /> General Metadata
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">Client Name</label>
                <input 
                  type="text" 
                  value={clientName} 
                  onChange={e => setClientName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-55 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">VIN#</label>
                <input 
                  type="text" 
                  value={vin} 
                  onChange={e => setVin(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-55 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-mono text-indigo-500 dark:text-indigo-400 font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">Job #</label>
                <input 
                  type="text" 
                  value={jobNumber} 
                  onChange={e => setJobNumber(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-55 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-bold text-zinc-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">Year</label>
                <input 
                  type="text" 
                  value={year} 
                  onChange={e => setYear(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-55 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">Make</label>
                <input 
                  type="text" 
                  value={make} 
                  onChange={e => setMake(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-55 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">Model</label>
                <input 
                  type="text" 
                  value={model} 
                  onChange={e => setModel(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-55 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">Service Performed</label>
                <input 
                  type="text" 
                  value={servicePerformed} 
                  onChange={e => setServicePerformed(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-55 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">Date</label>
                <input 
                  type="date" 
                  value={date} 
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-55 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">Mileage</label>
                <input 
                  type="text" 
                  placeholder="Enter mileage..."
                  value={mileage} 
                  onChange={e => setMileage(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-55 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-semibold text-zinc-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-zinc-150 dark:border-zinc-850">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1">Inspected By</label>
                <input 
                  type="text" 
                  value={inspectedBy} 
                  onChange={e => setInspectedBy(e.target.value)}
                  className="w-48 px-4 py-2 bg-zinc-55 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-bold text-zinc-900 dark:text-white"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer p-3 bg-zinc-55 dark:bg-zinc-955 rounded-2xl border border-zinc-200 dark:border-zinc-800 select-none">
                <input 
                  type="checkbox" 
                  checked={fullUpfit} 
                  onChange={e => setFullUpfit(e.target.checked)}
                  className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
                />
                <div>
                  <span className="text-xs font-black text-zinc-855 dark:text-zinc-200 uppercase tracking-wider block text-left">Full Upfit</span>
                  <span className="text-[10px] text-zinc-400">Check if vehicle undergoes a complete overhaul</span>
                </div>
              </label>
            </div>
          </div>

          {/* General Vehicle Condition */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-6">
            <h3 className="text-xs font-black text-indigo-500 uppercase tracking-[0.15em] flex items-center gap-2">
              <Car className="w-4 h-4" /> General Condition Check
            </h3>

            {/* General Checks Mapping */}
            {(Object.keys(generalChecks) as Array<keyof typeof generalChecks>).map((key) => {
              const labelMap = {
                bodyDamage: 'Body Damage',
                interiorDamage: 'Interior Damage',
                stockLights: 'Stock Factory Lights Working'
              };
              const data = generalChecks[key];
              const label = labelMap[key];

              return (
                <div key={key} className="space-y-3 p-4 bg-zinc-55 dark:bg-zinc-955 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{label}</span>
                    
                    <div className="flex gap-2">
                      {['Yes', 'No'].map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setGeneralChecks(prev => ({
                            ...prev,
                            [key]: { ...prev[key], status: opt }
                          }))}
                          className={cn(
                            "px-4 py-1.5 text-xs font-bold rounded-lg border transition-all uppercase tracking-wide cursor-pointer",
                            data.status === opt 
                              ? opt === 'Yes' 
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" 
                                : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <input 
                    type="text" 
                    placeholder={`Explain ${key === 'stockLights' ? 'if not working' : 'damage'}...`}
                    value={data.explain} 
                    onChange={e => setGeneralChecks(prev => ({
                      ...prev,
                      [key]: { ...prev[key], explain: e.target.value }
                    }))}
                    className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white"
                  />
                </div>
              );
            })}
          </div>

          {/* Emergency Systems Checks */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-6">
            <h3 className="text-xs font-black text-indigo-500 uppercase tracking-[0.15em] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Emergency Systems Checklist
            </h3>

            <div className="space-y-4">
              {/* Lightbar Special Component */}
              <div className="p-4 bg-zinc-55 dark:bg-zinc-955 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Lightbar</span>
                  <div className="flex flex-wrap gap-2">
                    {(['front', 'side', 'rear'] as const).map(dir => (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => setEmergencyChecks(prev => ({
                          ...prev,
                          lightbar: {
                            ...prev.lightbar,
                            [dir]: !prev.lightbar[dir]
                          }
                        }))}
                        className={cn(
                          "px-3 py-1.5 text-xs font-bold rounded-lg border uppercase tracking-wider transition-all cursor-pointer",
                          emergencyChecks.lightbar[dir]
                            ? "bg-indigo-500/10 text-indigo-600 border-indigo-500/30"
                            : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500"
                        )}
                      >
                        {dir}
                      </button>
                    ))}
                  </div>
                </div>
                <input 
                  type="text" 
                  placeholder="Explain if not working..."
                  value={emergencyChecks.lightbar.explain}
                  onChange={e => setEmergencyChecks(prev => ({
                    ...prev,
                    lightbar: { ...prev.lightbar, explain: e.target.value }
                  }))}
                  className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white"
                />
              </div>

              {/* Takedown Special Component */}
              <div className="p-4 bg-zinc-55 dark:bg-zinc-955 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Takedown</span>
                  <div className="flex flex-wrap gap-2">
                    {(['front', 'alley', 'na'] as const).map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setEmergencyChecks(prev => {
                          const cleanVal = { front: prev.takedown.front, alley: prev.takedown.alley, na: prev.takedown.na };
                          if (opt === 'na') {
                            cleanVal.na = !prev.takedown.na;
                            if (cleanVal.na) {
                              cleanVal.front = false;
                              cleanVal.alley = false;
                            }
                          } else {
                            cleanVal[opt] = !prev.takedown[opt];
                            if (cleanVal[opt]) cleanVal.na = false;
                          }
                          return {
                            ...prev,
                            takedown: { ...prev.takedown, ...cleanVal }
                          };
                        })}
                        className={cn(
                          "px-3 py-1.5 text-xs font-bold rounded-lg border uppercase tracking-wider transition-all cursor-pointer",
                          emergencyChecks.takedown[opt]
                            ? "bg-indigo-500/10 text-indigo-600 border-indigo-500/30"
                            : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500"
                        )}
                      >
                        {opt === 'na' ? 'N/A' : opt}
                      </button>
                    ))}
                  </div>
                </div>
                <input 
                  type="text" 
                  placeholder="Explain if not working..."
                  value={emergencyChecks.takedown.explain}
                  onChange={e => setEmergencyChecks(prev => ({
                    ...prev,
                    takedown: { ...prev.takedown, explain: e.target.value }
                  }))}
                  className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white"
                />
              </div>

              {/* Arrow Stick Special Component */}
              <div className="p-4 bg-zinc-55 dark:bg-zinc-955 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Arrow Stick</span>
                  <div className="flex flex-wrap gap-2">
                    {(['left', 'right', 'center', 'na'] as const).map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setEmergencyChecks(prev => {
                          const cleanVal = { left: prev.arrowStick.left, right: prev.arrowStick.right, center: prev.arrowStick.center, na: prev.arrowStick.na };
                          if (opt === 'na') {
                            cleanVal.na = !prev.arrowStick.na;
                            if (cleanVal.na) {
                              cleanVal.left = false;
                              cleanVal.right = false;
                              cleanVal.center = false;
                            }
                          } else {
                            cleanVal[opt] = !prev.arrowStick[opt];
                            if (cleanVal[opt]) cleanVal.na = false;
                          }
                          return {
                            ...prev,
                            arrowStick: { ...prev.arrowStick, ...cleanVal }
                          };
                        })}
                        className={cn(
                          "px-3 py-1.5 text-xs font-bold rounded-lg border uppercase tracking-wider transition-all cursor-pointer",
                          emergencyChecks.arrowStick[opt]
                            ? "bg-indigo-500/10 text-indigo-600 border-indigo-500/30"
                            : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500"
                        )}
                      >
                        {opt === 'na' ? 'N/A' : opt}
                      </button>
                    ))}
                  </div>
                </div>
                <input 
                  type="text" 
                  placeholder="Explain if not working..."
                  value={emergencyChecks.arrowStick.explain}
                  onChange={e => setEmergencyChecks(prev => ({
                    ...prev,
                    arrowStick: { ...prev.arrowStick, explain: e.target.value }
                  }))}
                  className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white"
                />
              </div>

              {/* Standard Emergency Checks */}
              {(Object.keys(emergencyChecks) as Array<keyof EmergencyChecks>).map((key) => {
                if (key === 'lightbar' || key === 'takedown' || key === 'arrowStick') return null;

                const labelMap: Record<string, string> = {
                  opticom: 'Opticom',
                  grillLights: 'Grill Lights',
                  pushBumper: 'Push Bumper',
                  mirrorLights: 'Mirror Lights',
                  runningBoard: 'Running Board Lights',
                  sideWindows: 'Side Windows',
                  cannons: 'Cannons',
                  taillights: 'Taillights',
                  trunk: 'Trunk',
                  siren: 'Siren Working',
                  horn: 'Horn Working',
                  radios: 'Radios Status (connected, AM/FM)',
                  mics: 'Mics (Connected, Mounted, Condition)',
                  cameraSystem: 'Camera System (Front, Rear, Interior, Screen)',
                  gunLock: 'Gun Lock Functioning',
                  radar: 'Radar (Front/Rear)',
                  computer: 'Computer Working',
                  computerDock: 'Computer Dock (Secure/Power)',
                  cage: 'Cage/Pass. Area (Loose Bolts)',
                  interiorLights: 'Interior Dome Lights'
                };

                const data = emergencyChecks[key];
                const label = labelMap[key] || key;
                const options = (key === 'cannons' || key === 'taillights' || key === 'trunk' || key === 'cameraSystem' || key === 'gunLock' || key === 'radar' || key === 'computer' || key === 'computerDock' || key === 'cage')
                  ? ['Yes', 'No', 'N/A']
                  : (key === 'opticom' || key === 'grillLights' || key === 'pushBumper' || key === 'mirrorLights' || key === 'runningBoard' || key === 'sideWindows')
                    ? ['Yes', 'N/A']
                    : ['Yes', 'No'];

                return (
                  <div key={key} className="p-4 bg-zinc-55 dark:bg-zinc-955 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 text-left">{label}</span>
                      
                      <div className="flex flex-wrap gap-2">
                        {options.map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setEmergencyChecks(prev => ({
                              ...prev,
                              [key]: { ...prev[key], status: opt }
                            }))}
                            className={cn(
                              "px-3 py-1.5 text-xs font-bold rounded-lg border uppercase tracking-wider transition-all cursor-pointer",
                              data.status === opt 
                                ? "bg-indigo-500/10 text-indigo-600 border-indigo-500/30"
                                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500"
                            )}
                          >
                            {opt}
                          </button>
                        ))}

                        {/* Extra radio for radios check (AM/FM checkbox) */}
                        {key === 'radios' && (
                          <div className="flex items-center gap-1.5 ml-2 border-l border-zinc-200 dark:border-zinc-850 pl-3">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">AM/FM</label>
                            {['Yes', 'No'].map(val => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setEmergencyChecks(prev => ({
                                  ...prev,
                                  radios: { ...prev.radios, amFm: val }
                                }))}
                                className={cn(
                                  "px-2 py-1 text-[10px] font-bold rounded border uppercase tracking-wider transition-all cursor-pointer",
                                  emergencyChecks.radios.amFm === val 
                                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500"
                                )}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <input 
                      type="text" 
                      placeholder={key === 'cage' ? "Explain if loose bolts/issues..." : "Explain if not working..."}
                      value={data.explain}
                      onChange={e => setEmergencyChecks(prev => ({
                        ...prev,
                        [key]: { ...prev[key], explain: e.target.value }
                      }))}
                      className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* K-9 Equipment */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-6">
            <h3 className="text-xs font-black text-indigo-500 uppercase tracking-[0.15em] flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-emerald-500" /> K-9 Equipment Checklist
            </h3>

            <div className="space-y-4">
              {(Object.keys(k9Checks) as Array<keyof typeof k9Checks>).map((key) => {
                const labelMap = {
                  canine: 'Canine Unit Cage',
                  fans: 'Canine Exhaust Fans',
                  heatAlarm: 'Canine Heat Alarm System',
                  backupCamera: 'Back Up Camera'
                };
                const data = k9Checks[key];
                const label = labelMap[key];

                return (
                  <div key={key} className="p-4 bg-zinc-55 dark:bg-zinc-955 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{label}</span>
                      
                      <div className="flex gap-2">
                        {['Yes', 'No', 'N/A'].map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setK9Checks(prev => ({
                              ...prev,
                              [key]: { ...prev[key], status: opt }
                            }))}
                            className={cn(
                              "px-3 py-1.5 text-xs font-bold rounded-lg border uppercase tracking-wider transition-all cursor-pointer",
                              data.status === opt 
                                ? "bg-indigo-500/10 text-indigo-600 border-indigo-500/30"
                                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500"
                            )}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <input 
                      type="text" 
                      placeholder="Explain if not working..."
                      value={data.explain}
                      onChange={e => setK9Checks(prev => ({
                        ...prev,
                        [key]: { ...prev[key], explain: e.target.value }
                      }))}
                      className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white"
                    />
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right Column: Sketch Pad & Prints */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-6">
          
          {/* Sketch Pad Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-indigo-500 uppercase tracking-[0.15em] flex items-center gap-1.5">
                <PenTool className="w-4 h-4" /> Vehicle Damage Sketch Pad
              </h3>
              <div className="flex gap-1.5">
                <button
                  onClick={undoStroke}
                  disabled={strokes.length === 0}
                  className="p-1.5 bg-zinc-55 hover:bg-zinc-100 dark:bg-zinc-955 dark:hover:bg-zinc-850 rounded-lg text-zinc-500 border border-zinc-200 dark:border-zinc-800 disabled:opacity-50 cursor-pointer"
                  title="Undo Stroke"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={clearCanvas}
                  disabled={strokes.length === 0}
                  className="p-1.5 bg-zinc-55 hover:bg-red-50 hover:text-red-500 dark:bg-zinc-955 dark:hover:bg-red-950/20 rounded-lg text-zinc-500 border border-zinc-200 dark:border-zinc-800 disabled:opacity-50 cursor-pointer"
                  title="Clear Canvas"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <p className="text-[10px] text-zinc-400">Click and drag below to mark scratches (✖) or dents (◯) on the vehicle diagram.</p>

            {/* Drawing colors/sizes */}
            <div className="flex items-center justify-between gap-4 py-2 border-y border-zinc-150 dark:border-zinc-850">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">Brush:</span>
                {['#ef4444', '#3b82f6', '#f59e0b', '#000000'].map(color => (
                  <button
                    key={color}
                    onClick={() => setBrushColor(color)}
                    style={{ backgroundColor: color }}
                    className={cn(
                      "w-5 h-5 rounded-full border transition-all cursor-pointer",
                      brushColor === color ? "scale-125 border-white ring-2 ring-indigo-500" : "border-zinc-200/50 dark:border-zinc-800"
                    )}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">Size:</span>
                {[2, 4, 6].map(w => (
                  <button
                    key={w}
                    onClick={() => setBrushWidth(w)}
                    className={cn(
                      "px-2 py-0.5 text-[10px] font-bold rounded border uppercase tracking-wider transition-all cursor-pointer",
                      brushWidth === w 
                        ? "bg-indigo-500/10 text-indigo-600 border-indigo-500/30"
                        : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500"
                    )}
                  >
                    {w === 2 ? 'S' : w === 4 ? 'M' : 'L'}
                  </button>
                ))}
              </div>
            </div>

            {/* Responsive relative canvas container */}
            <div className="relative border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white p-2 select-none aspect-[8/5] overflow-hidden">
              {/* Background silhouette SVG */}
              <div className="absolute inset-0 flex items-center justify-center p-3 opacity-90">
                {renderVehicleSilhouetteSVG()}
              </div>

              {/* Foreground interactive HTML5 Drawing Canvas */}
              <canvas
                ref={el => {
                  canvasRef.current = el;
                  if (el && !canvasBgLoaded) {
                    setCanvasBgLoaded(true);
                  }
                }}
                width={800}
                height={500}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={endDrawing}
                onMouseLeave={endDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={endDrawing}
                className="absolute inset-0 w-full h-full cursor-crosshair z-10"
              />
            </div>
          </div>

          {/* Intake Photos Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-indigo-500 uppercase tracking-[0.15em] flex items-center gap-1.5">
                <Camera className="w-4 h-4" /> Intake Walk-Around Photos
              </h3>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="flex items-center gap-1 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-lg transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Photos
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </div>

            <p className="text-[10px] text-zinc-400">Take pictures of vehicle details, mileage, or damages. You can select multiple files at once.</p>

            {/* Photo Grid Previews */}
            {newPhotos.length === 0 && uploadedPhotos.length === 0 ? (
              <div 
                onClick={() => photoInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 dark:hover:border-indigo-500/50 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all bg-zinc-50/50 dark:bg-zinc-955/20 group"
              >
                <div className="w-10 h-10 bg-white dark:bg-zinc-900 rounded-full flex items-center justify-center text-zinc-400 group-hover:text-indigo-500 transition-all shadow-sm border border-zinc-100 dark:border-zinc-800">
                  <Camera className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-zinc-705 dark:text-zinc-300">No photos attached</span>
                <span className="text-[9px] text-zinc-400">Click to upload or snap pictures</span>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 border border-zinc-150 dark:border-zinc-850 p-2 rounded-2xl bg-zinc-50/30 dark:bg-zinc-955/10 max-h-[220px] overflow-y-auto custom-scrollbar">
                
                {/* Previews of newly selected photos (not yet saved) */}
                {newPhotos.map((item, idx) => (
                  <div key={`new-${idx}`} className="relative aspect-square rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 group animate-in zoom-in-95 duration-150">
                    <img 
                      src={item.preview} 
                      alt="new-preview" 
                      className="object-cover w-full h-full"
                    />
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-indigo-650 text-[8px] font-black text-white rounded uppercase tracking-wider">
                      New
                    </span>
                    <button
                      type="button"
                      onClick={() => removeNewPhoto(idx)}
                      className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white p-1 rounded-md opacity-90 hover:opacity-100 shadow-sm transition-all cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {/* Already uploaded/saved photos */}
                {uploadedPhotos.map((url, idx) => (
                  <div key={`uploaded-${idx}`} className="relative aspect-square rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 group animate-in zoom-in-95 duration-150">
                    <img 
                      src={url} 
                      alt="uploaded-preview" 
                      className="object-cover w-full h-full"
                    />
                    <button
                      type="button"
                      onClick={() => removeUploadedPhoto(idx)}
                      className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white p-1 rounded-md opacity-90 hover:opacity-100 shadow-sm transition-all cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

              </div>
            )}
          </div>

          {/* Quick Print Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-indigo-500 uppercase tracking-[0.15em] flex items-center gap-1.5">
              <Printer className="w-4 h-4" /> Intake Action Checklist
            </h3>
            
            <div className="space-y-3 text-xs text-zinc-650 dark:text-zinc-400">
              <p>Follow this checklist when checking in a vehicle:</p>
              <ul className="list-decimal pl-4 space-y-2 text-left">
                <li>Walk around the vehicle and record any visible exterior body or paint damage using the sketch pad.</li>
                <li>Examine the interior for seat tears, dashboard damage, or loose wires.</li>
                <li>Turn on stock factory lights (headlights, hazards, brake lights) and verify function.</li>
                <li>Turn on emergency systems (lightbars, grille lights, siren) and check off working components.</li>
                <li>Record exact mileage.</li>
                <li>Click <strong>Save Intake Form</strong>, and then press <strong>Print Form</strong> to compile the final paper intake sheet.</li>
              </ul>
            </div>

            <button 
              onClick={handlePrint}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-bold rounded-2xl transition-all shadow-md cursor-pointer"
            >
              <Printer className="w-4 h-4 text-indigo-500" />
              Print QC Intake Form
            </button>
          </div>

        </div>

      </div>

      {/* ========================================== */}
      {/* PRINT-ONLY CONTAINER (Invisible in Web UI) */}
      {/* ========================================== */}
      <div id="intake-print-area" className="hidden" style={{ display: 'none' }}>
        
        {/* Print Header */}
        <div className="print-title flex justify-between items-center pb-2 mb-4 border-b-2 border-black" style={{ borderBottom: '2px solid black' }}>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight" style={{ fontSize: '20px', fontWeight: 'bold' }}>VEHICLE QC INTAKE FORM</h1>
            <p className="text-xs font-bold text-zinc-550 uppercase tracking-widest mt-0.5" style={{ fontSize: '10px' }}>SAE Group &bull; (TAKE COMPANY CAM PICTURES) &bull; Complete for ALL Vehicles</p>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block" style={{ fontSize: '9px' }}>Intake Date</span>
            <span className="text-sm font-bold font-mono" style={{ fontSize: '12px', fontWeight: 'bold' }}>{date}</span>
          </div>
        </div>

        {/* General Info Grid */}
        <div className="print-section grid grid-cols-2 gap-4 border border-black p-4 rounded-xl mb-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', border: '1px solid black', padding: '10px', borderRadius: '8px' }}>
          <div className="space-y-2">
            <div><strong>Client Name:</strong> <span className="print-underline-input pl-2" style={{ borderBottom: '1px solid black', minWidth: '180px', display: 'inline-block' }}>{clientName || 'N/A'}</span></div>
            <div><strong>VIN#:</strong> <span className="print-underline-input font-mono pl-2" style={{ borderBottom: '1px solid black', minWidth: '180px', display: 'inline-block', fontFamily: 'monospace' }}>{vin || 'N/A'}</span></div>
            <div><strong>Job #:</strong> <span className="print-underline-input pl-2" style={{ borderBottom: '1px solid black', minWidth: '180px', display: 'inline-block' }}>{jobNumber || 'N/A'}</span></div>
            <div><strong>Service Performed:</strong> <span className="print-underline-input pl-2" style={{ borderBottom: '1px solid black', minWidth: '180px', display: 'inline-block' }}>{servicePerformed || 'N/A'}</span></div>
          </div>
          <div className="space-y-2">
            <div><strong>Year / Make / Model:</strong> <span className="print-underline-input pl-2" style={{ borderBottom: '1px solid black', minWidth: '180px', display: 'inline-block' }}>{`${year} ${make} ${model}`.trim() || 'N/A'}</span></div>
            <div><strong>Mileage:</strong> <span className="print-underline-input pl-2 font-bold" style={{ borderBottom: '1px solid black', minWidth: '180px', display: 'inline-block', fontWeight: 'bold' }}>{mileage || 'N/A'}</span></div>
            <div><strong>Full Upfit:</strong> <span className="print-underline-input pl-2" style={{ borderBottom: '1px solid black', minWidth: '80px', display: 'inline-block' }}>{fullUpfit ? '✔ Yes' : 'No'}</span></div>
            <div><strong>Inspected By:</strong> <span className="print-underline-input pl-2 font-bold" style={{ borderBottom: '1px solid black', minWidth: '180px', display: 'inline-block', fontWeight: 'bold' }}>{inspectedBy}</span></div>
          </div>
        </div>

        {/* General Checks Table */}
        <div className="print-section mb-4" style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
          <h3 className="text-sm font-black uppercase tracking-wide mb-2 pb-1 border-b border-zinc-200" style={{ fontSize: '11px', fontWeight: 'bold', borderBottom: '1px solid #e4e4e7', paddingBottom: '3px' }}>1. General Vehicle Condition</h3>
          <table className="print-table w-full text-xs" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f4f4f5', fontWeight: 'bold' }}>
                <th style={{ border: '1px solid #e4e4e7', padding: '5px', textAlign: 'left' }}>System Checked</th>
                <th style={{ border: '1px solid #e4e4e7', padding: '5px', textAlign: 'left', width: '80px' }}>Status</th>
                <th style={{ border: '1px solid #e4e4e7', padding: '5px', textAlign: 'left' }}>Explanations / Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid #e4e4e7', padding: '5px' }}><strong>Body Damage</strong></td>
                <td style={{ border: '1px solid #e4e4e7', padding: '5px' }}>{generalChecks.bodyDamage.status || '--'}</td>
                <td style={{ border: '1px solid #e4e4e7', padding: '5px' }}>{generalChecks.bodyDamage.explain}</td>
              </tr>
              <tr>
                <td style={{ border: '1px solid #e4e4e7', padding: '5px' }}><strong>Interior Damage</strong></td>
                <td style={{ border: '1px solid #e4e4e7', padding: '5px' }}>{generalChecks.interiorDamage.status || '--'}</td>
                <td style={{ border: '1px solid #e4e4e7', padding: '5px' }}>{generalChecks.interiorDamage.explain}</td>
              </tr>
              <tr>
                <td style={{ border: '1px solid #e4e4e7', padding: '5px' }}><strong>Stock Lights Working</strong></td>
                <td style={{ border: '1px solid #e4e4e7', padding: '5px' }}>{generalChecks.stockLights.status || '--'}</td>
                <td style={{ border: '1px solid #e4e4e7', padding: '5px' }}>{generalChecks.stockLights.explain}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Emergency Systems Checks Grid */}
        <div className="print-section mb-4" style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
          <h3 className="text-sm font-black uppercase tracking-wide mb-2 pb-1 border-b border-zinc-200" style={{ fontSize: '11px', fontWeight: 'bold', borderBottom: '1px solid #e4e4e7', paddingBottom: '3px' }}>2. Emergency Systems & Cabin Electronics</h3>
          <div className="print-checklist-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            
            {/* Lightbar */}
            <div className="print-checklist-item border p-2" style={{ border: '1px solid #e4e4e7', padding: '6px', fontSize: '9px' }}>
              <strong>Lightbar:</strong> 
              <div className="ml-2">
                Front: {emergencyChecks.lightbar.front ? '[X]' : '[ ]'} &bull; 
                Side: {emergencyChecks.lightbar.side ? '[X]' : '[ ]'} &bull; 
                Rear: {emergencyChecks.lightbar.rear ? '[X]' : '[ ]'}
              </div>
              {emergencyChecks.lightbar.explain && <div className="text-[8px] italic mt-1" style={{ fontSize: '8px', fontStyle: 'italic' }}>Note: {emergencyChecks.lightbar.explain}</div>}
            </div>

            {/* Takedown */}
            <div className="print-checklist-item border p-2" style={{ border: '1px solid #e4e4e7', padding: '6px', fontSize: '9px' }}>
              <strong>Takedown:</strong> 
              <div className="ml-2">
                Front: {emergencyChecks.takedown.front ? '[X]' : '[ ]'} &bull; 
                Alley: {emergencyChecks.takedown.alley ? '[X]' : '[ ]'} &bull; 
                N/A: {emergencyChecks.takedown.na ? '[X]' : '[ ]'}
              </div>
              {emergencyChecks.takedown.explain && <div className="text-[8px] italic mt-1" style={{ fontSize: '8px', fontStyle: 'italic' }}>Note: {emergencyChecks.takedown.explain}</div>}
            </div>

            {/* Arrow Stick */}
            <div className="print-checklist-item border p-2" style={{ border: '1px solid #e4e4e7', padding: '6px', fontSize: '9px' }}>
              <strong>Arrow Stick:</strong> 
              <div className="ml-2">
                Left: {emergencyChecks.arrowStick.left ? '[X]' : '[ ]'} &bull; 
                Right: {emergencyChecks.arrowStick.right ? '[X]' : '[ ]'} &bull; 
                Center: {emergencyChecks.arrowStick.center ? '[X]' : '[ ]'}
              </div>
              {emergencyChecks.arrowStick.explain && <div className="text-[8px] italic mt-1" style={{ fontSize: '8px', fontStyle: 'italic' }}>Note: {emergencyChecks.arrowStick.explain}</div>}
            </div>

            {/* General checks list */}
            {(Object.keys(emergencyChecks) as Array<keyof EmergencyChecks>).map((key) => {
              if (key === 'lightbar' || key === 'takedown' || key === 'arrowStick') return null;

              const labelMap: Record<string, string> = {
                opticom: 'Opticom',
                grillLights: 'Grill Lights',
                pushBumper: 'Push Bumper',
                mirrorLights: 'Mirror Lights',
                runningBoard: 'Running Board Lights',
                sideWindows: 'Side Windows',
                cannons: 'Cannons',
                taillights: 'Taillights',
                trunk: 'Trunk',
                siren: 'Siren',
                horn: 'Horn',
                radios: 'Radios',
                mics: 'Mics / Audio',
                cameraSystem: 'Camera System',
                gunLock: 'Gun Lock',
                radar: 'Radar',
                computer: 'Computer',
                computerDock: 'Computer Dock',
                cage: 'Cage / Passenger Area',
                interiorLights: 'Interior Lights'
              };

              const data = emergencyChecks[key];
              const label = labelMap[key] || key;

              return (
                <div key={key} className="print-checklist-item border p-2 flex flex-col justify-between" style={{ border: '1px solid #e4e4e7', padding: '6px', fontSize: '9px' }}>
                  <div>
                    <strong>{label}:</strong> <span className="font-bold" style={{ fontWeight: 'bold' }}>{data.status || 'N/A'}</span>
                    {key === 'radios' && emergencyChecks.radios.amFm && (
                      <span className="text-[8px] ml-1" style={{ fontSize: '8px' }}> (AM/FM: {emergencyChecks.radios.amFm})</span>
                    )}
                  </div>
                  {data.explain && (
                    <div className="text-[8px] italic mt-0.5 max-w-full truncate" style={{ fontSize: '8px', fontStyle: 'italic' }}>Note: {data.explain}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* K9 Systems Grid */}
        <div className="print-section mb-4" style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
          <h3 className="text-sm font-black uppercase tracking-wide mb-2 pb-1 border-b border-zinc-200" style={{ fontSize: '11px', fontWeight: 'bold', borderBottom: '1px solid #e4e4e7', paddingBottom: '3px' }}>3. K-9 Systems Check</h3>
          <div className="grid grid-cols-4 gap-2 text-xs" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            {Object.entries(k9Checks).map(([key, data]) => {
              const labelMap: Record<string, string> = {
                canine: 'Canine Cage',
                fans: 'Exhaust Fans',
                heatAlarm: 'Heat Alarm',
                backupCamera: 'Backup Camera'
              };
              return (
                <div key={key} className="border p-2 rounded" style={{ border: '1px solid #e4e4e7', padding: '6px', fontSize: '9px' }}>
                  <strong>{labelMap[key] || key}:</strong> <span className="font-bold" style={{ fontWeight: 'bold' }}>{data.status || 'N/A'}</span>
                  {data.explain && <div className="text-[8px] italic mt-0.5" style={{ fontSize: '8px', fontStyle: 'italic' }}>Note: {data.explain}</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Damage Sketch Print Area */}
        <div className="print-section print-diagram-box" style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '8px', marginBottom: '15px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <h3 className="text-sm font-black uppercase tracking-wide mb-2 pb-1 border-b border-zinc-200 text-left" style={{ fontSize: '11px', fontWeight: 'bold', borderBottom: '1px solid #e4e4e7', paddingBottom: '3px' }}>4. Vehicle Damage Layout Diagram</h3>
          <div className="relative border border-zinc-300 bg-white p-2 mx-auto" style={{ maxWidth: '600px', height: '375px', position: 'relative', border: '1px solid #ccc' }}>
            {/* Background SVG diagram */}
            {renderVehicleSilhouetteSVG()}
            {/* Overlaid saved damage canvas coordinates, rendered as lines/circles in SVG inside print area if strokes exist */}
            {strokes.length > 0 && (
              <svg viewBox="0 0 800 500" className="absolute inset-0 w-full h-full fill-none pointer-events-none" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10, fill: 'none' }}>
                {strokes.map((stroke, idx) => {
                  if (stroke.points.length < 1) return null;
                  const pString = stroke.points.map(p => `${p.x},${p.y}`).join(' ');
                  return (
                    <polyline
                      key={idx}
                      points={pString}
                      stroke={stroke.color}
                      strokeWidth={stroke.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}
              </svg>
            )}
          </div>
          <p className="text-[9px] text-zinc-500 italic mt-1" style={{ fontSize: '8px', fontStyle: 'italic', textAlign: 'center' }}>Dents, scratches, and marks are indicated in red/orange overlay.</p>
        </div>

        {/* Walk-Around Photos Print Area */}
        {uploadedPhotos.length > 0 && (
          <div className="print-section mb-4" style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '8px', marginBottom: '15px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            <h3 className="text-sm font-black uppercase tracking-wide mb-2 pb-1 border-b border-zinc-200 text-left" style={{ fontSize: '11px', fontWeight: 'bold', borderBottom: '1px solid #e4e4e7', paddingBottom: '3px' }}>5. Intake Walk-Around Photos</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {uploadedPhotos.map((url, idx) => (
                <div key={idx} style={{ border: '1px solid #e4e4e7', borderRadius: '6px', overflow: 'hidden', aspectRatio: '1/1' }}>
                  <img src={url} alt={`Intake walkaround ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signature lines */}
        <div className="mt-8 pt-6 flex justify-between items-center text-xs" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px', paddingTop: '15px', borderTop: '1px solid black' }}>
          <div style={{ width: '40%', borderTop: '1px solid black', paddingTop: '5px', textAlign: 'left' }}>
            <strong>Technician Signature</strong>
          </div>
          <div style={{ width: '40%', borderTop: '1px solid black', paddingTop: '5px', textAlign: 'right' }}>
            <strong>Date Signed</strong>
          </div>
        </div>

      </div>

    </div>
  );
}
