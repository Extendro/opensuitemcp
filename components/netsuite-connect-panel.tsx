"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { LoaderIcon, WarningIcon } from "@/components/icons";
import { NetSuiteIntegrationChecklist } from "@/components/netsuite-integration-checklist";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { NetSuiteAccountEntry } from "@/lib/netsuite/accounts";
import { cn } from "@/lib/utils";

export type NetSuiteDcrProbeState =
  | { status: "idle" }
  | { status: "probing" }
  | { status: "ready"; clientId: string }
  | {
      status: "needs_integration";
      accountId: string;
      integrationUrl: string;
      redirectUri: string;
      dcrClientName: string;
      checklist: string[];
    }
  | { status: "error"; error: string };

type NetSuiteConnectPanelProps = {
  showSkeletons: boolean;
  accounts: NetSuiteAccountEntry[];
  selectedAccountId: string;
  editingLabels: Record<string, string>;
  newAccountId: string;
  newAccountLabel: string;
  dcrProbe: NetSuiteDcrProbeState;
  isConnected: boolean;
  isConnecting: boolean;
  canConnect: boolean;
  onNewAccountIdChange: (value: string) => void;
  onNewAccountLabelChange: (value: string) => void;
  onAddAccount: () => void;
  onSelectAccount: (accountId: string) => void;
  onRenameAccount: (accountId: string) => void;
  onRemoveAccount: (accountId: string) => void;
  onEditingLabelChange: (accountId: string, value: string) => void;
  onProbe: (accountId: string) => void;
  onOpenIntegration: () => void;
  onConnect: () => void;
};

const STEPS = [
  { id: 1, label: "Add account" },
  { id: 2, label: "Integration" },
  { id: 3, label: "Connect" },
] as const;

const compactInputClass = "h-8 px-2.5 text-sm";

function resolveWizardStep(args: {
  hasAccounts: boolean;
  isConnected: boolean;
  dcrProbe: NetSuiteDcrProbeState;
}): number {
  if (!args.hasAccounts) {
    return 1;
  }
  if (args.isConnected) {
    return 3;
  }
  if (args.dcrProbe.status === "ready") {
    return 3;
  }
  return 2;
}

