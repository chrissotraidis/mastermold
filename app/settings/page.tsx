import IntegrationsSettingsPage from "./integrations/page";

type SettingsPageProps = {
  searchParams?: Promise<{ action?: string }>;
};

export default function SettingsPage(props: SettingsPageProps) {
  return <IntegrationsSettingsPage {...props} />;
}
