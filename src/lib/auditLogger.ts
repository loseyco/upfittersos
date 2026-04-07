import { db, auth } from './firebase';
import { doc, setDoc, collection } from 'firebase/firestore';

export type AuditActionType = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'IMPERSONATE' | 'PAGE_VIEW' | 'OTHER';

export interface AuditLogData {
    action: AuditActionType;
    resource: string;
    resourceId?: string;
    details?: any; // the payload or changes
    browserData?: {
        userAgent: string;
        language: string;
        platform: string;
        screenWidth: number;
        screenHeight: number;
        timezone: string;
    };
    path?: string;
    isImpersonated?: boolean;
}

class AuditLogger {
    private getBrowserData() {
        if (typeof window === 'undefined') return undefined;
        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screenWidth: window.innerWidth,
            screenHeight: window.innerHeight,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
    }

    async log(data: AuditLogData) {
        try {
            // Bypass tracking for local development environments entirely
            if (typeof window !== 'undefined') {
                const hostname = window.location.hostname;
                if (hostname === 'localhost' || hostname === '127.0.0.1') {
                    return;
                }
            }

            const user = auth.currentUser;
            let tenantId = 'unassigned';
            let role = 'unauthenticated';

            if (user) {
                try {
                    const token = await user.getIdTokenResult();
                    tenantId = (token.claims.tenantId as string) || 'unassigned';
                    role = (token.claims.role as string) || 'unauthenticated';
                } catch (e) {
                    console.error("Could not fetch claims for audit log", e);
                }
            }

            // Do not track System Owners or Super Admins to prevent telemetry skew
            if (role === 'system_owner' || role === 'super_admin') {
                return;
            }

            // Determine environment (Production vs Staging/Dev)
            const environment = typeof window !== 'undefined' 
                ? (window.location.hostname.includes('upfittersos.com') ? 'production' : 'staging')
                : 'server';

            // Use setDoc for idempotent writes rather than addDoc. 
            // This prevents "Document already exists" errors during network retries or strict-mode dual firings.
            const newLogRef = doc(collection(db, 'auditLogs'));
            await setDoc(newLogRef, {
                ...data,
                actorUid: user?.uid || 'anonymous',
                actorEmail: user?.email || 'anonymous',
                tenantId,
                role,
                environment,
                isImpersonated: typeof window !== 'undefined' ? sessionStorage.getItem('sae_impersonating') === 'true' : false,
                timestamp: new Date() as any,
                browserData: this.getBrowserData(),
                path: typeof window !== 'undefined' ? window.location.pathname : data.path
            });
        } catch (error) {
            console.error("Failed to write audit log:", error);
        }
    }
}

export const auditLogger = new AuditLogger();
