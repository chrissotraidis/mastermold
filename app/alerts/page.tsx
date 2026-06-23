import { redirect } from "next/navigation";

type AlertsPageProps = {
  searchParams?: Promise<{ as_of?: string }>;
};

export default async function AlertsPage({ searchParams }: AlertsPageProps) {
  const params = await searchParams;
  const query = params?.as_of ? `?as_of=${encodeURIComponent(params.as_of)}` : "";

  redirect(`/activity${query}`);
}
