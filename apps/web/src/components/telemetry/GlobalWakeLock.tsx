import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuthStore } from '../../lib/auth/store';
import { useWakeLock } from '../../hooks/useWakeLock';

export function GlobalWakeLock() {
  const { user } = useAuthStore();

  const { data: keepAwake } = useQuery({
    queryKey: ['userKeepAwake', user?.uid],
    queryFn: async () => {
      if (!user?.uid) return false;
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (!snap.exists()) return false;
      return !!snap.data().keepScreenAwake;
    },
    enabled: !!user?.uid,
  });

  useWakeLock(!!keepAwake);

  return null;
}
