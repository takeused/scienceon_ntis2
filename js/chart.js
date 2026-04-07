    // ============================================================
    // Visualization & Analysis (D3, Chart.js, AI Reports)
    // ============================================================

    async function runTrendAnalysis() {
      const query = document.getElementById('searchInput').value.trim();
      if (!query) { showToast('검색어를 입력해주세요', 'warning'); return; }
      
      const analysisSection = document.getElementById('analysisSection');
      analysisSection.classList.remove('hidden');
      analysisSection.innerHTML = `
        <div class="analysis-card">
          <div class="analysis-header flex items-center justify-between">
            <span class="font-bold">📊 트렌드 분석 중...</span>
            <div class="spinner"></div>
          </div>
          <div class="analysis-body"><div id="trendChartContainer" style="height:300px;"></div></div>
        </div>`;

      // Simulating trend data fetch or actual fetch if needed
      // For now, let's just render a mock chart as a placeholder for the trend logic
      renderTrendChart('trendChartContainer', query);
    }

    function renderTrendChart(containerId, query) {
      const ctx = document.createElement('canvas');
      document.getElementById(containerId).appendChild(ctx);
      
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['2019', '2020', '2021', '2022', '2023', '2024'],
          datasets: [{
            label: `"${query}" 관련 논문/특허 추이`,
            data: [12, 19, 3, 5, 2, 3].map(v => v * Math.random() * 10),
            borderColor: '#3b82f6',
            tension: 0.4,
            fill: true,
            backgroundColor: 'rgba(59, 130, 246, 0.1)'
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    function renderNetwork(items, centerQuery) {
      const container = document.getElementById('networkContainer');
      if (!container) return;
      container.innerHTML = '';
      const W = container.clientWidth || 800;
      const H = container.clientHeight || 520;

      const kwFreq = {};
      items.forEach(item => {
        const kw = getVal(item, 'Keyword') || '';
        kw.split(/[;|,]/).map(k => k.trim()).filter(k => k && k !== centerQuery).forEach(k => {
          kwFreq[k] = (kwFreq[k] || 0) + 1;
        });
      });
      const topKws = Object.entries(kwFreq).sort((a,b) => b[1]-a[1]).slice(0, 20);

      const nodes = [{ id: centerQuery, group: 0, size: 20 },
        ...topKws.map(([k,v]) => ({ id: k, group: 1, size: Math.min(5 + v * 3, 18) }))];
      const links = topKws.map(([k]) => ({ source: centerQuery, target: k }));

      const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);

      const sim = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(100))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(W/2, H/2));

      const link = svg.append('g').selectAll('line').data(links).join('line')
        .attr('stroke', '#e2e8f0').attr('stroke-width', 1.5);

      const node = svg.append('g').selectAll('g').data(nodes).join('g')
        .call(d3.drag()
          .on('start', (e,d) => { if(!e.active) sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
          .on('drag',  (e,d) => { d.fx=e.x; d.fy=e.y; })
          .on('end',   (e,d) => { if(!e.active) sim.alphaTarget(0); d.fx=null; d.fy=null; }));

      node.append('circle').attr('r', d => d.size).attr('fill', d => d.group === 0 ? '#1e293b' : '#3b82f6');
      node.append('text').text(d => d.id).attr('dy', d => d.size + 15).attr('text-anchor', 'middle').attr('font-size', '11px');

      sim.on('tick', () => {
        link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
        node.attr('transform', d => `translate(${d.x},${d.y})`);
      });
    }

    // [Step 4] R&D Budget Calculation
    function calcBudgetRange(items) {
      if (!items || items.length === 0) return null;
      const budgets = items.map(t => parseInt(t.budget) || 0).filter(b => b > 0).sort((a,b)=>a-b);
      if (budgets.length === 0) return null;
      const mid = budgets[Math.floor(budgets.length/2)];
      return { min: budgets[0], max: budgets[budgets.length-1], median: mid };
    }
