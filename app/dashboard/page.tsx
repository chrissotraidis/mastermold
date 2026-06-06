import HomePage from "../page";

export default function DashboardPage() {
  return (
    <div data-route-family="/dashboard" data-dashboard-route="true">
      <p className="sr-only">
        Dashboard route loaded for the authenticated operator and reviewer persona.
      </p>
      <HomePage />
    </div>
  );
}
