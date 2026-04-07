import { Router, Request, Response, NextFunction } from 'express';
import { CompanyCamService } from '../services/companyCam.service';
import { validateCompanyCamWebhook } from '../middleware/companyCamWebhook';
import { authenticate } from '../middleware/auth.middleware';

export const companyCamRoutes = Router();

// Middleware to ensure we are acting on behalf of a specific tenant
const requireTenant = (req: Request, res: Response, next: NextFunction) => {
  const tenantId = req.headers['x-tenant-id'] as string || req.query.tenantId as string;
  if (!tenantId) {
    res.status(400).json({ error: 'Missing x-tenant-id header or tenantId query parameter.' });
    return;
  }
  (req as any).tenantId = tenantId;
  next();
};

// --- OAUTH FLOW ENDPOINTS ---

companyCamRoutes.get('/oauth/url', authenticate, (req: Request, res: Response) => {
    const caller = (req as any).user;
    
    // We strictly identify the user based on token. We don't need tenant validation for the OAuth URL itself.
    if (!caller || !caller.uid) {
        res.status(401).json({ error: 'Unauthenticated.' });
        return;
    }

    const clientId = process.env.COMPANYCAM_CLIENT_ID || 'PLACEHOLDER_CLIENT_ID';
    // We will pass the redirectUri from the frontend since it knows its own domain (prod vs localhost)
    const redirectUri = req.query.redirectUri as string; 
    
    if (!redirectUri) {
        res.status(400).json({ error: 'redirectUri query parameter is required.' });
        return;
    }

    const scopes = 'read+write'; // We can add 'destroy' if needed, generally read+write is safest
    const authUrl = `https://app.companycam.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scopes}`;
    
    res.json({ url: authUrl });
});

companyCamRoutes.post('/oauth/exchange', authenticate, async (req: Request, res: Response) => {
    try {
        const caller = (req as any).user;
        const userId = caller.uid;

        if (!userId) {
            res.status(401).json({ error: 'User mapping failed or unauthorized.' });
            return;
        }

        const { code, redirectUri, tenantId } = req.body;
        
        if (!code || !redirectUri || !tenantId) {
            res.status(400).json({ error: 'code, redirectUri, and tenantId are required in body.' });
            return;
        }

        await CompanyCamService.exchangeCodeForToken(userId, tenantId, code, redirectUri);
        res.json({ success: true });
    } catch (err: any) {
        console.error(`CompanyCam OAuth Exchange error:`, err);
        res.status(500).json({ error: err.message });
    }
});

// --- EXISTING ENDPOINTS ---


companyCamRoutes.get('/projects', authenticate, async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const userId = caller.uid;
    const tenantId = req.query.tenantId as string || caller.tenantId;

    if (!userId || !tenantId) {
        res.status(401).json({ error: 'Missing userId or tenantId.' });
        return;
    }

    const service = new CompanyCamService(userId, tenantId);
    
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
