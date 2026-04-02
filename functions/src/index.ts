import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import express, { Request, Response } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import * as YAML from 'yamljs';
import * as path from 'path';
import { companyCamRoutes } from './routes/companyCam.routes';
import { scanRoutes } from './routes/scan.routes';
import { qboRoutes } from './routes/qbo.routes';
import { unitRoutes } from './routes/units.routes';
import { inventoryRoutes } from './routes/inventory.routes';
import { tasksRoutes } from './routes/tasks.routes';
import { customersRoutes } from './routes/customers.routes';
import { vehiclesRoutes } from './routes/vehicles.routes';
import { jobsRoutes } from './routes/jobs.routes';
import { areasRoutes } from './routes/areas.routes';

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Initialize Express
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Load Swagger document
const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));

import { authenticate, superAdminOnly } from './middleware/auth.middleware';

// --- API Documentation Route ---
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// --- API: Public Auth Resolution ---
// Unauthenticated endpoint to intelligently route users on the Login page
app.post('/auth/check', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
      const userRecord = await admin.auth().getUserByEmail(email);

      const hasGoogleSSO = userRecord.providerData.some(p => p.providerId === 'google.com');

      // When an Admin provisions an account with a random password, creationTime === tokensValidAfterTime.
      // When the user resets their password, tokensValidAfterTime is updated.
      const creationTimeMs = Date.parse(userRecord.metadata.creationTime);
      const passwordChangedTimeMs = Date.parse(userRecord.tokensValidAfterTime || userRecord.metadata.creationTime);
      const hasSetPassword = (passwordChangedTimeMs - creationTimeMs) > 2000;

      return res.json({
        exists: true,
        status: (hasSetPassword || hasGoogleSSO) ? 'active' : 'provisioned',
        authProviders: userRecord.providerData.map(p => p.providerId)
      });
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        return res.json({ exists: false, status: 'new' });
      }
      throw e;
    }
  } catch (error) {
    console.error("Auth check failed", error);
    return res.status(500).json({ error: 'Identity resolution failed' });
  }
});

