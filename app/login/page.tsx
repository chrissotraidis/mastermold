import { LoginPanel } from "@/components/login-panel";

type LoginPageProps = {
  searchParams?: Promise<{
    returnUrl?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return <LoginPanel returnUrl={params?.returnUrl ?? "/dashboard"} />;
}
