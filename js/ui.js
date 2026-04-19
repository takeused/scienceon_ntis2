
    // ============================================================

    function resetToHome() {
      document.body.classList.remove('search-mode');
      document.getElementById('searchInput').value = '';
      hideAll();
      document.getElementById('emptyState').classList.remove('hidden');
      document.getElementById('resultsHeader').classList.add('hidden');
      document.getElementById('advancedBar').classList.add('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ============================================================

    let _tokenRefreshTimer = null;

    function scheduleTokenRefresh() {
      if (_tokenRefreshTimer) clearTimeout(_tokenRefreshTimer);
      if (!STATE.tokenExpire || !STATE.refreshToken) return;

      // 만료 시각 파싱 ("2026-04-01 22:14:53.213" → Date)
      const expireMs = new Date(STATE.tokenExpire.replace(' ', 'T')).getTime();
      if (isNaN(expireMs)) return;

      const now = Date.now();
      const msUntilExpire = expireMs - now;

      if (msUntilExpire <= 0) {
        // 이미 만료 → 즉시 갱신 시도
        console.log('[TOKEN] 이미 만료됨 → 즉시 갱신 시도');
        if (STATE.refreshToken) refreshAccessToken();
        return;
      }

      // 만료 2분 전에 자동 갱신
      const refreshDelay = Math.max(0, msUntilExpire - 2 * 60 * 1000);
      const minutesLeft = Math.round(msUntilExpire / 60000);
      console.log(`[TOKEN] 자동 갱신 예약: 약 ${minutesLeft}분 후 만료 / ${Math.round(refreshDelay / 60000)}분 후 갱신 실행`);

      _tokenRefreshTimer = setTimeout(async () => {
        if (STATE.refreshToken) {
          console.log('[TOKEN] ⏰ 만료 2분 전 자동 갱신 시작...');
          await refreshAccessToken();
        }
      }, refreshDelay);
    }

    function updateTokenExpireDisplay() {
      if (!STATE.tokenExpire || !STATE.token) return;
      const expireMs = new Date(STATE.tokenExpire.replace(' ', 'T')).getTime();
      if (isNaN(expireMs)) return;
      const msLeft = expireMs - Date.now();
      const text = document.getElementById('statusText');
      if (!text) return;

      if (msLeft <= 0) {
        text.textContent = 'API 토큰 만료됨';
        return;
      }
      const minLeft = Math.round(msLeft / 60000);
      const hrLeft  = Math.floor(minLeft / 60);
      const suffix  = minLeft < 10
        ? ` · ${minLeft}분 후 갱신`
        : hrLeft >= 1
          ? ` · ${hrLeft}h 남음`
          : '';
      if (suffix && !text.textContent.includes('남음') && !text.textContent.includes('갱신')) {
        text.textContent += suffix;
      }
    }


    async function checkProxy() {
      // 1순위: 로컬 프록시
      try {
        const res = await fetch(`${PROXY_BASE}/health`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) { ACTIVE_PROXY = 'local'; updateProxyStatus(); return; }
      } catch { /* 로컬 없음 */ }

      // 2순위: Vercel Serverless (Seoul icn1 고정 리전 — NTIS IP 화이트리스트 등록 가능)
      try {
        const res = await fetch(`${VERCEL_BASE}/health`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) { ACTIVE_PROXY = 'vercel'; updateProxyStatus(); return; }
      } catch { /* Vercel 접근 실패 */ }

      // 3순위: Cloudflare Worker (NTIS IP 차단될 수 있음)
      if (!CF_WORKER_BASE.includes('YOUR_CF_SUBDOMAIN')) {
        try {
          const res = await fetch(`${CF_WORKER_BASE}/health`, { signal: AbortSignal.timeout(4000) });
          if (res.ok) { ACTIVE_PROXY = 'worker'; updateProxyStatus(); return; }
        } catch { /* Worker 접근 실패 */ }
      }

      ACTIVE_PROXY = 'direct';
      updateProxyStatus();
    }

    function getProxyBase() {
      if (ACTIVE_PROXY === 'local')  return PROXY_BASE;
      if (ACTIVE_PROXY === 'vercel') return VERCEL_BASE;
      if (ACTIVE_PROXY === 'worker') return CF_WORKER_BASE;
      return null; // 직접 호출
    }

    function updateProxyStatus() {
      const dot = document.getElementById('statusDot');
      const text = document.getElementById('statusText');
      const bar = document.getElementById('apiStatus');
      const proxyBanner = document.getElementById('proxyOfflineBanner');

      if (STATE.clientId && STATE.token && ACTIVE_PROXY === 'local') {
        dot.className = 'w-1.5 h-1.5 rounded-full bg-green-400';
        text.textContent = 'API + 로컬 프록시 연결됨';
        bar.className = bar.className.replace(/api-status-\w+/g, '').trim() + ' api-status-connected';
        if (proxyBanner) proxyBanner.classList.add('hidden');
      } else if (STATE.clientId && STATE.token && ACTIVE_PROXY === 'vercel') {
        dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
        text.textContent = 'API + Vercel 프록시 연결됨 (Seoul)';
        bar.className = bar.className.replace(/api-status-\w+/g, '').trim() + ' api-status-connected';
        if (proxyBanner) proxyBanner.classList.add('hidden');
      } else if (STATE.clientId && STATE.token && ACTIVE_PROXY === 'worker') {
        dot.className = 'w-1.5 h-1.5 rounded-full bg-blue-400';
        text.textContent = 'API + Worker 프록시 연결됨 ☁️';
        bar.className = bar.className.replace(/api-status-\w+/g, '').trim() + ' api-status-connected';
        if (proxyBanner) proxyBanner.classList.add('hidden');
      } else if (STATE.clientId && STATE.token) {
        dot.className = 'w-1.5 h-1.5 rounded-full bg-yellow-400';
        text.textContent = 'API 설정됨 (프록시 없음)';
        bar.className = bar.className.replace(/api-status-\w+/g, '').trim() + ' api-status-warn';
        if (proxyBanner) proxyBanner.classList.remove('hidden');
      } else {
        dot.className = 'w-1.5 h-1.5 rounded-full bg-gray-600';
        text.textContent = 'API 미설정';
        bar.className = bar.className.replace(/api-status-\w+/g, '').trim() + ' api-status-pill';
        if (proxyBanner) proxyBanner.classList.remove('hidden');
      }
    }

    function getApiBase() {
      const base = getProxyBase();
      return base !== null ? `${base}/api` : API_BASE_DIRECT;
    }


    // ============================================================

    // Settings
    // ============================================================

    function openSettings() {
      document.getElementById('clientIdInput').value = STATE.clientId;
      document.getElementById('tokenInput').value = STATE.token;
      document.getElementById('refreshTokenInput').value = STATE.refreshToken;
      document.getElementById('apiKeyInput').value = STATE.apiKey;
      document.getElementById('macAddrInput').value = STATE.macAddr;
      document.getElementById('ntisKeyInput').value = STATE.ntisKey;
      document.getElementById('cerebrasKeyInput').value = STATE.cerebrasKey;
      document.getElementById('tokenReqResult').classList.add('hidden');
      document.getElementById('settingsModal').classList.remove('hidden');
    }

    function closeSettings() {
      document.getElementById('settingsModal').classList.add('hidden');
    }

    // 입력 즉시 자동 저장 (개별 필드)
    function autoSaveField(lsKey, value, stateKey) {
      STATE[stateKey] = value.trim();
      localStorage.setItem(lsKey, value.trim());
      updateProxyStatus();
    }

    function saveSettings() {
      STATE.clientId = document.getElementById('clientIdInput').value.trim();
      STATE.token = document.getElementById('tokenInput').value.trim();
      STATE.refreshToken = document.getElementById('refreshTokenInput').value.trim();
      STATE.apiKey = document.getElementById('apiKeyInput').value.trim();
      STATE.macAddr = document.getElementById('macAddrInput').value.trim();
      STATE.ntisKey = document.getElementById('ntisKeyInput').value.trim();
      STATE.cerebrasKey = document.getElementById('cerebrasKeyInput').value.trim();

      localStorage.setItem('sc_client_id', STATE.clientId);
      localStorage.setItem('sc_token', STATE.token);
      localStorage.setItem('sc_refresh_token', STATE.refreshToken);
      localStorage.setItem('sc_api_key', STATE.apiKey);
      localStorage.setItem('sc_mac_addr', STATE.macAddr);
      localStorage.setItem('sc_ntis_key', STATE.ntisKey);
      localStorage.setItem('sc_cerebras_key', STATE.cerebrasKey);
      // tokenExpire는 발급 시 자동 저장되므로 여기서는 재스케줄만 수행
      STATE.tokenExpire = localStorage.getItem('sc_token_expire') || STATE.tokenExpire;
      scheduleTokenRefresh();

      updateApiStatus();
      closeSettings();
      showToast('API 설정이 저장되었습니다', 'success');
    }

    function clearSettings() {
      STATE.clientId = '';
      STATE.token = '';
      STATE.refreshToken = '';
      STATE.apiKey = '';
      STATE.macAddr = '';
      STATE.ntisKey = '';
      STATE.cerebrasKey = '';
      ['sc_client_id', 'sc_token', 'sc_refresh_token', 'sc_api_key', 'sc_mac_addr', 'sc_ntis_key', 'sc_cerebras_key'].forEach(k => localStorage.removeItem(k));

      ['clientIdInput', 'tokenInput', 'refreshTokenInput', 'apiKeyInput', 'macAddrInput', 'ntisKeyInput', 'cerebrasKeyInput'].forEach(id => {
        document.getElementById(id).value = '';
      });

      updateApiStatus();
      showToast('API 설정이 초기화되었습니다', 'info');
    }

    // updateApiStatus는 updateProxyStatus로 통합됨
    function updateApiStatus() { updateProxyStatus(); }

    // ============================================================

    // Target Selection
    // ============================================================

    function setDatabase(db) {
      STATE.currentDB = db;
      const btnSci = document.getElementById('btnDbScienceON');
      const btnNtis = document.getElementById('btnDbNTIS');
      const tabsSci = document.getElementById('tabsScienceON');
      const tabsNtis = document.getElementById('tabsNTIS');

      if (db === 'SCIENCEON') {
        btnSci.classList.add('active');
        btnNtis.classList.remove('active');
        tabsSci.classList.remove('hidden');
        tabsNtis.classList.add('hidden');
        
        const defaultSciBtn = tabsSci.querySelector('[data-target="ARTI"]');
        if (defaultSciBtn) setTarget(defaultSciBtn, false);
      } else {
        btnSci.classList.remove('active');
        btnNtis.classList.add('active');
        tabsSci.classList.add('hidden');
        tabsNtis.classList.remove('hidden');
        
        const defaultNtisBtn = tabsNtis.querySelector('[data-target="NTIS_prjt"]');
        if (defaultNtisBtn) setTarget(defaultNtisBtn, false);
      }
      
      // 만약 검색어가 있다면 즉시 재검색하여 결과 업데이트
      const query = document.getElementById('searchInput').value.trim();
      if (query && document.body.classList.contains('search-mode')) {
        STATE.currentPage = 1;
        if (db === 'NTIS') doNTISSearch();
        else doSearch();
      }
      
      document.getElementById('searchInput').focus();
    }

    function setTarget(btn, triggerSearch = true) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.currentTarget = btn.dataset.target;
      const isNTIS = STATE.currentTarget.startsWith('NTIS_');
      updateSearchFieldOptions();

      // If query exists, re-search
      if (triggerSearch && STATE.currentQuery) {
        STATE.currentPage = 1;
        if (isNTIS) {
          doNTISSearch();
        } else {
          doSearch();
        }
      }
    }

    function updateSearchFieldOptions() {
      const sel = document.getElementById('searchField');
      const target = STATE.currentTarget;
      const isNTIS = target.startsWith('NTIS_');

      // NTIS 전용 필터 UI 토글
      document.getElementById('ntisYearFilter').classList.toggle('hidden', !isNTIS);
      document.getElementById('groupingWrapper').classList.toggle('hidden', isNTIS);
      const sortField = document.getElementById('sortField');
      if (sortField) sortField.closest('.flex.items-center.gap-2')?.classList.toggle('hidden', isNTIS);

      let options = [['BI', '전체'], ['TI', '제목/명칭']];

      if (isNTIS) {
        // PDF 24 기관용 통합검색 searchFd 코드
        options = [
          ['BI', '전체'],
          ['TI', '과제명'],
          ['AU', '연구자'],
          ['OG', '수행기관'],
          ['PB', '발주기관'],
          ['KW', '키워드'],
          ['AB', '초록'],
        ];
      } else if (['ARTI', 'REPORT', 'ATT'].includes(target)) {
        options.push(['AU', '저자'], ['AB', '초록'], ['KW', '키워드'], ['PB', '출판사/기관'], ['PY', '발행년도']);
      } else if (target === 'PATENT') {
        options = [
          ['BI', '전체'], ['TI', '발명 명칭'], ['AB', '초록'],
          ['PA', '출원인'], ['IN', '발명자'], ['IC', 'IPC 분류'],
          ['AN', '출원번호'], ['RN', '등록번호'], ['AD', '출원일자'],
        ];
      } else if (target === 'RESEARCHER') {
        options = [['BI', '전체'], ['TI', '연구자명']];
      } else if (target === 'ORGAN') {
        options = [['BI', '전체'], ['TI', '기관명']];
      } else if (target === 'TREND') {
        options = [['BI', '전체'], ['TI', '트렌드명'], ['KW', '키워드']];
      }

      sel.innerHTML = options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    }

    // ============================================================

    // Advanced toggle
    // ============================================================

    function toggleAdvanced() {
      STATE.advancedOpen = !STATE.advancedOpen;
      const bar = document.getElementById('advancedBar');
      const btn = document.getElementById('advancedToggle');
      bar.classList.toggle('hidden', !STATE.advancedOpen);
      btn.classList.toggle('btn-active-accent', STATE.advancedOpen);
    }

    // ============================================================

    async function doSearch(page = 1) {
      const query = document.getElementById('searchInput').value.trim();
      if (!query) {
        showToast('검색어를 입력해주세요', 'warning');
        document.getElementById('searchInput').focus();
        return;
      }
      
      // 검색 모드 도입 (Google 스타일)
      document.body.classList.add('search-mode');

      if (STATE.currentTarget.startsWith('NTIS_')) {
        return doNTISSearch(page);
      }

      if (!STATE.clientId || !STATE.token) {
        if (STATE.clientId && STATE.apiKey && STATE.macAddr && PROXY_AVAILABLE) {
          showToast('토큰을 자동 발급 중입니다. 잠시 후 다시 검색해주세요 ⏳', 'info');
          await autoRequestToken();
          if (STATE.token) {
            // 토큰 발급 성공 시 바로 재검색
          } else {
            return;
          }
        } else if (!STATE.token) {
          showToast('🔑 Access Token이 필요합니다. 우측 상단 "API 설정" → "토큰 발급" 버튼을 눌러주세요', 'warning');
          setTimeout(() => openSettings(), 800);
          return;
        } else {
          showToast('API 설정이 필요합니다. 우측 상단 "API 설정" 버튼을 눌러주세요', 'error');
          return;
        }
      }

      STATE.currentQuery = query;
      STATE.currentPage = page;
      addToHistory(query);
      updateShareUrl(query, STATE.currentTarget);

      const searchField = document.getElementById('searchField').value;
      const sortField = document.getElementById('sortField').value;
      const rowCount = parseInt(document.getElementById('rowCount').value);
      const grouping = document.getElementById('groupingCheck').checked ? 'Y' : '';

      STATE.rowCount = rowCount;

      setLoading(true);
      hideAll();
      document.getElementById('resultsHeader').classList.remove('hidden');
      document.getElementById('advancedBar').classList.toggle('hidden', !STATE.advancedOpen);

      const searchQuery = JSON.stringify({ [searchField]: query });

      const params = new URLSearchParams({
        client_id: STATE.clientId,
        token: STATE.token,
        version: '1.0',
        action: 'search',
        target: STATE.currentTarget,
        searchQuery: searchQuery,
        curPage: page,
        rowCount: rowCount,
      });

      if (sortField) params.append('sortField', sortField);
      if (grouping) params.append('grouping', grouping);

      const url = `${getApiBase()}?${params.toString()}`;

      try {
        const resp = await fetch(url);

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const text = await resp.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');

        // Check for error
        const statusCode = xml.querySelector('statusCode')?.textContent;
        if (statusCode && statusCode !== '200') {
          const errMsg = xml.querySelector('errorMessage')?.textContent || '알 수 없는 오류';
          const errCode = xml.querySelector('errorCode')?.textContent || '';

          // 에러코드별 처리
          switch (errCode) {
            case 'E4103': // Access Token 만료
              if (STATE.refreshToken) {
                await refreshAccessToken();
                doSearch(page);
                return;
              }
              showToast('Access Token이 만료됐습니다. API 설정에서 토큰을 재발급하세요 (E4103)', 'error');
              break;
            case 'E4102':
              showToast('클라이언트 ID가 올바르지 않습니다 (E4102)', 'error');
              break;
            case 'E4301': case 'E4302':
              showToast('이 API에 대한 사용 권한이 없습니다 (E4301/E4302)', 'error');
              break;
            case 'E4002':
              showToast('필수 파라미터가 누락됐습니다 (E4002)', 'error');
              break;
            case 'E4007':
              showToast('검색 필드 값이 올바르지 않습니다 (E4007)', 'error');
              break;
            case 'E4008':
              showToast('콘텐츠 타입(target) 값이 올바르지 않습니다 (E4008)', 'error');
              break;
            case 'E4009':
              showToast('action 값이 올바르지 않습니다 (E4009)', 'error');
              break;
            case 'E4014':
              showToast('include와 exclude는 동시에 사용할 수 없습니다 (E4014)', 'error');
              break;
            case 'E4104':
              showToast('API 신청이 승인 상태가 아닙니다. 포털에서 승인 여부를 확인하세요 (E4104)', 'error');
              break;
            case 'E5001': case 'E5002': case 'E5003':
              showToast('서버 내부 오류입니다. 잠시 후 재시도하세요 (' + errCode + ')', 'error');
              break;
            default:
              showToast(`${errMsg} (${errCode})`, 'error');
          }
          setLoading(false);
          return;
        }

        renderResults(xml, query);
        // 탭별 건수 병렬 조회 (백그라운드)
        fetchTabCounts(query, searchField);

      } catch (err) {
        console.error(err);

        if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
          showCORSGuide(url);
        } else {
          showToast(`요청 실패: ${err.message}`, 'error');
        }

        setLoading(false);
        document.getElementById('emptyState').classList.remove('hidden');
      }
    }

    // 탭별 건수 병렬 조회 후 탭 버튼에 표시
    async function fetchTabCounts(query, searchField = 'BI') {
      const TARGETS = ['ARTI','PATENT','REPORT','ATT','RESEARCHER','ORGAN','TREND'];

      // 타겟별 지원 searchField — 미지원 필드 사용 시 E4007 오류로 0건 반환되는 버그 방지
      const VALID_FIELDS = {
        ARTI:       ['BI','TI','AU','AB','KW','PB','PY'],
        PATENT:     ['BI','TI','AB','PA','IN','IC','AN','RN','AD'],
        REPORT:     ['BI','TI','AU','AB','KW','PB','PY'],
        ATT:        ['BI','TI','AU','AB','KW','PB','PY'],
        RESEARCHER: ['BI','TI'],
        ORGAN:      ['BI','TI'],
        TREND:      ['BI','TI','KW'],
      };

      const base = getApiBase();

      const counts = await Promise.all(TARGETS.map(async target => {
        try {
          // 타겟이 지원하지 않는 searchField는 'BI'(전체)로 폴백
          const effectiveField = (VALID_FIELDS[target] || ['BI']).includes(searchField) ? searchField : 'BI';
          const searchQuery = JSON.stringify({ [effectiveField]: query });

          const params = new URLSearchParams({
            client_id: STATE.clientId, token: STATE.token,
            version: '1.0', action: 'search', target,
            searchQuery, curPage: 1, rowCount: 1,
          });
          const resp = await fetch(`${base}?${params}`);
          const text = await resp.text();
          const xml = new DOMParser().parseFromString(text, 'text/xml');

          // API 오류 응답 체크 (statusCode가 200이 아니면 null 반환 → 탭 레이블 유지)
          const statusCode = xml.querySelector('statusCode')?.textContent?.trim();
          if (statusCode && statusCode !== '200') {
            const errCode = xml.querySelector('errorCode')?.textContent?.trim() || '';
            console.warn(`[tabCount] ${target}: API 오류 — statusCode=${statusCode} errorCode=${errCode}`);
            return null;
          }

          // TotalCount 태그명은 타겟마다 다를 수 있으므로 다양한 케이스 시도
          const findCount = (xml) => {
            const names = ['TotalCount','totalCount','TOTALCOUNT','total_count','TOTALHITS','resultCount','ResultCount'];
            for (const name of names) {
              const el = xml.getElementsByTagName(name)[0];
              if (el) return parseInt(el.textContent) || 0;
            }
            return 0;
          };

          const count = findCount(xml);
          if (count === 0) {
            const rootTag = xml.documentElement?.tagName || 'unknown';
            const firstChild = xml.documentElement?.children[0]?.tagName || 'none';
            console.log(`[tabCount] ${target}: 0건 — root=<${rootTag}> firstChild=<${firstChild}> field=${effectiveField}`);
          }
          return count;
        } catch (e) {
          console.error(`[tabCount] ${target}: 예외`, e);
          return null;
        }
      }));

      // 탭 버튼에 건수 표시
      document.querySelectorAll('#tabsScienceON .tab-btn').forEach(btn => {
        const idx = TARGETS.indexOf(btn.dataset.target);
        if (idx === -1) return;
        const n = counts[idx];
        if (n === null) return;
        const label = btn.dataset.target === 'ARTI' ? '논문'
          : btn.dataset.target === 'PATENT' ? '특허'
          : btn.dataset.target === 'REPORT' ? '보고서'
          : btn.dataset.target === 'ATT' ? '동향'
          : btn.dataset.target === 'RESEARCHER' ? '연구자'
          : btn.dataset.target === 'ORGAN' ? '기관'
          : '트렌드';
        const fmt = n >= 10000 ? `${(n/10000).toFixed(1)}만` : n.toLocaleString();
        btn.textContent = n > 0 ? `${label} (${fmt})` : label;
      });
    }

    // ============================================================

    async function doNTISSearch(page = 1) {
      if (!STATE.ntisKey) {
        showToast('🔑 NTIS 인증키가 필요합니다. 상단 "API 설정"에서 입력해주세요', 'warning');
        setTimeout(() => openSettings(), 800);
        return;
      }

      // 검색 모드 도입 (Google 스타일)
      document.body.classList.add('search-mode');
      
      const query = document.getElementById('searchInput').value.trim();
      STATE.currentQuery = query;
      STATE.currentPage = page;
      addToHistory(query);
      updateShareUrl(query, 'NTIS_prjt');

      const searchField = document.getElementById('searchField').value;
      const rowCount = parseInt(document.getElementById('rowCount').value);
      STATE.rowCount = rowCount;
      
      setLoading(true);
      hideAll();
      document.getElementById('resultsHeader').classList.remove('hidden');
      document.getElementById('advancedBar').classList.toggle('hidden', !STATE.advancedOpen);
      
      const collection = 'project'; // 기관용 통합검색: 과제만 사용

      // PDF 24 기관용 searchFd: 코드값을 그대로 전달 (BI/TI/AU/OG/PB/KW/AB)
      const searchFd = (searchField && searchField !== 'BI') ? searchField : '';

      // 연도 필터 (addQuery=PY=FROM/MORE,TO/UNDER)
      const yearFrom = document.getElementById('ntisYearFrom')?.value?.trim();
      const yearTo   = document.getElementById('ntisYearTo')?.value?.trim();
      let addQuery = '';
      if (yearFrom && yearTo)   addQuery = `PY=${yearFrom}/MORE,${yearTo}/UNDER`;
      else if (yearFrom)        addQuery = `PY=${yearFrom}/MORE`;
      else if (yearTo)          addQuery = `PY=${yearTo}/UNDER`;

      const startPosition = (page - 1) * rowCount + 1;

      const params = new URLSearchParams({
        apprvKey: STATE.ntisKey,
        collection: collection,
        displayCnt: rowCount,
        startPosition: startPosition,
        SRWR: query,       // NTIS 최신 API 검색 파라미터 (PDF 공식 매뉴얼 기준)
        query: query,      // 기존 하위 호환성용 병행 전송
        searchRnkn: 'Y',
        naviCount: 5
      });
      if (searchFd) params.append('searchFd', searchFd);
      if (addQuery)  params.append('addQuery', addQuery);
      
      const proxyBase = getProxyBase();
      if (proxyBase === null) {
        setLoading(false);
        document.getElementById('emptyState').classList.add('hidden');
        // 직접 NTIS URL 생성 (프록시 없이 브라우저에서 열기용)
        const directParams = new URLSearchParams(params);
        const directUrl = `https://www.ntis.go.kr/rndopen/openApi/totalRstSearch?${directParams.toString()}`;
        const grid = document.getElementById('resultsGrid');
        grid.innerHTML = `<div class="p-5 rounded-2xl" style="border:1px solid rgba(251,146,60,0.3);background:rgba(251,146,60,0.05);">
          <p class="text-orange-300 font-semibold mb-2">⚠️ 프록시 서버가 연결되어 있지 않습니다</p>
          <p class="text-gray-400 text-sm mb-3">아래 URL을 새 탭에서 열어 NTIS 응답을 직접 확인하세요.</p>
          <p class="text-xs text-gray-500 mb-1 font-semibold">NTIS 직접 URL:</p>
          <code class="text-xs text-blue-300 break-all block p-2 rounded mb-3" style="background:rgba(0,0,0,0.4);">${escHtml(directUrl)}</code>
          <button onclick="window.open('${escAttr(directUrl)}','_blank')" class="btn-secondary text-xs">새 탭에서 NTIS 직접 호출</button>
          <p class="text-gray-500 text-xs mt-3">로컬 프록시: <code class="text-green-400">node proxy-server.js</code> 실행 후 새로고침</p>
        </div>`;
        return;
      }

      const url = `${proxyBase}/ntis?${params.toString()}`;

      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();

        // [DEBUG] NTIS 응답 저장 (디버그 패널용)
        window._ntisDebug = { url, raw: text };
        console.log('[NTIS-DEBUG] URL:', url);
        console.log('[NTIS-DEBUG] RAW TEXT:', text);

        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');

        // NTIS 오류 응답 파싱: <RESULT><ERROR><CODE>/<MESSAGE> 또는 <returnCode>/<returnMsg>
        const gx = (tag) => xml.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
        const errCode = gx('CODE') || gx('returnCode');
        const errMsg  = gx('MESSAGE') || gx('returnMsg');
        if (errCode && errCode !== '0') {
           const isIpBlock = errMsg.includes('IP');
           showToast(`NTIS 오류 [${errCode}]: ${errMsg}`, 'error');
           document.getElementById('emptyState').classList.add('hidden');
           document.getElementById('resultsGrid').innerHTML = `<div class="p-5 rounded-2xl" style="border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.05);">
             <p class="text-red-400 font-semibold mb-1">NTIS API 오류 [${escHtml(errCode)}]</p>
             <p class="text-gray-300 text-sm mb-3">${escHtml(errMsg)}</p>
             ${isIpBlock ? `<div class="p-3 rounded-lg text-xs space-y-1" style="background:rgba(0,0,0,0.3);">
               <p class="text-yellow-300 font-semibold">IP 차단 해결 방법</p>
               <p class="text-gray-400">Cloudflare Worker IP는 NTIS에 등록되지 않아 차단됩니다.</p>
               <p class="text-green-300 mt-2 font-semibold">→ 로컬 프록시를 사용하세요:</p>
               <code class="text-green-400 block mt-1">node proxy-server.js</code>
               <p class="text-gray-500 mt-1">실행 후 페이지를 새로고침하면 로컬 프록시(127.0.0.1:3737)로 자동 전환됩니다.</p>
             </div>` : ''}
             <p class="text-xs text-gray-600 mt-3 break-all">요청 URL: ${escHtml(url)}</p>
           </div>`;
           setLoading(false);
           return;
        }

        renderNTISResults(xml, query, collection);
      } catch (err) {
        console.error(err);
        if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
          showCORSGuide(url);
        } else {
          showToast(`NTIS 요청 실패: ${err.message}`, 'error');
        }
        setLoading(false);
        document.getElementById('emptyState').classList.remove('hidden');
      }
    }

    // ============================================================

    function encryptNTISAccounts(apiKey, macAddr) {
      if (typeof CryptoJS === 'undefined') return null;

      try {
        // 공식 스펙: AES-256-CBC, UTF-8 key, IV=jvHJ1EFA0IXBrxxz, datetime=yyyyMMddHHmmss, URL-safe Base64
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const datetime = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const accountsJson = JSON.stringify({ mac_address: macAddr, datetime }).replace(/ /g, '');

        const key = CryptoJS.enc.Utf8.parse(apiKey);
        const iv = CryptoJS.enc.Utf8.parse('jvHJ1EFA0IXBrxxz');
        const encrypted = CryptoJS.AES.encrypt(accountsJson, key, {
          iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7,
        });
        
        // URL-safe Base64
        return encrypted.ciphertext.toString(CryptoJS.enc.Base64)
          .replace(/\+/g, '-').replace(/\//g, '_');
      } catch (e) {
        console.error('Encryption failed:', e);
        return null;
      }
    }

    // ============================================================

    async function autoRequestToken() {
      const clientId = STATE.clientId;
      const apiKey = STATE.apiKey;
      const macAddr = STATE.macAddr;

      if (!clientId || !apiKey || !macAddr || !PROXY_AVAILABLE) return;

      try {
        let url;
        if (ACTIVE_PROXY === 'worker') {
          const accounts = encryptNTISAccounts(apiKey, macAddr);
          if (!accounts) return;
          url = `${getProxyBase()}/token?accounts=${encodeURIComponent(accounts)}&client_id=${encodeURIComponent(clientId)}`;
        } else {
          url = `${getProxyBase()}/token?client_id=${encodeURIComponent(clientId)}&api_key=${encodeURIComponent(apiKey)}&mac_address=${encodeURIComponent(macAddr)}`;
        }

        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const data = await resp.json();

        if (data.access_token) {
          STATE.token       = data.access_token;
          STATE.tokenExpire = data.access_token_expire || '';
          if (data.refresh_token) STATE.refreshToken = data.refresh_token;
          localStorage.setItem('sc_token', STATE.token);
          localStorage.setItem('sc_token_expire', STATE.tokenExpire);
          localStorage.setItem('sc_refresh_token', STATE.refreshToken);
          updateProxyStatus();
          scheduleTokenRefresh();   // ⏰ 자동 갱신 예약
          updateTokenExpireDisplay();
          showToast('✅ 토큰 자동 발급 완료! 검색할 수 있습니다', 'success');
        }
      } catch (e) {
        console.warn('자동 토큰 발급 실패:', e.message);
      }
    }

    // ============================================================

    async function requestToken() {
      const clientId = document.getElementById('clientIdInput').value.trim();
      const apiKey = document.getElementById('apiKeyInput').value.trim();
      const macAddr = document.getElementById('macAddrInput').value.trim();
      const resultEl = document.getElementById('tokenReqResult');
      const btn = document.getElementById('tokenReqBtn');

      if (!clientId || !apiKey || !macAddr) {
        resultEl.className = 'token-result-err';
        resultEl.textContent = 'Client ID, 인증키, MAC 주소를 모두 입력해주세요.';
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;"></span> 발급 중...';
      resultEl.className = '';
      resultEl.textContent = '';

      // 프록시 서버 가용 여부 재확인
      await checkProxy();

      try {
        let data;

        if (PROXY_AVAILABLE) {
          // ── 방법 1: 프록시 서버 사용
          let url;
          if (ACTIVE_PROXY === 'worker') {
            // Worker는 암호화된 accounts 파라미터를 기대함
            const accounts = encryptNTISAccounts(apiKey, macAddr);
            if (!accounts) throw new Error('CryptoJS 로드 실패 (암호화 불가)');
            url = `${getProxyBase()}/token?accounts=${encodeURIComponent(accounts)}&client_id=${encodeURIComponent(clientId)}`;
          } else {
            // 로컬 프록시는 raw 파라미터를 받아 직접 암호화함
            url = `${getProxyBase()}/token?client_id=${encodeURIComponent(clientId)}&api_key=${encodeURIComponent(apiKey)}&mac_address=${encodeURIComponent(macAddr)}`;
          }
          const resp = await fetch(url);
          data = await resp.json();
        } else {
          // ── 방법 2: 브라우저에서 직접 시도 (Proxy 없이 KISTI 직접 호출)
          const accounts = encryptNTISAccounts(apiKey, macAddr);
          if (!accounts) {
            resultEl.className = 'token-result-err';
            resultEl.innerHTML = `
          <strong>CryptoJS 로드 실패</strong><br><br>
          해결 방법:<br>
          1. 터미널에서 <code style="background:#1a1a1a;padding:2px 4px;border-radius:3px;">node proxy-server.js</code> 실행 후 재시도<br>
          2. 또는 인터넷 연결 확인 (CryptoJS CDN)
        `;
            btn.disabled = false;
            btn.innerHTML = '<iconify-icon icon="solar:key-square-bold-duotone" width="18"></iconify-icon> Access Token 자동 발급';
            return;
          }

          const tokenUrl = `${TOKEN_URL_DIRECT}?accounts=${encodeURIComponent(accounts)}&client_id=${encodeURIComponent(clientId)}`;
          const resp = await fetch(tokenUrl);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          data = await resp.json();
        }

        if (data.access_token) {
          document.getElementById('tokenInput').value = data.access_token;
          if (data.refresh_token) document.getElementById('refreshTokenInput').value = data.refresh_token;
          // 만료 시각을 localStorage에 선저장 (saveSettings 클릭 전에도 스케줄러가 작동하도록)
          const expire = data.access_token_expire || '';
          localStorage.setItem('sc_token_expire', expire);
          STATE.tokenExpire = expire;
          resultEl.className = 'token-result-ok';
          resultEl.textContent = `✅ 토큰 발급 성공! 만료: ${expire || '2시간 후'} ${ACTIVE_PROXY === 'worker' ? '(Worker 경유)' : ACTIVE_PROXY === 'local' ? '(로컬 프록시 경유)' : '(직접)'}`;
        } else {
          throw new Error(data.error || data.message || JSON.stringify(data));
        }
      } catch (err) {
        resultEl.className = 'token-result-err';
        if (err.name === 'TypeError' && err.message.includes('fetch')) {
          resultEl.innerHTML = `
        연결 오류 — 프록시 서버 또는 API 서버에 접속할 수 없습니다.<br><br>
        <strong>해결:</strong><br>
        - 로컬: <code style="background:#1a1a1a;padding:3px 6px;border-radius:4px;display:inline-block;margin-top:4px;">node proxy-server.js</code> 실행 확인<br>
        - 배포: Cloudflare Worker 설정 및 도메인 연결 확인
      `;
        } else {
          resultEl.textContent = `오류: ${err.message}`;
        }
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<iconify-icon icon="solar:key-square-bold-duotone" width="18"></iconify-icon> Access Token 자동 발급';
      }
    }

    // ============================================================

    async function probeToken() {
      const clientId = document.getElementById('clientIdInput').value.trim();
      const apiKey = document.getElementById('apiKeyInput').value.trim();
      const macAddr = document.getElementById('macAddrInput').value.trim();
      const resultEl = document.getElementById('tokenReqResult');
      const btn = document.getElementById('tokenProbeBtn');

      if (!clientId || !apiKey || !macAddr) {
        resultEl.className = 'token-result-err';
        resultEl.textContent = 'Client ID, 인증키, MAC 주소를 모두 입력해주세요.';
        return;
      }

      await checkProxy();
      if (!PROXY_AVAILABLE) {
        resultEl.className = 'token-result-err';
        resultEl.innerHTML = '프록시 서버가 실행 중이어야 합니다.<br><code style="background:#1a1a1a;padding:2px 5px;border-radius:3px;">node proxy-server.js</code> 실행 후 재시도하세요.';
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<iconify-icon icon="solar:radar-bold-duotone" width="16"></iconify-icon> 탐색 중...';
      resultEl.className = 'token-result-ok';
      resultEl.textContent = '암호화 방식 탐색 중... (MAC 6가지 × 암호화 7가지 = 최대 42회 시도)';

      try {
        const url = `${getProxyBase()}/token/probe?client_id=${encodeURIComponent(clientId)}&api_key=${encodeURIComponent(apiKey)}&mac_address=${encodeURIComponent(macAddr)}`;
        const resp = await fetch(url);
        const data = await resp.json();

        if (data.success) {
          document.getElementById('tokenInput').value = data.access_token;
          if (data.refresh_token) document.getElementById('refreshTokenInput').value = data.refresh_token;
          resultEl.className = 'token-result-ok';
          resultEl.innerHTML = `탐색 성공!<br>MAC 형식: <strong>${escHtml(data.mac)}</strong><br>암호화: <strong>${escHtml(data.enc)}</strong><br>만료: ${escHtml(data.access_token_expire || '2시간 후')}`;
        } else {
          resultEl.className = 'token-result-err';
          resultEl.innerHTML = `모든 조합 실패 (${data.results?.length || 0}가지 시도)<br>API 포털에서 등록 정보를 다시 확인하세요.`;
        }
      } catch (err) {
        resultEl.className = 'token-result-err';
        resultEl.textContent = `오류: ${err.message}`;
      }

      btn.disabled = false;
      btn.innerHTML = '<iconify-icon icon="solar:radar-bold-duotone" width="16"></iconify-icon> 자동 탐색';
    }

    // ============================================================


    // ── Stage 1: ScienceON에서 실제 논문·특허 컨텍스트 수집 ─────────
    async function fetchDomainContext(mainQuery) {
      const fetchTop = async (target, n) => {
        const searchQuery = JSON.stringify({ BI: mainQuery });
        const url = `${getApiBase()}?client_id=${STATE.clientId}&token=${STATE.token}&version=1.0&action=search&target=${target}&searchQuery=${encodeURIComponent(searchQuery)}&rowCount=${n}`;
        try {
          const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
          const text = await resp.text();
          return new DOMParser().parseFromString(text, 'text/xml');
        } catch { return null; }
      };

      const [artiXml, patentXml] = await Promise.all([
        fetchTop('ARTI', 5),
        fetchTop('PATENT', 5),
      ]);

      const extractItems = (xml) => {
        if (!xml) return [];
        return Array.from(xml.querySelectorAll('recordList record, record')).slice(0, 5);
      };

      const paperSummaries = extractItems(artiXml).map(item => {
        const title   = getVal(item, 'Title') || '';
        const authors = (getVal(item, 'Author') || '').split(/[;,|]/)[0].trim();
        const year    = (getVal(item, 'Pubyear', 'PublDate') || '').substring(0, 4);
        return `"${title}"${authors ? ' — ' + authors : ''}${year ? ' (' + year + ')' : ''}`;
      }).filter(Boolean);

      const patentSummaries = extractItems(patentXml).map(item => {
        const title     = getVal(item, 'Title') || '';
        const applicant = (getVal(item, 'Publisher', 'Applicants') || '').split(/[;|,]/)[0].trim();
        const ipc       = getVal(item, 'IPC') || '';
        const year      = (getVal(item, 'Pubyear', 'ApplDate') || '').substring(0, 4);
        return `"${title}"${applicant ? ' — ' + applicant : ''}${ipc ? ' [' + ipc.split(/[,;]/)[0].trim() + ']' : ''}${year ? ' (' + year + ')' : ''}`;
      }).filter(Boolean);

      return { paperSummaries, patentSummaries };
    }

    // ── Stage 2: 실데이터 기반 구조화 추론 → 후보 5개 생성 ──────────
    async function fetchSubKeywords(mainQuery, domainContext) {
      if (!STATE.cerebrasKey) throw new Error('CEREBRAS_KEY_MISSING');

      const { paperSummaries, patentSummaries } = domainContext;

      const paperBlock  = paperSummaries.length
        ? paperSummaries.map((p, i) => `${i+1}. ${p}`).join('\n')
        : '(No paper data available — infer from domain knowledge)';

      const patentBlock = patentSummaries.length
        ? patentSummaries.map((p, i) => `${i+1}. ${p}`).join('\n')
        : '(No patent data available — this may indicate a near-complete white space)';

      const systemPrompt = `You are a technology commercialization (기술사업화) strategist and patent analyst.
You specialize in identifying "white space" sub-domains: areas with strong academic research but minimal patent coverage — prime opportunities for IP creation and commercialization.
You ALWAYS respond with valid JSON only. No markdown, no explanation outside the JSON.`;

      const userPrompt = `Analyze the following real data for the main research keyword: "${mainQuery}"

=== ACTUAL TOP PAPERS (from ScienceON database) ===
${paperBlock}

=== ACTUAL TOP PATENTS (from ScienceON database) ===
${patentBlock}

Perform this 3-step analysis:

STEP 1 — Identify 5 core research themes from the papers above. For each theme, determine whether it is COVERED by existing patents or represents a GAP.

STEP 2 — From the GAP themes (or least-covered themes), generate 5 sub-keywords following these rules:
  - "keyword": 2-4 words — specific enough to distinguish sub-domains, used for PAPER search
  - "patent_query": 1-2 core words ONLY — stripped of adjectives/modifiers, used for PATENT database search.
    Patent databases index by technology domain, not full research phrases.
    Example: keyword="urban disaster resilience assessment" → patent_query="disaster resilience"
    Example: keyword="satellite image flood detection" → patent_query="flood detection"
  - Avoid repeating the main keyword verbatim in "keyword"
  - Represent different angles (methodology, application, sector, scale)

STEP 3 — For each candidate, provide:
  - gap_reason: Why this sub-domain likely has few patents (1 sentence)
  - target_market: Who would buy/use this technology (1 sentence)

Respond ONLY with this JSON structure:
{
  "themes": [
    {"theme": "...", "status": "gap|covered", "reason": "..."}
  ],
  "candidates": [
    {"keyword": "...", "patent_query": "...", "gap_reason": "...", "target_market": "..."}
  ]
}`;

      const resp = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${STATE.cerebrasKey}`,
        },
        body: JSON.stringify({
          model: 'llama3.1-8b',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt   },
          ],
          temperature: 0.6,
          max_tokens: 1200,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Cerebras API 오류 (${resp.status})`);
      }

      const data = await resp.json();
      const raw  = (data?.choices?.[0]?.message?.content || '').trim();
      console.log('[Cerebras RAG] raw response:', raw);

      // JSON 추출 (마크다운 코드블록 방어)
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('AI 응답 파싱 실패: ' + raw.substring(0, 120));
      const parsed = JSON.parse(match[0]);

      const themes     = Array.isArray(parsed?.themes)     ? parsed.themes     : [];
      const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
      if (candidates.length < 1) throw new Error('후보 키워드 배열이 비어 있습니다');

      return {
        themes,
        candidates: candidates.slice(0, 5).map(c => ({
          keyword:      (c.keyword     || '').trim(),
          gap_reason:   (c.gap_reason  || '').trim(),
          target_market:(c.target_market || '').trim(),
        })).filter(c => c.keyword),
      };
    }

    // 단계별 진행 상황 UI 헬퍼
    function setAnalysisProgress(steps, activeIdx) {
      const section = document.getElementById('analysisSection');
      const stepsHtml = steps.map((s, i) => {
        const done    = i < activeIdx;
        const active  = i === activeIdx;
        const color   = done ? '#22c55e' : active ? '#7c3aed' : '#d1d5db';
        const bgColor = done ? '#f0fdf4' : active ? '#f5f3ff' : '#f9fafb';
        const icon    = done ? '✓' : active ? '⟳' : String(i + 1);
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:${bgColor};border:1px solid ${color}20;">
          <span style="width:22px;height:22px;border-radius:50%;background:${color};color:white;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;${active ? 'animation:spin 1s linear infinite;' : ''}">${icon}</span>
          <span style="font-size:12px;font-weight:${active ? '600' : '500'};color:${active ? '#4c1d95' : done ? '#166534' : '#9ca3af'};">${s}</span>
        </div>`;
      }).join('');
      section.innerHTML = `
        <div class="analysis-card analysis-loading-pulse">
          <div class="analysis-header flex items-center justify-between">
            <div class="flex items-center gap-2">
              <iconify-icon icon="solar:graph-up-bold-duotone" width="20"></iconify-icon>
              <span class="font-bold">기술사업화 유망 분야 도출 중...</span>
            </div>
            <div class="spinner" style="width:20px;height:20px;border-width:2px;border-top-color:white;"></div>
          </div>
          <div class="analysis-body">
            <div style="display:flex;flex-direction:column;gap:8px;padding:4px 0;">${stepsHtml}</div>
          </div>
        </div>`;
    }

    // 메인 진입점 — 버튼 onclick
    async function runTechCommerceAnalysis() {
      // 검색 모드에서도 현재 쿼리를 STATE에서 폴백
      const mainQuery = document.getElementById('searchInput').value.trim() || STATE.currentQuery || '';
      if (!mainQuery) {
        showToast('분석할 키워드를 입력해주세요', 'warning');
        document.getElementById('searchInput').focus();
        return;
      }

      // Cerebras API 키 확인
      if (!STATE.cerebrasKey) {
        showToast('🤖 Cerebras API 키가 필요합니다. API 설정에서 입력해주세요.', 'warning');
        setTimeout(() => openSettings(), 600);
        return;
      }

      // ScienceON API 토큰 확인
      if (!STATE.clientId || !STATE.token) {
        showToast('🔑 ScienceON API 토큰이 필요합니다. API 설정을 확인해주세요.', 'warning');
        setTimeout(() => openSettings(), 600);
        return;
      }

      document.body.classList.add('search-mode');
      hideAll();

      const analysisSection = document.getElementById('analysisSection');
      analysisSection.classList.remove('hidden');

      const STAGES = [
        'Stage 1 — ScienceON 도메인 컨텍스트 수집 (논문 5 + 특허 5)',
        'Stage 2 — Cerebras AI 구조화 추론 (테마 분석 → 후보 5개 생성)',
        'Stage 3 — 후보 5개 실데이터 검증 (ScienceON 병렬 조회)',
        'Stage 3.5 — 트렌드 성장률 검증 (최근 2년 vs 이전 2년 논문 비교)',
        'Stage 4 — 다중 요소 스코어링 (공백 + 트렌드) → TOP 3 선정',
      ];

      const abort = () => {
        analysisSection.classList.add('hidden');
        document.body.classList.remove('search-mode');
        document.getElementById('emptyState').classList.remove('hidden');
      };

      try {
        // ── Stage 1: ScienceON 컨텍스트 수집 ─────────────────────
        setAnalysisProgress(STAGES, 0);
        const domainContext = await fetchDomainContext(mainQuery);

        // ── Stage 2: AI 구조화 추론 ──────────────────────────────
        setAnalysisProgress(STAGES, 1);
        let aiResult;
        try {
          aiResult = await fetchSubKeywords(mainQuery, domainContext);
        } catch (err) {
          console.error('[Cerebras]', err);
          if (err.message === 'CEREBRAS_KEY_MISSING') {
            showToast('Cerebras API 키를 설정해주세요 (API 설정 → Cerebras API 키)', 'warning');
            openSettings();
          } else {
            showToast('AI 키워드 생성 실패: ' + err.message, 'error');
          }
          abort();
          return;
        }

        const { themes, candidates } = aiResult;

        // ── Stage 3: 후보 실데이터 검증 ──────────────────────────
        setAnalysisProgress(STAGES, 2);
        // 현재 후보 키워드 목록을 UI에 노출
        const candidateChips = candidates.map((c, i) =>
          `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;color:#374151;display:inline-flex;align-items:center;gap:5px;">
            <span style="background:#7c3aed;color:white;width:15px;height:15px;border-radius:50%;font-size:9px;display:flex;align-items:center;justify-content:center;">${i+1}</span>
            ${escHtml(c.keyword)}
          </div>`).join('');
        analysisSection.querySelector('.analysis-body').insertAdjacentHTML('beforeend',
          `<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px;">${candidateChips}</div>`);

        const rawResults = await Promise.all(
          candidates.map(c => fetchKeywordAnalysisData(c.keyword, c.patent_query || null))
        );
        // AI 분석 이유 결합
        rawResults.forEach((r, i) => {
          r.aiReason     = candidates[i]?.gap_reason    || '';
          r.targetMarket = candidates[i]?.target_market || '';
        });

        // ── Stage 3.5: 트렌드 성장률 수집 ───────────────────────
        setAnalysisProgress(STAGES, 3);
        const trendSignals = await fetchTrendSignals(candidates.map(c => c.keyword));

        // ── Stage 4: 스코어링 + 다양성 보정 ─────────────────────
        setAnalysisProgress(STAGES, 4);
        await new Promise(r => setTimeout(r, 300)); // brief visual pause

        const { top3, eliminated } = selectTop3WithDiversity(rawResults, trendSignals);
        renderTechCommerceComparison(mainQuery, themes, top3, eliminated);

      } catch (err) {
        console.error('[TechCommerce]', err);
        showToast('분석 중 오류: ' + err.message, 'error');
        abort();
      }
    }

    // 키워드 1개에 대한 전체 데이터 수집
    async function fetchKeywordAnalysisData(keyword, patentQuery = null) {
      const fetchScienceON = async (target, rowCount = 1, overrideKeyword = null) => {
        const q = overrideKeyword || keyword;
        const searchQuery = JSON.stringify({ BI: q });
        const url = `${getApiBase()}?client_id=${STATE.clientId}&token=${STATE.token}&version=1.0&action=search&target=${target}&searchQuery=${encodeURIComponent(searchQuery)}&rowCount=${rowCount}`;
        const resp = await fetch(url);
        const text = await resp.text();
        return new DOMParser().parseFromString(text, 'text/xml');
      };

      const fetchNTIS = async () => {
        if (!STATE.ntisKey) return null;
        try {
          const url = `${getProxyBase()}/ntis?apprvKey=${STATE.ntisKey}&collection=project&query=${encodeURIComponent(keyword)}&displayCnt=1&startPosition=1`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
          const text = await resp.text();
          return new DOMParser().parseFromString(text, 'text/xml');
        } catch { return null; }
      };

      const getCount = (xml, isNTIS = false) => {
        if (!xml) return 0;
        if (isNTIS) {
          const el = xml.getElementsByTagName('TOTALHITS')[0];
          return el ? parseInt(el.textContent) || 0 : 0;
        }
        const el = xml.querySelector('TotalCount') || xml.querySelector('totalCount');
        return el ? parseInt(el.textContent) || 0 : 0;
      };

      const getTopItems = (xml, n) => {
        if (!xml) return [];
        return Array.from(xml.querySelectorAll('recordList record, record')).slice(0, n);
      };

      // 특허 검색용 쿼리: AI가 제공한 1-2 핵심어 우선, 없으면 원본 keyword
      const pq1 = patentQuery || keyword;

      const [artiXml, patentXml, reportXml, attXml, ntisXml] = await Promise.all([
        fetchScienceON('ARTI', 3),
        fetchScienceON('PATENT', 5, pq1),
        fetchScienceON('REPORT', 1),
        fetchScienceON('ATT', 1),
        fetchNTIS(),
      ]);

      // 특허 0건이면 patent_query의 첫 단어만으로 재시도 (점진적 완화)
      let finalPatentXml = patentXml;
      let usedPatentQuery = pq1;
      if (getCount(patentXml) === 0 && pq1.trim().includes(' ')) {
        const firstWord = pq1.trim().split(/\s+/)[0];
        finalPatentXml = await fetchScienceON('PATENT', 5, firstWord);
        usedPatentQuery = firstWord;
      }

      return {
        keyword,
        patentQuery: usedPatentQuery,
        counts: {
          arti:   getCount(artiXml),
          patent: getCount(finalPatentXml),
          report: getCount(reportXml),
          att:    getCount(attXml),
          ntis:   getCount(ntisXml, true),
        },
        topPapers:  getTopItems(artiXml, 3),
        topPatents: getTopItems(finalPatentXml, 5),
      };
    }

    // ── Stage 4-A: 다중 요소 스코어링 ────────────────────────────
    // baseScore        = log10(papers+1)^1.2 × gapRatio^1.5
    // × ntisMultiplier   (정부 투자 가중: log 스케일)
    // × reportBonus      (R&D 보고서 존재)
    // × trendBonus       (동향 = 0이면 미개척 영역)
    // × growthMultiplier (최근2년 vs 이전2년 논문 성장률)
    // papers < 20 → 데이터 게이트: 0점 처리
    //
    // trendSignal: { growthRate, recent, prev } — fetchTrendSignals() 반환값
    function calcCommerceScore({ arti, patent, ntis, report, att }, trendSignal = null) {
      if (arti < 20) return 0; // 데이터 부족 게이트

      // 기본 공백 점수
      const gapRatio        = Math.max(0, 1 - patent / arti);
      const basePaperScore  = Math.pow(Math.log10(arti + 1), 1.2);
      const baseScore       = basePaperScore * Math.pow(gapRatio, 1.5);

      // 정부 투자 · R&D 보너스
      const ntisMultiplier  = 1 + Math.log10((ntis || 0) + 1) * 0.25;
      const reportBonus     = (report || 0) > 0 ? 1.05 : 1.0;
      const trendBonus      = (att || 0) === 0 ? 1.08 : 1.0;

      // 논문 성장률 배수 (최근2년 vs 이전2년)
      let growthMultiplier = 1.0;
      if (trendSignal) {
        const gr = trendSignal.growthRate;
        growthMultiplier = gr > 50 ? 1.25 : gr > 20 ? 1.15 : gr > 0 ? 1.05 : gr > -20 ? 1.0 : 0.90;
      }

      return baseScore * ntisMultiplier * reportBonus * trendBonus * growthMultiplier * 100;
    }

    // 후보 키워드별 최근 2년(2023-2024) vs 이전 2년(2021-2022) 논문 건수 비교
    async function fetchTrendSignals(keywords) {
      const fetchYearCount = async (kw, year) => {
        const q = JSON.stringify({ BI: kw, PY: String(year) });
        const url = `${getApiBase()}?client_id=${STATE.clientId}&token=${STATE.token}&version=1.0&action=search&target=ARTI&searchQuery=${encodeURIComponent(q)}&rowCount=1`;
        try {
          const resp = await fetch(url);
          const xml  = new DOMParser().parseFromString(await resp.text(), 'text/xml');
          const el   = xml.querySelector('TotalCount') || xml.querySelector('totalCount');
          return parseInt(el?.textContent) || 0;
        } catch { return 0; }
      };

      return Promise.all(keywords.map(async kw => {
        const [y21, y22, y23, y24] = await Promise.all([
          fetchYearCount(kw, 2021), fetchYearCount(kw, 2022),
          fetchYearCount(kw, 2023), fetchYearCount(kw, 2024),
        ]);
        const recent = y23 + y24;
        const prev   = y21 + y22;
        const growthRate = prev > 0
          ? Math.round((recent - prev) / prev * 100)
          : recent > 0 ? 100 : 0;
        return { keyword: kw, recent, prev, growthRate };
      }));
    }

    // ── Stage 4-B: 다양성 보정 + TOP 3 선정 ─────────────────────
    function keywordWordOverlap(kw1, kw2) {
      const stopWords = new Set(['and','or','of','in','for','the','a','an','with','based','using','via','by']);
      const toWords = kw => new Set(
        kw.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w))
      );
      const w1 = toWords(kw1), w2 = toWords(kw2);
      if (w1.size === 0 || w2.size === 0) return 0;
      const intersection = [...w1].filter(w => w2.has(w)).length;
      return intersection / Math.min(w1.size, w2.size);
    }

    function selectTop3WithDiversity(results, trendSignals = []) {
      const sigMap = Object.fromEntries(trendSignals.map(s => [s.keyword, s]));
      results.forEach(r => {
        r.trendSignal = sigMap[r.keyword] || null;
        r.score = calcCommerceScore(r.counts, r.trendSignal);
      });
      const sorted = [...results].sort((a, b) => b.score - a.score);
      const selected  = [];
      const eliminated = [];
      for (const candidate of sorted) {
        if (selected.length >= 3) {
          candidate.eliminatedReason = '점수 하위 (TOP 3 이미 선정됨)';
          eliminated.push(candidate);
          continue;
        }
        if (candidate.counts.arti < 20) {
          candidate.eliminatedReason = `논문 ${candidate.counts.arti}건 — 연구 기반 부족 (최소 20건 필요)`;
          eliminated.push(candidate);
          continue;
        }
        const dupWith = selected.find(s =>
          keywordWordOverlap(s.keyword, candidate.keyword) >= 0.5
        );
        if (dupWith) {
          candidate.eliminatedReason = `"${dupWith.keyword}"와 유사 — 다양성 보정으로 제외`;
          eliminated.push(candidate);
        } else {
          candidate.rank = selected.length + 1;
          selected.push(candidate);
        }
      }
      if (selected.length < 3) {
        const backfill = eliminated
          .filter(r => !r.eliminatedReason.includes('연구 기반 부족'))
          .sort((a, b) => b.score - a.score);
        while (selected.length < 3 && backfill.length > 0) {
          const r = backfill.shift();
          r.rank = selected.length + 1;
          r.eliminatedReason = undefined;
          selected.push(r);
          eliminated.splice(eliminated.indexOf(r), 1);
        }
      }
      return { top3: selected, eliminated };
    }

    // 비교 대시보드 렌더링 (top3 + eliminated + AI 분석 테마)
    function renderTechCommerceComparison(mainQuery, themes, top3, eliminated) {
      const today  = new Date().toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit' });
      const winner = top3[0];

      // ── 상태 레이블 (2D 포지셔닝 매트릭스) ─────────────────────
      // 축1: 논문 절대량 (연구 기반) / 축2: 특허 절대량 (IP 장벽)
      // + 트렌드 성장률을 레이블에 반영
      const getStatus = (arti, patent, trendSignal = null) => {
        if (arti === 0) return { icon: '❓', label: '데이터 없음', color: '#9ca3af', bg: '#f9fafb' };
        const isHighPaper  = arti   >= 200;  // 연구 기반 충분
        const isHighPatent = patent >= 50;   // IP 장벽 존재
        const isGrowing    = (trendSignal?.growthRate ?? 0) > 20;

        // Q1: 논문↑ 특허↓ → 황금 기회 (사업화 공백)
        if (isHighPaper && !isHighPatent) {
          if (isGrowing) return { icon: '🎯', label: '급성장 블루오션', color: '#1d4ed8', bg: '#eff6ff' };
          return               { icon: '💎', label: '황금 기회 (연구↑특허↓)', color: '#1d4ed8', bg: '#dbeafe' };
        }
        // Q2: 논문↓ 특허↓ → 신흥 분야
        if (!isHighPaper && !isHighPatent) {
          if (isGrowing) return { icon: '🌱', label: '신흥 분야 (↑성장중)', color: '#15803d', bg: '#f0fdf4' };
          return               { icon: '🌱', label: '신흥 분야 (early)', color: '#059669', bg: '#dcfce7' };
        }
        // Q3: 논문↑ 특허↑ → 성숙 경쟁
        if (isHighPaper && isHighPatent) {
          const gap = 1 - patent / arti;
          if (gap >= 0.7) return { icon: '📈', label: '성장기 (틈새 가능)', color: '#b45309', bg: '#fefce8' };
          return               { icon: '🔴', label: '경쟁 포화', color: '#dc2626', bg: '#fef2f2' };
        }
        // Q4: 논문↓ 특허↑ → 특허 독점 진입 어려움
        return { icon: '⚠️', label: '특허 독점 (진입 어려움)', color: '#dc2626', bg: '#fef2f2' };
      };

      const rankBadge = r => r === 1 ? '🥇' : r === 2 ? '🥈' : '🥉';

      // ── TOP 3 비교 테이블 행 ─────────────────────────────────────
      const compRows = top3.map(r => {
        const { arti, patent, ntis } = r.counts;
        const gapRatio = arti > 0 ? (1 - patent / arti) * 100 : 0;
        const st = getStatus(arti, patent, r.trendSignal);
        const isWinner = r.rank === 1;

        // 트렌드 셀
        const trendCell = (() => {
          if (!r.trendSignal) return '<span style="color:#9ca3af;font-size:11px;">-</span>';
          const gr = r.trendSignal.growthRate;
          const [color, arrow] = gr > 20  ? ['#15803d', '▲']
                               : gr > 0   ? ['#2563eb', '↑']
                               : gr > -20 ? ['#9ca3af', '→']
                               :            ['#dc2626', '↓'];
          const sign = gr > 0 ? '+' : '';
          return `<span style="color:${color};font-weight:700;font-size:12px;white-space:nowrap;">${arrow} ${sign}${gr}%</span>
                  <br><span style="font-size:9px;color:#9ca3af;">${r.trendSignal.recent}건/2년</span>`;
        })();

        return `
          <tr style="border-bottom:1px solid #f3f4f6;${isWinner ? 'background:#f0fdf4;' : ''}cursor:pointer;transition:background 0.15s;"
              onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='${isWinner ? '#f0fdf4' : 'white'}'"
              onclick="showDetailedReport('${r.keyword.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">  
            <td style="padding:12px 14px;font-weight:700;font-size:16px;text-align:center;">${rankBadge(r.rank)}</td>
            <td style="padding:12px 14px;">
              <p style="font-size:13px;font-weight:${isWinner ? '700' : '600'};color:#111;margin:0 0 2px 0;">${escHtml(r.keyword)}</p>
              ${r.aiReason ? `<p style="font-size:11px;color:#6b7280;margin:0;line-height:1.4;">${escHtml(r.aiReason)}</p>` : ''}
              ${isWinner ? '<span style="font-size:10px;color:#15803d;font-weight:700;background:#dcfce7;padding:1px 6px;border-radius:999px;">★ 최우선 추천</span>' : ''}
            </td>
            <td style="padding:12px 14px;text-align:right;font-weight:700;font-size:14px;color:#1d4ed8;">${arti.toLocaleString()}</td>
            <td style="padding:12px 14px;text-align:right;">
              <span style="font-weight:700;font-size:14px;color:${patent < arti * 0.05 ? '#dc2626' : '#374151'};">${patent.toLocaleString()}</span>
              ${r.patentQuery && r.patentQuery !== r.keyword ? `<br><span style="font-size:9px;color:#9ca3af;">"${escHtml(r.patentQuery)}"</span>` : ''}
            </td>
            <td style="padding:12px 14px;text-align:right;font-weight:800;font-size:16px;color:#1d4ed8;">${gapRatio.toFixed(1)}%</td>
            <td style="padding:12px 14px;text-align:center;line-height:1.4;">${trendCell}</td>
            <td style="padding:12px 14px;text-align:right;font-size:12px;color:#6b7280;">${ntis.toLocaleString()}</td>
            <td style="padding:12px 14px;">
              <span style="background:${st.bg};color:${st.color};font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;white-space:nowrap;">${st.icon} ${st.label}</span>
            </td>
            <td style="padding:12px 14px;text-align:center;font-size:11px;color:#3b82f6;font-weight:600;white-space:nowrap;">상세 →</td>
          </tr>`;
      }).join('');

      // ── AI 테마 분석 섹션 ────────────────────────────────────────
      const themesHtml = themes.length ? `
        <h3 style="font-size:13px;font-weight:700;color:#111;margin:0 0 10px 0;">🧠 AI 도메인 테마 분석 (Step 1 결과)</h3>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:24px;">
          ${themes.map(t => {
            const isGap   = t.status === 'gap';
            const bg      = isGap ? '#f0fdf4' : '#fef2f2';
            const color   = isGap ? '#15803d' : '#dc2626';
            const badge   = isGap ? '🟢 공백' : '🔴 특허 커버됨';
            return `<div style="background:${bg};border-left:3px solid ${color};padding:8px 12px;border-radius:0 6px 6px 0;font-size:11px;">
              <span style="font-weight:700;color:${color};margin-right:8px;">${badge}</span>
              <span style="font-weight:600;color:#111;">${escHtml(t.theme || '')}</span>
              ${t.reason ? `<span style="color:#6b7280;margin-left:6px;">— ${escHtml(t.reason)}</span>` : ''}
            </div>`;
          }).join('')}
        </div>` : '';

      // ── 제외된 후보 섹션 ─────────────────────────────────────────
      const eliminatedHtml = eliminated.length ? `
        <details style="margin-bottom:24px;">
          <summary style="font-size:12px;font-weight:600;color:#9ca3af;cursor:pointer;padding:8px 0;list-style:none;display:flex;align-items:center;gap:6px;">
            <span style="width:16px;height:16px;border-radius:50%;background:#f3f4f6;color:#9ca3af;font-size:9px;display:inline-flex;align-items:center;justify-content:center;">▶</span>
            제외된 후보 ${eliminated.length}건 (투명성 공개)
          </summary>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">
            ${eliminated.map(r => `
              <div style="background:#f9fafb;border:1px solid #e5e7eb;padding:8px 12px;border-radius:6px;display:flex;align-items:center;gap:10px;font-size:11px;">
                <span style="font-weight:600;color:#374151;flex:1;">${escHtml(r.keyword)}</span>
                <span style="color:#6b7280;">논문 ${r.counts.arti.toLocaleString()}건 · 특허 ${r.counts.patent.toLocaleString()}건${r.patentQuery && r.patentQuery !== r.keyword ? ` <span style="font-size:9px;color:#9ca3af;">("${escHtml(r.patentQuery)}")</span>` : ''}</span>
                <span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:999px;font-weight:600;white-space:nowrap;">${escHtml(r.eliminatedReason || '제외')}</span>
              </div>`).join('')}
          </div>
        </details>` : '';

      const section = document.getElementById('analysisSection');
      section.innerHTML = `
        <div id="comparisonDashboard" class="analysis-card fade-up" style="max-width:1000px;margin:0 auto;">
          <div class="analysis-header flex items-center justify-between">
            <div class="flex items-center gap-2">
              <iconify-icon icon="solar:graph-up-bold-duotone" width="20"></iconify-icon>
              <div>
                <p style="font-size:11px;opacity:0.6;margin:0 0 2px 0">기술사업화 유망 분야 도출 — 4-Stage RAG Pipeline</p>
                <p style="font-size:15px;font-weight:700;margin:0">"${escHtml(mainQuery)}" — 세부 키워드 비교 분석</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span style="font-size:11px;opacity:0.5;">${today}</span>
              <button onclick="document.getElementById('analysisSection').classList.add('hidden')" class="text-white/60 hover:text-white transition-colors">
                <iconify-icon icon="solar:close-circle-bold" width="18"></iconify-icon>
              </button>
            </div>
          </div>

          <div class="analysis-body bg-white" style="padding:28px 32px;">

            <!-- 메타 callout -->
            <div style="background:#f5f3ff;border-left:4px solid #7c3aed;padding:10px 14px;border-radius:6px;margin-bottom:24px;font-size:11px;color:#4c1d95;">
              🤖 Cerebras AI (실측 논문·특허 데이터 기반 RAG) &nbsp;|&nbsp; ScienceON + NTIS 실시간 검증 &nbsp;|&nbsp; ${today}
            </div>

            <!-- AI 테마 분석 -->
            ${themesHtml}

            <!-- 🏆 최우선 추천 배너 -->
            <div style="background:linear-gradient(135deg,#111 0%,#1d4ed8 100%);color:white;padding:16px 20px;border-radius:12px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
              <div>
                <p style="font-size:11px;opacity:0.7;margin:0 0 4px 0;">🏆 기술사업화 최우선 추천 키워드</p>
                <p style="font-size:18px;font-weight:800;margin:0;">${escHtml(winner.keyword)}</p>
                <p style="font-size:12px;opacity:0.8;margin:4px 0 0 0;">
                  논문 ${winner.counts.arti.toLocaleString()}건 · 특허 ${winner.counts.patent.toLocaleString()}건 · 공백률 ${winner.counts.arti > 0 ? (100 - winner.counts.patent / winner.counts.arti * 100).toFixed(1) : '0'}%
                  ${winner.targetMarket ? ' · 타깃: ' + winner.targetMarket : ''}
                </p>
              </div>
              <button onclick="showDetailedReport('${winner.keyword.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')"
                style="background:white;color:#111;border:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;">
                📋 상세 분석 리포트 보기
              </button>
            </div>

            <!-- TOP 3 비교 테이블 -->
            <h3 style="font-size:13px;font-weight:700;color:#111;margin:0 0 10px 0;">📊 선정 키워드 3종 비교 (클릭하면 상세 분석)</h3>
            <div style="overflow-x:auto;margin-bottom:16px;">
              <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:12px;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:10px 14px;text-align:center;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb;width:36px;">순위</th>
                    <th style="padding:10px 14px;text-align:left;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb;">키워드 / AI 공백 근거</th>
                    <th style="padding:10px 14px;text-align:right;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb;">논문</th>
                    <th style="padding:10px 14px;text-align:right;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb;">특허</th>
                    <th style="padding:10px 14px;text-align:right;color:#1d4ed8;font-weight:700;border-bottom:1px solid #e5e7eb;">공백률</th>
                    <th style="padding:10px 14px;text-align:center;color:#15803d;font-weight:700;border-bottom:1px solid #e5e7eb;" title="최근 2년(2023-24) vs 이전 2년(2021-22) 논문 성장률">트렌드</th>
                    <th style="padding:10px 14px;text-align:right;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb;">NTIS</th>
                    <th style="padding:10px 14px;text-align:left;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb;">포지션</th>
                    <th style="padding:10px 14px;border-bottom:1px solid #e5e7eb;"></th>
                  </tr>
                </thead>
                <tbody>${compRows}</tbody>
              </table>
            </div>

            <!-- 스코어 공식 -->
            <div style="background:#f9fafb;border:1px solid #e5e7eb;padding:10px 14px;border-radius:6px;margin-bottom:20px;font-size:11px;color:#6b7280;">
              📐 <strong>유망도 점수:</strong> log(논문)^1.2 × 공백률^1.5 × NTIS가중 × R&D보너스 × 미개척보너스 × <span style="color:#15803d;font-weight:700;">성장률배수</span> — 논문 20건 미만은 데이터 게이트 탈락<br>
              <span style="color:#15803d;">▲ 트렌드: 최근2년 vs 이전2년 논문 성장률 (+50%↑ 1.25배 ~ -20%↓ 0.9배)</span>
            </div>

            <!-- 제외된 후보 -->
            ${eliminatedHtml}

            <!-- 상세 분석 영역 -->
            <div id="detailReportArea" style="display:none;"></div>

          </div>
        </div>`;

      // 1위 키워드 상세 리포트 자동 표시
      showDetailedReportInline(winner.keyword, winner.counts, winner.topPapers, winner.topPatents);

      // 캐시
      window._techCommerceCache = {};
      top3.forEach(r => { window._techCommerceCache[r.keyword] = r; });
      eliminated.forEach(r => { window._techCommerceCache[r.keyword] = r; });
    }

    // 비교 테이블에서 키워드 클릭 시 상세 리포트 전환
    function showDetailedReport(keyword) {
      const cached = window._techCommerceCache?.[keyword];
      if (!cached) return;
      showDetailedReportInline(keyword, cached.counts, cached.topPapers, cached.topPatents);
      document.getElementById('detailReportArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function showDetailedReportInline(keyword, counts, topPapers, topPatents) {
      const area = document.getElementById('detailReportArea');
      if (!area) return;
      area.style.display = 'block';
      area.innerHTML = `
        <div style="border-top:2px solid #e5e7eb;padding-top:24px;margin-top:8px;">
          <h3 style="font-size:13px;font-weight:700;color:#111;margin:0 0 16px 0;">📋 "${escHtml(keyword)}" 상세 분석 리포트</h3>
          <div id="detailReportInner"></div>
        </div>`;
      renderWhiteSpaceDashboard(keyword, counts, topPapers, topPatents,
        document.getElementById('detailReportInner'));
    }

    // ============================================================

    // ============================================================

    async function runWhiteSpaceAnalysis() {
      const query = document.getElementById('searchInput').value.trim();
      if (!query) {
        showToast('분석할 키워드를 입력해주세요', 'warning');
        document.getElementById('searchInput').focus();
        return;
      }

      document.body.classList.add('search-mode');
      hideAll();

      const analysisSection = document.getElementById('analysisSection');
      analysisSection.classList.remove('hidden');
      analysisSection.innerHTML = `
        <div class="analysis-card analysis-loading-pulse">
          <div class="analysis-header flex items-center justify-between">
            <div class="flex items-center gap-2">
              <iconify-icon icon="solar:chart-2-bold-duotone" width="20"></iconify-icon>
              <span class="font-bold">기술 공백(White Space) 분석 중...</span>
            </div>
            <div class="spinner" style="width:20px; height:20px; border-width:2px; border-top-color:white;"></div>
          </div>
          <div class="analysis-body">
            <p class="text-gray-500 text-sm mb-4">"${escHtml(query)}" 분야의 논문·특허·보고서·동향·연구자·NTIS 과제를 종합 분석 중입니다.</p>
            <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
              ${['논문', '특허', '보고서', '동향', '연구자', 'NTIS'].map(t => `
                <div class="p-3 rounded-xl bg-gray-50 border border-gray-100 text-center animate-pulse">
                  <p class="text-[10px] text-gray-300 font-bold mb-1">${t}</p>
                  <div class="h-5 w-10 bg-gray-200 rounded mx-auto"></div>
                </div>`).join('')}
            </div>
          </div>
        </div>`;

      try {
        // ScienceON API 호출 (count + top 결과)
        const fetchScienceON = async (target, rowCount = 1) => {
          const searchQuery = JSON.stringify({ BI: query });
          const url = `${getApiBase()}?client_id=${STATE.clientId}&token=${STATE.token}&version=1.0&action=search&target=${target}&searchQuery=${encodeURIComponent(searchQuery)}&rowCount=${rowCount}`;
          const resp = await fetch(url);
          const text = await resp.text();
          return new DOMParser().parseFromString(text, 'text/xml');
        };

        // NTIS API 호출
        const fetchNTIS = async (rowCount = 1) => {
          if (!STATE.ntisKey) return null;
          try {
            const url = `${getProxyBase()}/ntis?apprvKey=${STATE.ntisKey}&collection=project&query=${encodeURIComponent(query)}&displayCnt=${rowCount}&startPosition=1`;
            const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
            const text = await resp.text();
            return new DOMParser().parseFromString(text, 'text/xml');
          } catch { return null; }
        };

        const getCount = (xml, isNTIS = false) => {
          if (!xml) return 0;
          if (isNTIS) {
            const el = xml.getElementsByTagName('TOTALHITS')[0];
            return el ? parseInt(el.textContent) || 0 : 0;
          }
          const el = xml.querySelector('TotalCount') || xml.querySelector('totalCount');
          return el ? parseInt(el.textContent) || 0 : 0;
        };

        // 5개 데이터 타입 병렬 수집 — 논문 TOP 3, 특허 TOP 5 결과도 함께
        const [artiXml, patentXml, reportXml, attXml, ntisXml] = await Promise.all([
          fetchScienceON('ARTI', 3),
          fetchScienceON('PATENT', 5),
          fetchScienceON('REPORT', 1),
          fetchScienceON('ATT', 1),
          fetchNTIS(1),
        ]);

        const counts = {
          arti:   getCount(artiXml),
          patent: getCount(patentXml),
          report: getCount(reportXml),
          att:    getCount(attXml),
          ntis:   getCount(ntisXml, true),
        };

        // TOP 결과 추출 (recordList record 구조)
        const getTopItems = (xml, n = 3) => {
          if (!xml) return [];
          const records = Array.from(xml.querySelectorAll('recordList record, record'));
          return records.slice(0, n);
        };

        renderWhiteSpaceDashboard(query, counts, getTopItems(artiXml, 3), getTopItems(patentXml, 3));

      } catch (err) {
        console.error('[WhiteSpace] 분석 실패:', err);
        showToast('분석 중 오류가 발생했습니다. API 설정을 확인하세요.', 'error');
        analysisSection.classList.add('hidden');
      }
    }

    function renderWhiteSpaceDashboard(query, counts, topPapers, topPatents, targetEl = null) {
      const { arti, patent, report, att, ntis } = counts;
      const today = new Date().toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit' });

      // ── 공백률 계산 ──────────────────────────────────────────────
      const patentRatio = arti > 0 ? (patent / arti * 100) : 0;
      const gapRatio    = 100 - patentRatio;

      // ── 상태 레이블 ──────────────────────────────────────────────
      let statusBg, statusText, statusIcon, finalInsight;
      if (gapRatio >= 99) {
        statusBg = '#eff6ff'; statusText = '초강력 블루오션'; statusIcon = '💎';
        finalInsight = `논문 ${arti.toLocaleString()}건에 특허 겨우 ${patent.toLocaleString()}건(${patentRatio.toFixed(1)}%)! 특허 장벽이 사실상 전무합니다. IP를 선점하는 팀이 이 분야의 표준을 만들 수 있습니다. 지금이 바로 그 타이밍입니다!`;
      } else if (gapRatio >= 95) {
        statusBg = '#f0fdf4'; statusText = '강력한 블루오션'; statusIcon = '🚀';
        finalInsight = `연구 성과는 폭발적이나 IP 전환은 아직 초기 단계입니다. 핵심 원천 기술 특허 출원이 시급합니다.`;
      } else if (gapRatio >= 85) {
        statusBg = '#fefce8'; statusText = '유망 기회 분야'; statusIcon = '🌱';
        finalInsight = `상용화 초기 단계입니다. 차별화된 응용 기술로 틈새 IP를 선점하는 전략이 효과적입니다.`;
      } else if (gapRatio >= 70) {
        statusBg = '#fff7ed'; statusText = '성장/성숙기'; statusIcon = '📈';
        finalInsight = `경쟁이 시작된 분야지만 세부 응용 영역에서 기회가 있습니다. 틈새 특허 전략을 수립하세요.`;
      } else {
        statusBg = '#fef2f2'; statusText = '레드오션'; statusIcon = '🔴';
        finalInsight = `성숙도가 높은 분야입니다. 파괴적 혁신 또는 인접 틈새 시장 공략이 필요합니다.`;
      }

      // ── 비고 텍스트 생성 ─────────────────────────────────────────
      const artiNote = arti > 10000 ? '해외논문 중심, 연구 매우 활발'
                     : arti > 1000  ? '국내외 연구 활발'
                     : arti > 100   ? '연구 진행 중'
                     : arti > 0     ? '초기 연구 단계'
                                    : '데이터 없음';

      // 특허 출원인 TOP 추출
      const patentApplicants = topPatents
        .map(it => (getVal(it, 'Publisher', 'Applicants') || '').split(/[;|,]/)[0].trim())
        .filter(Boolean);
      const uniqueApplicants = [...new Set(patentApplicants)].slice(0, 3);
      const patentNote = patent === 0       ? '특허 전무 — 완벽한 IP 공백'
                       : patent < 10        ? '초기 특허 단계, 선점 기회 존재'
                       : uniqueApplicants.length > 0
                           ? uniqueApplicants.join(', ') + ' 등 중심'
                           : patent < arti / 20 ? 'IP 선점 기회 존재' : '경쟁 특허 다수';

      const reportNote     = report === 0  ? '보고서 없음' : '정부 R&D 보고서';
      const attNote        = att === 0     ? '전무 — 정보 공백 존재' : '동향 정보 존재';
      const ntisNote = ntis === 0 ? 'NTIS 과제 없음 또는 API 미연결'
                     : ntis > 200 ? `정부 투자 매우 활발`
                     : ntis > 50  ? `정부 투자 지속 중`
                                  : `정부 과제 존재`;

      // ── 특허 TOP 행 ───────────────────────────────────────────────
      const patentRows = topPatents.length === 0
        ? `<tr><td colspan="4" style="padding:12px;text-align:center;color:#9ca3af;font-size:11px;">특허 데이터 없음 (API 미연결 또는 결과 없음)</td></tr>`
        : topPatents.map((item, i) => {
            const title     = getVal(item, 'Title') || '(제목 없음)';
            const applicant = (getVal(item, 'Publisher', 'Applicants') || '').split(/[;|,]/)[0].trim();
            const year      = (getVal(item, 'Pubyear', 'ApplDate', 'RegisterDate') || '').substring(0, 4);
            const nation    = getVal(item, 'Nation', 'NationCode') || '';
            const docType   = getVal(item, 'DocType', 'KindCode') || '';
            return `<tr style="border-top:1px solid #f3f4f6;">
              <td style="padding:10px 8px;font-size:11px;font-weight:700;color:#9ca3af;width:24px;vertical-align:top">${i + 1}</td>
              <td style="padding:10px 8px;font-size:12px;color:#1f2937;line-height:1.5;vertical-align:top">${escHtml(title)}</td>
              <td style="padding:10px 8px;font-size:11px;color:#374151;white-space:nowrap;vertical-align:top;font-weight:500">${escHtml(applicant)}</td>
              <td style="padding:10px 8px;font-size:11px;color:#9ca3af;white-space:nowrap;vertical-align:top">${[nation, docType, year].filter(Boolean).join(' · ')}</td>
            </tr>`;
          }).join('');

      // ── 논문 TOP 행 ───────────────────────────────────────────────
      const paperList = topPapers.map((item, i) => {
        const title   = getVal(item, 'Title') || '(제목 없음)';
        const authors = getVal(item, 'Author') || '';
        const year    = (getVal(item, 'Pubyear', 'PublDate') || '').substring(0, 4);
        const journal = getVal(item, 'JournalName') || '';
        const auArr   = authors.split(/[;,|]/).map(a => a.trim()).filter(Boolean);
        const auShort = auArr.length ? auArr[0] + (auArr.length > 1 ? ` 외 ${auArr.length - 1}명` : '') : '';
        const meta    = [auShort, journal, year].filter(Boolean).join(' · ');
        return `<li style="padding:8px 0;border-top:1px solid #f3f4f6;">
          <p style="font-size:12px;font-weight:600;color:#1f2937;line-height:1.5;margin:0 0 3px 0">${escHtml(title)}</p>
          ${meta ? `<p style="font-size:11px;color:#9ca3af;margin:0">${escHtml(meta)}</p>` : ''}
        </li>`;
      }).join('');

      // ── 사업화 시나리오 생성 ──────────────────────────────────────
      // Scenario A: IP 선점 (항상)
      // Scenario B: NTIS 연계 (ntis > 0인 경우 풍부하게)
      // Scenario C: 플랫폼/솔루션 (patent holder 분석 기반)
      const itDominated = uniqueApplicants.some(a =>
        /IBM|Samsung|LG|Qualcomm|Intel|Microsoft|Google|Apple|Huawei|Sony|NEC|Fujitsu|HITACHI/i.test(a));

      const scenarioA = {
        icon: '💡', stars: '★★★★★',
        title: `${escHtml(query)} 핵심 원천 특허 출원`,
        basis: `논문 ${arti.toLocaleString()}건의 연구 성과 기반, 공백률 ${gapRatio.toFixed(1)}%`,
        target: '대학·출연연 연구팀, 기술사업화 전담 조직',
        ip: '핵심 방법론·알고리즘 특허, 측정·평가 방법론 특허',
      };
      const scenarioB = {
        icon: '🏗️', stars: ntis > 100 ? '★★★★☆' : '★★★☆☆',
        title: `NTIS ${ntis > 0 ? ntis.toLocaleString() + '건' : ''} 과제 연계 R&D 기획`,
        basis: `정부 투자 ${ntis.toLocaleString()}건 과제 수행기관 네트워크 활용`,
        target: '과기부·행안부·소방청 등 재난·안전 주관 부처, 출연연',
        ip: '정부 과제 기반 공공 데이터 활용 특허, 표준화 방법론',
      };
      const scenarioC = {
        icon: '🌐', stars: '★★★★☆',
        title: itDominated
          ? `IT 특허 편중 공백 — 물리적·응용 영역 솔루션 개발`
          : `${escHtml(query)} 기반 플랫폼 솔루션 개발`,
        basis: itDominated
          ? `현 특허 보유자(${uniqueApplicants.slice(0,2).join(', ')})가 IT 영역에 편중 → 물리 인프라·도시·현장 응용 분야 공백`
          : `기술 표준화 및 플랫폼 선점 기회 존재`,
        target: '지자체, 스마트시티 사업자, 건설·인프라 컨설팅사',
        ip: '응용 시스템 특허, 데이터 수집·시각화 방법론 특허',
      };

      // ── 즉시 실행 액션 플랜 ───────────────────────────────────────
      const actionPlan = [
        { period: '1~3개월 (단기)', icon: '⚡', items: [
          `${query} 관련 국내 핵심 방법론 특허 출원 준비 — 기존 논문(${arti.toLocaleString()}건) 분석 기반`,
          `주요 특허 보유자(${uniqueApplicants.length > 0 ? uniqueApplicants.slice(0,2).join(', ') : '해외 기업'}) FTO(Freedom to Operate) 조사 수행`,
        ]},
        { period: '3~6개월 (중기)', icon: '📋', items: [
          ntis > 0 ? `NTIS 과제 수행기관 ${ntis.toLocaleString()}건 분석 → 핵심 기관 협력 네트워크 구축` : '정부 부처 R&D 과제 기획 제안서 작성',
          '관련 부처(과기부·행안부·국토부 등) R&D 과제 기획 제안',
        ]},
        { period: '6개월+ (장기)', icon: '🎯', items: [
          '학술-산업-정부 연계 연구 컨소시엄 구성',
          '국제 표준화 기구(ISO, IEC 등) 연계 표준 특허 확보 추진',
        ]},
      ];

      // ── 최종 렌더링 ───────────────────────────────────────────────
      const section = targetEl || document.getElementById('analysisSection');
      section.innerHTML = `
        <div class="analysis-card fade-up" style="max-width:900px;margin:0 auto;">
          <!-- 헤더 -->
          <div class="analysis-header flex items-center justify-between">
            <div class="flex items-center gap-2">
              <iconify-icon icon="solar:chart-2-bold-duotone" width="20"></iconify-icon>
              <div>
                <p style="font-size:11px;opacity:0.6;margin:0 0 2px 0">기술 공백(White Space) 분석 리포트</p>
                <p style="font-size:15px;font-weight:700;margin:0">"${escHtml(query)}"</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span style="font-size:11px;opacity:0.5;display:none" class="sm:block">${today}</span>
              <button onclick="document.getElementById('analysisSection').classList.add('hidden')" class="text-white/60 hover:text-white transition-colors">
                <iconify-icon icon="solar:close-circle-bold" width="18"></iconify-icon>
              </button>
            </div>
          </div>

          <div class="analysis-body bg-white" style="padding:28px 32px;">

            <!-- 메타 callout -->
            <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:10px 14px;border-radius:6px;margin-bottom:24px;font-size:11px;color:#1e40af;">
              📌 분석 도구: ScienceON API + NTIS API &nbsp;|&nbsp; 검색어: <strong>"${escHtml(query)}"</strong> &nbsp;|&nbsp; 분석 일시: ${today}
            </div>

            <!-- 핵심 수치 테이블 -->
            <h3 style="font-size:13px;font-weight:700;color:#111;margin:0 0 10px 0;">📊 핵심 수치 (실측 데이터)</h3>
            <div style="overflow-x:auto;margin-bottom:28px;">
              <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:12px;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:10px 14px;text-align:left;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">구분</th>
                    <th style="padding:10px 14px;text-align:right;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">건수</th>
                    <th style="padding:10px 14px;text-align:left;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">비고</th>
                  </tr>
                </thead>
                <tbody>
                  ${[
                    { icon: '📄', label: '논문',     count: arti,   note: artiNote,   highlight: arti > 1000 },
                    { icon: '🔬', label: '특허',     count: patent, note: patentNote, highlight: false,      alert: patent < arti * 0.05 },
                    { icon: '📋', label: '보고서',   count: report, note: reportNote, highlight: false },
                    { icon: '📡', label: '동향',     count: att,    note: attNote,    highlight: false,      alert: att === 0 },
                    { icon: '🏗️', label: 'NTIS 과제', count: ntis,   note: ntisNote,  highlight: ntis > 50 },
                  ].map(({ icon, label, count, note, highlight, alert }) => `
                    <tr style="border-bottom:1px solid #f3f4f6;${highlight ? 'background:#fafafa;' : ''}">
                      <td style="padding:10px 14px;font-weight:600;color:#374151;">${icon} ${label}</td>
                      <td style="padding:10px 14px;text-align:right;font-weight:800;font-size:14px;color:${alert ? '#dc2626' : highlight ? '#1d4ed8' : '#111'};">${count.toLocaleString()}건</td>
                      <td style="padding:10px 14px;color:${alert ? '#dc2626' : '#6b7280'};font-size:11px;">${note}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>

            <!-- 핵심 발견 callout -->
            <h3 style="font-size:13px;font-weight:700;color:#111;margin:0 0 10px 0;">🔥 핵심 발견: ${escHtml(statusIcon)} ${escHtml(statusText)}</h3>
            <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:14px 18px;border-radius:6px;margin-bottom:24px;">
              <p style="font-size:13px;font-weight:700;color:#991b1b;margin:0 0 6px 0;">
                논문 ${arti.toLocaleString()}건 vs 특허 ${patent.toLocaleString()}건
              </p>
              <p style="font-size:12px;color:#b91c1c;margin:0 0 4px 0;">→ 논문 대비 특허 비율: <strong>${patentRatio.toFixed(1)}%</strong></p>
              <p style="font-size:12px;color:#b91c1c;margin:0;">→ 공백 비율: <strong style="font-size:16px;">${gapRatio.toFixed(1)}%</strong>
                <span style="margin-left:8px;background:${statusBg};color:#1f2937;font-size:11px;padding:2px 8px;border-radius:999px;font-weight:700;">${statusIcon} ${statusText}</span>
              </p>
            </div>

            <!-- 공백률 게이지 -->
            <div style="margin-bottom:28px;">
              <div style="display:flex;justify-content:space-between;font-size:10px;color:#9ca3af;margin-bottom:4px;">
                <span>0% 레드오션</span><span>100% 블루오션</span>
              </div>
              <div class="gauge-container">
                <div class="gauge-fill" style="width:${Math.min(gapRatio, 100)}%"></div>
              </div>
            </div>

            <!-- 특허 TOP 결과 분석 -->
            <h3 style="font-size:13px;font-weight:700;color:#111;margin:0 0 10px 0;">🔍 특허 TOP 결과 분석 (IP 보유자)</h3>
            <div style="overflow-x:auto;margin-bottom:16px;">
              <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:8px;text-align:left;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb;width:24px;">#</th>
                    <th style="padding:8px;text-align:left;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb;">제목</th>
                    <th style="padding:8px;text-align:left;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb;white-space:nowrap;">출원인</th>
                    <th style="padding:8px;text-align:left;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb;white-space:nowrap;">구분</th>
                  </tr>
                </thead>
                <tbody>${patentRows}</tbody>
              </table>
            </div>
            ${uniqueApplicants.length > 0 ? `
            <div style="background:#fefce8;border-left:4px solid #eab308;padding:10px 14px;border-radius:6px;margin-bottom:28px;font-size:11px;color:#713f12;">
              💡 <strong>인사이트:</strong> 특허 보유 주체가 <strong>${uniqueApplicants.slice(0,2).join(', ')} 등</strong>에 편중되어 있습니다.
              ${itDominated ? '물리적 인프라·현장 응용 영역의 특허는 사실상 공백 — 국내 기업의 진입 장벽이 낮은 블루오션입니다!' : '세부 응용 분야에서 틈새 특허 전략이 유효합니다.'}
            </div>` : `<div style="margin-bottom:28px;"></div>`}

            <!-- 주요 논문 TOP 3 -->
            <h3 style="font-size:13px;font-weight:700;color:#111;margin:0 0 10px 0;">📄 주요 논문 TOP 결과 (연구 트렌드)</h3>
            ${paperList ? `<ol style="padding-left:20px;margin:0 0 28px 0;space-y:4px;">${paperList}</ol>`
              : `<p style="font-size:12px;color:#9ca3af;margin-bottom:28px;">논문 데이터가 없거나 조회되지 않았습니다.</p>`}

            <!-- 사업화 기회 시나리오 -->
            <h3 style="font-size:13px;font-weight:700;color:#111;margin:0 0 12px 0;">🚀 사업화 기회 시나리오</h3>
            <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px;">
              ${[scenarioA, scenarioB, scenarioC].map((s, i) => `
              <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;background:white;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                  <span style="font-size:16px;">${s.icon}</span>
                  <span style="font-size:12px;font-weight:700;color:#111;">Scenario ${String.fromCharCode(65+i)}: ${s.title}</span>
                  <span style="margin-left:auto;font-size:12px;color:#eab308;">${s.stars}</span>
                </div>
                <div style="display:grid;grid-template-columns:70px 1fr;gap:4px 8px;font-size:11px;">
                  <span style="color:#9ca3af;font-weight:600;">근거</span><span style="color:#374151;">${s.basis}</span>
                  <span style="color:#9ca3af;font-weight:600;">타깃</span><span style="color:#374151;">${s.target}</span>
                  <span style="color:#9ca3af;font-weight:600;">핵심 IP</span><span style="color:#374151;">${s.ip}</span>
                </div>
              </div>`).join('')}
            </div>

            <!-- 즉시 실행 액션 플랜 -->
            <h3 style="font-size:13px;font-weight:700;color:#111;margin:0 0 12px 0;">📋 즉시 실행 액션 플랜</h3>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:28px;">
              ${actionPlan.map(phase => `
              <div style="border-left:3px solid #e5e7eb;padding-left:14px;">
                <p style="font-size:11px;font-weight:700;color:#6b7280;margin:0 0 4px 0;">${phase.icon} ${phase.period}</p>
                <ul style="margin:0;padding-left:16px;">
                  ${phase.items.map(it => `<li style="font-size:12px;color:#374151;padding:2px 0;">${it}</li>`).join('')}
                </ul>
              </div>`).join('')}
            </div>

            <!-- 최종 소견 callout -->
            <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:14px 18px;border-radius:6px;margin-bottom:16px;">
              <p style="font-size:12px;font-weight:700;color:#14532d;margin:0 0 4px 0;">🫡 최종 소견</p>
              <p style="font-size:12px;color:#166534;line-height:1.7;margin:0;">${finalInsight}</p>
            </div>

            <div style="padding-top:12px;border-top:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:10px;color:#d1d5db;">* 데이터 출처: ScienceON API (ARTI/PATENT/REPORT/ATT/RESEARCHER) + NTIS API</span>
              <button onclick="doSearch(1)" style="font-size:11px;color:#3b82f6;background:none;border:none;cursor:pointer;font-weight:600;">논문 검색 결과 보기 →</button>
            </div>
          </div>
        </div>`;
    }

    // ============================================================

    async function refreshAccessToken() {
      try {
        let data;
        if (PROXY_AVAILABLE) {
          const url = `${getProxyBase()}/token/refresh?client_id=${encodeURIComponent(STATE.clientId)}&refresh_token=${encodeURIComponent(STATE.refreshToken)}`;
          const resp = await fetch(url);
          data = await resp.json();
        } else {
          const params = new URLSearchParams({ refresh_token: STATE.refreshToken, client_id: STATE.clientId });
          const resp = await fetch(`${TOKEN_URL_DIRECT}?${params.toString()}`);
          data = await resp.json();
        }

        if (data.access_token) {
          STATE.token       = data.access_token;
          STATE.tokenExpire = data.access_token_expire || '';
          if (data.refresh_token) STATE.refreshToken = data.refresh_token;
          localStorage.setItem('sc_token', STATE.token);
          localStorage.setItem('sc_token_expire', STATE.tokenExpire);
          localStorage.setItem('sc_refresh_token', STATE.refreshToken);
          scheduleTokenRefresh();   // ⏰ 다음 갱신 재예약
          updateTokenExpireDisplay();
          showToast('🔄 Access Token이 자동 갱신되었습니다', 'success');
        }
      } catch (e) {
        showToast('⚠️ 토큰 자동 갱신 실패. API 설정에서 새 토큰을 입력하세요', 'error');
      }
    }

    // ============================================================

    // Render Results
    // ============================================================

    function renderResults(xml, query) {
      const grid = document.getElementById('resultsGrid');
      const pagination = document.getElementById('pagination');
      grid.innerHTML = '';
      pagination.innerHTML = '';

      // Total count
      const totalEl = xml.querySelector('TotalCount') || xml.querySelector('totalCount');
      const total = totalEl ? parseInt(totalEl.textContent) || 0 : 0;
      STATE.totalCount = total;

      const targetLabel = getTargetLabel(STATE.currentTarget);

      document.getElementById('resultTotal').textContent =
        `${targetLabel} ${total.toLocaleString()}건 검색됨`;
      document.getElementById('resultQuery').textContent = `"${query}"`;

      if (total === 0) {
        setLoading(false);
        document.getElementById('noResultState').classList.remove('hidden');
        return;
      }

      // Get items based on target
      const items = getItems(xml);

      if (!items || items.length === 0) {
        setLoading(false);
        document.getElementById('noResultState').classList.remove('hidden');
        return;
      }

      // currentItems 수집 (CSV 내보내기 + 네트워크 시각화용)
      STATE.currentItems = items.map(item => ({
        type: getTargetLabel(STATE.currentTarget),
        title: getVal(item,'Title','ScentTitle','AuthorNameKor','OrganKor'),
        authors: getVal(item,'Author'),
        year: (getVal(item,'Pubyear','PublDate','RegisterDate','ApplDate')||'').substring(0,4),
        url: getVal(item,'ContentURL','FulltextURL','MobileURL'),
        keywords: getVal(item,'Keyword'),
        abstract: getVal(item,'Abstract'),
      }));

      // Render items
      items.forEach((item, idx) => {
        const card = renderCard(item, idx, query);
        grid.insertAdjacentHTML('beforeend', card);
      });

      // Pagination
      renderPagination(total);

      setLoading(false);

      // Fade in
      document.querySelectorAll('.result-card').forEach((card, i) => {
        card.style.animationDelay = `${i * 0.04}s`;
        card.classList.add('fade-up');
      });

      // 인사이트 바 (키워드 클라우드 + 정렬 바)
      renderInsightsBar();
    }

    function renderNTISResults(xml, query, collection) {
      const grid = document.getElementById('resultsGrid');
      const pagination = document.getElementById('pagination');
      grid.innerHTML = '';
      pagination.innerHTML = '';

      // XML 파싱 오류 체크 (DOMParser 실패 시 <parsererror> 반환)
      if (xml.getElementsByTagName('parsererror').length > 0) {
        console.error('[NTIS] XML 파싱 오류:', xml.getElementsByTagName('parsererror')[0]?.textContent);
        showToast('NTIS 응답 XML 파싱 오류 — 브라우저 콘솔 확인', 'error');
        setLoading(false);
        return;
      }

      // getElementsByTagName 사용: querySelector는 XML 대문자 태그에 브라우저별 불안정
      const getXmlTag = (tagName) => xml.getElementsByTagName(tagName)[0] || null;

      // NTIS 오류 응답 처리: <RESULT><ERROR><CODE>/<MESSAGE> 또는 <returnCode>/<returnMsg>
      const errCode = getXmlTag('CODE')?.textContent?.trim() || getXmlTag('returnCode')?.textContent?.trim() || '';
      const errMsg  = getXmlTag('MESSAGE')?.textContent?.trim() || getXmlTag('returnMsg')?.textContent?.trim() || '';
      console.log(`[NTIS] errCode=${errCode} | errMsg=${errMsg}`);
      if (errCode && errCode !== '0') {
        showToast(`NTIS API 오류: [${errCode}] ${errMsg}`, 'error');
        console.error('[NTIS] API 오류 응답:', errCode, errMsg, new XMLSerializer().serializeToString(xml));
        setLoading(false);
        return;
      }

      // NTIS 기관용 API는 <TOTALHITS> 사용 (다양한 태그명 폴백)
      const totalEl = getXmlTag('TOTALHITS') || getXmlTag('TOTAL_HITS')
                   || getXmlTag('totalCount') || getXmlTag('TOTAL_COUNT')
                   || getXmlTag('total_count') || getXmlTag('TotalCount')
                   || getXmlTag('resultCount') || getXmlTag('RESULT_COUNT');
      const total = totalEl ? parseInt(totalEl.textContent) || 0 : 0;
      STATE.totalCount = total;

      console.log(`[NTIS] total=${total}, query="${query}", collection=${collection}`);

      const targetLabel = getTargetLabel(STATE.currentTarget);
      document.getElementById('resultTotal').textContent = `${targetLabel} ${total.toLocaleString()}건 검색됨`;
      document.getElementById('resultQuery').innerHTML = `"${escHtml(query)}" <span class="badge badge-ntis-prjt ml-2" style="vertical-align: middle;">NTIS API</span>`;

      if (total === 0) {
        setLoading(false);
        document.getElementById('noResultState').classList.remove('hidden');
        // 디버그 패널: 원시 응답 표시
        if (window._ntisDebug) {
          const panel = document.getElementById('ntisDebugPanel');
          const urlEl  = document.getElementById('ntisDebugUrl');
          const rawEl  = document.getElementById('ntisDebugRaw');
          if (panel && urlEl && rawEl) {
            urlEl.textContent = window._ntisDebug.url;
            rawEl.textContent = window._ntisDebug.raw.substring(0, 3000);
            panel.classList.remove('hidden');
          }
        }
        return;
      }

      // getElementsByTagName으로 HIT 요소 추출 (querySelector 대체)
      let items = Array.from(xml.getElementsByTagName('HIT'));
      if (items.length === 0) items = Array.from(xml.getElementsByTagName('item'));
      if (items.length === 0) items = Array.from(xml.getElementsByTagName('row'));
      if (items.length === 0) items = Array.from(xml.getElementsByTagName('record'));
      console.log(`[NTIS] items found: ${items.length}`);

      if (items.length === 0) {
        setLoading(false);
        document.getElementById('noResultState').classList.remove('hidden');
        return;
      }

      items.forEach((item, idx) => {
        const card = renderNTISCard(item, idx, query, collection);
        grid.insertAdjacentHTML('beforeend', card);
      });

      renderPagination(total);
      setLoading(false);

      document.querySelectorAll('.result-card').forEach((card, i) => {
        card.style.animationDelay = `${i * 0.04}s`;
        card.classList.add('fade-up');
      });
    }

    function renderNTISCard(item, idx, query, collection) {
      const target = STATE.currentTarget;

      const escHtml = (text) => text ? text.toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) : '';
      const escRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const hl = (text) => {
        if (!text || !query) return escHtml(text);
        const regex = new RegExp(`(${escRegex(query)})`, 'gi');
        return escHtml(text).replace(regex, '<mark>$1</mark>');
      };

      // NTIS 기관용 API 응답 XML에서 하이라이트 span 제거 (먼저 정의)
      const stripHL = (text) => (text || '').replace(/<span[^>]*>/gi, '').replace(/<\/span>/gi, '').trim();

      // getElementsByTagName 기반 헬퍼 (XML 대문자 태그 안전 처리, querySelector 대체)
      const gv = (tagName) => {
        const el = item.getElementsByTagName(tagName)[0];
        return el ? el.textContent.trim() : '';
      };
      // 중첩 구조: <Parent><Child>값</Child></Parent>
      const gnv = (parentTag, childTag) => {
        const parent = item.getElementsByTagName(parentTag)[0];
        if (!parent) return '';
        if (!childTag) return stripHL(parent.textContent.trim());
        const child = parent.getElementsByTagName(childTag)[0];
        return stripHL(child ? child.textContent.trim() : '');
      };

      let title = '', subtitle = '', tags = [], extra = '';
      let badgeCls = 'badge-ntis-prjt', icon = 'solar:case-bold-duotone';

      // PDF 24 기관용 통합검색 HIT 응답 구조 파싱
      if (collection === 'project' || collection === 'prjt') {
        const pjtNo = gv('ProjectNumber');

        // 제목: <ProjectTitle><Korean>값</Korean></ProjectTitle>
        title = gnv('ProjectTitle', 'Korean') || gnv('ProjectTitle', null);

        // 주관기관: <ManageAgency><Name>값</Name></ManageAgency>
        // LeadAgency는 텍스트 직접 포함 구조: <LeadAgency>기관명</LeadAgency>
        const mngInst  = gnv('ManageAgency', 'Name') || gv('LeadAgency');
        // 사업명: <BusinessName>
        const bizNm    = stripHL(gv('BusinessName'));
        // 부처: <Ministry><Name>
        const ministry = gnv('Ministry', 'Name');
        // 수행기관: <ResearchAgency><Name>
        const researchAgency = gnv('ResearchAgency', 'Name');
        // 연구비: <TotalFunds> (원 단위)
        const fundsRaw = gv('TotalFunds') || gv('GovernmentFunds');
        const fundsAmt = fundsRaw && !isNaN(fundsRaw)
          ? (Number(fundsRaw) / 1000).toLocaleString() + '천원'
          : fundsRaw || '금액 미상';
        // 연구기간: <ProjectPeriod><Start>/<End>
        const periodStart = gnv('ProjectPeriod', 'Start').substring(0, 6);
        const periodEnd   = gnv('ProjectPeriod', 'End').substring(0, 6);
        const periodStr   = periodStart ? `${periodStart}~${periodEnd}` : '';
        // 키워드: <Keyword><Korean>
        const keywords = gnv('Keyword', 'Korean');
        // 연구자: <Manager><Name>
        subtitle = gnv('Manager', 'Name');

        extra = `
          <div class="ntis-info-row mt-2">
            <div class="ntis-info-item" title="주관기관"><iconify-icon icon="solar:folder-with-files-bold-duotone" width="14"></iconify-icon>${escHtml(mngInst || researchAgency || '기관 미상')}</div>
            ${bizNm ? `<div class="ntis-info-item" title="사업명"><iconify-icon icon="solar:branching-paths-bold-duotone" width="14"></iconify-icon>${escHtml(bizNm)}</div>` : ''}
            ${ministry ? `<div class="ntis-info-item" title="부처"><iconify-icon icon="solar:wallet-money-bold-duotone" width="14"></iconify-icon>${escHtml(ministry)}</div>` : ''}
            <div class="ntis-info-item ntis-funds" title="연구비"><iconify-icon icon="solar:wad-of-money-bold-duotone" width="14"></iconify-icon>${escHtml(fundsAmt)}</div>
          </div>
          ${keywords ? `<div class="mt-1.5 flex flex-wrap gap-1">${keywords.split(/[,;|]/).slice(0,5).map(k => `<span class="tag">${escHtml(k.trim())}</span>`).join('')}</div>` : ''}
          ${pjtNo ? `<div class="mt-2 flex gap-2">
            <button type="button" class="btn-secondary"
              data-pjt-id="${escHtml(pjtNo)}"
              data-pjt-title="${escHtml(title || '')}"
              onclick="event.stopPropagation(); showRelated(this.dataset.pjtId, this.dataset.pjtTitle)">
              <iconify-icon icon="solar:link-bold-duotone" width="14"></iconify-icon>연관컨텐츠
            </button>
            <a href="https://www.ntis.go.kr/project/pjtInfo.do?pjtId=${encodeURIComponent(pjtNo)}&pageCode=TH_PJT_PJT_DTL"
              target="_blank" rel="noopener"
              style="display:inline-flex; align-items:center; gap:0.375rem;"
              class="btn-secondary"
              onclick="event.stopPropagation()">
              <iconify-icon icon="solar:arrow-right-up-bold-duotone" width="14"></iconify-icon>NTIS 상세
            </a>
          </div>` : ''}
        `;
        if (periodStr) tags.push(`${periodStr}`);
        badgeCls = 'badge-ntis-prjt';
        icon = 'solar:case-bold-duotone';
      } else {
        title = gv('koTitle') || gv('equipNm');
        subtitle = gv('instNm') || gv('korNm');
        badgeCls = 'badge-ntis-requip';
        icon = 'solar:microscope-bold-duotone';
      }

      return `
  <div class="result-card">
    <div class="flex items-start gap-4">
      <div class="type-icon hidden sm:flex" style="background: #f5f5f5; color: #111;">
        <iconify-icon icon="${icon}" width="20"></iconify-icon>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <span class="badge ${badgeCls}">${getTargetLabel(target)}</span>
          ${idx === 0 ? '<span class="text-xs text-black font-bold flex items-center gap-1"><iconify-icon icon="solar:star-bold" width="12"></iconify-icon>TOP</span>' : ''}
          ${tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join(' ')}
        </div>
        <h3 class="text-black font-bold text-lg leading-snug mb-2">${hl(title) || '<span class="text-tertiary">제목 없음</span>'}</h3>
        ${subtitle ? `<p class="text-sm text-secondary mb-2 truncate">${hl(subtitle)}</p>` : ''}
        ${extra}
        <div class="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <span class="text-xs text-tertiary">출처: 국가과학기술지식정보서비스(NTIS)</span>
          <button type="button" class="fav-btn ${isFav(gv('ProjectNumber')||title)?'active':''}" title="즐겨찾기"
            onclick="event.stopPropagation();toggleFav(${JSON.stringify({id:gv('ProjectNumber')||title,title,type:'R&D과제',url:'https://www.ntis.go.kr'})},this)">
            <iconify-icon icon="solar:bookmark-bold${isFav(gv('ProjectNumber')||title)?'':'-duotone'}" width="16"></iconify-icon>
          </button>
        </div>
      </div>
    </div>
  </div>`;
    }

    function getItems(xml) {
      // 실제 API 응답 구조: <recordList><record rownum="N">...</record></recordList>
      const records = Array.from(xml.querySelectorAll('recordList record, record'));
      if (records.length > 0) return records;

      // fallback: 이전 방식 (태그명 기반)
      const target = STATE.currentTarget;
      const selectors = {
        ARTI: 'ARTI, Article', PATENT: 'PATENT, Patent',
        REPORT: 'REPORT, Report', ATT: 'ATT',
        SCENT: 'SCENT', RESEARCHER: 'RESEARCHER',
        ORGAN: 'ORGAN', TREND: 'TREND', SNEWS: 'SNEWS',
      };
      return Array.from(xml.querySelectorAll(selectors[target] || target));
    }

    function getVal(item, ...fields) {
      for (const f of fields) {
        // 실제 구조: <item metaCode="Title" metaName="...">값</item>
        const byMeta = item.querySelector(`item[metaCode="${f}"]`);
        if (byMeta && byMeta.textContent.trim()) return byMeta.textContent.trim();

        // fallback: 태그명으로 직접 조회
        const byTag = item.querySelector(f);
        if (byTag && byTag.textContent.trim()) return byTag.textContent.trim();
      }
      return '';
    }

    function renderCard(item, idx, query) {
      const target = STATE.currentTarget;
      const cn = getVal(item, 'CN');
      const title = getVal(item, 'Title', 'ScentTitle', 'AuthorNameKor', 'OrganKor');
      const url = getVal(item, 'ContentURL', 'FulltextURL', 'MobileURL');
      const year = getVal(item, 'Pubyear', 'PublDate', 'RegisterDate', 'ApplDate');
      const abstract = getVal(item, 'Abstract');
      const authors = getVal(item, 'Author');
      const keyword = getVal(item, 'Keyword');
      const journal = getVal(item, 'JournalName');
      const publisher = getVal(item, 'Publisher', 'Applicants', 'AuthorInstKor', 'OrganKor');
      const doi = getVal(item, 'DOI');
      const dbcode = getVal(item, 'DBCode');
      const fulltextFlag = getVal(item, 'FulltextFlag');

      // Highlight function
      const hl = (text) => {
        if (!text || !query) return escHtml(text);
        const regex = new RegExp(`(${escRegex(query)})`, 'gi');
        return escHtml(text).replace(regex, '<mark>$1</mark>');
      };

      const badge = getBadge(target);
      const typeIcon = getTypeIcon(target);

      // Year display
      const yearDisplay = year ? year.substring(0, 4) : '';

      // Authors - limit to 3
      let authorDisplay = '';
      if (authors) {
        const auList = authors.split(/[;,|]/).map(a => a.trim()).filter(Boolean);
        authorDisplay = auList.slice(0, 3).join(', ') + (auList.length > 3 ? ` 외 ${auList.length - 3}명` : '');
      }

      // Keywords - limit to 5
      let kwDisplay = '';
      if (keyword) {
        const kwList = keyword.split(/[;,|]/).map(k => k.trim()).filter(Boolean);
        kwDisplay = kwList.slice(0, 5).map(k => `<span class="tag">${escHtml(k)}</span>`).join('');
      }

      // Patent specific
      let patentInfo = '';
      if (target === 'PATENT') {
        const nation = getVal(item, 'Nation', 'NationCode');
        const applNum = getVal(item, 'ApplNum');
        const grantNum = getVal(item, 'GrantNum');
        const ipc = getVal(item, 'IPC');
        const status = getVal(item, 'PatentStatus');

        if (nation) patentInfo += `<span class="tag">${escHtml(nation)}</span> `;
        if (ipc) patentInfo += `<span class="tag">IPC: ${escHtml(ipc.substring(0, 20))}</span> `;
        if (status) patentInfo += `<span class="tag">${escHtml(status)}</span> `;
      }

      // Researcher specific
      let researcherInfo = '';
      if (target === 'RESEARCHER') {
        const engName = getVal(item, 'AuthorNameEng');
        const inst = getVal(item, 'AuthorInstKor', 'AuthorInstEng');
        const artCnt = getVal(item, 'ArticleCnt');
        const patCnt = getVal(item, 'PatentCnt');
        if (engName) researcherInfo += `<span class="text-gray-500 text-sm">${escHtml(engName)}</span>`;
        if (inst) researcherInfo += ` · <span class="text-gray-500 text-sm">${escHtml(inst)}</span>`;
        if (artCnt) researcherInfo += ` <span class="tag">논문 ${escHtml(artCnt)}편</span>`;
        if (patCnt) researcherInfo += ` <span class="tag">특허 ${escHtml(patCnt)}건</span>`;
      }

      const clickAction = url ? `onclick="window.open('${escAttr(url)}', '_blank')"` : '';
      const cursorClass = url ? 'cursor-pointer' : '';

      return `
  <div class="result-card ${cursorClass}" ${clickAction} data-year="${yearDisplay}" data-title="${escAttr(title)}">
    <div class="flex items-start gap-4">
      <!-- Icon -->
      <div class="type-icon hidden sm:flex" style="background: #f5f5f5; color: #111;">
        <iconify-icon icon="${typeIcon}" width="18"></iconify-icon>
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <!-- Header -->
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <span class="badge ${badge}">${getTargetLabel(target)}</span>
          ${dbcode ? `<span class="text-xs text-secondary">${escHtml(dbcode)}</span>` : ''}
          ${yearDisplay ? `<span class="text-xs text-secondary flex items-center gap-1"><iconify-icon icon="solar:calendar-bold-duotone" width="12"></iconify-icon>${yearDisplay}</span>` : ''}
          ${fulltextFlag === 'Y' ? '<span class="text-xs text-black font-bold flex items-center gap-1"><iconify-icon icon="solar:link-circle-bold-duotone" width="12"></iconify-icon>원문</span>' : ''}
          ${idx === 0 ? '<span class="text-xs text-black font-bold flex items-center gap-1"><iconify-icon icon="solar:star-bold" width="12"></iconify-icon>TOP</span>' : ''}
        </div>

        <!-- Title -->
        <h3 class="text-black font-bold text-lg leading-snug mb-2" style="word-break: keep-all; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${hl(title) || '<span class="text-tertiary">제목 없음</span>'}
        </h3>

        <!-- Authors / Publisher -->
        ${authorDisplay ? `<p class="text-sm text-secondary mb-2 truncate">${renderAuthorLinks(authors, query)}${journal ? ` · <span class="italic text-tertiary">${escHtml(journal)}</span>` : ''}</p>` : ''}
        ${!authorDisplay && publisher ? `<p class="text-sm text-secondary mb-2 truncate">${hl(publisher)}</p>` : ''}
        ${researcherInfo ? `<p class="text-sm mb-2">${researcherInfo}</p>` : ''}

        <!-- Abstract -->
        ${abstract ? `<p class="abstract-text mt-3 mb-3">${hl(abstract)}</p>` : ''}

        <!-- Patent info -->
        ${patentInfo ? `<div class="flex flex-wrap gap-1 mt-2">${patentInfo}</div>` : ''}

        <!-- Keywords -->
        ${kwDisplay ? `<div class="tags-scroll mt-3">${kwDisplay}</div>` : ''}

        <!-- Footer -->
        <div class="flex items-center justify-between mt-5 pt-3 border-t border-border">
          <div class="flex items-center gap-3">
            ${doi ? `<span class="text-xs text-tertiary truncate max-w-[200px]">DOI: ${escHtml(doi)}</span>` : ''}
            ${cn ? `<span class="text-xs text-tertiary font-mono truncate">${escHtml(cn)}</span>` : ''}
            ${target === 'RESEARCHER' ? `<button type="button" class="btn-secondary text-xs" onclick="event.stopPropagation();showDeepProfile('${escAttr(title)}','${escAttr(publisher)}')" data-name="${escAttr(title)}" data-subtitle="${escAttr(publisher)}"><iconify-icon icon="solar:user-circle-bold-duotone" width="13"></iconify-icon>심층 프로필</button>` : ''}
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class="fav-btn ${typeof hasMemo !== 'undefined' && hasMemo(cn||title) ? 'memo-active' : ''}" title="메모"
              data-memo-id="${escAttr(cn||title)}"
              onclick="event.stopPropagation();openMemoPanel('${escAttr(cn||title)}','${escAttr(title)}')">
              <iconify-icon icon="solar:notes-bold${typeof hasMemo !== 'undefined' && hasMemo(cn||title) ? '' : '-duotone'}" width="16"></iconify-icon>
            </button>
            <button type="button" class="fav-btn ${isFav(cn||title)?'active':''}" title="즐겨찾기"
              onclick="event.stopPropagation();toggleFav(${JSON.stringify({id:cn||title,title,url,year:yearDisplay,type:getTargetLabel(target),authors:authorDisplay})},this)">
              <iconify-icon icon="solar:bookmark-bold${isFav(cn||title)?'':'-duotone'}" width="16"></iconify-icon>
            </button>
            ${url ? `
            <div class="flex items-center gap-1 text-xs text-black font-bold shrink-0">
              <span>본문 보기</span>
              <iconify-icon icon="solar:arrow-right-up-bold" width="14"></iconify-icon>
            </div>` : ''}
          </div>
        </div>
      </div>
    </div>
  </div>`;
    }

    // ============================================================

    // Pagination
    // ============================================================

    function renderPagination(total) {
      const container = document.getElementById('pagination');
      const totalPages = Math.min(Math.ceil(total / STATE.rowCount), Math.floor(10000 / STATE.rowCount));
      if (totalPages <= 1) return;

      container.classList.remove('hidden');
      const cur = STATE.currentPage;

      // ── [FIX #3] NTIS / ScienceON 페이지 함수 분기 ──
      const isNTIS = STATE.currentTarget.startsWith('NTIS_');
      const gotoFn = isNTIS ? 'doNTISSearch' : 'doSearch';

      let btns = '';

      // Prev
      btns += `<button class="page-btn" onclick="${gotoFn}(${cur - 1})" ${cur <= 1 ? 'disabled' : ''}>
    <iconify-icon icon="solar:alt-arrow-left-bold" width="14"></iconify-icon>
  </button>`;

      // Page numbers
      const start = Math.max(1, cur - 4);
      const end = Math.min(totalPages, start + 8);

      if (start > 1) btns += `<button class="page-btn" onclick="${gotoFn}(1)">1</button>`;
      if (start > 2) btns += `<span class="text-gray-600 px-1">…</span>`;

      for (let i = start; i <= end; i++) {
        btns += `<button class="page-btn ${i === cur ? 'active' : ''}" onclick="${gotoFn}(${i})">${i}</button>`;
      }

      if (end < totalPages - 1) btns += `<span class="text-gray-600 px-1">…</span>`;
      if (end < totalPages) btns += `<button class="page-btn" onclick="${gotoFn}(${totalPages})">${totalPages}</button>`;

      // Next
      btns += `<button class="page-btn" onclick="${gotoFn}(${cur + 1})" ${cur >= totalPages ? 'disabled' : ''}>
    <iconify-icon icon="solar:alt-arrow-right-bold" width="14"></iconify-icon>
  </button>`;

      container.innerHTML = btns;

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ============================================================

    // CORS Guide
    // ============================================================

    function showCORSGuide(url) {
      const grid = document.getElementById('resultsGrid');
      grid.innerHTML = `
  <div class="p-6 rounded-2xl" style="background: var(--surface); border: 1px solid rgba(239,68,68,0.2);">
    <div class="flex items-start gap-3 mb-4">
      <iconify-icon icon="solar:shield-warning-bold-duotone" style="color: #f87171; flex-shrink:0;" width="24"></iconify-icon>
      <div>
        <h3 class="text-white font-semibold mb-1">CORS 오류 — 브라우저 직접 요청 차단됨</h3>
        <p class="text-gray-400 text-sm" style="word-break:keep-all;">
          ScienceON API는 브라우저에서 직접 호출 시 CORS 정책으로 인해 차단될 수 있습니다.
          아래 방법 중 하나를 사용하세요.
        </p>
      </div>
    </div>

    <div class="space-y-3 mt-4">
      <div class="p-3 rounded-xl" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);">
        <p class="text-xs font-semibold text-gray-300 mb-2">방법 1: 브라우저 CORS 확장 프로그램 사용</p>
        <p class="text-xs text-gray-500">Chrome 확장: "CORS Unblock" 또는 "Allow CORS: Access-Control-Allow-Origin" 설치 후 활성화</p>
      </div>
      <div class="p-3 rounded-xl" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);">
        <p class="text-xs font-semibold text-gray-300 mb-2">방법 2: 로컬 프록시 서버 실행</p>
        <code class="text-xs text-green-400 block mt-1">npx cors-anywhere</code>
        <p class="text-xs text-gray-500 mt-1">또는 Node.js / Python 로컬 프록시 서버를 구성하세요</p>
      </div>
      <div class="p-3 rounded-xl" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);">
        <p class="text-xs font-semibold text-gray-300 mb-2">방법 3: API 직접 테스트</p>
        <p class="text-xs text-gray-500 mb-2">아래 URL로 직접 접속하여 응답을 확인하세요:</p>
        <code class="text-xs text-blue-400 break-all block p-2 rounded" style="background:rgba(0,0,0,0.3);">${escHtml(url)}</code>
        <button onclick="window.open('${escAttr(url)}', '_blank')" class="btn-secondary mt-2 text-xs">
          <iconify-icon icon="solar:external-link-bold-duotone" width="14"></iconify-icon>
          새 탭에서 열기
        </button>
      </div>
    </div>
  </div>`;
      document.getElementById('emptyState').classList.add('hidden');
    }

    // ============================================================

    // Helpers
    // ============================================================

    function setLoading(val) {
      STATE.isLoading = val;
      document.getElementById('loadingState').classList.toggle('hidden', !val);
      document.getElementById('searchBtn').disabled = val;
    }

    function hideAll() {
      ['emptyState', 'noResultState', 'loadingState', 'analysisSection'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      });
      document.getElementById('resultsGrid').innerHTML = '';
      document.getElementById('pagination').classList.add('hidden');
      document.getElementById('pagination').innerHTML = '';
    }

    function getTargetLabel(target) {
      const map = {
        ARTI: '논문', PATENT: '특허', REPORT: '보고서',
        ATT: '동향', SCENT: '과학향기', RESEARCHER: '연구자',
        ORGAN: '연구기관', TREND: '트렌드', SNEWS: '과학뉴스', VOLUME: '권호',
        NTIS_prjt: 'R&D과제'
      };
      return map[target] || target;
    }

    function getBadge(target) {
      const map = {
        ARTI: 'badge-arti', PATENT: 'badge-patent', REPORT: 'badge-report',
        ATT: 'badge-att', RESEARCHER: 'badge-researcher', ORGAN: 'badge-organ',
        TREND: 'badge-trend', SCENT: 'badge-att', SNEWS: 'badge-trend',
      };
      return map[target] || 'badge-arti';
    }

    function getTypeIcon(target) {
      const map = {
        ARTI: 'solar:document-text-bold-duotone',
        PATENT: 'solar:lightbulb-bold-duotone',
        REPORT: 'solar:book-2-bold-duotone',
        ATT: 'solar:graph-new-up-bold-duotone',
        RESEARCHER: 'solar:user-id-bold-duotone',
        ORGAN: 'solar:buildings-2-bold-duotone',
        TREND: 'solar:chart-2-bold-duotone',
        SCENT: 'solar:test-tube-bold-duotone',
        SNEWS: 'solar:newspaper-bold-duotone',
      };
      return map[target] || 'solar:document-bold-duotone';
    }

    function getTypeIconBg(target) {
      const map = {
        ARTI: 'bg-blue-500/10',
        PATENT: 'bg-yellow-500/10',
        REPORT: 'bg-purple-500/10',
        ATT: 'bg-orange-500/10',
        RESEARCHER: 'bg-teal-500/10',
        ORGAN: 'bg-rose-500/10',
        TREND: 'bg-green-500/10',
        SCENT: 'bg-orange-500/10',
      };
      return map[target] || 'bg-gray-500/10';
    }

    function getTypeColor(target) {
      const map = {
        ARTI: '#93c5fd',
        PATENT: '#fde68a',
        REPORT: '#d8b4fe',
        ATT: '#fdba74',
        RESEARCHER: '#5eead4',
        ORGAN: '#fda4af',
        TREND: '#86efac',
        SCENT: '#fdba74',
      };
      return map[target] || '#9ca3af';
    }

    function escHtml(s) {
      if (!s) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function escAttr(s) {
      if (!s) return '';
      return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function escRegex(s) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ============================================================

    // 연관컨텐츠 모달 (PDF 15: ConnectionContent API)
    // ============================================================

    let _relPjtId = '';
    let _relActiveCol = 'project';

    async function showRelated(pjtId, title) {
      if (!STATE.ntisKey) {
        showToast('NTIS 인증키가 필요합니다', 'warning');
        return;
      }
      _relPjtId = pjtId;
      _relActiveCol = 'project';
      document.getElementById('relatedPjtTitle').textContent = title || pjtId;
      document.querySelectorAll('#relatedModal .tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('relTab-project').classList.add('active');
      document.getElementById('relatedModal').classList.remove('hidden');
      await loadRelated('project');
    }

    function closeRelated() {
      document.getElementById('relatedModal').classList.add('hidden');
    }

    async function switchRelTab(collection, btn) {
      _relActiveCol = collection;
      document.querySelectorAll('#relatedModal .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await loadRelated(collection);
    }

    async function loadRelated(collection) {
      const resultsEl = document.getElementById('relatedResults');
      resultsEl.innerHTML = '<div class="flex justify-center py-8"><div class="spinner"></div></div>';

      try {
        const params = new URLSearchParams({
          apprvKey: STATE.ntisKey,
          pjtId: _relPjtId,
          collection: collection,
          topN: 10,
        });
        const resp = await fetch(`${getProxyBase()}/ntis/connection?${params}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        if (!data.exist || !data.items || data.items.length === 0) {
          resultsEl.innerHTML = '<p class="text-gray-500 text-sm text-center py-8">연관 컨텐츠가 없습니다.</p>';
          return;
        }

        // 컬렉션별 제목 필드 매핑
        const titleField = { project: 'KOR_PJT_NM', paper: 'PAPER_NM', patent: 'IPR_INVENTION_NM', researchreport: 'REPORT_NM' };
        const tf = titleField[collection] || 'KOR_PJT_NM';

        resultsEl.innerHTML = data.items.map((item, i) => {
          const itemTitle = escHtml(item[tf] || item.KOR_PJT_NM || '(제목 없음)');
          const score = item.similarity_score ? Math.round(item.similarity_score * 100) : 0;
          const scoreColor = score >= 90 ? '#4ade80' : score >= 75 ? '#fbbf24' : '#9ca3af';
          const id = item.PJT_ID || item.RST_ID || '';
          const ntisLink = collection === 'project' && id
            ? `https://www.ntis.go.kr/project/pjtInfo.do?pjtId=${encodeURIComponent(id)}&pageCode=TH_PJT_PJT_DTL`
            : 'https://www.ntis.go.kr';
          return `
            <div class="result-card" style="padding:1rem; border-radius:8px; background: #fff; border: 1px solid #eee;">
              <div class="flex items-start gap-4">
                <span class="text-xs font-bold shrink-0 pt-1" style="color:${scoreColor}; min-width:2.5rem; text-align:right;">${score}%</span>
                <div class="flex-1 min-w-0">
                  <p class="text-black text-sm font-semibold leading-snug">${itemTitle}</p>
                  <div class="flex items-center gap-2 mt-2">
                    <span class="text-xs text-tertiary">${escHtml(id)}</span>
                    <a href="${escAttr(ntisLink)}" target="_blank" rel="noopener"
                       class="text-xs text-black font-medium flex items-center gap-0.5 hover:underline" onclick="event.stopPropagation()">
                      NTIS<iconify-icon icon="solar:arrow-right-up-bold" width="11"></iconify-icon>
                    </a>
                  </div>
                </div>
              </div>
            </div>`;
        }).join('');
      } catch (e) {
        resultsEl.innerHTML = `<p class="text-red-400 text-sm text-center py-8">오류: ${escHtml(e.message)}</p>`;
      }
    }

    // ============================================================

    // ⑦ 검색 히스토리
    // ============================================================

    function addToHistory(query) {
      if (!query || query.length < 2) return;
      STATE.searchHistory = [query, ...STATE.searchHistory.filter(h => h !== query)].slice(0, 15);
      localStorage.setItem('sc_history', JSON.stringify(STATE.searchHistory));
    }
    function showHistory() {
      if (STATE.searchHistory.length === 0) return;
      const dd = document.getElementById('historyDropdown');
      const list = document.getElementById('historyList');
      list.innerHTML = STATE.searchHistory.map(h =>
        `<li onclick="setSearchAndGo('${escAttr(h)}')">
          <iconify-icon icon="solar:clock-circle-bold-duotone" width="14"></iconify-icon>${escHtml(h)}
        </li>`
      ).join('') + `<li class="clear-btn" onclick="clearHistory()">
        <iconify-icon icon="solar:trash-bin-2-bold-duotone" width="13"></iconify-icon>기록 삭제
      </li>`;
      dd.classList.remove('hidden');
    }
    function hideHistory() {
      document.getElementById('historyDropdown').classList.add('hidden');
    }
    function clearHistory() {
      STATE.searchHistory = [];
      localStorage.removeItem('sc_history');
      hideHistory();
    }
    function setSearchAndGo(q) {
      document.getElementById('searchInput').value = q;
      hideHistory();
      doSearch();
    }

    // ============================================================

    // ⑧ 공유 링크 생성
    // ============================================================

    function updateShareUrl(query, target) {
      const url = new URL(location.href.split('?')[0]);
      url.searchParams.set('q', query);
      url.searchParams.set('t', target);
      history.replaceState(null, '', url.toString());
    }
    function copyShareLink() {
      const url = location.href;
      navigator.clipboard.writeText(url).then(() => {
        showToast('공유 링크가 클립보드에 복사되었습니다.', 'success');
      }).catch(() => {
        prompt('아래 링크를 복사하세요:', url);
      });
    }

    // ============================================================

    // ⑨ 다크/라이트 모드
    // ============================================================

    function toggleTheme() {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('sc_theme', isDark ? 'dark' : 'light');
      document.getElementById('themeIcon').setAttribute('icon',
        isDark ? 'solar:sun-bold-duotone' : 'solar:moon-bold-duotone');
    }
    function initTheme() {
      const saved = localStorage.getItem('sc_theme') || 'light';
      if (saved === 'dark') {
        document.documentElement.classList.add('dark');
        const icon = document.getElementById('themeIcon');
        if (icon) icon.setAttribute('icon', 'solar:sun-bold-duotone');
      }
    }

    // ============================================================

    // ② CSV 내보내기
    // ============================================================

    function exportCSV(items) {
      const rows = items || STATE.currentItems;
      if (!rows || rows.length === 0) { showToast('내보낼 결과가 없습니다.', 'warning'); return; }
      const headers = ['유형', '제목', '저자/발명자', '연도', 'URL', '키워드', '초록'];
      const csvRows = [headers.join(',')];
      rows.forEach(r => {
        const cols = [r.type||'', r.title||'', r.authors||'', r.year||'', r.url||'', r.keywords||'', (r.abstract||'').replace(/\n/g,' ')];
        csvRows.push(cols.map(c => `"${String(c).replace(/"/g,'""')}"`).join(','));
      });
      const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `scienceon_${STATE.currentQuery}_${new Date().toISOString().slice(0,10)}.csv`;
      link.click();
      showToast(`${rows.length}건을 CSV로 내보냈습니다.`, 'success');
    }
    function exportFavCSV() { exportCSV(STATE.favorites.map(f => ({...f, authors:'', keywords:'', abstract:''}))); }

    // ============================================================

    // ③ 즐겨찾기
    // ============================================================

    function isFav(id) { return STATE.favorites.some(f => f.id === id); }
    function saveFavs() {
      localStorage.setItem('sc_favorites', JSON.stringify(STATE.favorites));
      updateFavCount();
    }
    function updateFavCount() {
      const cnt = STATE.favorites.length;
      const el = document.getElementById('favCount');
      const panelEl = document.getElementById('favPanelCount');
      if (el) { el.textContent = cnt; el.classList.toggle('hidden', cnt === 0); }
      if (panelEl) panelEl.textContent = `${cnt}건`;
    }
    function toggleFav(data, btn) {
      const idx = STATE.favorites.findIndex(f => f.id === data.id);
      if (idx >= 0) {
        STATE.favorites.splice(idx, 1);
        if (btn) { btn.classList.remove('active'); btn.querySelector('iconify-icon').setAttribute('icon','solar:bookmark-bold-duotone'); }
        showToast('즐겨찾기에서 제거했습니다.', 'info');
      } else {
        STATE.favorites.unshift(data);
        if (btn) { btn.classList.add('active'); btn.querySelector('iconify-icon').setAttribute('icon','solar:bookmark-bold'); }
        showToast('즐겨찾기에 추가했습니다.', 'success');
      }
      saveFavs();
      if (!document.getElementById('favPanel').classList.contains('open')) return;
      renderFavList();
    }
    function openFavPanel() {
      renderFavList();
      document.getElementById('favPanel').classList.add('open');
      document.getElementById('favOverlay').classList.add('open');
    }
    function closeFavPanel() {
      document.getElementById('favPanel').classList.remove('open');
      document.getElementById('favOverlay').classList.remove('open');
    }
    function renderFavList() {
      const container = document.getElementById('favList');
      updateFavCount();
      if (STATE.favorites.length === 0) {
        container.innerHTML = '<div class="p-8 text-center text-gray-400 text-sm">즐겨찾기가 없습니다.<br>검색 결과의 <iconify-icon icon="solar:bookmark-bold-duotone" width="14"></iconify-icon> 버튼을 눌러 추가하세요.</div>';
        return;
      }
      container.innerHTML = STATE.favorites.map(f => `
        <div class="fav-card" onclick="${f.url ? `window.open('${escAttr(f.url)}','_blank')` : ''}">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 mb-1">
                <span class="text-xs px-1.5 py-0.5 rounded font-medium" style="background:#f5f5f5;">${escHtml(f.type||'')}</span>
                ${f.year ? `<span class="text-xs text-gray-400">${escHtml(f.year)}</span>` : ''}
              </div>
              <p class="text-sm font-semibold leading-snug line-clamp-2">${escHtml(f.title||'')}</p>
              ${f.authors ? `<p class="text-xs text-gray-400 mt-1 truncate">${escHtml(f.authors)}</p>` : ''}
            </div>
            <button type="button" class="fav-btn active flex-shrink-0" onclick="event.stopPropagation();removeFav('${escAttr(f.id)}',this)">
              <iconify-icon icon="solar:bookmark-bold" width="16"></iconify-icon>
            </button>
          </div>
        </div>`).join('');
    }
    function removeFav(id, btn) {
      STATE.favorites = STATE.favorites.filter(f => f.id !== id);
      saveFavs();
      renderFavList();
      document.querySelectorAll(`.fav-btn`).forEach(b => {
        const icon = b.querySelector('iconify-icon');
        if (icon) icon.setAttribute('icon', 'solar:bookmark-bold-duotone');
        b.classList.remove('active');
      });
    }

    // ============================================================

    // ⑤ 연구자/기관 프로필 패널
    // ============================================================

    function showProfilePanel(btn) {
      const name = btn.dataset.name || '';
      const subtitle = btn.dataset.subtitle || '';
      document.getElementById('profileTitle').textContent = name;
      document.getElementById('profileContent').innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
            <iconify-icon icon="solar:user-circle-bold-duotone" width="32" class="text-gray-400"></iconify-icon>
          </div>
          <div>
            <p class="font-bold text-lg">${escHtml(name)}</p>
            <p class="text-sm text-gray-400">${escHtml(subtitle)}</p>
          </div>
        </div>
        <div class="text-sm text-gray-400 pt-2">검색창에서 이 연구자의 논문을 검색합니다.</div>
        <button type="button" class="btn-primary text-sm w-full mt-2" onclick="setSearchAndGo('${escAttr(name)}')">
          <iconify-icon icon="solar:magnifer-bold" width="14"></iconify-icon>논문 검색
        </button>`;
      document.getElementById('profilePanel').classList.add('open');
    }
    function closeProfilePanel() {
      document.getElementById('profilePanel').classList.remove('open');
    }

    // ============================================================

    // ⑥ 비교 검색
    // ============================================================

    function toggleCompare() {
      STATE.compareMode = !STATE.compareMode;
      const section = document.getElementById('compareSection');
      section.classList.toggle('active', STATE.compareMode);
      const btn = document.getElementById('compareToggleBtn');
      if (btn) btn.classList.toggle('active', STATE.compareMode);
      if (STATE.compareMode) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById('compareInputA').value = STATE.currentQuery || '';
      }
    }
    function renderCompareGrid(xml, gridId) {
      if (!xml) return;
      const items = getItems(xml);
      document.getElementById(gridId).innerHTML = items.length
        ? items.map((item,i) => renderCard(item, i, '')).join('')
        : '<p class="text-center text-gray-400 text-sm py-8">결과 없음</p>';
    }

    // Toast
    // ============================================================

    let toastTimeout;
    function showToast(msg, type = 'info') {
      const container = document.getElementById('toastContainer');
      container.innerHTML = '';
      clearTimeout(toastTimeout);

      const icons = {
        success: 'solar:check-circle-bold-duotone',
        error: 'solar:close-circle-bold-duotone',
        warning: 'solar:danger-circle-bold-duotone',
        info: 'solar:info-circle-bold-duotone',
      };
      const colors = {
        success: '#4ade80',
        error: '#f87171',
        warning: '#fbbf24',
        info: '#60a5fa',
      };
      const borders = {
        success: 'rgba(74,222,128,0.3)',
        error: 'rgba(239,68,68,0.3)',
        warning: 'rgba(251,191,36,0.3)',
        info: 'rgba(96,165,250,0.3)',
      };

      container.innerHTML = `
  <div class="toast" style="border-color: ${borders[type]};">
    <iconify-icon icon="${icons[type]}" style="color: ${colors[type]}; flex-shrink:0;" width="20"></iconify-icon>
    <span class="text-sm text-gray-300" style="word-break:keep-all;">${escHtml(msg)}</span>
    <button onclick="this.closest('.toast').remove()" style="margin-left:auto; color:#666; flex-shrink:0;">
      <iconify-icon icon="solar:close-circle-bold-duotone" width="16"></iconify-icon>
    </button>
  </div>`;

      toastTimeout = setTimeout(() => {
        container.innerHTML = '';
      }, 5000);
    }

    // ============================================================

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('searchInput').focus();
        document.getElementById('searchInput').select();
      }
      if (e.key === 'Escape') {
        closeSettings();
      }
    });

    // Click outside modal to close
    document.getElementById('settingsModal').addEventListener('click', function (e) {
      if (e.target === this) closeSettings();
    });

    // ============================================================


    // ── 모달 열기/닫기 ────────────────────────────────────────────
    function openBudgetModal() {
      if (!STATE.ntisKey) {
        showToast('NTIS API 인증키가 필요합니다. API 설정에서 입력해주세요.', 'warning');
        setTimeout(() => openSettings(), 600);
        return;
      }
      const query = document.getElementById('searchInput').value.trim();
      document.getElementById('budgetResultModal').classList.remove('hidden');
      if (query) {
        // 기존 검색어가 있으면 바로 분석 시작
        _startBudgetWithQuery(query);
      } else {
        // 검색어 없으면 입력 폼 표시
        document.getElementById('budgetQueryForm').classList.remove('hidden');
        document.getElementById('budgetProgressArea').classList.add('hidden');
        document.getElementById('budgetResultContent').innerHTML = '';
        document.getElementById('budgetQueryInput').value = '';
        document.getElementById('budgetQueryInput').focus();
      }
    }
    function _startBudgetWithQuery(query) {
      query = query.trim();
      if (!query) return;
      document.getElementById('budgetQueryForm').classList.add('hidden');
      runBudgetEstimation(query);
    }
    function closeBudgetModal() {
      document.getElementById('budgetResultModal').classList.add('hidden');
    }
    function closeBudgetResult() {
      document.getElementById('budgetResultModal').classList.add('hidden');
    }

    // ── 유틸: 연구비 포맷 (억 / 백만 원) ───────────────────────────
    function fmtBudget(won) {
      if (won === null || won === undefined || isNaN(won) || won < 0) return '-';
      if (won === 0) return '0원';
      const num = Number(won);
      if (num >= 100000000) return (num / 100000000).toFixed(1) + '억 원';
      if (num >= 10000000)  return (num / 10000000).toFixed(1)  + '천만 원';
      if (num >= 1000000)   return (num / 1000000).toFixed(0)   + '백만 원';
      if (num >= 1000)      return (num / 1000).toLocaleString() + '천 원';
      return Math.round(num).toLocaleString() + ' 원';
    }

    // ── 유틸: 로그 추가 ──────────────────────────────────────────
    let budgetLog = [];
    let _budgetReportData = null;   // 마지막 분석 결과 저장 (보고서 생성용)
    function addBudgetLog(icon, msg) {
      budgetLog.push({ icon, msg });
      const box = document.getElementById('budgetProcessLog');
      if (!box) return;
      box.innerHTML = budgetLog.map(l =>
        `<div class="budget-log-line"><span class="budget-log-icon">${l.icon}</span><span>${escHtml(l.msg)}</span></div>`
      ).join('');
      box.scrollTop = box.scrollHeight;
    }

    // ── 유틸: 진행 바 업데이트 (1~5) ──────────────────────────────
    function setBudgetStep(step) {
      for (let i = 1; i <= 5; i++) {
        const el = document.getElementById(`budgetStep${i}`);
        if (!el) continue;
        el.className = 'budget-step ' + (i < step ? 'done' : i === step ? 'active' : '');
      }
      const label = [
        '', 'Step 1: AI 키워드 추출 중...', 'Step 2: NTIS 과제 수집 중...', 'Step 3: 연간 정규화 + 이상치 제거 중...',
        'Step 4: AI 유사도 평가 중...', 'Step 5: 적정 연구비 산출 중...'
      ][step] || '';
      const lbl = document.getElementById('budgetStepLabel');
      if (lbl) lbl.textContent = label;
    }

    // ── Step 0: 연구내용 시놉시스 생성 (과제명 기반) ──────────────
    async function generateResearchSynopsis(projName) {
      if (!STATE.cerebrasKey) {
        return "과제명 기반 기계적 매칭 (AI 요약 미처리)";
      }
      try {
        const systemPrompt = `You are a Korean R&D expert. Based on the given PROJECT NAME, write a concise technical summary (synopsis) of what this project likely involves.
Focus on research goals and expected core technologies. 
Keep it under 80 Korean characters. No preamble.`;
        const userPrompt = `Project Name: "${projName}"`;

        const resp = await fetch('https://api.cerebras.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${STATE.cerebrasKey}`,
          },
          body: JSON.stringify({
            model: 'llama3.1-8b',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            temperature: 0.3,
            max_tokens: 150,
          }),
        });
        if (!resp.ok) return "AI 요약 생성 실패 (과제명 기반 매칭)";
        const data = await resp.json();
        return (data?.choices?.[0]?.message?.content || '').trim().substring(0, 150);
      } catch (e) {
        return "AI 연동 오류 (과제명 기반 매칭)";
      }
    }

    // ── Step 1: AI 키워드 추출 ───────────────────────────────────
    async function extractKeywordsForBudget(projName, researchContent) {
      if (!STATE.cerebrasKey) {
        // Cerebras 없으면 입력값을 그대로 키워드로 사용
        addBudgetLog('⚠️', 'Cerebras API 키 미설정 → 과제명 기반 기본 검색');
        const words = projName.split(/[\s,]+/).filter(w => w.length >= 2).slice(0, 4);
        return words.length ? [words.join(' ')] : [projName];
      }

      const systemPrompt = `You are a Korean R&D project search expert. Generate NTIS (National Science and Technology Information Service) search keywords.
Always respond with ONLY valid JSON. No explanation.`;

      const userPrompt = `New project name: "${projName}"
Research content: "${researchContent}"

Generate 3 NTIS search keyword combinations optimized for searching similar Korean R&D projects.
1. FOCUS primarily on the core technology and domain found in the Project Name.
2. The Research Content is only for technical context—do not include rare or too many specific terms from it.
3. Each keyword combination should be 2-3 words (e.g., "AI 재난안전 플랫폼").
4. One of the combinations should be the core part of the Project Name itself.

Respond ONLY with:
{"keywords": ["keyword1", "keyword2", "keyword3"]}`;

      const resp = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${STATE.cerebrasKey}`,
        },
        body: JSON.stringify({
          model: 'llama3.1-8b',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 200,
        }),
      });

      if (!resp.ok) {
        addBudgetLog('⚠️', `AI 키워드 추출 실패 (${resp.status}) → 수동 분절 검색으로 전환`);
        return extractKeywordsManual(projName);
      }

      const data = await resp.json();
      const raw = (data?.choices?.[0]?.message?.content || '').trim();
      const match = raw.match(/\{[\s\S]*?\}/);
      if (!match) return extractKeywordsManual(projName);
      try {
        const parsed = JSON.parse(match[0]);
        return Array.isArray(parsed?.keywords) && parsed.keywords.length
          ? parsed.keywords.slice(0, 3)
          : extractKeywordsManual(projName);
      } catch {
        addBudgetLog('⚠️', 'AI 키워드 JSON 파싱 실패 → 수동 분절 검색으로 전환');
        return extractKeywordsManual(projName);
      }
    }

    // AI 미설정 시 수동 키워드 추출 (최대한 쪼개서 NTIS 검색 유도)
    // AI 미설정 시 수동 키워드 추출 (핵심어 추출 및 불용어 제거)
    function extractKeywordsManual(projName) {
      // 1. 공백/콤마로 분리
      const words = projName.split(/[\s,]+/).filter(w => w.length >= 2);
      if (!words.length) return [projName];
      
      // 2. 불용어(개발, 구축 등) 제거한 핵심어군 생성
      const stopWords = ['개발', '연구', '고도화', '구축', '플랫폼', '시스템', '기반', '기술', '사업', '과제'];
      const coreWords = words.filter(w => !stopWords.includes(w));
      
      const results = [];
      // (1) 전체 과제명
      results.push(projName);
      // (2) 핵심어 조합
      if (coreWords.length >= 2) results.push(coreWords.join(' '));
      // (3) 첫 두 단어
      if (words.length >= 2) results.push(words.slice(0, 2).join(' '));
      // (4) 가장 긴 단어 (보통 기술명인 경우가 많음)
      const longest = [...words].sort((a, b) => b.length - a.length)[0];
      if (longest && !results.includes(longest)) results.push(longest);

      return [...new Set(results)].slice(0, 4);
    }

    // ── Step 2: NTIS 과제 수집 ──────────────────────────────────
    async function fetchNTISForBudget(keywords, durationYears, rndPhase, bizSect, displayCnt = 30) {
      if (!STATE.ntisKey) throw new Error('NTIS API 인증키가 필요합니다. API 설정에서 입력해주세요.');

      // ACTIVE_PROXY='direct'(프록시 미감지) 시에도 Vercel 프록시로 폴백 시도
      // VERCEL_BASE는 Vercel 도메인에서 ''(상대경로), 외부에서는 절대 URL
      const proxyBase = getProxyBase() ?? VERCEL_BASE ?? '';
      if (proxyBase === null || proxyBase === undefined) throw new Error('프록시 서버가 연결되어 있지 않습니다. 로컬 프록시(node proxy-server.js)를 실행하거나 설정에서 프록시를 선택해주세요.');

      const allItems = [];
      const seenIds = new Set();

      for (const kw of keywords) {
        addBudgetLog('🔍', `NTIS 검색: "${kw}"`);
        const params = new URLSearchParams({
          apprvKey: STATE.ntisKey,
          collection: 'project',
          SRWR: kw,      // 최신 API 필수 파라미터 병행
          query: kw,     // 하위 호환성용
          displayCnt: displayCnt,
          startPosition: 1,
          searchRnkn: 'Y',
          naviCount: 5,
        });

        // addQuery는 사용하지 않음 — 형식 오류 시 API 0건 원인이 되므로 클라이언트 필터로만 처리

        const sleep = ms => new Promise(r => setTimeout(r, ms));
        let tries = 0;
        let resp;
        
        while (tries < 3) {
          try {
            resp = await fetch(`${proxyBase}/ntis?${params.toString()}`);
            if (resp.status === 429) {
              addBudgetLog('⏳', `API 부하(429) 발생 → 재시도 준비 (${tries + 1}/3)`);
              await sleep(600 + Math.random() * 400);
              tries++;
              continue;
            }
            break;
          } catch (e) {
            tries++;
            await sleep(500);
          }
        }

        try {
          if (!resp || !resp.ok) {
            addBudgetLog('⚠️', `"${kw}" HTTP 오류: ${resp ? resp.status : '응답 없음'}`);
            continue;
          }
          const text = await resp.text();
          const xml = new DOMParser().parseFromString(text, 'text/xml');

          // XML 파싱 오류 감지
          if (xml.getElementsByTagName('parsererror').length > 0) {
            addBudgetLog('⚠️', `"${kw}" XML 파싱 실패 — 유효하지 않은 응답`);
            addBudgetLog('🔍', `RAW 응답: ${text.substring(0, 300)}`);
            continue;
          }

          // NTIS API 오류 코드 감지 (일반 검색과 동일하게 처리)
          const gxErr = (tag) => xml.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
          const errCode = gxErr('CODE') || gxErr('returnCode');
          const errMsg  = gxErr('MESSAGE') || gxErr('returnMsg');
          if (errCode && errCode !== '0') {
            addBudgetLog('❌', `NTIS API 오류 [${errCode}]: ${errMsg}`);
            throw new Error(`NTIS API 오류 [${errCode}]: ${errMsg}`);
          }

          // HIT 태그 폴백 (NTIS 응답 구조 변형 대응)
          let items = Array.from(xml.getElementsByTagName('HIT'));
          if (items.length === 0) items = Array.from(xml.getElementsByTagName('item'));
          if (items.length === 0) items = Array.from(xml.getElementsByTagName('row'));
          if (items.length === 0) items = Array.from(xml.getElementsByTagName('record'));

          // [PATCH] 공백이 포함된 검색어인데 결과가 0건인 경우, 띄어쓰기를 무시하고 검색 시도 (NTIS 특성 대응)
          if (items.length === 0 && kw.includes(' ')) {
            const noSpaceKw = kw.replace(/\s+/g, '');
            addBudgetLog('🔍', `결과 0건 → 띄어쓰기 제거 재검색: "${noSpaceKw}"`);
            params.set('query', noSpaceKw);
            params.set('SRWR', noSpaceKw);
            
            let resp2 = await fetch(`${proxyBase}/ntis?${params.toString()}`);
            if (resp2.status === 429) {
              await sleep(800);
              resp2 = await fetch(`${proxyBase}/ntis?${params.toString()}`);
            }

            if (resp2 && resp2.ok) {
              const text2 = await resp2.text();
              const xml2 = new DOMParser().parseFromString(text2, 'text/xml');
              items = Array.from(xml2.getElementsByTagName('HIT'));
              if (items.length === 0) items = Array.from(xml2.getElementsByTagName('item'));
              if (items.length === 0) items = Array.from(xml2.getElementsByTagName('row'));
              if (items.length === 0) items = Array.from(xml2.getElementsByTagName('record'));
            }
          }
          
          // 수집 전 약간의 지연 (연속 호출 방지)
          await sleep(150);

          // 아이템이 0건인 경우 진단용 RAW 응답 출력
          if (items.length === 0) {
            const rootTag = xml.documentElement?.tagName || '(없음)';
            const totalHits = xml.getElementsByTagName('TOTALHITS')[0]?.textContent?.trim()
                           || xml.getElementsByTagName('totalCount')[0]?.textContent?.trim() || '?';
            addBudgetLog('⚠️', `"${kw}" 0건 — XML 루트: <${rootTag}>, TOTALHITS: ${totalHits}`);
            addBudgetLog('🔍', `RAW: ${text.substring(0, 500)}`);
          }

          addBudgetLog('📦', `"${kw}" → ${items.length}건 수집`);

          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            // [PATCH] 대소문자 무시 검색 및 계층/평면 구조 동시 지원 유틸리티
            const gv = (tagName, subTagName) => {
              const findElLower = (root, tag) => {
                if (!root || !tag) return null;
                const tagLower = tag.toLowerCase();
                return Array.from(root.children).find(e => e.tagName.toLowerCase() === tagLower) || 
                       root.getElementsByTagName(tag)[0] || 
                       root.getElementsByTagName(tagLower)[0];
              };
              
              let el = findElLower(item, tagName);
              if (!el) return '';
              
              if (subTagName) {
                const sub = findElLower(el, subTagName);
                return sub?.textContent?.trim() || '';
              }
              return el.textContent?.trim() || '';
            };

            const parseMoney = (s) => {
              if (!s) return 0;
              // 콤마, 공백 제거 및 숫자만 추출하여 parseFloat 처리
              const cleaned = String(s).replace(/[^0-9.]/g, '');
              const val = parseFloat(cleaned);
              return isNaN(val) ? 0 : val;
            };

            const pjtId = gv('ProjectNumber') || gv('PJT_ID') || gv('PJTID') || gv('pjtId') || i;
            if (pjtId && seenIds.has(pjtId)) continue;
            if (pjtId) seenIds.add(pjtId);

            const projNm    = gv('ProjectTitle', 'Korean') || gv('ProjectTitle') || '';
            const absContent= gv('Abstract', 'Full') || gv('Abstract') || gv('Goal', 'Full') || '';
            
            // NTIS API 연구비 파싱 (실제 XML 태그 확인된 필드)
            const totFund   = parseMoney(gv('TotalFunds') || '0');
            const fundGov   = parseMoney(gv('GovernmentFunds') || '0');

            // ProjectPeriod: <Start>20240601</Start> (YYYYMMDD 8자)
            const prdStartRaw = gv('ProjectPeriod', 'Start') || gv('ProjectPeriod', 'TotalStart') || '';
            const prdEndRaw   = gv('ProjectPeriod', 'End')   || gv('ProjectPeriod', 'TotalEnd')   || '';
            const prdStart    = prdStartRaw.substring(0, 4);
            const prdEnd      = prdEndRaw.substring(0, 4);

            // 연구개발단계: <DevelopmentPhases>개발연구</DevelopmentPhases>
            const phase     = gv('DevelopmentPhases') || gv('ResearchPhase') || gv('RND_PHASE') || '';
            const biz       = gv('BusinessName') || gv('BusinessSector') || gv('BIZ_SECT') || '';
            const perfOrg   = gv('ResearchAgency', 'Name') || gv('LeadAgency') || '';

            // [Step 2] 연도 필터 (너무 오래된 과제 제외, 거스 연도 없으면 통과)
            const startYr = parseInt(prdStart);
            const curYr   = new Date().getFullYear();
            if (prdStart && !isNaN(startYr) && startYr < curYr - 15) continue; // 15년 이내로 완화

            // 수행연수 계산 (기간 정보 있는 경우에만)
            const hasPeriod = prdStart && prdEnd && !isNaN(parseInt(prdStart)) && !isNaN(parseInt(prdEnd));
            const projYrs   = hasPeriod ? Math.max(1, parseInt(prdEnd) - parseInt(prdStart) + 1) : 0;

            // 수행기간 필터 (사용자 희망기간 ±1년, 기간 정보 없으면 통과)
            if (durationYears > 0 && hasPeriod && Math.abs(projYrs - durationYears) > 1) continue;

            // 연구개발단계 필터
            if (rndPhase && rndPhase !== '전체' && rndPhase !== 'ALL' && phase && !phase.includes(rndPhase)) continue;

            // 사업유형 필터
            if (bizSect && bizSect !== '전체' && bizSect !== 'ALL' && biz && !biz.includes(bizSect)) continue;

            // ── 연간 예산 산출 ──────────────────────────────────────
            let annualBudget = 0;
            let budgetSource = '';
            
            if (totFund > 0 && hasPeriod) {
              annualBudget = totFund / projYrs;
              budgetSource = 'avg';
            } else if (totFund > 0) {
              // 기간 없거나 1년 이하 단기 과제 처리: totFund 그대로 연간으로 간주
              annualBudget = totFund;
              budgetSource = 'est';
            } else if (fundGov > 0) {
              annualBudget = fundGov;
              budgetSource = 'gov';
            }

            annualBudget = Number(annualBudget) || 0;
            
            allItems.push({ projNm, annualBudget, budgetSource, totFund, prdStart, prdEnd, projYrs, phase, biz, perfOrg, absContent, pjtId });
          }
        } catch (e) {
          addBudgetLog('⚠️', `"${kw}" 검색 오류: ${e.message}`);
        }
      }

      addBudgetLog('✅', `메타 필터 후 ${allItems.length}건 확보`);
      return allItems;
    }

    // ── Step 3: 연간 정규화 + IQR 이상치 제거 ────────────────────
    function normalizeAndClean(items) {
      // annualBudget > 0 항목만으로 IQR 계산 (0-budget 항목이 Q1을 0으로 끌어내리는 왜곡 방지)
      const budgetItems = items.filter(i => i.annualBudget > 0);
      const zeroBudget  = items.filter(i => i.annualBudget === 0);

      if (budgetItems.length < 3) {
        // budget 확인 항목이 3건 미만이면 IQR 의미 없음 → 전체 반환
        addBudgetLog('📊', `IQR 생략 (연구비 확인 과제 ${budgetItems.length}건 미만) → ${items.length}건 전체 사용`);
        return items;
      }

      const budgets = budgetItems.map(i => i.annualBudget).sort((a, b) => a - b);
      const n = budgets.length;
      const q1 = budgets[Math.floor(n * 0.25)];
      const q3 = budgets[Math.floor(n * 0.75)];
      const iqr = q3 - q1;

      let multiplier = 3.0;
      let cleaned = budgetItems.filter(i => i.annualBudget >= q1 - multiplier * iqr && i.annualBudget <= q3 + multiplier * iqr);

      // 3건 미만 → IQR 배수 4.0으로 추가 완화
      if (cleaned.length < 3) {
        multiplier = 4.0;
        cleaned = budgetItems.filter(i => i.annualBudget >= q1 - multiplier * iqr && i.annualBudget <= q3 + multiplier * iqr);
      }

      // budget 유효 과제가 부족하면 budget=0 과제로 보충 (최대 5건)
      if (cleaned.length < 5 && zeroBudget.length > 0) {
        const supplement = zeroBudget.slice(0, 5 - cleaned.length);
        cleaned = [...cleaned, ...supplement];
      }

      const removed = items.length - cleaned.length;
      addBudgetLog('📊', `IQR 이상치 제거: ${removed}건 제외 → ${cleaned.length}건 남음 (Q1: ${fmtBudget(q1)}, Q3: ${fmtBudget(q3)})`);
      return cleaned;
    }

    // ── Step 4: AI 유사도 평가 ───────────────────────────────────
    async function aiSimilarityEval(projName, researchContent, items) {
      if (!STATE.cerebrasKey || items.length <= 5) {
        // AI 없거나 이미 5건 이하 → 통계 기반 선정
        // 유사도를 순서 기반으로 차등 부여하면 가중평균이 왜곡되므로 균등값(null) 처리
        const topN = items.slice(0, 7);
        topN.forEach((item) => {
          item.similarity = null;   // null = AI 미평가 표시 (가중평균 계산에서 제외)
          item.aiReason   = '통계 기반 선정 (AI 미평가)';
        });
        addBudgetLog('📌', `AI 평가 생략 → 통계 기반 Top ${topN.length}건 선정`);
        return topN;
      }

      addBudgetLog('🤖', `AI 유사도 평가 중... (${items.length}건 후보)`);

      const candidateList = items.slice(0, 20).map((item, i) =>
        `[${i}] ${item.projNm} | 연간 ${fmtBudget(item.annualBudget)} | ${item.prdStart}~${item.prdEnd} | ${item.perfOrg}\n초록: ${(item.absContent || '').substring(0, 100)}`
      ).join('\n---\n');

      const systemPrompt = `You are a Korean R&D budget expert. Evaluate similarity between a new project and existing NTIS projects.
Always respond ONLY with valid JSON. No extra text.`;

      const userPrompt = `New project:
Name: "${projName}"
Research content: "${researchContent}"

Candidate NTIS projects (index: name | annual budget | period | org):
${candidateList}

Select the Top 5 projects most similar to the New Project based on these weighted criteria:
- Technical similarity (45%): research goals, core technologies, and theoretical methodology
- Scope/Scale fit (30%): R&D stage (TRL), scale of work, and type of deliverables
- Recency & Policy fit (15%): proximity to current date (newer is better) and policy context
- Biz Sector fit (10%): organization type (e.g., 출연(연), 대학, 민간) similarity

Consider ONLY the project name and the generated synopsis for evaluation.

Respond ONLY with:
{"selected": [
  {"index": 0, "similarity": 88, "reason": "2-sentence explanation in Korean"}
]}`;

      try {
        const resp = await fetch('https://api.cerebras.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${STATE.cerebrasKey}`,
          },
          body: JSON.stringify({
            model: 'llama3.1-8b',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 800,
          }),
        });

        if (!resp.ok) throw new Error(`Cerebras ${resp.status}`);

        const data = await resp.json();
        const raw = (data?.choices?.[0]?.message?.content || '').trim();

        // 2단계 JSON 파싱: Korean reason 필드의 특수문자로 인한 SyntaxError 대응
        let parsed;
        try {
          // 1차: "selected" 키를 포함한 JSON 블록 추출
          const match = raw.match(/\{[\s\S]*"selected"[\s\S]*\}/);
          if (!match) throw new Error('selected 키 없음');
          parsed = JSON.parse(match[0]);
        } catch {
          // 2차: index/similarity 값만 정규식으로 직접 추출 (reason 파싱 포기)
          const idxMatches = [...raw.matchAll(/"index"\s*:\s*(\d+)/g)];
          const simMatches = [...raw.matchAll(/"similarity"\s*:\s*(\d+)/g)];
          parsed = {
            selected: idxMatches.map((m, i) => ({
              index: parseInt(m[1]),
              similarity: parseInt(simMatches[i]?.[1]) || 80,
              reason: 'AI 분석 기반 (reason 파싱 실패)',
            })),
          };
          if (parsed.selected.length === 0) throw new Error('AI 응답에서 index 추출 실패');
          addBudgetLog('⚠️', `JSON 1차 파싱 실패 → index/similarity 직접 추출 (${parsed.selected.length}건)`);
        }

        const rawResult = (parsed?.selected || []);
        const result = rawResult
          .map(s => {
            const idx = parseInt(s.index);
            if (isNaN(idx)) return null;
            const item = items[idx];
            if (!item) return null;
            // 복사본을 만들어 원본 items 배열의 무결성 유지 (부수효과 방지)
            const newItem = { ...item };
            newItem.similarity = parseInt(s.similarity) || 80;
            newItem.aiReason = s.reason || 'AI 분석 기반 선정';
            return newItem;
          })
          .filter(Boolean);
        
        // [SAFETY] AI가 아무것도 선택하지 않았거나 형식이 틀린 경우 폴백
        if (result.length === 0) {
          console.warn('[Budget AI] Empty selection, falling back');
          throw new Error('AI가 유효한 유사 과제를 선정하지 못했습니다.');
        }

        // AI 선정 건수가 3건 미만이면 budget>0 항목으로 보충
        if (result.length < 3) {
          const selectedPjtIds = new Set(result.map(i => i.pjtId).filter(Boolean));
          const supplement = items
            .filter(i => i.annualBudget > 0 && !selectedPjtIds.has(i.pjtId))
            .slice(0, 3 - result.length)
            .map(item => ({ ...item, similarity: null, aiReason: '통계 기반 보충 선정' }));
          if (supplement.length > 0) {
            const aiCount = result.length;
            result.push(...supplement);
            addBudgetLog('📌', `AI 선정 ${aiCount}건 + 통계 보충 ${supplement.length}건 = 총 ${result.length}건`);
          }
        }

        addBudgetLog('✅', `AI 유사과제 ${result.length}건 선정 완료`);
        return result;
      } catch (err) {
        addBudgetLog('⚠️', `AI 평가 오류 (${err.message}) → 통계 기반으로 대체`);
        // budget > 0 항목 우선 선택 (API 응답 순서 의존 방지)
        const withBudget    = items.filter(i => i.annualBudget > 0);
        const withoutBudget = items.filter(i => i.annualBudget === 0);
        const topN = [...withBudget, ...withoutBudget].slice(0, 7);
        topN.forEach((item, i) => { item.similarity = Math.round(90 - i * 5); item.aiReason = '통계 기반 선정'; });
        return topN;
      }
    }

    // ── Step 5: 최종 예산 산출 ───────────────────────────────────
    function calcBudgetRange(selectedItems) {
      if (!selectedItems || !Array.isArray(selectedItems) || selectedItems.length === 0) {
        console.error('[Budget Error] selectedItems empty');
        return null;
      }
      
      // budget > 0인 항목으로 침, 몟으면 전체 항목 사position
      let budgets = selectedItems
        .map(i => Number(i.annualBudget))
        .filter(v => !isNaN(v) && v > 0)
        .sort((a, b) => a - b);
      
      // budget > 0인 항목이 없지만 selectedItems가 있다면 전체 budget으로 대체 (수집은 되었는데 budget이 0인 경우)
      if (budgets.length === 0 && selectedItems.length > 0) {
        // 연구비 데이터가 없는 경우 평균적 추정값 3억 사용
        return {
          median: 300000000,
          weightedAvg: null,
          q1: 200000000,
          q3: 400000000,
          avg: 300000000,
          sd: 100000000,
          cv: 33,
          avgSimilarity: null,
          confidence: 'C',
          min: 200000000,
          max: 400000000,
          n: selectedItems.length,
          isEstimated: true,
        };
      }
      
      const n = budgets.length;
      if (n === 0) {
        console.error('[Budget Error] budgets empty after processing');
        return null;
      }

      // 사분위
      const q1 = budgets[Math.floor(n * 0.25)];
      const q3 = budgets[Math.floor(n * 0.75)];

      // 기준값: max(산술평균, Q3) → R&D 예산 우편향 분포 특성 반영 (평균 > Q3 > 중앙값)
      const sum0 = budgets.reduce((s, v) => s + v, 0);
      const avg0 = sum0 / n;
      const median = Math.round(Math.max(avg0, q3));

      // AI 유사도 가중 평균: similarity가 실제 AI 평가값(null이 아닌)인 항목만 반영
      // null(AI 미평가)이면 가중평균 대신 산술평균을 표시
      const aiEvaluated = selectedItems.filter(i => i.similarity !== null);
      let weightedAvg = null;
      if (aiEvaluated.length > 0) {
        const totalWeight = aiEvaluated.reduce((s, i) => s + i.similarity, 0);
        weightedAvg = aiEvaluated.reduce((s, i) =>
          s + i.annualBudget * (i.similarity / totalWeight), 0);
      }

      // 산술 평균 + 표준편차
      const sum = budgets.reduce((s, v) => s + (Number(v) || 0), 0);
      const avg = sum / n;
      const sd  = Math.sqrt(budgets.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / n);

      // 변동계수(CV): 분포 신뢰도 판단 지표 (50% 초과 시 편차 큼)
      const cv = avg > 0 ? (sd / avg) * 100 : 0;

      // AI 유사도 평균
      const avgSimilarity = aiEvaluated.length > 0
        ? Math.round(aiEvaluated.reduce((s, i) => s + i.similarity, 0) / aiEvaluated.length)
        : null;

      // 신뢰 등급: A(10건↑ + CV<50) / B(5~9건 또는 CV<80) / C(5건↓ 또는 CV≥80)
      let confidence = 'A';
      if (n < 5 || cv >= 80) confidence = 'C';
      else if (n < 10 || cv >= 50) confidence = 'B';

      return { 
        median: median || avg || 0, // 중앙값이 0일 경우 평균이라도 사용
        weightedAvg, 
        q1, 
        q3, 
        avg, 
        sd, 
        cv, 
        avgSimilarity, 
        confidence, 
        min: budgets[0] || 0, 
        max: budgets[n-1] || 0, 
        n 
      };
    }

    // ── 결과 대시보드 렌더링 ─────────────────────────────────────
    function renderBudgetDashboard(projName, durationYears, selectedItems, budgetRange) {
      // null 체크 — runBudgetEstimation에서 이미 처리되므로 여기서는 조용히 리턴
      if (!budgetRange) return;

      const dYrs = parseInt(durationYears) || 1;
      const totalMedian = budgetRange.median * dYrs;

      // ── 신뢰도 등급 UI 설정 ─────────────────────────────────────
      const confidenceCfg = {
        A: { label: '신뢰도 높음',  color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: 'solar:shield-check-bold-duotone' },
        B: { label: '신뢰도 보통',  color: '#b45309', bg: '#fffbeb', border: '#fde68a', icon: 'solar:shield-warning-bold-duotone' },
        C: { label: '표본 부족 — 참고용 추정치', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', icon: 'solar:shield-cross-bold-duotone' },
      };
      const cf = confidenceCfg[budgetRange.confidence];

      // ── 신뢰도 경고 배너 ────────────────────────────────────────
      const warningBanners = [];
      if (budgetRange.n < 5) {
        warningBanners.push(`⚠️ 표본 ${budgetRange.n}건 — 통계적 대표성이 낮습니다. 키워드를 조정하거나 필터를 완화하여 재시도를 권장합니다.`);
      } else if (budgetRange.n < 10) {
        warningBanners.push(`⚠️ 표본 ${budgetRange.n}건 — 10건 미만으로 범위 추정 신뢰도가 제한적입니다.`);
      }
      if (budgetRange.cv >= 80) {
        warningBanners.push(`⚠️ 변동계수 ${Math.round(budgetRange.cv)}% — 과제 간 연구비 편차가 매우 큽니다. 이기종 과제가 혼재할 수 있습니다.`);
      } else if (budgetRange.cv >= 50) {
        warningBanners.push(`⚠️ 변동계수 ${Math.round(budgetRange.cv)}% — 연구비 분포 편차가 높아 범위 해석 시 주의가 필요합니다.`);
      }
      if (budgetRange.avgSimilarity !== null && budgetRange.avgSimilarity < 65) {
        warningBanners.push(`⚠️ AI 유사도 평균 ${budgetRange.avgSimilarity}점 — 유사과제 매칭 품질이 낮습니다. 과제명을 구체적으로 입력해 주세요.`);
      }
      const warningHTML = warningBanners.length
        ? `<div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:0.75rem; padding:0.875rem 1rem; margin-bottom:1.25rem; font-size:0.8rem; color:#92400e; line-height:1.8;">
            ${warningBanners.map(w => `<div>${w}</div>`).join('')}
           </div>`
        : '';

      // ── 과제 테이블 ─────────────────────────────────────────────
      // projNm에는 NTIS 검색 하이라이트 태그(<span class="search_word">)가 포함될 수 있으므로 제거
      const stripTags = (html) => (html || '').replace(/<[^>]*>/g, '');

      const tableHTML = selectedItems.map((item) => {
        const simDisplay = item.similarity !== null
          ? `<div style="font-size:0.75rem; font-weight:600; color:#374151;">${item.similarity}점</div>
             <div class="budget-score-bar"><div class="budget-score-fill" style="width:${item.similarity}%"></div></div>`
          : `<div style="font-size:0.7rem; color:#9ca3af;">AI 미평가</div>`;
        const sourceTag = item.budgetSource === 'thyr'
          ? `<span style="font-size:0.65rem; color:#f59e0b; background:#fffbeb; border:1px solid #fde68a; border-radius:3px; padding:1px 4px; margin-left:4px;">당해연도</span>`
          : item.budgetSource === 'est'
          ? `<span style="font-size:0.65rem; color:#6b7280; background:#f3f4f6; border:1px solid #d1d5db; border-radius:3px; padding:1px 4px; margin-left:4px;">기간미상/3년가정</span>`
          : '';

        const cleanNm = escHtml(stripTags(item.projNm) || '-');
        const ntisUrl = item.pjtId
          ? `https://www.ntis.go.kr/project/pjtInfo.do?pjtId=${encodeURIComponent(item.pjtId)}&pageCode=TH_PJT_PJT_DTL`
          : '';
        const nameCell = ntisUrl
          ? `<a href="${ntisUrl}" target="_blank" rel="noopener"
               style="font-weight:600; color:#111; text-decoration:none; display:block;"
               onmouseover="this.style.color='#7c3aed';this.style.textDecoration='underline';"
               onmouseout="this.style.color='#111';this.style.textDecoration='none';"
               title="NTIS 상세 보기">${cleanNm}
               <iconify-icon icon="solar:arrow-right-up-linear" width="11" style="color:#9ca3af; vertical-align:middle; margin-left:2px;"></iconify-icon>
             </a>`
          : `<span style="font-weight:600; color:#111;">${cleanNm}</span>`;

        return `
        <tr>
          <td>${nameCell}</td>
          <td style="white-space:nowrap; font-weight:700; color:#7c3aed;">${fmtBudget(item.annualBudget)}${sourceTag}</td>
          <td style="white-space:nowrap; color:#6b7280;">${item.prdStart || '?'}~${item.prdEnd || '?'}${item.projYrs ? ` (${item.projYrs}년)` : ''}</td>
          <td>${escHtml((stripTags(item.perfOrg) || '-').substring(0, 15))}</td>
          <td>${simDisplay}</td>
          <td style="font-size:0.75rem; color:#6b7280; max-width:200px;">${escHtml((item.aiReason || '-').substring(0, 80))}</td>
        </tr>`;
      }).join('');

      const logHTML = budgetLog.map(l =>
        `<div class="budget-log-line"><span class="budget-log-icon">${l.icon}</span><span>${escHtml(l.msg)}</span></div>`
      ).join('');

      // 가중평균: AI 평가된 경우만 표시
      const weightedAvgHTML = budgetRange.weightedAvg !== null
        ? `<div class="budget-kpi-card">
            <div class="budget-kpi-label">🤖 AI 유사도 가중 평균</div>
            <div class="budget-kpi-value">${fmtBudget(budgetRange.weightedAvg)}</div>
            <div class="budget-kpi-sub">AI 평가 ${budgetRange.n}건 유사도 반영</div>
           </div>`
        : `<div class="budget-kpi-card">
            <div class="budget-kpi-label">📐 산술 평균</div>
            <div class="budget-kpi-value">${fmtBudget(budgetRange.avg)}</div>
            <div class="budget-kpi-sub">AI 미평가 — 단순 평균값</div>
           </div>`;

      // Q1~Q3 범위 레이블: 표본 충분 여부 표시
      const rangeLabel = budgetRange.n >= 10
        ? `권장 예산 범위 (Q1~Q3): ${fmtBudget(budgetRange.q1)} ~ ${fmtBudget(budgetRange.q3)}`
        : `참고 범위 (Min~Max, 표본 ${budgetRange.n}건): ${fmtBudget(budgetRange.min)} ~ ${fmtBudget(budgetRange.max)}`;

      document.getElementById('budgetResultContent').innerHTML = `
        <div style="margin-bottom:1.25rem; text-align:center;">
          <div style="display:inline-flex; align-items:center; gap:0.4rem; background:${cf.bg}; color:${cf.color}; font-size:0.75rem; font-weight:700; padding:0.3rem 0.85rem; border-radius:1rem; margin-bottom:0.5rem; border:1px solid ${cf.border};">
            <iconify-icon icon="${cf.icon}" width="14"></iconify-icon>
            ${cf.label} · 표본 ${budgetRange.n}건 · CV ${Math.round(budgetRange.cv)}%${budgetRange.avgSimilarity !== null ? ` · 유사도 평균 ${budgetRange.avgSimilarity}점` : ''}
          </div>
          <h3 style="font-size:1.25rem; font-weight:800; color:#111; margin-bottom:0.25rem;">${escHtml(projName)}</h3>
        </div>

        ${warningHTML}

        <div style="background:linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%); border-radius:1.5rem; padding:2rem; margin-bottom:2rem; color:#fff; text-align:center; box-shadow: 0 10px 20px -5px rgba(124, 58, 237, 0.3);">
          <p style="font-size:0.875rem; font-weight:500; opacity:0.9; margin-bottom:0.5rem;">연간 적정 연구비 (중상위 추정 기준)</p>
          <h2 style="font-size:3rem; font-weight:900; margin-bottom:1rem; letter-spacing:-0.025em;">${fmtBudget(budgetRange.median)}</h2>
          <div style="display:inline-flex; gap:0.5rem; align-items:center; background:rgba(255,255,255,0.2); backdrop-filter:blur(4px); padding:0.6rem 1.2rem; border-radius:2rem; font-size:0.875rem; font-weight:700; border:1px solid rgba(255,255,255,0.3);">
            <iconify-icon icon="solar:shield-check-bold-duotone" style="font-size:1.1rem;"></iconify-icon>
            ${rangeLabel}
          </div>
        </div>

        <div class="budget-kpi-grid" style="margin-bottom:2rem;">
          ${weightedAvgHTML}
          <div class="budget-kpi-card">
            <div class="budget-kpi-label">📅 총 연구비 추정 (${dYrs}년)</div>
            <div class="budget-kpi-value">${fmtBudget(totalMedian)}</div>
            <div class="budget-kpi-sub">중상위 추정값 × ${dYrs}년</div>
          </div>
          <div class="budget-kpi-card">
            <div class="budget-kpi-label">📊 연구비 분포 범위</div>
            <div class="budget-kpi-value" style="font-size:1.1rem;">${fmtBudget(budgetRange.min)}<br>~ ${fmtBudget(budgetRange.max)}</div>
            <div class="budget-kpi-sub">유효 과제 전체 범위</div>
          </div>
        </div>

        <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:1rem; padding:1.25rem; margin-bottom:2rem; font-size:0.875rem; line-height:1.6; color:#4b5563;">
          <h4 style="font-size:0.9rem; font-weight:800; color:#111827; margin-bottom:0.75rem; display:flex; align-items:center; gap:0.5rem;">
            <iconify-icon icon="solar:lightbulb-bold-duotone" style="color:#f59e0b;"></iconify-icon>
            산출 근거 및 해석 가이드
          </h4>
          최근 8년 내 NTIS 과제 ${budgetRange.n}건을 IQR 이상치 제거 후 분석했습니다.
          중앙값 <strong>${fmtBudget(budgetRange.median)}/년</strong>을 기준값으로 제안합니다.
          ${budgetRange.n >= 10
            ? `Q1~Q3 범위 <strong>${fmtBudget(budgetRange.q1)} ~ ${fmtBudget(budgetRange.q3)}</strong> 내에서 과제 특성에 맞게 조정하세요.`
            : `표본이 ${budgetRange.n}건으로 적어 Q1~Q3 범위보다 Min~Max(<strong>${fmtBudget(budgetRange.min)} ~ ${fmtBudget(budgetRange.max)}</strong>)를 참고 범위로 활용하세요.`
          }
          ${budgetRange.weightedAvg !== null ? `AI 유사도 가중평균 <strong>${fmtBudget(budgetRange.weightedAvg)}</strong>과 중앙값의 차이가 크면 이상치 존재 가능성을 검토하세요.` : ''}
        </div>

        <div style="margin-bottom:1.5rem;">
          <h4 style="font-size:1rem; font-weight:800; color:#111827; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;">
            <iconify-icon icon="solar:ranking-bold-duotone" style="color:#7c3aed;"></iconify-icon>
            ${budgetRange.weightedAvg !== null ? 'AI 선정' : '통계 기반'} 유사과제 리스트 (Top-${selectedItems.length})
          </h4>
          <div style="overflow-x:auto;">
            <table class="budget-table">
              <thead>
                <tr>
                  <th>과제명</th>
                  <th>연간 연구비</th>
                  <th>수행기간</th>
                  <th>수행기관</th>
                  <th>유사도</th>
                  <th>선정 사유</th>
                </tr>
              </thead>
              <tbody>${tableHTML}</tbody>
            </table>
          </div>
        </div>

        <details style="margin-bottom:1rem;">
          <summary style="font-size:0.8125rem; font-weight:600; color:#6b7280; cursor:pointer; margin-bottom:0.5rem;">🔍 분석 프로세스 로그 보기</summary>
          <div class="budget-process-log">${logHTML}</div>
        </details>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1.25rem; padding-top:1rem; border-top:1px solid #f3f4f6;">
          <p style="font-size:0.7rem; color:#9ca3af;">
            * 본 결과는 NTIS 공개 과제 데이터 기반 참고 자료이며, 공식 예산 심의 근거로 단독 활용은 지양해 주세요.
          </p>
          <button type="button" class="btn-budget-secondary" onclick="showBudgetReport()"
            style="white-space:nowrap; display:flex; align-items:center; gap:0.375rem; flex-shrink:0; margin-left:1rem;">
            <iconify-icon icon="solar:document-text-bold-duotone" width="15" style="color:#7c3aed;"></iconify-icon>
            기획보고서 초안 복사
          </button>
        </div>
      `;

      document.getElementById('budgetProgressArea').classList.add('hidden');
      document.getElementById('budgetResultModal').classList.remove('hidden');

      // 보고서 생성을 위해 결과 저장
      _budgetReportData = { projName, durationYears: dYrs, selectedItems, budgetRange };
    }

    // ── 기획보고서 초안 생성 ─────────────────────────────────────
    function generateBudgetReportText({ projName, durationYears, selectedItems, budgetRange }) {
      const today = new Date();
      const dateStr = `${today.getFullYear()}년 ${today.getMonth()+1}월 ${today.getDate()}일`;
      const dYrs = parseInt(durationYears) || 1;
      const br = budgetRange;
      const stripTags = (s) => (s || '').replace(/<[^>]*>/g, '');

      const confidenceLabel = { A: 'A등급 (신뢰도 높음)', B: 'B등급 (신뢰도 보통)', C: 'C등급 (표본 부족 — 참고용)' };

      // 근거 과제 표
      const tableRows = selectedItems.map((item, i) => {
        const nm   = stripTags(item.projNm || '-').substring(0, 40);
        const org  = stripTags(item.perfOrg || '-').substring(0, 12);
        const period = item.prdStart && item.prdEnd ? `${item.prdStart}~${item.prdEnd}` : '기간미상';
        const budget = fmtBudget(item.annualBudget);
        const sim  = item.similarity !== null ? `${item.similarity}점` : 'AI미평가';
        const reason = (item.aiReason || '-').replace(/\n/g, ' ').substring(0, 50);
        return `  ${String(i+1).padStart(2)}. ${nm.padEnd(40)} | ${budget.padEnd(10)} | ${period.padEnd(12)} | ${org.padEnd(12)} | ${sim.padEnd(7)} | ${reason}`;
      }).join('\n');

      const rangeDesc = br.n >= 10
        ? `Q1~Q3 범위: ${fmtBudget(br.q1)} ~ ${fmtBudget(br.q3)} (표본 ${br.n}건 기준)`
        : `참고 범위(Min~Max): ${fmtBudget(br.min)} ~ ${fmtBudget(br.max)} (표본 ${br.n}건, 통계적 신뢰도 제한)`;

      const weightedDesc = br.weightedAvg !== null
        ? `AI 유사도 가중평균: ${fmtBudget(br.weightedAvg)} (유사도 점수 반영)`
        : `산술 평균: ${fmtBudget(br.avg)} (AI 미평가)`;

      return `
■ 신규과제 적정 연구개발비 산출 보고서
${'='.repeat(64)}
□ 분석 과제명: ${projName}
□ 분석 일시  : ${dateStr}
□ 데이터 출처: 국가과학기술지식정보서비스(NTIS) 공개 과제 DB
□ 분석 방법  : NTIS 통계 기반 + AI 하이브리드 5단계 파이프라인 (v2)

${'─'.repeat(64)}
1. 분석 방법 및 절차
${'─'.repeat(64)}

본 분석은 NTIS(국가과학기술지식정보서비스) 공개 과제 데이터를
활용한 5단계 하이브리드 파이프라인으로 수행되었습니다.

  [Step 1] AI 키워드 추출 및 후보 확보
    - 과제명에서 핵심 기술 키워드를 AI(LLaMA 기반)가 추출
    - NTIS 과제명(projNm) 필드 대상 복수 쿼리 실행
    - 목표 후보: 30~50건 확보

  [Step 2] 정책 메타데이터 필터링
    - 최근 8년 이내 과제로 한정 (시점 적합성 확보)
    - 연구개발단계, 사업유형, 수행기간 기준으로 동질 과제 선별

  [Step 3] 연간 예산 정규화 + IQR 이상치 제거
    - 총연구비(totFund) ÷ 수행연수 → 연간 예산 환산
    - IQR(사분위수 범위) 통계 기법으로 극단 이상치 제거
    - IQR × 1.5 범위 초과 과제 자동 제외

  [Step 4] AI 4차원 유사도 평가 (과제명 기반)
    - 기술적 유사성  45% : 연구 목표·핵심 기술·방법론 일치도
    - 규모·범위 적합 30% : TRL 단계, 성과물 유형 유사도
    - 최신성·정책 부합 15% : 최근 과제 우선, 정책 방향 부합
    - 사업유형 일치  10% : 수행 구조(출연연/산학연 등) 유사성

  [Step 5] 최종 적정 연구비 산출
    - 중앙값   : 이상치 영향 최소화 → 기준값(Primary)
    - 가중평균 : AI 유사도 점수를 가중치로 반영
    - 범위     : Q1~Q3 (표본 10건 이상 시) 또는 Min~Max

${'─'.repeat(64)}
2. 산출 결과
${'─'.repeat(64)}

  ○ 적정 연간 연구비 (중앙값 기준) : ${fmtBudget(br.median)}
  ○ ${rangeDesc}
  ○ ${weightedDesc}
  ○ 총 연구비 추정 (${dYrs}년 기준)  : ${fmtBudget(br.median * dYrs)}
     - 범위: ${fmtBudget(br.min * dYrs)} ~ ${fmtBudget(br.max * dYrs)}

  [분석 품질 지표]
  ○ 유효 표본 수   : ${br.n}건
  ○ 신뢰 등급      : ${confidenceLabel[br.confidence] || br.confidence}
  ○ 변동계수(CV)   : ${Math.round(br.cv)}% ${br.cv >= 50 ? '⚠ 편차 높음 — 이기종 과제 혼재 가능' : '(양호)'}
  ${br.avgSimilarity !== null ? `○ AI 유사도 평균  : ${br.avgSimilarity}점 ${br.avgSimilarity < 65 ? '⚠ 유사도 낮음' : ''}` : '○ AI 유사도 평균  : AI 미평가'}

${'─'.repeat(64)}
3. 근거 과제 목록 (유사과제 Top-${selectedItems.length})
${'─'.repeat(64)}

  No. 과제명                                     | 연간연구비   | 수행기간      | 수행기관      | 유사도   | 선정 사유(요약)
  ${'─'.repeat(120)}
${tableRows}

${'─'.repeat(64)}
4. 해석 및 활용 방안
${'─'.repeat(64)}

  ○ 제안 예산 기준값: ${fmtBudget(br.median)}/년
     위 중앙값을 신규과제의 연간 연구비 기준으로 활용하되,
     과제 고유 특성(신규 장비 구축, 대규모 실증 등)을 감안하여
     ${rangeDesc.split('범위:').pop().trim()} 내에서 조정하는 것을 권장합니다.

  ○ 총 연구비 편성 참고값: ${fmtBudget(br.median * dYrs)} (${dYrs}년 기준 중앙값)
     사업 특성에 따라 초기 집중형 또는 균등 배분형 연차 계획을
     별도 수립하시기 바랍니다.

  ○ 유의 사항
     - 변동계수 ${Math.round(br.cv)}%: ${br.cv >= 50 ? '편차가 높아 단일 대표값 사용 시 주의가 필요합니다.' : '분포가 비교적 안정적입니다.'}
     - 표본 ${br.n}건 기반 분석으로, ${br.n < 10 ? '표본 수가 적어 통계적 대표성이 제한될 수 있습니다.' : '충분한 표본으로 통계적 신뢰도를 확보했습니다.'}
     - 본 결과는 NTIS 공개 데이터 기반 참고 자료입니다.
       공식 예산 심의 시 추가적인 전문가 검토를 병행하시기 바랍니다.

${'─'.repeat(64)}
5. 근거 자료 출처
${'─'.repeat(64)}

  - 데이터: 국가과학기술지식정보서비스(NTIS) 통합검색 오픈 API
    (https://www.ntis.go.kr)
  - 분석 도구: ScienceON NTIS 검색 시스템 내 적정 연구비 산출 모듈
  - 분석 기준일: ${dateStr}
  - AI 엔진: Cerebras LLaMA (키워드 추출·유사도 평가)

${'='.repeat(64)}
※ 본 보고서는 NTIS 공개 과제 데이터를 기반으로 자동 생성된
   참고 자료입니다. 최종 예산 편성 시 관련 부처 지침 및 내부
   심의 기준을 우선 적용하시기 바랍니다.
${'='.repeat(64)}
`.trim();
    }

    function showBudgetReport() {
      if (!_budgetReportData) {
        showToast('먼저 분석을 실행해주세요.', 'warning');
        return;
      }
      const text = generateBudgetReportText(_budgetReportData);
      document.getElementById('budgetReportText').value = text;
      document.getElementById('budgetReportModal').classList.remove('hidden');
    }

    function closeBudgetReport() {
      document.getElementById('budgetReportModal').classList.add('hidden');
    }

    async function copyBudgetReport() {
      const ta = document.getElementById('budgetReportText');
      try {
        await navigator.clipboard.writeText(ta.value);
        showToast('보고서가 클립보드에 복사됐습니다.', 'success');
        const btn = document.getElementById('budgetReportCopyBtn');
        btn.innerHTML = '<iconify-icon icon="solar:check-circle-bold-duotone" width="15"></iconify-icon> 복사됨';
        setTimeout(() => { btn.innerHTML = '<iconify-icon icon="solar:copy-bold-duotone" width="15"></iconify-icon> 전체 복사'; }, 2000);
      } catch {
        ta.select();
        document.execCommand('copy');
        showToast('보고서가 클립보드에 복사됐습니다.', 'success');
      }
    }

    // ── 메인 진입점 ───────────────────────────────────────────────
    async function runBudgetEstimation(projName) {
      const durationYears  = 0;
      const rndPhase       = "ALL";
      const bizSect        = "ALL";

      const runBtn = document.getElementById('runBtn');
      if (runBtn) {
        runBtn.disabled = true;
        runBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;"></span> 분석 중...';
      }

      // 로그 초기화 + 진행 바 표시
      budgetLog = [];
      document.getElementById('budgetResultContent').innerHTML = '';
      document.getElementById('budgetProgressArea').classList.remove('hidden');
      document.getElementById('budgetProcessLog').innerHTML = '';
      setBudgetStep(1);

      try {
        // ── Step 0: AI 연구내용 시놉시스 생성 ──────────────────
        addBudgetLog('🤖', 'Step 0: 과제명 기반 핵심 연구내용 유추 중...');
        const aiSynopsis = await generateResearchSynopsis(projName);
        addBudgetLog('📝', `유추된 연구내용: ${aiSynopsis}`);

        // ── Step 1: AI 키워드 추출 ──────────────────────────────
        addBudgetLog('🤖', 'Step 1: AI 키워드 최적화 시작...');
        const keywords = await extractKeywordsForBudget(projName, aiSynopsis);
        addBudgetLog('✅', `추출된 키워드: ${keywords.join(', ')}`);

        // ── Step 2: NTIS 과제 수집 (3단계 Fallback 전략) ───────────
        setBudgetStep(2);
        addBudgetLog('📡', 'Step 2: NTIS 과제 데이터 수집 시작 (1단계: AI 키워드)');
        let rawItems = await fetchNTISForBudget(keywords, durationYears, rndPhase, bizSect);
        
        // 2단계: 수동 분절 검색 (AI 결과가 부족할 때)
        if (rawItems.length < 5) {
          addBudgetLog('⚠️', '결과가 부족합니다. 2단계: 과제명 핵심어 분절 검색을 시도합니다...');
          const fallbackKeywords = extractKeywordsManual(projName);
          const secondItems = await fetchNTISForBudget(fallbackKeywords, durationYears, rndPhase, bizSect);
          
          // 중복 제거 및 합치기
          const seenIds = new Set(rawItems.map(i => i.pjtId));
          secondItems.forEach(item => {
            if (!seenIds.has(item.pjtId)) {
              rawItems.push(item);
              seenIds.add(item.pjtId);
            }
          });
        }

        // 3단계: 초광역 검색 (데이터가 정말 없을 때)
        if (rawItems.length === 0) {
          addBudgetLog('⚠️', '여전히 데이터가 없습니다. 3단계: 연도 필터를 완화하여 초광역 검색을 시도합니다...');
          // 첫 단어로 아주 넓게 검색 (단, AI 유사도 평가에서 걸러질 것임)
          const firstWord = projName.split(/[\s,]+/)[0];
          const superBroadKeywords = [firstWord];
          // durationYears=0으로 넘겨서 기간 필터 사실상 해제
          rawItems = await fetchNTISForBudget(superBroadKeywords, 0, 'ALL', 'ALL', 100);
        }

        if (rawItems.length === 0) {
          showToast('모든 검색 시도에도 불구하고 NTIS 과제를 찾지 못했습니다. 과제명을 더 일반적인 용어로 수정해보세요.', 'warning');
          if (runBtn) {
            runBtn.disabled = false;
            runBtn.innerHTML = '<iconify-icon icon="solar:calculator-bold-duotone" width="18"></iconify-icon> 분석 시작';
          }
          document.getElementById('budgetProgressArea').classList.add('hidden');
          return;
        }

        // ── Step 3: IQR 이상치 제거 ─────────────────────────────
        setBudgetStep(3);
        addBudgetLog('📊', 'Step 3: 연간 정규화 + IQR 이상치 제거...');
        const cleanedItems = normalizeAndClean(rawItems);

        // Guard: IQR 후 0건이면 rawItems로 폴백
        const effectiveItems = cleanedItems.length > 0 ? cleanedItems : rawItems;
        if (cleanedItems.length === 0) {
          addBudgetLog('⚠️', 'IQR 이상치 제거 후 0건 → 원본 데이터로 폴백');
        }

        // ── Step 4: AI 유사도 평가 ──────────────────────────────────────────
        setBudgetStep(4);
        addBudgetLog('🔬', 'Step 4: AI 4차원 유사도 평가 시작...');
        const selectedItems = await aiSimilarityEval(projName, aiSynopsis, effectiveItems);

        // Guard: AI/통계 선정 후에도 0건이면 직접 상위 7건 선택
        const finalItems = selectedItems.length > 0
          ? selectedItems
          : effectiveItems.filter(i => i.annualBudget > 0).slice(0, 7);
        if (selectedItems.length === 0) {
          addBudgetLog('⚠️', 'AI/통계 선정 실패 → budget > 0 항목 상위 7건 직접 사용');
          finalItems.forEach(item => { item.similarity = null; item.aiReason = '직접 선정 (폴백)'; });
        }

        // ── Step 5: 최종 예산 산출 ───────────────────────────────────────────────
        setBudgetStep(5);
        addBudgetLog('💰', 'Step 5: 중앙값·가중평균·범위 산출...');
        let budgetRange = calcBudgetRange(finalItems);

        // finalItems budget 데이터 없음 → effectiveItems에서 직접 재시도
        if (!budgetRange && effectiveItems.length > 0) {
          addBudgetLog('⚠️', 'finalItems 산출 실패 → effectiveItems 직접 사용 (폴백)');
          const fallbackItems = effectiveItems.filter(i => i.annualBudget > 0).slice(0, 7);
          fallbackItems.forEach(item => { item.similarity = null; item.aiReason = '직접 선정 (폴백)'; });
          if (fallbackItems.length > 0) budgetRange = calcBudgetRange(fallbackItems);
        }

        console.log('[Budget Final] Range:', budgetRange);

        if (!budgetRange) {
          addBudgetLog('❌', '예산 산출 실패 — 수집된 과제의 연구비 데이터가 없거나 부족합니다');
          showToast('유사 과제를 찾지 못했습니다. 검색어나 필터 조건을 조정해보세요.', 'warning');
          return;
        }

        addBudgetLog('🎉', `분석 완료! 적정 연간 연구비 중앙값: ${fmtBudget(budgetRange.median)}`);
        renderBudgetDashboard(projName, durationYears, finalItems, budgetRange);

      } catch (err) {
        console.error('[Budget]', err);
        showToast('분석 오류: ' + err.message, 'error');
        addBudgetLog('❌', '오류: ' + err.message);
      } finally {
        if (runBtn) {
          runBtn.disabled = false;
          runBtn.innerHTML = '<iconify-icon icon="solar:calculator-bold-duotone" width="18"></iconify-icon> 분석 시작';
        }
      }
    }

    // ============================================================
    // Feature 2: 클라이언트 사이드 정렬
    // ============================================================

    function renderInsightsBar() {
      const sortBar = document.getElementById('sortBar');
      if (sortBar) sortBar.classList.remove('hidden');
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      const defaultBtn = document.querySelector('.sort-btn[data-sort=""]');
      if (defaultBtn) defaultBtn.classList.add('active');
      renderKeywordCloud();
    }

    function applyClientSort(criterion) {
      document.querySelectorAll('.sort-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.sort === criterion);
      });
      const cards = Array.from(document.querySelectorAll('#resultsGrid .result-card'));
      if (cards.length === 0) return;
      const sorted = cards.slice().sort((a, b) => {
        if (criterion === 'year-desc') return (parseInt(b.dataset.year) || 0) - (parseInt(a.dataset.year) || 0);
        if (criterion === 'year-asc')  return (parseInt(a.dataset.year) || 0) - (parseInt(b.dataset.year) || 0);
        if (criterion === 'title')     return (a.dataset.title || '').localeCompare(b.dataset.title || '', 'ko');
        return 0;
      });
      const grid = document.getElementById('resultsGrid');
      sorted.forEach(card => grid.appendChild(card));
    }

    // ============================================================
    // Feature 4+5: 연도별/기관별 분포 차트
    // ============================================================

    let _yearChart = null;
    let _instChart = null;

    function showYearInstCharts() {
      if (!STATE.currentItems || STATE.currentItems.length === 0) {
        showToast('먼저 검색을 실행해주세요', 'warning');
        return;
      }

      // 연도 분포 집계
      const yearFreq = {};
      STATE.currentItems.forEach(item => {
        const y = (item.year || '').substring(0, 4);
        if (y && /^\d{4}$/.test(y)) yearFreq[y] = (yearFreq[y] || 0) + 1;
      });
      const yearLabels = Object.keys(yearFreq).sort();
      const yearData = yearLabels.map(y => yearFreq[y]);

      // 기관 분포 집계 (DOM에서 publisher 텍스트 파싱)
      const instFreq = {};
      document.querySelectorAll('#resultsGrid .result-card').forEach(card => {
        const pubEl = card.querySelector('p.text-sm.text-secondary');
        if (!pubEl) return;
        const text = pubEl.textContent || '';
        const parts = text.split('·');
        const inst = (parts[1] || parts[0] || '').trim().replace(/\s+/g, ' ').substring(0, 25);
        if (inst && inst.length > 1) instFreq[inst] = (instFreq[inst] || 0) + 1;
      });
      const instEntries = Object.entries(instFreq).sort((a, b) => b[1] - a[1]).slice(0, 8);

      // 모달 표시
      const modal = document.getElementById('analyticsModal');
      if (!modal) return;
      modal.classList.remove('hidden');
      document.getElementById('analyticsQuery').textContent =
        '"' + STATE.currentQuery + '" — ' + STATE.currentItems.length + '건 기준';

      // 기존 차트 파괴
      if (_yearChart) { _yearChart.destroy(); _yearChart = null; }
      if (_instChart) { _instChart.destroy(); _instChart = null; }

      // 연도 차트
      const yearWrap = document.getElementById('yearChartWrap');
      if (yearWrap) yearWrap.innerHTML = '<canvas id="yearChartCanvas"></canvas>';
      const yearCtx = document.getElementById('yearChartCanvas');
      if (yearCtx && yearLabels.length > 0) {
        _yearChart = new Chart(yearCtx, {
          type: 'bar',
          data: {
            labels: yearLabels,
            datasets: [{ label: '건수', data: yearData, backgroundColor: 'rgba(59,130,246,0.75)', borderRadius: 4 }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
          }
        });
      } else if (yearWrap) {
        yearWrap.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">연도 데이터 없음</p>';
      }

      // 기관 차트
      const instWrap = document.getElementById('instChartWrap');
      if (instWrap) instWrap.innerHTML = '<canvas id="instChartCanvas"></canvas>';
      const instCtx = document.getElementById('instChartCanvas');
      if (instCtx && instEntries.length > 0) {
        const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'];
        _instChart = new Chart(instCtx, {
          type: 'doughnut',
          data: {
            labels: instEntries.map(e => e[0]),
            datasets: [{ data: instEntries.map(e => e[1]), backgroundColor: COLORS.slice(0, instEntries.length), borderWidth: 2, borderColor: '#fff' }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { font: { size: 10 }, boxWidth: 12, padding: 6 } } }
          }
        });
      } else if (instWrap) {
        instWrap.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">기관 데이터 없음</p>';
      }
    }

    function closeAnalyticsModal() {
      const modal = document.getElementById('analyticsModal');
      if (modal) modal.classList.add('hidden');
    }

    // ============================================================
    // Feature 6: 연관 키워드 클라우드
    // ============================================================

    function renderKeywordCloud() {
      const container = document.getElementById('keywordCloud');
      if (!container) return;
      if (!STATE.currentItems || STATE.currentItems.length === 0) {
        container.innerHTML = '';
        return;
      }
      const freq = {};
      STATE.currentItems.forEach(item => {
        if (!item.keywords) return;
        item.keywords.split(/[;,|]/).map(k => k.trim()).filter(k => k && k.length > 1 && k.length < 30).forEach(k => {
          const key = k.toLowerCase();
          if (!freq[key]) freq[key] = { display: k, count: 0 };
          freq[key].count++;
        });
      });
      const top = Object.values(freq)
        .filter(e => e.display.toLowerCase() !== (STATE.currentQuery || '').toLowerCase())
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);
      if (top.length === 0) { container.innerHTML = ''; return; }
      const maxCount = top[0].count;
      container.innerHTML = top.map(({ display, count }) => {
        const sz = count === maxCount ? 'text-sm font-bold' : count >= maxCount * 0.6 ? 'text-xs font-semibold' : 'text-xs';
        const op = count >= maxCount * 0.6 ? '' : 'opacity-70';
        return `<button type="button" class="keyword-cloud-tag ${sz} ${op}" onclick="setSearchAndGo('${escAttr(display)}')" title="${escAttr(display)} (${count}건)">${escHtml(display)}<span class="text-[10px] opacity-50 ml-0.5">${count}</span></button>`;
      }).join('');
    }

    // ============================================================
    // Feature 11: 저자명 클릭 → 연구자 검색
    // ============================================================

    function renderAuthorLinks(authors, query) {
      if (!authors) return '';
      const auList = authors.split(/[;,|]/).map(a => a.trim()).filter(Boolean);
      const display = auList.slice(0, 3);
      const extra = auList.length > 3 ? ` <span class="text-tertiary">외 ${auList.length - 3}명</span>` : '';
      const hl = (text) => {
        if (!text || !query) return escHtml(text);
        return escHtml(text).replace(new RegExp(`(${escRegex(query)})`, 'gi'), '<mark>$1</mark>');
      };
      return display.map(a =>
        `<span class="author-link" onclick="event.stopPropagation();searchByAuthor('${escAttr(a)}')" title="${escAttr(a)} 연구자 검색">${hl(a)}</span>`
      ).join(', ') + extra;
    }

    function searchByAuthor(name) {
      if (!name) return;
      document.getElementById('searchInput').value = name;
      if (!STATE.currentTarget.startsWith('NTIS_')) {
        const btn = document.querySelector('#tabsScienceON [data-target="RESEARCHER"]');
        if (btn) {
          document.querySelectorAll('#tabsScienceON .tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          STATE.currentTarget = 'RESEARCHER';
        }
      }
      doSearch();
    }
