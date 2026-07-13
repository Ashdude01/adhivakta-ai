/**
 * Reads an SSE body and yields the payload of each `data:` line.
 *
 * Chunk boundaries land anywhere — mid-event, mid-UTF-8 — so both the decoder
 * and the buffer have to be stateful. Yielding a half-parsed JSON object is the
 * classic bug here, and it looks like a flaky model rather than a framing bug.
 */
export async function* sseChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line; a single event may carry several
      // `data:` lines which the spec says to join with newlines.
      let sep: number;
      while ((sep = indexOfEventBoundary(buffer)) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^(\r?\n){2}/, '');

        const data = rawEvent
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');

        if (data) yield data;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function indexOfEventBoundary(buffer: string): number {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}
