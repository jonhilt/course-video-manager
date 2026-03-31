export interface SSEBlogParams {
  videoId: string;
  title: string;
  body: string;
  description: string;
  slug: string;
}

export interface SSEBlogCallbacks {
  onProgress: (percentage: number) => void;
  onComplete: (slug: string) => void;
  onError: (message: string) => void;
}

/**
 * Initiates an SSE connection to the blog post endpoint and parses the event stream.
 * Returns an AbortController that can be used to cancel the connection.
 */
export const startSSEBlogPost = (
  params: SSEBlogParams,
  callbacks: SSEBlogCallbacks
): AbortController => {
  const abortController = new AbortController();

  performSSEBlogPost(params, callbacks, abortController.signal).catch(
    (error) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      callbacks.onError(
        error instanceof Error ? error.message : "Blog post failed"
      );
    }
  );

  return abortController;
};

const performSSEBlogPost = async (
  params: SSEBlogParams,
  callbacks: SSEBlogCallbacks,
  signal: AbortSignal
): Promise<void> => {
  const response = await fetch(`/api/videos/${params.videoId}/post-blog`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: params.title,
      body: params.body,
      description: params.description,
      slug: params.slug,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    callbacks.onError("Failed to start blog post");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    let eventType = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7);
      } else if (line.startsWith("data: ") && eventType) {
        const eventData = JSON.parse(line.slice(6));
        if (eventType === "progress") {
          callbacks.onProgress(eventData.percentage);
        } else if (eventType === "complete") {
          callbacks.onComplete(eventData.slug);
        } else if (eventType === "error") {
          callbacks.onError(eventData.message);
        }
        eventType = "";
      }
    }
  }
};
