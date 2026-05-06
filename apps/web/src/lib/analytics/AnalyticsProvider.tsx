import type { ReactNode } from 'react';
import { usePageTracking } from './usePageTracking';
import { useExternalLinkTracking } from './useExternalLinkTracking';

interface AnalyticsProviderProps {
  children: ReactNode;
}

export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  // Initialize page and external link tracking
  usePageTracking();
  useExternalLinkTracking();

  return <>{children}</>;
}
