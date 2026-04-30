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
// Ensure we hit production database
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: "saegroup-c6487",
    });
}
const db = admin.firestore();
async function run() {
    console.log("Migrating jobs to add default sopSupplies and shipping...");
    const jobsSnap = await db.collection('jobs').get();
    let updatedJobs = 0;
    for (const doc of jobsSnap.docs) {
        const data = doc.data();
        let needsUpdate = false;
        const updates = {};
        if (data.sopSupplies === undefined) {
            updates.sopSupplies = 0;
            needsUpdate = true;
        }
        if (data.shipping === undefined) {
            updates.shipping = 0;
            needsUpdate = true;
        }
        if (needsUpdate) {
            await doc.ref.update(updates);
            updatedJobs++;
        }
    }
    console.log(`\n========================================`);
    console.log(`MIGRATION SCRIPT COMPLETED SUCCESSFULLY.`);
    console.log(`Migrated Jobs: ${updatedJobs}`);
    console.log(`========================================\n`);
}
run().catch(console.error);
//# sourceMappingURL=migrate_jobs_defaults.js.map