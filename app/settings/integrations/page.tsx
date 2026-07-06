import { redirect } from "next/navigation";

type IntegrationsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function IntegrationsSettingsPage({ searchParams }: IntegrationsPageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (typeof value === "string") {
      query.set(key, value);
    } else if (Array.isArray(value)) {
      for (const entry of value) query.append(key, entry);
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";

  redirect(`/settings${suffix}`);
}
