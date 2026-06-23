import { redirect } from "next/navigation";

type ExecutorPageProps = {
  searchParams?: Promise<{ as_of?: string }>;
};

export default async function ExecutorPage({ searchParams }: ExecutorPageProps) {
  const params = await searchParams;
  const query = params?.as_of ? `?as_of=${encodeURIComponent(params.as_of)}` : "";

  redirect(`/trading${query}`);
}
