import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase/config';

export type JobPartsStatus = 'Ready' | 'Pending with ETA' | 'Blocked' | 'No Parts Needed';

export interface JobPartsInfo {
  status: JobPartsStatus;
  latestEta: Date | null;
  totalParts: number;
  receivedParts: number;
}

interface PartsRequest {
  id: string;
  status: string;
}

interface Shipment {
  id: string;
  status: string;
  eta?: { toDate?: () => Date } | string | number | Date | null;
}

export function useJobPartsStatus(tenantId: string | undefined, jobId: string | undefined) {
  const [partsInfo, setPartsInfo] = useState<JobPartsInfo>({
    status: 'No Parts Needed',
    latestEta: null,
    totalParts: 0,
    receivedParts: 0
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => !!tenantId && !!jobId);

  // Synchronously adjust state during render if parameters change (avoids set-state-in-effect warning)
  const [prevParams, setPrevParams] = useState({ tenantId, jobId });
  if (tenantId !== prevParams.tenantId || jobId !== prevParams.jobId) {
    setPrevParams({ tenantId, jobId });
    if (!tenantId || !jobId) {
      setPartsInfo({ status: 'No Parts Needed', latestEta: null, totalParts: 0, receivedParts: 0 });
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
  }

  useEffect(() => {
    if (!tenantId || !jobId) {
      return;
    }

    let currentRequests: PartsRequest[] | null = null;
    let currentShipments: Shipment[] | null = null;

    const partsRef = collection(db, `businesses/${tenantId}/parts_requests`);
    const qParts = query(partsRef, where('jobId', '==', jobId));

    const shipmentsRef = collection(db, `businesses/${tenantId}/shipments`);
    const qShipments = query(shipmentsRef, where('jobId', '==', jobId));

    const updateCombinedState = (reqs: PartsRequest[], ships: Shipment[]) => {
      const totalParts = reqs.length;
      if (totalParts === 0) {
        setPartsInfo({ status: 'No Parts Needed', latestEta: null, totalParts: 0, receivedParts: 0 });
        setIsLoading(false);
        return;
      }

      const receivedParts = reqs.filter(p => p.status === 'received' || p.status === 'fulfilled' || p.status === 'delivered' || p.status === 'inventoried').length;
      
      if (receivedParts === totalParts) {
        setPartsInfo({ status: 'Ready', latestEta: null, totalParts, receivedParts });
        setIsLoading(false);
        return;
      }

      let latestEta: Date | null = null;
      let hasMissingEtas = false;

      // Also check requests that don't have shipments / are pending
      const requestsWithoutShipment = reqs.filter(p => p.status === 'pending');
      if (requestsWithoutShipment.length > 0) {
        hasMissingEtas = true;
      }

      ships.forEach(data => {
        if (data.status !== 'delivered' && data.status !== 'received') {
          if (data.eta) {
            const eta = data.eta;
            const etaDate = (typeof eta === 'object' && eta !== null && 'toDate' in eta && typeof eta.toDate === 'function')
              ? eta.toDate()
              : new Date(eta as string | number | Date);
            if (!latestEta || etaDate > latestEta) {
              latestEta = etaDate;
            }
          } else {
            hasMissingEtas = true;
          }
        }
      });

      if (hasMissingEtas) {
        setPartsInfo({ status: 'Blocked', latestEta, totalParts, receivedParts });
      } else {
        setPartsInfo({ status: 'Pending with ETA', latestEta, totalParts, receivedParts });
      }
      setIsLoading(false);
    };

    const unsubParts = onSnapshot(qParts, (snap) => {
      currentRequests = snap.docs.map(d => ({ id: d.id, ...d.data() } as PartsRequest));
      if (currentRequests !== null && currentShipments !== null) {
        updateCombinedState(currentRequests, currentShipments);
      }
    }, (err) => {
      console.error("useJobPartsStatus parts listener error:", err);
    });

    const unsubShipments = onSnapshot(qShipments, (snap) => {
      currentShipments = snap.docs.map(d => ({ id: d.id, ...d.data() } as Shipment));
      if (currentRequests !== null && currentShipments !== null) {
        updateCombinedState(currentRequests, currentShipments);
      }
    }, (err) => {
      console.error("useJobPartsStatus shipments listener error:", err);
    });

    return () => {
      unsubParts();
      unsubShipments();
    };
  }, [tenantId, jobId]);

  return { data: partsInfo, isLoading };
}
