const http = require('http');
const https = require('https');
const crypto = require('crypto');

const API_HOST = 'apigateway.kisti.re.kr';
const NTIS_HOST = 'www.ntis.go.kr';
const FIXED_IV = 'jvHJ1EFA0IXBrxxz';

function aesEncryptOfficial(plaintext, keyStr) {
  const key = Buffer.from(keyStr, 'utf8');
  const iv  = Buffer.from(FIXED_IV, 'utf8');
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return encrypted.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

function nowDatetime14() {
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

function httpsGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST,
      path,
      method: 'GET',
      headers: { 'User-Agent': 'ScienceON-VercelProxy/1.0', Accept: '*/*' },
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

function ntisGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: NTIS_HOST,
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ScienceON-VercelProxy/1.0',
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

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,Authorization,Accept,Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function jsonRes(res, statusCode, obj) {
  setCORS(res);
  res.status(statusCode).json(obj);
}

module.exports = async (req, res) => {
  setCORS(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Vercel rewrites에 의해 원본 요청 URL이 req.url에 들어옴.
  // req.query 객체를 바로 활용 가능
  const pathname = req.url.split('?')[0];
  const q = req.query;

  // ── /health
  if (pathname === '/health') {
    return jsonRes(res, 200, {
      status: 'ok',
      service: 'ScienceON + NTIS Vercel Proxy (Seoul Region)',
    });
  }

  // ── /token
  if (pathname === '/token') {
    const { client_id, api_key, mac_address, accounts } = q;
    
    // 워커와 동일하게 accounts 전송 방식 지원
    if (accounts && client_id) {
       try {
         const path = `/tokenrequest.do?accounts=${encodeURIComponent(accounts)}&client_id=${encodeURIComponent(client_id)}`;
         const result = await httpsGet(path);
         const data = JSON.parse(result.body);
         return jsonRes(res, data.access_token ? 200 : 400, data);
       } catch (e) {
         return jsonRes(res, 500, { error: e.message });
       }
    }
    
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
      const data = await tryTokenRequest(client_id, encrypted);
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
      return jsonRes(res, result.status, data);
    } catch (e) {
      return jsonRes(res, 500, { error: e.message });
    }
  }

  // ── /api
  if (pathname === '/api') {
    const queryStr = req.url.split('?')[1] || '';
    const apiPath = `/openapicall.do${queryStr ? '?' + queryStr : ''}`;
    try {
      const result = await httpsGet(apiPath);
      const isXml = result.body.trim().startsWith('<?xml') || result.body.trim().startsWith('<');
      setCORS(res);
      res.setHeader('Content-Type', isXml ? 'application/xml; charset=utf-8' : 'text/plain');
      return res.status(result.status).send(result.body);
    } catch (e) {
      return jsonRes(res, 500, { error: e.message });
    }
  }

  // ── /ntis
  if (pathname === '/ntis') {
    const { apprvKey, collection, SRWR, searchWord, searchFd, startPosition, displayCnt, searchRnkn, addQuery, boostquery, naviCount } = q;
    
    if (!apprvKey) return jsonRes(res, 400, { error: 'apprvKey 파라미터 필요' });

    const params = new URLSearchParams();
    params.set('apprvKey', apprvKey);

    const keyword = q.query || SRWR || searchWord;
    if (keyword) {
      params.set('SRWR', keyword);
      params.set('query', keyword);
    }
    
    let finalCollection = collection;
    if (collection === 'prjt') finalCollection = 'project';
    if (collection === 'equip') finalCollection = 'equipment';
    if (finalCollection) params.set('collection', finalCollection);
    
    if (searchFd)      params.set('searchFd', searchFd);
    if (startPosition) params.set('startPosition', startPosition);
    if (displayCnt)    params.set('displayCnt', displayCnt);
    if (addQuery)      params.set('addQuery', addQuery);
    if (boostquery)    params.set('boostquery', boostquery);
    
    params.set('searchRnkn', searchRnkn || 'Y');
    params.set('naviCount', naviCount || '5');
    
    const ntisPath = `/rndopen/openApi/totalRstSearch?${params.toString()}`;
    
    try {
      const result = await ntisGet(ntisPath);
      const isXml = result.body.trim().startsWith('<?xml') || result.body.trim().startsWith('<');
      setCORS(res);
      res.setHeader('Content-Type', isXml ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8');
      return res.status(result.status).send(result.body);
    } catch (e) {
      return jsonRes(res, 500, { error: e.message });
    }
  }

  // ── /ntis/connection
  if (pathname === '/ntis/connection') {
    const { apprvKey, pjtId, collection, topN } = q;
    if (!apprvKey || !pjtId) return jsonRes(res, 400, { error: 'apprvKey, pjtId 파라미터 필요' });
    const params = new URLSearchParams({ apprvKey, pjtId });
    if (collection) params.set('collection', collection);
    if (topN)       params.set('topN', topN);

    const ntisPath = `/rndopen/openApi/ConnectionContent?${params.toString()}`;
    try {
      const result = await ntisGet(ntisPath);
      setCORS(res);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(result.status).send(result.body);
    } catch (e) {
      return jsonRes(res, 500, { error: e.message });
    }
  }

  return jsonRes(res, 404, { error: 'Not found', path: pathname });
};
