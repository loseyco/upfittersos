import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Trigger: When a document in qb_customers is created or updated.
 * Goal: Promote to the clean 'customers' collection.
 */
export const onQbCustomerWrite = functions.firestore
  .document('businesses/{tenantId}/qb_customers/{customerId}')
  .onWrite(async (change, context) => {
    const { tenantId, customerId } = context.params;
    
    // If deleted, we don't necessarily delete the native customer profile
    if (!change.after.exists) return null;

    const data = change.after.data();
    if (!data) return null;

    // Map to V2 Customer Schema
    const mappedData = {
      firstName: data.FirstName || '',
      lastName: data.LastName || '',
      company: data.CompanyName || '',
      email: data.Email || '',
      mobilePhone: data.Phone || '',
      status: data.IsActive === 'true' ? 'Active' : 'Inactive',
      quickbooksId: data.ListID || data.qb_ListID || '',
      source: 'QuickBooks',
      tags: admin.firestore.FieldValue.arrayUnion('QuickBooks'),
      notes: 'Imported via QBWC.',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const destRef = admin.firestore().collection('businesses').doc(tenantId).collection('customers').doc(customerId);
    
    try {
      await destRef.set(mappedData, { merge: true });
      console.log(`Successfully promoted QB Customer ${customerId} to native customers in tenant ${tenantId}`);
    } catch (err) {
      console.error(`Failed to promote customer ${customerId}`, err);
    }
    
    return null;
  });

/**
 * Trigger: When a document in qb_jobs is created or updated.
 * Goal: Promote to 'jobs' AND extract 'vehicles'.
 */
export const onQbJobWrite = functions.firestore
  .document('businesses/{tenantId}/qb_jobs/{jobId}')
  .onWrite(async (change, context) => {
    const { tenantId, jobId } = context.params;
    
    // If deleted, we don't necessarily delete the native job or vehicle
    if (!change.after.exists) return null;

    const data = change.after.data();
    if (!data) return null;

    // 1. Promote to Job Collection (V2 Schema)
    const jobMappedData = {
      title: data.Name || data.FullName || 'Untitled Job',
      customerId: data.parentRefId || '', 
      status: data.IsActive === 'true' ? 'Active' : 'Inactive',
      quickbooksId: data.ListID || data.qb_ListID || '',
      source: 'QuickBooks',
      tags: admin.firestore.FieldValue.arrayUnion('QuickBooks'),
      notes: 'Imported via QBWC.',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const jobDestRef = admin.firestore().collection('businesses').doc(tenantId).collection('jobs').doc(jobId);
    
    try {
      await jobDestRef.set(jobMappedData, { merge: true });
      console.log(`Successfully promoted QB Job ${jobId} to native jobs in tenant ${tenantId}`);
    } catch (err) {
      console.error(`Failed to promote job ${jobId}`, err);
    }

    // 2. Vehicle Extraction Logic
    let vData: any = null;
    if (data.vehicle) {
      try {
        vData = typeof data.vehicle === 'string' ? JSON.parse(data.vehicle) : data.vehicle;
      } catch (e) {
        console.error(`Failed to parse vehicle JSON for job ${jobId}`, e);
      }
    } else if (data.qbCustomFields) {
      try {
        const cf = typeof data.qbCustomFields === 'string' ? JSON.parse(data.qbCustomFields) : data.qbCustomFields;
        if (cf['VIN num'] || cf['Vehicle Make']) {
          vData = {
            vin: cf['VIN num'] || '',
            make: cf['Vehicle Make'] || '',
            model: cf['Vehicle Model'] || '',
            year: cf['Vehicle Year'] || ''
          };
        }
      } catch (e) {
        console.error(`Failed to parse qbCustomFields JSON for job ${jobId}`, e);
      }
    }

    if (vData && (vData.vin || vData.make)) {
      const vin = vData.vin ? vData.vin.trim() : `UNKN-${jobId.substring(0, 8)}`;
      if (!vin) return null;

      const vehicleRef = admin.firestore().collection('businesses').doc(tenantId).collection('vehicles').doc(vin);
      
      const vehiclePayload = {
        vin: vData.vin || '',
        make: vData.make || '',
        model: vData.model || '',
        year: vData.year || '',
        lastSeenJobId: jobId,
        jobTitle: jobMappedData.title,
        customerId: jobMappedData.customerId,
        source: 'QuickBooks',
        tags: admin.firestore.FieldValue.arrayUnion('QuickBooks'),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      try {
        await vehicleRef.set(vehiclePayload, { merge: true });
        console.log(`Successfully extracted and upserted vehicle ${vin} for job ${jobId} in tenant ${tenantId}`);
      } catch (err) {
        console.error(`Failed to upsert vehicle ${vin}`, err);
      }
    }

    return null;
  });

/**
 * Trigger: When a document in qb_employees is created or updated.
 * Goal: Promote to 'staff' collection and resolve emails.
 */
export const onQbEmployeeWrite = functions.firestore
  .document('businesses/{tenantId}/qb_employees/{employeeId}')
  .onWrite(async (change, context) => {
    const { tenantId, employeeId } = context.params;
    
    if (!change.after.exists) return null;

    const data = change.after.data();
    if (!data) return null;

    // 1. Promote to Staff Collection
    const staffRef = admin.firestore().collection('businesses').doc(tenantId).collection('staff').doc(employeeId);
    
    // Resolve email if missing
    let resolvedEmail = data.email || data.Email || '';
    if (!resolvedEmail) {
      const firstName = data.firstName || data.FirstName || '';
      const lastName = data.lastName || data.LastName || '';
      const fullName = (data.name || data.Name || `${firstName} ${lastName}`).trim();

      if (fullName) {
        // Search root users collection for a matching name
        const userQuery = admin.firestore().collection('users')
          .where('displayName', '==', fullName)
          .limit(1);
        const userSnap = await userQuery.get();
        
        if (!userSnap.empty) {
          resolvedEmail = userSnap.docs[0].data().email || '';
          console.log(`Resolved email ${resolvedEmail} for employee ${fullName} via users collection`);
        } else if (firstName && lastName) {
           // Try searching by first/last combo if displayName search failed
           const userQueryAlt = admin.firestore().collection('users')
            .where('firstName', '==', firstName)
            .where('lastName', '==', lastName)
            .limit(1);
           const userSnapAlt = await userQueryAlt.get();
           if (!userSnapAlt.empty) {
             resolvedEmail = userSnapAlt.docs[0].data().email || '';
             console.log(`Resolved email ${resolvedEmail} for employee ${fullName} via firstName/lastName search`);
           }
        }
      }
    }

    const staffMappedData = {
      firstName: data.firstName || data.FirstName || '',
      lastName: data.lastName || data.LastName || '',
      email: resolvedEmail.toLowerCase(),
      phone: data.phone || data.Phone || '',
      role: 'staff', // Default role
      hireDate: data.HiredDate || data.hiredDate || null,
      fireDate: data.ReleasedDate || data.releasedDate || null,
      quickbooksId: data.ListID || data.listId || '',
      source: 'QuickBooks',
      tags: admin.firestore.FieldValue.arrayUnion('QuickBooks'),
      notes: admin.firestore.FieldValue.arrayUnion('Imported via QBWC.'),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    try {
      await staffRef.set(staffMappedData, { merge: true });
      console.log(`Successfully promoted QB Employee ${employeeId} to staff in tenant ${tenantId}`);
    } catch (err) {
      console.error(`Failed to promote employee ${employeeId}`, err);
    }
    
    return null;
  });
