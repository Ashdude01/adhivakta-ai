export interface SseEvent { event: string; data: any }

/**
 * Reads an `text/event-stream` response body in the browser.
 *
 * `EventSource` cannot POST, and the draft request carries a matter id and a
 * whole document, so the stream is read by hand. Chunks split anywhere, hence
 * the stateful buffer and the streaming TextDecoder.
 */
export async function* readSse(res: Response): AsyncGenerator<SseEvent> {
  if (!res.body) throw new Error('No response body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = boundary(buffer)) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^(\r?\n){2}/, '');

        let event = 'message';
        const dataLines: string[] = [];
        for (const line of raw.split(/\r?\n/)) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        }
        if (!dataLines.length) continue;

        try {
          yield { event, data: JSON.parse(dataLines.join('\n')) };
        } catch {
          // A malformed frame is worth skipping, not worth killing the stream.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function boundary(buffer: string): number {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}
