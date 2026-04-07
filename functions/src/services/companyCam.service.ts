import * as admin from 'firebase-admin';

export class CompanyCamService {
  private baseUrl = 'https://api.companycam.com/v2';

  constructor(private userId: string, private tenantId: string) {
    if (!userId || !tenantId) {
      throw new Error('CompanyCamService requires both a valid userId and a valid tenantId.');
    }
  }

  // Dynamically fetch the individual user's CompanyCam API tokens for the specific workspace from Firestore
  private async getUserTokens(): Promise<{ access: string, refresh: string }> {
    const doc = await admin.firestore().collection('users').doc(this.userId).get();
    
    if (!doc.exists) {
      throw new Error(`User ${this.userId} not found.`);
    }

    const data = doc.data();
    const tenantAuth = data?.companyCamAuth?.[this.tenantId];
    if (!tenantAuth?.token) {
      throw new Error(`CompanyCam is not configured for user ${this.userId} in this workspace.`);
    }

    return {
        access: tenantAuth.token,
        refresh: tenantAuth.refresh || '' 
    };
  }

  // Refreshes the token and saves the new ones to Firestore
  private async refreshToken(refreshToken: string) {
    if (!refreshToken) throw new Error("No refresh token available");
    
    const clientId = process.env.COMPANYCAM_CLIENT_ID || 'PLACEHOLDER_CLIENT_ID';
    const clientSecret = process.env.COMPANYCAM_CLIENT_SECRET || 'PLACEHOLDER_SECRET';

    const response = await fetch('https://app.companycam.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        })
    });

    if (!response.ok) {
        throw new Error(`Failed to refresh token: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Save new tokens securely to the user's profile mapped to this specific tenant
    await admin.firestore().collection('users').doc(this.userId).set({
        companyCamAuth: {
            [this.tenantId]: {
                token: data.access_token,
                refresh: data.refresh_token
            }
        }
    }, { merge: true });

    return data.access_token;
  }

  private async fetch(endpoint: string, options?: RequestInit, isRetry = false): Promise<any> {
    const tokens = await this.getUserTokens();
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${tokens.access}`,
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });

    // If unauthorized, and we have a refresh token, and this is the first attempt: retry
    if (response.status === 401 && tokens.refresh && !isRetry) {
        try {
            await this.refreshToken(tokens.refresh);
            return this.fetch(endpoint, options, true); // Retry
        } catch (e) {
            console.error("Token refresh failed", e);
            throw new Error(`CompanyCam API authorization failed and could not be refreshed.`);
        }
    }

    if (!response.ok) {
      throw new Error(`CompanyCam API error: ${response.statusText}`);
    }

    return response.json();
  }

  // --- OAUTH HELPERS ---
  
  static async exchangeCodeForToken(userId: string, tenantId: string, code: string, redirectUri: string) {
    const clientId = process.env.COMPANYCAM_CLIENT_ID || 'PLACEHOLDER_CLIENT_ID';
    const clientSecret = process.env.COMPANYCAM_CLIENT_SECRET || 'PLACEHOLDER_SECRET';

    const response = await fetch('https://app.companycam.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri
        })
    });

    if (!response.ok) {
        const errObj = await response.json().catch(() => ({}));
        throw new Error(`Failed to exchange code: ${errObj.error_description || response.statusText}`);
    }

    const data = await response.json();

    // Save tokens securely in Firestore user document isolated by tenant
    await admin.firestore().collection('users').doc(userId).set({
        companyCamAuth: {
            [tenantId]: {
                token: data.access_token,
                refresh: data.refresh_token
            }
        }
    }, { merge: true });

    return { success: true };
  }

  // API Wrappers
  async getProjects() {
    return this.fetch('/projects');
  }

  async createProject(payload: any) {
    return this.fetch('/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}
