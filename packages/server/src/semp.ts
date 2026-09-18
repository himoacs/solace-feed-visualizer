import { Router, type Request, type Response } from 'express';
import type { SempApiType, SempProxyRequest } from '@feed-viz/shared';

const API_TYPE_SEGMENT: Record<SempApiType, string> = {
  config: 'config',
  monitor: 'monitor',
  action: 'action',
};

export class SempError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public sempCode?: number,
    public sempDescription?: string
  ) {
    super(message);
    this.name = 'SempError';
  }
}

/**
 * `path` must be a plain relative SEMP path, never a full URL - the broker
 * host/port always comes from `brokerConn`, not from client-supplied path text,
 * so this proxy can't be redirected at an arbitrary external host.
 */
function assertSafeRelativePath(path: string): void {
  if (!path.startsWith('/') || path.includes('://') || path.includes('..')) {
    throw new SempError('Invalid SEMP path', 400);
  }
}

export async function sempRequest<T>(req: SempProxyRequest): Promise<SempProxyResult<T>> {
  const { brokerConn, path, method = 'GET', apiType = 'config', body } = req;
  assertSafeRelativePath(path);

  const baseUrl = `${brokerConn.protocol}://${brokerConn.host}:${brokerConn.sempPort}/SEMP/v2/${API_TYPE_SEGMENT[apiType]}`;
  const url = `${baseUrl}${path}`;
  const auth = Buffer.from(`${brokerConn.adminUsername}:${brokerConn.adminPassword}`).toString('base64');

  let response: globalThis.Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined && method !== 'GET' ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new SempError(`Could not reach broker at ${brokerConn.host}:${brokerConn.sempPort}`, 502);
  }

  const text = await response.text();
  const json = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    const sempCode = json?.meta?.error?.code;
    const sempDescription = json?.meta?.error?.description;
    throw new SempError(
      sempDescription || `SEMP request failed (${response.status})`,
      response.status,
      sempCode,
      sempDescription
    );
  }

  // A DELETE/action response often carries only `meta`, no `data` key at all -
  // return undefined rather than falling back to the whole envelope (which
  // would otherwise leak `meta` in as if it were the payload).
  return { data: json?.data as T, meta: json?.meta };
}

interface SempProxyResult<T> {
  data: T;
  meta?: unknown;
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function handleSempError(error: unknown, res: Response): void {
  if (error instanceof SempError) {
    res.status(error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502).json({
      error: error.message,
      sempCode: error.sempCode,
      sempDescription: error.sempDescription,
    });
    return;
  }
  console.error('Unexpected SEMP proxy error:', error);
  res.status(500).json({ error: 'Unexpected server error' });
}

export const sempRouter: Router = Router();

// Generic stateless SEMP proxy - the frontend supplies the broker connection
// with every call (no server-side broker store), matching the app's
// single-broker-at-a-time, no-database design.
sempRouter.post('/', async (req: Request<unknown, unknown, SempProxyRequest>, res: Response) => {
  try {
    const { brokerConn, path, method, apiType, body } = req.body;
    if (!brokerConn || !path) {
      res.status(400).json({ error: 'brokerConn and path are required' });
      return;
    }
    const result = await sempRequest({ brokerConn, path, method, apiType, body });
    res.json(result);
  } catch (error) {
    handleSempError(error, res);
  }
});
