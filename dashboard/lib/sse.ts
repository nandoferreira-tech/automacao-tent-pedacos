type SSEController = ReadableStreamDefaultController<Uint8Array>

class SSEManager {
  private controllers = new Set<SSEController>()
  add(controller: SSEController) { this.controllers.add(controller) }
  remove(controller: SSEController) { this.controllers.delete(controller) }
  broadcast(event: string, data: unknown) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    const encoded = new TextEncoder().encode(msg)
    for (const ctrl of this.controllers) {
      try { ctrl.enqueue(encoded) } catch { this.controllers.delete(ctrl) }
    }
  }
}

export const sseManager = new SSEManager()
