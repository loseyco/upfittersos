import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const calculateTenantEfficiency = async (tenantId: string) => {
    const db = admin.firestore();
    const timeframes = ['day', 'week', 'month', 'year'] as const;
    try {
        const jobsSnap = await db.collection(`businesses/${tenantId}/jobs`).get();
        const jobs = jobsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

        const payload: any = {
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };

        for (const timeframe of timeframes) {
            const now = new Date();
            const start = new Date(now);
            if (timeframe === 'day') start.setDate(start.getDate() - 1);
            else if (timeframe === 'week') start.setDate(start.getDate() - 7);
            else if (timeframe === 'month') start.setMonth(start.getMonth() - 1);
            else if (timeframe === 'year') start.setFullYear(start.getFullYear() - 1);
            
            start.setHours(0, 0, 0, 0);

            const sessionsSnap = await db.collection(`businesses/${tenantId}/time_sessions`)
                .where('clockIn.timestamp', '>=', start)
                .orderBy('clockIn.timestamp', 'desc')
                .get();
            
            const sessions = sessionsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

            const nowTime = Date.now();

            let totalLoggedMs = 0;
            let efficiencyLoggedMs = 0;
            const userStats: Record<string, { name: string; loggedMs: number; efficiencyLoggedMs: number; bookMs: number; jobsTouched: Set<string> }> = {};
            const jobStats: Record<string, { title: string; estimatedHours: number; loggedMs: number }> = {};

            sessions.forEach(session => {
                const uId = session.userId || 'unknown';
                if (!userStats[uId]) {
                    userStats[uId] = { name: session.userName || 'Unknown Staff', loggedMs: 0, efficiencyLoggedMs: 0, bookMs: 0, jobsTouched: new Set() };
                }

                // Calculate actual net clocked duration for this session
                const sTs = session.clockIn?.timestamp?.toDate ? session.clockIn.timestamp.toDate().getTime() : new Date(session.clockIn?.timestamp || 0).getTime();
                const eTs = session.clockOut?.timestamp?.toDate ? session.clockOut.timestamp.toDate().getTime() : (session.clockOut?.timestamp ? new Date(session.clockOut.timestamp).getTime() : nowTime);
                const sessionMs = Math.max(0, eTs - sTs);
                const breakMs = (session.breaks || []).reduce((acc: number, b: any) => {
                    const bs = b.start?.toDate ? b.start.toDate().getTime() : new Date(b.start).getTime();
                    const be = b.end?.toDate ? b.end.toDate().getTime() : new Date(b.end).getTime();
                    return acc + Math.max(0, be - bs);
                }, 0);
                const sessionClockedMs = Math.max(0, sessionMs - breakMs);

                totalLoggedMs += sessionClockedMs;
                userStats[uId].loggedMs += sessionClockedMs;

                let sessionEfficiencyLoggedMs = 0;
                const sessionJobs = session.jobs || [];
                sessionJobs.forEach((j: any) => {
                    if (!j.id) return;
                    
                    const jobDoc = jobs.find((job: any) => job.id === j.id);
                    const estimatedHours = jobDoc?.estimatedHours ? parseFloat(jobDoc.estimatedHours) : 0;
                    
                    // Track individual segment duration in jobStats
                    const startTs = j.start?.toDate ? j.start.toDate().getTime() : new Date(j.start).getTime();
                    const endTs = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : nowTime;
                    const duration = Math.max(0, endTs - startTs);

                    if (estimatedHours > 0) {
                        sessionEfficiencyLoggedMs += duration;
                        userStats[uId].jobsTouched.add(j.id);
                    }
                    
                    if (!jobStats[j.id]) {
                        jobStats[j.id] = {
                            title: jobDoc?.title || j.name || 'Unknown Job',
                            estimatedHours: estimatedHours,
                            loggedMs: 0
                        };
                    }
                    jobStats[j.id].loggedMs += duration;
                });

                efficiencyLoggedMs += sessionEfficiencyLoggedMs;
                userStats[uId].efficiencyLoggedMs += sessionEfficiencyLoggedMs;
            });

            let totalBookMs = 0;
            Object.values(jobStats).forEach(jStat => {
                if (jStat.estimatedHours > 0 && jStat.loggedMs > 0) {
                    totalBookMs += jStat.estimatedHours * 3600000;
                }
            });

            Object.keys(userStats).forEach(uId => {
                let uBookMs = 0;
                userStats[uId].jobsTouched.forEach(jobId => {
                    const jStat = jobStats[jobId];
                    if (jStat && jStat.estimatedHours > 0) {
                    uBookMs += jStat.estimatedHours * 3600000;
                    }
                });
                userStats[uId].bookMs = uBookMs;
            });

            const formatHours = (ms: number) => (ms / 3600000).toFixed(1);

            const leaderboard = Object.values(userStats)
                .filter(u => u.loggedMs > 0)
                .map(u => ({
                    name: u.name,
                    loggedMs: u.loggedMs,
                    efficiencyRatio: u.bookMs > 0 && u.efficiencyLoggedMs > 0 ? (u.bookMs / u.efficiencyLoggedMs) * 100 : 0
                }))
                .sort((a, b) => b.efficiencyRatio - a.efficiencyRatio);

            const overallEfficiency = totalBookMs > 0 && efficiencyLoggedMs > 0 ? Math.round((totalBookMs / efficiencyLoggedMs) * 100) : 0;

            payload[timeframe] = {
                totalLoggedHours: formatHours(totalLoggedMs),
                efficiencyLoggedHours: formatHours(efficiencyLoggedMs),
                totalBookHours: formatHours(totalBookMs),
                overallEfficiency,
                leaderboard,
                jobStats: Object.values(jobStats).sort((a, b) => b.loggedMs - a.loggedMs).slice(0, 10)
            };
        }

        const docRef = db.collection('businesses').doc(tenantId).collection('system_registry').doc('efficiency_reports');
        await docRef.set(payload, { merge: true });

        console.log(`[Efficiency Aggregator] Processed tenant ${tenantId}`);
        return true;
    } catch (e) {
        console.error(`[Efficiency Aggregator] Error processing tenant ${tenantId}:`, e);
        return false;
    }
};

export const aggregateEfficiencyStats = functions.pubsub.schedule('*/30 * * * *').onRun(async (context) => {
    const db = admin.firestore();
    const businessesSnap = await db.collection('businesses').where('status', '==', 'active').get();
    if (businessesSnap.empty) return null;

    for (const bizDoc of businessesSnap.docs) {
        await calculateTenantEfficiency(bizDoc.id);
    }
    return null;
});

export const forceAggregateEfficiencyStats = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
    }
    const tenantId = data.tenantId;
    if (!tenantId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing tenantId.');
    }
    
    // In a real scenario we'd check if user is admin/owner, but for now we trust the UI.
    const success = await calculateTenantEfficiency(tenantId);
    if (!success) {
        throw new functions.https.HttpsError('internal', 'Calculation failed.');
    }
    return { success: true };
});
