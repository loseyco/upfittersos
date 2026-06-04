"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.forceAggregateEfficiencyStats = exports.aggregateEfficiencyStats = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const calculateTenantEfficiency = async (tenantId) => {
    const db = admin.firestore();
    const timeframes = ['day', 'week', 'month', 'year'];
    try {
        const jobsSnap = await db.collection(`businesses/${tenantId}/jobs`).get();
        const jobs = jobsSnap.docs.map(d => (Object.assign({ id: d.id }, d.data())));
        const payload = {
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };
        for (const timeframe of timeframes) {
            const now = new Date();
            const start = new Date(now);
            if (timeframe === 'day')
                start.setDate(start.getDate() - 1);
            else if (timeframe === 'week')
                start.setDate(start.getDate() - 7);
            else if (timeframe === 'month')
                start.setMonth(start.getMonth() - 1);
            else if (timeframe === 'year')
                start.setFullYear(start.getFullYear() - 1);
            start.setHours(0, 0, 0, 0);
            const sessionsSnap = await db.collection(`businesses/${tenantId}/time_sessions`)
                .where('clockIn.timestamp', '>=', start)
                .orderBy('clockIn.timestamp', 'desc')
                .get();
            const sessions = sessionsSnap.docs.map(d => (Object.assign({ id: d.id }, d.data())));
            const nowTime = Date.now();
            let totalLoggedMs = 0;
            let efficiencyLoggedMs = 0;
            const userStats = {};
            const jobStats = {};
            sessions.forEach(session => {
                var _a, _b, _c, _d, _e, _f;
                const uId = session.userId || 'unknown';
                if (!userStats[uId]) {
                    userStats[uId] = { name: session.userName || 'Unknown Staff', loggedMs: 0, efficiencyLoggedMs: 0, bookMs: 0, jobsTouched: new Set() };
                }
                // Calculate actual net clocked duration for this session
                const sTs = ((_b = (_a = session.clockIn) === null || _a === void 0 ? void 0 : _a.timestamp) === null || _b === void 0 ? void 0 : _b.toDate) ? session.clockIn.timestamp.toDate().getTime() : new Date(((_c = session.clockIn) === null || _c === void 0 ? void 0 : _c.timestamp) || 0).getTime();
                const eTs = ((_e = (_d = session.clockOut) === null || _d === void 0 ? void 0 : _d.timestamp) === null || _e === void 0 ? void 0 : _e.toDate) ? session.clockOut.timestamp.toDate().getTime() : (((_f = session.clockOut) === null || _f === void 0 ? void 0 : _f.timestamp) ? new Date(session.clockOut.timestamp).getTime() : nowTime);
                const sessionMs = Math.max(0, eTs - sTs);
                const breakMs = (session.breaks || []).reduce((acc, b) => {
                    var _a, _b;
                    const bs = ((_a = b.start) === null || _a === void 0 ? void 0 : _a.toDate) ? b.start.toDate().getTime() : new Date(b.start).getTime();
                    const be = ((_b = b.end) === null || _b === void 0 ? void 0 : _b.toDate) ? b.end.toDate().getTime() : new Date(b.end).getTime();
                    return acc + Math.max(0, be - bs);
                }, 0);
                const sessionClockedMs = Math.max(0, sessionMs - breakMs);
                totalLoggedMs += sessionClockedMs;
                userStats[uId].loggedMs += sessionClockedMs;
                let sessionEfficiencyLoggedMs = 0;
                const sessionJobs = session.jobs || [];
                sessionJobs.forEach((j) => {
                    var _a;
                    if (!j.id)
                        return;
                    const jobDoc = jobs.find((job) => job.id === j.id);
                    const estimatedHours = (jobDoc === null || jobDoc === void 0 ? void 0 : jobDoc.estimatedHours) ? parseFloat(jobDoc.estimatedHours) : 0;
                    // Track individual segment duration in jobStats
                    const startTs = ((_a = j.start) === null || _a === void 0 ? void 0 : _a.toDate) ? j.start.toDate().getTime() : new Date(j.start).getTime();
                    const endTs = j.end ? (j.end.toDate ? j.end.toDate().getTime() : new Date(j.end).getTime()) : nowTime;
                    const duration = Math.max(0, endTs - startTs);
                    if (estimatedHours > 0) {
                        sessionEfficiencyLoggedMs += duration;
                        userStats[uId].jobsTouched.add(j.id);
                    }
                    if (!jobStats[j.id]) {
                        jobStats[j.id] = {
                            title: (jobDoc === null || jobDoc === void 0 ? void 0 : jobDoc.title) || j.name || 'Unknown Job',
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
            const formatHours = (ms) => (ms / 3600000).toFixed(1);
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
    }
    catch (e) {
        console.error(`[Efficiency Aggregator] Error processing tenant ${tenantId}:`, e);
        return false;
    }
};
exports.aggregateEfficiencyStats = functions.pubsub.schedule('*/30 * * * *').onRun(async (context) => {
    const db = admin.firestore();
    const businessesSnap = await db.collection('businesses').where('status', '==', 'active').get();
    if (businessesSnap.empty)
        return null;
    for (const bizDoc of businessesSnap.docs) {
        await calculateTenantEfficiency(bizDoc.id);
    }
    return null;
});
exports.forceAggregateEfficiencyStats = functions.https.onCall(async (data, context) => {
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
//# sourceMappingURL=efficiencyCron.js.map