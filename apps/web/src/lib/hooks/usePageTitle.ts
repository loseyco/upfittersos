import { useEffect } from 'react';
import { useAuthStore } from '../auth/store';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export function usePageTitle(pageTitle?: string) {
  const { tenantId } = useAuthStore();

  const { data: business } = useQuery({
    queryKey: ['business', tenantId], // Shared cache key with TopNav
    queryFn: async () => {
      if (!tenantId || tenantId === 'GLOBAL') return null;
      const snap = await getDoc(doc(db, 'businesses', tenantId as string));
      return snap.exists() ? { id: snap.id, ...snap.data() } as { id: string; name: string } : null;
    },
    enabled: !!tenantId && tenantId !== 'GLOBAL',
    staleTime: 1000 * 60 * 60, // 1 hour cached
  });

  useEffect(() => {
    let newTitle = 'UpFittersOS';
    
    if (business?.name) {
      newTitle = `${business.name} | ${newTitle}`;
    }
    
    if (pageTitle) {
      newTitle = `${pageTitle} | ${newTitle}`;
    }
    
    document.title = newTitle;
  }, [pageTitle, business?.name]);
}
