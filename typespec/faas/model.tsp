namespace CustomDomains;

model SetCertificateBody {
  certificate: string;
}

model HistoryItem {
  type: "registered" | "dns-configured" | "dns-removed" | "deregistered";
  domain: string;
  datetime: string;
  note?: string;
}

model GetHistoryResponse {
  vendorId: string;
  items: HistoryItem[];
}

model DeleteCustomDomainBody {
  note: string;
}

model DnsConfigured {
  event: "dns-configured";
  vendorId: string;
  domain: string;
  note: string;
}

model DnsPending {
  event: "dns-pending";
  vendorId: string;
  domain: string;
  note: string;
}

model DnsRemoved {
  event: "dns-removed";
  vendorId: string;
  domain: string;
  note: string;
}

model Deleted {
  event: "deleted";
  vendorId: string;
  domains: string[];
  note: string;
}

union OnSqsCustomDomainStatusRequest {
  DnsConfigured,
  DnsPending,
  DnsRemoved,
  Deleted,
}

model OnSqsDomainResolvingRequest {
  source: "test" | "migration" | "on-schedule-monitor-custom-domains" | "on-sqs-vendor-cdc" | "refresh";
  vendorId: string;
  domains: string[];
  registered: string;
}

union DomainDiagnosticCode {
  "empty",
  "wrong-ip",
  "mixed-ip",
  "AAAA",
}

model DomainDiagnostic {
  domain: string;
  reachable: boolean;
  codes: DomainDiagnosticCode[];
  ips?: string[]; // it's optional for backward compatibility. in the future, it will be required.
  note: string;
  createdAt: int32;
}
