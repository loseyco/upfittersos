import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

/**
 * Triggered when a new message is created in the messages collection.
 * It reads the tenantId from the message, finds all staff mapped to that tenant,
 * pulls their FCM tokens, and sends a multicast notification.
 */
export const onMessageReceived = functions.firestore.onDocumentCreated(
    'messages/{messageId}',
    async (event) => {
        const snapshot = event.data;
        if (!snapshot) {
            console.log("No data associated with the event");
            return;
        }

        const messageData = snapshot.data();
        const tenantId = messageData.tenantId;
        const senderId = messageData.senderId;
        const senderName = messageData.senderName || "Someone";
        const messageText = messageData.text || "sent a message.";

        if (!tenantId) {
            console.error("Message lacks a tenantId", messageData);
            return;
        }

        try {
            // Retrieve all users matching this tenantId
            const usersSnapshot = await admin.firestore().collection('users')
                .where('tenantId', '==', tenantId)
                .get();

            if (usersSnapshot.empty) {
                console.log(`No users found for tenant ${tenantId}`);
                return;
            }

            const targetUids = usersSnapshot.docs
                .map(doc => doc.id)
                .filter(uid => uid !== senderId); // Exclude the person sending the message

            if (targetUids.length === 0) {
                console.log("No other participants to notify.");
                return;
            }

            // Fetch Firebase FCM Tokens for the target UIDs
            const tokensSnapshot = await admin.firestore().collection('user_fcm_tokens')
                .where(admin.firestore.FieldPath.documentId(), 'in', targetUids)
                .get();

            if (tokensSnapshot.empty) {
                console.log("No registered push tokens found for this tenant's users.");
                return;
            }

            const tokens: string[] = [];
            tokensSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.token) {
                    tokens.push(data.token);
                }
            });

            if (tokens.length === 0) {
                console.log("No active broadcast tokens to dispatch.");
                return;
            }

            // Construct Universal Mobile Push Payload
            const payload = {
                notification: {
                    title: `New Message from ${senderName}`,
                    body: messageText,
                },
                data: {
                    type: 'chat_message',
                    tenantId: tenantId
                },
                tokens: tokens
            };

            // Dispatch multicast via Admin SDK natively
            const response = await admin.messaging().sendEachForMulticast(payload);
            console.log(`Successfully dispatched ${response.successCount} messages. Failed: ${response.failureCount}.`);

        } catch (error) {
            console.error("Error processing message push:", error);
        }
    }
);

/**
 * Triggered when a new announcement is created in the announcements collection.
 * It reads the tenantId from the announcement, finds all staff mapped to that tenant,
 * pulls their FCM tokens, and sends a multicast notification.
 */
export const onAnnouncementCreated = functions.firestore.onDocumentCreated(
    'announcements/{announcementId}',
    async (event) => {
        const snapshot = event.data;
        if (!snapshot) {
            console.log("No data associated with the event");
            return;
        }

        const data = snapshot.data();
        const tenantId = data.tenantId;
        const title = data.title || "New Announcement";
        const messageText = data.text || "Check the Workspace Hub for updates.";

        if (!tenantId) {
            console.error("Announcement lacks a tenantId", data);
            return;
        }

        try {
            // Retrieve all users matching this tenantId
            const usersSnapshot = await admin.firestore().collection('users')
                .where('tenantId', '==', tenantId)
                .get();

            if (usersSnapshot.empty) {
                console.log(`No users found for tenant ${tenantId}`);
                return;
            }

            const targetUids = usersSnapshot.docs.map(doc => doc.id);

            // Fetch Firebase FCM Tokens for the target UIDs
            const tokensSnapshot = await admin.firestore().collection('user_fcm_tokens')
                .where(admin.firestore.FieldPath.documentId(), 'in', targetUids)
                .get();

            if (tokensSnapshot.empty) {
                console.log("No registered push tokens found for this tenant's users.");
                return;
            }

            const tokens: string[] = [];
            tokensSnapshot.forEach(doc => {
                const docData = doc.data();
                if (docData.token) {
                    tokens.push(docData.token);
                }
            });

            if (tokens.length === 0) {
                console.log("No active broadcast tokens to dispatch.");
                return;
            }

            // Construct Universal Mobile Push Payload
            const payload = {
                notification: {
                    title: `📢 ${title}`,
                    body: messageText,
                },
                data: {
                    type: 'announcement',
                    tenantId: tenantId
                },
                tokens: tokens
            };

            // Dispatch multicast via Admin SDK natively
            const response = await admin.messaging().sendEachForMulticast(payload);
            console.log(`Successfully dispatched ${response.successCount} announcement alerts. Failed: ${response.failureCount}.`);

        } catch (error) {
            console.error("Error processing announcement push:", error);
        }
    }
);