export function NetSuiteConnectPanel({
  showSkeletons,
  accounts,
  selectedAccountId,
  editingLabels,
  newAccountId,
  newAccountLabel,
  dcrProbe,
  isConnected,
  isConnecting,
  canConnect,
  onNewAccountIdChange,
  onNewAccountLabelChange,
  onAddAccount,
  onSelectAccount,
  onRenameAccount,
  onRemoveAccount,
  onEditingLabelChange,
  onProbe,
  onOpenIntegration,
  onConnect,
}: NetSuiteConnectPanelProps) {
  const accountIdFieldId = useId();
  const accountLabelFieldId = useId();
  const renameFieldId = useId();
  const [manageOpen, setManageOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [renameAccountId, setRenameAccountId] = useState<string | null>(null);

  const hasAccounts = accounts.length > 0;
  const activeStep = resolveWizardStep({
    hasAccounts,
    isConnected,
    dcrProbe,
  });
  const redirectUri =
    dcrProbe.status === "needs_integration"
      ? dcrProbe.redirectUri
      : typeof window !== "undefined"
        ? `${window.location.origin}/api/netsuite/callback`
        : "/api/netsuite/callback";
  const clientName =
    dcrProbe.status === "needs_integration"
      ? dcrProbe.dcrClientName
      : undefined;

  const renameTarget = renameAccountId
    ? accounts.find((account) => account.accountId === renameAccountId)
    : undefined;
  const renameDraft =
    renameAccountId != null
      ? (editingLabels[renameAccountId] ?? renameTarget?.label ?? "")
      : "";

  if (showSkeletons && !hasAccounts) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {hasAccounts ? (
        <nav aria-label="NetSuite setup steps">
          <ol className="flex flex-wrap items-center gap-2 text-xs">
            {STEPS.map((step, index) => {
              const done =
                step.id < activeStep || (step.id === 3 && isConnected);
              const current = step.id === activeStep && !isConnected;
              return (
                <li className="flex items-center gap-2" key={step.id}>
                  {index > 0 ? (
                    <span aria-hidden className="text-muted-foreground/50">
                      →
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
                      done &&
                        "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                      current && "bg-primary/10 font-medium text-foreground",
                      !done && !current && "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-3.5 items-center justify-center rounded-full text-[10px]",
                        done || current
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {step.id}
                    </span>
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      {!hasAccounts ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="font-medium text-sm">Add a NetSuite account</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Enter your NetSuite account ID to start. An administrator will
              create the Integration record next, then you can connect with
              OAuth.
            </p>
          </div>
          <AddAccountForm
            accountId={newAccountId}
            accountIdFieldId={accountIdFieldId}
            accountLabel={newAccountLabel}
            accountLabelFieldId={accountLabelFieldId}
            onAccountIdChange={onNewAccountIdChange}
            onAccountLabelChange={onNewAccountLabelChange}
            onSubmit={onAddAccount}
            submitLabel="Add account"
          />
        </div>
      ) : null}

      {hasAccounts && activeStep === 2 ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="font-medium text-sm">Create the Integration record</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Account{" "}
              <span className="font-medium text-foreground">
                {selectedAccountId}
              </span>
              . A NetSuite administrator needs to create this once per account.
            </p>
          </div>

          {dcrProbe.status === "probing" ? (
            <p className="flex items-center gap-2 text-muted-foreground text-xs">
              <span className="inline-block animate-spin">
                <LoaderIcon size={14} />
              </span>
              Checking Integration record…
            </p>
          ) : null}

          {dcrProbe.status === "error" ? (
            <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-2.5">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-500">
                  <WarningIcon size={14} />
                </div>
                <div className="flex-1 space-y-2">
                  <p className="font-medium text-sm text-yellow-900 dark:text-yellow-100">
                    Could not verify Integration
                  </p>
                  <p className="text-xs text-yellow-800 dark:text-yellow-200">
                    {dcrProbe.error}
                  </p>
                  <Button
                    onClick={() => onProbe(selectedAccountId)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Check again
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {dcrProbe.status === "needs_integration" ||
          dcrProbe.status === "idle" ||
          dcrProbe.status === "probing" ? (
            <div className="space-y-3 rounded-md border border-border/60 p-3">
              <NetSuiteIntegrationChecklist
                clientName={clientName}
                redirectUri={redirectUri}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={onOpenIntegration} size="sm" type="button">
                  Open New Integration
                </Button>
                <Button
                  disabled={!selectedAccountId || dcrProbe.status === "probing"}
                  onClick={() => onProbe(selectedAccountId)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  I&apos;ve finished — Check again
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {hasAccounts && activeStep === 3 ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="font-medium text-sm">Connect with OAuth</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {isConnected
                ? "This account is connected. You can disconnect or manage other accounts below."
                : "Integration looks ready. Connect to authorize OpenSuiteMCP for MCP tools."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={!canConnect && !isConnected}
              onClick={onConnect}
              size="sm"
              type="button"
              variant={isConnected ? "destructive" : "default"}
            >
              {isConnected
                ? "Disconnect"
                : isConnecting
                  ? "Connecting..."
                  : "Connect"}
            </Button>
            {isConnected ? (
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
                <span className="text-muted-foreground text-xs">
                  Connected · {selectedAccountId}
                </span>
              </div>
            ) : dcrProbe.status === "ready" ? (
              <span className="text-muted-foreground text-xs">
                Integration ready
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasAccounts ? (
        <div className="space-y-2 border-border/60 border-t pt-3">
          <button
            className="flex w-full items-center justify-between text-left"
            onClick={() => setManageOpen((open) => !open)}
            type="button"
          >
            <div>
              <p className="font-medium text-sm">Your accounts</p>
              <p className="text-muted-foreground text-xs">
                {`${accounts.length} account${accounts.length === 1 ? "" : "s"}`}
                {selectedAccountId ? ` · active ${selectedAccountId}` : ""}
              </p>
            </div>
            <span className="text-muted-foreground text-xs">
              {manageOpen ? "Hide" : "Manage"}
            </span>
          </button>

          {manageOpen ? (
            <div className="space-y-2">
              <ul className="divide-y divide-border/60 rounded-md border border-border/60">
                {accounts.map((account) => {
                  const isActive = account.accountId === selectedAccountId;
                  const radioId = `ns-account-${account.accountId}`;
                  return (
                    <li
                      className="flex items-center gap-2.5 px-2.5 py-2"
                      key={account.accountId}
                    >
                      <input
                        checked={isActive}
                        className="size-3.5 shrink-0 accent-foreground"
                        id={radioId}
                        name="netsuite-active-account"
                        onChange={() => {
                          if (!isActive) {
                            onSelectAccount(account.accountId);
                          }
                        }}
                        type="radio"
                        value={account.accountId}
                      />
                      <label
                        className="min-w-0 flex-1 cursor-pointer"
                        htmlFor={radioId}
                      >
                        <p className="truncate text-sm">
                          <span className="font-medium">{account.label}</span>
                          {isConnected && isActive ? (
                            <span className="ml-1.5 text-muted-foreground text-xs">
                              Connected
                            </span>
                          ) : null}
                        </p>
                        {account.label !== account.accountId ? (
                          <p className="truncate text-muted-foreground text-xs">
                            {account.accountId}
                          </p>
                        ) : null}
                      </label>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          aria-label={`Rename ${account.label}`}
                          className="size-7"
                          onClick={() => {
                            onEditingLabelChange(
                              account.accountId,
                              account.label,
                            );
                            setRenameAccountId(account.accountId);
                          }}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          aria-label={`Remove ${account.label}`}
                          className="size-7 text-muted-foreground hover:text-destructive"
                          onClick={() => onRemoveAccount(account.accountId)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {showAddForm ? (
                <div className="space-y-2 rounded-md border border-border/60 p-2.5">
                  <AddAccountForm
                    accountId={newAccountId}
                    accountIdFieldId={`${accountIdFieldId}-another`}
                    accountLabel={newAccountLabel}
                    accountLabelFieldId={`${accountLabelFieldId}-another`}
                    onAccountIdChange={onNewAccountIdChange}
                    onAccountLabelChange={onNewAccountLabelChange}
                    onSubmit={() => {
                      onAddAccount();
                      setShowAddForm(false);
                    }}
                    submitLabel="Add"
                  />
                </div>
              ) : (
                <Button
                  aria-label="Add another account"
                  className="size-7"
                  onClick={() => setShowAddForm(true)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <Plus className="size-3.5" />
                </Button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setRenameAccountId(null);
          }
        }}
        open={renameAccountId != null}
      >
        <DialogContent className="max-w-sm gap-4 p-4 sm:max-w-sm">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-base">Rename account</DialogTitle>
            <DialogDescription className="text-xs">
              {renameAccountId
                ? `Nickname for ${renameAccountId}`
                : "Choose a nickname for this account."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={renameFieldId}>
              Nickname
            </Label>
            <Input
              autoComplete="off"
              autoFocus
              className={compactInputClass}
              id={renameFieldId}
              onChange={(e) => {
                if (renameAccountId) {
                  onEditingLabelChange(renameAccountId, e.target.value);
                }
              }}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  renameAccountId &&
                  renameDraft.trim()
                ) {
                  e.preventDefault();
                  onRenameAccount(renameAccountId);
                  setRenameAccountId(null);
                }
              }}
              placeholder="Sandbox"
              value={renameDraft}
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              onClick={() => setRenameAccountId(null)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={!renameAccountId || !renameDraft.trim()}
              onClick={() => {
                if (!renameAccountId) {
                  return;
                }
                onRenameAccount(renameAccountId);
                setRenameAccountId(null);
              }}
              size="sm"
              type="button"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddAccountForm({
  accountIdFieldId,
  accountLabelFieldId,
  accountId,
  accountLabel,
  onAccountIdChange,
  onAccountLabelChange,
  onSubmit,
  submitLabel,
}: {
  accountIdFieldId: string;
  accountLabelFieldId: string;
  accountId: string;
  accountLabel: string;
  onAccountIdChange: (value: string) => void;
  onAccountLabelChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={accountIdFieldId}>
          Account ID
        </Label>
        <Input
          autoComplete="off"
          className={compactInputClass}
          id={accountIdFieldId}
          onChange={(e) => onAccountIdChange(e.target.value)}
          placeholder="1234567-sb1"
          value={accountId}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={accountLabelFieldId}>
          Label (optional)
        </Label>
        <Input
          autoComplete="off"
          className={compactInputClass}
          id={accountLabelFieldId}
          onChange={(e) => onAccountLabelChange(e.target.value)}
          placeholder="Sandbox"
          value={accountLabel}
        />
      </div>
      <div className="flex items-end">
        <Button
          disabled={!accountId.trim()}
          onClick={onSubmit}
          size="sm"
          type="button"
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
