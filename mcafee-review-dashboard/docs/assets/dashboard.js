/* McAfee Review Dashboard - Revamped Reviews Tab v2.1 */
(function() {
  'use strict';
  
  let DATA = null;
  let FILTERED_STATS = null;
  let FILTERED_REVIEWS = null;
  let currentPage = 1;
  const REVIEWS_PER_PAGE = 25;
  let activeFilters = {
    platform: 'all',
    rating: 'all',
    sentiment: 'all',
    notable: 'all',
    search: ''
  };
  
  // Data Schema Validation
  function validateData(data) {
    const errors = [];
    
    if (!data || typeof data !== 'object') {
      errors.push('Data is not a valid object');
      return { valid: false, errors };
    }
    
    if (!data.metadata) errors.push('Missing metadata');
    if (!Array.isArray(data.daily_stats)) errors.push('daily_stats must be an array');
    if (!Array.isArray(data.recent_reviews)) errors.push('recent_reviews must be an array');
    
    if (data.recent_reviews && data.recent_reviews.length > 0) {
      const sample = data.recent_reviews[0];
      const requiredFields = ['id', 'platform', 'rating', 'text', 'date', 'sentiment'];
      requiredFields.forEach(field => {
        if (!(field in sample)) errors.push(`Missing required field: ${field}`);
      });
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  // Show error state
  function showErrorState(message, details = '') {
    const main = document.querySelector('.main-content');
    if (main) {
      main.innerHTML = `
        <div style="padding: 3rem; text-align: center; color: var(--gray-600);">
          <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
          <h2 style="color: var(--danger); margin-bottom: 0.5rem;">Dashboard Error</h2>
          <p style="margin-bottom: 1rem;">${message}</p>
          ${details ? `<pre style="background: var(--gray-100); padding: 1rem; border-radius: 8px; text-align: left; font-size: 0.8rem; overflow-x: auto;">${details}</pre>` : ''}
        </div>
      `;
    }
  }
  
  // Show loading overlay (doesn't destroy DOM elements)
  function showLoadingState() {
    if (document.getElementById('loading-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(248,250,252,0.9);z-index:1000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="text-align:center;color:#64748B;">
        <div style="font-size:3rem;margin-bottom:1rem;">⏳</div>
        <h2>Loading Dashboard...</h2>
        <p>Fetching review data</p>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  
  function hideLoadingState() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.remove();
  }
  
  // Show empty state for reviews
  function showEmptyState(containerId, message = 'No reviews found') {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `
        <div style="padding: 3rem; text-align: center; color: var(--gray-500);">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🔍</div>
          <p style="font-size: 1rem; margin-bottom: 0.5rem;">${message}</p>
          <p style="font-size: 0.85rem; color: var(--gray-400);">Try adjusting your filters</p>
        </div>
      `;
    }
  }
  
  // Initialize
  async function init() {
    console.log('Dashboard initializing...');
    showLoadingState();
    
    try {
      const resp = await fetch('data/dashboard_data.json');
      if (!resp.ok) throw new Error(`Failed to load data: ${resp.status} ${resp.statusText}`);
      
      DATA = await resp.json();
      
      // Validate data integrity
      const validation = validateData(DATA);
      if (!validation.valid) {
        console.error('Data validation failed:', validation.errors);
        showErrorState('Data validation failed', validation.errors.join('\n'));
        return;
      }
      
      console.log(`✅ Data validated: ${DATA.recent_reviews.length} reviews loaded`);
      
      // Default to Last 1 Month for both tabs
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      FILTERED_STATS = DATA.daily_stats.filter(d => new Date(d.date) >= cutoff);
      FILTERED_REVIEWS = DATA.recent_reviews.filter(r => new Date(r.date) >= cutoff);
      
      document.getElementById('total-reviews-meta').textContent = 
        FILTERED_REVIEWS.length + ' reviews (Last 30 days)';
      
      // Show last updated time
      const lastUpdated = document.getElementById('last-updated');
      if (lastUpdated && DATA.metadata?.generated_at) {
        const date = new Date(DATA.metadata.generated_at);
        lastUpdated.textContent = 'Updated: ' + date.toLocaleDateString();
      }
      
      initTabs();
      initDateFilters();
      initReviewFilters();
      initExportButton();
      renderKPIs();
      renderOverviewCharts();
      renderReviews();
      hideLoadingState();
      
      console.log('Dashboard ready - showing Last 30 days');
    } catch(e) {
      console.error('Error:', e);
      hideLoadingState();
      showErrorState('Failed to load dashboard data', e.message);
    }
  }
  
  // CSV Export functionality
  function initExportButton() {
    // Add export button to header
    const headerMeta = document.querySelector('.header-meta');
    if (headerMeta && !document.getElementById('export-btn')) {
      const exportBtn = document.createElement('button');
      exportBtn.id = 'export-btn';
      exportBtn.className = 'header-meta-item export-btn';
      exportBtn.innerHTML = '📥 Export CSV';
      exportBtn.style.cssText = 'background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 0.35rem 0.75rem; border-radius: 6px; cursor: pointer; font-size: 0.75rem; color: white; transition: all 0.2s;';
      exportBtn.onclick = exportToCSV;
      exportBtn.onmouseover = () => exportBtn.style.background = 'rgba(255,255,255,0.2)';
      exportBtn.onmouseout = () => exportBtn.style.background = 'rgba(255,255,255,0.1)';
      headerMeta.appendChild(exportBtn);
    }
  }
  
  function exportToCSV() {
    if (!FILTERED_REVIEWS || FILTERED_REVIEWS.length === 0) {
      alert('No reviews to export');
      return;
    }
    
    // CSV headers
    const headers = ['Date', 'Platform', 'Rating', 'Sentiment', 'Themes', 'Review Text', 'McAfee Response', 'Response Quality'];
    
    // Convert reviews to CSV rows
    const rows = FILTERED_REVIEWS.map(r => {
      const themes = (r.themes || []).join('; ');
      const responseQuality = checkResponseQuality(r);
      return [
        r.date,
        r.platform,
        r.rating,
        r.sentiment?.label || 'neutral',
        themes,
        `"${(r.text || '').replace(/"/g, '""')}"`,
        `"${(r.developer_reply || '').replace(/"/g, '""')}"`,
        responseQuality
      ];
    });
    
    // Build CSV content
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().split('T')[0];
    
    link.setAttribute('href', url);
    link.setAttribute('download', `mcafee_reviews_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log(`✅ Exported ${FILTERED_REVIEWS.length} reviews to CSV`);
  }
  
  // Tab switching
  function initTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        this.classList.add('active');
        document.getElementById('tab-' + this.dataset.tab).classList.add('active');
        window.dispatchEvent(new Event('resize'));
        
        if (this.dataset.tab === 'analysis') {
          setTimeout(renderAnalysisCharts, 100);
        }
      });
    });
  }
  
  // Date filtering
  function initDateFilters() {
    document.querySelectorAll('.date-preset-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.date-preset-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        applyDateFilter(this.dataset.range);
      });
    });
    
    // Custom date range
    const applyBtn = document.getElementById('date-apply');
    const clearBtn = document.getElementById('date-clear');
    
    if (applyBtn) {
      applyBtn.addEventListener('click', function() {
        const start = document.getElementById('date-start').value;
        const end = document.getElementById('date-end').value;
        
        if (!start || !end) {
          alert('Please select both start and end dates');
          return;
        }
        
        if (new Date(start) > new Date(end)) {
          alert('Start date must be before end date');
          return;
        }
        
        document.querySelectorAll('.date-preset-btn').forEach(b => b.classList.remove('active'));
        
        FILTERED_STATS = DATA.daily_stats.filter(d => {
          const date = new Date(d.date);
          return date >= new Date(start) && date <= new Date(end);
        });
        
        FILTERED_REVIEWS = DATA.recent_reviews.filter(r => {
          const date = new Date(r.date);
          return date >= new Date(start) && date <= new Date(end);
        });
        
        document.getElementById('total-reviews-meta').textContent = 
          `${FILTERED_REVIEWS.length} reviews (${start} to ${end})`;
        
        currentPage = 1;
        renderKPIs();
        renderOverviewCharts();
        renderReviews();
      });
    }
    
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        document.getElementById('date-start').value = '';
        document.getElementById('date-end').value = '';
        applyDateFilter('30');
      });
    }
  }
  
  function applyDateFilter(range) {
    let cutoff = null;
    let label = '';
    
    if (range === 'all') {
      FILTERED_STATS = DATA.daily_stats;
      FILTERED_REVIEWS = DATA.recent_reviews;
      label = 'All Time';
    } else {
      const days = parseInt(range);
      cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      
      FILTERED_STATS = DATA.daily_stats.filter(d => new Date(d.date) >= cutoff);
      FILTERED_REVIEWS = DATA.recent_reviews.filter(r => new Date(r.date) >= cutoff);
      
      if (days === 7) label = 'Last 1 Week';
      else if (days === 15) label = 'Last 15 Days';
      else if (days === 30) label = 'Last 1 Month';
      else if (days === 90) label = 'Last 3 Months';
      else if (days === 365) label = 'Last 1 Year';
    }
    
    document.getElementById('total-reviews-meta').textContent = 
      `${FILTERED_REVIEWS.length} reviews (${label})`;
    
    currentPage = 1;
    renderKPIs();
    renderOverviewCharts();
    renderReviews();
  }
  
  // Review filters
  function initReviewFilters() {
    const filters = ['platform', 'rating', 'sentiment', 'notable'];
    
    filters.forEach(filter => {
      const el = document.getElementById('filter-' + filter);
      if (el) {
        el.addEventListener('change', applyReviewFilters);
      }
    });
    
    const searchEl = document.getElementById('filter-search');
    if (searchEl) {
      searchEl.addEventListener('input', debounce(applyReviewFilters, 300));
    }
  }
  
  function debounce(fn, delay) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }
  
  function applyReviewFilters() {
    activeFilters.platform = document.getElementById('filter-platform')?.value || 'all';
    activeFilters.rating = document.getElementById('filter-rating')?.value || 'all';
    activeFilters.sentiment = document.getElementById('filter-sentiment')?.value || 'all';
    activeFilters.notable = document.getElementById('filter-notable')?.value || 'all';
    activeFilters.search = document.getElementById('filter-search')?.value?.toLowerCase().trim() || '';
    
    currentPage = 1;
    renderReviews();
  }
  
  function checkResponseQuality(review) {
    const hasReply = review.developer_reply && review.developer_reply.length > 0;
    const replyLower = (review.developer_reply || '').toLowerCase();
    const textLower = (review.text || '').toLowerCase();
    
    if (!hasReply) return 'NO RESPONSE';
    if (review.rating >= 4 && (replyLower.includes('sorry') || replyLower.includes('apologize'))) {
      return 'HIGH RATING + APOLOGY';
    }
    if (review.rating <= 2 && !replyLower.includes('understand') && !replyLower.includes('frustrat')) {
      return 'LOW RATING + NO EMPATHY';
    }
    if (replyLower.includes('contact support') && replyLower.length < 200) {
      return 'GENERIC TEMPLATE';
    }
    if (!replyLower.includes('step') && !replyLower.includes('try') && !replyLower.includes('setting')) {
      return 'NO SOLUTION';
    }
    if (review.themes?.some(t => textLower.includes(t.toLowerCase())) && 
        !review.themes.some(t => replyLower.includes(t.toLowerCase()))) {
      return 'WRONG ISSUE';
    }
    return 'CORRECT';
  }
  
  function filterReviews(reviews) {
    return reviews.filter(r => {
      if (activeFilters.platform !== 'all' && r.platform !== activeFilters.platform) return false;
      if (activeFilters.rating !== 'all' && r.rating !== parseInt(activeFilters.rating)) return false;
      if (activeFilters.sentiment !== 'all' && r.sentiment?.label !== activeFilters.sentiment) return false;
      
      if (activeFilters.notable !== 'all') {
        const quality = checkResponseQuality(r);
        if (activeFilters.notable === 'no_response' && quality !== 'NO RESPONSE') return false;
        if (activeFilters.notable === 'generic' && quality !== 'GENERIC TEMPLATE') return false;
        if (activeFilters.notable === 'vpn_issue' && !r.themes?.some(t => t.toLowerCase().includes('vpn'))) return false;
        if (activeFilters.notable === 'negative_sentiment' && r.sentiment?.label !== 'negative') return false;
      }
      
      // Case-insensitive search
      if (activeFilters.search) {
        const searchTerm = activeFilters.search.toLowerCase();
        const textMatch = (r.text || '').toLowerCase().includes(searchTerm);
        const themeMatch = (r.themes || []).some(t => t.toLowerCase().includes(searchTerm));
        const replyMatch = (r.developer_reply || '').toLowerCase().includes(searchTerm);
        if (!textMatch && !themeMatch && !replyMatch) return false;
      }
      
      return true;
    });
  }
  
  // KPI Cards
  function renderKPIs() {
    const total = FILTERED_REVIEWS.length;
    const avgRating = total > 0 
      ? FILTERED_REVIEWS.reduce((sum, r) => sum + r.rating, 0) / total 
      : 0;
    
    const sentiments = { positive: 0, neutral: 0, negative: 0 };
    FILTERED_REVIEWS.forEach(r => sentiments[r.sentiment?.label || 'neutral']++);
    
    const grid = document.getElementById('kpi-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="kpi-card">
          <div class="kpi-label">Total Reviews</div>
          <div class="kpi-value">${total.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Avg Rating</div>
          <div class="kpi-value">${avgRating.toFixed(2)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Positive</div>
          <div class="kpi-value" style="color:#10B981">${sentiments.positive}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Negative</div>
          <div class="kpi-value" style="color:#EF4444">${sentiments.negative}</div>
        </div>
      `;
    }
  }
  
  // Overview Charts
  function renderOverviewCharts() {
    if (!FILTERED_STATS?.length) {
      showEmptyState('chart-combined-sentiment-volume', 'No data available for selected date range');
      return;
    }
    
    const stats = FILTERED_STATS;
    const dates = stats.map(d => d.date);
    
    const layout = { 
      height: 300, 
      margin: { t: 30, r: 20, b: 40, l: 50 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent'
    };
    
    ['chart-rating-trend', 'chart-sentiment-dist', 
     'chart-rating-dist', 'chart-platform-breakdown', 'chart-themes',
     'chart-combined-sentiment-volume']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el && typeof Plotly !== 'undefined') Plotly.purge(el);
      });
    
    // Combined Sentiment + Volume
    const platformVolumeData = {};
    FILTERED_REVIEWS.forEach(r => {
      if (!platformVolumeData[r.date]) platformVolumeData[r.date] = {};
      platformVolumeData[r.date][r.platform] = (platformVolumeData[r.date][r.platform] || 0) + 1;
    });
    
    const platformColorMap = { google_play: '#3DDC84', app_store: '#007AFF', windows_desktop: '#00BCF2' };
    const platformList = ['google_play', 'app_store', 'windows_desktop'];
    
    const volumeTraces = platformList.map(p => ({
      x: dates,
      y: dates.map(d => platformVolumeData[d]?.[p] || 0),
      name: p.replace('_', ' ').toUpperCase(),
      type: 'bar',
      marker: { color: platformColorMap[p] || '#94A3B8' },
      yaxis: 'y2',
      opacity: 0.7
    }));
    
    const combinedLayout = {
      height: 350,
      margin: { t: 40, r: 60, b: 40, l: 50 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      title: { text: 'Sentiment Trend + Daily Volume by Platform', font: { size: 14 } },
      xaxis: { domain: [0, 1], tickangle: -45 },
      yaxis: { 
        title: 'Sentiment Count',
        titlefont: { color: '#64748B' },
        tickfont: { color: '#64748B' },
        side: 'left'
      },
      yaxis2: {
        title: 'Daily Review Volume',
        titlefont: { color: '#94A3B8' },
        tickfont: { color: '#94A3B8' },
        overlaying: 'y',
        side: 'right'
      },
      legend: { orientation: 'h', y: 1.15, x: 0.5, xanchor: 'center' },
      barmode: 'stack'
    };
    
    Plotly.newPlot('chart-combined-sentiment-volume', [
      { x: dates, y: stats.map(d => d.sentiment_distribution?.positive || 0), 
        name: 'Positive Sentiment', type: 'scatter', mode: 'lines', 
        line: { color: '#10B981', width: 2 }, yaxis: 'y' },
      { x: dates, y: stats.map(d => d.sentiment_distribution?.negative || 0), 
        name: 'Negative Sentiment', type: 'scatter', mode: 'lines', 
        line: { color: '#EF4444', width: 2 }, yaxis: 'y' },
      ...volumeTraces
    ], combinedLayout, {displayModeBar: false});
    
    // Rating Trend
    Plotly.newPlot('chart-rating-trend', [{
      x: dates, y: stats.map(d => d.avg_rating),
      type: 'scatter', mode: 'lines+markers', line: { color: '#F59E0B' }
    }], { ...layout, yaxis: { range: [0, 5] }}, {displayModeBar: false});
    
    // Sentiment Distribution
    const totalSent = stats.reduce((acc, d) => {
      acc.positive += d.sentiment_distribution?.positive || 0;
      acc.negative += d.sentiment_distribution?.negative || 0;
      acc.neutral += d.sentiment_distribution?.neutral || 0;
      return acc;
    }, {positive: 0, negative: 0, neutral: 0});
    
    Plotly.newPlot('chart-sentiment-dist', [{
      values: [totalSent.positive, totalSent.neutral, totalSent.negative],
      labels: ['Positive', 'Neutral', 'Negative'],
      type: 'pie', hole: 0.4,
      marker: { colors: ['#10B981', '#F59E0B', '#EF4444'] }
    }], layout, {displayModeBar: false});
    
    // Rating Distribution
    const ratings = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
    FILTERED_REVIEWS.forEach(r => ratings[r.rating]++);
    
    Plotly.newPlot('chart-rating-dist', [{
      x: ['1★', '2★', '3★', '4★', '5★'],
      y: [ratings[1], ratings[2], ratings[3], ratings[4], ratings[5]],
      type: 'bar',
      marker: { color: ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981'] }
    }], { ...layout, xaxis: { type: 'category' }}, {displayModeBar: false});
    
    // Platform Breakdown
    const platforms = {};
    FILTERED_REVIEWS.forEach(r => platforms[r.platform] = (platforms[r.platform] || 0) + 1);
    const platformColors = { google_play: '#3DDC84', app_store: '#007AFF', windows_desktop: '#00BCF2' };
    
    Plotly.newPlot('chart-platform-breakdown', [{
      x: Object.keys(platforms).map(p => p.replace('_', ' ').toUpperCase()),
      y: Object.values(platforms),
      type: 'bar',
      marker: { color: Object.keys(platforms).map(p => platformColors[p] || '#94A3B8') }
    }], { ...layout, xaxis: { type: 'category' }}, {displayModeBar: false});
    
    // Top Themes
    const themesBySentiment = {};
    FILTERED_REVIEWS.forEach(r => {
      (r.themes || []).forEach(t => {
        if (!themesBySentiment[t]) {
          themesBySentiment[t] = { positive: 0, neutral: 0, negative: 0 };
        }
        themesBySentiment[t][r.sentiment?.label || 'neutral']++;
      });
    });
    
    const sortedThemes = Object.entries(themesBySentiment)
      .map(([theme, counts]) => ({ 
        theme, 
        ...counts, 
        total: counts.positive + counts.neutral + counts.negative 
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    
    Plotly.newPlot('chart-themes', [
      { x: sortedThemes.map(t => t.theme), y: sortedThemes.map(t => t.positive),
        name: 'Positive', type: 'bar', marker: { color: '#10B981' } },
      { x: sortedThemes.map(t => t.theme), y: sortedThemes.map(t => t.neutral),
        name: 'Neutral', type: 'bar', marker: { color: '#F59E0B' } },
      { x: sortedThemes.map(t => t.theme), y: sortedThemes.map(t => t.negative),
        name: 'Negative', type: 'bar', marker: { color: '#EF4444' } }
    ], { ...layout, barmode: 'stack', xaxis: { type: 'category', tickangle: -45 },
         legend: { orientation: 'h', y: -0.2 }, yaxis: { title: 'Review Count' } }, 
       {displayModeBar: false});
    
    // Individual Theme Analysis
    renderThemeAnalysis('Performance', ['Performance', 'Battery', 'Speed'], 'chart-theme-performance');
    renderThemeAnalysis('VPN', ['VPN'], 'chart-theme-vpn');
    renderThemeAnalysis('Security', ['Security Features'], 'chart-theme-security');
    renderThemeAnalysis('Pricing', ['Pricing', 'Customer Support'], 'chart-theme-pricing');
  }
  
  function renderThemeAnalysis(themeName, themeKeywords, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    
    const matchingReviews = FILTERED_REVIEWS.filter(r => {
      return (r.themes || []).some(t => 
        themeKeywords.some(kw => t.toLowerCase().includes(kw.toLowerCase()))
      );
    });
    
    if (matchingReviews.length === 0) {
      el.innerHTML = '<div style="padding: 40px; text-align: center; color: #94A3B8;">No reviews with this theme</div>';
      return;
    }
    
    const sentiments = { positive: 0, neutral: 0, negative: 0 };
    matchingReviews.forEach(r => sentiments[r.sentiment?.label || 'neutral']++);
    
    const total = matchingReviews.length;
    const avgRating = matchingReviews.reduce((sum, r) => sum + r.rating, 0) / total;
    
    Plotly.newPlot(containerId, [{
      values: [sentiments.positive, sentiments.neutral, sentiments.negative],
      labels: ['Positive', 'Neutral', 'Negative'],
      type: 'pie', hole: 0.4,
      marker: { colors: ['#10B981', '#F59E0B', '#EF4444'] }
    }], {
      height: 300,
      margin: { t: 40, r: 20, b: 40, l: 20 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      title: { text: `${total} reviews · ${avgRating.toFixed(1)}★ avg`, font: { size: 12 } },
      showlegend: true,
      legend: { orientation: 'h', y: -0.1 }
    }, {displayModeBar: false});
  }
  
  // Reviews Table
  function renderReviews() {
    const tbody = document.getElementById('reviews-tbody');
    const summary = document.getElementById('results-summary');
    const filtered = filterReviews(FILTERED_REVIEWS);
    
    // Update results count
    if (summary) {
      summary.textContent = `Showing ${Math.min(filtered.length, (currentPage-1)*REVIEWS_PER_PAGE + 1)}-${Math.min(filtered.length, currentPage*REVIEWS_PER_PAGE)} of ${filtered.length} reviews`;
    }
    
    if (filtered.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:3rem;color:#94A3B8;">No reviews match your filters</td></tr>';
      renderPagination(0);
      return;
    }
    
    const start = (currentPage - 1) * REVIEWS_PER_PAGE;
    const pageReviews = filtered.slice(start, start + REVIEWS_PER_PAGE);
    
    const html = pageReviews.map(r => {
      const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
      const sentimentClass = r.sentiment?.label || 'neutral';
      const themes = (r.themes || []).map(t => `<span class="badge badge-theme">${t}</span>`).join(' ');
      const quality = checkResponseQuality(r);
      
      const responseGap = quality === 'NO RESPONSE' ? getResponseGap(r.date) : '';
      
      return `
        <tr>
          <td>${r.date}</td>
          <td><span class="badge badge-platform ${r.platform}">${r.platform.replace('_', ' ').toUpperCase()}</span></td>
          <td><span class="stars">${stars}</span></td>
          <td><span class="badge badge-${sentimentClass}">${sentimentClass}</span></td>
          <td>
            <div style="max-width:300px;">${r.text}</div>
            <div style="margin-top:4px;">${themes}</div>
          </td>
          <td>
            ${r.developer_reply ? `<div style="max-width:250px;font-size:0.85rem;color:#64748B;">${r.developer_reply}</div>` : '<span style="color:#EF4444;font-size:0.8rem;">⏰ No response</span>'}
            ${responseGap ? `<div style="color:#EF4444;font-size:0.75rem;margin-top:4px;">${responseGap}</div>` : ''}
          </td>
          <td>
            ${r.suggested_reply ? `<div style="max-width:250px;font-size:0.85rem;color:#10B981;background:#F0FDF4;padding:8px;border-radius:4px;">${r.suggested_reply}</div>` : '-'}
          </td>
        </tr>
      `;
    }).join('');
    
    if (tbody) tbody.innerHTML = html;
    renderPagination(filtered.length);
  }
  
  function getResponseGap(reviewDate) {
    const days = Math.floor((new Date() - new Date(reviewDate)) / (1000 * 60 * 60 * 24));
    return `⏰ Waiting ${days} day${days !== 1 ? 's' : ''}`;
  }
  
  function renderPagination(total) {
    const totalPages = Math.ceil(total / REVIEWS_PER_PAGE);
    const el = document.getElementById('pagination');
    
    if (!el) return;
    
    if (totalPages <= 1) {
      el.innerHTML = '';
      return;
    }
    
    let html = `
      <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">←</button>
    `;
    
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
        html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
      } else if (i === currentPage - 3 || i === currentPage + 3) {
        html += `<span class="pagination-ellipsis">...</span>`;
      }
    }
    
    html += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">→</button>`;
    
    el.innerHTML = html;
  }
  
  window.changePage = function(page) {
    currentPage = page;
    renderReviews();
    document.getElementById('reviews-tbody')?.closest('.reviews-table-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  
  // Analysis Tab Charts
  function renderAnalysisCharts() {
    const container = document.getElementById('analysis-theme-chart');
    if (!container) return;
    
    // Theme sentiment analysis
    const themeSentiments = {};
    DATA.recent_reviews.forEach(r => {
      (r.themes || []).forEach(t => {
        if (!themeSentiments[t]) themeSentiments[t] = { positive: 0, negative: 0, neutral: 0, total: 0 };
        themeSentiments[t][r.sentiment?.label || 'neutral']++;
        themeSentiments[t].total++;
      });
    });
    
    const sortedThemes = Object.entries(themeSentiments)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 6);
    
    Plotly.newPlot('analysis-theme-chart', [
      { 
        y: sortedThemes.map(([t]) => t), 
        x: sortedThemes.map(([,d]) => (d.positive / d.total * 100).toFixed(1)),
        name: 'Positive %', type: 'bar', orientation: 'h',
        marker: { color: '#10B981' }
      },
      { 
        y: sortedThemes.map(([t]) => t), 
        x: sortedThemes.map(([,d]) => (d.negative / d.total * 100).toFixed(1)),
        name: 'Negative %', type: 'bar', orientation: 'h',
        marker: { color: '#EF4444' }
      }
    ], {
      barmode: 'stack',
      height: 300,
      margin: { t: 20, r: 20, b: 40, l: 120 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      legend: { orientation: 'h', y: -0.15 },
      xaxis: { title: 'Sentiment %', range: [0, 100] }
    }, {displayModeBar: false});
    
    // Response Quality Pie Chart
    const responseChartEl = document.getElementById('analysis-response-chart');
    if (responseChartEl) {
      const qualityCounts = { 'Correct': 0, 'No Solution': 0, 'NO RESPONSE': 0, 'Generic': 0, 'High+Apology': 0, 'Low+NoEmpathy': 0, 'Wrong Issue': 0 };
      DATA.recent_reviews.forEach(r => {
        const q = checkResponseQuality(r);
        if (q === 'CORRECT') qualityCounts['Correct']++;
        else if (q === 'NO SOLUTION') qualityCounts['No Solution']++;
        else if (q === 'NO RESPONSE') qualityCounts['NO RESPONSE']++;
        else if (q === 'GENERIC TEMPLATE') qualityCounts['Generic']++;
        else if (q === 'HIGH RATING + APOLOGY') qualityCounts['High+Apology']++;
        else if (q === 'LOW RATING + NO EMPATHY') qualityCounts['Low+NoEmpathy']++;
        else if (q === 'WRONG ISSUE') qualityCounts['Wrong Issue']++;
      });
      
      Plotly.newPlot('analysis-response-chart', [{
        values: Object.values(qualityCounts),
        labels: Object.keys(qualityCounts),
        type: 'pie', hole: 0.4,
        marker: { colors: ['#10B981', '#F59E0B', '#EF4444', '#FBBF24', '#DC2626', '#F97316', '#B91C1C'] },
        textinfo: 'label+percent',
        textposition: 'outside'
      }], {
        height: 300,
        margin: { t: 10, r: 10, b: 10, l: 10 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        showlegend: false,
        annotations: [{
          text: `<b>${DATA.recent_reviews.length}</b><br>reviews`,
          showarrow: false,
          font: { size: 14 }
        }]
      }, {displayModeBar: false});
    }
  }
  
  // Start
  document.addEventListener('DOMContentLoaded', function() {
    init();
    setTimeout(renderAnalysisCharts, 500);
  });
})();