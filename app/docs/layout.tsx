import Link from "next/link";
import type { ReactNode } from "react";
import { OpenSuiteMCPLogo } from "@/components/icons";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh text-[#f3efe6]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 55% at 15% -10%, rgba(74, 129, 232, 0.22), transparent 55%),
            radial-gradient(ellipse 70% 50% at 90% 10%, rgba(234, 88, 12, 0.16), transparent 50%),
            linear-gradient(180deg, #0c1219 0%, #121a24 45%, #0c1219 100%)
          `,
        }}
      />
      <div className="relative z-10 mx-auto w-full max-w-3xl px-5 py-6 md:px-8 md:py-10">
        <header className="mb-10 flex items-center justify-between gap-4">
          <Link className="flex items-center gap-2.5" href="/">
            <OpenSuiteMCPLogo size={26} />
            <span
              className="font-light text-lg tracking-tight"
              style={{ fontFamily: "var(--font-raleway)" }}
            >
              OpenSuite<span className="font-semibold">MCP</span>
            </span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              className="text-[#f3efe6]/70 transition-colors hover:text-[#f3efe6]"
              href="/docs"
            >
              Docs
            </Link>
            <Link
              className="rounded-md bg-[#f3efe6] px-3 py-1.5 font-medium text-[#0c1219] text-sm transition-opacity hover:opacity-90"
              href="/login"
            >
              Sign in
            </Link>
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
