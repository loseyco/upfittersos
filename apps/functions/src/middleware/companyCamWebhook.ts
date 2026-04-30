import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export const validateCompanyCamWebhook = (req: Request, res: Response, next: NextFunction): void => {
  const signature = req.headers['x-companycam-signature'] as string;
  
  if (!signature) {
    res.status(401).json({ error: 'Missing X-CompanyCam-Signature header' });
    return;
  }

  const webhookSecret = process.env.COMPANYCAM_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('COMPANYCAM_WEBHOOK_SECRET is not configured');
    res.status(500).json({ error: 'Internal Server Error' });
    return;
  }

  // Firebase Functions populate req.rawBody automatically, which is perfect for exact hashing.
  const rawBody = (req as any).rawBody;
  
  if (!rawBody) {
    res.status(400).json({ error: 'Raw body required for signature validation' });
    return;
  }

  try {
    const hash = crypto.createHmac('sha1', webhookSecret)
                       .update(rawBody)
                       .digest('base64');

    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    next();
  } catch (error) {
    console.error('Error during webhook signature validation:', error);
    res.status(500).json({ error: 'Signature validation failed' });
  }
};
