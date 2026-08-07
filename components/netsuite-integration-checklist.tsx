"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getIntegrationSetupSteps,
  type IntegrationChecklistField,
} from "@/lib/netsuite/integration-checklist";
import { cn } from "@/lib/utils";

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyableField({
  field,
  className,
}: {
  field: IntegrationChecklistField;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <li className={cn("space-y-1", className)}>
      <p className="font-medium text-foreground text-sm">{field.label}</p>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 font-mono text-muted-foreground text-xs">
          {field.value}
        </code>
        {field.copyable ? (
          <Button
            aria-label={`Copy ${field.label}`}
            className="size-7 shrink-0"
            onClick={() => {
              void copyText(field.value).then((ok) => {
                if (!ok) {
                  return;
                }
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
            size="icon"
            type="button"
            variant="outline"
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function NetSuiteIntegrationChecklist({
  redirectUri,
  clientName,
  className,
}: {
  redirectUri?: string;
  clientName?: string;
  className?: string;
}) {
  const steps = getIntegrationSetupSteps({ redirectUri, clientName });
  const fields = steps.find((step) => step.id === "fields")?.fields ?? [];

  return (
    <ol className={cn("list-decimal space-y-4 pl-5 text-sm", className)}>
      {steps.map((step) => (
        <li key={step.id}>
          <p className="font-medium text-foreground">{step.title}</p>
          {step.body ? (
            <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
              {step.body}
            </p>
          ) : null}
          {step.id === "fields" && fields.length > 0 ? (
            <ul className="mt-3 list-none space-y-3 pl-0">
              {fields.map((field) => (
                <CopyableField field={field} key={field.id} />
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
