/**
 * Tiny SSE hub: clients subscribe with a raw ServerResponse-like stream;
 * `publish` fans an event out to everyone. Kept transport-only so the
 * broadcast wiring is unit-testable without HTTP or chokidar.
 */
export interface SseClient {
  write(chunk: string): void;
}

export interface ContentChangedEvent {
  type: "content:changed";
  collection: string;
  id: string;
  /** fs event kind */
  change: "add" | "change" | "unlink";
}

export class SseHub {
  private readonly clients = new Set<SseClient>();

  subscribe(client: SseClient): () => void {
    this.clients.add(client);
    // initial comment keeps proxies from buffering the idle stream
    client.write(": connected\n\n");
    return () => this.clients.delete(client);
  }

  publish(event: ContentChangedEvent): void {
    const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const c of this.clients) {
      try {
        c.write(frame);
      } catch {
        this.clients.delete(c);
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }
}
