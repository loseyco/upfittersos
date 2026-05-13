import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

export function useBetaUserCount(tenantId: string | null) {
  return useQuery({
    queryKey: ['beta-user-count', tenantId],
    queryFn: async () => {
      if (!tenantId) return 0;
      const snap = await getDocs(collection(db, `businesses/${tenantId}/staff`));
      
      let count = 0;
      snap.forEach(doc => {
        const data = doc.data();
        if (data.individualPermissions?.['experimental.new_modals'] === true) {
          count++;
        }
      });
      return count;
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}
