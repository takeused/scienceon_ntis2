/**
 * ScienceON API 로컬 프록시 서버 v2
 * - CORS 우회
 * - 다양한 AES 암호화 방식 자동 시도
 *
 * 실행: node proxy-server.js
 * 종료: Ctrl+C
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3737;
const API_HOST = 'apigateway.kisti.re.kr';
const NTIS_HOST = 'www.ntis.go.kr';

// ============================================================
// AES-256-CBC 암호화 (공식 스펙)
// IV: 'jvHJ1EFA0IXBrxxz' (고정, UTF-8)
// Key: 인증키 32자 UTF-8
// Datetime: yyyyMMddHHmmss (14자리)
// Base64: URL-safe
// ============================================================
const FIXED_IV = 'jvHJ1EFA0IXBrxxz';

function aesEncryptOfficial(plaintext, keyStr) {
  const key = Buffer.from(keyStr, 'utf8');          // 32 bytes
  const iv  = Buffer.from(FIXED_IV, 'utf8');        // 16 bytes
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  // URL-safe Base64
  return encrypted.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function nowDatetime14() {
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

// ============================================================
// AES 암호화 변형 목록 (진단용 /token/probe 에서만 사용)
// ============================================================
function buildVariants(keyStr, mac) {
  const variants = [];

  const keyUtf8 = Buffer.from(keyStr, 'utf8');
  const keyHex  = Buffer.from(keyStr, 'hex');

  const ivFixed = Buffer.from(FIXED_IV, 'utf8');
  const ivZero  = Buffer.alloc(16, 0);
  const ivKey16 = Buffer.from(keyStr.substring(0, 16), 'utf8');

  // datetime: 두 가지 형식
  const dt14 = nowDatetime14();  // 20260331200637
  const now  = new Date();
  const p    = n => String(n).padStart(2, '0');
  const dtDash = `${now.getFullYear()}-${p(now.getMonth()+1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;

  function enc(algo, key, iv, dt, label) {
    try {
      const plain = JSON.stringify({ mac_address: mac, datetime: dt }).replace(/ /g, '');
      const cipher = crypto.createCipheriv(algo, key, iv);
      const buf = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      // URL-safe
      const b64url = buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
      // standard
      const b64std = buf.toString('base64');
      variants.push({ label: label + ' / url-safe / dt14', encrypted: b64url });
      variants.push({ label: label + ' / std-b64 / dt14',  encrypted: b64std });
    } catch {/* skip invalid */}
  }

  // 공식 스펙 (최우선)
  enc('aes-256-cbc', keyUtf8, ivFixed, dt14,   'AES-256-CBC / UTF8key / fixedIV');
  enc('aes-256-cbc', keyUtf8, ivFixed, dtDash, 'AES-256-CBC / UTF8key / fixedIV / dashDt');

  // 나머지 조합
  enc('aes-256-cbc', keyUtf8, ivZero,  dt14,   'AES-256-CBC / UTF8key / zeroIV');
  enc('aes-256-cbc', keyUtf8, ivKey16, dt14,   'AES-256-CBC / UTF8key / keyIV');
  enc('aes-256-ecb', keyUtf8, Buffer.alloc(0), dt14, 'AES-256-ECB / UTF8key');
  enc('aes-128-cbc', keyHex,  ivFixed, dt14,   'AES-128-CBC / HEXkey / fixedIV');
  enc('aes-128-cbc', keyHex,  ivZero,  dt14,   'AES-128-CBC / HEXkey / zeroIV');

  return variants;
}

// ============================================================
// HTTPS GET 헬퍼
// ============================================================
function httpsGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST,
      path,
      method: 'GET',
      headers: { 'User-Agent': 'ScienceON-Proxy/1.0', Accept: '*/*' },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

// ============================================================
// NTIS HTTPS GET 헬퍼
// ============================================================
function ntisGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: NTIS_HOST,
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ScienceON-Proxy/1.0',
        'Accept': 'application/xml, text/xml, */*',
        'Accept-Encoding': 'identity',
      },
    }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('NTIS timeout')));
    req.end();
  });
}


// ============================================================
// 토큰 1회 요청
// ============================================================
async function tryTokenRequest(clientId, encryptedBase64) {
  const accounts = encodeURIComponent(encryptedBase64);
  const path = `/tokenrequest.do?accounts=${accounts}&client_id=${encodeURIComponent(clientId)}`;
  const result = await httpsGet(path);
  try {
    return JSON.parse(result.body);
  } catch {
    return { raw: result.body, status: result.status };
  }
}

// ============================================================
// CORS 헤더 (모든 요청 무조건 허용 - 2025 최신 보안 대응)
// ============================================================
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,Authorization,Accept,Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24시간 캐시
}

