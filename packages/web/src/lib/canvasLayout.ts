// Single source of truth for where the broker node sits, so anything that
// needs to spawn near it (new publishers/consumers, the discard sink) stays
// anchored to the same point instead of drifting apart via independent
// magic numbers - which is exactly how they drifted apart before.
//
// Chosen so its CENTER (position + half its own 64px size) lands exactly on
// a multiple of 120 - the background ruler grid's own gap (see Canvas.tsx's
// `Background` with `variant={Lines}`). A node whose center is an exact
// multiple of the gap always renders sitting on a grid intersection, at any
// zoom/pan, not just incidentally close at one particular zoom level.
export const BROKER_POSITION = { x: 328, y: 328 }; // center (360, 360) = grid gap x (3, 3)
