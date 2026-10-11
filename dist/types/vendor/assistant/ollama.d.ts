import type { ChatModel, ToolCall } from './loop.js';
/** Reads a newline-delimited JSON stream of Ollama chat lines into one reply. */
export declare function readChatStream(body: ReadableStream<Uint8Array>, onText: (delta: string) => void, onQueue?: (ahead: number) => void): Promise<{
    content: string;
    tool_calls: ToolCall[];
}>;
/**
 * A chat model behind an HTTP endpoint that takes `{ messages }` and answers with an Ollama chat
 * stream: the API's assistant route in the browser (it adds the model name and the tools).
 */
export declare function streamingChatModel(url: string, init?: Omit<RequestInit, 'body' | 'method' | 'signal'>): ChatModel;