function jsonRes(res, statusCode, obj) {
  setCORS(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj, null, 2));
}

// ============================================================
// 서버
// ============================================================
const server = http.createServer(async (req, res) => {
  setCORS(res);

  if (req.method === 'OPTIONS') {
    setCORS(res);
    res.writeHead(204); // No Content
    res.end();
    return;
  }

  const parsed = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = parsed.pathname;
  const q = Object.fromEntries(parsed.searchParams);

  // ── / — HTML 파일 서빙
  if (pathname === '/') {
    const htmlPath = path.join(__dirname, 'scienceon-search.html');
    try {
      const html = fs.readFileSync(htmlPath, 'utf-8');
      setCORS(res);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(404);
      res.end('scienceon-search.html 파일을 찾을 수 없습니다.');
    }
    return;
  }

  // ── /health
  if (pathname === '/health') {
    return jsonRes(res, 200, {
      status: 'ok',
      service: 'ScienceON + NTIS 로컬 프록시 v3',
      endpoints: {
        '/token': '토큰 발급 (자동 암호화 방식 탐색)',
        '/token/probe': '암호화 방식 전수조사 (디버깅용)',
        '/token/refresh': 'Refresh Token 갱신',
        '/api': 'ScienceON API 프록시',
        '/ntis': 'NTIS 통합검색 API 프록시 (PDF 24 기관용: SRWR 파라미터)',
        '/ntis/connection': 'NTIS AI 연관컨텐츠 조회 (PDF 15: ConnectionContent)',
        '/ntis/related': 'NTIS 연관컨텐츠 조회 프록시 (구버전)',
      },
    });
  }

  // ── /token/probe — 모든 암호화 방식을 순서대로 시도, 성공한 것 반환
  if (pathname === '/token/probe') {
    const { client_id, api_key, mac_address } = q;
    if (!client_id || !api_key || !mac_address) {
      return jsonRes(res, 400, { error: 'client_id, api_key, mac_address 필요' });
    }

    const macVariants = [
      mac_address,                                  // 원본: 9C-6B-00-8C-64-FD
      mac_address.toLowerCase(),                    // 소문자: 9c-6b-00-8c-64-fd
      mac_address.replace(/-/g, ':'),               // 콜론: 9C:6B:00:8C:64:FD
      mac_address.replace(/-/g, ':').toLowerCase(), // 소문자 콜론
      mac_address.replace(/-/g, ''),                // 붙여쓰기: 9C6B008C64FD
      mac_address.replace(/-/g, '').toLowerCase(),  // 소문자 붙여쓰기
    ];

    const results = [];
    let found = null;

    console.log(`[PROBE] 시작 — ${macVariants.length}가지 MAC × 암호화 조합 탐색`);

    for (const mac of macVariants) {
      if (found) break;
      const encVariants = buildVariants(api_key, mac);

      for (const v of encVariants) {
        if (found) break;
        try {
          const data = await tryTokenRequest(client_id, v.encrypted);
          const ok = !!data.access_token;
          const errCode = data.errorCode || '';
          console.log(`  [${ok ? '✓' : errCode}] mac="${mac}" enc="${v.label}"`);
          results.push({ mac, enc: v.label, ok, errorCode: errCode, errorMessage: data.errorMessage });

          if (ok) {
            found = { mac, enc: v.label, data };
          }
          // 짧은 딜레이 (API 과부하 방지)
          await new Promise(r => setTimeout(r, 120));
        } catch (e) {
          results.push({ mac, enc: v.label, ok: false, error: e.message });
        }
      }
    }

    if (found) {
      console.log(`[PROBE] 성공! MAC="${found.mac}", 암호화="${found.enc}"`);
      return jsonRes(res, 200, {
        success: true,
        mac: found.mac,
        enc: found.enc,
        access_token: found.data.access_token,
        access_token_expire: found.data.access_token_expire,
        refresh_token: found.data.refresh_token,
        refresh_token_expire: found.data.refresh_token_expire,
        results,
      });
    }

    console.log('[PROBE] 모든 조합 실패');
    return jsonRes(res, 400, { success: false, message: '모든 조합 실패 — API 포털에서 등록 정보 확인 필요', results });
  }

  // ── /token — 공식 스펙으로 발급
  // AES-256-CBC / UTF-8 key / IV=jvHJ1EFA0IXBrxxz / datetime=yyyyMMddHHmmss / URL-safe Base64
  if (pathname === '/token') {
    const { client_id, api_key, mac_address } = q;
    if (!client_id || !api_key || !mac_address) {
      return jsonRes(res, 400, { error: 'client_id, api_key, mac_address 필요' });
    }
    if (api_key.length !== 32) {
      return jsonRes(res, 400, { error: `api_key는 32자여야 합니다 (현재 ${api_key.length}자)` });
    }

    try {
      const datetime  = nowDatetime14();
      const plaintext = JSON.stringify({ mac_address, datetime }).replace(/ /g, '');
      const encrypted = aesEncryptOfficial(plaintext, api_key);

      console.log(`[TOKEN] datetime=${datetime}, mac=${mac_address}`);

      const data = await tryTokenRequest(client_id, encrypted);
      console.log(`[TOKEN] ${data.access_token ? '✓ 성공' : `✗ E${data.errorCode || '??'}: ${data.errorMessage}`}`);
      return jsonRes(res, data.access_token ? 200 : 400, data);
    } catch (e) {
      return jsonRes(res, 500, { error: e.message });
    }
  }

  // ── /token/refresh
  if (pathname === '/token/refresh') {
    const { client_id, refresh_token } = q;
    if (!client_id || !refresh_token) {
      return jsonRes(res, 400, { error: 'client_id, refresh_token 필요' });
    }
    try {
      const path = `/tokenrequest.do?refresh_token=${encodeURIComponent(refresh_token)}&client_id=${encodeURIComponent(client_id)}`;
      const result = await httpsGet(path);
      const data = JSON.parse(result.body);
      console.log(`[REFRESH] ${data.access_token ? '성공' : '실패'}`);
      return jsonRes(res, result.status, data);
    } catch (e) {
      return jsonRes(res, 500, { error: e.message });
    }
  }

  // ── /api — ScienceON API 프록시
  if (pathname === '/api') {
    const queryStr = parsed.search ? parsed.search.slice(1) : '';
    const apiPath = `/openapicall.do${queryStr ? '?' + queryStr : ''}`;
    try {
      const result = await httpsGet(apiPath);
      const isXml = result.body.trim().startsWith('<?xml') || result.body.trim().startsWith('<');

      // [DEBUG] ScienceON API 응답 확인
      console.log(`\n${'='.repeat(60)}`);
      console.log(`[SC-API] HTTP ${result.status}`);
      if (result.body.length < 3000) {
        console.log('[SC-API-BODY]', result.body);
      } else {
        console.log('[SC-API-BODY]', result.body.substring(0, 1000) + '\n... (truncated)');
      }
      console.log('='.repeat(60) + '\n');

      setCORS(res);
      res.writeHead(result.status, {
        'Content-Type': isXml ? 'application/xml; charset=utf-8' : 'text/plain',
      });
      res.end(result.body);
    } catch (e) {
      return jsonRes(res, 500, { error: e.message });
    }
    return;
  }

  // ── /ntis — NTIS 통합검색 / 과제검색 API 프록시
  // 통합검색: https://www.ntis.go.kr/rndopen/openApi/totalRstSearch
  // 과제검색: https://www.ntis.go.kr/rndopen/openApi/rndTaskSearch
  if (pathname === '/ntis') {
    const { apprvKey, collection, SRWR, searchWord, searchFd, startPosition, displayCnt, searchRnkn, addQuery, boostquery, naviCount } = q;
    
    if (!apprvKey) {
      return jsonRes(res, 400, { error: 'apprvKey 파라미터 필요' });
    }

    const params = new URLSearchParams();
    params.set('apprvKey', apprvKey);

    // PDF 24 표에는 SRWR로 기재되어 있으나 실제 NTIS API HTTP 파라미터명은 'query'
    // curl 테스트 결과: SRWR=나노 → ORIGINALQUERY 비어있음(1.2M건), query=나노 → 정상검색(112K건)
    const keyword = q.query || SRWR || searchWord;
    if (keyword) {
      params.set('query', keyword);
    }
    
    // [LOGIC] 컬렉션 명칭 보정 (NTIS 표준 규격 대응)
    let finalCollection = collection;
    if (collection === 'prjt') finalCollection = 'project';
    if (collection === 'equip') finalCollection = 'equipment';
    
    if (finalCollection) {
      params.set('collection', finalCollection);
    }
    
    if (searchFd)      params.set('searchFd', searchFd);
    if (startPosition) params.set('startPosition', startPosition);
    if (displayCnt)    params.set('displayCnt', displayCnt);
    
    // NTIS 권장/필수 파라미터
    params.set('searchRnkn', searchRnkn || 'Y');
    params.set('naviCount', naviCount || '5');
    
    if (addQuery)      params.set('addQuery', addQuery);
    if (boostquery)    params.set('boostquery', boostquery);
    
    // [LOGIC] 모든 NTIS 검색을 통합검색(totalRstSearch) 엔드포인트로 일원화
    // (rndTaskSearch 접근 시 '잘못된 URL' 오류가 발생하는 경우 고정 엔드포인트 사용)
    let ntisEndpoint = '/rndopen/openApi/totalRstSearch';

    const ntisPath = `${ntisEndpoint}?${params.toString()}`;
    const fullUrl = `https://${NTIS_HOST}${ntisPath}`;
    
    console.log('\n' + '★'.repeat(60));
    console.log('🚀 [NTIS API REQUEST URL]');
    console.log(`🔗 ${fullUrl}`);
    console.log('★'.repeat(60) + '\n');
    
    try {
      const result = await ntisGet(ntisPath);
      const isXml = result.body.trim().startsWith('<?xml') || result.body.trim().startsWith('<');
      
      // [DEBUG] NTIS 응답 원본 확인용 (정박사님 보좌용!)
      console.log(`[NTIS-RAW] Length: ${result.body.length} / isXml: ${isXml}`);
      if (result.body.length < 2000) {
        console.log('[NTIS-BODY]', result.body);
      } else {
        console.log('[NTIS-BODY]', result.body.substring(0, 500) + '... (truncated)');
      }
      
      setCORS(res);
      res.writeHead(result.status, {
        'Content-Type': isXml ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8',
      });
      res.end(result.body);
    } catch (e) {
      console.error('[NTIS ERROR]', e.message);
      return jsonRes(res, 500, { error: e.message });
    }
    return;
  }

  // ── /ntis/connection — NTIS 연관컨텐츠(AI 유사도) 조회 프록시 (PDF 15: ConnectionContent)
  // 엔드포인트: /rndopen/openApi/ConnectionContent
  // 응답: JSON (XML 아님)
  // 파라미터: apprvKey, pjtId, collection(project|paper|patent|researchreport), topN(1-100)
  if (pathname === '/ntis/connection') {
    const { apprvKey, pjtId, collection, topN } = q;
    if (!apprvKey || !pjtId) {
      return jsonRes(res, 400, { error: 'apprvKey, pjtId 파라미터 필요' });
    }
    const params = new URLSearchParams();
    params.set('apprvKey', apprvKey);
    params.set('pjtId', pjtId);
    if (collection) params.set('collection', collection);
    if (topN)       params.set('topN', topN);

    const ntisPath = `/rndopen/openApi/ConnectionContent?${params.toString()}`;
    console.log(`[NTIS-CONN] pjtId=${pjtId} / collection=${collection || 'project'}`);
    try {
      const result = await ntisGet(ntisPath);
      console.log(`[NTIS-CONN] HTTP ${result.status} / length=${result.body.length}`);
      if (result.body.length < 2000) console.log('[NTIS-CONN-BODY]', result.body);
      setCORS(res);
      res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(result.body);
    } catch (e) {
      return jsonRes(res, 500, { error: e.message });
    }
    return;
  }

  // ── /ntis/related — NTIS 연관컨텐츠 조회 프록시
  if (pathname === '/ntis/related') {
    const { apprvKey, serviceKey, cn, collection } = q;
    if (!apprvKey && !serviceKey) {
      return jsonRes(res, 400, { error: 'apprvKey 파라미터 필요' });
    }
    const key = apprvKey || serviceKey;
    const params = new URLSearchParams();
    params.set('apprvKey', key);
    if (cn)         params.set('cn', cn);
    if (collection) params.set('collection', collection);
    // 연관컨텐츠 조회 엔드포인트
    const ntisPath = `/rndopen/openApi/relatedContent?${params.toString()}`;
    console.log(`[NTIS-REL] cn=${cn || ''} / collection=${collection || ''}`);
    try {
      const result = await ntisGet(ntisPath);
      const isXml = result.body.trim().startsWith('<?xml') || result.body.trim().startsWith('<');
      setCORS(res);
      res.writeHead(result.status, {
        'Content-Type': isXml ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8',
      });
      res.end(result.body);
    } catch (e) {
      return jsonRes(res, 500, { error: e.message });
    }
    return;
  }

  jsonRes(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/`;
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ScienceON + NTIS 통합검색 서버 v3');
  console.log(`  ${url}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  종료: Ctrl+C');
  console.log('');
  // 브라우저 자동 실행 (Windows)
  exec(`start ${url}`, (err) => {
    if (err) console.log(`  브라우저 자동 실행 실패: ${err.message}`);
    else console.log('  브라우저를 열었습니다.');
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[오류] 포트 ${PORT} 사용 중. 다른 창을 확인하세요.`);
  } else {
    console.error('[오류]', err.message);
  }
  process.exit(1);
});
