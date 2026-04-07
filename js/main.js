    // ============================================================
    // Main Entry & Initialization
    // ============================================================

    (async function init() {
      // 최초 실행 시 기본값 자동 설정
      if (!localStorage.getItem('sc_client_id')) {
        localStorage.setItem('sc_client_id', DEFAULTS.clientId);
        localStorage.setItem('sc_api_key', DEFAULTS.apiKey);
        localStorage.setItem('sc_mac_addr', DEFAULTS.macAddr);
      }
      if (!localStorage.getItem('sc_ntis_key')) {
        localStorage.setItem('sc_ntis_key', DEFAULTS.ntisKey);
      }
      STATE.clientId    = localStorage.getItem('sc_client_id') || '';
      STATE.token       = localStorage.getItem('sc_token') || '';
      STATE.refreshToken= localStorage.getItem('sc_refresh_token') || '';
      STATE.tokenExpire = localStorage.getItem('sc_token_expire') || '';
      STATE.apiKey      = localStorage.getItem('sc_api_key') || '';
      STATE.macAddr     = localStorage.getItem('sc_mac_addr') || '';
      STATE.ntisKey     = localStorage.getItem('sc_ntis_key') || '';
      STATE.cerebrasKey = localStorage.getItem('sc_cerebras_key') || '';
      
      initTheme();
      updateFavCount();
      await checkProxy();

      // 토큰이 없고 자격증명이 있으면 자동 발급 시도
      if (!STATE.token && STATE.clientId && STATE.apiKey && STATE.macAddr && PROXY_AVAILABLE) {
        await autoRequestToken();
      } else if (STATE.token && STATE.tokenExpire) {
        scheduleTokenRefresh();
        updateTokenExpireDisplay();
      }

      // URL 파라미터에서 자동 검색
      const urlParams = new URLSearchParams(location.search);
      const initQ = urlParams.get('q');
      const initT = urlParams.get('t');
      if (initQ) {
        document.getElementById('searchInput').value = initQ;
        if (initT && initT.startsWith('NTIS')) {
          setDatabase('NTIS');
          setTimeout(() => doNTISSearch(), 300);
        } else {
          if (initT) {
            const btn = document.querySelector(`[data-target="${initT}"]`);
            if (btn) setTarget(btn, false);
          }
          setTimeout(() => doSearch(), 300);
        }
      }
    })();

    // Global Key Events
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const active = document.activeElement;
        if (active.id === 'searchInput') doSearch();
        else if (active.id === 'compareInputA' || active.id === 'compareInputB') runCompare();
      }
      if (e.key === 'Escape') {
        closeSettings();
        closeHistory();
        closeFavorites();
        document.getElementById('analysisSection').classList.add('hidden');
      }
    });
