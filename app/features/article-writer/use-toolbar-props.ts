import { useMemo } from "react";
import type { UIMessage } from "ai";
import { marked } from "marked";
import type { FetcherWithComponents } from "react-router";
import type { LintViolation } from "./lint-rules";
import type { Mode, Model } from "./types";
import type { WriteToolbarProps } from "./write-toolbar";
import { hasUnresolvedScreenshots } from "./choose-screenshot-mutations";
import { partsToText, formatConversationAsQA } from "./write-utils";

export function useToolbarProps({
  messages,
  mode,
  model,
  status,
  isCopied,
  setIsCopied,
  violations,
  hasExplainerOrProblem,
  isStandalone,
  isDocumentMode,
  document,
  writeToReadmeFetcher,
  lessonId,
  composeFixMessage,
  sendMessage,
  getBodyPayload,
  regenerate,
  onModeChange,
  onModelChange,
  onGoLive,
  onClearChat,
  onOpenBannedPhrases,
}: {
  messages: UIMessage[];
  mode: Mode;
  model: Model;
  status: "streaming" | "submitted" | "ready" | "error";
  isCopied: boolean;
  setIsCopied: (v: boolean) => void;
  violations: LintViolation[];
  hasExplainerOrProblem: boolean;
  isStandalone: boolean;
  isDocumentMode: boolean;
  document: string | undefined;
  writeToReadmeFetcher: FetcherWithComponents<unknown>;
  lessonId: string | null;
  composeFixMessage: () => string | null;
  sendMessage: (
    msg: { text: string },
    opts: { body: Record<string, unknown> }
  ) => void;
  getBodyPayload: () => Record<string, unknown>;
  regenerate: (opts: { body: Record<string, unknown> }) => void;
  onModeChange: (mode: Mode) => void;
  onModelChange: (model: Model) => void;
  onGoLive: () => void;
  onClearChat: () => void;
  onOpenBannedPhrases: () => void;
}): WriteToolbarProps {
  const lastAssistantMessage = messages
    .slice()
    .reverse()
    .find((m) => m.role === "assistant");
  const lastAssistantMessageText = lastAssistantMessage
    ? partsToText(lastAssistantMessage.parts)
    : "";

  const setCopied = () => {
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return useMemo(
    () => ({
      mode,
      model,
      status,
      isCopied,
      messagesLength: messages.length,
      violations,
      hasExplainerOrProblem,
      isStandalone,
      lastAssistantMessageText,
      writeToReadmeFetcherState: writeToReadmeFetcher.state,
      hasUnresolvedScreenshots: hasUnresolvedScreenshots(
        isDocumentMode && document ? document : lastAssistantMessageText
      ),
      onModeChange,
      onModelChange,
      onCopyToClipboard: async () => {
        try {
          await navigator.clipboard.writeText(lastAssistantMessageText);
          setCopied();
        } catch (error) {
          console.error("Failed to copy to clipboard:", error);
        }
      },
      onCopyAsRichText: async () => {
        try {
          const html = await marked.parse(lastAssistantMessageText);
          const blob = new Blob([html], { type: "text/html" });
          const textBlob = new Blob([lastAssistantMessageText], {
            type: "text/plain",
          });
          await navigator.clipboard.write([
            new ClipboardItem({ "text/html": blob, "text/plain": textBlob }),
          ]);
          setCopied();
        } catch (error) {
          console.error("Failed to copy as rich text:", error);
        }
      },
      onCopyConversationHistory: async () => {
        try {
          await navigator.clipboard.writeText(formatConversationAsQA(messages));
          setCopied();
        } catch (error) {
          console.error("Failed to copy conversation history:", error);
        }
      },
      onGoLive,
      onFixLintViolations: () => {
        const fixMessage = composeFixMessage();
        if (fixMessage)
          sendMessage({ text: fixMessage }, { body: getBodyPayload() });
      },
      onOpenBannedPhrases,
      onRegenerate: () => regenerate({ body: getBodyPayload() }),
      onClearChat,
      onWriteToReadme: (writeMode: "write" | "append") => {
        writeToReadmeFetcher.submit(
          { lessonId, content: lastAssistantMessageText, mode: writeMode },
          {
            method: "POST",
            action: "/api/write-readme",
            encType: "application/json",
          }
        );
      },
    }),
    [
      mode,
      model,
      status,
      isCopied,
      messages,
      violations,
      hasExplainerOrProblem,
      isStandalone,
      lastAssistantMessageText,
      writeToReadmeFetcher,
      isDocumentMode,
      document,
      onModeChange,
      onModelChange,
      onGoLive,
      composeFixMessage,
      sendMessage,
      getBodyPayload,
      regenerate,
      onClearChat,
      onOpenBannedPhrases,
      lessonId,
    ]
  );
}
