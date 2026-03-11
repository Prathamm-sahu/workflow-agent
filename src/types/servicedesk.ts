export interface ServiceDeskRequestInput {
  request: {
    subject: string;
    description: string;
    requester?: { id: string; name: string };
    priority?: { name: string };
    status?: { name: string };
    site?: { name: string };
    technician?: { name: string; email_id?: string };
    category?: { name: string };
    subcategory?: { name: string };
    item?: { name: string };
    urgency?: { name: string };
    impact?: { name: string };
    group?: { name: string, site: string, id: string };
    request_type?: { name: string };
    udf_fields?: Record<string, string | null>;
  };
}

export interface ServiceDeskCloseInput {
  request: {
    closure_comments?: string;
    requester_ack_resolution?: boolean;
    closure_code?: { name: string };
  };
}

export interface ServiceDeskResponse {
  request: {
    id: string;
    subject: string;
    status: { name: string };
    priority: { name: string };
    created_time: { value: string };
    [key: string]: unknown;
  };
  response_status: {
    status_code: number;
    status: string;
  };
}
