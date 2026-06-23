import TodayPage from "../page";

export const dynamic = "force-dynamic";

type TodayRouteProps = {
  searchParams?: Promise<{ as_of?: string }>;
};

export default function TodayRoute(props: TodayRouteProps) {
  return <TodayPage {...props} />;
}
