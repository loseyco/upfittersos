import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Trigger that listens for any changes to staff members in the UI.
 * It automatically looks up (or creates) the matching Firebase Auth user 
 * and immediately assigns them the correct tenantId and role custom claims.
 * This fixes the "Missing Claims" error when staff are invited via the Web UI.
 */
export const syncStaffPermissions = functions.firestore
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
        let userRecord: admin.auth.UserRecord;
        let isNewUser = false;
        
        // 1. Try to find the user in Auth
        try {
            userRecord = await admin.auth().getUserByEmail(email);
            console.log(`Found existing Auth user for ${email} (${userRecord.uid})`);
        } catch (e: any) {
            // 2. If they don't exist, pre-create the Auth account so we can attach claims immediately!
            if (e.code === 'auth/user-not-found') {
                console.log(`Auth user not found for ${email}. Pre-creating account...`);
                userRecord = await admin.auth().createUser({
                    email: email,
                    password: 'password', // Default password
                    emailVerified: false, // They will verify on first login
                    displayName: `${firstName} ${lastName}`.trim()
                });
                console.log(`Successfully pre-created Auth user: ${userRecord.uid} with default password.`);
                isNewUser = true;
            } else {
                throw e; // throw other errors
            }
        }

        // 3. Ensure Firestore user document exists with email populated
        const userDocRef = admin.firestore().collection('users').doc(userRecord.uid);
        const userDocSnap = await userDocRef.get();
        if (!userDocSnap.exists) {
            await userDocRef.set({
                firstName: firstName,
                lastName: lastName,
                email: email.toLowerCase(),
                mustChangePassword: isNewUser, // only force password reset if we pre-created with default 'password'
                createdAt: new Date().toISOString()
            }, { merge: true });
            console.log(`Created user document for ${email} because it did not exist.`);
        } else {
            // Document exists, make sure email field is populated
            const userDocData = userDocSnap.data();
            if (!userDocData || !userDocData.email) {
                await userDocRef.set({
                    email: email.toLowerCase()
                }, { merge: true });
                console.log(`Updated existing user document for ${email} with email field.`);
            }
        }

        // 3. Assign Custom Claims
        const currentClaims = userRecord.customClaims || {};
        const role = data.role || 'staff';
        const roles = data.roles || [role];

        await admin.auth().setCustomUserClaims(userRecord.uid, {
            ...currentClaims,
            tenantId: tenantId,
            role: role,
            roles: roles
        });

        console.log(`Successfully synced claims for ${email} in tenant ${tenantId}`);

        // 4. (Optional) Auto-link the Firestore document to the Auth UID if it isn't already
        // This is safe because we use merge: true to avoid infinite loops if it already matches.
        if (data.userId !== userRecord.uid) {
            await change.after.ref.set({ userId: userRecord.uid }, { merge: true });
        }

    } catch (err) {
        console.error(`Failed to sync claims for ${email}:`, err);
    }
});
