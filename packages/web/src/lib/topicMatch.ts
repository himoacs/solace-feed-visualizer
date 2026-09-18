// Solace topic wildcard matching: `*` matches exactly one topic level, `>`
// matches that level and everything after it (must be the final level in the
// subscription). Used client-side to decide, per published message, whether
// any currently-live subscription would actually receive it - see
// CanvasContext.tsx's discard/queue-arrival detection.

export function topicMatch(subscription: string, topic: string): boolean {
  const subParts = subscription.split('/');
  const topicParts = topic.split('/');

  for (let i = 0; i < subParts.length; i++) {
    const subPart = subParts[i];

    if (subPart === '>') {
      // Matches this level and everything after - only valid as the last
      // subscription segment, and requires at least one topic level here.
      return i < topicParts.length;
    }

    if (i >= topicParts.length) return false;

    if (subPart === '*') continue;
    if (subPart !== topicParts[i]) return false;
  }

  // No trailing '>' - the topic must have exactly as many levels as the subscription.
  return subParts.length === topicParts.length;
}

export function anySubscriptionMatches(subscriptions: string[], topic: string): boolean {
  return subscriptions.some((s) => topicMatch(s, topic));
}
