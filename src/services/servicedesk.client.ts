import axios from 'axios';
import { AppConfig } from '../config';
import {
  ServiceDeskRequestInput,
  ServiceDeskCloseInput,
  ServiceDeskResponse,
} from '../types/servicedesk';

/**
 * ServiceDesk Plus MSP On-Premise API v3 client.
 * Auth: technician_key via TECHNICIAN_KEY URL parameter.
 * Endpoint: http://<server>:<port>/api/v3/requests
 */
export class ServiceDeskClient {
  private baseUrl: string;
  private apiKey: string;
  private dryRun: boolean;

  constructor(config: AppConfig) {
    this.baseUrl = config.serviceDesk.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.serviceDesk.apiKey;
    this.dryRun = config.dryRun;
  }

  /**
   * Create a new request (ticket) in ServiceDesk Plus.
   * POST /api/v3/requests
   */
  async createRequest(
    input: ServiceDeskRequestInput
  ): Promise<{ id: string; success: boolean; data?: ServiceDeskResponse }> {
    const url = `${this.baseUrl}/api/v3/requests`;

    if (this.dryRun) {
      console.log('[DRY-RUN] ServiceDesk createRequest:', JSON.stringify(input, null, 2));
      const fakeId = `DRY-${Date.now()}`;
      return { id: fakeId, success: true };
    }

    try {
      const response = await axios.post(url, null, {
        params: {
          TECHNICIAN_KEY: this.apiKey,
          input_data: JSON.stringify(input),
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
      });

      const data = response.data as ServiceDeskResponse;
      return {
        id: data.request?.id || '',
        success: true,
        data,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('[ServiceDesk] Failed to create request:', errMsg);
      throw new Error(`ServiceDesk createRequest failed: ${errMsg}`);
    }
  }

  /**
   * Update an existing request.
   * PUT /api/v3/requests/{id}
   */
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
      await axios.put(url, null, {
        params: {
          TECHNICIAN_KEY: this.apiKey,
          input_data: JSON.stringify(input),
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
      });
      return { success: true };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ServiceDesk] Failed to update request ${requestId}:`, errMsg);
      throw new Error(`ServiceDesk updateRequest failed: ${errMsg}`);
    }
  }

  /**
   * Close a request.
   * PUT /api/v3/requests/{id}/close
   */
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
      await axios.put(url, null, {
        params: {
          TECHNICIAN_KEY: this.apiKey,
          input_data: JSON.stringify(body),
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
      });
      return { success: true };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ServiceDesk] Failed to close request ${requestId}:`, errMsg);
      throw new Error(`ServiceDesk closeRequest failed: ${errMsg}`);
    }
  }

  /**
   * Get request details.
   * GET /api/v3/requests/{id}
   */
  async getRequest(requestId: string): Promise<ServiceDeskResponse | null> {
    const url = `${this.baseUrl}/api/v3/requests/${requestId}`;

    if (this.dryRun) {
      console.log(`[DRY-RUN] ServiceDesk getRequest ${requestId}`);
      return null;
    }

    try {
      const response = await axios.get(url, {
        params: { TECHNICIAN_KEY: this.apiKey },
        headers: { Accept: 'application/json' },
      });
      return response.data as ServiceDeskResponse;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ServiceDesk] Failed to get request ${requestId}:`, errMsg);
      return null;
    }
  }
}
