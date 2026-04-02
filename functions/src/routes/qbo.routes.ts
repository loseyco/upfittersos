import { Router, Request, Response } from 'express';
import { QboService } from '../services/qbo.service';
import { authenticate } from '../middleware/auth.middleware';

export const qboRoutes = Router();

// Helper to extract the tenant from the request headers or query
const getTenantId = (req: Request) => req.headers['x-tenant-id'] as string || req.query.tenantId as string;

// 1. Kick-off OAuth Flow (Redirects user to Intuit)
qboRoutes.get('/auth', authenticate, (req: Request, res: Response) => {
  const caller = (req as any).user;
  const tenantId = caller.role === 'super_admin' ? getTenantId(req) : caller.tenantId;

  if (!tenantId) {
    res.status(400).json({ error: 'Missing tenantId or you are not bound to a workspace.' });
    return;
  }

  const service = new QboService(tenantId);
  res.redirect(service.getAuthorizationUrl());
});

// 2. OAuth Callback (Intuit redirects here after user signs in - must remain unauthenticated as it's hit by Intuit directly)
qboRoutes.get('/callback', async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string;
    const realmId = req.query.realmId as string; // The QuickBooks Company ID
    const state = req.query.state as string;     // The custom state we passed in step 1

    if (!code || !realmId || !state) {
      res.status(400).send('Missing required Intuit OAuth parameters.');
      return;
    }

    // Decode state to figure out which tenant is completing the auth flow
    const { tenantId } = JSON.parse(decodeURIComponent(state));
    const service = new QboService(tenantId);
    
    await service.exchangeCodeForToken(code, realmId);
    res.send('<html><body><h2>QuickBooks successfully connected!</h2><p>You can close this window and return to the SAE Group Upfitter OS.</p></body></html>');
  } catch (err: any) {
    console.error('QBO OAuth Error:', err);
    res.status(500).send(`<html><body><h2>Error connecting QuickBooks</h2><p>${err.message}</p></body></html>`);
  }
});

// 3. Example Endpoint: Fetch Accounts
qboRoutes.get('/accounts', authenticate, async (req: Request, res: Response) => {
  try {
    // With authentication in place, we extract the tenantId securely from their verified JWT token, ensuring they NEVER fetch another tenant's data.
    const caller = (req as any).user;
    const tenantId = caller.role === 'super_admin' ? getTenantId(req) : caller.tenantId;
    
    if (!tenantId) {
      res.status(400).json({ error: 'Missing tenantId parameter or header.' });
      return;
    }

    const service = new QboService(tenantId);
    const accounts = await service.getAccounts();
    res.json(accounts);
  } catch (err: any) {
    console.error(`QBO accounts error for tenant:`, err);
    res.status(500).json({ error: err.message });
  }
});


