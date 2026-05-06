import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { logEvent } from 'firebase/analytics';
import { analyticsPromise } from '../firebase/config';

export function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    analyticsPromise.then((analytics) => {
      if (analytics) {
        logEvent(analytics, 'page_view', {
          page_path: location.pathname + location.search,
          page_title: document.title,
        });
      }
    });
  }, [location]);
}

