import { services, type ServiceName } from '../../../packages/shared/src/index.js';
import { ApiError } from './domain.js';
export type Call = <T = any>(
  service: ServiceName,
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;
export function serviceUrl(name: ServiceName) {
  return process.env.LOCAL_SERVICES === 'true'
    ? `http://127.0.0.1:${4100 + services.indexOf(name)}`
    : `http://${name}:4000`;
}
export function createClient(token: string): Call {
  return async <T>(
    service: ServiceName,
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(serviceUrl(service) + path, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          'x-internal-token': token,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ApiError(503, `${service} is unavailable; please try again`);
    }
    const result = (await response.json()) as any;
    if (!response.ok)
      throw new ApiError(response.status, result.message ?? `${service} request failed`);
    return result as T;
  };
}
