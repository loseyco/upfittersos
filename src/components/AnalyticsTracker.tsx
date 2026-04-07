import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { auditLogger } from '../lib/auditLogger';
import { useAuth } from '../contexts/AuthContext';

export function AnalyticsTracker() {
    const location = useLocation();
    const { currentUser } = useAuth(); // Depend on auth so we capture the true identity if they login during session

    useEffect(() => {
        // We log page views to internal telemetry.
        // Optional: Filter out spammy rapid route changes if desired.
        auditLogger.log({
            action: 'PAGE_VIEW',
            resource: location.pathname + location.search,
            details: { referrer: document.referrer }
        });
    }, [location.pathname, location.search, currentUser]);

    return null; // This component does not render anything.
}
