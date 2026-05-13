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
exports.onChatMessage = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
exports.onChatMessage = functions.firestore
    .document('businesses/{tenantId}/jobs/{jobId}/chat_messages/{messageId}')
    .onCreate(async (snap, context) => {
    const { tenantId, jobId } = context.params;
    const messageData = snap.data();
    // Prevent infinite loops or unnecessary pushes for system messages
    if (messageData.isSystem)
        return null;
    const senderId = messageData.senderId;
    const senderName = messageData.senderName || 'Someone';
    const messageText = messageData.message || 'Sent a message';
    const db = admin.firestore();
    try {
        // 1. Get the job to find assigned staff
        const jobDoc = await db.doc(`businesses/${tenantId}/jobs/${jobId}`).get();
        if (!jobDoc.exists) {
            console.log(`Job ${jobId} not found, skipping notifications`);
            return null;
        }
        const jobData = jobDoc.data();
        const jobTitle = (jobData === null || jobData === void 0 ? void 0 : jobData.jobNumber) ? `#${jobData.jobNumber}` : ((jobData === null || jobData === void 0 ? void 0 : jobData.title) || 'a job');
        const assignedStaffIds = (jobData === null || jobData === void 0 ? void 0 : jobData.assignedStaffIds) || [];
        if ((jobData === null || jobData === void 0 ? void 0 : jobData.assignedStaffId) && !assignedStaffIds.includes(jobData.assignedStaffId)) {
            assignedStaffIds.push(jobData.assignedStaffId);
        }
        // Filter out the sender
        const targetStaffIds = assignedStaffIds.filter(id => id !== senderId);
        if (targetStaffIds.length === 0) {
            console.log(`No other assigned staff to notify for job ${jobId}`);
            return null;
        }
        // 2. Collect FCM tokens for target staff
        const tokens = [];
        for (const staffId of targetStaffIds) {
            const staffDoc = await db.doc(`businesses/${tenantId}/staff/${staffId}`).get();
            if (staffDoc.exists) {
                const staffData = staffDoc.data();
                if ((staffData === null || staffData === void 0 ? void 0 : staffData.fcmTokens) && Array.isArray(staffData.fcmTokens)) {
                    tokens.push(...staffData.fcmTokens);
                }
            }
        }
        if (tokens.length === 0) {
            console.log(`No FCM tokens found for assigned staff on job ${jobId}`);
            return null;
        }
        // 3. Send Multicast Notification
        const payload = {
            notification: {
                title: `New message on ${jobTitle}`,
                body: `${senderName}: ${messageText}`
            },
            data: {
                jobId: jobId,
                tenantId: tenantId,
                type: 'chat_message'
            },
            tokens: tokens
        };
        const response = await admin.messaging().sendEachForMulticast(payload);
        console.log(`Successfully sent ${response.successCount} messages; ${response.failureCount} failed.`);
        // Cleanup invalid tokens
        if (response.failureCount > 0) {
            const failedTokens = [];
            response.responses.forEach((resp, idx) => {
                var _a;
                if (!resp.success) {
                    const errCode = (_a = resp.error) === null || _a === void 0 ? void 0 : _a.code;
                    if (errCode === 'messaging/invalid-registration-token' || errCode === 'messaging/registration-token-not-registered') {
                        failedTokens.push(tokens[idx]);
                    }
                }
            });
            if (failedTokens.length > 0) {
                console.log(`Need to clean up ${failedTokens.length} invalid tokens (not implemented yet).`);
                // Full implementation would iterate through targetStaffIds, remove invalid tokens, and update the staff document
            }
        }
        return null;
    }
    catch (error) {
        console.error('Error sending chat notifications:', error);
        return null;
    }
});
//# sourceMappingURL=chatTriggers.js.map