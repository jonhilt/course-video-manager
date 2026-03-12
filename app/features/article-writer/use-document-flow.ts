import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentAgentMessage } from "./types";
import { loadDocumentFromStorage, saveDocumentToStorage } from "./write-utils";
import { applyEdits, type DocumentEdit } from "./document-editing-engine";

function getAlreadyProcessedToolCallIds(
  messages: DocumentAgentMessage[],
  videoId: string
): Set<string> {
  const existing = loadDocumentFromStorage(videoId);
  if (!existing) return new Set();
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (
        (part.type === "tool-writeDocument" ||
          part.type === "tool-editDocument") &&
        part.state !== "input-streaming"
      ) {
        ids.add(part.toolCallId);
      }
    }
  }
  return ids;
}

/**
 * Manages document state for the article mode document flow.
 * Handles writeDocument tool call interception, live streaming,
 * and localStorage persistence.
 */
export function useDocumentFlow(opts: {
  videoId: string;
  isDocumentMode: boolean;
  messages: DocumentAgentMessage[];
  status: "streaming" | "submitted" | "ready" | "error";
  addToolOutput: (args: {
    tool: "writeDocument" | "editDocument";
    toolCallId: string;
    output: string;
  }) => Promise<void>;
}) {
  const { videoId, isDocumentMode, messages, status, addToolOutput } = opts;

  const [document, setDocument] = useState<string | undefined>(() =>
    loadDocumentFromStorage(videoId)
  );

  // Ref tracks latest document for use in async callbacks (avoids stale closures)
  const documentRef = useRef(document);
  documentRef.current = document;

  const processedToolCallsRef = useRef<Set<string>>(
    // On mount, if a document already exists in storage, mark all existing
    // writeDocument/editDocument tool calls as already processed so they
    // don't re-run and overwrite the (potentially updated) stored document.
    getAlreadyProcessedToolCallIds(messages, videoId)
  );

  // Handle completed writeDocument tool calls
  useEffect(() => {
    if (!isDocumentMode) return;
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (
          part.type === "tool-writeDocument" &&
          part.state !== "input-streaming" &&
          part.input &&
          !processedToolCallsRef.current.has(part.toolCallId)
        ) {
          processedToolCallsRef.current.add(part.toolCallId);
          const content = part.input.content;
          setDocument(content);
          saveDocumentToStorage(videoId, content);
          addToolOutput({
            tool: "writeDocument",
            toolCallId: part.toolCallId,
            output: "Document written successfully.",
          });
        }
      }
    }
  }, [messages, isDocumentMode, videoId, addToolOutput]);

  // Handle completed editDocument tool calls
  useEffect(() => {
    if (!isDocumentMode) return;
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (
          part.type === "tool-editDocument" &&
          part.state !== "input-streaming" &&
          part.input &&
          !processedToolCallsRef.current.has(part.toolCallId)
        ) {
          processedToolCallsRef.current.add(part.toolCallId);
          const edits = part.input.edits as DocumentEdit[];
          const currentDoc = documentRef.current ?? "";
          const result = applyEdits(currentDoc, edits);
          if ("error" in result) {
            addToolOutput({
              tool: "editDocument",
              toolCallId: part.toolCallId,
              output: result.error,
            });
          } else {
            setDocument(result.document);
            saveDocumentToStorage(videoId, result.document);
            addToolOutput({
              tool: "editDocument",
              toolCallId: part.toolCallId,
              output: "Document edited successfully.",
            });
          }
        }
      }
    }
  }, [messages, isDocumentMode, videoId, addToolOutput]);

  // Stream document content live during writeDocument tool call
  useEffect(() => {
    if (!isDocumentMode) return;
    if (status !== "streaming" && status !== "submitted") return;
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (
          part.type === "tool-writeDocument" &&
          part.state === "input-streaming" &&
          part.input?.content
        ) {
          setDocument(part.input.content);
        }
      }
    }
  }, [messages, isDocumentMode, status]);

  const clearDocument = () => {
    setDocument(undefined);
    saveDocumentToStorage(videoId, undefined);
    processedToolCallsRef.current.clear();
  };

  const saveDocument = () => {
    if (document) {
      saveDocumentToStorage(videoId, document);
    }
  };

  const updateDocument = useCallback(
    (content: string) => {
      setDocument(content);
      saveDocumentToStorage(videoId, content);
    },
    [videoId]
  );

  return { document, documentRef, clearDocument, saveDocument, updateDocument };
}
