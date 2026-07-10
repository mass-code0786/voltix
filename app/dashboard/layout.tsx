import { AppLaunchSplash } from "@/components/app-launch-splash";

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AppLaunchSplash />
      {children}
    </>
  );
}
