/**
 * ScienceON API 프록시 - Cloudflare Worker
 * 배포: wrangler deploy
 *
 * 지원 엔드포인트:
 *   /api           → apigateway.kisti.re.kr/openapicall.do
 *   /token         → apigateway.kisti.re.kr/tokenrequest.do (토큰 발급)
 *   /token/refresh → apigateway.kisti.re.kr/tokenrequest.do (갱신)
 *   /ntis          → www.ntis.go.kr/rndopen/openApi/totalRstSearch
 *   /ntis/connection → www.ntis.go.kr/rndopen/openApi/ConnectionContent
 *   /health        → 상태 확인
 */

const API_HOST  = 'https://apigateway.kisti.re.kr';
const NTIS_HOST = 'https://www.ntis.go.kr';

// ────────────────────────────────────────────────────
// CORS 헤더
// ────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Origin, X-Requested-With',
  'Access-Control-Max-Age':       '86400',
};

function corsResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, ...extraHeaders },
  });
}

function jsonResponse(obj, status = 200) {
  return corsResponse(JSON.stringify(obj, null, 2), status, {
    'Content-Type': 'application/json; charset=utf-8',
  });
}

// ────────────────────────────────────────────────────
// 업스트림 요청 헬퍼
// ────────────────────────────────────────────────────
async function upstream(url, headers = {}) {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'ScienceON-Worker/1.0',
      Accept: '*/*',
      ...headers,
    },
  });
  const body = await res.text();
  return { status: res.status, body, contentType: res.headers.get('content-type') || '' };
}

// ────────────────────────────────────────────────────
// 메인 핸들러
// ────────────────────────────────────────────────────
export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── /health
    if (url.pathname === '/health') {
      return jsonResponse({
        status: 'ok',
        service: 'ScienceON Cloudflare Worker Proxy v1',
        endpoints: ['/api', '/token', '/token/refresh', '/ntis', '/ntis/connection', '/health'],
        timestamp: new Date().toISOString(),
      });
    }

    // ── /token — 토큰 발급 프록시
    if (url.pathname === '/token') {
      const accounts   = url.searchParams.get('accounts');
      const client_id  = url.searchParams.get('client_id');
      if (!accounts || !client_id) {
        return jsonResponse({ error: 'accounts, client_id 파라미터 필요' }, 400);
      }
      const target = `${API_HOST}/tokenrequest.do?accounts=${encodeURIComponent(accounts)}&client_id=${encodeURIComponent(client_id)}`;
      try {
        const { status, body } = await upstream(target);
        return corsResponse(body, status, { 'Content-Type': 'application/json; charset=utf-8' });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ── /token/refresh
    if (url.pathname === '/token/refresh') {
      const refresh_token = url.searchParams.get('refresh_token');
      const client_id     = url.searchParams.get('client_id');
      if (!refresh_token || !client_id) {
        return jsonResponse({ error: 'refresh_token, client_id 파라미터 필요' }, 400);
      }
      const target = `${API_HOST}/tokenrequest.do?refresh_token=${encodeURIComponent(refresh_token)}&client_id=${encodeURIComponent(client_id)}`;
      try {
        const { status, body } = await upstream(target);
        return corsResponse(body, status, { 'Content-Type': 'application/json; charset=utf-8' });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ── /api — ScienceON openapicall 프록시
    if (url.pathname === '/api') {
      const qs     = url.search ? url.search.slice(1) : '';
      const target = `${API_HOST}/openapicall.do${qs ? '?' + qs : ''}`;
      try {
        const { status, body } = await upstream(target);
        const isXml = body.trimStart().startsWith('<');
        return corsResponse(body, status, {
          'Content-Type': isXml ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8',
        });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ── /ntis — NTIS 통합검색 프록시
    if (url.pathname === '/ntis') {
      const apprvKey = url.searchParams.get('apprvKey');
      if (!apprvKey) return jsonResponse({ error: 'apprvKey 파라미터 필요' }, 400);

      const params = new URLSearchParams();
      params.set('apprvKey', apprvKey);

      const keyword = url.searchParams.get('query') || url.searchParams.get('SRWR') || url.searchParams.get('searchWord');
      if (keyword) params.set('query', keyword);

      // 컬렉션 보정
      let collection = url.searchParams.get('collection') || '';
      if (collection === 'prjt')  collection = 'project';
      if (collection === 'equip') collection = 'equipment';
      if (collection) params.set('collection', collection);

      const searchFd      = url.searchParams.get('searchFd');
      const startPosition = url.searchParams.get('startPosition');
      const displayCnt    = url.searchParams.get('displayCnt');
      const addQuery      = url.searchParams.get('addQuery');
      const boostquery    = url.searchParams.get('boostquery');
      const naviCount     = url.searchParams.get('naviCount');
      const searchRnkn    = url.searchParams.get('searchRnkn');

      if (searchFd)      params.set('searchFd', searchFd);
      if (startPosition) params.set('startPosition', startPosition);
      if (displayCnt)    params.set('displayCnt', displayCnt);
      if (addQuery)      params.set('addQuery', addQuery);
      if (boostquery)    params.set('boostquery', boostquery);
      params.set('searchRnkn', searchRnkn || 'Y');
      params.set('naviCount',  naviCount   || '5');

      const target = `${NTIS_HOST}/rndopen/openApi/totalRstSearch?${params.toString()}`;
      try {
        const { status, body } = await upstream(target, {
          Accept: 'application/xml, text/xml, */*',
        });
        const isXml = body.trimStart().startsWith('<');
        return corsResponse(body, status, {
          'Content-Type': isXml ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8',
        });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ── /ntis/connection — NTIS 연관컨텐츠 프록시
    if (url.pathname === '/ntis/connection') {
      const apprvKey   = url.searchParams.get('apprvKey');
      const pjtId      = url.searchParams.get('pjtId');
      const collection = url.searchParams.get('collection');
      const topN       = url.searchParams.get('topN');

      if (!apprvKey || !pjtId) {
        return jsonResponse({ error: 'apprvKey, pjtId 파라미터 필요' }, 400);
      }
      const params = new URLSearchParams({ apprvKey, pjtId });
      if (collection) params.set('collection', collection);
      if (topN)       params.set('topN', topN);

      const target = `${NTIS_HOST}/rndopen/openApi/ConnectionContent?${params.toString()}`;
      try {
        const { status, body } = await upstream(target);
        return corsResponse(body, status, { 'Content-Type': 'application/json; charset=utf-8' });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // 404
    return jsonResponse({ error: 'Not Found', path: url.pathname }, 404);
  },
};

// Trigger GitHub Action Deployment