// --- Example Route: GET /users/me ---
app.get('/users/me', authenticate, async (req: Request, res: Response): Promise<Response> => {
  try {
    const uid = (req as any).user.uid;
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found in database' });
    }
    return res.json({ uid, ...userDoc.data() });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Middleware removed and imported cleanly from ./middleware/auth.middleware

// --- API: Super Admin Diagnostics ---

// POST /admin/impersonate - Generate a secure Custom JWT to assume another user's identity
app.post('/admin/impersonate', authenticate, superAdminOnly, async (req: Request, res: Response): Promise<Response> => {
  try {
    const { targetUid } = req.body;
    if (!targetUid) return res.status(400).json({ error: 'targetUid is required' });

    const customToken = await admin.auth().createCustomToken(targetUid);
    return res.json({ token: customToken });
  } catch (error) {
    console.error("Failed to generate impersonation token", error);
    return res.status(500).json({ error: 'Server failed to construct token' });
  }
});

// POST /admin/enter-workspace - Temporarily re-auth the Super Admin into a specific local workspace
app.post('/admin/enter-workspace', authenticate, superAdminOnly, async (req: Request, res: Response): Promise<Response> => {
  try {
    const { targetTenantId } = req.body;
    const adminUser = (req as any).user;

    if (!targetTenantId) return res.status(400).json({ error: 'targetTenantId is required' });

    // The token claims will inherit super_admin but adopt the specific tenantId
    const customClaims = {
      role: 'super_admin',
      tenantId: targetTenantId
    };

    const customToken = await admin.auth().createCustomToken(adminUser.uid, customClaims);
    return res.json({ token: customToken });
  } catch (error) {
    console.error("Failed to generate contextual bind token", error);
    return res.status(500).json({ error: 'Server failed to construct token' });
  }
});

// --- API: Businesses (Multi-Tenant) ---

// GET /businesses - List all provisioned client businesses
app.get('/businesses', authenticate, superAdminOnly, async (req: Request, res: Response): Promise<Response> => {
  try {
    const snapshot = await db.collection('businesses').orderBy('createdAt', 'desc').get();
    const businesses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.json(businesses);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

// GET /businesses/:id - Get specific business metadata (Authorized tenant members only)
app.get('/businesses/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
  const businessId = req.params.id;
  const caller = (req as any).user;

  try {
    const isSuperAdmin = caller.role === 'super_admin';
    const isMemberOfTenant = caller.tenantId === businessId;

    if (!isSuperAdmin && !isMemberOfTenant) {
      return res.status(403).json({ error: 'Forbidden. You do not have permission to view this workspace metadata.' });
    }

    const docRef = await db.collection('businesses').doc(businessId).get();
    if (!docRef.exists) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }

    return res.json({ id: docRef.id, ...docRef.data() });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch workspace metadata' });
  }
});

// PUT /businesses/:id - Update specific business metadata (Authorized Tenant Managers only)
app.put('/businesses/:id', authenticate, async (req: Request, res: Response): Promise<Response> => {
  const businessId = req.params.id;
  const caller = (req as any).user;

  try {
    const isSuperAdmin = caller.role === 'super_admin';
    
    // Check if user has explicit override permission, or if they are at least a manager (depending on architecture)
    // For now, let's allow business_owner and super_admin, or someone with manage_staff (we might want a specific manage_business permission later)
    const isManagerOfTenant = (caller.role === 'business_owner' || caller.role === 'manager') && caller.tenantId === businessId;

    if (!isSuperAdmin && !isManagerOfTenant) {
      return res.status(403).json({ error: 'Forbidden. You do not have permission to modify workspace metadata.' });
    }

    const {
      name, legalName, email, phone, website,
      addressStreet, addressCity, addressState, addressZip, customRoles
    } = req.body;

    const updates: any = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

    if (name !== undefined) updates.name = name;
    if (legalName !== undefined) updates.legalName = legalName;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (website !== undefined) updates.website = website;
    if (addressStreet !== undefined) updates.addressStreet = addressStreet;
    if (addressCity !== undefined) updates.addressCity = addressCity;
    if (addressState !== undefined) updates.addressState = addressState;
    if (addressZip !== undefined) updates.addressZip = addressZip;
    
    if (customRoles !== undefined) {
      const sanitizedRoles = { ...customRoles };
      if (!isSuperAdmin) {
        // Strip out any attempts to inject super_admin permissions into a workspace role
        for (const roleKey of Object.keys(sanitizedRoles)) {
            const roleDef = sanitizedRoles[roleKey];
            if (roleDef && roleDef.permissions) {
               for (const permKey of Object.keys(roleDef.permissions)) {
                   if (permKey.startsWith('super_')) {
                       delete roleDef.permissions[permKey];
                   }
               }
            }
        }
      }
      updates.customRoles = sanitizedRoles;
    }

    await db.collection('businesses').doc(businessId).update(updates);

    return res.json({ message: 'Workspace metadata updated successfully', updates });
  } catch (error: any) {
    console.error(`Error updating workspace metadata:`, error);
    return res.status(500).json({ error: 'Failed to update workspace metadata', raw: error?.message || String(error), stack: error?.stack });
  }
});

// POST /businesses - Provision a new client business
app.post('/businesses', authenticate, superAdminOnly, async (req: Request, res: Response): Promise<Response> => {
  const { name, ownerEmail, subscriptionPlan } = req.body;
  try {
    if (!name) {
      return res.status(400).json({ error: 'Workspace Name is required' });
    }

    // Attempt to create the owner identity or retrieve if it already exists (if provided)
    let ownerAuth = null;
    if (ownerEmail) {
      try {
        ownerAuth = await admin.auth().createUser({
          email: ownerEmail,
          password: Math.random().toString(36).slice(-8) + 'A1!',
          displayName: `${name} Owner`
        });
      } catch (e: any) {
        if (e.code === 'auth/email-already-exists') {
          ownerAuth = await admin.auth().getUserByEmail(ownerEmail);
        } else {
          return res.status(400).json({ error: 'Owner email is invalid or could not be processed.' });
        }
      }
    }

    const businessData = {
      name,
      ownerEmail: ownerEmail || 'Unassigned',
      ownerUid: ownerAuth ? ownerAuth.uid : null,
      status: 'active',
      subscriptionPlan: subscriptionPlan || 'free',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      metrics: {
        totalStaff: ownerAuth ? 1 : 0,
        MRR: subscriptionPlan === 'free' ? 0 : 99
      }
    };

    const docRef = await db.collection('businesses').add(businessData);
    const businessId = docRef.id;

    let setupLink = null;

    // Set custom claims securely via API if an owner was provided
    if (ownerAuth) {
      try {
        const currentClaims = ownerAuth.customClaims || {};
        await admin.auth().setCustomUserClaims(ownerAuth.uid, {
          ...currentClaims,
          role: currentClaims.role === 'super_admin' ? 'super_admin' : 'business_owner',
          tenantId: businessId // Lock them to this specific workspace
        });

        // Generate a secure first-time password setup link
        setupLink = await admin.auth().generatePasswordResetLink(ownerEmail);
      } catch (claimError) {
        console.error("Failed to assign new role claims or generate setup link:", claimError);
      }
    }

    return res.status(201).json({
      id: businessId,
      ...businessData,
      roleAssigned: true,
      setupLink
    });

  } catch (error) {
    console.error('Error provisioning business:', error);
    return res.status(500).json({ error: 'Failed to provision workspace' });
  }
});

// ///////////////////////////////////////////////////////////
// API: Workspace Staff Provisioning
// ///////////////////////////////////////////////////////////

// GET /businesses/:id/staff - Fetch all users belonging to this specific workspace
app.get('/businesses/:id/staff', authenticate, async (req: Request, res: Response): Promise<Response> => {
  const businessId = req.params.id;
  const caller = (req as any).user;

  try {
    const isSuperAdmin = caller.role === 'super_admin';
    const isMemberOfTenant = caller.tenantId === businessId;

    if (!isSuperAdmin && !isMemberOfTenant) {
      return res.status(403).json({ error: 'Forbidden. You do not have permission to view staff in this workspace.' });
    }

    const listUsersResult = await admin.auth().listUsers(1000);

    // Filter map: only return users mapped to this specific tenantId
    const staffMembers = listUsersResult.users.reduce((acc: any[], userRecord) => {
      const claims = userRecord.customClaims || {};
      const tId = claims.tenantId || 'unassigned';

      if (tId === businessId) {
        acc.push({
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName,
          photoURL: userRecord.photoURL || null,
          role: claims.role || 'standard',
          roles: Array.isArray(claims.roles) ? claims.roles : (claims.role ? [claims.role] : []),
          tenantId: tId,
          lastSignInTime: userRecord.metadata.lastSignInTime,
          creationTime: userRecord.metadata.creationTime
        });
      }
      return acc;
    }, []);

    // Ensure absolute uniqueness by email defensively in case of Provider overlap
    const uniqueStaffMembers = Array.from(new Map(staffMembers.map(item => [item.email?.toLowerCase(), item])).values());

    // Enrich with Business Identity from Firestore
    const enrichedStaffMembers = await Promise.all(
      uniqueStaffMembers.map(async (user) => {
        try {
          const userDoc = await db.collection('users').doc(user.uid).get();
          const userData = userDoc.exists ? userDoc.data() : {};
          return {
            ...user,
            ...userData,
          };
        } catch (err) {
          console.warn(`Failed to enrich user ${user.uid} with Firestore data`, err);
          return user;
        }
      })
    );

    return res.json(enrichedStaffMembers);
  } catch (error) {
    console.error(`Error fetching staff for ${businessId}:`, error);
    return res.status(500).json({ error: 'Failed to fetch workspace staff' });
  }
});

// POST /businesses/:id/staff - Invite a user to a workspace by email
app.post('/businesses/:id/staff', authenticate, async (req: Request, res: Response): Promise<Response> => {
  const businessId = req.params.id;
  const caller = (req as any).user;

  try {
    // 1. Authorization Guard
    const isSuperAdmin = caller.role === 'super_admin';
    const isOwnerOfTenant = caller.role === 'business_owner' && caller.tenantId === businessId;

    let hasManageStaffOverride = false;
    if (!isSuperAdmin && !isOwnerOfTenant) {
        try {
            const callerDoc = await db.collection('users').doc(caller.uid).get();
            if (callerDoc.exists && callerDoc.data()?.customPermissions?.manage_staff === true) {
                hasManageStaffOverride = true;
            }
        } catch (err) {
            console.error('Failed to verify caller permissions override', err);
        }
    }

    if (!isSuperAdmin && !isOwnerOfTenant && !hasManageStaffOverride) {
      return res.status(403).json({ error: 'Forbidden. You do not have permission to invite staff to this workspace.' });
    }

    const { email, role, roles } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const arrayRoles = roles && Array.isArray(roles) && roles.length > 0 ? roles : (role ? [role] : ['staff']);
    const primaryRole = arrayRoles[0];

    // 2. Identity Resolution
    let targetAuth;
    let isNewUser = false;
    try {
      // First, check if the identity already exists globally
      targetAuth = await admin.auth().getUserByEmail(email);
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        // Identity doesn't exist, seamlessly provision them onto the platform
        isNewUser = true;
        targetAuth = await admin.auth().createUser({
          email,
          password: Math.random().toString(36).slice(-8) + 'X9!', // They execute a password reset flow later to claim
          emailVerified: false
        });
      } else {
        throw e;
      }
    }

    // 3. Inject Granular Tenant Rules (Custom Claims)
    const currentClaims = targetAuth.customClaims || {};
    await admin.auth().setCustomUserClaims(targetAuth.uid, {
      ...currentClaims,
      role: primaryRole, // Maintain backwards compatibility parameter
      roles: arrayRoles, // New modern multi-level array representation
      tenantId: businessId // Lock them to this specific workspace
    });

    // 4. Automatically sync Ownership Transfers to the Primary Database record
    if (primaryRole === 'business_owner') {
      await db.collection('businesses').doc(businessId).update({
        ownerEmail: email,
        ownerUid: targetAuth.uid
      });
    }

    let setupLink = null;
    if (isNewUser) {
      setupLink = await admin.auth().generatePasswordResetLink(email);
    }

    return res.status(200).json({
      message: `Successfully mapped ${email} to Workspace ${businessId} as ${role}`,
      uid: targetAuth.uid,
      isNewUser,
      setupLink
    });

  } catch (error) {
    console.error(`Error provisioning staff for ${businessId}:`, error);
    return res.status(500).json({ error: 'Failed to provision staff to workspace' });
  }
});

// DELETE /businesses/:id/staff/:uid - Hard delete an identity from the Firebase platform
app.delete('/businesses/:id/staff/:uid', authenticate, async (req: Request, res: Response): Promise<Response> => {
  const businessId = req.params.id;
  const targetUid = req.params.uid;
  const caller = (req as any).user;

  try {
    const isSuperAdmin = caller.role === 'super_admin';
    const isOwnerOfTenant = caller.role === 'business_owner' && caller.tenantId === businessId;

    let hasManageStaffOverride = false;
    if (!isSuperAdmin && !isOwnerOfTenant) {
        try {
            const callerDoc = await db.collection('users').doc(caller.uid).get();
            if (callerDoc.exists && callerDoc.data()?.customPermissions?.manage_staff === true) {
                hasManageStaffOverride = true;
            }
        } catch (err) {
            console.error('Failed to verify caller permissions override', err);
        }
    }

    if (!isSuperAdmin && !isOwnerOfTenant && !hasManageStaffOverride) {
      return res.status(403).json({ error: 'Forbidden. You do not have permission to delete staff.' });
    }

    // Completely eradicate the user from Firebase Auth
    await admin.auth().deleteUser(targetUid);

    return res.json({ message: 'User identity successfully eradicated from the platform.' });
  } catch (error) {
    console.error(`Error deleting user ${targetUid}:`, error);
    return res.status(500).json({ error: 'Failed to delete user identity.' });
  }
});

// POST /businesses/:id/staff/:uid/impersonate - Generate a secure Custom JWT to assume a staff member's identity
app.post('/businesses/:id/staff/:uid/impersonate', authenticate, async (req: Request, res: Response): Promise<Response> => {
  const businessId = req.params.id;
  const targetUid = req.params.uid;
  const caller = (req as any).user;

  try {
    const isSuperAdmin = caller.role === 'super_admin';
    const isOwnerOfTenant = caller.role === 'business_owner' && caller.tenantId === businessId;

    if (!isSuperAdmin && !isOwnerOfTenant) {
      return res.status(403).json({ error: 'Forbidden. Only Business Owners can impersonate staff.' });
    }

    // Verify target user actually belongs to this tenant
    const targetUser = await admin.auth().getUser(targetUid);
    const targetClaims = targetUser.customClaims || {};
    
    if (targetClaims.tenantId !== businessId) {
      return res.status(403).json({ error: 'Target identity is not bound to your workspace.' });
    }

    if (targetClaims.role === 'super_admin' || targetClaims.role === 'business_owner') {
      return res.status(403).json({ error: 'Cannot impersonate equal or higher authority identities.' });
    }

    const customToken = await admin.auth().createCustomToken(targetUid);
    return res.json({ token: customToken });
  } catch (error) {
    console.error("Failed to generate contextual bind token for staff", error);
    return res.status(500).json({ error: 'Server failed to construct impersonation token' });
  }
});

// POST /businesses/:id/staff/:uid/metadata - Update jobTitle and department for a staff member
app.post('/businesses/:id/staff/:uid/metadata', authenticate, async (req: Request, res: Response): Promise<Response> => {
  const businessId = req.params.id;
  const targetUid = req.params.uid;
  const caller = (req as any).user;

  try {
    const isSuperAdmin = caller.role === 'super_admin';
    const isManagerOfTenant = (caller.role === 'business_owner' || caller.role === 'manager') && caller.tenantId === businessId;

    let hasManageStaffOverride = false;
    if (!isSuperAdmin && !isManagerOfTenant) {
        try {
            const callerDoc = await db.collection('users').doc(caller.uid).get();
            if (callerDoc.exists && callerDoc.data()?.customPermissions?.manage_staff === true) {
                hasManageStaffOverride = true;
            }
        } catch (err) {
            console.error('Failed to verify caller permissions override', err);
        }
    }

    if (!isSuperAdmin && !isManagerOfTenant && !hasManageStaffOverride) {
      return res.status(403).json({ error: 'Forbidden. You do not have permission to modify staff metadata.' });
    }

    const {
        jobTitle, department, workPhone, mobilePhone,
        addressStreet, addressCity, addressState, addressZip, 
        photoURL, dob, emergencyContactName,
        emergencyContactPhone, payRate, payType, startDate, notes,
        skills, certificates, firstName, middleName, lastName, nickName,
        customPermissions, role, roles
    } = req.body;

    const userUpdates: any = { updatedAt: new Date().toISOString() };
    if (firstName !== undefined) userUpdates.firstName = firstName;
    if (middleName !== undefined) userUpdates.middleName = middleName;
    if (lastName !== undefined) userUpdates.lastName = lastName;
    if (nickName !== undefined) userUpdates.nickName = nickName;
    if (jobTitle !== undefined) userUpdates.jobTitle = jobTitle;
    if (department !== undefined) userUpdates.department = department;
    if (workPhone !== undefined) userUpdates.workPhone = workPhone;
    if (mobilePhone !== undefined) userUpdates.mobilePhone = mobilePhone;
    if (addressStreet !== undefined) userUpdates.addressStreet = addressStreet;
    if (addressCity !== undefined) userUpdates.addressCity = addressCity;
    if (addressState !== undefined) userUpdates.addressState = addressState;
    if (addressZip !== undefined) userUpdates.addressZip = addressZip;
    if (photoURL !== undefined) userUpdates.photoURL = photoURL;
    if (dob !== undefined) userUpdates.dob = dob;
    if (emergencyContactName !== undefined) userUpdates.emergencyContactName = emergencyContactName;
    if (emergencyContactPhone !== undefined) userUpdates.emergencyContactPhone = emergencyContactPhone;
    if (payRate !== undefined) userUpdates.payRate = payRate;
    if (payType !== undefined) userUpdates.payType = payType;
    if (startDate !== undefined) userUpdates.startDate = startDate;
    if (notes !== undefined) userUpdates.notes = notes;
    if (skills !== undefined) userUpdates.skills = skills;
    if (certificates !== undefined) userUpdates.certificates = certificates;

    // Instead of trusting merge: true on nested maps, we force dot notation paths
    // First apply base metadata generically
    const baseUpdates: any = { 
        updatedAt: new Date().toISOString(),
        _diagnostic_last_write: `Metadata Endpoint Executed at ${new Date().toISOString()}`,
        _diagnostic_payload_received: customPermissions !== undefined ? 'YES_OBJECT' : 'UNDEFINED'
    };
    
    for (const [k, v] of Object.entries(userUpdates)) {
        baseUpdates[k] = v;
    }

    if (customPermissions !== undefined && typeof customPermissions === 'object') {
        let finalPermissions = { ...customPermissions };
        if (!isSuperAdmin) {
            const existingDoc = await db.collection('users').doc(targetUid).get();
            const existingPerms = existingDoc.data()?.customPermissions || {};
            
            for (const key of Object.keys(finalPermissions)) {
                if (key.startsWith('super_')) delete finalPermissions[key];
            }
            for (const key of Object.keys(existingPerms)) {
                if (key.startsWith('super_')) finalPermissions[key] = existingPerms[key];
            }
        }
        
        // Convert to absolute dot notation to guarantee firestore writes nested keys perfectly
        for (const [k, v] of Object.entries(finalPermissions)) {
            baseUpdates[`customPermissions.${k}`] = v;
        }

        // Edge case: if they turn everything off, we must ensure the core object exists
        if (Object.keys(finalPermissions).length === 0) {
            baseUpdates[`customPermissions`] = {};
        }
    }

    try {
        await db.collection('users').doc(targetUid).update(baseUpdates);
    } catch (err: any) {
        // If document doesn't exist, dot notation fails. Fallback to basic create.
        if (err.code === 5 || err.message?.includes('NOT_FOUND')) {
            const freshCreate: any = { updatedAt: new Date().toISOString() };
            for (const [k, v] of Object.entries(userUpdates)) freshCreate[k] = v;
            
            // For a brand new document, we can safely write the object natively
            if (customPermissions !== undefined && typeof customPermissions === 'object') {
                const finalP = { ...customPermissions };
                if (!isSuperAdmin) {
                    for (const key of Object.keys(finalP)) {
                        if (key.startsWith('super_')) delete finalP[key];
                    }
                }
                freshCreate.customPermissions = finalP;
            }
            await db.collection('users').doc(targetUid).set(freshCreate);
        } else {
            throw err;
        }
    }

    // Synchronize Auth Claims natively if explicitly mutated in the payload
    if (roles !== undefined) {
        const sanitizedRoles = Array.isArray(roles) ? roles : (role ? [role] : []);
        const filteredRoles = sanitizedRoles.filter((r: string) => 
           isSuperAdmin || (r !== 'super_admin' && r !== 'business_owner')
        );

        const targetAuth = await admin.auth().getUser(targetUid);
        const currentClaims = targetAuth.customClaims || {};
        
        // Block hijacking core ownership models securely
        if (currentClaims.role !== 'business_owner' || isSuperAdmin) {
            const primaryRole = filteredRoles.length > 0 ? filteredRoles[0] : 'staff';
            await admin.auth().setCustomUserClaims(targetUid, {
                ...currentClaims,
                role: primaryRole,
                roles: filteredRoles
            });
            await db.collection('users').doc(targetUid).update({
                role: primaryRole,
                roles: filteredRoles
            });
        }
    }

    return res.json({ message: 'Identity metadata securely updated.' });
  } catch (error) {
    console.error(`Error updating metadata for ${targetUid}:`, error);
    return res.status(500).json({ error: 'Failed to update user identity metadata.' });
  }
});

// --- API: Role Management ---

// POST /roles/assign - Assign a granular role to a specific user (Business Owner / Super Admin only)
app.post('/roles/assign', authenticate, async (req: Request, res: Response): Promise<Response> => {
  try {
    const { targetUid, role, roles, tenantId } = req.body;
    const assigner = (req as any).user;

    // Security Check: Only Super Admins, or Business Owners within their own Tenant, can assign roles.
    const isSuperAdmin = assigner.role === 'super_admin';
    const isOwnerOfTenant = assigner.role === 'business_owner' && assigner.tenantId === tenantId;

    if (!isSuperAdmin && !isOwnerOfTenant) {
      return res.status(403).json({ error: 'Forbidden. You cannot assign roles in this tenant.' });
    }

    const arrayRoles = roles && Array.isArray(roles) && roles.length > 0 ? roles : (role ? [role] : ['staff']);
    const primaryRole = arrayRoles[0];

    // Assign Firebase Custom Claims
    await admin.auth().setCustomUserClaims(targetUid, { role: primaryRole, roles: arrayRoles, tenantId });

    // Force token refresh on clientside after this is called
    return res.json({ message: `Successfully assigned roles to user ${targetUid} on tenant ${tenantId}` });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to assign role claims' });
  }
});

// --- API: Global Users Directory ---

// GET /users - List all users in the entire ecosystem across all tenants (Super Admin Only)
app.get('/users', authenticate, superAdminOnly, async (req: Request, res: Response): Promise<Response> => {
  try {
    // Note: admin.auth().listUsers(1000) retrieves up to 1000 users. 
    // In massive production environments, this would need pagination tokens.
    const listUsersResult = await admin.auth().listUsers(1000);

    // Map raw Google Auth users to a safe schema including Custom Claims
    const users = listUsersResult.users.map((userRecord) => {
      const claims = userRecord.customClaims || {};
      return {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL || null,
        lastSignInTime: userRecord.metadata.lastSignInTime,
        creationTime: userRecord.metadata.creationTime,
        role: claims.role || 'standard',
        tenantId: claims.tenantId || 'unassigned'
      };
    });

    // Sort by creation time descending
    users.sort((a, b) => new Date(b.creationTime).getTime() - new Date(a.creationTime).getTime());

    // Defensively enforce absolute uniqueness by email to prevent Firebase Identity Provider duplication glitches
    const uniqueUsers = Array.from(new Map(users.map(item => [item.email?.toLowerCase(), item])).values());

    return res.json(uniqueUsers);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch global users directory' });
  }
});

// --- Health Check ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- API Version ---
app.get('/version', (req, res) => {
  res.json({ 
    version: '1.2.0', 
    timestamp: new Date().toISOString(),
    env: process.env.FUNCTIONS_EMULATOR ? 'local' : 'production'
  });
});

// --- CompanyCam Integration ---
app.use('/companycam', companyCamRoutes);

// --- Universal QR Asset Resolution Routing ---
app.use('/scan', scanRoutes);

// --- Physical Asset Routing ---
app.use('/units', unitRoutes);
app.use('/inventory', inventoryRoutes);

// --- QuickBooks Integration ---
app.use('/qbo', qboRoutes);

// --- Assigned Tasks ---
app.use('/tasks', tasksRoutes);

// --- Customers ---
app.use('/customers', customersRoutes);

// --- Vehicles & Jobs & Areas ---
app.use('/vehicles', vehiclesRoutes);
app.use('/jobs', jobsRoutes);
app.use('/areas', areasRoutes);

// Export the Express API as a Cloud Function
export const api = functions.https.onRequest(app);
