import { Router, Request, Response, NextFunction } from 'express';
import { CompanyCamService } from '../services/companyCam.service';
import { validateCompanyCamWebhook } from '../middleware/companyCamWebhook';

export const companyCamRoutes = Router();

// Middleware to ensure we are acting on behalf of a specific tenant
const requireTenant = (req: Request, res: Response, next: NextFunction): Response | void => {
  const tenantId = req.headers['x-tenant-id'] as string || req.query.tenantId as string;
  if (!tenantId) {
    return res.status(400).json({ error: 'Missing x-tenant-id header or tenantId query parameter.' });
  }
  (req as any).tenantId = tenantId;
  next();
};

companyCamRoutes.get('/projects', requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const service = new CompanyCamService(tenantId);
    
    const projects = await service.getProjects();
    res.json(projects);
  } catch (err: any) {
    console.error(`CompanyCam projects error for tenant:`, err);
    res.status(500).json({ error: err.message });
  }
});

// For webhooks, we attach `?tenantId=XYZ` to the webhook callback URL configured in CompanyCam
// so the webhook router knows which business it affects.
companyCamRoutes.post('/webhook', validateCompanyCamWebhook, requireTenant, (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const { event_type, payload } = req.body;
  
  console.log(`Received CompanyCam webhook for tenant ${tenantId}: ${event_type}`, payload?.id);
  
  // Respond with exactly 200 HTTP code so CompanyCam knows it succeeded
  res.status(200).send('Webhook received successfully');
});
