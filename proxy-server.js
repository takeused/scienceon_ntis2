/**
 * ScienceON + NTIS 로컬 프록시 서버
 * 포트: 3737
 * 실행: node proxy-server.js
 */
const http  = require('http');
const https = require('https');
const crypto = require('crypto');
const url   = require('url');

const PORT      = 3737;
const API_HOST  = 'apigateway.kisti.re.kr';
const NTIS_HOST = 'www.ntis.go.kr';
const FIXED_IV  = 'jvHJ1EFA0IXBrxxz';

// ── 암호화 유틸 ──────────────────────────────────────────────
function aesEncryptOfficial(plaintext, keyStr) {
  const key    = Buffer.from(keyStr, 'utf8');
  const iv     = Buffer.from(FIXED_IV, 'utf8');
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return enc.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

function nowDatetime14() {
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

// ── HTTPS 요청 헬퍼 ─────────────────────────────────────────
function httpsGet(hostname, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, path, method: 'GET',
      headers: { 'User-Agent': 'ScienceON-LocalProxy/1.0', Accept: '*/*', ...headers },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf-8'),
        headers: res.headers,
      }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

// ── CORS 헤더 ───────────────────────────────────────────────
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,Authorization,Accept,Origin');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

function sendJSON(res, status, obj) {
  setCORS(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function sendRaw(res, status, body, contentType) {
  setCORS(res);
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

// ── 메인 서버 ───────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const q        = parsed.query;

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    setCORS(res);
    res.writeHead(204);
    res.end();
    return;
  }

  console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`);

  try {
    // ── /health
    if (pathname === '/health') {
      return sendJSON(res, 200, { status: 'ok', service: 'ScienceON Local Proxy', port: PORT });
    }

    // ── /myip
    if (pathname === '/myip') {
      const r = await httpsGet('api.ipify.org', '/?format=json');
      const ip = JSON.parse(r.body).ip;
      return sendJSON(res, 200, { ip, note: '로컬 프록시 발신 IP (내 PC의 공인 IP)' });
    }

    // ── /token
    if (pathname === '/token') {
      const { client_id, api_key, mac_address, accounts } = q;

      if (accounts && client_id) {
        const path = `/tokenrequest.do?accounts=${encodeURIComponent(accounts)}&client_id=${encodeURIComponent(client_id)}`;
        const r    = await httpsGet(API_HOST, path);
        const data = JSON.parse(r.body);
        return sendJSON(res, data.access_token ? 200 : 400, data);
      }

      if (!client_id || !api_key || !mac_address) {
        return sendJSON(res, 400, { error: 'client_id, api_key, mac_address 필요' });
      }

      const datetime  = nowDatetime14();
      const plaintext = JSON.stringify({ mac_address, datetime }).replace(/ /g, '');
      const encrypted = aesEncryptOfficial(plaintext, api_key);
      const path      = `/tokenrequest.do?accounts=${encodeURIComponent(encrypted)}&client_id=${encodeURIComponent(client_id)}`;
      const r         = await httpsGet(API_HOST, path);
      const data      = JSON.parse(r.body);
      return sendJSON(res, data.access_token ? 200 : 400, data);
    }

    // ── /token/refresh
    if (pathname === '/token/refresh') {
      const { client_id, refresh_token } = q;
      if (!client_id || !refresh_token) {
        return sendJSON(res, 400, { error: 'client_id, refresh_token 필요' });
      }
      const path = `/tokenrequest.do?refresh_token=${encodeURIComponent(refresh_token)}&client_id=${encodeURIComponent(client_id)}`;
      const r    = await httpsGet(API_HOST, path);
      return sendJSON(res, r.status, JSON.parse(r.body));
    }

    // ── /api  (ScienceON API Gateway)
    if (pathname === '/api') {
      const qs   = parsed.search || '';
      const path = `/openapicall.do${qs}`;
      const r    = await httpsGet(API_HOST, path);
      const isXml = r.body.trim().startsWith('<');
      return sendRaw(res, r.status, r.body, isXml ? 'application/xml; charset=utf-8' : 'text/plain');
    }

    // ── /ntis  (NTIS API)
    if (pathname === '/ntis') {
      const { apprvKey, collection, SRWR, searchWord, searchFd,
              startPosition, displayCnt, searchRnkn, addQuery, naviCount } = q;

      if (!apprvKey) return sendJSON(res, 400, { error: 'apprvKey 파라미터 필요' });

      const params = new URLSearchParams();
      params.set('apprvKey', apprvKey);
      const keyword = q.query || SRWR || searchWord;
      if (keyword) { params.set('SRWR', keyword); params.set('query', keyword); }
      let finalCollection = collection;
      if (collection === 'prjt')  finalCollection = 'project';
      if (collection === 'equip') finalCollection = 'equipment';
      if (finalCollection) params.set('collection', finalCollection);
      if (searchFd)      params.set('searchFd', searchFd);
      if (startPosition) params.set('startPosition', startPosition);
      if (displayCnt)    params.set('displayCnt', displayCnt);
      if (addQuery)      params.set('addQuery', addQuery);
      params.set('searchRnkn', searchRnkn || 'Y');
      params.set('naviCount',  naviCount  || '5');

      const ntisPath = `/rndopen/openApi/totalRstSearch?${params.toString()}`;
      const r = await httpsGet(NTIS_HOST, ntisPath, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ScienceON-LocalProxy/1.0',
        'Accept': 'application/xml, text/xml, */*',
      });
      const isXml = r.body.trim().startsWith('<');
      return sendRaw(res, r.status, r.body, isXml ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8');
    }

    // ── /ntis/connection
    if (pathname === '/ntis/connection') {
      const { apprvKey, pjtId, collection, topN } = q;
      if (!apprvKey || !pjtId) return sendJSON(res, 400, { error: 'apprvKey, pjtId 필요' });
      const params = new URLSearchParams({ apprvKey, pjtId });
      if (collection) params.set('collection', collection);
      if (topN)       params.set('topN', topN);
      const r = await httpsGet(NTIS_HOST, `/rndopen/openApi/ConnectionContent?${params.toString()}`);
      return sendRaw(res, r.status, r.body, 'application/json; charset=utf-8');
    }

    return sendJSON(res, 404, { error: 'Not found', path: pathname });

  } catch (err) {
    console.error('[ERROR]', err.message);
    return sendJSON(res, 500, { error: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n✅ ScienceON 로컬 프록시 서버 시작`);
  console.log(`   포트: http://127.0.0.1:${PORT}`);
  console.log(`   /health  /token  /api  /ntis  /ntis/connection`);
  console.log(`\n   🔔 NTIS 승인 IP: 1.252.84.41 (정박사님 PC)`);
  console.log(`   브라우저에서 페이지를 새로고침하면 자동으로 로컬 프록시를 사용합니다.\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ 포트 ${PORT}이 이미 사용 중입니다. 기존 프로세스를 종료 후 재실행하세요.\n`);
  } else {
    console.error('[SERVER ERROR]', err);
  }
  process.exit(1);
});
