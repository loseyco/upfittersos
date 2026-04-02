import * as admin from 'firebase-admin';

export class QboService {
  private clientId = process.env.QBO_CLIENT_ID || '';
  private clientSecret = process.env.QBO_CLIENT_SECRET || '';
  private redirectUri = process.env.QBO_REDIRECT_URI || 'http://localhost:5001/saegroup-c6487/us-central1/api/qbo/callback';
  private environment = process.env.QBO_ENVIRONMENT || 'sandbox';

  private get baseUrl() {
    return this.environment === 'sandbox' 
      ? 'https://sandbox-quickbooks.api.intuit.com/v3/company' 
      : 'https://quickbooks.api.intuit.com/v3/company';
  }

  constructor(private tenantId: string) {
    if (!tenantId) {
      throw new Error('QboService requires a valid tenantId.');
    }
  }

  // 1. Generate OAuth URL
  getAuthorizationUrl(): string {
    const authEndpoint = 'https://appcenter.intuit.com/connect/oauth2';
    const scope = encodeURIComponent('com.intuit.quickbooks.accounting');
    
    // We pass tenantId in the state parameter to know which business is connecting when Intuit redirects back
    const state = encodeURIComponent(JSON.stringify({ tenantId: this.tenantId }));
    
    return `${authEndpoint}?client_id=${this.clientId}&response_type=code&scope=${scope}&redirect_uri=${encodeURIComponent(this.redirectUri)}&state=${state}`;
  }

  // 2. Handle OAuth Callback and Save to Tenant's Database
  async exchangeCodeForToken(code: string, realmId: string): Promise<void> {
    const tokenEndpoint = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
    const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authHeader}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange QBO token: ${errorText}`);
    }

    const tokenData = await response.json();
    
    // Manage multi-tenant tokens inside Firestore
    await admin.firestore().collection('businesses').doc(this.tenantId).set({
      qboRealmId: realmId,
      qboAccessToken: tokenData.access_token,
      qboRefreshToken: tokenData.refresh_token,
      qboTokenExpiresAt: Date.now() + (tokenData.expires_in * 1000),
    }, { merge: true });
  }

  // 3. Retrieve Tenant's Current QBO Tokens internally
  private async getTokens(): Promise<{ realmId: string, accessToken: string }> {
    const doc = await admin.firestore().collection('businesses').doc(this.tenantId).get();
    
    if (!doc.exists) {
      throw new Error(`Business tenant ${this.tenantId} not found.`);
    }

    const data = doc.data();
    if (!data?.qboAccessToken || !data?.qboRealmId) {
      throw new Error(`QuickBooks is not connected for tenant ${this.tenantId}.`);
    }

    // TODO: Evaluate if Date.now() > qboTokenExpiresAt, and trigger refresh_token logic here.

    return { realmId: data.qboRealmId, accessToken: data.qboAccessToken };
  }

  // 4. API Wrappers: Chart of Accounts Entities (as requested by user)
  async getAccounts(): Promise<any> {
    const { realmId, accessToken } = await this.getTokens();
    
    // Querying all accounts using QBO's SQL-like Syntax over REST
    const query = encodeURIComponent('select * from Account maxresults 1000');
    
    const response = await fetch(`${this.baseUrl}/${realmId}/query?query=${query}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`QBO API error: ${response.statusText}`);
    }

    return response.json();
  }
}
