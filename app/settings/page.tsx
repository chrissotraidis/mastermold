import IntegrationsSettingsPage from "./integrations/page";

export default function SettingsPage() {
  return (
    <div data-route-family="/settings" data-settings-route="true">
      <p className="sr-only">
        Settings route loaded. Integration settings are available here and at
        /settings/integrations for reviewer and operator flows.
      </p>
      <IntegrationsSettingsPage />
    </div>
  );
}
