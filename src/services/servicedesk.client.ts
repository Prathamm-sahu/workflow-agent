import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { AppConfig } from '../config';
import {
  ServiceDeskRequestInput,
  ServiceDeskCloseInput,
  ServiceDeskResponse,
} from '../types/servicedesk';

export class ServiceDeskClient {
  private baseUrl: string;
  private apiKey: string;
  private dryRun: boolean;
  private http: AxiosInstance;

  constructor(config: AppConfig) {
    this.baseUrl = config.serviceDesk.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.serviceDesk.apiKey;
    this.dryRun = config.dryRun;

    // Create axios instance with self-signed cert support (equivalent to curl -k)
    this.http = axios.create({
      // httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/vnd.manageengine.sdp.v3+json',
        'authtoken': this.apiKey,
      },
    });
  }

  private extractError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const responseBody = error.response?.data;
      const details = responseBody
        ? JSON.stringify(responseBody, null, 2)
        : error.message || 'No response body';
      return `HTTP ${status || 'N/A'} — ${details}`;
    }
    return error instanceof Error ? error.message : String(error);
  }

  async createRequest(
    input: ServiceDeskRequestInput
  ): Promise<{ id: string; success: boolean; data?: ServiceDeskResponse }> {
    const url = `${this.baseUrl}/api/v3/requests`;

    console.log('[ServiceDesk] Creating request:', JSON.stringify(input, null, 2));

    if (this.dryRun) {
      const fakeId = `DRY-${Date.now()}`;
      return { id: fakeId, success: true };
    }

    try {
      const formData = new URLSearchParams();
      formData.append('input_data', JSON.stringify(input));
      const response = await this.http.post(url, formData.toString());

      console.log('[ServiceDesk] Create response:', JSON.stringify(response.data));

      const data = response.data as ServiceDeskResponse;
      return {
        id: data.request?.id || '',
        success: true,
        data,
      };
    } catch (error: unknown) {
      const errDetail = this.extractError(error);
      console.error('[ServiceDesk] Failed to create request:', errDetail);
      throw new Error(`ServiceDesk createRequest failed: ${errDetail}`);
    }
  }

  async updateRequest(
    requestId: string,
    input: Partial<ServiceDeskRequestInput>
  ): Promise<{ success: boolean }> {
    const url = `${this.baseUrl}/api/v3/requests/${requestId}`;

    if (this.dryRun) {
      console.log(`[DRY-RUN] ServiceDesk updateRequest ${requestId}:`, JSON.stringify(input, null, 2));
      return { success: true };
    }

    try {
      const formData = new URLSearchParams();
      formData.append('input_data', JSON.stringify(input));
      await this.http.put(url, formData.toString());
      return { success: true };
    } catch (error: unknown) {
      const errDetail = this.extractError(error);
      console.error(`[ServiceDesk] Failed to update request ${requestId}:`, errDetail);
      throw new Error(`ServiceDesk updateRequest failed: ${errDetail}`);
    }
  }

  async closeRequest(
    requestId: string,
    input?: ServiceDeskCloseInput
  ): Promise<{ success: boolean }> {
    const url = `${this.baseUrl}/api/v3/requests/${requestId}/close`;

    const body = input || {
      request: {
        closure_comments: 'Auto-closed by NOC automation — alarm cleared.',
        requester_ack_resolution: true,
        closure_code: { name: 'Success' },
      },
    };

    if (this.dryRun) {
      console.log(`[DRY-RUN] ServiceDesk closeRequest ${requestId}:`, JSON.stringify(body, null, 2));
      return { success: true };
    }

    try {
      const formData = new URLSearchParams();
      formData.append('input_data', JSON.stringify(body));
      await this.http.put(url, formData.toString());
      return { success: true };
    } catch (error: unknown) {
      const errDetail = this.extractError(error);
      console.error(`[ServiceDesk] Failed to close request ${requestId}:`, errDetail);
      throw new Error(`ServiceDesk closeRequest failed: ${errDetail}`);
    }
  }

  async getRequest(requestId: string): Promise<ServiceDeskResponse | null> {
    const url = `${this.baseUrl}/api/v3/requests/${requestId}`;

    if (this.dryRun) {
      console.log(`[DRY-RUN] ServiceDesk getRequest ${requestId}`);
      return null;
    }

    try {
      const response = await this.http.get(url);
      return response.data as ServiceDeskResponse;
    } catch (error: unknown) {
      const errDetail = this.extractError(error);
      console.error(`[ServiceDesk] Failed to get request ${requestId}:`, errDetail);
      return null;
    }
  }
}

