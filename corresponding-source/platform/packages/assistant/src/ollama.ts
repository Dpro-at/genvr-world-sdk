import type { ChatMessage, ChatModel, ToolCall } from './loop.js';

/** One line of an Ollama `/api/chat` stream (newline-delimited JSON). */
interface StreamLine {
  message?: { content?: string; tool_calls?: ToolCall[] };
  done?: boolean;
  error?: string;
  /** Added by the API while the request waits for the model (P4-05). */
  queue?: { ahead: number };
}

/** Reads a newline-delimited JSON stream of Ollama chat lines into one reply. */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onText: (delta: string) => void,
  onQueue?: (ahead: number) => void,
): Promise<{ content: string; tool_calls: ToolCall[] }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  const toolCalls: ToolCall[] = [];
  const handle = (line: string) => {
    if (!line.trim()) return;
    const data = JSON.parse(line) as StreamLine;
    if (data.error) throw new Error(data.error);
    if (data.queue) {
      onQueue?.(data.queue.ahead);
      return;
    }
    const delta = data.message?.content ?? '';
    if (delta) {
      content += delta;
      onText(delta);
    }
    if (data.message?.tool_calls) toolCalls.push(...data.message.tool_calls);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      handle(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  handle(buffer + decoder.decode());
  return { content, tool_calls: toolCalls };
}

/**
 * A chat model behind an HTTP endpoint that takes `{ messages }` and answers with an Ollama chat
 * stream: the API's assistant route in the browser (it adds the model name and the tools).
 */
export function streamingChatModel(
  url: string,
  init: Omit<RequestInit, 'body' | 'method' | 'signal'> = {},
): ChatModel {
  return async (messages: ChatMessage[], onText, signal, onQueue) => {
    const response = await fetch(url, {
      ...init,
      method: 'POST',
      headers: { 'content-type': 'application/json', ...init.headers },
      body: JSON.stringify({ messages }),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok || !response.body) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(error?.message ?? `The assistant is not available (${response.status}).`);
    }
    return readChatStream(response.body, onText, onQueue);
  };
}
