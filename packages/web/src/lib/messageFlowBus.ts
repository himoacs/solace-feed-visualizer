// Fed by messagingEngine's send/receive callbacks, drained by the canvas
// particle overlay's own rAF loop - deliberately NOT React state, since state
// updates per message would fall over well before real message rates do.

export type FlowEvent =
  | { kind: 'publish'; nodeId: string; topic: string }
  | { kind: 'deliver'; nodeId: string; topic: string }
  /** A published message matched a queue's subscriptions - "arrived at the
   * queue" (spooled), independent of whether/when its consumer drains it.
   * nodeId is the CONSUMER node whose queue this is (anchors to `queue-${nodeId}`). */
  | { kind: 'queue-arrival'; nodeId: string; topic: string }
  /** A published message matched no live subscription anywhere - routes to the DiscardNode. */
  | { kind: 'discarded'; topic: string }
  /** A Persistent-QoS publish was NACKed by the broker (e.g. queue over quota). */
  | { kind: 'nacked'; nodeId: string };

type Listener = (event: FlowEvent) => void;

class MessageFlowBus {
  private listeners = new Set<Listener>();

  emit(event: FlowEvent) {
    this.listeners.forEach((l) => l(event));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const messageFlowBus = new MessageFlowBus();
