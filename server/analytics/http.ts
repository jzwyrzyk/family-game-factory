import type {IncomingMessage, ServerResponse} from 'node:http';
import {ANALYTICS_NOTICE_VERSION} from '../../src/analytics/contract';
import type {Repository} from '../pipeline/types';
import {verifySession} from '../pipeline/auth';
import {cookieValue, verifyBrowserSession} from '../trusted-devices';
import {adultAnalyticsChoice, analyticsStatus, revokeAnalyticsChoice, submitAnalyticsChoice} from './consent';
import {ProductAnalytics} from './service';

export function analyticsHandler(service: ProductAnalytics, repo: Repository, config: {appOrigin: string; familyId: string; sessionKey: string}) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'Access-Control-Allow-Origin': config.appOrigin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin'};
    const reply = (status: number, value: unknown) => { response.writeHead(status, headers); response.end(JSON.stringify(value)); };
    const body = async () => {
      if (request.headers['x-factory-request'] !== '1' || request.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw Error('FORBIDDEN');
      let raw = '';
      for await (const piece of request) { raw += piece; if (Buffer.byteLength(raw) > 24000) throw Error('INVALID_ANALYTICS_EVENT'); }
      try { return JSON.parse(raw || '{}') as unknown; } catch { throw Error('INVALID_ANALYTICS_EVENT'); }
    };
    try {
      if (request.headers.origin && request.headers.origin !== config.appOrigin) throw Error('FORBIDDEN');
      if (request.method !== 'GET' && request.headers.origin !== config.appOrigin) throw Error('FORBIDDEN');
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {...headers, 'Access-Control-Allow-Headers': 'Content-Type,X-Factory-Request,X-Factory-Adult-Session', 'Access-Control-Allow-Methods': 'GET,POST'}); response.end(); return;
      }
      const path = new URL(request.url || '/', 'https://internal.invalid').pathname;
      const session = await verifyBrowserSession(repo, request.headers.cookie, config.sessionKey, Date.now(), request.headers['x-factory-adult-session']);
      if (session.familyId !== config.familyId || !session.deviceId) throw Error('UNAUTHENTICATED');
      if (path === '/v1/analytics/status' && request.method === 'GET') {
        reply(200, analyticsStatus(await repo.snapshot(), session, service.config.enabled)); return;
      }
      if (path === '/v1/analytics/events' && request.method === 'POST') {
        const accepted = await service.record(session, await body());
        // Request-billed runtimes may suspend CPU after response.end(). This
        // optional collector waits for one bounded drain while its request lives.
        await service.flush();
        reply(202, accepted); return;
      }
      if (path === '/v1/analytics/adult-choice' && request.method === 'POST') {
        reply(200, await adultAnalyticsChoice(repo, session, await body())); return;
      }
      if (path === '/v1/devices/analytics' || path === '/v1/devices/analytics/revoke') {
        const parent = verifySession(cookieValue(request.headers.cookie, 'factory_parent'), config.sessionKey);
        if (parent.role !== 'parent' || parent.familyId !== session.familyId || parent.deviceId !== session.deviceId) throw Error('FORBIDDEN');
        if (path === '/v1/devices/analytics' && request.method === 'GET') {
          // Parent controls inspect family/child permission even while an adult profile is selected.
          const {adultProfileId: _profile, adultSessionId: _grant, ...family} = session;
          reply(200, {...analyticsStatus(await repo.snapshot(), {...family, role: 'designer'}, service.config.enabled),
            noticeVersion: ANALYTICS_NOTICE_VERSION, externalVerificationRequired: true,
            downstreamErasure: 'operator-required'}); return;
        }
        if (path === '/v1/devices/analytics' && request.method === 'POST') {
          reply(200, await submitAnalyticsChoice(repo, parent, await body())); return;
        }
        if (path === '/v1/devices/analytics/revoke' && request.method === 'POST') {
          const input = await body();
          if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw Error('INVALID_ANALYTICS_CHOICE');
          reply(200, await revokeAnalyticsChoice(repo, parent)); return;
        }
      }
      reply(404, {errorCode: 'NOT_FOUND'});
    } catch (error) {
      const code = error instanceof Error ? error.message : 'ANALYTICS_UNAVAILABLE';
      const known = ['UNAUTHENTICATED', 'FORBIDDEN', 'ADULT_PILOT_ACCESS_REQUIRED', 'ANALYTICS_PERMISSION_REQUIRED',
        'PARENT_UNLOCK_REQUIRED', 'INVALID_ANALYTICS_EVENT', 'INVALID_ANALYTICS_CHOICE', 'ANALYTICS_RECORD_LIMIT'];
      const status = code === 'UNAUTHENTICATED' ? 401 : ['FORBIDDEN', 'ADULT_PILOT_ACCESS_REQUIRED', 'ANALYTICS_PERMISSION_REQUIRED', 'PARENT_UNLOCK_REQUIRED'].includes(code) ? 403 :
        code === 'ANALYTICS_RECORD_LIMIT' ? 429 : code.startsWith('INVALID_ANALYTICS_') ? 400 : 503;
      reply(status, {errorCode: known.includes(code) ? code : 'ANALYTICS_UNAVAILABLE'});
    }
  };
}
