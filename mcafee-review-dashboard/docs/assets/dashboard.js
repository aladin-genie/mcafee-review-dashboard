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
        
        // Render analysis charts when analysis tab is clicked
        if (this.dataset.tab === 'analysis') {
          setTimeout(renderAnalysisCharts, 100);
        }
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
    ['chart-rating-trend', 'chart-sentiment-dist', 
     'chart-rating-dist', 'chart-platform-breakdown', 'chart-themes',
     'chart-combined-sentiment-volume']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el && typeof Plotly !== 'undefined') Plotly.purge(el);
      });
    
    // 1. COMBINED: Sentiment Trend + Daily Volume by Platform
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
      { x: dates, y: stats.map(d => d.sentiment_distribution.positive), 
        name: 'Positive Sentiment', type: 'scatter', mode: 'lines', 
        line: { color: '#10B981', width: 2 }, yaxis: 'y' },
      { x: dates, y: stats.map(d => d.sentiment_distribution.negative), 
        name: 'Negative Sentiment', type: 'scatter', mode: 'lines', 
        line: { color: '#EF4444', width: 2 }, yaxis: 'y' },
      ...volumeTraces
    ], combinedLayout, {displayModeBar: false});
    
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
    
    // 6. Top Themes with Sentiment Breakdown
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

    // 8. Individual Theme Analysis Charts
    renderThemeAnalysis('Performance', ['Performance', 'Battery', 'Speed'], 'chart-theme-performance');
    renderThemeAnalysis('VPN', ['VPN'], 'chart-theme-vpn');
    renderThemeAnalysis('Security', ['Security Features'], 'chart-theme-security');
    renderThemeAnalysis('Pricing', ['Pricing', 'Customer Support'], 'chart-theme-pricing');
  }
  
  function renderThemeAnalysis(themeName, themeKeywords, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    
    // Find reviews matching any of the keywords
    const matchingReviews = FILTERED_REVIEWS.filter(r => {
      return (r.themes || []).some(t => 
        themeKeywords.some(kw => t.toLowerCase().includes(kw.toLowerCase()))
      );
    });
    
    if (matchingReviews.length === 0) {
      el.innerHTML = '<div style="padding: 40px; text-align: center; color: #94A3B8;">No reviews with this theme</div>';
      return;
    }
    
    // Calculate sentiment distribution
    const sentiments = { positive: 0, neutral: 0, negative: 0 };
    matchingReviews.forEach(r => sentiments[r.sentiment.label]++);
    
    const total = matchingReviews.length;
    const avgRating = matchingReviews.reduce((sum, r) => sum + r.rating, 0) / total;
    
    Plotly.newPlot(containerId, [{
      values: [sentiments.positive, sentiments.neutral, sentiments.negative],
      labels: ['Positive', 'Neutral', 'Negative'],
      type: 'pie',
      hole: 0.4,
      marker: { colors: ['#10B981', '#F59E0B', '#EF4444'] },
      textinfo: 'label+percent',
      textposition: 'outside'
    }], {
      height: 300,
      margin: { t: 60, r: 20, b: 20, l: 20 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      showlegend: false,
      annotations: [{
        text: `<b>${total}</b><br>reviews<br>⭐ ${avgRating.toFixed(1)}`,
        showarrow: false,
        font: { size: 14 }
      }]
    }, {displayModeBar: false});
  }
  
  // ========== REVIEWS TAB ==========
  
  function initReviewFilters() {
    // Attach listeners to all filter dropdowns
    const filterIds = ['filter-platform', 'filter-rating', 'filter-sentiment', 'filter-notable'];
    
    filterIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        // Remove existing listeners to prevent duplicates
        el.removeEventListener('change', handleFilterChange);
        el.addEventListener('change', handleFilterChange);
      }
    });
    
    // Search input with debounce
    const searchEl = document.getElementById('filter-search');
    if (searchEl) {
      searchEl.removeEventListener('input', handleSearchInput);
      searchEl.addEventListener('input', debounce(handleSearchInput, 300));
    }
  }
  
  function handleFilterChange(e) {
    const id = e.target.id;
    const value = e.target.value;
    
    // Update activeFilters
    if (id === 'filter-platform') activeFilters.platform = value;
    else if (id === 'filter-rating') activeFilters.rating = value;
    else if (id === 'filter-sentiment') activeFilters.sentiment = value;
    else if (id === 'filter-notable') activeFilters.notable = value;
    
    console.log('Filter changed:', id, value);
    console.log('Active filters:', activeFilters);
    
    // Reset to page 1 and re-render
    currentPage = 1;
    renderReviews();
  }
  
  function handleSearchInput(e) {
    activeFilters.search = e.target.value.toLowerCase();
    currentPage = 1;
    renderReviews();
  }
  
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  // Generate educational, evidence-based suggested reply
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
    const hasLoginIssue = content.includes('login') || content.includes('password') || content.includes('account');
    const hasUpdateIssue = content.includes('update') || content.includes('upgrade');
    
    // POSITIVE REVIEWS (4-5★) - Thank and encourage
    if (rating >= 4) {
      if (hasVPNIssue) {
        return `Hi ${author}, we're thrilled you're enjoying our VPN! With 500+ servers across 50 countries and 99.9% uptime, we serve 5M+ active users daily. Pro tip: For optimal speeds, connect to the nearest server location. You can check server load in the app - green = fastest. Thanks for being part of our security community! 🌍🔒`;
      }
      if (hasPerformanceIssue) {
        return `Hi ${author}, thank you for the positive feedback! To keep McAfee running smoothly: ensure auto-updates are enabled (Settings > General), run quick scans instead of full scans when in a hurry, and whitelist trusted apps. Our performance mode uses <5% CPU in background. Glad we're keeping you protected! ⚡`;
      }
      return `Hi ${author}, thank you for this wonderful review! Reviews like yours inspire our entire team. We're committed to keeping you protected 24/7. Pro tip: Enable auto-renewal to ensure uninterrupted protection, and check out our mobile app for on-the-go security. Stay safe! 🛡️`;
    }
    
    // NEUTRAL REVIEWS (3★) - Educate and prevent
    if (rating === 3) {
      if (hasVPNIssue) {
        return `Hi ${author}, thank you for your feedback. Our VPN has 500+ servers globally. If experiencing slow speeds, this is often due to: 1) Distance from server (closer = faster) 2) Network congestion 3) ISP throttling. Try switching servers or enable "Auto-Select" for optimal performance. Our 24/7 support can also help optimize settings. 🌐`;
      }
      if (hasPopUpIssue) {
        return `Hi ${author}, we understand the notifications can be frequent. You can customize these: Go to McAfee Settings > Notifications > Select "Important Only" instead of "All Alerts". This reduces pop-ups by 70% while keeping critical security alerts enabled. You can also set "Do Not Disturb" hours for uninterrupted work time. 🔕`;
      }
      if (hasPerformanceIssue) {
        return `Hi ${author}, McAfee typically uses <5% CPU. If experiencing slowdowns: 1) Check if a full scan is running (pause it) 2) Close unused browser tabs 3) Enable "Gaming Mode" in settings for reduced background activity. These steps usually resolve performance concerns while maintaining full protection. ⚡`;
      }
      if (hasUpdateIssue) {
        return `Hi ${author}, keeping McAfee updated ensures you have the latest threat protection. Enable auto-updates: Settings > General > Auto-Update ON. Updates install silently in background. If an update caused issues, rollback is available for 7 days in Settings > About > Previous Version. Our support can guide you through this. 🔄`;
      }
      return `Hi ${author}, thank you for your honest feedback. We're constantly improving based on user input. To ensure optimal experience: keep the app updated, customize notification settings to your preference, and reach out to our 24/7 support team for personalized optimization tips. We value your input! 💡`;
    }
    
    // NEGATIVE REVIEWS (1-2★) - Educate on prevention and proper usage
    if (rating <= 2) {
      if (hasVPNIssue) {
        return `Hi ${author}, we understand your frustration. Our VPN has 500+ servers with 99.9% uptime. Connection issues are often preventable: 1) Use "Auto-Select" server (chooses optimal automatically) 2) Check if your ISP blocks VPN ports 3) Ensure app is updated (Settings > About). Many connection issues are resolved by simply restarting the VPN or switching from WiFi to mobile data temporarily. Our tech team can walk you through optimization at 1-866-622-3911. 🔧`;
      }
      if (hasBillingIssue) {
        return `Hi ${author}, we understand billing concerns can be frustrating. To prevent confusion: 1) Check your subscription details at mcafee.com/myaccount 2) Review billing dates and renewal settings 3) Enable billing notifications. Most billing questions are resolved by verifying the correct plan is selected. Our billing specialists can review your account and ensure you're on the optimal plan for your needs. Please contact us with your account details for personalized assistance. 💰`;
      }
      if (hasCancellation) {
        return `Hi ${author}, we're sorry to see you go. For future reference, McAfee can be easily managed: 1) Auto-renewal can be turned off anytime at mcafee.com/myaccount 2) Uninstall tool is available at download.mcafee.com/mcpR.aspx 3) Trial reminders are sent 3 days before conversion. If staying, enable "Silent Mode" for fewer notifications while keeping full protection. We appreciate you giving us a try. 👋`;
      }
      if (hasPopUpIssue) {
        return `Hi ${author}, we understand the frustration with notifications. This is easily preventable: Go to Settings > Notifications > Select "Important Only" (reduces pop-ups by 70%). You can also schedule "Do Not Disturb" hours. Many users aren't aware these customization options exist - they're designed to give you control while maintaining security. Our team can help optimize your notification preferences in under 2 minutes. 🔕`;
      }
      if (hasPerformanceIssue) {
        return `Hi ${author}, we apologize for the performance impact. This is usually preventable: McAfee uses <5% CPU normally. High usage indicates: 1) Full system scan running (switch to Quick Scan in settings) 2) Conflicting security software (uninstall others) 3) Outdated version (update to latest). Enabling "Gaming Mode" reduces background activity by 60% while keeping protection active. These settings are in Settings > Performance. ⚡`;
      }
      if (hasLoginIssue) {
        return `Hi ${author}, login issues are often preventable: 1) Ensure you're using the correct email (check your welcome email) 2) Password reset is instant at mcafee.com/forgot 3) Enable biometric login in mobile app for faster access 4) Check if caps lock is on. Account lockouts auto-reset after 30 minutes. For immediate assistance, our support team can verify account details and restore access quickly. 🔐`;
      }
      return `Hi ${author}, we sincerely apologize for your experience. Many issues can be prevented with proper setup: ensure auto-updates are enabled, customize settings to your preference, and use our optimization tools. We offer 24/7 support to walk you through any configuration - most issues are resolved in minutes with the right guidance. Please reach out so we can ensure you get the protection you need. 🤝`;
    }
    
    return `Hi ${author}, thank you for your feedback. To ensure the best experience with McAfee: keep the app updated, customize settings via the Settings menu, and don't hesitate to contact our 24/7 support team for personalized assistance. We're here to help!`;
  }
  
  // Check for response quality issues with detailed categorization
  function checkResponseQuality(review) {
    if (!review.developer_reply) {
      return {
        type: 'no_response',
        severity: 'high',
        category: '⚠️ NO RESPONSE',
        message: 'McAfee has not responded to this review',
        description: 'No developer reply'
      };
    }
    
    const reply = review.developer_reply.toLowerCase();
    const content = review.content.toLowerCase();
    const rating = review.rating;
    
    const hasApology = reply.includes('sorry') || reply.includes('apologize') || reply.includes('unfortunate') || reply.includes('concerned about your experience');
    const hasEmpathy = hasApology || reply.includes('understand') || reply.includes('frustrat');
    const isGeneric = (reply.includes('contact our support team') || reply.includes('reach out')) && reply.length < 200;
    const noSolution = reply.includes('contact') && !reply.includes('you can') && !reply.includes('try') && !reply.includes('disable');
    
    // 1. HIGH RATING + APOLOGY (Critical)
    if (rating >= 4 && hasApology) {
      return {
        type: 'mismatch',
        severity: 'critical',
        category: '🔴 HIGH RATING + APOLOGY',
        message: 'Positive review received apology',
        description: `${rating}★ review with "sorry/apologize" in response`
      };
    }
    
    // 2. LOW RATING + NO EMPATHY (High)
    if (rating <= 2 && !hasEmpathy) {
      return {
        type: 'mismatch',
        severity: 'high',
        category: '🔴 LOW RATING + NO EMPATHY',
        message: 'Angry customer got no acknowledgment',
        description: `${rating}★ review lacks apology/understanding`
      };
    }
    
    // 3. GENERIC TEMPLATE (Medium)
    if (isGeneric) {
      return {
        type: 'quality',
        severity: 'medium',
        category: '🟡 GENERIC TEMPLATE',
        message: 'Copy-paste response with no personalization',
        description: 'Standard "contact support" with no specifics'
      };
    }
    
    // 4. NO SOLUTION OFFERED (Medium)
    if (noSolution) {
      return {
        type: 'quality',
        severity: 'medium',
        category: '🟡 NO SOLUTION',
        message: 'Only "contact support" - no troubleshooting',
        description: 'No actionable steps provided'
      };
    }
    
    // 5. WRONG ISSUE ADDRESSED (Check if response mentions different issue)
    const reviewThemes = review.themes || [];
    const replyMentionsVPN = reply.includes('vpn') || reply.includes('virtual private');
    const replyMentionsBilling = reply.includes('bill') || reply.includes('charge') || reply.includes('payment');
    const replyMentionsPopups = reply.includes('popup') || reply.includes('notification');
    
    const reviewMentionsVPN = content.includes('vpn');
    const reviewMentionsBilling = content.includes('bill') || content.includes('charge');
    const reviewMentionsPopups = content.includes('popup') || content.includes('notification');
    
    if ((replyMentionsVPN && !reviewMentionsVPN) ||
        (replyMentionsBilling && !reviewMentionsBilling) ||
        (replyMentionsPopups && !reviewMentionsPopups)) {
      return {
        type: 'mismatch',
        severity: 'high',
        category: '🔴 WRONG ISSUE',
        message: 'Response addresses different problem',
        description: 'Reply talks about unrelated issue'
      };
    }
    
    return null;
  }

  // Calculate days since review was posted (for NO RESPONSE)
  function getResponseGap(dateString) {
    const reviewDate = new Date(dateString);
    const today = new Date();
    const diffTime = Math.abs(today - reviewDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
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
      
      // Response Quality filters
      if (activeFilters.notable !== 'all') {
        const quality = checkResponseQuality(r);
        let matches = false;
        
        switch(activeFilters.notable) {
          case 'no_response':
            matches = quality?.type === 'no_response';
            break;
          case 'high_rating_apology':
            matches = quality?.category?.includes('HIGH RATING + APOLOGY');
            break;
          case 'low_rating_no_empathy':
            matches = quality?.category?.includes('LOW RATING + NO EMPATHY');
            break;
          case 'generic_template':
            matches = quality?.category?.includes('GENERIC TEMPLATE');
            break;
          case 'no_solution':
            matches = quality?.category?.includes('NO SOLUTION');
            break;
          case 'wrong_issue':
            matches = quality?.category?.includes('WRONG ISSUE');
            break;
          case 'critical':
            matches = r.rating === 1;
            break;
        }
        
        if (!matches) return false;
      }
      
      return true;
    });
    
    // Pagination
    const totalPages = Math.ceil(filtered.length / REVIEWS_PER_PAGE);
    const start = (currentPage - 1) * REVIEWS_PER_PAGE;
    const reviews = filtered.slice(start, start + REVIEWS_PER_PAGE);
    
    // Render rows
    tbody.innerHTML = reviews.map(r => {
      const quality = checkResponseQuality(r);
      const rowStyle = quality?.severity === 'critical' ? 'border-left: 4px solid #DC2626; background: #FEF2F2;' : 
                       quality?.severity === 'high' ? 'border-left: 4px solid #F59E0B; background: #FEF3C7;' : 
                       quality?.severity === 'medium' ? 'border-left: 4px solid #3B82F6; background: #EFF6FF;' : '';
      
      const qualityBadge = quality ? 
        `<div style="background: ${quality.severity === 'critical' ? '#FEE2E2' : quality.severity === 'high' ? '#FEF3C7' : '#DBEAFE'}; 
                    color: ${quality.severity === 'critical' ? '#991B1B' : quality.severity === 'high' ? '#92400E' : '#1E40AF'}; 
                    padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 600; margin-bottom: 4px; display: inline-block;"
        >${quality.category}</div>` : '';
      
      const suggestedReply = generateSuggestedReply(r);
      
      return `
      <tr style="${rowStyle}">
        <td style="white-space:nowrap;font-size:0.75rem;color:#64748b;">
          <div>${r.date}</div>
          <div style="font-size:0.65rem;color:#94A3B8;">by ${r.author || 'Anonymous'}</div>
        </td>
        <td><span class="badge badge-${r.platform}">${r.platform.replace('_', ' ')}</span></td>
        <td style="font-size:1.1rem;">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</td>
        <td><span class="badge badge-${r.sentiment.label}">${r.sentiment.label}</span></td>
        <td style="max-width: 300px;">
          <div style="font-size: 0.85rem; line-height: 1.4;">${r.content}</div>
          ${r.themes?.length ? `<div style="margin-top: 4px;">${r.themes.map(t => `<span style="font-size: 0.7rem; background: #E2E8F0; padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${t}</span>`).join('')}</div>` : ''}
        </td>
        <td style="max-width: 250px;">
          ${qualityBadge}
          ${r.developer_reply ? 
            `<div style="font-size: 0.8rem; line-height: 1.4;">${r.developer_reply}</div>` : 
            '<span style="color:#EF4444; font-size: 0.8rem;">⚠️ No response from McAfee</span>' +
            (() => {
              const gap = getResponseGap(r.date);
              return gap > 1 ? `<div style="font-size: 0.7rem; color: #DC2626; font-weight: 600; margin-top: 4px;">⏰ Waiting ${gap} days</div>` : '';
            })()}
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
      const qualityIssues = filtered.filter(r => checkResponseQuality(r)).length;
      summary.innerHTML = `Showing <strong>${filtered.length > 0 ? start + 1 : 0}–${Math.min(start + REVIEWS_PER_PAGE, filtered.length)}</strong> of <strong>${filtered.length}</strong> reviews ${qualityIssues > 0 ? `(⚠️ ${qualityIssues} quality issues detected)` : ''}`;
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
  
  // ========== ANALYSIS TAB FUNCTIONS ==========
  
  function renderAnalysisCharts() {
    // Theme Sentiment Horizontal Bar Chart
    const themeData = [
      { theme: 'Security Features', positive: 75.8, negative: 18.9, neutral: 5.3, total: 132 },
      { theme: 'VPN', positive: 39.0, negative: 51.2, neutral: 9.8, total: 41 },
      { theme: 'Pricing', positive: 53.8, negative: 43.1, neutral: 3.1, total: 65 },
      { theme: 'Customer Support', positive: 61.2, negative: 30.5, neutral: 8.3, total: 54 },
      { theme: 'Performance', positive: 28.6, negative: 71.4, neutral: 0, total: 28 }
    ];
    
    const themeChartEl = document.getElementById('analysis-theme-chart');
    if (themeChartEl) {
      Plotly.newPlot('analysis-theme-chart', [
        {
          y: themeData.map(d => d.theme),
          x: themeData.map(d => d.positive),
          name: 'Positive %',
          type: 'bar',
          orientation: 'h',
          marker: { color: '#10B981' },
          text: themeData.map(d => `${d.positive}%`),
          textposition: 'inside'
        },
        {
          y: themeData.map(d => d.theme),
          x: themeData.map(d => d.negative),
          name: 'Negative %',
          type: 'bar',
          orientation: 'h',
          marker: { color: '#EF4444' },
          text: themeData.map(d => `${d.negative}%`),
          textposition: 'inside'
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
    }
    
    // Response Quality Pie Chart
    const responseChartEl = document.getElementById('analysis-response-chart');
    if (responseChartEl) {
      Plotly.newPlot('analysis-response-chart', [{
        values: [162, 300, 47, 40, 11, 19, 5],
        labels: ['Correct Response', 'No Solution', 'NO RESPONSE', 'Generic Template', 'High+Apology', 'Low+No Empathy', 'Wrong Issue'],
        type: 'pie',
        hole: 0.4,
        marker: {
          colors: ['#10B981', '#F59E0B', '#EF4444', '#FBBF24', '#DC2626', '#F97316', '#B91C1C']
        },
        textinfo: 'label+percent',
        textposition: 'outside'
      }], {
        height: 300,
        margin: { t: 10, r: 10, b: 10, l: 10 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        showlegend: false,
        annotations: [{
          text: '<b>584</b><br>reviews',
          showarrow: false,
          font: { size: 14 }
        }]
      }, {displayModeBar: false});
    }
  }
  
  // Start
  document.addEventListener('DOMContentLoaded', function() {
    init();
    // Delay analysis chart render to ensure tab is accessible
    setTimeout(renderAnalysisCharts, 500);
  });
})();