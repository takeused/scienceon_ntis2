    // ============================================================
    // State & Constants
    // ============================================================

    const STATE = {
      clientId: '',
      token: '',
      refreshToken: '',
      tokenExpire: '',
      apiKey: '',
      macAddr: '',
      ntisKey: '',
      cerebrasKey: '',
      currentTarget: 'ARTI',
      currentQuery: '',
      currentPage: 1,
      totalCount: 0,
      rowCount: 10,
      isLoading: false,
      advancedOpen: false,
      // 새 기능용
      searchHistory: JSON.parse(localStorage.getItem('sc_history') || '[]'),
      favorites: JSON.parse(localStorage.getItem('sc_favorites') || '[]'),
      currentItems: [],   // CSV 내보내기용 현재 결과 데이터
      compareMode: false,
    };

    // 기본값 (최초 실행 시 자동 설정)
    const DEFAULTS = {
      clientId: 'f6e85ce67ce13fa852a3f7d46b3b79eaa230e7ec7d59390164a07ff036c91198',
      apiKey: '6bb5af492a2647d085822e2afd75b9c5',
      macAddr: '9C-6B-00-8C-64-FD',
      ntisKey: 'y1vodniheb3q8w6j47f2',
    };

    const NTIS_BASE = 'https://www.ntis.go.kr';

    // ── 프록시 우선순위: 로컬(3737) → Vercel(Seoul/icn1) → Cloudflare Worker → 직접 호출
    const PROXY_BASE     = 'http://127.0.0.1:3737';
    // file 프로토콜 직접 접근 시 운영 Vercel, 로컬/운영 호스팅 시 동적 오리진 사용
    const VERCEL_BASE    = window.location.protocol === 'file:' ? 'https://scienceon-ntis.vercel.app' : '';
    const CF_WORKER_BASE = 'https://scienceon-proxy.takeused.workers.dev';
    const API_BASE_DIRECT  = 'https://apigateway.kisti.re.kr/openapicall.do';
    const TOKEN_URL_DIRECT = 'https://apigateway.kisti.re.kr/tokenrequest.do';

    // 현재 활성 프록시 ('local' | 'vercel' | 'worker' | 'direct')
    let ACTIVE_PROXY = 'direct';
    Object.defineProperty(window, 'PROXY_AVAILABLE', {
      get() { return ACTIVE_PROXY !== 'direct'; },
      configurable: true,
    });
