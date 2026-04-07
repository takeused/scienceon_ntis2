    // ============================================================
    // UI Rendering & Event Handlers
    // ============================================================

    function showToast(msg, type = 'info') {
      const t = document.createElement('div');
      t.className = `toast toast-${type}`;
      t.innerHTML = `
        <iconify-icon icon="${type === 'success' ? 'solar:check-circle-bold-duotone' : type === 'warning' ? 'solar:danger-bold-duotone' : type === 'error' ? 'solar:close-circle-bold-duotone' : 'solar:info-circle-bold-duotone'}"></iconify-icon>
        <span>${msg}</span>`;
      document.getElementById('toastContainer').appendChild(t);
      setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 500); }, 3000);
    }

    function setLoading(show) {
      STATE.isLoading = show;
      document.getElementById('loadingState').classList.toggle('hidden', !show);
    }

    function hideAll() {
      ['emptyState', 'noResultState', 'loadingState', 'analysisSection'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      });
      document.getElementById('resultsGrid').innerHTML = '';
      document.getElementById('pagination').classList.add('hidden');
      document.getElementById('resultsHeader').classList.add('hidden');
    }

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
    // Result Rendering
    // ============================================================

    function renderResults(xml, query) {
      const grid = document.getElementById('resultsGrid');
      const items = getItems(xml);
      const totalStr = xml.querySelector('TotalCount')?.textContent || '0';
      const total = parseInt(totalStr);
      STATE.totalCount = total;

      setLoading(false);
      grid.innerHTML = items.length
        ? items.map((item, i) => renderCard(item, i, query)).join('')
        : '<div class="text-center py-20 text-gray-500">결과가 없습니다.</div>';

      renderPagination(total, STATE.currentPage, STATE.rowCount);
      document.getElementById('resultsHeader').classList.remove('hidden');
      document.getElementById('totalCountLabel').textContent = total.toLocaleString();
    }

    function getItems(xml) {
      // 실제 API 응답 구조: <recordList><record rownum="N">...</record></recordList>
      const records = Array.from(xml.querySelectorAll('recordList record, record'));
      if (records.length > 0) return records;

      // fallback: 이전 방식
      const target = STATE.currentTarget;
      const selectors = {
        ARTI: 'ARTI, Article', PATENT: 'PATENT, Patent',
        REPORT: 'REPORT, Report', ATT: 'ATT', TREND: 'TREND',
      };
      return Array.from(xml.querySelectorAll(selectors[target] || target));
    }

    function getVal(item, ...fields) {
      for (const f of fields) {
        const byMeta = item.querySelector(`item[metaCode="${f}"]`);
        if (byMeta && byMeta.textContent.trim()) return byMeta.textContent.trim();
        const byTag = item.querySelector(f);
        if (byTag && byTag.textContent.trim()) return byTag.textContent.trim();
      }
      return '';
    }

    function renderCard(item, idx, query) {
      const target = STATE.currentTarget;
      const title = getVal(item, 'Title', 'ScentTitle');
      const authors = getVal(item, 'Author', 'AuthorNameKor');
      const year = getVal(item, 'Pubyear', 'PublDate');
      const publisher = getVal(item, 'Publisher', 'AuthorInstKor');
      
      const hl = (text) => {
        if (!text || !query) return escHtml(text);
        const regex = new RegExp(`(${escRegex(query)})`, 'gi');
        return escHtml(text).replace(regex, '<mark>$1</mark>');
      };

      return `
        <div class="result-card" style="animation-delay: ${idx * 50}ms">
          <div class="flex items-start gap-4">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-2">
                <span class="badge ${getBadge(target)}">${getTargetLabel(target)}</span>
                <span class="text-xs text-gray-500">${year}</span>
              </div>
              <h3 class="font-bold text-gray-200 mb-2 leading-snug hover:text-blue-400 cursor-pointer transition-colors">${hl(title)}</h3>
              <p class="text-xs text-gray-400 line-clamp-1">${escHtml(authors)} | ${escHtml(publisher)}</p>
            </div>
          </div>
        </div>`;
    }

    function getBadge(target) {
      const map = { ARTI: 'badge-blue', PATENT: 'badge-purple', REPORT: 'badge-green', ATT: 'badge-yellow' };
      return map[target] || 'badge-gray';
    }

    function getTargetLabel(target) {
      const map = { ARTI: '논문', PATENT: '특허', REPORT: '보고서', ATT: '동향', NTIS_prjt: 'NTIS 과제', RESEARCHER: '연구자', ORGAN: '기관', TREND: '트렌드' };
      return map[target] || target;
    }

    // ============================================================
    // UI Helpers
    // ============================================================

    function escHtml(str) { return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
    function escAttr(str) { return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
    function escRegex(s) { return s.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&'); }

    // ============================================================
    // Modal Helpers
    // ============================================================

    function openSettings() {
      ['clientIdInput', 'tokenInput', 'refreshTokenInput', 'apiKeyInput', 'macAddrInput', 'ntisKeyInput', 'cerebrasKeyInput'].forEach(id => {
        const stateKey = id.replace('Input', '');
        document.getElementById(id).value = STATE[stateKey] || '';
      });
      document.getElementById('settingsModal').classList.remove('hidden');
    }

    function closeSettings() { document.getElementById('settingsModal').classList.add('hidden'); }

    function toggleCompare() {
      STATE.compareMode = !STATE.compareMode;
      const section = document.getElementById('compareSection');
      const btn = document.getElementById('compareToggleBtn');
      section.classList.toggle('hidden', !STATE.compareMode);
      btn.classList.toggle('text-blue-400', STATE.compareMode);
      if (STATE.compareMode) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById('compareInputA').value = STATE.currentQuery || '';
      }
    }

    function renderCompareGrid(xml, gridId) {
      if (!xml) return;
      const items = getItems(xml);
      document.getElementById(gridId).innerHTML = items.length
        ? items.map((item, i) => renderCard(item, i, '')).join('')
        : '<p class="text-center text-gray-400 text-sm py-8">결과 없음</p>';
    }

    // (Add more UI functions as needed. This is a slimmed version.)