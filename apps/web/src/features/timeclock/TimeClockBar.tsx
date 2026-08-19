import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth/store';
import { useTimeclockStore } from '../../lib/store/timeclockStore';
import type { ClockStatus } from '../../lib/store/timeclockStore';
import { useQuery } from '@tanstack/react-query';
import { 
  collection, query, where, getDocs, addDoc, 
  updateDoc, doc, getDoc, serverTimestamp, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { 
  Coffee, Pizza, LogIn, 
  Loader2, Play, Pause, Square, Activity, Power,
  MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';
import { calculateDistance, cn } from '../../lib/utils';
import { getCurrentLocation, updateStaffLastLocation, getIpLocation } from '../../lib/locationService';

export function TimeClockBar() {
  const navigate = useNavigate();
  const { user, tenantId, permissions, impersonatedStaff } = useAuthStore();
  const { status, startTime, activeSessionId, setStatus, reset } = useTimeclockStore();
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [isProcessing, setIsProcessing] = useState(false);
  const [staffMember, setStaffMember] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastProcessedMessageId = useRef<string | null>(null);
  const mountTime = useRef<number>(Date.now());

  const effectiveUserId = impersonatedStaff?.id || user?.uid;
  useEffect(() => {
    if (!tenantId || !effectiveUserId || tenantId === 'GLOBAL') {
      setStaffMember(null);
      return;
    }

    if (impersonatedStaff && impersonatedStaff.type === 'staff') {
      const docRef = doc(db, `businesses/${tenantId}/staff`, impersonatedStaff.id);
      const unsub = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          setStaffMember({ id: docSnap.id, ...docSnap.data() });
        } else {
          setStaffMember(null);
        }
      });
      return () => unsub();
    } else {
      const q = query(
        collection(db, `businesses/${tenantId}/staff`),
        where('userId', '==', effectiveUserId)
      );
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          setStaffMember({ id: snap.docs[0].id, ...snap.docs[0].data() });
        } else {
          setStaffMember(null);
        }
      });
      return () => unsub();
    }
  }, [tenantId, effectiveUserId, impersonatedStaff]);

  useEffect(() => {
    if (!tenantId || !staffMember?.id) {
      setUnreadCount(0);
      return;
    }
    const q = query(
      collection(db, `businesses/${tenantId}/staff_direct_messages`),
      where('recipientId', '==', staffMember.id),
      where('isRead', '==', false)
    );
    const unsub = onSnapshot(q, (snap) => {
      setUnreadCount(snap.size);
      
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const id = change.doc.id;
          
          // Get timestamp
          let ts = Date.now();
          if (data.createdAt) {
            ts = data.createdAt.toDate ? data.createdAt.toDate().getTime() : new Date(data.createdAt).getTime();
          }
          
          // Only show toast for new messages received after mounting (with a 5s buffer)
          if (ts < mountTime.current - 5000) return;
          if (id === lastProcessedMessageId.current) return;
          
          lastProcessedMessageId.current = id;
          
          // Check if we are already actively viewing this chat to suppress the toast
          const urlParams = new URLSearchParams(window.location.search);
          const isViewingThisChat = 
            (window.location.pathname.includes(`/staff/${staffMember.id}`) && urlParams.get('tab') === 'messages' && urlParams.get('chatUser') === data.senderId) ||
            (window.location.pathname.includes(`/staff/${data.senderId}`) && urlParams.get('tab') === 'messages');
             
          if (isViewingThisChat) return;
          
          // Show toast notification
          toast.info(`New message from ${data.senderName || 'Staff'}`, {
            description: data.message,
            duration: 6000,
            position: 'top-right',
            action: {
              label: 'View',
              onClick: () => navigate(`/business/${tenantId}/staff/${data.senderId}?tab=messages`)
            }
          });
        }
      });
    }, (err) => {
      console.error("TimeClockBar: error loading pending messages count:", err);
    });
    return () => unsub();
  }, [tenantId, staffMember?.id, navigate]);

  // Fetch Business Settings for Timeclock config
  const { data: settings } = useQuery({
    queryKey: ['business-settings', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const snap = await getDoc(doc(db, 'businesses', tenantId));
      return snap.exists() ? snap.data() : null;
    },
    enabled: !!tenantId
  });

  // Fetch active session to track breaks for the live timer
  const { data: activeSession } = useQuery({
    queryKey: ['active-session', user?.uid, tenantId, activeSessionId],
    queryFn: async () => {
      if (!activeSessionId || !tenantId) return null;
      const snap = await getDoc(doc(db, `businesses/${tenantId}/time_sessions`, activeSessionId));
      return snap.exists() ? { id: snap.id, ...snap.data() } as any : null;
    },
    enabled: !!activeSessionId && !!tenantId,
    refetchInterval: 30000 // Refresh every 30s to keep breaks in sync
  });

  // Real-time bidirectional synchronization with Firestore for active session
  useEffect(() => {
    if (!tenantId || !effectiveUserId || tenantId === 'GLOBAL') {
      if (status !== 'clocked_out') {
        reset();
      }
      return;
    }

    const searchUserIds = Array.from(
      new Set([user?.uid, effectiveUserId, staffMember?.id, staffMember?.userId].filter(Boolean))
    ) as string[];

    const handleSessionSnapshot = async (docs: any[]) => {
      // Filter for current user's sessions
      const matchingDocs = docs.filter((d: any) => {
        const data = d.data ? d.data() : d;
        return (
          searchUserIds.includes(data.userId) ||
          searchUserIds.includes(data.staffId) ||
          (user?.email && data.userEmail && data.userEmail.toLowerCase() === user.email.toLowerCase())
        );
      });

      if (matchingDocs.length > 0) {
        const sessionDoc = matchingDocs[0];
        const session = sessionDoc.data ? sessionDoc.data() : sessionDoc;
        const sessionId = sessionDoc.id || session.id;

        // Auto-close stale session if older than 16 hours
        const clockInTime = session.clockIn?.timestamp?.toMillis 
          ? session.clockIn.timestamp.toMillis() 
          : (session.clockIn?.timestamp ? new Date(session.clockIn.timestamp).getTime() : Date.now());
        const ageHours = (Date.now() - clockInTime) / (1000 * 60 * 60);

        if (ageHours > 16) {
          console.warn(`Auto-closing stale time session ${sessionId} (${ageHours.toFixed(1)}h old)`);
          try {
            await updateDoc(doc(db, `businesses/${tenantId}/time_sessions`, sessionId), {
              status: 'completed',
              autoClockedOut: true,
              clockOut: {
                timestamp: serverTimestamp(),
                lat: null,
                lng: null,
                onSite: true,
                note: 'Auto clocked out due to shift expiration (>16h)'
              },
              updatedAt: serverTimestamp()
            });
          } catch (e) {
            console.error("Failed to auto-close stale session:", e);
          }
          reset();
          return;
        }

        let newStatus: ClockStatus = 'clocked_in';
        let newStartTime = clockInTime;

        if (session.status === 'on_break' && Array.isArray(session.breaks) && session.breaks.length > 0) {
          const lastBreak = session.breaks[session.breaks.length - 1];
          newStatus = lastBreak.type === 'lunch' ? 'on_lunch' : 'on_break';
          newStartTime = lastBreak.start?.toMillis 
            ? lastBreak.start.toMillis() 
            : (lastBreak.start ? new Date(lastBreak.start).getTime() : Date.now());
        }

        setStatus(newStatus, newStartTime, sessionId);
      } else {
        // No active session in Firestore -> guarantee local state reflects clocked out
        reset();
      }
    };

    // Listen in real-time to active sessions
    const q = query(
      collection(db, `businesses/${tenantId}/time_sessions`),
      where('status', 'in', ['active', 'on_break'])
    );

    const unsub = onSnapshot(q, (snap) => {
      handleSessionSnapshot(snap.docs);
    }, (err) => {
      console.warn("TimeClockBar: real-time session listener query error, falling back:", err);
    });

    // Instant Resync when tab becomes visible, window is focused, or network reconnects
    const handleRevalidate = async () => {
      try {
        const snap = await getDocs(q);
        handleSessionSnapshot(snap.docs);
      } catch (err) {
        console.warn("TimeClockBar revalidation error:", err);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleRevalidate();
      }
    };

    window.addEventListener('focus', handleRevalidate);
    window.addEventListener('online', handleRevalidate);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      unsub();
      window.removeEventListener('focus', handleRevalidate);
      window.removeEventListener('online', handleRevalidate);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user?.uid, user?.email, effectiveUserId, tenantId, staffMember?.id, staffMember?.userId]);

  // Extract and securely store qr_code parameter from URL search params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qrCode = params.get('qr_code');
    if (qrCode) {
      sessionStorage.setItem('timeclock_qr_code', qrCode);
      sessionStorage.setItem('timeclock_qr_timestamp', String(Date.now()));
      
      // Clean up the URL to prevent bookmarking/sharing the URL with the active QR token!
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, []);

  // Securely verify rotating QR code token against Firestore active token
  const verifyQrToken = async (): Promise<boolean> => {
    if (!settings?.timeclockRequireQR) return true;

    const savedCode = sessionStorage.getItem('timeclock_qr_code');
    const savedTimestamp = sessionStorage.getItem('timeclock_qr_timestamp');

    if (!savedCode || !savedTimestamp) {
      toast.error("QR Code Scan Required", {
        description: "You must scan the live rotating QR code on the shop floor tablet monitor to perform timeclock operations."
      });
      return false;
    }

    // Check if the scan happened within the last 60 seconds
    const scanAgeMs = Date.now() - Number(savedTimestamp);
    if (scanAgeMs > 60 * 1000) {
      toast.error("QR Code Expired", {
        description: "Your scanned QR code has expired. Please scan the live QR code on the shop monitor."
      });
      return false;
    }

    try {
      // Fetch the active security token from Firestore
      const tokenSnap = await getDoc(doc(db, `businesses/${tenantId}/timeclock_token`, 'active'));
      if (!tokenSnap.exists()) {
        toast.error("Verification Error", {
          description: "Could not retrieve the active security token from server."
        });
        return false;
      }

      const activeToken = tokenSnap.data();

      // Check if code matches exactly
      if (activeToken.code !== savedCode) {
        toast.error("Expired QR Code", {
          description: "This QR code has rotated. Please scan the live QR code on the shop monitor screen."
        });
        return false;
      }

      // Check if the active token's updatedAt in Firestore is fresh (less than 90 seconds old)
      const liveUpdatedAt = activeToken.updatedAt?.toDate ? activeToken.updatedAt.toDate().getTime() : new Date(activeToken.updatedAt).getTime();
      const liveAgeMs = Date.now() - liveUpdatedAt;
      if (liveAgeMs > 90 * 1000) {
        toast.error("Stale Security Token", {
          description: "The shop monitor appears to be offline. Please verify it is showing the live rotating QR code."
        });
        return false;
      }

      return true;
    } catch (e) {
      console.error("Token verification failed:", e);
      toast.error("Verification System Offline", {
        description: "Failed to connect to the security server. Please try again."
      });
      return false;
    }
  };

  // Timer update
  useEffect(() => {
    let interval: any;
    if (status !== 'clocked_out' && startTime) {
      interval = setInterval(() => {
        setCurrentTime(Date.now());
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status, startTime]);

  if (!settings?.timeclockEnabled) return null;

  const calculateNetWorkMs = () => {
    if (!activeSession || !startTime) return 0;
    
    // Total time from clock-in to now
    const clockInTs = activeSession.clockIn.timestamp?.toMillis() || startTime;
    const totalGrossMs = currentTime - clockInTs;
    
    // Subtract all completed breaks
    const completedBreakMs = activeSession.breaks?.reduce((acc: number, b: any) => {
      if (!b.start || !b.end) return acc;
      const start = b.start.toDate ? b.start.toDate().getTime() : new Date(b.start).getTime();
      const end = b.end.toDate ? b.end.toDate().getTime() : new Date(b.end).getTime();
      return acc + (end - start);
    }, 0) || 0;

    return Math.max(0, totalGrossMs - completedBreakMs);
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const validateLocation = async (isClockOut = false): Promise<{ lat: number | null; lng: number | null; onSite: boolean; accuracy?: number | null; type?: 'gps' | 'ip' | 'fallback' | null } | null> => {
    return new Promise((resolve) => {
      
      // On Clock Out, NEVER block or fail due to location or permission errors
      const safeFallback = { lat: null, lng: null, onSite: true, accuracy: null, type: 'fallback' as const };

      if (!navigator.geolocation) {
        getIpLocation().then(ipLoc => {
          resolve({ lat: ipLoc.lat, lng: ipLoc.lng, onSite: true, accuracy: ipLoc.accuracy, type: ipLoc.type || 'ip' });
        }).catch(() => resolve(isClockOut ? safeFallback : null));
        return;
      }

      let isResolved = false;
      const timeoutMs = isClockOut ? 3000 : 6000;

      const fallbackTimer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          console.warn("Geolocation timeout in validateLocation. Using IP or safe fallback.");
          getIpLocation().then(ipLoc => {
            resolve({ lat: ipLoc.lat, lng: ipLoc.lng, onSite: true, accuracy: ipLoc.accuracy, type: ipLoc.type || 'ip' });
          }).catch(() => resolve(isClockOut ? safeFallback : null));
        }
      }, timeoutMs);

      navigator.geolocation.getCurrentPosition((pos) => {
        if (isResolved) return;
        isResolved = true;
        clearTimeout(fallbackTimer);

        const { latitude, longitude, accuracy } = pos.coords;
        let onSite = true;
        let allowed = true;

        if (settings?.siteLat && settings?.siteLng) {
          const dist = calculateDistance(
            latitude, longitude, 
            parseFloat(settings.siteLat), parseFloat(settings.siteLng)
          );
          onSite = dist <= (settings.siteRadius || 500);
          if (isClockOut) {
            allowed = true; // Always allow clock out regardless of distance
          } else {
            allowed = onSite;
          }
        }

        if (!allowed && !isClockOut && !settings?.allowOffsiteClockIn && !permissions['timeclock.offsite']) {
          toast.error("Clocking in off-site is not allowed for your account.");
          resolve(null);
          return;
        }

        resolve({ lat: latitude, lng: longitude, onSite, accuracy, type: 'gps' });
      }, (err) => {
        if (isResolved) return;
        isResolved = true;
        clearTimeout(fallbackTimer);
        console.warn("Geolocation failed or denied:", err.message);

        if (isClockOut) {
          getIpLocation().then(ipLoc => {
            resolve({ lat: ipLoc.lat, lng: ipLoc.lng, onSite: true, accuracy: ipLoc.accuracy, type: ipLoc.type || 'fallback' });
          }).catch(() => resolve(safeFallback));
        } else {
          getIpLocation().then(ipLoc => {
            if (!ipLoc.lat && !ipLoc.lng) {
              toast.error("Could not resolve location. Please check location permissions or network connection.");
              resolve(null);
            } else {
              resolve({ lat: ipLoc.lat, lng: ipLoc.lng, onSite: true, accuracy: ipLoc.accuracy, type: 'ip' });
            }
          }).catch(() => {
            toast.error("Could not resolve location. Please check location permissions.");
            resolve(null);
          });
        }
      }, {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 5000
      });
    });
  };

  const handleClockIn = async () => {
    setIsProcessing(true);
    const isQrValid = await verifyQrToken();
    if (!isQrValid) {
      setIsProcessing(false);
      return;
    }
    const loc = await validateLocation(false);
    if (!loc) {
      setIsProcessing(false);
      return;
    }

    try {
      // Find the staff record to get the actual full name and pay type!
      let actualName = user!.displayName || user!.email || 'Technician';
      let resolvedPayType = 'hourly';
      if (tenantId) {
        const staffQuery = query(
          collection(db, `businesses/${tenantId}/staff`),
          where('email', '==', user!.email?.toLowerCase())
        );
        const staffSnap = await getDocs(staffQuery);
        if (!staffSnap.empty) {
          const sd = staffSnap.docs[0].data();
          actualName = `${sd.firstName || ''} ${sd.lastName || ''}`.trim() || actualName;
          
          if (sd.payType && sd.payType !== 'inherit') {
            resolvedPayType = sd.payType;
          } else if (sd.departmentId) {
            const deptRef = doc(db, `businesses/${tenantId}/departments`, sd.departmentId);
            const deptSnap = await getDoc(deptRef);
            if (deptSnap.exists()) {
              resolvedPayType = deptSnap.data().defaultPayType || 'hourly';
            }
          }
        }
      }

      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      const docRef = await addDoc(collection(db, `businesses/${tenantId}/time_sessions`), {
        userId: user!.uid,
        userName: actualName,
        staffName: actualName,
        payType: resolvedPayType,
        clockIn: {
          timestamp: serverTimestamp(),
          lat: loc.lat,
          lng: loc.lng,
          accuracy: loc.accuracy || null,
          onSite: loc.onSite,
          device: isMobile ? 'mobile' : 'pc',
          type: loc.type || null
        },
        isRemote: !loc.onSite,
        status: 'active',
        breaks: [],
        createdAt: serverTimestamp()
      });

      updateStaffLastLocation(tenantId!, user?.uid || null, user?.email || null, { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy || null }, "Clocked In").catch(e => console.warn("Failed staff last location update:", e));

      setStatus('clocked_in', Date.now(), docRef.id);
      toast.success("Clocked in successfully");
    } catch (e: any) {
      console.error("Clock in failed:", e);
      toast.error("Failed to clock in");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeSessionId) return;
    setIsProcessing(true);
    try {
      const isQrValid = await verifyQrToken();
      if (!isQrValid) {
        setIsProcessing(false);
        return;
      }

      const targetSessionId = activeSessionId;
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, targetSessionId);

      // 1. Perform instant Firestore clock-out write (marks shift completed without waiting on GPS)
      const sessionSnap = await getDoc(sessionRef);
      const sessionData = sessionSnap.exists() ? sessionSnap.data() : {};

      // If currently on break, end it first
      const breaks = [...(sessionData?.breaks || [])];
      const activeBreak = breaks.find((b: any) => !b.end);
      if (activeBreak) {
        activeBreak.end = new Date();
      }

      // Also clock out of all active jobs
      const jobs = [...(sessionData?.jobs || [])];
      jobs.forEach((j: any) => {
        if (!j.end) {
          j.end = new Date();
        }
      });

      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      await updateDoc(sessionRef, {
        clockOut: {
          timestamp: serverTimestamp(),
          lat: null,
          lng: null,
          accuracy: null,
          onSite: true,
          device: isMobile ? 'mobile' : 'pc',
          type: 'instant'
        },
        status: 'completed',
        breaks,
        jobs,
        updatedAt: serverTimestamp()
      });

      // 2. ONLY ONCE FIRESTORE WRITING IS FULLY CONFIRMED: update local UI state & toast success
      reset();
      toast.success("Clocked out successfully");

      // 3. Grab whatever location data we can in the background (max 1.5s fire & forget)
      (async () => {
        try {
          const locPromise = validateLocation(true);
          const timeoutPromise = new Promise<{ lat: null; lng: null; onSite: true; accuracy: null; type: 'timeout' }>(res => 
            setTimeout(() => res({ lat: null, lng: null, onSite: true, accuracy: null, type: 'timeout' }), 1500)
          );
          const bgLoc = await Promise.race([locPromise, timeoutPromise]);
          
          if (bgLoc && (bgLoc.lat !== null || bgLoc.lng !== null)) {
            await updateDoc(sessionRef, {
              'clockOut.lat': bgLoc.lat,
              'clockOut.lng': bgLoc.lng,
              'clockOut.accuracy': bgLoc.accuracy || null,
              'clockOut.onSite': bgLoc.onSite,
              'clockOut.type': bgLoc.type || 'gps'
            });
            const safeType: 'gps' | 'ip' | null = bgLoc.type === 'gps' || bgLoc.type === 'ip' ? bgLoc.type : null;
            updateStaffLastLocation(tenantId!, user?.uid || null, user?.email || null, { lat: bgLoc.lat, lng: bgLoc.lng, accuracy: bgLoc.accuracy ?? null, type: safeType }, "Clocked Out").catch(e => console.warn(e));
          }
        } catch (bgErr) {
          console.warn("Background location capture completed with fallback:", bgErr);
        }
      })();

    } catch (e: any) {
      console.error("Clock out error:", e);
      toast.error("Failed to clock out: " + (e.message || "Network error"));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartBreak = async (type: 'lunch' | 'normal') => {
    if (!activeSessionId) return;
    setIsProcessing(true);
    const isQrValid = await verifyQrToken();
    if (!isQrValid) {
      setIsProcessing(false);
      return;
    }
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSessionId);
      const sessionSnap = await getDoc(sessionRef);
      const sessionData = sessionSnap.data();
      const breaks = [...(sessionData?.breaks || [])];
      const jobs = [...(sessionData?.jobs || [])];
      
      let suspendedJob = null;
      jobs.forEach((j: any) => {
        if (!j.end) {
          j.end = new Date();
          suspendedJob = {
            id: j.id,
            name: j.name,
            taskId: j.taskId || null,
            taskName: j.taskName || null
          };
        }
      });
      
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      const loc = await getCurrentLocation();
      if (isMobile && (!loc.lat || !loc.lng || loc.type !== 'gps')) {
        toast.error("GPS location is mandatory to start a break. Please enable GPS and allow location permissions.");
        setIsProcessing(false);
        return;
      }
      if (!isMobile && !loc.lat && !loc.lng) {
        toast.error("Could not resolve location. Please ensure you have an active network connection.");
        setIsProcessing(false);
        return;
      }

      breaks.push({
          type,
          start: new Date(),
          isPaid: !!(type === 'lunch' ? settings?.lunchPaid : settings?.breakPaid),
          suspendedJob,
          startLat: loc.lat,
          startLng: loc.lng,
          startDevice: isMobile ? 'mobile' : 'pc'
        });

      await updateDoc(sessionRef, {
        breaks,
        jobs,
        status: 'on_break',
        updatedAt: serverTimestamp()
      });

      await updateStaffLastLocation(tenantId!, user?.uid || null, user?.email || null, loc, `Started Break (${type})`);

      setStatus(type === 'lunch' ? 'on_lunch' : 'on_break', Date.now(), activeSessionId);
      toast.info(`Started ${type} break`);
    } catch (e) {
      console.error("Failed to start break:", e);
      toast.error("Failed to start break. Check console for details.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEndBreak = async () => {
    if (!activeSessionId) return;
    setIsProcessing(true);
    const isQrValid = await verifyQrToken();
    if (!isQrValid) {
      setIsProcessing(false);
      return;
    }
    try {
      const sessionRef = doc(db, `businesses/${tenantId}/time_sessions`, activeSessionId);
      const sessionSnap = await getDoc(sessionRef);
      const sessionData = sessionSnap.data();
      const breaks = [...(sessionData?.breaks || [])];
      const jobs = [...(sessionData?.jobs || [])];
      
      let suspendedJob = null;
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      const loc = await getCurrentLocation();
      if (isMobile && (!loc.lat || !loc.lng || loc.type !== 'gps')) {
        toast.error("GPS location is mandatory to end a break. Please enable GPS and allow location permissions.");
        setIsProcessing(false);
        return;
      }
      if (!isMobile && !loc.lat && !loc.lng) {
        toast.error("Could not resolve location. Please ensure you have an active network connection.");
        setIsProcessing(false);
        return;
      }

      if (breaks.length > 0) {
        const lastBreak = breaks[breaks.length - 1];
        lastBreak.end = new Date();
        lastBreak.endLat = loc.lat;
        lastBreak.endLng = loc.lng;
        lastBreak.endDevice = isMobile ? 'mobile' : 'pc';
        suspendedJob = lastBreak.suspendedJob;
      }

      if (suspendedJob) {
        jobs.push({
          id: suspendedJob.id,
          name: suspendedJob.name,
          taskId: suspendedJob.taskId || null,
          taskName: suspendedJob.taskName || null,
          start: new Date()
        });
      }

      await updateDoc(sessionRef, {
        breaks,
        jobs,
        jobIds: Array.from(new Set(jobs.map((j: any) => j.id))),
        status: 'active',
        updatedAt: serverTimestamp()
      });

      await updateStaffLastLocation(tenantId!, user?.uid || null, user?.email || null, loc, "Ended Break");

      // Resume main clock - we need the original clock in time
      const originalClockIn = sessionData?.clockIn?.timestamp?.toMillis() || Date.now();
      setStatus('clocked_in', originalClockIn, activeSessionId);
      
      if (suspendedJob) {
        toast.success(`Resumed work on ${suspendedJob.taskName || suspendedJob.name}`);
      } else {
        toast.success("Break ended");
      }
    } catch (e) {
      toast.error("Failed to end break");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-3 sm:px-6 py-2 flex items-center justify-between gap-2 sm:gap-4 shadow-sm animate-in slide-in-from-top duration-500 z-40 overflow-x-auto no-scrollbar">
      {/* Left: Status */}
      <div 
        onClick={() => tenantId && navigate(`/business/${tenantId}/time_details`)}
        className="flex items-center gap-2 sm:gap-3 shrink-0 cursor-pointer hover:opacity-85 active:scale-95 transition-all select-none"
      >
        <div 
          className={cn(
            "p-2 rounded-lg transition-colors",
            status === 'clocked_out' ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400" : 
            status === 'clocked_in' ? "bg-emerald-500/10 text-emerald-500" :
            "bg-amber-500/10 text-amber-500"
          )}
          title={`Status: ${status.replace('_', ' ')}`}
        >
          {status === 'clocked_out' && <Power className="w-4 h-4" />}
          {status === 'clocked_in' && <Activity className="w-4 h-4" />}
          {(status === 'on_lunch' || status === 'on_break') && <Pause className="w-4 h-4" />}
        </div>
        <div className="hidden min-[400px]:block">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1">Time Clock</p>
          <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white capitalize whitespace-nowrap">
            {status.replace('_', ' ')}
          </p>
        </div>
      </div>

      {/* Center: Actions */}
      <div className="flex items-center justify-center gap-1.5 sm:gap-3 flex-1 min-w-0">
        {isProcessing ? (
          <div className="flex items-center gap-2 px-4 py-2 text-zinc-400 text-sm font-bold">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="hidden sm:inline">Processing...</span>
          </div>
        ) : (
          <>
            {status === 'clocked_out' ? (
              <button 
                onClick={handleClockIn}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-lg shadow-emerald-500/20 active:scale-95 whitespace-nowrap"
              >
                <LogIn className="w-4 h-4" /> Clock In
              </button>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2">
                {status === 'clocked_in' ? (
                  <>
                    <button 
                      onClick={() => handleStartBreak('lunch')}
                      className="p-2 sm:px-4 sm:py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2"
                      title="Lunch"
                    >
                      <Pizza className="w-4 h-4" /> <span className="hidden sm:inline">Lunch</span>
                    </button>
                    <button 
                      onClick={() => handleStartBreak('normal')}
                      className="p-2 sm:px-4 sm:py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2"
                      title="Break"
                    >
                      <Coffee className="w-4 h-4" /> <span className="hidden sm:inline">Break</span>
                    </button>
                    <button 
                      onClick={handleClockOut}
                      className="p-2 sm:px-4 sm:py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all shadow-lg shadow-rose-500/20 active:scale-95 flex items-center gap-2"
                      title="Clock Out"
                    >
                      <Square className="w-4 h-4" /> <span className="hidden sm:inline">Out</span>
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={handleEndBreak}
                    className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                  >
                    <Play className="w-4 h-4" /> Resume Work
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Right side: Chat Icon + Conditionally Timer */}
      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        {/* Chat Icon Button */}
        {staffMember?.id && unreadCount > 0 && (
          <button
            onClick={() => navigate(`/business/${tenantId}/staff/${staffMember.id}?tab=messages`)}
            className="relative p-2 sm:p-2.5 bg-rose-500/10 dark:bg-rose-500/25 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-450 hover:bg-rose-500/20 transition-all active:scale-[0.95] flex items-center justify-center shrink-0 cursor-pointer shadow-sm animate-bounce"
            title="You have unread direct messages!"
          >
            <MessageSquare className="w-4.5 h-4.5" />
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white shadow-sm shadow-rose-500/20 border border-white dark:border-zinc-950">
              {unreadCount}
            </span>
          </button>
        )}

        {/* Live Timer */}
        {status !== 'clocked_out' && startTime && (
          <div 
            onClick={() => tenantId && navigate(`/business/${tenantId}/time_details`)}
            className="flex items-center gap-3 sm:gap-4 pl-3 sm:pl-4 border-l border-zinc-200 dark:border-zinc-800 cursor-pointer hover:opacity-85 active:scale-95 transition-all select-none"
          >
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1 hidden sm:block">
                {status === 'clocked_in' ? 'Work Timer' : `${status.replace('on_', '').toUpperCase()} TIMER`}
              </span>
              <span className={cn(
                "text-sm sm:text-xl font-mono font-black tabular-nums",
                status === 'clocked_in' ? "text-indigo-600 dark:text-indigo-400" : "text-amber-500"
              )}>
                {status === 'clocked_in' 
                  ? formatDuration(calculateNetWorkMs()) 
                  : formatDuration(Math.max(0, currentTime - startTime))
                }
              </span>
              {status !== 'clocked_in' && (
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter mt-0.5">
                  Total: {formatDuration(calculateNetWorkMs())}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
