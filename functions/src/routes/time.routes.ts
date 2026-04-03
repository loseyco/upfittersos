import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { authenticate } from '../middleware/auth.middleware';

export const timeRoutes = Router({ mergeParams: true });
const getDb = () => admin.firestore();

// Helper to check basic tenant access
const isMemberOfTenant = (caller: any, tenantId: string) => {
    const isSuperAdmin = caller.role === 'super_admin';
    const isTenantMember = caller.tenantId === tenantId;
    return isSuperAdmin || isTenantMember;
};

// GET /businesses/:id/time_logs - Support filtering by userId and status
timeRoutes.get('/:id/time_logs', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const caller = (req as any).user;
        const tenantId = req.params.id;
        
        if (!isMemberOfTenant(caller, tenantId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { userId, status } = req.query;
        
        // Build base query
        let query: any = getDb().collection('businesses').doc(tenantId).collection('time_logs');
        
        if (userId) {
            query = query.where('userId', '==', userId as string);
        }
        if (status) {
            query = query.where('status', '==', status as string);
        }
        
        const snapshot = await query.get();
        const logs = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        
        // Sort descending by clock-in time natively in logic to avoid need for firestore index for this quick feature
        logs.sort((a: any, b: any) => {
            const timeA = new Date(a.clockIn || 0).getTime();
            const timeB = new Date(b.clockIn || 0).getTime();
            return timeB - timeA;
        });

        return res.json(logs);
    } catch (error) {
        console.error("Error fetching time logs:", error);
        return res.status(500).json({ error: 'Failed to fetch time logs' });
    }
});

// POST /businesses/:id/time_logs
timeRoutes.post('/:id/time_logs', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const caller = (req as any).user;
        const tenantId = req.params.id;
        if (!isMemberOfTenant(caller, tenantId)) return res.status(403).json({ error: 'Forbidden' });

        const data = req.body;
        const ref = await getDb().collection('businesses').doc(tenantId).collection('time_logs').add(data);
        return res.status(201).json({ id: ref.id, ...data });
    } catch (error) {
        console.error("Error creating time log:", error);
        return res.status(500).json({ error: 'Failed to create time log' });
    }
});

// PUT /businesses/:id/time_logs/:logId
timeRoutes.put('/:id/time_logs/:logId', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const caller = (req as any).user;
        const tenantId = req.params.id;
        if (!isMemberOfTenant(caller, tenantId)) return res.status(403).json({ error: 'Forbidden' });

        const logId = req.params.logId;
        await getDb().collection('businesses').doc(tenantId).collection('time_logs').doc(logId).update(req.body);
        return res.json({ success: true });
    } catch (error) {
        console.error("Error updating time log:", error);
        return res.status(500).json({ error: 'Failed to update time log' });
    }
});

// GET /businesses/:id/time_off_requests
timeRoutes.get('/:id/time_off_requests', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const caller = (req as any).user;
        const tenantId = req.params.id;
        if (!isMemberOfTenant(caller, tenantId)) return res.status(403).json({ error: 'Forbidden' });

        const { userId } = req.query;
        let query: any = getDb().collection('businesses').doc(tenantId).collection('time_off_requests');
        
        if (userId) query = query.where('userId', '==', userId as string);
        
        const snapshot = await query.get();
        const requests = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        
        // Sort descending by creation timestamp native array map
        requests.sort((a: any, b: any) => {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
        });

        return res.json(requests);
    } catch (error) {
        console.error("Error fetching time off requests:", error);
        return res.status(500).json({ error: 'Failed to fetch time off requests' });
    }
});

// POST /businesses/:id/time_off_requests
timeRoutes.post('/:id/time_off_requests', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const caller = (req as any).user;
        const tenantId = req.params.id;
        if (!isMemberOfTenant(caller, tenantId)) return res.status(403).json({ error: 'Forbidden' });

        const data = req.body;
        const ref = await getDb().collection('businesses').doc(tenantId).collection('time_off_requests').add(data);
        return res.status(201).json({ id: ref.id, ...data });
    } catch (error) {
        console.error("Error creating time off request:", error);
        return res.status(500).json({ error: 'Failed to create time off request' });
    }
});

// PUT /businesses/:id/time_off_requests/:requestId
timeRoutes.put('/:id/time_off_requests/:requestId', authenticate, async (req: Request, res: Response): Promise<any> => {
    try {
        const caller = (req as any).user;
        const tenantId = req.params.id;
        if (!isMemberOfTenant(caller, tenantId)) return res.status(403).json({ error: 'Forbidden' });

        const requestId = req.params.requestId;
        await getDb().collection('businesses').doc(tenantId).collection('time_off_requests').doc(requestId).update(req.body);
        return res.json({ success: true });
    } catch (error) {
        console.error("Error updating time off request:", error);
        return res.status(500).json({ error: 'Failed to update time off request' });
    }
});
