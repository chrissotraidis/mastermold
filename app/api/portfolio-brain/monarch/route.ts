import { getMonarchMcpPublicConfig } from "@/src/db/monarch-mcp";
import { getPortfolioBrainState } from "@/src/db/portfolio-brain";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const state = getPortfolioBrainState();
  return Response.json({
    mode: "monarch-mcp-portfolio-brain",
    config: getMonarchMcpPublicConfig(),
    ...state,
  });
}
