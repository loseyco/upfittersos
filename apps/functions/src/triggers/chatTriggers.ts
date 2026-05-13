import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const onChatMessage = functions.firestore
  .document('businesses/{tenantId}/jobs/{jobId}/chat_messages/{messageId}')
  .onCreate(async (snap, context) => {
    const { tenantId, jobId } = context.params;
    const messageData = snap.data();

    // Prevent infinite loops or unnecessary pushes for system messages
    if (messageData.isSystem) return null;

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
      const jobTitle = jobData?.jobNumber ? `#${jobData.jobNumber}` : (jobData?.title || 'a job');
      
      const assignedStaffIds: string[] = jobData?.assignedStaffIds || [];
      if (jobData?.assignedStaffId && !assignedStaffIds.includes(jobData.assignedStaffId)) {
        assignedStaffIds.push(jobData.assignedStaffId);
      }

      // Filter out the sender
      const targetStaffIds = assignedStaffIds.filter(id => id !== senderId);

      if (targetStaffIds.length === 0) {
        console.log(`No other assigned staff to notify for job ${jobId}`);
        return null;
      }

      // 2. Collect FCM tokens for target staff
      const tokens: string[] = [];
      for (const staffId of targetStaffIds) {
        const staffDoc = await db.doc(`businesses/${tenantId}/staff/${staffId}`).get();
        if (staffDoc.exists) {
          const staffData = staffDoc.data();
          if (staffData?.fcmTokens && Array.isArray(staffData.fcmTokens)) {
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
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errCode = resp.error?.code;
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
    } catch (error) {
      console.error('Error sending chat notifications:', error);
      return null;
    }
  });
