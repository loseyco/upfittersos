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
exports.aggregateShopVitals = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
// Trigger every 30 minutes to aggregate the shop velocity vitals for the dashboard sparklines
exports.aggregateShopVitals = functions.pubsub.schedule('*/30 * * * *').onRun(async (context) => {
    const db = admin.firestore();
    // We only care about active businesses using the platform
    const businessesSnap = await db.collection('businesses').where('status', '==', 'active').get();
    if (businessesSnap.empty)
        return null;
    for (const bizDoc of businessesSnap.docs) {
        const tenantId = bizDoc.id;
        // Fetch all jobs for this tenant
        const jobsSnap = await db.collection('jobs')
            .where('tenantId', '==', tenantId)
            .get();
        let blocked = 0;
        let qa = 0;
        let active = 0;
        let delivered = 0;
        jobsSnap.docs.forEach(doc => {
            const j = doc.data();
            if (j.archived || j.status === 'Draft')
                return;
            if (j.status === 'Finished' || j.status === 'Delivered') {
                delivered++;
                return;
            }
            const tasks = j.tasks || [];
            const hasBlocked = tasks.some((t) => t.status === 'Blocked');
            const hasActive = tasks.some((t) => t.status === 'In Progress');
            const hasQA = tasks.some((t) => t.status === 'Ready for QA');
            if (hasBlocked) {
                blocked++;
            }
            else if (hasActive) {
                active++;
            }
            else if (hasQA) {
                qa++;
            }
        });
        // Store aggregated arrays deep in the specific tenant's registry
        const vitalsDocRef = db.collection('businesses').doc(tenantId).collection('system_registry').doc('shop_vitals');
        // Fetch existing history to append to array (max 20 data points)
        const existingSnap = await vitalsDocRef.get();
        let history = { blocked: [], qa: [], active: [], delivered: [] };
        if (existingSnap.exists) {
            const data = existingSnap.data();
            history = data.history || history;
        }
        // Append and constrain to the last 20 snapshots (approx 10 hours of line graph history)
        const cap = (arr, val) => {
            const next = [...(arr || [])];
            next.push(val);
            if (next.length > 20)
                return next.slice(-20);
            // Defensively pad the array to ensure minimum items for smooth graph SVGs on first launch
            while (next.length < 6)
                next.unshift(0);
            return next;
        };
        const newHistory = {
            blocked: cap(history.blocked, blocked),
            qa: cap(history.qa, qa),
            active: cap(history.active, active),
            delivered: cap(history.delivered, delivered),
        };
        await vitalsDocRef.set({
            history: newHistory,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`[Vitals Aggregator] Processed tenant ${tenantId}`);
    }
    return null;
});
//# sourceMappingURL=vitalsCron.js.map