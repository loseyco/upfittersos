import * as admin from 'firebase-admin';
import { Request, Response, NextFunction } from 'express';

// --- Middleware: Core Authentication ---
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized');
  }
  const idToken = req.headers.authorization.split('Bearer ')[1];
  try {
    const decodedIdToken = await admin.auth().verifyIdToken(idToken);
    (req as any).user = decodedIdToken;
    return next();
  } catch (error) {
    return res.status(401).send('Unauthorized');
  }
};

// --- Middleware: General RBAC Guard ---
export const requireRole = (allowedRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const user = (req as any).user;
    const userRoles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
    
    // Super Admins always have skeleton-key access across the entire system
    if (userRoles.includes('super_admin')) {
      return next();
    }

    if (!userRoles.some((r: string) => allowedRoles.includes(r))) {
      return res.status(403).json({ 
        error: 'Forbidden. Insufficient role permissions.',
        required: allowedRoles,
        current: userRoles
      });
    }

    return next();
  };
};

// --- Middleware: Super Admin Auth ---
export const superAdminOnly = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const user = (req as any).user;
  const userRoles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
  if (!user || !userRoles.includes('super_admin')) {
    return res.status(403).json({ error: 'Forbidden. Super Admin access required.' });
  }
  return next();
};
