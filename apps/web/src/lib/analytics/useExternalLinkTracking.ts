import { useEffect } from 'react';
import { logEvent } from 'firebase/analytics';
import { analyticsPromise } from '../firebase/config';

export function useExternalLinkTracking() {
  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Walk up the DOM to see if it's an anchor tag
      const anchor = target.closest('a');
      
      if (!anchor) return;

      const isExternal = 
        anchor.href.startsWith('http') && 
        !anchor.href.includes(window.location.host);
      
      const hasTargetBlank = anchor.target === '_blank';

      if (isExternal || hasTargetBlank) {
        analyticsPromise.then((analytics) => {
          if (analytics) {
            logEvent(analytics, 'external_link_click', {
              link_url: anchor.href,
              link_text: anchor.innerText || anchor.textContent,
            });
          }
        });
      }
    };

    document.addEventListener('click', handleGlobalClick);

    return () => {
      document.removeEventListener('click', handleGlobalClick);
    };
  }, []);
}
