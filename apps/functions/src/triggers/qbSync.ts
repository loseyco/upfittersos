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

    // 1. Vehicle Extraction Logic (Run first so we can link it to the job)
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
            vin: (cf['VIN num'] || '').trim().toUpperCase(),
            make: (cf['Vehicle Make'] || '').trim(),
            model: (cf['Vehicle Model'] || '').trim(),
            year: (cf['Vehicle Year'] || '').trim()
          };
        }
      } catch (e) {
        console.error(`Failed to parse qbCustomFields JSON for job ${jobId}`, e);
      }
    }

    const vin = vData?.vin || null;
    const qbJobNumber = data.JobNumber || (data.Name && /^\d+$/.test(data.Name) ? data.Name : null);
    
    // Extract customer name from FullName (format: "Customer:JobName" or "Parent:Customer:Job")
    let qbCustomerName = null;
    if (data.FullName && data.FullName.includes(':')) {
      const parts = data.FullName.split(':');
      qbCustomerName = parts[0]; // Take the top-level customer
    } else if (data.CompanyName) {
      qbCustomerName = data.CompanyName;
    }

    // 2. Promote to Job Collection (V2 Schema)
    const jobMappedData: any = {
      title: data.Name || data.FullName || 'Untitled Job',
      jobNumber: qbJobNumber || null,
      customerName: qbCustomerName || data.CompanyName || null,
      customerId: data.parentRefId || '', 
      status: data.IsActive === 'true' ? 'Active' : 'Inactive',
      quickbooksId: data.ListID || data.qb_ListID || '',
      source: 'QuickBooks',
      tags: admin.firestore.FieldValue.arrayUnion('QuickBooks'),
      notes: 'Imported via QBWC.',
      vehicleId: vin, // Store the link!
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    let jobDestRef = admin.firestore().collection('businesses').doc(tenantId).collection('jobs').doc(jobId);

    // If we have a job number, try to find an existing native job to merge with
    if (qbJobNumber) {
      try {
        const existingQuery = await admin.firestore().collection('businesses').doc(tenantId).collection('jobs')
          .where('jobNumber', '==', String(qbJobNumber))
          .limit(1)
          .get();
        
        if (!existingQuery.empty) {
          // If we find an existing job by number, we use its ref instead of creating a new ListID-based one
          jobDestRef = existingQuery.docs[0].ref;
          console.log(`Merging QB Job ${jobId} into existing job ${jobDestRef.id} via job number ${qbJobNumber}`);
        }
      } catch (err) {
        console.error(`Failed to check for existing job with number ${qbJobNumber}`, err);
      }
    }
    
    try {
      await jobDestRef.set(jobMappedData, { merge: true });
      console.log(`Successfully promoted QB Job ${jobId} to native jobs in tenant ${tenantId}`);
    } catch (err) {
      console.error(`Failed to promote job ${jobId}`, err);
    }

    // 3. Upsert Vehicle Record
    if (vData && (vData.vin || vData.make)) {
      const vehicleVin = vin || `UNKN-${jobId.substring(0, 8)}`;
      if (!vehicleVin) return null;

      const vehicleRef = admin.firestore().collection('businesses').doc(tenantId).collection('vehicles').doc(vehicleVin);
      
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
        console.log(`Successfully extracted and upserted vehicle ${vehicleVin} for job ${jobId} in tenant ${tenantId}`);
      } catch (err) {
        console.error(`Failed to upsert vehicle ${vehicleVin}`, err);
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
    let staffRef = admin.firestore().collection('businesses').doc(tenantId).collection('staff').doc(employeeId);
    
    // Resolve email if missing (already defined below, but we need it for searching)
    let resolvedEmail = data.email || data.Email || '';
    const firstName = data.firstName || data.FirstName || '';
    const lastName = data.lastName || data.LastName || '';
    const fullName = (data.name || data.Name || `${firstName} ${lastName}`).trim();

    if (!resolvedEmail && fullName) {
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

    // SEARCH FOR EXISTING STAFF TO PREVENT DUPLICATES
    if (resolvedEmail) {
      const existingQuery = await admin.firestore().collection('businesses').doc(tenantId).collection('staff')
        .where('email', '==', resolvedEmail.toLowerCase())
        .limit(1)
        .get();
      
      if (!existingQuery.empty) {
        staffRef = existingQuery.docs[0].ref;
        console.log(`Found existing staff member by email: ${resolvedEmail}. Merging into doc ${staffRef.id}`);
      }
    }

    if (staffRef.id === employeeId && firstName && lastName) {
      // If still using QB ID, try one more search by case-insensitive name
      const allStaffSnap = await admin.firestore().collection('businesses').doc(tenantId).collection('staff').get();
      const existingNameMatch = allStaffSnap.docs.find(doc => {
        const d = doc.data();
        return d.firstName && d.lastName && 
               d.firstName.toLowerCase() === firstName.toLowerCase() && 
               d.lastName.toLowerCase() === lastName.toLowerCase();
      });
      
      if (existingNameMatch) {
        staffRef = existingNameMatch.ref;
        console.log(`Found existing staff member by name: ${firstName} ${lastName}. Merging into doc ${staffRef.id}`);
      }
    }

    const isQbActive = data.isActive === true || data.isActive === 'true' || data.IsActive === 'true' || data.IsActive === true;

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
      isArchived: !isQbActive,
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

/**
 * Helper to parse QB duration
 */
function parseQBDuration(dur: string): number {
  if (!dur) return 0;
  let hours = 0, minutes = 0, seconds = 0;
  const hMatch = dur.match(/(\d+)H/);
  const mMatch = dur.match(/(\d+)M/);
  const sMatch = dur.match(/(\d+)S/);
  if (hMatch) hours = parseInt(hMatch[1], 10);
  if (mMatch) minutes = parseInt(mMatch[1], 10);
  if (sMatch) seconds = parseInt(sMatch[1], 10);
  
  if (dur.includes(':')) {
     const parts = dur.split(':');
     hours = parseInt(parts[0], 10) || 0;
     minutes = parseInt(parts[1], 10) || 0;
     seconds = parseInt(parts[2], 10) || 0;
  }
  return (hours * 3600000) + (minutes * 60000) + (seconds * 1000);
}

/**
 * Trigger: When a document in qb_time_tracking is created or updated.
 * Goal: Promote to native 'time_sessions' collection.
 */
export const onQbTimeTrackingWrite = functions.firestore
  .document('businesses/{tenantId}/qb_time_tracking/{timeId}')
  .onWrite(async (change, context) => {
    const { tenantId, timeId } = context.params;
    
    if (!change.after.exists) {
      // If deleted in QB, delete the corresponding native session to keep it clean.
      try {
        await admin.firestore().collection('businesses').doc(tenantId).collection('time_sessions').doc('qb_time_' + timeId).delete();
      } catch (e) {}
      return null;
    }

    const data = change.after.data();
    if (!data || !data.duration || !data.txnDate) return null;

    const durationMs = parseQBDuration(data.duration);
    if (durationMs === 0) return null;

    // 1. Resolve User (Technician) Schedule
    let startTimeStr = '08:00'; // Default fallback
    let uName = data.entityName || 'Unknown QB Staff';
    let resolvedUserId = data.entityRef || uName;

    try {
      // Try to find native staff member by name or ListID
      const staffRef = admin.firestore().collection('businesses').doc(tenantId).collection('staff');
      let staffSnap = await staffRef.where('quickbooksId', '==', data.entityRef).limit(1).get();
      
      if (staffSnap.empty && data.entityName) {
         // Fallback to name search
         const nameParts = data.entityName.split(' ');
         if (nameParts.length >= 2) {
           staffSnap = await staffRef
            .where('firstName', '==', nameParts[0])
            .where('lastName', '==', nameParts.slice(1).join(' '))
            .limit(1).get();
         }
      }

      if (!staffSnap.empty) {
        const staffData = staffSnap.docs[0].data();
        resolvedUserId = staffSnap.docs[0].id;
        uName = (staffData.firstName + ' ' + staffData.lastName).trim();

        // Resolve Schedule
        if (staffData.individualSchedule?.startTime) {
          startTimeStr = staffData.individualSchedule.startTime;
        } else if (staffData.departmentId) {
          const deptSnap = await admin.firestore().collection('businesses').doc(tenantId).collection('departments').doc(staffData.departmentId).get();
          if (deptSnap.exists) {
            const deptData = deptSnap.data();
            if (deptData?.defaultSchedule?.startTime) {
              startTimeStr = deptData.defaultSchedule.startTime;
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to resolve staff schedule for ' + uName, e);
    }

    // 2. Resolve Job (CustomerRef)
    let jId = data.customerRef || data.customerName || 'qb_general';
    let jTitle = data.customerName || 'QB Job';

    try {
      // Find native job
      const jobsSnap = await admin.firestore().collection('businesses').doc(tenantId).collection('jobs')
        .where('quickbooksId', '==', data.customerRef)
        .limit(1).get();
      
      if (!jobsSnap.empty) {
        jId = jobsSnap.docs[0].id;
        jTitle = jobsSnap.docs[0].data().title || jTitle;
      } else {
        // Try finding by name
        const jobsNameSnap = await admin.firestore().collection('businesses').doc(tenantId).collection('jobs')
          .where('title', '==', jTitle)
          .limit(1).get();
        if (!jobsNameSnap.empty) {
          jId = jobsNameSnap.docs[0].id;
        }
      }
    } catch (e) {
      console.error('Failed to resolve job for ' + jTitle, e);
    }

    // 3. Construct Simulated Timestamps
    const [startHourStr, startMinStr] = startTimeStr.split(':');
    const startHour = parseInt(startHourStr, 10);
    const startMin = parseInt(startMinStr, 10);
    
    // Parse YYYY-MM-DD
    const [yearStr, monthStr, dayStr] = data.txnDate.split('-');
    
    const clockInTime = new Date(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr));
    clockInTime.setHours(startHour || 8, startMin || 0, 0, 0);
    
    const clockOutTime = new Date(clockInTime.getTime() + durationMs);

    // 4. Upsert Time Session
    const sessionPayload = {
      userId: resolvedUserId,
      userName: uName,
      clockIn: { timestamp: admin.firestore.Timestamp.fromDate(clockInTime), location: 'QuickBooks Import' },
      clockOut: { timestamp: admin.firestore.Timestamp.fromDate(clockOutTime), location: 'QuickBooks Import' },
      jobs: [
        {
          id: jId,
          name: jTitle,
          taskId: data.itemServiceRef || null,
          taskName: data.itemServiceName || null,
          start: admin.firestore.Timestamp.fromDate(clockInTime),
          end: admin.firestore.Timestamp.fromDate(clockOutTime)
        }
      ],
      jobIds: [jId],
      source: 'QuickBooks',
      notes: 'Imported via QBWC.',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    try {
      await admin.firestore()
        .collection('businesses')
        .doc(tenantId)
        .collection('time_sessions')
        .doc('qb_time_' + timeId)
        .set(sessionPayload, { merge: true });
        
      console.log('Successfully mapped QB time ' + timeId + ' to native session for ' + uName);
    } catch (e) {
      console.error('Failed to map QB time ' + timeId, e);
    }

    return null;
  });
