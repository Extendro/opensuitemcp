import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppSidebar } from "@/components/app-sidebar";
import { PortalShell } from "@/components/portal/portal-shell";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth } from "../(auth)/auth";

export const experimental_ppr = true;

export const metadata: Metadata = {
  openGraph: {
    type: "website",
  },
  twitter: {
    card: "summary",
  },
};

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <PortalShell user={session?.user}>
        <AppSidebar user={session?.user} />
        <SidebarInset>{children}</SidebarInset>
      </PortalShell>
    </SidebarProvider>
  );
}
