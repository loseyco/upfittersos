import * as admin from 'firebase-admin';

export class CompanyCamService {
  private baseUrl = 'https://api.companycam.com/v2';

  constructor(private tenantId: string) {
    if (!tenantId) {
      throw new Error('CompanyCamService requires a valid tenantId.');
    }
  }

  // Dynamically fetch the tenant's CompanyCam API token from Firestore
  private async getTenantToken(): Promise<string> {
    const doc = await admin.firestore().collection('businesses').doc(this.tenantId).get();
    
    if (!doc.exists) {
      throw new Error(`Business tenant ${this.tenantId} not found.`);
    }

    const data = doc.data();
    if (!data?.companyCamToken) {
      throw new Error(`CompanyCam is not configured for tenant ${this.tenantId}.`);
    }

    return data.companyCamToken;
  }

  private async fetch(endpoint: string, options?: RequestInit) {
    const token = await this.getTenantToken();
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`CompanyCam API error: ${response.statusText}`);
    }

    return response.json();
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
