/**
 * McAfee Review Intelligence Dashboard v2.3
 * Production-ready. Module pattern, error boundaries, caching, dynamic insights.
 * v2.3: improved chart types/colors, numbers-on-bars, theme drill-down, sticky filter stats.
 */
const ReviewDashboard = (function () {
  'use strict';

  /* ─────────────────────────────────────────
     CONFIG & CONSTANTS
  ───────────────────────────────────────── */
  const CONFIG = {
    REVIEWS_PER_PAGE: 25,
    CHART_HEIGHT: 300,
    ANALYSIS_CHART_HEIGHT: 320,
    MAX_THEMES: 8,
    DEBOUNCE_DELAY: 300,
    DATA_PATH: 'data/dashboard_data.json',
    THEME_DRILL_LIMIT: 10,   // max reviews shown in drill-down panel
  };

  const COLORS = {
    positive:  '#10B981',
    neutral:   '#F59E0B',
    negative:  '#EF4444',
    info:      '#3B82F6',
    mcafee_red:'#C01818',
    // Softer secondary palette for area/volume fills
    posArea:   'rgba(16,185,129,0.12)',
    negArea:   'rgba(239,68,68,0.12)',
    volFill:   'rgba(148,163,184,0.25)',
    platforms: {
      google_play:    '#3DDC84',
      app_store:      '#007AFF',
      windows_desktop:'#00BCF2',
    },
    ratings: ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981'],
  };

  // All chart element IDs (for memory cleanup)
  const CHART_IDS = [
    'chart-combined-sentiment-volume',
    'chart-rating-trend',
    'chart-platform-breakdown',
    'chart-sentiment-dist',
    'chart-rating-dist',
    'chart-themes',
    'chart-theme-security',
    'chart-theme-support',
    'chart-theme-ux',
    'chart-theme-vpn',
    'chart-theme-pricing',
    'chart-theme-installation',
    'chart-theme-performance',
    'chart-theme-general',
    'analysis-theme-chart',
    'analysis-response-chart',
    'analysis-trends-chart',
  ];

  // Theme donut definitions — single source of truth for BOTH the bar chart and donuts.
  // catchAll:true means "reviews with NO theme tags" (general/short feedback).
  // Ordered by descending review count (mirrors bar chart sort).
  const THEME_DONUTS = [
    { name: 'General Feedback',      keywords: [],                                             catchAll: true, containerId: 'chart-theme-general',       statsId: 'stats-theme-general'       },
    { name: 'Security & Protection', keywords: ['Security Features', 'Scam/Phishing', 'Dark Web'],            containerId: 'chart-theme-security',      statsId: 'stats-theme-security'      },
    { name: 'Customer Support',      keywords: ['Customer Support'],                                           containerId: 'chart-theme-support',       statsId: 'stats-theme-support'       },
    { name: 'User Experience',       keywords: ['UI/UX', 'Pop-ups/Ads'],                                       containerId: 'chart-theme-ux',            statsId: 'stats-theme-ux'            },
    { name: 'VPN',                   keywords: ['VPN'],                                                        containerId: 'chart-theme-vpn',           statsId: 'stats-theme-vpn'           },
    { name: 'Pricing & Billing',     keywords: ['Pricing', 'Auto-Renewal'],                                    containerId: 'chart-theme-pricing',       statsId: 'stats-theme-pricing'       },
    { name: 'Setup & Installation',  keywords: ['Installation'],                                               containerId: 'chart-theme-installation',  statsId: 'stats-theme-installation'  },
    { name: 'App Performance',       keywords: ['Performance', 'App Issues'],                                  containerId: 'chart-theme-performance',   statsId: 'stats-theme-performance'   },
  ];

  /* ─────────────────────────────────────────
     PRIVATE STATE
  ───────────────────────────────────────── */
  const state = {
    data: null,
    filteredStats: [],
    filteredReviews: [],
    currentPage: 1,
    filters: {
      platform: 'all',
      rating:   'all',
      sentiment:'all',
      notable:  'all',
      search:   '',
    },
    qualityCache:      new Map(),
    analysisTabDirty:  true,
    activeTab:         'overview',
    activePeriodLabel: 'Last 1 Month',
  };

  /* ─────────────────────────────────────────
     UTILITIES
  ───────────────────────────────────────── */

  function debounce(fn, delay) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function safeRender(label, fn) {
    try { fn(); }
    catch (err) { console.error('[Dashboard] Error in ' + label + ':', err); }
  }

  function purgeCharts(ids) {
    if (typeof Plotly === 'undefined') return;
    ids.forEach(id => {
      const e = document.getElementById(id);
      if (e) try { Plotly.purge(e); } catch (_) {}
    });
  }

  function el(id) { return document.getElementById(id); }

  function fmt(num, decimals = 0) {
    if (typeof num !== 'number' || isNaN(num)) return '–';
    return num.toFixed(decimals);
  }

  function pct(val, total, decimals = 1) {
    if (!total) return 0;
    return parseFloat(((val / total) * 100).toFixed(decimals));
  }

  // Shared Plotly layout defaults
  function baseLayout(overrides) {
    return Object.assign({
      height: CONFIG.CHART_HEIGHT,
      margin: { t: 30, r: 20, b: 40, l: 50 },
      paper_bgcolor: 'transparent',
      plot_bgcolor:  'transparent',
      font: { family: 'Inter, sans-serif', size: 12, color: '#475569' },
    }, overrides);
  }

  const PLOTLY_CFG = { displayModeBar: false, responsive: true };

  /* ─────────────────────────────────────────
     UI STATES
  ───────────────────────────────────────── */

  function showLoadingState() {
    if (el('loading-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.setAttribute('role', 'status');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(248,250,252,0.95);z-index:1000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = '<div style="text-align:center;color:#64748B;"><div style="font-size:3rem;margin-bottom:1rem;">⏳</div><h2>Loading Dashboard…</h2><p>Fetching review data</p></div>';
    document.body.appendChild(overlay);
  }

  function hideLoadingState() {
    const o = el('loading-overlay');
    if (o) o.remove();
  }

  function showErrorState(message, details) {
    hideLoadingState();
    const main = document.querySelector('.main-content');
    if (main) main.innerHTML = `<div style="padding:3rem;text-align:center;color:#64748B;">
      <div style="font-size:3rem;margin-bottom:1rem;">⚠️</div>
      <h2 style="color:#EF4444;margin-bottom:.5rem;">Dashboard Error</h2>
      <p style="margin-bottom:1rem;">${message}</p>
      ${details ? `<pre style="background:#F1F5F9;padding:1rem;border-radius:8px;text-align:left;font-size:.8rem;overflow-x:auto;">${details}</pre>` : ''}
    </div>`;
  }

  function showChartError(containerId, message) {
    const c = el(containerId);
    if (c) c.innerHTML = `<div style="padding:40px;text-align:center;color:#94A3B8;">
      <div style="font-size:2rem;margin-bottom:.5rem;">📭</div>
      <div style="font-size:.9rem;">${message}</div>
    </div>`;
  }

  /* ─────────────────────────────────────────
     DATA VALIDATION
  ───────────────────────────────────────── */

  function validateData(data) {
    const errors = [];
    if (!data || typeof data !== 'object') { errors.push('Data is not a valid object'); return { valid: false, errors }; }
    if (!Array.isArray(data.daily_stats))    errors.push('daily_stats must be an array');
    if (!Array.isArray(data.recent_reviews)) errors.push('recent_reviews must be an array');
    return { valid: errors.length === 0, errors };
  }

  /* ─────────────────────────────────────────
     RESPONSE QUALITY (cached)
     Uses LLM-evaluated quality_tag stored in JSON when available.
     Falls back to heuristic classifier for any reviews without a stored tag.
  ───────────────────────────────────────── */

  // Set of all valid LLM-evaluated quality tags (for fast lookup)
  const VALID_QUALITY_TAGS = new Set([
    'NO RESPONSE', 'CORRECT', 'GENERIC TEMPLATE', 'NO SOLUTION',
    'WRONG ISSUE', 'LOW RATING + NO EMPATHY', 'HIGH RATING + APOLOGY',
    'UNWARRANTED APOLOGY'
  ]);

  // Keyword map: for each theme, words that represent it in a developer reply
  const THEME_REPLY_KEYWORDS = {
    'vpn':              ['vpn', 'virtual private'],
    'security features':['security', 'protect', 'scan', 'threat', 'malware', 'virus', 'firewall', 'cyber'],
    'performance':      ['performance', 'slow', 'speed', 'battery', 'drain', 'lag', 'memory', 'cpu'],
    'customer support': ['support', 'help', 'team', 'assist'],
    'pricing':          ['billing', 'charge', 'payment', 'price', 'subscript', 'renewal', 'refund', 'cancel'],
    'installation':     ['install', 'setup', 'device', 'remov', 'uninstall'],
    'app issues':       ['app', 'crash', 'error', 'issue', 'problem', 'bug', 'open'],
    'pop-ups/ads':      ['pop-up', 'popup', 'pop up', 'pop', 'notification', 'ads', 'alert'],
    'auto-renewal':     ['renew', 'billing', 'charge', 'subscript', 'cancel', 'auto'],
    'dark web':         ['dark web', 'darkweb', 'identity', 'breach', 'monitor'],
    'ui/ux':            ['interface', 'ui', 'design', 'navigation', 'layout', 'button', 'menu', 'experience', 'user'],
    'scam/phishing':    ['scam', 'phish', 'fraud', 'email', 'spam', 'detect'],
  };

  // NEW: Complaint indicators for intent classification (Exp 007)
  const COMPLAINT_INDICATORS = {
    strong: ['terrible', 'awful', 'horrible', 'worst', 'hate', 'garbage', 'trash', 
             'scam', 'fraud', 'rip off', 'rip-off', 'useless', 'worthless', 'crap',
             'disgusting', 'unacceptable', 'ridiculous', 'pathetic'],
    moderate: ['problem', 'issue', 'bug', 'error', 'crash', 'broken', 'not working',
               'doesn\'t work', 'won\'t work', 'can\'t', 'unable', 'failed', 'failure',
               'disappointing', 'disappointed', 'frustrating', 'frustrated', 'annoying',
               'confusing', 'confused', 'difficult', 'hard to', 'slow', 'lag', 'freeze',
               'stuck', 'frozen', 'keeps', 'constantly', 'always', 'never'],
    falsePositiveTriggers: ['just started', 'recently started', 'new to', 'first time',
                            'giving it a try', 'trying out', 'checking out', 'seeing how',
                            'so far', 'for now', 'at the moment']
  };

  // NEW: Classify review intent (Exp 007)
  function classifyReviewIntent(review) {
    const text = (review.text || review.content || '').toLowerCase();
    const rating = review.rating || 3;
    
    const hasNeutralContext = COMPLAINT_INDICATORS.falsePositiveTriggers.some(
      trigger => text.includes(trigger)
    );
    
    const strongComplaints = COMPLAINT_INDICATORS.strong.filter(w => text.includes(w));
    const moderateComplaints = COMPLAINT_INDICATORS.moderate.filter(w => text.includes(w));
    const hasQuestions = /\?/.test(text);
    const noIssuesPattern = /\b(no issues?|no problems?|working fine|works fine|so far so good|no complaints?)\b/;
    const explicitlyNoIssues = noIssuesPattern.test(text);
    
    const complaintScore = strongComplaints.length * 3 + moderateComplaints.length;
    
    if (rating <= 2 && strongComplaints.length > 0)
      return { type: 'COMPLAINT', confidence: 'high', score: complaintScore };
    if (rating <= 2 && complaintScore > 0)
      return { type: 'COMPLAINT', confidence: 'high', score: complaintScore };
    if (rating <= 2)
      return { type: 'COMPLAINT', confidence: 'medium', score: 1 };
    
    if (rating === 3 && strongComplaints.length > 0)
      return { type: 'COMPLAINT', confidence: 'high', score: complaintScore };
    if (rating === 3 && hasNeutralContext && complaintScore === 0)
      return { type: 'NEUTRAL_STATEMENT', confidence: 'high', score: 0 };
    if (rating === 3 && explicitlyNoIssues)
      return { type: 'NEUTRAL_STATEMENT', confidence: 'high', score: 0 };
    if (rating === 3 && hasQuestions && complaintScore === 0)
      return { type: 'FEEDBACK', confidence: 'medium', score: 0 };
    if (rating === 3 && complaintScore > 0)
      return { type: 'FEEDBACK', confidence: 'medium', score: complaintScore };
    if (rating === 3)
      return { type: 'FEEDBACK', confidence: 'medium', score: complaintScore };
    
    if (rating >= 4 && strongComplaints.length > 0)
      return { type: 'FEEDBACK', confidence: 'high', score: complaintScore };
    if (rating >= 4 && complaintScore > 2)
      return { type: 'FEEDBACK', confidence: 'medium', score: complaintScore };
    
    return { type: 'PRAISE', confidence: 'high', score: 0 };
  }

  function _themesCoveredInReply(themes, rl) {
    if (!themes || themes.length === 0) return true;
    return themes.some(function(theme) {
      const tl  = theme.toLowerCase();
      const kws = THEME_REPLY_KEYWORDS[tl] || [tl];
      return kws.some(function(kw) { return rl.indexOf(kw) !== -1; });
    });
  }

  function checkResponseQuality(review) {
    const key = review.id;
    if (key && state.qualityCache.has(key)) return state.qualityCache.get(key);

    function cache(val) { if (key) state.qualityCache.set(key, val); return val; }

    // ── Use LLM-evaluated stored tag when available (highest accuracy) ────────
    if (review.quality_tag && VALID_QUALITY_TAGS.has(review.quality_tag)) {
      return cache(review.quality_tag);
    }

    const hasReply = review.developer_reply && review.developer_reply.trim().length > 0;
    if (!hasReply) return cache('NO RESPONSE');

    const reply  = review.developer_reply.trim();
    const rl     = reply.toLowerCase();
    const rating = review.rating || 3;
    const themes = (review.themes || []).map(function(t) { return t.toLowerCase(); });

    // ── Signal detectors ─────────────────────────────────────────────────────

    // Apology words anywhere in reply
    const apologizes = /\b(sorry|apologize|apologies)\b/.test(rl);

    // Genuine empathy: acknowledges the customer's pain
    const hasEmpathy = (
      /\b(sorry|apologize|apologies|frustrat|concern|regret|disappoint|inconvenien|trouble|upset)\b/.test(rl) ||
      /\bwe (fully |also |completely |truly )?(understand|understand why|understand that|understand how)\b/.test(rl) ||
      /\bunderstand (your|how|why|what|the)\b/.test(rl) ||
      /we know (how|this|it)|hear (your|about your)/.test(rl) ||
      /(isn.t|is not) the experience|not what we want|not the experience/.test(rl) ||
      /\bwe.re (sorry|here to help|here for you)\b/.test(rl)
    );

    // Specific actionable help: concrete steps, tool links, phone numbers
    const hasSpecificHelp = (
      /\b(steps?:|try |reinstall|download|update|restart|reboot|turn off|turn on|enabl|disabl|click|go to settings|follow these|1-866|1-800)\b/.test(rl) ||
      /download\.mcafee|mcafee\.com\/(support|myaccount|vpn)|removal tool|mcpr\.aspx/i.test(rl)
    );

    // Generic redirect: only says "contact us/support" with no specific instructions
    const onlyRedirects = (
      /contact (us|support|our support)|reach (out|our support|us at)/.test(rl) &&
      !hasSpecificHelp &&
      reply.length < 450
    );

    // Boilerplate template: formulaic phrases unrelated to specific review content
    const isBoilerplate = (
      /we.?re elated|we are elated|elated by your|(awesome|wonderful) feedback you have provided/.test(rl) ||
      (reply.length < 150 && !hasEmpathy && !hasSpecificHelp && /thank you|thanks for/.test(rl))
    );

    // For positive reviews: generic "thanks" that doesn't engage with stated themes
    const isGenericPositive = (
      rating >= 4 &&
      !isBoilerplate &&
      !_themesCoveredInReply(review.themes || [], rl) &&
      (review.themes || []).length >= 1 &&
      /thank you|thanks|appreciate|feedback/.test(rl) &&
      !hasSpecificHelp
    );

    // Theme coverage: reply addresses the topic the customer raised
    const themesCovered = _themesCoveredInReply(review.themes || [], rl);

    // ── Review-level negative content detector ────────────────────────────────
    // Even a 4-5★ review can contain real complaints. Detect complaint language
    // in the REVIEW TEXT so we only flag "unnecessary apology" when the review
    // is genuinely positive praise with no issues raised.
    const reviewText = review.text || review.content || '';
    const rtl        = reviewText.toLowerCase();
    const _COMPLAINT_RE = /[?!]|\b(bad|no good|not good|issue|problem|bug|error|crash|fail|wrong|terrible|awful|worse|disappoint|unclear|confuse|trouble|missing|disappear|not open|not work|will not|unable|slow|drain|expensive|spam|compromis|acting up|disconnect|turns off|turned off|goes off|not receiving|not sure|not know|don.t know|don.t work|instead|have to|wouldn.t|couldn.t|shouldn.t|doesn.t|haven.t|can.t|won.t|expect|expecting|expected|disappointed|still not|keeps signing|keeps turning|keeps crash|keeps disconnect)\b/;
    const reviewHasComplaint = (
      _COMPLAINT_RE.test(rtl) ||
      ((review.sentiment && typeof review.sentiment.compound === 'number')
        ? review.sentiment.compound < 0.5 : false) ||
      (review.sentiment && review.sentiment.label !== 'positive')
    );

    // ── Classification — priority order ──────────────────────────────────────

    // NEW: Check for unwarranted apology using intent classification (Exp 007)
    const intent = classifyReviewIntent(review);
    if (apologizes && (intent.type === 'NEUTRAL_STATEMENT' || intent.type === 'PRAISE'))
      return cache('UNWARRANTED APOLOGY');

    // 1. Apologising when review is PURELY positive — no complaints at all.
    //    (If customer described ANY issue, the apology is actually appropriate.)
    if (rating >= 4 && apologizes && !reviewHasComplaint)
      return cache('HIGH RATING + APOLOGY');

    // 2. Upset 1-2★ customer received zero empathetic acknowledgment
    if (rating <= 2 && !hasEmpathy)
      return cache('LOW RATING + NO EMPATHY');

    // 3. Copy-paste boilerplate that doesn't engage with actual content
    if (isBoilerplate || isGenericPositive)
      return cache('GENERIC TEMPLATE');

    // 4. Negative/neutral review: reply completely misses the topic raised
    if (rating <= 3 && !themesCovered && (review.themes || []).length >= 1 && reply.length < 500)
      return cache('WRONG ISSUE');

    // 5. Negative review gets only a "contact us" redirect — no real help
    if (rating <= 2 && onlyRedirects)
      return cache('NO SOLUTION');

    // 6. Has empathy but offers zero actionable guidance (no steps, no redirect)
    if (rating <= 3 && hasEmpathy && !hasSpecificHelp && !onlyRedirects)
      return cache('NO SOLUTION');

    // All signals passed — response is appropriate
    return cache('CORRECT');
  }

  /* ─────────────────────────────────────────
     RESPONSE QUALITY EXPLANATION
     Returns a short human-readable note explaining WHY a response
     was flagged — shown inline in the Reviews table.
  ───────────────────────────────────────── */

  function getQualityExplanation(review, quality) {
    switch (quality) {
      case 'UNWARRANTED APOLOGY':
        return 'The user made a neutral statement or left positive feedback — no complaint was expressed. An apology is unnecessary.';
      case 'HIGH RATING + APOLOGY':
        return 'Customer left a purely positive review — apologising is confusing and unnecessary here.';
      case 'LOW RATING + NO EMPATHY':
        return 'Very upset customer (1-2★) received a cold, mechanical reply with no acknowledgment of frustration.';
      case 'GENERIC TEMPLATE':
        return 'Copy-paste boilerplate — doesn\'t reference the specific product issue or customer context.';
      case 'WRONG ISSUE': {
        const th = (review.themes || []).join(', ');
        return 'Reply misses the core concern' + (th ? ' (' + th + ')' : '') + ' — talks around rather than addressing it.';
      }
      case 'NO SOLUTION':
        return 'Shows empathy but ends there — no concrete steps, links, or actionable next move offered.';
      case 'NO RESPONSE':
        return null;
      default:
        return null;
    }
  }

  /* ─────────────────────────────────────────
     PERSONALIZED SUGGESTED REPLY GENERATOR
     Builds a unique, encouraging, Hi-Name reply
     tailored to the quality issue + review themes.
     Replaces static suggested_reply templates from data.
  ───────────────────────────────────────── */

  // Words that look like names after casing but are really not (common words, greetings, etc.)
  const _NON_NAME_WORDS = new Set(['hi','hey','me','user','anon','anonymous','unknown','test','n/a','na','none']);

  function _getFirstName(author) {
    if (!author || !author.trim()) return null;
    var cleaned = author.replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s*/i, '').trim();
    var parts   = cleaned.split(/\s+/);
    var first   = parts[0] || '';
    // Skip bare initials like "A." — use second word if available
    if (/^[A-Za-z]\.$/.test(first) && parts[1]) first = parts[1];
    // Normalize casing (leave mixed-case as-is, fix all-upper or all-lower)
    if (first.length > 1 && (first === first.toUpperCase() || first === first.toLowerCase()))
      first = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    // Reject non-name tokens (K&N, numbers, common words, etc.)
    if (/[^a-zA-Z'\-.]/g.test(first)) return null;
    if (_NON_NAME_WORDS.has(first.toLowerCase())) return null;
    if (first.length < 2) return null;
    return first || null;
  }

  function buildPersonalizedReply(review, quality) {
    if (quality === 'CORRECT') return null;

    // Prefer LLM-generated suggested reply stored in the JSON data
    if (review.suggested_reply && review.suggested_reply.trim().length > 20) {
      return review.suggested_reply.trim();
    }

    var name   = _getFirstName(review.author);
    var hi     = name ? ('Hi ' + name + ', ') : '';
    var rating = review.rating || 3;
    var themes = (review.themes || []).map(function(t) { return t.toLowerCase(); });
    var tl     = (review.text || review.content || '').toLowerCase();

    // ── Topic detection ────────────────────────────────────────────────────
    var hasVPN     = themes.some(function(t){ return /vpn/.test(t); })     || tl.indexOf('vpn') !== -1;
    var hasBilling = themes.some(function(t){ return /pricing|billing|auto-renewal/.test(t); }) ||
                     /bill|charge|refund|cancel|subscript|renewal/.test(tl);
    var hasPerf    = themes.some(function(t){ return /performance/.test(t); }) ||
                     /slow|battery|drain|speed|lag|memory/.test(tl);
    var hasInstall = themes.some(function(t){ return /installation/.test(t); }) ||
                     /install|remov|uninstall|setup/.test(tl);
    var hasPopups  = themes.some(function(t){ return /pop-up|popup/.test(t); }) ||
                     /pop.up|popup|notification|ads/.test(tl);
    var hasDarkWeb = themes.some(function(t){ return /dark web/.test(t); });
    var hasSupport = themes.some(function(t){ return /customer support/.test(t); });
    var hasScam    = themes.some(function(t){ return /scam|phish/.test(t); }) ||
                     /scam|phish|spam/.test(tl);

    // ── Theme-specific concrete action (avoids repeating what was already said) ──
    function themeAction() {
      if (hasVPN)
        return 'For VPN issues, try toggling it off and back on in the McAfee app, then restart your device. Our VPN specialists at 1-866-622-3911 can also diagnose connection drops remotely.';
      if (hasBilling)
        return 'Our billing team at 1-866-622-3911 can review your account, clarify any charges, and process corrections same-day — please have your account email ready.';
      if (hasPerf)
        return 'To recover performance, update McAfee to the latest version and clear the app cache (Settings \u2192 Apps \u2192 McAfee \u2192 Clear Cache). Our team at mcafee.com/support can also run a full device check.';
      if (hasInstall)
        return 'Our dedicated McAfee Removal Tool at download.mcafee.com/mcpR.aspx does a clean sweep with one click. Our team can then walk you through a fresh install over chat at mcafee.com/support.';
      if (hasPopups)
        return 'You can disable product alerts under McAfee \u2192 Settings \u2192 General \u2192 turn off "Product announcements". Our team can also help fine-tune exactly which notifications appear.';
      if (hasDarkWeb)
        return 'A Dark Web alert means your info appeared in a known data breach — change passwords for affected accounts immediately. Our identity specialists at 1-866-622-3911 can guide you through each step.';
      if (hasScam)
        return 'Make sure "Scam Protection" is toggled ON in the McAfee app. Our team at mcafee.com/support can verify all your settings are fully active and protecting you.';
      if (hasSupport)
        return 'We take every support interaction seriously. Please share the date and reference number at mcafee.com/support so we can follow up with the agent and make it right.';
      return 'Please reach out at mcafee.com/support or call 1-866-622-3911 — our specialists will stay with you until it is fully resolved.';
    }

    // ── Reply templates per quality type ──────────────────────────────────

    if (quality === 'NO RESPONSE') {
      if (rating >= 4) {
        var ref4 = themes.length > 0
          ? themes[0].replace(/\b\w/g, function(c){ return c.toUpperCase(); })
          : 'McAfee';
        return hi + 'Thank you so much for the kind words — it genuinely motivates our entire team! '
          + 'Knowing ' + ref4 + ' is delivering for you is exactly why we do this work every day. '
          + 'If anything ever comes up, just reach out — we are always here for you. \uD83D\uDEE1\uFE0F';
      }
      return hi + 'We sincerely apologize for the silence — you deserved a response and we let you down. '
        + themeAction()
        + ' We would love the chance to make this right for you.';
    }

    if (quality === 'HIGH RATING + APOLOGY') {
      var ref5 = themes.length > 0
        ? 'feedback on ' + themes[0].replace(/\b\w/g, function(c){ return c.toUpperCase(); })
        : 'your loyalty and trust';
      return hi + 'Thank you for the ' + rating + '-star review — this made our day! '
        + 'We really appreciate ' + ref5 + '. '
        + 'You are in great hands, and we are here whenever you need us. \uD83D\uDC4D';
    }

    if (quality === 'LOW RATING + NO EMPATHY') {
      return hi + 'We are truly sorry your experience fell short — that is not the standard we hold ourselves to, '
        + 'and you deserved a more caring response from the start. '
        + themeAction()
        + ' We are committed to turning this around for you.';
    }

    if (quality === 'GENERIC TEMPLATE') {
      if (rating >= 4) {
        var ref3 = themes.length > 0
          ? 'on ' + themes[0].replace(/\b\w/g, function(c){ return c.toUpperCase(); })
          : 'with McAfee';
        return hi + 'Thank you for the ' + rating + '-star review and for sharing your thoughts '
          + ref3 + '! '
          + 'Your feedback directly shapes our next improvements. '
          + (themes.length > 0
              ? themeAction()
              : 'If anything ever comes up, we are just a message away!');
      }
      return hi + 'You deserve a real answer, not a copy-paste — we hear you. '
        + themeAction()
        + ' Let us fix this together.';
    }

    if (quality === 'WRONG ISSUE') {
      var focus = themes.length > 0
        ? themes[0].replace(/\b\w/g, function(c){ return c.toUpperCase(); })
        : 'your specific concern';
      return hi + 'We want to make sure we are actually helping with what matters — '
        + focus + '. '
        + themeAction()
        + ' Please reach out so we can give this the focused attention it deserves.';
    }

    if (quality === 'NO SOLUTION') {
      return hi + 'We hear you, and we owe you a concrete solution — not just sympathy. '
        + themeAction()
        + ' Our specialists will stay with you until it is completely sorted out.';
    }

    if (quality === 'UNWARRANTED APOLOGY') {
      const intent = classifyReviewIntent(review);
      if (intent.type === 'NEUTRAL_STATEMENT') {
        // Check if family/multi-device context
        const isFamilyContext = /daughter|son|child|kid|family|wife|husband/i.test(tl);
        if (isFamilyContext) {
          return hi + 'Thanks for choosing McAfee to protect your family! 🛡️ '
            + 'Since you\'re just getting started, here are features worth exploring: '
            + 'VPN for private browsing on any network, Dark Web Monitoring to alert you if your info appears in breaches, '
            + 'and Safe Family for parental controls. What would make your experience even better? We\'re here to help!';
        }
        return hi + 'Thanks for giving McAfee a try! We\'d love to help you get the most from your protection. '
          + 'Have you explored features like our VPN, Dark Web Monitoring, or Identity Theft Protection? '
          + 'If there\'s anything we can do to make your experience better, just let us know — we\'re here!';
      }
      // PRAISE intent — keep positive, skip the apology
      var ref7 = themes.length > 0
        ? 'feedback on ' + themes[0].replace(/\b\w/g, function(c){ return c.toUpperCase(); })
        : 'your loyalty and trust';
      return hi + 'Thank you for the ' + rating + '-star review — this made our day! '
        + 'We really appreciate ' + ref7 + '. '
        + 'You are in great hands, and we are here whenever you need us. 👍';
    }

    return review.suggested_reply || null;
  }

  /* ─────────────────────────────────────────
     FILTERING
  ───────────────────────────────────────── */

  function filterReviews(reviews) {
    const { platform, rating, sentiment, notable, search } = state.filters;
    return reviews.filter(r => {
      if (platform  !== 'all' && r.platform !== platform) return false;
      if (rating    !== 'all' && r.rating !== parseInt(rating, 10)) return false;
      if (sentiment !== 'all' && (r.sentiment?.label || 'neutral') !== sentiment) return false;
      if (notable   !== 'all') {
        const quality = checkResponseQuality(r);
        const map = {
          no_response: 'NO RESPONSE', high_rating_apology: 'HIGH RATING + APOLOGY',
          low_rating_no_empathy: 'LOW RATING + NO EMPATHY', generic_template: 'GENERIC TEMPLATE',
          no_solution: 'NO SOLUTION', wrong_issue: 'WRONG ISSUE',
          unwarranted_apology: 'UNWARRANTED APOLOGY',
        };
        if (notable === 'critical' && r.rating !== 1) return false;
        else if (notable !== 'critical' && map[notable] && quality !== map[notable]) return false;
      }
      if (search) {
        const s   = search.toLowerCase();
        const txt = (r.text || r.content || '').toLowerCase();
        if (!txt.includes(s) && !(r.developer_reply || '').toLowerCase().includes(s) &&
            !(r.themes || []).some(t => t.toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }

  /* ─────────────────────────────────────────
     KPI CARDS
  ───────────────────────────────────────── */

  function renderKPIs() {
    safeRender('renderKPIs', () => {
      const reviews = state.filteredReviews;
      const total   = reviews.length;
      const avgRating = total > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
      let pos = 0, neu = 0, neg = 0;
      reviews.forEach(r => {
        const l = r.sentiment?.label || 'neutral';
        if (l === 'positive') pos++; else if (l === 'negative') neg++; else neu++;
      });
      const noReplyCount  = reviews.filter(r => !r.developer_reply || !r.developer_reply.trim()).length;
      const responseRate  = total > 0 ? pct(total - noReplyCount, total) : 0;
      const rColor = responseRate >= 85 ? '#10B981' : responseRate >= 70 ? '#F59E0B' : '#EF4444';

      const grid = el('kpi-grid');
      if (!grid) return;
      grid.innerHTML = `
        <div class="kpi-card kpi-total">
          <div class="kpi-header"><span class="kpi-label">Total Reviews</span><span class="kpi-icon">📋</span></div>
          <div class="kpi-value">${total.toLocaleString()}</div>
        </div>
        <div class="kpi-card kpi-rating">
          <div class="kpi-header"><span class="kpi-label">Avg Rating</span><span class="kpi-icon">⭐</span></div>
          <div class="kpi-value">${fmt(avgRating, 2)}</div>
        </div>
        <div class="kpi-card kpi-sentiment">
          <div class="kpi-header"><span class="kpi-label">Positive</span><span class="kpi-icon">😊</span></div>
          <div class="kpi-value" style="color:#10B981;">${pos}</div>
          <div class="kpi-change positive">↑ ${pct(pos, total)}%</div>
        </div>
        <div class="kpi-card kpi-negative">
          <div class="kpi-header"><span class="kpi-label">Negative</span><span class="kpi-icon">😡</span></div>
          <div class="kpi-value" style="color:#EF4444;">${neg}</div>
          <div class="kpi-change negative">↓ ${pct(neg, total)}%</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-header"><span class="kpi-label">Response Rate</span><span class="kpi-icon">💬</span></div>
          <div class="kpi-value" style="color:${rColor};">${fmt(responseRate, 1)}%</div>
        </div>`;
    });
  }

  /* ─────────────────────────────────────────
     FILTER BAR SUMMARY (sticky strip)
  ───────────────────────────────────────── */

  function updateFilterSummary() {
    const badge = el('filter-active-badge');
    if (!badge) return;
    const total = state.filteredReviews.length;
    const noReply = state.filteredReviews.filter(r => !r.developer_reply || !r.developer_reply.trim()).length;
    const pos = state.filteredReviews.filter(r => r.sentiment?.label === 'positive').length;
    const neg = state.filteredReviews.filter(r => r.sentiment?.label === 'negative').length;
    badge.innerHTML = `
      <span class="filter-period-pill">${state.activePeriodLabel}</span>
      <span class="filter-stat">${total.toLocaleString()} reviews</span>
      <span class="filter-stat-sep">·</span>
      <span class="filter-stat" style="color:#10B981;">😊 ${pos} positive</span>
      <span class="filter-stat-sep">·</span>
      <span class="filter-stat" style="color:#EF4444;">😡 ${neg} negative</span>
      ${noReply > 0 ? `<span class="filter-stat-sep">·</span><span class="filter-stat" style="color:#F59E0B;">⏰ ${noReply} unanswered</span>` : ''}`;
  }

  /* ─────────────────────────────────────────
     OVERVIEW CHARTS  (improved v2.3)
  ───────────────────────────────────────── */

  function renderOverviewCharts() {
    safeRender('renderOverviewCharts', () => {
      purgeCharts(CHART_IDS.filter(id => !id.startsWith('analysis-')));

      const stats   = state.filteredStats;
      const reviews = state.filteredReviews;

      if (!reviews.length) {
        showChartError('chart-combined-sentiment-volume', 'No data for selected period');
        ['chart-rating-trend','chart-platform-breakdown','chart-sentiment-dist',
         'chart-rating-dist','chart-themes'].forEach(id =>
          showChartError(id, 'No data for selected period'));
        THEME_DONUTS.forEach(td => {
          showChartError(td.containerId, 'No data');
          const s = el(td.statsId); if (s) s.innerHTML = '';
        });
        return;
      }

      // ── 1. Combined Sentiment + Volume ───────────────────
      safeRender('chart-combined', () => {
        const dates = stats.map(d => d.date);

        // Volume per platform per date
        const volByDate = {};
        reviews.forEach(r => {
          if (!volByDate[r.date]) volByDate[r.date] = {};
          volByDate[r.date][r.platform] = (volByDate[r.date][r.platform] || 0) + 1;
        });

        // Smooth sentiment lines — build from per-review counts per day
        const sentByDate = {};
        reviews.forEach(r => {
          if (!sentByDate[r.date]) sentByDate[r.date] = { positive: 0, negative: 0, neutral: 0 };
          sentByDate[r.date][r.sentiment?.label || 'neutral']++;
        });

        const platforms = ['google_play', 'app_store', 'windows_desktop'];
        const platNames = { google_play: 'Google Play', app_store: 'App Store', windows_desktop: 'Windows' };
        const volTraces = platforms.map(p => ({
          x: dates, y: dates.map(d => (volByDate[d] || {})[p] || 0),
          name: platNames[p], type: 'bar',
          marker: { color: COLORS.platforms[p], opacity: 0.55 },
          yaxis: 'y2', hovertemplate: '%{y} ' + platNames[p] + ' reviews<extra></extra>',
        }));

        Plotly.newPlot('chart-combined-sentiment-volume', [
          { x: dates, y: dates.map(d => (sentByDate[d] || {}).positive || 0),
            name: '😊 Positive', type: 'scatter', mode: 'lines', yaxis: 'y',
            line: { color: COLORS.positive, width: 2.5, shape: 'spline' },
            fill: 'tozeroy', fillcolor: COLORS.posArea,
            hovertemplate: '%{y} positive reviews<extra></extra>' },
          { x: dates, y: dates.map(d => (sentByDate[d] || {}).negative || 0),
            name: '😡 Negative', type: 'scatter', mode: 'lines', yaxis: 'y',
            line: { color: COLORS.negative, width: 2.5, shape: 'spline' },
            fill: 'tozeroy', fillcolor: COLORS.negArea,
            hovertemplate: '%{y} negative reviews<extra></extra>' },
          ...volTraces,
        ], baseLayout({
          height: 360,
          margin: { t: 40, r: 80, b: 50, l: 50 },
          xaxis: { tickangle: -25, gridcolor: '#F1F5F9', showgrid: true },
          yaxis:  { title: 'Sentiment count', side: 'left', gridcolor: '#F1F5F9', zeroline: false },
          yaxis2: { title: 'Daily volume', overlaying: 'y', side: 'right', showgrid: false, zeroline: false },
          barmode: 'stack',
          legend: { orientation: 'h', y: -0.22, x: 0.5, xanchor: 'center', font: { size: 11 } },
          hovermode: 'x unified',
        }), PLOTLY_CFG);
      });

      // ── 2. Rating Trend (with 4★ reference line) ─────────
      safeRender('chart-rating-trend', () => {
        const dates    = stats.map(d => d.date);
        const ratings  = stats.map(d => d.avg_rating);
        const avgAll   = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

        Plotly.newPlot('chart-rating-trend', [
          { x: dates, y: ratings, name: 'Avg Rating', type: 'scatter', mode: 'lines+markers',
            line: { color: COLORS.neutral, width: 2.5, shape: 'spline' },
            marker: { size: 5, color: COLORS.neutral },
            fill: 'tozeroy', fillcolor: 'rgba(245,158,11,0.07)',
            hovertemplate: '%{y:.2f}★ on %{x}<extra></extra>' },
          // Reference line at 4.0 (good threshold)
          { x: [dates[0], dates[dates.length - 1]], y: [4, 4],
            name: '4★ Target', type: 'scatter', mode: 'lines',
            line: { color: '#10B981', width: 1.5, dash: 'dot' },
            hoverinfo: 'none' },
        ], baseLayout({
          yaxis: { range: [1, 5.2], title: 'Avg Rating', dtick: 1, gridcolor: '#F1F5F9', zeroline: false },
          xaxis: { tickangle: -25, gridcolor: '#F1F5F9' },
          legend: { orientation: 'h', y: -0.22, font: { size: 11 } },
          annotations: [{
            x: dates[dates.length - 1], y: avgAll,
            text: fmt(avgAll, 2) + '★ avg', showarrow: false,
            font: { size: 12, color: COLORS.neutral }, xanchor: 'right', yanchor: 'bottom',
          }],
        }), PLOTLY_CFG);
      });

      // ── 3. Platform Breakdown → Sentiment % per Platform ─
      // More insightful than raw counts: shows which platform drives negative reviews
      safeRender('chart-platform-breakdown', () => {
        const platSent = {};
        reviews.forEach(r => {
          if (!platSent[r.platform]) platSent[r.platform] = { positive: 0, neutral: 0, negative: 0, total: 0 };
          platSent[r.platform][r.sentiment?.label || 'neutral']++;
          platSent[r.platform].total++;
        });
        const plats = Object.keys(platSent);
        const platLabels = plats.map(p =>
          p === 'google_play' ? `Google Play\n(${platSent[p].total})` :
          p === 'app_store'   ? `App Store\n(${platSent[p].total})` :
          `Windows\n(${platSent[p].total})`);

        const mkPct = (p, key) => platSent[p].total > 0 ? parseFloat((platSent[p][key] / platSent[p].total * 100).toFixed(1)) : 0;

        Plotly.newPlot('chart-platform-breakdown', [
          { x: platLabels, y: plats.map(p => mkPct(p,'positive')), name: '😊 Positive',
            type: 'bar', marker: { color: COLORS.positive },
            text: plats.map(p => mkPct(p,'positive') + '%'), textposition: 'inside',
            insidetextanchor: 'middle', hovertemplate: '%{y:.1f}% positive<extra></extra>' },
          { x: platLabels, y: plats.map(p => mkPct(p,'neutral')), name: '😐 Neutral',
            type: 'bar', marker: { color: COLORS.neutral },
            text: plats.map(p => mkPct(p,'neutral') + '%'), textposition: 'inside',
            insidetextanchor: 'middle', hovertemplate: '%{y:.1f}% neutral<extra></extra>' },
          { x: platLabels, y: plats.map(p => mkPct(p,'negative')), name: '😡 Negative',
            type: 'bar', marker: { color: COLORS.negative },
            text: plats.map(p => mkPct(p,'negative') + '%'), textposition: 'inside',
            insidetextanchor: 'middle', hovertemplate: '%{y:.1f}% negative<extra></extra>' },
        ], baseLayout({
          barmode: 'stack',
          xaxis: { type: 'category', gridcolor: '#F1F5F9' },
          yaxis: { title: 'Sentiment %', range: [0, 105], dtick: 25, gridcolor: '#F1F5F9', zeroline: false },
          legend: { orientation: 'h', y: -0.25, font: { size: 11 } },
          barnorm: 'percent',
        }), PLOTLY_CFG);
      });

      // ── 4. Sentiment Distribution (donut with annotation) ─
      safeRender('chart-sentiment-dist', () => {
        const c = { positive: 0, neutral: 0, negative: 0 };
        reviews.forEach(r => { c[r.sentiment?.label || 'neutral']++; });
        const total = reviews.length;
        const posPct = total > 0 ? (c.positive / total * 100).toFixed(0) : 0;

        Plotly.newPlot('chart-sentiment-dist', [{
          values: [c.positive, c.neutral, c.negative],
          labels: ['Positive', 'Neutral', 'Negative'],
          type: 'pie', hole: 0.52,
          marker: { colors: [COLORS.positive, COLORS.neutral, COLORS.negative], line: { color: 'white', width: 2 } },
          textinfo: 'label+value',
          hovertemplate: '<b>%{label}</b><br>%{value} reviews<br>%{percent}<extra></extra>',
        }], baseLayout({
          margin: { t: 20, r: 10, b: 20, l: 10 },
          showlegend: false,
          annotations: [{
            text: `<b>${posPct}%</b><br><span style="font-size:10px">positive</span>`,
            showarrow: false, font: { size: 15, color: COLORS.positive },
            x: 0.5, y: 0.5, xref: 'paper', yref: 'paper',
          }],
        }), PLOTLY_CFG);
      });

      // ── 5. Rating Distribution (horizontal — easier to read labels) ──
      safeRender('chart-rating-dist', () => {
        const rc = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        reviews.forEach(r => { if (rc[r.rating] !== undefined) rc[r.rating]++; });
        const avgR = reviews.reduce((s, r) => s + r.rating, 0) / (reviews.length || 1);

        Plotly.newPlot('chart-rating-dist', [{
          y: ['1★', '2★', '3★', '4★', '5★'],
          x: [rc[1], rc[2], rc[3], rc[4], rc[5]],
          type: 'bar', orientation: 'h',
          marker: { color: COLORS.ratings },
          text: [rc[1], rc[2], rc[3], rc[4], rc[5]].map(v => v > 0 ? v : ''),
          textposition: 'outside',
          hovertemplate: '<b>%{y}</b>: %{x} reviews<extra></extra>',
        }], baseLayout({
          margin: { t: 30, r: 55, b: 40, l: 40 },
          xaxis: { title: 'Reviews', gridcolor: '#F1F5F9', zeroline: false },
          yaxis: { type: 'category', gridcolor: '#F1F5F9' },
          showlegend: false,
          annotations: [{
            x: Math.max(rc[1], rc[2], rc[3], rc[4], rc[5]) * 0.98,
            y: '3★',
            text: `Avg: ${fmt(avgR, 2)}★`,
            showarrow: false,
            font: { size: 11, color: COLORS.neutral },
            bgcolor: 'rgba(255,255,255,0.8)',
            bordercolor: COLORS.neutral,
            borderwidth: 1,
            borderpad: 4,
          }],
        }), PLOTLY_CFG);
      });

      // ── 6. Category Health Pulse — % Negative vs % Responded per category ──
      // Replaces the old stacked bar (which duplicated the donut charts).
      // Shows the two metrics that matter most to executives and support teams:
      //   • How unhappy are customers in each category?  (red = % negative)
      //   • How well is the team responding?             (teal = % with developer reply)
      // Sorted by % negative descending — worst areas appear first.
      safeRender('chart-themes', () => {
        const catData = THEME_DONUTS.map(td => {
          const matched = td.catchAll
            ? reviews.filter(r => !r.themes || r.themes.length === 0)
            : reviews.filter(r =>
                (r.themes || []).some(t => td.keywords.some(kw => t.toLowerCase().includes(kw.toLowerCase())))
              );
          if (!matched.length) return null;
          const negPct      = parseFloat((matched.filter(r => r.sentiment?.label === 'negative').length / matched.length * 100).toFixed(1));
          const respondedPct = parseFloat((matched.filter(r => r.developer_reply).length / matched.length * 100).toFixed(1));
          return { name: td.name, total: matched.length, negPct, respondedPct };
        })
        .filter(Boolean)
        .sort((a, b) => b.negPct - a.negPct);   // worst first

        if (!catData.length) { showChartError('chart-themes', 'No theme data'); return; }

        const names         = catData.map(d => d.name);
        const negPcts       = catData.map(d => d.negPct);
        const respondedPcts = catData.map(d => d.respondedPct);
        const totals        = catData.map(d => d.total);

        // Color each negative bar: red if > 50%, orange if 30-50%, yellow-green if < 30%
        const negColors = negPcts.map(p => p > 50 ? '#EF4444' : p > 30 ? '#F97316' : '#F59E0B');

        Plotly.newPlot('chart-themes', [
          {
            y: names, x: negPcts, name: '😡 % Negative',
            type: 'bar', orientation: 'h',
            marker: { color: negColors },
            text: negPcts.map(p => p + '%'),
            textposition: 'outside',
            textfont: { size: 11, color: '#374151' },
            hovertemplate: '<b>%{y}</b><br>😡 Negative: %{x}%<br>(%{customdata} reviews total)<extra></extra>',
            customdata: totals,
            xaxis: 'x', yaxis: 'y',
          },
          {
            y: names, x: respondedPcts, name: '💬 % Responded',
            type: 'bar', orientation: 'h',
            marker: { color: '#0EA5E9', opacity: 0.85 },
            text: respondedPcts.map(p => p + '%'),
            textposition: 'outside',
            textfont: { size: 11, color: '#374151' },
            hovertemplate: '<b>%{y}</b><br>💬 Responded: %{x}%<extra></extra>',
            xaxis: 'x2', yaxis: 'y',
          },
        ], {
          ...baseLayout({
            height: 340,
            barmode: 'group',
            margin: { t: 30, r: 60, b: 40, l: 155 },
            legend: { orientation: 'h', y: -0.12, x: 0.5, xanchor: 'center', font: { size: 11 } },
            hovermode: 'y unified',
          }),
          // Two separate x-axes so both bars share the same 0-100% scale
          xaxis:  { domain: [0, 0.48], range: [0, 105], title: '% Negative', gridcolor: '#F1F5F9', ticksuffix: '%', zeroline: false },
          xaxis2: { domain: [0.52, 1], range: [0, 105], title: '% Responded', gridcolor: '#F1F5F9', ticksuffix: '%', zeroline: false },
          yaxis:  { gridcolor: '#F1F5F9', automargin: true },
          annotations: [{
            text: '← Negative Sentiment',
            x: 0.24, y: 1.06, xref: 'paper', yref: 'paper',
            showarrow: false, font: { size: 10, color: '#EF4444' },
          }, {
            text: 'Response Rate →',
            x: 0.76, y: 1.06, xref: 'paper', yref: 'paper',
            showarrow: false, font: { size: 10, color: '#0EA5E9' },
          }],
        }, PLOTLY_CFG);
      });

      // ── 7-14. Theme donuts (enhanced: count, click-to-drill) ──
      THEME_DONUTS.forEach(td =>
        renderThemeDonut(td.name, td.keywords, td.containerId, td.statsId, td.catchAll));
    });
  }

  /* ─────────────────────────────────────────
     THEME DONUTS (enhanced)
  ───────────────────────────────────────── */

  function renderThemeDonut(name, keywords, containerId, statsId, catchAll) {
    safeRender('themeDonut-' + name, () => {
      const total   = state.filteredReviews.length;
      // catchAll: reviews with no theme tags at all (general/short feedback)
      const matched = catchAll
        ? state.filteredReviews.filter(r => !r.themes || r.themes.length === 0)
        : state.filteredReviews.filter(r =>
            (r.themes || []).some(t => keywords.some(kw => t.toLowerCase().includes(kw.toLowerCase())))
          );

      const statsEl = el(statsId);

      if (!matched.length) {
        showChartError(containerId, 'No ' + name + ' reviews in range');
        if (statsEl) statsEl.innerHTML = '<span class="theme-stat-none">No data for this period</span>';
        return;
      }

      const counts = { positive: 0, neutral: 0, negative: 0 };
      matched.forEach(r => { counts[r.sentiment?.label || 'neutral']++; });
      const avg    = matched.reduce((s, r) => s + r.rating, 0) / matched.length;
      const themePct = pct(matched.length, total);

      // ── Stat strip below chart (pos/neu/neg clickable badges) ──
      if (statsEl) {
        const negPct = matched.length ? (counts.negative / matched.length) * 100 : 0;
        const batteryColor = negPct < 30 ? '#10B981' : negPct < 50 ? '#F59E0B' : '#EF4444';
        const fillWidth = Math.max(2, Math.min(100, parseFloat(themePct)));

        statsEl.innerHTML = `
          <div class="battery-bar-wrap" title="${matched.length} of ${total} reviews mention ${name}">
            <div class="battery-body">
              <div class="battery-fill" style="width:${fillWidth}%;background:${batteryColor};"></div>
              <span class="battery-label">${themePct}%</span>
            </div>
            <div class="battery-terminal"></div>
          </div>
          <div class="theme-stat-total">${matched.length} of ${total} reviews (${themePct}%)</div>
          <div class="theme-stat-sentiments">
            <button class="theme-sent-btn btn-pos" data-theme="${name}" data-sent="positive"
              title="Click to see positive ${name} reviews">
              😊 ${counts.positive} positive
            </button>
            <button class="theme-sent-btn btn-neu" data-theme="${name}" data-sent="neutral"
              title="Click to see neutral ${name} reviews">
              😐 ${counts.neutral} neutral
            </button>
            <button class="theme-sent-btn btn-neg" data-theme="${name}" data-sent="negative"
              title="Click to see negative ${name} reviews">
              😡 ${counts.negative} negative
            </button>
          </div>`;

        statsEl.querySelectorAll('.theme-sent-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const sentiment = btn.dataset.sent;
            const subset = matched.filter(r => (r.sentiment?.label || 'neutral') === sentiment);
            showThemeReviews(name, sentiment, subset, matched.length, total);
          });
        });
      }

      // ── Donut chart ─────────────────────────────────────────
      Plotly.newPlot(containerId, [{
        values: [counts.positive, counts.neutral, counts.negative],
        labels: ['Positive', 'Neutral', 'Negative'],
        type: 'pie', hole: 0.5,
        marker: {
          colors: [COLORS.positive, COLORS.neutral, COLORS.negative],
          line: { color: 'white', width: 2 },
        },
        textinfo: 'percent+value',
        textposition: 'inside',
        insidetextorientation: 'horizontal',
        hovertemplate: '<b>%{label}</b><br>%{value} reviews (%{percent})<extra></extra>',
        pull: [0, 0, 0],    // no slice pulled out by default
      }], baseLayout({
        height: 240,
        margin: { t: 20, r: 10, b: 10, l: 10 },
        showlegend: true,
        legend: { orientation: 'h', y: -0.05, font: { size: 10 }, x: 0.5, xanchor: 'center' },
        annotations: [{
          text: `<b>${fmt(avg, 1)}★</b><br><span style="font-size:10px">${themePct}%</span>`,
          showarrow: false,
          font: { size: 14, color: avg >= 3.5 ? COLORS.positive : COLORS.negative },
          x: 0.5, y: 0.5, xref: 'paper', yref: 'paper',
        }],
      }), PLOTLY_CFG);

      // ── Plotly slice click → show reviews drill-down ─────────
      const chartEl = el(containerId);
      if (chartEl) {
        chartEl.on('plotly_click', function (data) {
          if (!data.points?.length) return;
          const label     = data.points[0].label.toLowerCase(); // positive/neutral/negative
          const subset    = matched.filter(r => (r.sentiment?.label || 'neutral') === label);
          showThemeReviews(name, label, subset, matched.length, total);
        });
      }
    });
  }

  /* ─────────────────────────────────────────
     THEME REVIEW DRILL-DOWN PANEL
  ───────────────────────────────────────── */

  const QUALITY_BADGE = {
    'CORRECT':               '<span class="badge badge-quality correct">✅ Good Response</span>',
    'NO RESPONSE':           '<span class="badge badge-quality no-response">⏰ No Response</span>',
    'GENERIC TEMPLATE':      '<span class="badge badge-quality generic">🟡 Generic Template</span>',
    'NO SOLUTION':           '<span class="badge badge-quality no-solution">🟡 No Solution Offered</span>',
    'HIGH RATING + APOLOGY': '<span class="badge badge-quality apology">🔵 Unnecessary Apology</span>',
    'LOW RATING + NO EMPATHY': '<span class="badge badge-quality no-empathy">🔴 No Empathy</span>',
    'WRONG ISSUE':           '<span class="badge badge-quality wrong-issue">🔴 Wrong Issue</span>',
    'UNWARRANTED APOLOGY':   '<span class="badge badge-quality unwarranted-apology">🟠 Unwarranted Apology</span>',
  };

  function showThemeReviews(themeName, sentiment, reviews, themeTotal, grandTotal) {
    const panel = el('theme-reviews-panel');
    if (!panel) return;

    const sentConfig = {
      positive: { icon: '😊', label: 'Positive', color: '#10B981', bg: '#F0FDF4', border: '#A7F3D0' },
      neutral:  { icon: '😐', label: 'Neutral',  color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' },
      negative: { icon: '😡', label: 'Negative', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
    };
    const sc = sentConfig[sentiment] || { icon: '🔍', label: sentiment, color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' };

    const display = reviews.slice(0, CONFIG.THEME_DRILL_LIMIT);

    const cards = display.map(r => {
      const stars   = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
      const quality = checkResponseQuality(r);
      const qualBadge = QUALITY_BADGE[quality] || '';
      const text    = r.text || r.content || '';
      const platLabel = r.platform === 'google_play' ? 'Google Play' : r.platform === 'app_store' ? 'App Store' : 'Windows';

      return `<div class="drill-review-card">
        <div class="drill-review-meta">
          <span class="stars">${stars}</span>
          <span class="badge badge-platform ${r.platform}">${platLabel}</span>
          <span style="font-size:.73rem;color:#94A3B8;margin-left:auto;">${r.date}</span>
        </div>
        <div class="drill-review-text">${text}</div>
        ${r.developer_reply
          ? `<div class="drill-review-reply">
               <div class="drill-reply-label">McAfee reply</div>
               <div class="drill-reply-body">${r.developer_reply}</div>
               <div style="margin-top:5px;">${qualBadge}</div>
             </div>`
          : `<div class="drill-no-reply">⏰ No response from McAfee yet</div>`
        }
      </div>`;
    }).join('');

    const moreCount = reviews.length - display.length;

    panel.innerHTML = `
      <div class="drill-panel-inner" style="border-color:${sc.border};background:${sc.bg};">
        <div class="drill-panel-header">
          <div>
            <span style="font-size:1.4rem;margin-right:8px;">${sc.icon}</span>
            <strong style="color:${sc.color};font-size:1.05rem;">${themeName}</strong>
            <span style="color:#64748B;font-size:1rem;"> — ${sc.label} Reviews</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:.82rem;color:#64748B;">
              ${reviews.length} review${reviews.length !== 1 ? 's' : ''}
              · ${themeName}: ${themeTotal} of ${grandTotal} total (${pct(themeTotal, grandTotal)}%)
            </span>
            <button class="drill-close-btn"
              onclick="document.getElementById('theme-reviews-panel').style.display='none'"
              aria-label="Close review panel">✕</button>
          </div>
        </div>
        <div class="drill-cards-grid">${cards}</div>
        ${moreCount > 0
          ? `<div style="text-align:center;padding:12px;font-size:.82rem;color:#64748B;">
               + ${moreCount} more ${sentiment} ${themeName} reviews. Use the Reviews tab to see all.
             </div>`
          : ''}
      </div>`;
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ─────────────────────────────────────────
     REVIEWS TABLE
  ───────────────────────────────────────── */

  function renderReviews() {
    safeRender('renderReviews', () => {
      const tbody   = el('reviews-tbody');
      const summary = el('results-summary');
      const filtered = filterReviews(state.filteredReviews);
      const total    = filtered.length;

      const startIdx = (state.currentPage - 1) * CONFIG.REVIEWS_PER_PAGE;
      const pageRevs = filtered.slice(startIdx, startIdx + CONFIG.REVIEWS_PER_PAGE);

      if (summary) {
        if (total === 0) summary.textContent = 'No reviews match your filters';
        else {
          const from = startIdx + 1;
          const to   = Math.min(total, startIdx + CONFIG.REVIEWS_PER_PAGE);
          summary.textContent = `Showing ${from}–${to} of ${total.toLocaleString()} reviews`;
        }
      }

      if (!tbody) return;

      if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:3rem;color:#94A3B8;">No reviews match your filters. Try broadening the date range or clearing filters.</td></tr>';
        renderPagination(0);
        return;
      }

      tbody.innerHTML = pageRevs.map(r => {
        const stars     = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
        const sentiment = r.sentiment?.label || 'neutral';
        const themes    = (r.themes || []).map(t => `<span class="badge badge-theme">${t}</span>`).join(' ');
        const quality   = checkResponseQuality(r);
        const qualBadge = QUALITY_BADGE[quality] || '';
        const qualNote  = getQualityExplanation(r, quality);
        const text      = r.text || r.content || '';

        // ── McAfee's Response cell ───────────────────────────────────────────
        let responseCell;
        if (quality === 'NO RESPONSE') {
          const days = Math.floor((Date.now() - new Date(r.date)) / 86400000);
          responseCell = `
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="color:#EF4444;font-size:.82rem;font-weight:600;">⏰ No Response</span>
            </div>
            <div style="color:#EF4444;font-size:.72rem;margin-top:3px;">
              Awaiting reply — ${days} day${days !== 1 ? 's' : ''} elapsed
            </div>`;
        } else {
          // Reply text (truncated with expand)
          const replyId   = 'reply-' + (r.id || Math.random().toString(36).slice(2));
          const replyText = r.developer_reply || '';
          const truncated = replyText.length > 220;
          const preview   = truncated ? replyText.slice(0, 220) + '…' : replyText;

          const replyHtml = truncated
            ? `<span id="${replyId}-short" style="font-size:.83rem;color:#475569;">${preview}
                 <a href="#" style="color:#3B82F6;font-size:.75rem;white-space:nowrap;"
                    onclick="(function(e){e.preventDefault();
                      document.getElementById('${replyId}-short').style.display='none';
                      document.getElementById('${replyId}-full').style.display='block';
                    })(event)">Show more</a>
               </span>
               <span id="${replyId}-full" style="display:none;font-size:.83rem;color:#475569;">${replyText}
                 <a href="#" style="color:#3B82F6;font-size:.75rem;white-space:nowrap;"
                    onclick="(function(e){e.preventDefault();
                      document.getElementById('${replyId}-full').style.display='none';
                      document.getElementById('${replyId}-short').style.display='inline';
                    })(event)">Show less</a>
               </span>`
            : `<span style="font-size:.83rem;color:#475569;">${replyText}</span>`;

          // Issue note (only for non-CORRECT)
          const noteHtml = (quality !== 'CORRECT' && qualNote)
            ? `<div style="margin-top:6px;padding:5px 8px;background:#FEF9EC;border-left:3px solid #F59E0B;
                           border-radius:0 4px 4px 0;font-size:.75rem;color:#92400E;line-height:1.4;">
                 <strong>Issue:</strong> ${qualNote}
               </div>`
            : '';

          responseCell = `
            <div style="max-width:260px;">
              ${replyHtml}
              <div style="margin-top:6px;">${qualBadge}</div>
              ${noteHtml}
            </div>`;
        }

        // ── Suggested Better Reply cell ─────────────────────────────────────
        // Use dynamic personalized reply (Hi [Name] + context-specific content)
        const personalizedReply = buildPersonalizedReply(r, quality);
        let suggested;
        if (quality === 'CORRECT') {
          suggested = `<span style="color:#10B981;font-size:.8rem;font-style:italic;">✅ Response was appropriate — no improvement needed</span>`;
        } else if (personalizedReply) {
          const labelColor  = quality === 'NO RESPONSE' ? '#DC2626' : '#6D28D9';
          const labelText   = quality === 'NO RESPONSE' ? '💡 Suggested Reply' : '💡 Suggested Better Reply';
          suggested = `<div style="max-width:260px;">
            <div style="font-size:.72rem;font-weight:600;color:${labelColor};margin-bottom:5px;
                        text-transform:uppercase;letter-spacing:.04em;">${labelText}</div>
            <div style="font-size:.83rem;color:#166534;background:#F0FDF4;padding:10px 12px;
                        border-radius:6px;border-left:3px solid #10B981;line-height:1.55;">
              ${personalizedReply}
            </div>
          </div>`;
        } else {
          suggested = '<span style="color:#94A3B8;font-size:.8rem;">–</span>';
        }

        return `<tr>
          <td style="white-space:nowrap;">${r.date}</td>
          <td><span class="badge badge-platform ${r.platform}">${
            r.platform === 'google_play' ? 'Google Play' :
            r.platform === 'app_store'   ? 'App Store'   : 'Windows'
          }</span></td>
          <td><span class="stars" aria-label="${r.rating} out of 5 stars">${stars}</span></td>
          <td><span class="badge badge-${sentiment}">${sentiment}</span></td>
          <td><div style="max-width:300px;">${text}</div><div style="margin-top:4px;">${themes}</div></td>
          <td>${responseCell}</td>
          <td>${suggested}</td>
        </tr>`;
      }).join('');

      renderPagination(total);
    });
  }

  function renderPagination(total) {
    const totalPages = Math.ceil(total / CONFIG.REVIEWS_PER_PAGE);
    const pag = el('pagination');
    if (!pag) return;
    if (totalPages <= 1) { pag.innerHTML = ''; return; }

    let html = `<button class="pagination-btn" ${state.currentPage === 1 ? 'disabled' : ''}
      onclick="ReviewDashboard.changePage(${state.currentPage - 1})" aria-label="Previous page">←</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= state.currentPage - 2 && i <= state.currentPage + 2)) {
        html += `<button class="pagination-btn ${i === state.currentPage ? 'active' : ''}"
          onclick="ReviewDashboard.changePage(${i})" aria-label="Page ${i}"
          aria-current="${i === state.currentPage ? 'page' : 'false'}">${i}</button>`;
      } else if (i === state.currentPage - 3 || i === state.currentPage + 3) {
        html += `<span class="pagination-ellipsis" aria-hidden="true">…</span>`;
      }
    }
    html += `<button class="pagination-btn" ${state.currentPage === totalPages ? 'disabled' : ''}
      onclick="ReviewDashboard.changePage(${state.currentPage + 1})" aria-label="Next page">→</button>`;
    pag.innerHTML = html;
  }

  /* ─────────────────────────────────────────
     INSIGHTS TAB
  ───────────────────────────────────────── */

  function computeInsightsStats() {
    const reviews = state.filteredReviews;
    const total   = reviews.length;
    if (!total) return null;

    const avgRating = reviews.reduce((s, r) => s + r.rating, 0) / total;
    const withReply = reviews.filter(r => r.developer_reply && r.developer_reply.trim().length > 0);
    const noReply   = reviews.filter(r => !r.developer_reply || !r.developer_reply.trim().length);
    const responseRate = pct(withReply.length, total);

    const unansDates   = noReply.map(r => new Date(r.date)).sort((a, b) => a - b);
    const oldestDaysAgo = unansDates.length > 0
      ? Math.floor((Date.now() - unansDates[0]) / 86400000) : 0;

    const genericCount = withReply.filter(r => checkResponseQuality(r) === 'GENERIC TEMPLATE').length;
    const genericPct   = pct(genericCount, withReply.length);

    const vpnRevs    = reviews.filter(r => (r.themes || []).some(t => t.toLowerCase().includes('vpn')));
    const vpnNeg     = vpnRevs.filter(r => (r.sentiment?.label || '') === 'negative');
    const vpnNegPct  = pct(vpnNeg.length, vpnRevs.length);
    const vpnAvgRating = vpnRevs.length > 0 ? vpnRevs.reduce((s, r) => s + r.rating, 0) / vpnRevs.length : 0;

    const secRevs    = reviews.filter(r => (r.themes || []).some(t => t.toLowerCase().includes('security')));
    const secPos     = secRevs.filter(r => (r.sentiment?.label || '') === 'positive');
    const secPosPct  = pct(secPos.length, secRevs.length);

    const perfRevs   = reviews.filter(r => (r.themes || []).some(t =>
      ['performance','battery','speed'].some(kw => t.toLowerCase().includes(kw))));
    const perfNeg    = perfRevs.filter(r => (r.sentiment?.label || '') === 'negative');
    const perfNegPct = pct(perfNeg.length, perfRevs.length);

    const qualBreakdown = { CORRECT: 0, 'NO RESPONSE': 0, 'GENERIC TEMPLATE': 0,
      'NO SOLUTION': 0, 'HIGH RATING + APOLOGY': 0, 'LOW RATING + NO EMPATHY': 0, 'WRONG ISSUE': 0,
      'UNWARRANTED APOLOGY': 0 };
    reviews.forEach(r => { const q = checkResponseQuality(r); if (q in qualBreakdown) qualBreakdown[q]++; });
    const correctPct = pct(qualBreakdown.CORRECT, total);

    let health = 100;
    health -= Math.max(0, (4.0 - avgRating) * 14);
    health -= Math.max(0, (85 - responseRate) * 0.25);
    if (vpnNegPct  > 40) health -= 10;
    if (genericPct > 40) health -= 8;
    if (perfNegPct > 50) health -= 7;
    health = Math.max(0, Math.min(100, Math.round(health)));

    return {
      total, avgRating, responseRate, noReplyCount: noReply.length, withReplyCount: withReply.length,
      oldestDaysAgo, genericCount, genericPct,
      vpnTotal: vpnRevs.length, vpnNegPct, vpnAvgRating,
      secPosPct, secRevs: secRevs.length,
      perfNegPct, perfRevs: perfRevs.length,
      qualBreakdown, correctPct, health,
    };
  }

  function renderInsightsContent() {
    safeRender('renderInsightsContent', () => {
      const s = computeInsightsStats();
      if (!s) {
        ['insights-header','insights-highlights','insights-vpn-crisis','insights-support','insights-health']
          .forEach(id => { const d = el(id); if (d) d.innerHTML = '<div style="padding:20px;color:#94A3B8;text-align:center;">No data for selected period</div>'; });
        return;
      }
      const healthColor = s.health >= 80 ? '#10B981' : s.health >= 60 ? '#F59E0B' : '#EF4444';

      const hdr = el('insights-header');
      if (hdr) hdr.innerHTML = `
        <div style="background:linear-gradient(135deg,#1E3A5F 0%,#2D5A87 100%);color:white;padding:24px;border-radius:12px;margin-bottom:24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <div>
              <h2 style="margin:0;font-size:1.5rem;">📊 Executive Insights</h2>
              <p style="margin:4px 0 0;opacity:.85;font-size:.9rem;">AI-powered review intelligence · ${s.total.toLocaleString()} reviews in view</p>
            </div>
            <div style="text-align:right;">
              <div style="font-size:2.8rem;font-weight:800;color:${healthColor};">${s.health}</div>
              <div style="font-size:.82rem;opacity:.85;">Health Score / 100</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
            <div style="background:rgba(255,255,255,.15);padding:12px;border-radius:8px;text-align:center;">
              <div style="font-size:1.5rem;font-weight:700;">${fmt(s.avgRating,2)}★</div>
              <div style="font-size:.72rem;opacity:.8;">Avg Rating</div>
            </div>
            <div style="background:rgba(255,255,255,.15);padding:12px;border-radius:8px;text-align:center;">
              <div style="font-size:1.5rem;font-weight:700;color:${s.responseRate>=85?'#6EE7B7':s.responseRate>=70?'#FCD34D':'#FCA5A5'};">${fmt(s.responseRate,1)}%</div>
              <div style="font-size:.72rem;opacity:.8;">Response Rate</div>
            </div>
            <div style="background:rgba(255,255,255,.15);padding:12px;border-radius:8px;text-align:center;">
              <div style="font-size:1.5rem;font-weight:700;color:${s.vpnNegPct>40?'#FCA5A5':'#6EE7B7'};">${fmt(s.vpnNegPct,1)}%</div>
              <div style="font-size:.72rem;opacity:.8;">VPN Negative</div>
            </div>
            <div style="background:rgba(255,255,255,.15);padding:12px;border-radius:8px;text-align:center;">
              <div style="font-size:1.5rem;font-weight:700;">${s.total.toLocaleString()}</div>
              <div style="font-size:.72rem;opacity:.8;">Total Reviews</div>
            </div>
          </div>
        </div>`;

      const hl = el('insights-highlights');
      if (hl) hl.innerHTML = `
        <div style="background:#F0FDF4;border:2px solid #10B981;border-radius:12px;padding:20px;margin-bottom:24px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <span style="font-size:1.8rem;">💡</span>
            <div><h3 style="margin:0;color:#166534;">Key Highlights</h3></div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
            <div style="background:white;padding:16px;border-radius:8px;border-left:4px solid #10B981;">
              <div style="font-size:1.4rem;font-weight:800;color:#10B981;">${fmt(s.secPosPct,1)}%</div>
              <div style="font-size:.82rem;color:#64748B;margin-bottom:4px;">Security Features Positive</div>
              <div style="font-size:.72rem;color:#166534;">🟢 Core product strength</div>
            </div>
            <div style="background:white;padding:16px;border-radius:8px;border-left:4px solid #F59E0B;">
              <div style="font-size:1.4rem;font-weight:800;color:#F59E0B;">${s.noReplyCount}</div>
              <div style="font-size:.82rem;color:#64748B;margin-bottom:4px;">Reviews Without Response</div>
              <div style="font-size:.72rem;color:#92400E;">⚠️ Oldest unanswered: ${s.oldestDaysAgo} day${s.oldestDaysAgo !== 1 ? 's' : ''} ago</div>
            </div>
            <div style="background:white;padding:16px;border-radius:8px;border-left:4px solid #EF4444;">
              <div style="font-size:1.4rem;font-weight:800;color:#EF4444;">${fmt(s.genericPct,1)}%</div>
              <div style="font-size:.82rem;color:#64748B;margin-bottom:4px;">Generic "Contact Support"</div>
              <div style="font-size:.72rem;color:#991B1B;">🔴 No actionable steps</div>
            </div>
          </div>
        </div>`;

      const vpnEl = el('insights-vpn-crisis');
      const vpnSev = s.vpnNegPct > 50 ? 'CRITICAL' : s.vpnNegPct > 35 ? 'WARNING' : 'WATCH';
      const vpnBorder = s.vpnNegPct > 50 ? '#EF4444' : s.vpnNegPct > 35 ? '#F59E0B' : '#3B82F6';
      const vpnBg     = s.vpnNegPct > 50 ? '#FEF2F2' : s.vpnNegPct > 35 ? '#FFFBEB' : '#EFF6FF';
      if (vpnEl) vpnEl.innerHTML = `
        <div style="background:${vpnBg};border:2px solid ${vpnBorder};border-radius:12px;padding:20px;margin-bottom:24px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <span style="font-size:1.8rem;">${s.vpnNegPct>50?'🚨':s.vpnNegPct>35?'⚠️':'ℹ️'}</span>
            <h3 style="margin:0;color:${vpnBorder};">${vpnSev}: VPN Customer Sentiment</h3>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
            <div style="background:white;padding:14px;border-radius:8px;text-align:center;border-left:4px solid ${vpnBorder};">
              <div style="font-size:1.6rem;font-weight:800;color:${vpnBorder};">${fmt(s.vpnNegPct,1)}%</div>
              <div style="font-size:.78rem;color:#64748B;">Negative Sentiment</div>
            </div>
            <div style="background:white;padding:14px;border-radius:8px;text-align:center;border-left:4px solid ${vpnBorder};">
              <div style="font-size:1.6rem;font-weight:800;color:#F59E0B;">${s.vpnTotal}</div>
              <div style="font-size:.78rem;color:#64748B;">VPN Reviews</div>
            </div>
            <div style="background:white;padding:14px;border-radius:8px;text-align:center;border-left:4px solid ${vpnBorder};">
              <div style="font-size:1.6rem;font-weight:800;color:${s.vpnAvgRating<3?'#EF4444':'#F59E0B'};">${fmt(s.vpnAvgRating,1)}★</div>
              <div style="font-size:.78rem;color:#64748B;">VPN Avg Rating</div>
            </div>
            <div style="background:white;padding:14px;border-radius:8px;text-align:center;border-left:4px solid ${vpnBorder};">
              <div style="font-size:1.6rem;font-weight:800;color:#64748B;">${fmt(s.perfNegPct,1)}%</div>
              <div style="font-size:.78rem;color:#64748B;">Performance Negative</div>
            </div>
          </div>
        </div>`;

      const sup = el('insights-support');
      if (sup) {
        const qb = s.qualBreakdown;
        const rows = [
          ['✅ Correct Response',         qb['CORRECT'],                   '#10B981'],
          ['⏰ No Response',              qb['NO RESPONSE'],               '#EF4444'],
          ['🟡 Generic Template',         qb['GENERIC TEMPLATE'],          '#F59E0B'],
          ['🟡 No Solution Provided',     qb['NO SOLUTION'],               '#F59E0B'],
          ['🔴 Wrong Issue Addressed',    qb['WRONG ISSUE'],               '#DC2626'],
          ['🔵 Apology on High Rating',   qb['HIGH RATING + APOLOGY'],     '#3B82F6'],
          ['🔴 Low Rating + No Empathy',  qb['LOW RATING + NO EMPATHY'],   '#DC2626'],
          ['🟠 Unwarranted Apology',      qb['UNWARRANTED APOLOGY'],       '#F97316'],
        ].map(([label, count, color]) => {
          const p = pct(count, s.total);
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #F1F5F9;">
            <span style="width:200px;font-size:.83rem;">${label}</span>
            <div style="flex:1;background:#F1F5F9;border-radius:4px;height:10px;">
              <div style="width:${p}%;background:${color};height:100%;border-radius:4px;"></div>
            </div>
            <span style="width:50px;text-align:right;font-size:.82rem;font-weight:600;color:${color};">${count}</span>
            <span style="width:45px;text-align:right;font-size:.78rem;color:#94A3B8;">${p}%</span>
          </div>`;
        }).join('');

        sup.innerHTML = `
          <div style="background:white;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin-bottom:24px;">
            <h3 style="margin:0 0 4px;color:#1E293B;">👥 Support Team Performance Analysis</h3>
            <p style="margin:0 0 16px;font-size:.83rem;color:#64748B;">How the team is responding — and where it falls short</p>
            ${rows}
            <div style="margin-top:16px;padding:12px;background:${s.correctPct>=60?'#F0FDF4':'#FEF2F2'};border-radius:8px;border-left:4px solid ${s.correctPct>=60?'#10B981':'#EF4444'};">
              <strong>Quality Score: ${fmt(s.correctPct,1)}% correct responses</strong>
              ${s.correctPct < 60 ? ' — below target. Training & new templates urgently needed.' :
                s.correctPct < 75 ? ' — approaching target. Reduce generic and no-solution responses.' :
                ' — above target. Maintain and close remaining gaps.'}
            </div>
          </div>`;
      }

      const hlth = el('insights-health');
      if (hlth) {
        const dims = [
          { label: 'Avg Rating',       score: Math.round((s.avgRating/5)*100), color: s.avgRating>=4?'#10B981':'#F59E0B' },
          { label: 'Response Rate',    score: Math.round(s.responseRate),       color: s.responseRate>=85?'#10B981':'#F59E0B' },
          { label: 'Reply Quality',    score: Math.round(s.correctPct),         color: s.correctPct>=60?'#10B981':'#EF4444' },
          { label: 'VPN Sentiment',    score: Math.max(0,Math.round(100-s.vpnNegPct)), color: s.vpnNegPct<=30?'#10B981':s.vpnNegPct<=50?'#F59E0B':'#EF4444' },
          { label: 'Security Strength',score: Math.round(s.secPosPct),          color: s.secPosPct>=70?'#10B981':'#F59E0B' },
        ];
        hlth.innerHTML = `
          <div style="background:white;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin-bottom:24px;">
            <h3 style="margin:0 0 16px;color:#1E293B;">📊 Health Score Breakdown</h3>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px;">
              ${dims.map(d=>`<div style="text-align:center;padding:16px;background:#F8FAFC;border-radius:8px;">
                <div style="font-size:1.9rem;font-weight:800;color:${d.color};">${d.score}</div>
                <div style="font-size:.78rem;color:#64748B;margin-top:4px;">${d.label}</div>
                <div style="font-size:.68rem;color:#94A3B8;">/100</div>
              </div>`).join('')}
            </div>
            <div style="margin-top:16px;padding:14px;background:#F0F9FF;border-radius:8px;border-left:4px solid #0EA5E9;">
              <strong>Overall Health: ${s.health}/100 ${s.health>=80?'🟢 Good':s.health>=60?'🟡 Needs Attention':'🔴 Critical'}</strong>
              — ${s.health>=80?'Dashboard performing well.':s.health>=60?'Several areas need improvement.':'Critical issues detected. Immediate action required.'}
            </div>
          </div>`;
      }
    });
  }

  function renderAnalysisCharts() {
    safeRender('renderAnalysisCharts', () => {
      purgeCharts(['analysis-theme-chart','analysis-response-chart','analysis-trends-chart']);
      const reviews = state.filteredReviews;
      if (!reviews.length) return;

      safeRender('analysis-theme-chart', () => {
        const themeMap = {};
        reviews.forEach(r => {
          (r.themes || []).forEach(t => {
            if (!themeMap[t]) themeMap[t] = { positive: 0, negative: 0, neutral: 0, total: 0 };
            themeMap[t][r.sentiment?.label || 'neutral']++;
            themeMap[t].total++;
          });
        });
        const sorted = Object.entries(themeMap).sort((a,b) => b[1].total - a[1].total).slice(0,8);
        if (!sorted.length) { showChartError('analysis-theme-chart','No theme data'); return; }

        const callout = el('analysis-theme-callout');
        if (callout && sorted.length) {
          // Themes already spotlighted in dedicated sections (VPN Crisis, Security Highlights)
          // — skip them here so the callout surfaces something actionable and non-repetitive.
          const alreadyCovered = ['vpn', 'security'];
          const novel = sorted.filter(([t]) => !alreadyCovered.some(kw => t.toLowerCase().includes(kw)));
          const pool  = novel.length >= 2 ? novel : sorted; // fall back to all if too few remain

          // Theme with highest positive ratio (min 5 reviews to be statistically meaningful)
          const strongest = pool.reduce((best,[t,d]) => {
            if (d.total < 5) return best;
            const p = d.positive / d.total;
            return p > (best.p || 0) ? { t, p, total: d.total } : best;
          }, {});
          // Theme with highest negative ratio (min 5 reviews)
          const weakest = pool.reduce((worst,[t,d]) => {
            if (d.total < 5) return worst;
            const n = d.negative / d.total;
            return n > (worst.n || 0) ? { t, n, total: d.total } : worst;
          }, {});

          const parts = [];
          if (strongest.t) parts.push(`
            <div style="padding:8px 12px;background:#F0FDF4;border-radius:6px;border-left:3px solid #10B981;font-size:.8rem;margin-bottom:6px;">
              <strong style="color:#166534;">🟢 Hidden Strength:</strong>
              <span style="color:#166534;">${strongest.t} — ${fmt(strongest.p*100,1)}% positive (${strongest.total} reviews)</span>
            </div>`);
          if (weakest.t && weakest.t !== strongest.t) parts.push(`
            <div style="padding:8px 12px;background:#FEF2F2;border-radius:6px;border-left:3px solid #EF4444;font-size:.8rem;">
              <strong style="color:#991B1B;">🔴 Watch Area:</strong>
              <span style="color:#991B1B;">${weakest.t} — ${fmt(weakest.n*100,1)}% negative (${weakest.total} reviews)</span>
            </div>`);
          callout.innerHTML = parts.join('') || '';
        }

        Plotly.newPlot('analysis-theme-chart', [
          { y: sorted.map(([t])=>t), x: sorted.map(([,d])=>d.total>0?parseFloat((d.positive/d.total*100).toFixed(1)):0),
            name:'Positive %', type:'bar', orientation:'h', marker:{color:COLORS.positive} },
          { y: sorted.map(([t])=>t), x: sorted.map(([,d])=>d.total>0?parseFloat((d.negative/d.total*100).toFixed(1)):0),
            name:'Negative %', type:'bar', orientation:'h', marker:{color:COLORS.negative} },
        ], baseLayout({
          barmode:'group', height:CONFIG.ANALYSIS_CHART_HEIGHT,
          margin:{t:20,r:20,b:50,l:140},
          legend:{orientation:'h',y:-0.2},
          xaxis:{title:'Sentiment %',range:[0,100]},
        }), PLOTLY_CFG);
      });

      safeRender('analysis-response-chart', () => {
        const ql=['Correct','No Response','Generic','No Solution','No Empathy','Wrong Issue','Apology/Hi★','Unwarranted Apology'];
        const qc=[0,0,0,0,0,0,0,0];
        const qm={'CORRECT':0,'NO RESPONSE':1,'GENERIC TEMPLATE':2,'NO SOLUTION':3,'LOW RATING + NO EMPATHY':4,'WRONG ISSUE':5,'HIGH RATING + APOLOGY':6,'UNWARRANTED APOLOGY':7};
        reviews.forEach(r => { const q=checkResponseQuality(r); if(q in qm) qc[qm[q]]++; });

        const callout = el('analysis-response-callout');
        if (callout) {
          const noReplyPct    = pct(qc[1], reviews.length);
          const poorReplyPct  = pct(qc[2]+qc[3], reviews.length);
          const unwantedApologyPct = pct(qc[7], reviews.length);
          const totalProblematicPct = pct(qc[1]+qc[2]+qc[3]+qc[7], reviews.length);
          callout.innerHTML = `<div style="padding:8px 12px;background:#FEF3C7;border-radius:6px;border-left:3px solid #F59E0B;font-size:.8rem;">
            <strong>⚠️ Finding:</strong> ${noReplyPct}% of reviews received <em>no reply at all</em>; a further ${poorReplyPct}% received a generic template or no actionable solution; ${unwantedApologyPct}% received an <em>unwarranted apology</em> (apologizing on neutral/positive reviews) — <strong>${totalProblematicPct}% total</strong> need improvement. See Support Team Analysis below for the full breakdown.
          </div>`;
        }

        Plotly.newPlot('analysis-response-chart', [{
          values: qc, labels: ql, type:'pie', hole:0.45,
          marker:{colors:[COLORS.positive,COLORS.negative,COLORS.neutral,'#FBBF24','#DC2626','#B91C1C',COLORS.info,'#F97316']},
          textinfo:'label+percent', textposition:'outside', insidetextorientation:'horizontal',
        }], baseLayout({
          height:CONFIG.ANALYSIS_CHART_HEIGHT, margin:{t:10,r:10,b:40,l:10}, showlegend:false,
          annotations:[{text:`<b>${reviews.length}</b><br>reviews`,showarrow:false,font:{size:13}}],
        }), PLOTLY_CFG);
      });

      safeRender('analysis-trends-chart', () => {
        const monthly = {};
        reviews.forEach(r => {
          const m=r.date.slice(0,7);
          if (!monthly[m]) monthly[m]={ratings:[],positive:0,negative:0,total:0,withReply:0};
          monthly[m].ratings.push(r.rating); monthly[m].total++;
          const l=r.sentiment?.label||'neutral';
          if(l==='positive') monthly[m].positive++; if(l==='negative') monthly[m].negative++;
          if(r.developer_reply&&r.developer_reply.trim()) monthly[m].withReply++;
        });
        const months=Object.keys(monthly).sort();
        if(months.length<2){showChartError('analysis-trends-chart','Need at least 2 months of data');return;}

        Plotly.newPlot('analysis-trends-chart',[
          {x:months,y:months.map(m=>monthly[m].ratings.reduce((a,b)=>a+b,0)/monthly[m].ratings.length),
           name:'Avg Rating',type:'scatter',mode:'lines+markers',
           line:{color:COLORS.neutral,width:2.5},yaxis:'y',marker:{size:6}},
          {x:months,y:months.map(m=>pct(monthly[m].positive,monthly[m].total)),
           name:'Positive %',type:'scatter',mode:'lines+markers',
           line:{color:COLORS.positive,width:2},yaxis:'y2',marker:{size:5}},
          {x:months,y:months.map(m=>pct(monthly[m].negative,monthly[m].total)),
           name:'Negative %',type:'scatter',mode:'lines+markers',
           line:{color:COLORS.negative,width:2,dash:'dot'},yaxis:'y2',marker:{size:5}},
          {x:months,y:months.map(m=>pct(monthly[m].withReply,monthly[m].total)),
           name:'Response Rate %',type:'scatter',mode:'lines+markers',
           line:{color:COLORS.info,width:2,dash:'dash'},yaxis:'y2',marker:{size:5}},
          {x:months,y:months.map(m=>monthly[m].total),name:'Volume',type:'bar',
           marker:{color:'rgba(100,116,139,0.2)'},yaxis:'y3'},
        ],baseLayout({
          height:CONFIG.ANALYSIS_CHART_HEIGHT,margin:{t:30,r:70,b:50,l:50},
          xaxis:{title:'Month',tickangle:-20,gridcolor:'#F1F5F9'},
          yaxis:{title:'Avg Rating',range:[1,5],side:'left',dtick:1,titlefont:{color:COLORS.neutral}},
          yaxis2:{title:'Percentage',range:[0,100],overlaying:'y',side:'right',titlefont:{color:COLORS.info}},
          yaxis3:{title:'Volume',overlaying:'y',side:'right',position:0.97,showgrid:false,titlefont:{color:'#94A3B8'}},
          legend:{orientation:'h',y:-0.3,x:0.5,xanchor:'center'},
        }),PLOTLY_CFG);
      });

      state.analysisTabDirty = false;
    });
  }

  /* ─────────────────────────────────────────
     DATE FILTERING
  ───────────────────────────────────────── */

  function applyDateFilter(range, labelOverride) {
    if (!state.data) return;

    const LABELS = { 7:'Last 1 Week', 15:'Last 15 Days', 30:'Last 1 Month', 90:'Last 3 Months', 365:'Last 1 Year' };

    if (range === 'all') {
      state.filteredStats   = state.data.daily_stats.slice();
      state.filteredReviews = state.data.recent_reviews.slice();
      state.activePeriodLabel = 'All Time';
    } else {
      const days   = parseInt(range, 10);
      const cutoff = new Date(Date.now() - days * 86400000);
      state.filteredStats   = state.data.daily_stats.filter(d => new Date(d.date) >= cutoff);
      state.filteredReviews = state.data.recent_reviews.filter(r => new Date(r.date) >= cutoff);
      state.activePeriodLabel = LABELS[days] || labelOverride || ('Last ' + days + ' days');
    }

    state.currentPage = 1;
    state.analysisTabDirty = true;

    updateMeta();
    updateFilterSummary();
    renderKPIs();
    renderOverviewCharts();
    renderReviews();
    if (state.activeTab === 'analysis') { renderInsightsContent(); renderAnalysisCharts(); }
  }

  function updateMeta() {
    const metaEl = el('total-reviews-meta');
    if (metaEl) metaEl.textContent = state.filteredReviews.length.toLocaleString() + ' reviews (' + state.activePeriodLabel + ')';
  }

  /* ─────────────────────────────────────────
     EVENT HANDLERS
  ───────────────────────────────────────── */

  // IDs of charts that live in the overview tab (need resize after tab switch)
  const OVERVIEW_CHART_IDS = [
    'chart-combined-sentiment-volume',
    'chart-rating-trend',
    'chart-platform-breakdown',
    'chart-sentiment-dist',
    'chart-rating-dist',
    'chart-themes',
    // 8 theme donuts — derived from THEME_DONUTS for maintainability
    ...THEME_DONUTS.map(td => td.containerId),
  ];

  /**
   * Plotly renders into containers that may have been display:none at render time,
   * or were hidden by a tab switch.  After making a tab visible we must tell
   * Plotly to re-measure every affected container; two rAF calls ensure the
   * browser has actually painted the new layout before we query dimensions.
   */
  function resizePlotlyCharts(ids) {
    if (typeof Plotly === 'undefined') return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ids.forEach(id => {
          const e = document.getElementById(id);
          // e.data is set by Plotly after a successful newPlot – skip empty/error containers
          if (e && e.data) {
            try { Plotly.Plots.resize(e); } catch (_) {}
          }
        });
      });
    });
  }

  function initTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', function () {
        const tabName = this.dataset.tab;
        document.querySelectorAll('.nav-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        this.classList.add('active');
        this.setAttribute('aria-selected','true');
        const panel = el('tab-' + tabName);
        if (panel) panel.classList.add('active');
        state.activeTab = tabName;

        if (tabName === 'overview') {
          // Resize all overview charts so they fill their containers properly
          resizePlotlyCharts(OVERVIEW_CHART_IDS);
        }

        if (tabName === 'analysis') {
          if (state.analysisTabDirty) {
            setTimeout(() => { renderInsightsContent(); renderAnalysisCharts(); }, 80);
          } else {
            // Already rendered – just fix sizing
            resizePlotlyCharts(['analysis-theme-chart','analysis-response-chart','analysis-trends-chart']);
          }
        }

        // Hide drill-down panel when switching tabs
        const drillPanel = el('theme-reviews-panel');
        if (drillPanel) drillPanel.style.display = 'none';
      });
    });
  }

  function initDateFilters() {
    document.querySelectorAll('.date-preset-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.date-preset-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        applyDateFilter(this.dataset.range);
      });
    });

    const applyBtn = el('date-apply');
    const clearBtn = el('date-clear');

    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const start = el('date-start').value;
        const end   = el('date-end').value;
        if (!start || !end) { alert('Please select both start and end dates'); return; }
        if (new Date(start) > new Date(end)) { alert('Start date must be before end date'); return; }

        document.querySelectorAll('.date-preset-btn').forEach(b => b.classList.remove('active'));

        state.filteredStats   = state.data.daily_stats.filter(d => d.date >= start && d.date <= end);
        state.filteredReviews = state.data.recent_reviews.filter(r => r.date >= start && r.date <= end);
        state.activePeriodLabel = start + ' → ' + end;
        state.currentPage = 1;
        state.analysisTabDirty = true;

        updateMeta();
        updateFilterSummary();
        renderKPIs();
        renderOverviewCharts();
        renderReviews();
        if (state.activeTab === 'analysis') { renderInsightsContent(); renderAnalysisCharts(); }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (el('date-start')) el('date-start').value = '';
        if (el('date-end'))   el('date-end').value   = '';
        document.querySelectorAll('.date-preset-btn').forEach(b => b.classList.toggle('active', b.dataset.range === '30'));
        applyDateFilter('30');
      });
    }
  }

  function initReviewFilters() {
    ['platform','rating','sentiment','notable'].forEach(name => {
      const e = el('filter-' + name);
      if (e) e.addEventListener('change', applyReviewFilters);
    });
    const searchEl = el('filter-search');
    if (searchEl) searchEl.addEventListener('input', debounce(applyReviewFilters, CONFIG.DEBOUNCE_DELAY));
  }

  function applyReviewFilters() {
    state.filters.platform  = el('filter-platform')?.value  || 'all';
    state.filters.rating    = el('filter-rating')?.value    || 'all';
    state.filters.sentiment = el('filter-sentiment')?.value || 'all';
    state.filters.notable   = el('filter-notable')?.value   || 'all';
    state.filters.search    = el('filter-search')?.value?.toLowerCase().trim() || '';
    state.currentPage = 1;
    renderReviews();
  }

  function initExportButtons() {
    const csvBtn   = el('export-csv-btn');
    const printBtn = el('export-print-btn');
    if (csvBtn)   csvBtn.addEventListener('click', exportToCSV);
    if (printBtn) printBtn.addEventListener('click', () => window.print());
  }

  function exportToCSV() {
    if (!state.filteredReviews.length) { alert('No reviews to export'); return; }
    const filtered = filterReviews(state.filteredReviews);
    const headers = ['Date','Platform','Rating','Sentiment','Themes','Review Text','McAfee Response','Response Quality','Suggested Reply'];
    const rows = filtered.map(r => {
      const q = checkResponseQuality(r);
      const esc = s => `"${(s || '').replace(/"/g,'""')}"`;
      return [r.date, r.platform, r.rating, r.sentiment?.label||'neutral',
              esc((r.themes||[]).join('; ')), esc(r.text||r.content||''),
              esc(r.developer_reply||''), esc(q), esc(r.suggested_reply||'')].join(',');
    });
    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'mcafee_reviews_' + new Date().toISOString().slice(0,10) + '.csv';
    link.style.display = 'none';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  /* ─────────────────────────────────────────
     INIT
  ───────────────────────────────────────── */

  async function init() {
    console.log('[Dashboard] Initializing v2.3…');
    showLoadingState();
    try {
      const resp = await fetch(CONFIG.DATA_PATH);
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' – ' + resp.statusText);
      state.data = await resp.json();

      const validation = validateData(state.data);
      if (!validation.valid) { showErrorState('Data validation failed', validation.errors.join('\n')); return; }
      console.log('[Dashboard] Loaded', state.data.recent_reviews.length, 'reviews');

      // Default: Last 30 days
      const cutoff = new Date(Date.now() - 30 * 86400000);
      state.filteredStats   = state.data.daily_stats.filter(d => new Date(d.date) >= cutoff);
      state.filteredReviews = state.data.recent_reviews.filter(r => new Date(r.date) >= cutoff);
      state.activePeriodLabel = 'Last 1 Month';

      updateMeta();
      updateFilterSummary();

      const lu = el('last-updated');
      if (lu && state.data.metadata?.generated_at) {
        lu.textContent = 'Updated: ' + new Date(state.data.metadata.generated_at).toLocaleDateString();
      }

      initTabs();
      initDateFilters();
      initReviewFilters();
      initExportButtons();

      renderKPIs();
      renderOverviewCharts();
      renderReviews();

      hideLoadingState();
      console.log('[Dashboard] Ready');
    } catch (err) {
      console.error('[Dashboard] Init failed:', err);
      showErrorState('Failed to load dashboard data', err.message);
    }
  }

  /* ─────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────── */
  return {
    init,
    changePage: function (page) {
      state.currentPage = page;
      renderReviews();
      const wrap = el('reviews-tbody')?.closest('.reviews-table-wrap');
      if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  };

})();

document.addEventListener('DOMContentLoaded', ReviewDashboard.init);
