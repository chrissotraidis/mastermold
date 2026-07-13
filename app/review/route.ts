export const dynamic = "force-dynamic";

export function GET() {
  return new Response(null, {
    status: 307,
    headers: { location: "/settings#health" },
  });
}
