import * as admin from 'firebase-admin';

export class CompanyCamService {
  private baseUrl = 'https://api.companycam.com/v2';

  constructor(private tenantId: string) {
    if (!tenantId) {
      throw new Error('CompanyCamService requires a valid tenantId.');
    }
  }

  // Dynamically fetch the tenant's CompanyCam API tokens from Firestore
  private async getTenantTokens(): Promise<{ access: string, refresh: string }> {
    const doc = await admin.firestore().collection('businesses').doc(this.tenantId).get();
    
    if (!doc.exists) {
      throw new Error(`Business tenant ${this.tenantId} not found.`);
    }

    const data = doc.data();
    if (!data?.companyCamToken) {
      throw new Error(`CompanyCam is not configured for tenant ${this.tenantId}.`);
    }

    return {
        access: data.companyCamToken,
        refresh: data.companyCamRefreshToken || '' // Might not exist for legacy static tokens
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
    
    // Save new tokens
    await admin.firestore().collection('businesses').doc(this.tenantId).update({
        companyCamToken: data.access_token,
        companyCamRefreshToken: data.refresh_token
    });

    return data.access_token;
  }

  private async fetch(endpoint: string, options?: RequestInit, isRetry = false): Promise<any> {
    const tokens = await this.getTenantTokens();
    
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
  
  static async exchangeCodeForToken(tenantId: string, code: string, redirectUri: string) {
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

    // Save tokens securely in Firestore
    await admin.firestore().collection('businesses').doc(tenantId).update({
        companyCamToken: data.access_token,
        companyCamRefreshToken: data.refresh_token
    });

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
