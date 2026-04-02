import { auth } from './firebase';

const baseURL = import.meta.env.VITE_API_URL || 'https://us-central1-saegroup-c6487.cloudfunctions.net/api';

class ApiClient {
    private async request(method: string, endpoint: string, data?: any) {
        // Strip out the leading slash if baseURL already has one or doesn't need to double up
        const divider = endpoint.startsWith('/') ? '' : '/';
        const url = `${baseURL}${divider}${endpoint}`;
        
        const headers: any = {
            'Content-Type': 'application/json'
        };

        const user = auth.currentUser;
        if (user) {
            try {
                const token = await user.getIdToken();
                headers.Authorization = `Bearer ${token}`;
            } catch (err) {
                console.error("Error attaching auth token to request", err);
            }
        }

        const options: RequestInit = {
            method,
            headers,
            cache: 'no-store'
        };

        if (data && method !== 'GET' && method !== 'HEAD') {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        let responseData = null;

        // Try to parse JSON strictly safely 
        if (response.headers.get("content-type")?.includes("application/json")) {
            responseData = await response.json();
        }

        if (!response.ok) {
            if (response.status === 401) {
                console.error('API Unauthorized: Invalid or missing token');
            } else if (response.status === 403) {
                console.error('API Forbidden: Insufficient permissions');
            }
            // Match Axios error projection schema exactly for downstream handlers
            throw { response: { status: response.status, data: responseData } };
        }

        return { data: responseData, status: response.status, headers: response.headers };
    }

    get(endpoint: string) { return this.request('GET', endpoint); }
    post(endpoint: string, data?: any) { return this.request('POST', endpoint, data); }
    put(endpoint: string, data?: any) { return this.request('PUT', endpoint, data); }
    delete(endpoint: string) { return this.request('DELETE', endpoint); }
}

export const api = new ApiClient();
