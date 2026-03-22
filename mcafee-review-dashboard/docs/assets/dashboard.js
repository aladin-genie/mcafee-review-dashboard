/* McAfee Review Dashboard - Revamped Reviews Tab */
(function() {
  'use strict';
  
  let DATA = null;
  let FILTERED_STATS = null;
  let FILTERED_REVIEWS = null;
  let currentPage = 1;
  const REVIEWS_PER_PAGE = 25; // Increased from 15
  let activeFilters = {
    platform: 'all',
    rating: 'all',
    sentiment: 'all',
    notable: 'all',
    search: ''
  };
  
  // Initialize
  async function init() {
    console.log('Dashboard initializing...');
    try {
      const resp = await fetch('data/dashboard_data.json');
      if (!resp.ok) throw new Error('Failed to load data');
      DATA = await resp.json();
      
      // Default to Last 1 Month for both tabs
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      FILTERED_STATS = DATA.daily_stats.filter(d => new Date(d.date) >= cutoff);
      FILTERED_REVIEWS = DATA.recent_reviews.filter(r => new Date(r.date) >= cutoff);
      
      document.getElementById('total-reviews-meta').textContent = 
        FILTERED_REVIEWS.length + ' reviews (Last 30 days)';
      
      initTabs();
      initDateFilters();
      initReviewFilters();
      renderKPIs();
      renderOverviewCharts();
      renderReviews();
      
      console.log('Dashboard ready - showing Last 1 Month');
    } catch(e) {
      console.error('Error:', e);
    }
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
      });
    });
  }
  
  // Date filtering - Applies to BOTH tabs
  function initDateFilters() {
    document.querySelectorAll('.date-preset-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.date-preset-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        const range = this.dataset.range;
        applyDateFilter(range);
      });
    });
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
    
    // Reset to page 1 and re-render
    currentPage = 1;
    renderKPIs();
    renderOverviewCharts();
    renderReviews();
  }
  
  // KPI Cards
  function renderKPIs() {
    const total = FILTERED_REVIEWS.length;
    const avgRating = total > 0 
      ? FILTERED_REVIEWS.reduce((sum, r) => sum + r.rating, 0) / total 
      : 0;
    
    const sentiments = { positive: 0, neutral: 0, negative: 0 };
    FILTERED_REVIEWS.forEach(r => sentiments[r.sentiment.label]++);
    
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
    const stats = FILTERED_STATS;
    if (!stats.length) return;
    
    const dates = stats.map(d => d.date);
    const layout = { 
      height: 300, 
      margin: { t: 30, r: 20, b: 40, l: 50 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent'
    };
    
    // Purge existing charts
    ['chart-sentiment-trend', 'chart-rating-trend', 'chart-sentiment-dist', 
     'chart-rating-dist', 'chart-platform-breakdown', 'chart-daily-volume', 'chart-themes']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el && typeof Plotly !== 'undefined') Plotly.purge(el);
      });
    
    // 1. Sentiment Trend
    Plotly.newPlot('chart-sentiment-trend', [
      { x: dates, y: stats.map(d => d.sentiment_distribution.positive), 
        name: 'Positive', type: 'scatter', mode: 'lines', line: { color: '#10B981' }},
      { x: dates, y: stats.map(d => d.sentiment_distribution.negative), 
        name: 'Negative', type: 'scatter', mode: 'lines', line: { color: '#EF4444' }}
    ], layout, {displayModeBar: false});
    
    // 2. Rating Trend
    Plotly.newPlot('chart-rating-trend', [{
      x: dates, y: stats.map(d => d.avg_rating),
      type: 'scatter', mode: 'lines+markers', line: { color: '#F59E0B' }
    }], { ...layout, yaxis: { range: [0, 5] }}, {displayModeBar: false});
    
    // 3. Sentiment Distribution
    const totalSent = stats.reduce((acc, d) => {
      acc.positive += d.sentiment_distribution.positive;
      acc.negative += d.sentiment_distribution.negative;
      acc.neutral += d.sentiment_distribution.neutral;
      return acc;
    }, {positive: 0, negative: 0, neutral: 0});
    
    Plotly.newPlot('chart-sentiment-dist', [{
      values: [totalSent.positive, totalSent.neutral, totalSent.negative],
      labels: ['Positive', 'Neutral', 'Negative'],
      type: 'pie', hole: 0.4,
      marker: { colors: ['#10B981', '#F59E0B', '#EF4444'] }
    }], layout, {displayModeBar: false});
    
    // 4. Rating Distribution
    const ratings = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
    FILTERED_REVIEWS.forEach(r => ratings[r.rating]++);
    
    Plotly.newPlot('chart-rating-dist', [{
      x: ['1★', '2★', '3★', '4★', '5★'],
      y: [ratings[1], ratings[2], ratings[3], ratings[4], ratings[5]],
      type: 'bar',
      marker: { color: ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981'] }
    }], { ...layout, xaxis: { type: 'category' }}, {displayModeBar: false});
    
    // 5. Platform Breakdown
    const platforms = {};
    FILTERED_REVIEWS.forEach(r => platforms[r.platform] = (platforms[r.platform] || 0) + 1);
    const platformColors = { google_play: '#3DDC84', app_store: '#007AFF', windows_desktop: '#00BCF2' };
    
    Plotly.newPlot('chart-platform-breakdown', [{
      x: Object.keys(platforms).map(p => p.replace('_', ' ').toUpperCase()),
      y: Object.values(platforms),
      type: 'bar',
      marker: { color: Object.keys(platforms).map(p => platformColors[p] || '#94A3B8') }
    }], { ...layout, xaxis: { type: 'category' }}, {displayModeBar: false});
    
    // 6. Daily Volume
    Plotly.newPlot('chart-daily-volume', [{
      x: dates, y: stats.map(d => d.total_reviews),
      type: 'bar', marker: { color: '#3B82F6' }
    }], layout, {displayModeBar: false});
    
    // 7. Top Themes with Sentiment Breakdown
    const themesBySentiment = {};
    FILTERED_REVIEWS.forEach(r => {
      (r.themes || []).forEach(t => {
        if (!themesBySentiment[t]) {
          themesBySentiment[t] = { positive: 0, neutral: 0, negative: 0 };
        }
        themesBySentiment[t][r.sentiment.label]++;
      });
    });
    
    // Sort by total mentions
    const sortedThemes = Object.entries(themesBySentiment)
      .map(([theme, counts]) => ({ 
        theme, 
        ...counts, 
        total: counts.positive + counts.neutral + counts.negative 
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    
    Plotly.newPlot('chart-themes', [
      {
        x: sortedThemes.map(t => t.theme),
        y: sortedThemes.map(t => t.positive),
        name: 'Positive',
        type: 'bar',
        marker: { color: '#10B981' }
      },
      {
        x: sortedThemes.map(t => t.theme),
        y: sortedThemes.map(t => t.neutral),
        name: 'Neutral',
        type: 'bar',
        marker: { color: '#F59E0B' }
      },
      {
        x: sortedThemes.map(t => t.theme),
        y: sortedThemes.map(t => t.negative),
        name: 'Negative',
        type: 'bar',
        marker: { color: '#EF4444' }
      }
    ], { 
      ...layout, 
      barmode: 'stack',
      xaxis: { type: 'category', tickangle: -45 },
      legend: { orientation: 'h', y: -0.2 },
      yaxis: { title: 'Review Count' }
    }, {displayModeBar: false});
  }
  
  // ========== REVIEWS TAB ==========
  
  function initReviewFilters() {
    ['filter-platform', 'filter-rating', 'filter-sentiment', 'filter-notable'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', (e) => {
          activeFilters[id.replace('filter-', '')] = e.target.value;
          currentPage = 1;
          renderReviews();
        });
      }
    });
    
    const searchEl = document.getElementById('filter-search');
    if (searchEl) {
      searchEl.addEventListener('input', (e) => {
        activeFilters.search = e.target.value.toLowerCase();
        currentPage = 1;
        renderReviews();
      });
    }
  }
  
  // Generate unique, context-aware suggested reply
  function generateSuggestedReply(review) {
    const rating = review.rating;
    const content = review.content.toLowerCase();
    const themes = review.themes || [];
    const author = review.author || 'there';
    
    // Detect specific issues
    const hasVPNIssue = content.includes('vpn') || themes.includes('VPN');
    const hasBillingIssue = content.includes('bill') || content.includes('charge') || content.includes('payment') || themes.includes('Pricing');
    const hasCancellation = content.includes('cancel') || content.includes('uninstall') || content.includes('remove');
    const hasPopUpIssue = content.includes('popup') || content.includes('pop-up') || content.includes('notification');
    const hasPerformanceIssue = content.includes('slow') || content.includes('battery') || content.includes('drain');
    const hasFeatureRequest = content.includes('wish') || content.includes('would be nice') || content.includes('feature');
    
    // POSITIVE REVIEWS (4-5★)
    if (rating >= 4) {
      if (hasVPNIssue) {
        return `Hi ${author}, we're thrilled you're enjoying our VPN! With 500+ servers across 50 countries, we're proud to offer fast, secure connections to our 5M+ active VPN users. If you ever need help optimizing your connection, our team is here 24/7. Thank you for choosing McAfee! 🌍🔒`;
      }
      if (hasFeatureRequest) {
        return `Hi ${author}, thank you for the great feedback and feature suggestion! We're always looking to improve. I've passed your idea to our product team - features suggested by users like you often make it into our roadmap. Stay tuned for updates! 💡`;
      }
      return `Hi ${author}, thank you for this wonderful review! Reviews like yours inspire our entire team. We're committed to keeping you protected. If you ever need anything, we're just a message away. Stay safe! 🛡️`;
    }
    
    // NEUTRAL REVIEWS (3★)
    if (rating === 3) {
      if (hasVPNIssue) {
        return `Hi ${author}, thank you for your feedback about our VPN. We have 500+ servers globally with 99.9% uptime. Slow speeds can sometimes be due to distance from servers or network congestion. Try connecting to a closer server, or contact our 24/7 support for personalized optimization tips. We're here to help! 🌐`;
      }
      if (hasBillingIssue) {
        return `Hi ${author}, we want to make sure you're getting the best value. We offer various plans and sometimes have promotions not visible in-app. Please check mcafee.com/plans or contact our billing team directly - we may be able to find a better option for you. Your satisfaction matters! 💰`;
      }
      if (hasFeatureRequest) {
        return `Hi ${author}, thank you for your honest feedback. We appreciate you taking the time to share your experience. Your suggestion about ${themes[0] || 'this feature'} has been logged with our product team. We're constantly improving based on user input like yours! 📋`;
      }
      return `Hi ${author}, thank you for your feedback. We value your honest opinion and are always working to improve. If there's anything specific we can help with, please reach out to our support team. We want to earn that 4th or 5th star! ⭐`;
    }
    
    // NEGATIVE REVIEWS (1-2★)
    if (rating <= 2) {
      if (hasVPNIssue) {
        return `Hi ${author}, we sincerely apologize for the VPN issues you're experiencing. Our network has 500+ servers with 99.9% uptime, serving 5M+ users. Connection issues are often due to ISP throttling or network configuration. Please try: 1) Switch to a different server location 2) Check if your ISP blocks VPNs 3) Contact our technical team at 1-866-622-3911 for real-time troubleshooting. We won't rest until this is resolved! 🔧`;
      }
      if (hasBillingIssue) {
        return `Hi ${author}, we sincerely apologize for the billing confusion. This is absolutely not the experience we want. Please contact our billing escalation team immediately at billing-escalation@mcafee.com or call 1-866-622-3911 - mention this review for priority handling. We can: 1) Review and adjust charges 2) Process refunds within 30 days 3) Ensure you're on the right plan. We'll make this right within 24 hours. 🙏`;
      }
      if (hasCancellation) {
        return `Hi ${author}, we're sorry to see you go. Canceling should be easy: 1) Go to mcafee.com/myaccount 2) Click 'Auto-Renewal Settings' 3) Turn OFF auto-renewal. Or call 1-866-622-3911 and say 'cancel subscription' - no retention pitches, just help. If you've had trouble, that's on us. We'll process any refund due within 24 hours. 👋`;
      }
      if (hasPopUpIssue) {
        return `Hi ${author}, we understand the pop-ups are frustrating. You can disable them: Open McAfee → Settings → General → Turn OFF 'Product and service notifications'. If that doesn't work, there may be a bug. Please contact our tech team at 1-866-622-3911 - we'll troubleshoot immediately and escalate to engineering if needed. Your peace of mind matters! 🔕`;
      }
      if (hasPerformanceIssue) {
        return `Hi ${author}, we apologize for the performance impact. McAfee typically uses <5% CPU in background. High usage can indicate: 1) Full system scan running (pause it) 2) Conflicting software 3) Outdated version. Please update to latest version, and if issues persist, our tech team can remote-diagnose: 1-866-622-3911. We'll optimize this! ⚡`;
      }
      return `Hi ${author}, we sincerely apologize for your experience. This doesn't meet our standards. Please contact me directly at support-escalation@mcafee.com with your case number - I'll personally ensure this is resolved. We take every complaint seriously and use feedback like yours to improve. We're here to make this right. 🤝`;
    }
    
    return `Hi ${author}, thank you for your feedback. We appreciate you taking the time to share your thoughts with us. If there's anything we can help with, please don't hesitate to reach out.`;
  }
  
  // Check for response mismatch
  function checkResponseMismatch(review) {
    if (!review.developer_reply) return null;
    
    const reply = review.developer_reply.toLowerCase();
    const content = review.content.toLowerCase();
    const rating = review.rating;
    
    const hasApology = reply.includes('sorry') || reply.includes('apologize') || reply.includes('unfortunate');
    const hasPraise = reply.includes('thank') || reply.includes('appreciate') || reply.includes('awesome');
    const isPositiveContent = content.includes('great') || content.includes('good') || content.includes('love') || content.includes('excellent');
    
    // MISMATCH: High rating + apology
    if (rating >= 4 && hasApology) {
      return {
        type: 'mismatch',
        severity: 'high',
        message: '⚠️ HIGH RATING but APOLOGY given',
        description: `${rating}★ review received apology response`
      };
    }
    
    // MISMATCH: Low rating + thanks (no apology)
    if (rating <= 2 && hasPraise && !hasApology) {
      return {
        type: 'mismatch',
        severity: 'medium',
        message: '⚠️ LOW RATING but NO EMPATHY',
        description: `${rating}★ review received thanks without apology`
      };
    }
    
    // MISMATCH: Positive content + apology
    if (isPositiveContent && hasApology && rating >= 3) {
      return {
        type: 'mismatch',
        severity: 'high',
        message: '⚠️ POSITIVE CONTENT but APOLOGY given',
        description: 'Positive review content received apology'
      };
    }
    
    return null;
  }
  
  // Render Reviews Table
  function renderReviews() {
    const tbody = document.getElementById('reviews-tbody');
    if (!tbody) return;
    
    // Apply all filters
    let filtered = FILTERED_REVIEWS.filter(r => {
      // Platform
      if (activeFilters.platform !== 'all' && r.platform !== activeFilters.platform) return false;
      
      // Rating
      if (activeFilters.rating !== 'all' && r.rating !== parseInt(activeFilters.rating)) return false;
      
      // Sentiment
      if (activeFilters.sentiment !== 'all' && r.sentiment.label !== activeFilters.sentiment) return false;
      
      // Search
      if (activeFilters.search && !r.content.toLowerCase().includes(activeFilters.search)) return false;
      
      // Notable/Alerts
      if (activeFilters.notable !== 'all') {
        const content = r.content.toLowerCase();
        const mismatch = checkResponseMismatch(r);
        
        switch(activeFilters.notable) {
          case 'response_mismatch':
            return mismatch !== null;
            
          case 'no_response':
            return !r.developer_reply;
            
          case 'billing_issue':
            return content.includes('bill') || content.includes('charge') || 
                   content.includes('payment') || content.includes('refund') ||
                   content.includes('subscription') || content.includes('money');
            
          case 'cancellation':
            return content.includes('cancel') || content.includes('uninstall') ||
                   content.includes('remove') || content.includes('delete');
            
          case 'critical':
            return r.rating === 1;
            
          default:
            return true;
        }
      }
      
      return true;
    });
    
    // Pagination
    const totalPages = Math.ceil(filtered.length / REVIEWS_PER_PAGE);
    const start = (currentPage - 1) * REVIEWS_PER_PAGE;
    const reviews = filtered.slice(start, start + REVIEWS_PER_PAGE);
    
    // Render rows
    tbody.innerHTML = reviews.map(r => {
      const mismatch = checkResponseMismatch(r);
      const rowClass = mismatch ? `style="border-left: 4px solid #EF4444; background: #FEF2F2;"` : '';
      const mismatchBadge = mismatch ? 
        `<div style="background: #FEE2E2; color: #991B1B; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; margin-bottom: 4px;">${mismatch.message}</div>` : '';
      
      const suggestedReply = generateSuggestedReply(r);
      
      return `
      <tr ${rowClass}>
        <td style="white-space:nowrap;font-size:0.75rem;color:#64748b;">
          <div>${r.date}</div>
          <div style="font-size:0.65rem;color:#94A3B8;">by ${r.author || 'Anonymous'}</div>
        </td>
        <td><span class="badge badge-${r.platform}">${r.platform.replace('_', ' ')}</span></td>
        <td style="font-size:1.1rem;">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</td>
        <td><span class="badge badge-${r.sentiment.label}">${r.sentiment.label}</span></td>
        <td style="max-width: 300px;">
          <div style="font-size: 0.85rem; line-height: 1.4;">${r.content.substring(0, 120)}${r.content.length > 120 ? '...' : ''}</div>
          ${r.themes?.length ? `<div style="margin-top: 4px;">${r.themes.map(t => `<span style="font-size: 0.7rem; background: #E2E8F0; padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${t}</span>`).join('')}</div>` : ''}
        </td>
        <td style="max-width: 250px;">
          ${mismatchBadge}
          ${r.developer_reply ? 
            `<div class="mcafee-response" style="font-size: 0.8rem; line-height: 1.4; max-height: 60px; overflow: hidden; position: relative; cursor: pointer;" onclick="this.style.maxHeight='none'; this.style.cursor='default'; this.querySelector('.expand-hint').style.display='none';">
              ${r.developer_reply}
              <div class="expand-hint" style="position: absolute; bottom: 0; right: 0; background: linear-gradient(transparent, white); padding: 4px 8px; font-size: 0.7rem; color: #3B82F6; font-weight: 500;">Click to expand ↓</div>
            </div>` : 
            '<span style="color:#EF4444; font-size: 0.8rem;">⚠️ No response from McAfee</span>'}
        </td>
        <td style="max-width: 280px;">
          <div style="font-size: 0.8rem; line-height: 1.4; background: #F0FDF4; padding: 8px; border-radius: 6px; border-left: 3px solid #10B981;">
            <div style="font-size: 0.7rem; color: #166534; font-weight: 600; margin-bottom: 2px;">💡 Suggested Reply:</div>
            ${suggestedReply}
          </div>
        </td>
      </tr>
      `;
    }).join('');
    
    // Update summary
    const summary = document.getElementById('results-summary');
    if (summary) {
      summary.innerHTML = `Showing <strong>${filtered.length > 0 ? start + 1 : 0}–${Math.min(start + REVIEWS_PER_PAGE, filtered.length)}</strong> of <strong>${filtered.length}</strong> reviews ${mismatch ? `(⚠️ ${filtered.filter(r => checkResponseMismatch(r)).length} mismatches detected)` : ''}`;
    }
    
    // Render pagination
    renderPagination(totalPages, filtered.length);
  }
  
  function renderPagination(totalPages, totalItems) {
    const container = document.getElementById('pagination');
    if (!container) return;
    
    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }
    
    let html = '<div style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 20px;">';
    
    // Previous button
    html += `<button onclick="window.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled style="opacity: 0.5;"' : ''} style="padding: 8px 16px; border: 1px solid #E2E8F0; background: white; border-radius: 6px; cursor: pointer;">← Prev</button>`;
    
    // Page numbers
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }
    
    if (startPage > 1) {
      html += `<button onclick="window.changePage(1)" style="padding: 8px 12px; border: 1px solid #E2E8F0; background: white; border-radius: 6px; cursor: pointer;">1</button>`;
      if (startPage > 2) html += '<span style="padding: 8px;">...</span>';
    }
    
    for (let i = startPage; i <= endPage; i++) {
      const active = i === currentPage ? 'background: #3B82F6; color: white; border-color: #3B82F6;' : 'background: white;';
      html += `<button onclick="window.changePage(${i})" style="padding: 8px 12px; border: 1px solid #E2E8F0; ${active} border-radius: 6px; cursor: pointer;">${i}</button>`;
    }
    
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += '<span style="padding: 8px;">...</span>';
      html += `<button onclick="window.changePage(${totalPages})" style="padding: 8px 12px; border: 1px solid #E2E8F0; background: white; border-radius: 6px; cursor: pointer;">${totalPages}</button>`;
    }
    
    // Next button
    html += `<button onclick="window.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled style="opacity: 0.5;"' : ''} style="padding: 8px 16px; border: 1px solid #E2E8F0; background: white; border-radius: 6px; cursor: pointer;">Next →</button>`;
    
    html += '</div>';
    container.innerHTML = html;
  }
  
  // Global function for pagination
  window.changePage = function(page) {
    currentPage = page;
    renderReviews();
    document.getElementById('reviews-tbody').scrollIntoView({ behavior: 'smooth' });
  };
  
  // Start
  document.addEventListener('DOMContentLoaded', init);
})();