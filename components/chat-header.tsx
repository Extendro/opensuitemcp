"use client";

import { useRouter } from "next/navigation";
import { memo, useEffect, useState } from "react";
import { useWindowSize } from "usehooks-ts";
import { NetSuiteStatusChip } from "@/components/netsuite-status-chip";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlusIcon } from "./icons";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

/** Sidebar expand/collapse lives in the rail on desktop; header keeps a
 *  mobile-only trigger so the sheet can open when the rail is off-canvas. */

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const router = useRouter();

  const { width: windowWidth } = useWindowSize();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // During SSR, assume desktop size (>= 768) to match initial render
  const isMobile =
    mounted && windowWidth !== undefined ? windowWidth < 768 : false;

  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
      {isMobile ? <SidebarToggle /> : null}

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          className="order-1 md:order-2"
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      <div className="pointer-events-none order-2 flex h-8 select-none flex-row items-center justify-center gap-0 rounded-md text-xl md:order-3">
        <span
          className="font-light"
          style={{ fontFamily: "var(--font-raleway)" }}
        >
          <span className="tracking-tight">OpenSuite</span>
          <span className="font-semibold">MCP</span>
        </span>
      </div>

      <div
        className={cn(
          "ml-auto flex items-center gap-1.5",
          "order-3 md:order-4",
        )}
      >
        {!isReadonly ? <NetSuiteStatusChip /> : null}
        {/* Desktop New Chat lives in the sidebar rail; header + only when the
            mobile sheet is closed and that control isn't visible. */}
        {isMobile ? (
          <Button
            className="h-8 px-2"
            onClick={() => {
              router.push("/");
              router.refresh();
            }}
            variant="outline"
          >
            <PlusIcon />
            <span className="md:sr-only">New Chat</span>
          </Button>
        ) : null}
      </div>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
  );
});
