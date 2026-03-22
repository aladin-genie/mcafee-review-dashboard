/**
 * ============================================================================
 * ORIGINAL DASHBOARD.JS FUNCTIONS (for reference/comparison)
 * ============================================================================
 * 
 * These are the original functions from dashboard.js (lines 200-500)
 * that were analyzed as part of Experiment 007.
 * 
 * Key issues identified:
 * 1. _COMPLAINT_RE regex catches neutral words like "started"
 * 2. rating <= 3 treated as complaint regardless of actual content
 * 3. No distinction between neutral statements and actual complaints
 * 4. Generic replies that just redirect to support
 * ============================================================================
 */

// Original THEME_REPLY_KEYWORDS (unchanged)
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

// Original _themesCoveredInReply (unchanged)
function _themesCoveredInReply(themes, rl) {
  if (!themes || themes.length === 0) return true;
  return themes.some(function(theme) {
    const tl  = theme.toLowerCase();
    const kws = THEME_REPLY_KEYWORDS[tl] || [tl];
    return kws.some(function(kw) { return rl.indexOf(kw) !== -1; });
  });
}

// ORIGINAL checkResponseQuality - PROBLEMATIC
function checkResponseQuality_ORIGINAL(review) {
  const key = review.id;
  if (key && state.qualityCache.has(key)) return state.qualityCache.get(key);

  function cache(val) { if (key) state.qualityCache.set(key, val); return val; }

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
  // PROBLEM: This regex catches words like "started" from "just started using"
  // which is NOT a complaint - it's a neutral usage statement!
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

  // 1. Apologising when review is PURELY positive — no complaints at all.
  // PROBLEM: This doesn't catch neutral statements that aren't complaints!
  if (rating >= 4 && apologizes && !reviewHasComplaint)
    return cache('HIGH RATING + APOLOGY');

  // 2. Upset 1-2★ customer received zero empathetic acknowledgment
  if (rating <= 2 && !hasEmpathy)
    return cache('LOW RATING + NO EMPATHY');

  // 3. Copy-paste boilerplate that doesn't engage with actual content
  if (isBoilerplate || isGenericPositive)
    return cache('GENERIC TEMPLATE');

  // 4. PROBLEM: Negative/neutral review: reply completely misses the topic raised
  // This flags neutral 3★ reviews as "WRONG ISSUE" even when there's no complaint!
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

// ORIGINAL buildPersonalizedReply - GENERIC
// PROBLEM: Replies often just redirect to support instead of being helpful
function buildPersonalizedReply_ORIGINAL(review, quality) {
  if (quality === 'CORRECT') return null;

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

  // ── Theme-specific concrete action ──────────────────────────────────────
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
    // PROBLEM: Generic fallback - just redirects to support
    return 'Please reach out at mcafee.com/support or call 1-866-622-3911 — our specialists will stay with you until it is fully resolved.';
  }

  // ── Reply templates per quality type ──────────────────────────────────
  // PROBLEM: Templates don't distinguish between neutral statements and complaints

  if (quality === 'NO RESPONSE') {
    // Same template for all ratings - doesn't account for neutral statements
    if (rating >= 4) {
      var ref4 = themes.length > 0
        ? themes[0].replace(/\b\w/g, function(c){ return c.toUpperCase(); })
        : 'McAfee';
      return hi + 'Thank you so much for the kind words — it genuinely motivates our entire team! '
        + 'Knowing ' + ref4 + ' is delivering for you is exactly why we do this work every day. '
        + 'If anything ever comes up, just reach out — we are always here for you. \uD83D\uDEE1\uFE0F';
    }
    // PROBLEM: Same apology for all 1-3★ reviews, even neutral ones!
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
    // PROBLEM: Same template for neutral statements and complaints
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

  return review.suggested_reply || null;
}

// Helper function from original (for reference)
const _NON_NAME_WORDS = new Set(['hi','hey','me','user','anon','anonymous','unknown','test','n/a','na','none']);

function _getFirstName(author) {
  if (!author || !author.trim()) return null;
  var cleaned = author.replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s*/i, '').trim();
  var parts   = cleaned.split(/\s+/);
  var first   = parts[0] || '';
  if (/^[A-Za-z]\.$/.test(first) && parts[1]) first = parts[1];
  if (first.length > 1 && (first === first.toUpperCase() || first === first.toLowerCase()))
    first = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  if (/[^a-zA-Z'\-.]/g.test(first)) return null;
  if (_NON_NAME_WORDS.has(first.toLowerCase())) return null;
  if (first.length < 2) return null;
  return first || null;
}
