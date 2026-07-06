import { syncMonarchMcpPortfolio } from "@/src/db/monarch-mcp";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const result = await syncMonarchMcpPortfolio();
  return Response.json(result, { status: result.ok ? 200 : result.status === "not_configured" ? 422 : 502 });
}
