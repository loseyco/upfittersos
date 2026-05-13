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
exports.syncStaffPermissions = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
/**
 * Trigger that listens for any changes to staff members in the UI.
 * It automatically looks up (or creates) the matching Firebase Auth user
 * and immediately assigns them the correct tenantId and role custom claims.
 * This fixes the "Missing Claims" error when staff are invited via the Web UI.
 */
exports.syncStaffPermissions = functions.firestore
    .document('businesses/{tenantId}/staff/{staffId}')
    .onWrite(async (change, context) => {
    const tenantId = context.params.tenantId;
    const data = change.after.exists ? change.after.data() : null;
    // If the staff record was deleted, we don't necessarily want to delete the Auth user
    // because they might be in multiple workspaces. But we could revoke their tenantId.
    if (!data) {
        console.log(`Staff record deleted for tenant ${tenantId}. Skipping claim sync.`);
        return;
    }
    const email = data.email;
    const firstName = data.firstName || '';
    const lastName = data.lastName || '';
    if (!email) {
        console.warn(`Staff record ${context.params.staffId} has no email. Cannot sync claims.`);
        return;
    }
    try {
        let userRecord;
        // 1. Try to find the user in Auth
        try {
            userRecord = await admin.auth().getUserByEmail(email);
            console.log(`Found existing Auth user for ${email} (${userRecord.uid})`);
        }
        catch (e) {
            // 2. If they don't exist, pre-create the Auth account so we can attach claims immediately!
            if (e.code === 'auth/user-not-found') {
                console.log(`Auth user not found for ${email}. Pre-creating account...`);
                userRecord = await admin.auth().createUser({
                    email: email,
                    password: 'Upfitters2026!', // Default password so monitor accounts can log in
                    emailVerified: false, // They will verify on first login
                    displayName: `${firstName} ${lastName}`.trim()
                });
                console.log(`Successfully pre-created Auth user: ${userRecord.uid} with default password.`);
            }
            else {
                throw e; // throw other errors
            }
        }
        // 3. Assign Custom Claims
        const currentClaims = userRecord.customClaims || {};
        const role = data.role || 'staff';
        const roles = data.roles || [role];
        await admin.auth().setCustomUserClaims(userRecord.uid, Object.assign(Object.assign({}, currentClaims), { tenantId: tenantId, role: role, roles: roles }));
        console.log(`Successfully synced claims for ${email} in tenant ${tenantId}`);
        // 4. (Optional) Auto-link the Firestore document to the Auth UID if it isn't already
        // This is safe because we use merge: true to avoid infinite loops if it already matches.
        if (data.userId !== userRecord.uid) {
            await change.after.ref.set({ userId: userRecord.uid }, { merge: true });
        }
    }
    catch (err) {
        console.error(`Failed to sync claims for ${email}:`, err);
    }
});
//# sourceMappingURL=staffTriggers.js.map