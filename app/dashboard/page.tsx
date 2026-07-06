import TodayPage from "../page";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<{ as_of?: string }>;
};

export default function DashboardPage(props: DashboardPageProps) {
  return <TodayPage {...props} />;
}
