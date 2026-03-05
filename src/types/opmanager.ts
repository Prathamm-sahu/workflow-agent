export interface OpManagerWebhookPayload {
  source: string;
  profile: {
    name: string;
  };
  alarm: {
    id: string;
    message: string;
    severity: string;       // "Critical" | "Trouble" | "Attention" | "Clear"
    eventType: string;      // "Device Down", "Interface Down", etc.
    lastModifiedTime: string;
    cycleId: string;
    rootCause: string;
    entity: string;
    lastPolledValue: string;
  };
  device: {
    name: string;
    category: string;       // "Server", "Switch", "Firewall"
    type: string;
    ip: string;
    vendor: string;
    isSNMP: string;
    dependent: string;
    hardware: {
      ramSize: string;
      hardDiskSize: string;
    };
    location: {
      building: string;
      floor: string;
      cabinet: string;
      siteAddress: string;
    };
    asset: {
      department: string;
      serialNumber: string;
      vmwareTags: string;
    };
    contact: {
      name: string;
      phone: string;
    };
  };
  interface: {
    name: string;
    description: string;
    alias: string;
    ip: string;
    media: string;
    index: string;
    circuitId: string;
    speedIn: string;
    speedOut: string;
    custom: {
      circuitId: string;
      sla: string;
      severity: string;
      contactName: string;
      phone: string;
      comments: string;
    };
  };
  monitor: {
    name: string;
    instance: string;
    protocol: string;
  };
}
