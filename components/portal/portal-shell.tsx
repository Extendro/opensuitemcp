"use client";

import type { User } from "next-auth";
import type { ReactNode } from "react";
import { AppPortal } from "@/components/app-portal";
import { AppPortalProvider } from "@/components/portal/context";

export function PortalShell({
  user,
  children,
}: {
  user: User | undefined;
  children: ReactNode;
}) {
  return (
    <AppPortalProvider>
      {children}
      <AppPortal user={user} />
    </AppPortalProvider>
  );
}
