import { NextResponse } from "next/server";
import { getIntegrationStatuses, type IntegrationStatusJson } from "@/src/db/integrations";
import type { IntegrationStatus } from "@/src/db/schema";

type PublicIntegrationStatusJson = Omit<
  IntegrationStatusJson,
  "id" | "service" | "status" | "test_fields" | "event_time" | "knowledge_time"
> & {
  id: string;
  service: "coinbase" | "robinhood" | "onchain_wallet" | "live_chat";
  status: "Connected" | "Sample mode" | "Needs key";
  status_since: string;
  checked_at: string;
  test_fields: Array<
    Omit<IntegrationStatusJson["test_fields"][number], "name"> & {
      name: string;
    }
  >;
};

export function GET(): NextResponse<PublicIntegrationStatusJson[]> {
  return NextResponse.json(getIntegrationStatuses().map(publicIntegrationStatus));
}

function publicIntegrationStatus(status: IntegrationStatusJson): PublicIntegrationStatusJson {
  const { id, service, event_time, knowledge_time, ...publicStatus } = status;
  return {
    ...publicStatus,
    id: publicIntegrationId(id, service),
    service: publicIntegrationService(service),
    status: publicIntegrationState(status.status),
    status_since: event_time,
    checked_at: knowledge_time,
    test_fields: status.test_fields.map((field) =>
      field.name === "provider" ? { ...field, name: "chat_service" } : field,
    ),
  };
}

function publicIntegrationId(id: string, service: IntegrationStatus["service"]): string {
  return service === "llm" ? "int_live_chat" : id;
}

function publicIntegrationService(service: IntegrationStatus["service"]): PublicIntegrationStatusJson["service"] {
  return service === "llm" ? "live_chat" : service;
}

function publicIntegrationState(status: IntegrationStatus["status"]): PublicIntegrationStatusJson["status"] {
  if (status === "connected") return "Connected";
  if (status === "credential_gated") return "Needs key";
  return "Sample mode";
}
