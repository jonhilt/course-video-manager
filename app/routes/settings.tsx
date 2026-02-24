"use client";

import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import { Console, Effect } from "effect";
import { useState } from "react";
import { useFetcher, useRevalidator, Link, data } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChevronLeftIcon,
  CheckCircle2Icon,
  Loader2Icon,
  XCircleIcon,
  CopyIcon,
  CheckIcon,
  UnplugIcon,
} from "lucide-react";
import type { Route } from "./+types/settings";

export const loader = async () => {
  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const aiHeroAuth = yield* db.getAiHeroAuth();
    return {
      aiHero: aiHeroAuth
        ? { connected: true as const, userId: aiHeroAuth.userId }
        : { connected: false as const },
    };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};

export default function SettingsPage({ loaderData }: Route.ComponentProps) {
  const { aiHero } = loaderData;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/">
            <ChevronLeftIcon className="size-6" />
          </Link>
        </Button>
        <h1 className="text-lg font-medium">Settings</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <AiHeroAuthCard aiHero={aiHero} />
        </div>
      </div>
    </div>
  );
}

function AiHeroAuthCard({
  aiHero,
}: {
  aiHero: { connected: true; userId: string } | { connected: false };
}) {
  const [deviceFlow, setDeviceFlow] = useState<{
    userCode: string;
    verificationUri: string;
    deviceCode: string;
  } | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const disconnectFetcher = useFetcher();
  const revalidator = useRevalidator();

  const startDeviceFlow = async () => {
    setError(null);
    try {
      const res = await fetch("/api/auth/ai-hero/device-code", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start device flow");
        return;
      }
      setDeviceFlow({
        userCode: data.userCode,
        verificationUri: data.verificationUri,
        deviceCode: data.deviceCode,
      });
      // Start polling
      setPolling(true);
      try {
        const pollRes = await fetch("/api/auth/ai-hero/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceCode: data.deviceCode }),
        });
        const pollData = await pollRes.json();
        if (pollRes.ok && pollData.success) {
          setDeviceFlow(null);
          revalidator.revalidate();
        } else {
          setError(pollData.error || "Authorization failed");
        }
      } finally {
        setPolling(false);
      }
    } catch {
      setError("Failed to connect to server");
    }
  };

  const copyUserCode = () => {
    if (deviceFlow) {
      navigator.clipboard.writeText(deviceFlow.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (aiHero.connected) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2Icon className="h-5 w-5 text-green-500" />
            <CardTitle>AI Hero</CardTitle>
          </div>
          <CardDescription>Connected as user {aiHero.userId}</CardDescription>
        </CardHeader>
        <CardContent>
          <disconnectFetcher.Form
            method="post"
            action="/api/auth/ai-hero/disconnect"
          >
            <Button variant="outline" size="sm" type="submit">
              <UnplugIcon className="size-4 mr-1.5" />
              Disconnect
            </Button>
          </disconnectFetcher.Form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <XCircleIcon className="h-5 w-5 text-gray-400" />
          <CardTitle>AI Hero</CardTitle>
        </div>
        <CardDescription>
          Connect your AI Hero account to publish posts directly from this app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-red-400">{error}</p>}

        {!deviceFlow ? (
          <Button onClick={startDeviceFlow}>Connect to AI Hero</Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">
              Enter this code on AI Hero to connect your account:
            </p>
            <div className="flex items-center gap-2">
              <code className="bg-gray-800 px-4 py-2 rounded text-lg font-mono tracking-wider">
                {deviceFlow.userCode}
              </code>
              <Button variant="ghost" size="icon" onClick={copyUserCode}>
                {copied ? (
                  <CheckIcon className="size-4" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <a
                  href={deviceFlow.verificationUri}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open AI Hero Activation Page
                </a>
              </Button>
              {polling && (
                <span className="flex items-center gap-1.5 text-sm text-gray-400">
                  <Loader2Icon className="size-4 animate-spin" />
                  Waiting for authorization...
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
