/**
 * ============================================================================
 * EXPERIMENT 007: Response Quality Classifier & Reply Generator Improvements
 * ============================================================================
 * 
 * HYPOTHESIS: The current classifier has false positives because it:
 * 1. Treats all 1-3 star reviews as complaints
 * 2. Has overly broad complaint regex that catches neutral words like "started"
 * 3. Doesn't distinguish between neutral usage statements and actual issues
 * 4. Generates generic "contact support" replies instead of helpful responses
 * 
 * CHANGES:
 * 1. New intent-based classification: COMPLAINT vs FEEDBACK vs NEUTRAL_STATEMENT
 * 2. Sentiment-aware complaint detection (not just keyword matching)
 * 3. Rating-appropriate reply templates that don't apologize for neutral reviews
 * 4. Specific actionable help instead of generic redirects
 * 5. Better wrong-issue detection using semantic similarity
 * ============================================================================
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS & CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Words that indicate ACTUAL complaints vs neutral statements
const COMPLAINT_INDICATORS = {
  // Strong complaint words (high confidence user is upset)
  strong: [
    'terrible', 'awful', 'horrible', 'worst', 'hate', 'garbage', 'trash', 
    'scam', 'fraud', 'rip off', 'rip-off', 'useless', 'worthless', 'crap',
    'disgusting', 'unacceptable', 'ridiculous', 'pathetic'
  ],
  // Moderate complaint words (user has an issue)
  moderate: [
    'problem', 'issue', 'bug', 'error', 'crash', 'broken', 'not working',
    'doesn\'t work', 'won\'t work', 'can\'t', 'unable', 'failed', 'failure',
    'disappointing', 'disappointed', 'frustrating', 'frustrated', 'annoying',
    'confusing', 'confused', 'difficult', 'hard to', 'slow', 'lag', 'freeze',
    'stuck', 'frozen', 'keeps', 'constantly', 'always', 'never'
  ],
  // False positive triggers (neutral context, not complaints)
  falsePositiveTriggers: [
    'just started', 'recently started', 'new to', 'first time',
    'giving it a try', 'trying out', 'checking out', 'seeing how',
    'so far', 'for now', 'at the moment'
  ]
};

// Theme keywords for reply matching
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

// Non-name words for author parsing
const NON_NAME_WORDS = new Set([
  'hi','hey','me','user','anon','anonymous','unknown','test','n/a','na','none',
  'google','android','ios','apple','mcafee','customer','reviewer'
]);

// ═══════════════════════════════════════════════════════════════════════════
// REVIEW INTENT CLASSIFICATION (NEW)
// ═══════════════════════════════════════════════════════════════════════════

function classifyReviewIntent(review) {
  const text = (review.text || review.content || '').toLowerCase();
  const rating = review.rating || 3;
  
  // Check for false positive triggers first (neutral usage statements)
  const hasNeutralContext = COMPLAINT_INDICATORS.falsePositiveTriggers.some(
    trigger => text.includes(trigger)
  );
  
  // Count actual complaint indicators
  const strongComplaints = COMPLAINT_INDICATORS.strong.filter(w => text.includes(w));
  const moderateComplaints = COMPLAINT_INDICATORS.moderate.filter(w => text.includes(w));
  
  // Check for question marks (seeking help, not necessarily complaining)
  const hasQuestions = /\?/.test(text);
  
  // Check for explicit "no issues" statements
  const noIssuesPattern = /\b(no issues?|no problems?|working fine|works fine|so far so good|no complaints?)\b/;
  const explicitlyNoIssues = noIssuesPattern.test(text);
  
  // Decision logic
  const complaintScore = strongComplaints.length * 3 + moderateComplaints.length;
  
  // 1★ or 2★ with strong complaint words = definite complaint
  if (rating <= 2 && strongComplaints.length > 0) {
    return { type: 'COMPLAINT', confidence: 'high', score: complaintScore };
  }
  
  // 1★ or 2★ with moderate complaints = complaint
  if (rating <= 2 && complaintScore > 0) {
    return { type: 'COMPLAINT', confidence: 'high', score: complaintScore };
  }
  
  // 1★ or 2★ without complaint words = likely complaint (low rating indicates dissatisfaction)
  if (rating <= 2) {
    return { type: 'COMPLAINT', confidence: 'medium', score: 1, note: 'low_rating' };
  }
  
  // 3★ with strong complaints = complaint
  if (rating === 3 && strongComplaints.length > 0) {
    return { type: 'COMPLAINT', confidence: 'high', score: complaintScore };
  }
  
  // 3★ with neutral context + no complaints = neutral statement
  if (rating === 3 && hasNeutralContext && complaintScore === 0) {
    return { type: 'NEUTRAL_STATEMENT', confidence: 'high', score: 0 };
  }
  
  // 3★ with explicit "no issues" = neutral statement
  if (rating === 3 && explicitlyNoIssues) {
    return { type: 'NEUTRAL_STATEMENT', confidence: 'high', score: 0 };
  }
  
  // 3★ with questions = seeking help/feedback
  if (rating === 3 && hasQuestions && complaintScore === 0) {
    return { type: 'FEEDBACK', confidence: 'medium', score: 0 };
  }
  
  // 3★ with some complaints = feedback
  if (rating === 3 && complaintScore > 0) {
    return { type: 'FEEDBACK', confidence: 'medium', score: complaintScore };
  }
  
  // 3★ default = feedback
  if (rating === 3) {
    return { type: 'FEEDBACK', confidence: 'medium', score: complaintScore };
  }
  
  // 4-5★ with strong complaints = feedback (suggestions for improvement)
  if (rating >= 4 && strongComplaints.length > 0) {
    return { type: 'FEEDBACK', confidence: 'high', score: complaintScore };
  }
  
  // 4-5★ with moderate complaints = feedback
  if (rating >= 4 && complaintScore > 2) {
    return { type: 'FEEDBACK', confidence: 'medium', score: complaintScore };
  }
  
  // 4-5★ default = praise
  return { type: 'PRAISE', confidence: 'high', score: 0 };
}

function isApologyWarranted(review, intent) {
  // Only apologize for actual complaints
  if (intent.type === 'COMPLAINT') {
    return { warranted: true, reason: 'User expressed dissatisfaction' };
  }
  
  // Don't apologize for neutral statements or praise
  if (intent.type === 'NEUTRAL_STATEMENT') {
    return { warranted: false, reason: 'User made neutral statement, not a complaint' };
  }
  
  if (intent.type === 'PRAISE') {
    return { warranted: false, reason: 'User left positive review' };
  }
  
  // For feedback, check severity
  if (intent.type === 'FEEDBACK' && intent.score > 2) {
    return { warranted: true, reason: 'User had specific issues to address' };
  }
  
  return { warranted: false, reason: 'Feedback does not require apology' };
}

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE QUALITY CLASSIFIER (IMPROVED)
// ═══════════════════════════════════════════════════════════════════════════

function _themesCoveredInReply(themes, replyLower) {
  if (!themes || themes.length === 0) return true;
  return themes.some(function(theme) {
    const tl = theme.toLowerCase();
    const kws = THEME_REPLY_KEYWORDS[tl] || [tl];
    return kws.some(function(kw) { return replyLower.indexOf(kw) !== -1; });
  });
}

function checkResponseQuality(review) {
  const key = review.id;
  if (key && state.qualityCache.has(key)) return state.qualityCache.get(key);

  function cache(val) { if (key) state.qualityCache.set(key, val); return val; }

  const hasReply = review.developer_reply && review.developer_reply.trim().length > 0;
  if (!hasReply) return cache('NO RESPONSE');

  const reply = review.developer_reply.trim();
  const rl = reply.toLowerCase();
  const rating = review.rating || 3;
  const themes = (review.themes || []).map(function(t) { return t.toLowerCase(); });
  
  // NEW: Get review intent classification
  const intent = classifyReviewIntent(review);
  const apologyAnalysis = isApologyWarranted(review, intent);

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

  // ── Classification — priority order ──────────────────────────────────────

  // 1. NO RESPONSE
  if (!hasReply) {
    return cache('NO RESPONSE');
  }

  // 2. UNWARRANTED APOLOGY: Apologizing when review is not a complaint
  if (apologizes && !apologyAnalysis.warranted) {
    return cache('UNWARRANTED APOLOGY');
  }

  // 3. HIGH RATING + APOLOGY: For praise that gets an apology
  if (rating >= 4 && apologizes && intent.type === 'PRAISE') {
    return cache('HIGH RATING + APOLOGY');
  }

  // 4. GENERIC TEMPLATE: Copy-paste boilerplate (check early)
  if (isBoilerplate || isGenericPositive) {
    return cache('GENERIC TEMPLATE');
  }

  // 5. LOW RATING + NO EMPATHY: Upset customer received cold reply
  if (rating <= 2 && intent.type === 'COMPLAINT' && !hasEmpathy) {
    return cache('LOW RATING + NO EMPATHY');
  }

  // 6. WRONG ISSUE: Reply completely misses the topic raised (only for actual complaints)
  if (intent.type === 'COMPLAINT' && !themesCovered && themes.length >= 1 && reply.length < 500) {
    return cache('WRONG ISSUE');
  }

  // 7. NO SOLUTION: Redirect without specific help
  if (intent.type === 'COMPLAINT' && onlyRedirects) {
    return cache('NO SOLUTION');
  }

  // 8. NO SOLUTION: Has empathy but no actionable guidance
  if ((intent.type === 'COMPLAINT' || intent.type === 'FEEDBACK') && 
      hasEmpathy && !hasSpecificHelp && !onlyRedirects) {
    return cache('NO SOLUTION');
  }

  // All signals passed — response is appropriate
  return cache('CORRECT');
}

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY EXPLANATION (IMPROVED)
// ═══════════════════════════════════════════════════════════════════════════

function getQualityExplanation(review, quality) {
  const intent = classifyReviewIntent(review);
  
  switch (quality) {
    case 'UNWARRANTED APOLOGY':
      return `The user ${intent.type === 'NEUTRAL_STATEMENT' ? 'made a neutral statement' : 'left positive feedback'} — no complaint was expressed. An apology is unnecessary and may seem dismissive.`;
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

// ═══════════════════════════════════════════════════════════════════════════
// IMPROVED SUGGESTED REPLY GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

function _getFirstName(author) {
  if (!author || !author.trim()) return null;
  var cleaned = author.replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s*/i, '').trim();
  var parts = cleaned.split(/\s+/);
  var first = parts[0] || '';
  if (/^[A-Za-z]\.$/.test(first) && parts[1]) first = parts[1];
  if (first.length > 1 && (first === first.toUpperCase() || first === first.toLowerCase()))
    first = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  if (/[^a-zA-Z'\-.]/g.test(first)) return null;
  if (NON_NAME_WORDS.has(first.toLowerCase())) return null;
  if (first.length < 2) return null;
  return first || null;
}

function _detectTopics(review) {
  const tl = (review.text || review.content || '').toLowerCase();
  const themes = (review.themes || []).map(t => t.toLowerCase());
  
  return {
    hasVPN: themes.some(t => /vpn/.test(t)) || tl.includes('vpn'),
    hasBilling: themes.some(t => /pricing|billing|auto-renewal/.test(t)) || 
                /bill|charge|refund|cancel|subscript|renewal/.test(tl),
    hasPerf: themes.some(t => /performance/.test(t)) || 
             /slow|battery|drain|speed|lag|memory/.test(tl),
    hasInstall: themes.some(t => /installation/.test(t)) || 
                /install|remov|uninstall|setup/.test(tl),
    hasPopups: themes.some(t => /pop-up|popup/.test(t)) || 
               /pop.up|popup|notification|ads/.test(tl),
    hasDarkWeb: themes.some(t => /dark web/.test(t)),
    hasSupport: themes.some(t => /customer support/.test(t)),
    hasScam: themes.some(t => /scam|phish/.test(t)) || /scam|phish|spam/.test(tl),
    hasAppIssues: themes.some(t => /app issues/.test(t)) || /crash|bug|freeze|error|not working/.test(tl)
  };
}

function _themeAction(topics, includeGeneral = true) {
  if (topics.hasVPN)
    return 'For VPN issues, try toggling it off and back on in the McAfee app, then restart your device. Our VPN specialists at 1-866-622-3911 can also diagnose connection drops remotely.';
  if (topics.hasBilling)
    return 'Our billing team at 1-866-622-3911 can review your account, clarify any charges, and process corrections same-day — please have your account email ready.';
  if (topics.hasPerf)
    return 'To recover performance, update McAfee to the latest version and clear the app cache (Settings → Apps → McAfee → Clear Cache). Our team at mcafee.com/support can also run a full device check.';
  if (topics.hasInstall)
    return 'Our dedicated McAfee Removal Tool at download.mcafee.com/mcpR.aspx does a clean sweep with one click. Our team can then walk you through a fresh install over chat at mcafee.com/support.';
  if (topics.hasPopups)
    return 'You can disable product alerts under McAfee → Settings → General → turn off "Product announcements". Our team can also help fine-tune exactly which notifications appear.';
  if (topics.hasDarkWeb)
    return 'A Dark Web alert means your info appeared in a known data breach — change passwords for affected accounts immediately. Our identity specialists at 1-866-622-3911 can guide you through each step.';
  if (topics.hasScam)
    return 'Make sure "Scam Protection" is toggled ON in the McAfee app. Our team at mcafee.com/support can verify all your settings are fully active and protecting you.';
  if (topics.hasSupport)
    return 'We take every support interaction seriously. Please share the date and reference number at mcafee.com/support so we can follow up with the agent and make it right.';
  if (topics.hasAppIssues)
    return 'For app crashes, first try clearing the app cache (Settings → Apps → McAfee → Clear Cache). If the issue persists, our tech team can help at mcafee.com/support or 1-866-622-3911.';
  if (includeGeneral)
    return 'Please reach out at mcafee.com/support or call 1-866-622-3911 — our specialists will stay with you until it is fully resolved.';
  return '';
}

/**
 * Build a personalized reply based on review intent and quality issues
 */
function buildPersonalizedReply(review, quality) {
  if (quality === 'CORRECT') return null;

  var name = _getFirstName(review.author);
  var hi = name ? ('Hi ' + name + ', ') : '';
  var rating = review.rating || 3;
  var intent = classifyReviewIntent(review);
  var topics = _detectTopics(review);
  const reviewText = (review.text || review.content || '').toLowerCase();

  // ═══════════════════════════════════════════════════════════════════════
  // NO RESPONSE - Different templates based on intent
  // ═══════════════════════════════════════════════════════════════════════
  if (quality === 'NO RESPONSE') {
    // PRAISE (4-5★) - Enthusiastic thanks
    if (intent.type === 'PRAISE') {
      const themeRef = review.themes && review.themes.length > 0
        ? review.themes[0].replace(/\b\w/g, c => c.toUpperCase())
        : 'McAfee';
      return hi + 'Thank you so much for the kind words — it genuinely motivates our entire team! ' +
        'Knowing ' + themeRef + ' is delivering for you is exactly why we do this work every day. ' +
        'If anything ever comes up, just reach out — we are always here for you. 🛡️';
    }
    
    // NEUTRAL_STATEMENT (3★, no complaint) - Encourage exploration
    if (intent.type === 'NEUTRAL_STATEMENT') {
      return hi + 'Thanks for giving McAfee a try! We\'d love to help you get the most from your protection. ' +
        'Have you explored features like our VPN, Dark Web Monitoring, or Identity Theft Protection? ' +
        'If there\'s anything we can do to make your experience better, let us know — we\'re here to help! 🛡️';
    }
    
    // FEEDBACK (3★ with suggestions) - Ask what would make it 5 stars
    if (intent.type === 'FEEDBACK') {
      return hi + 'Thank you for sharing your feedback — it helps us improve! ' +
        'We\'d love to know: what would make your experience a 5-star one? ' +
        'In the meantime, ' + _themeAction(topics) +
        ' Your input directly shapes what we build next.';
    }
    
    // COMPLAINT - Apologize and offer specific help
    return hi + 'We sincerely apologize for the silence — you deserved a response and we let you down. ' +
      _themeAction(topics) +
      ' We would love the chance to make this right for you.';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UNWARRANTED APOLOGY - Replace with appropriate tone
  // ═══════════════════════════════════════════════════════════════════════
  if (quality === 'UNWARRANTED APOLOGY') {
    // For neutral statements, encourage feature exploration
    if (intent.type === 'NEUTRAL_STATEMENT') {
      // Check if it's a family/multi-device context
      const isFamilyContext = /daughter|son|child|kid|family|wife|husband/i.test(reviewText);
      
      if (isFamilyContext) {
        return hi + 'Thanks for choosing McAfee to protect your family! 🛡️ ' +
          'Since you\'re just getting started, here are features worth exploring:\n' +
          '• VPN for private browsing on any network\n' +
          '• Dark Web Monitoring to alert you if your info appears in breaches\n' +
          '• Safe Family for parental controls\n' +
          'What would make your experience even better? We\'re here to help!';
      }
      
      return hi + 'Thanks for trying McAfee! We want to make sure you\'re getting the most from your protection. ' +
        'Have you had a chance to explore all the features included with your subscription? ' +
        'If there\'s anything specific you\'re looking for or any questions we can answer, just let us know!';
    }
    
    // For praise, keep it simple and positive
    const ref = review.themes && review.themes.length > 0
      ? 'feedback on ' + review.themes[0].replace(/\b\w/g, c => c.toUpperCase())
      : 'your loyalty and trust';
    return hi + 'Thank you for the ' + rating + '-star review — this made our day! ' +
      'We really appreciate ' + ref + '. ' +
      'You are in great hands, and we are here whenever you need us. 👍';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HIGH RATING + APOLOGY - Fix by removing apology
  // ═══════════════════════════════════════════════════════════════════════
  if (quality === 'HIGH RATING + APOLOGY') {
    const ref = review.themes && review.themes.length > 0
      ? 'feedback on ' + review.themes[0].replace(/\b\w/g, c => c.toUpperCase())
      : 'your loyalty and trust';
    return hi + 'Thank you for the ' + rating + '-star review — this made our day! ' +
      'We really appreciate ' + ref + '. ' +
      'You are in great hands, and we are here whenever you need us. 👍';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LOW RATING + NO EMPATHY - Add genuine empathy + specific help
  // ═══════════════════════════════════════════════════════════════════════
  if (quality === 'LOW RATING + NO EMPATHY') {
    return hi + 'We are truly sorry your experience fell short — that is not the standard we hold ourselves to, ' +
      'and you deserved a more caring response from the start. ' +
      _themeAction(topics) +
      ' We are committed to turning this around for you.';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GENERIC TEMPLATE - Replace with specific, personalized response
  // ═══════════════════════════════════════════════════════════════════════
  if (quality === 'GENERIC TEMPLATE') {
    if (intent.type === 'NEUTRAL_STATEMENT') {
      return hi + 'Thanks for trying McAfee! We want to make sure you\'re getting the most from your protection. ' +
        'Have you had a chance to explore all the features included with your subscription? ' +
        'If there\'s anything specific you\'re looking for or any questions we can answer, just let us know!';
    }
    
    if (intent.type === 'PRAISE') {
      const ref = review.themes && review.themes.length > 0
        ? 'on ' + review.themes[0].replace(/\b\w/g, c => c.toUpperCase())
        : 'with McAfee';
      return hi + 'Thank you for the ' + rating + '-star review and for sharing your thoughts ' +
        ref + '! ' +
        'Your feedback directly shapes our next improvements. ' +
        _themeAction(topics);
    }
    
    // For complaints/feedback - address the specific issue
    return hi + 'You deserve a real answer, not a copy-paste — we hear you. ' +
      _themeAction(topics) +
      ' Let us fix this together.';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WRONG ISSUE - Acknowledge the actual concern
  // ═══════════════════════════════════════════════════════════════════════
  if (quality === 'WRONG ISSUE') {
    const focus = review.themes && review.themes.length > 0
      ? review.themes[0].replace(/\b\w/g, c => c.toUpperCase())
      : 'your specific concern';
    return hi + 'We want to make sure we are actually helping with what matters — ' +
      focus + '. ' +
      _themeAction(topics) +
      ' Please reach out so we can give this the focused attention it deserves.';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NO SOLUTION - Provide concrete actionable steps
  // ═══════════════════════════════════════════════════════════════════════
  if (quality === 'NO SOLUTION') {
    return hi + 'We hear you, and we owe you a concrete solution — not just sympathy. ' +
      _themeAction(topics) +
      ' Our specialists will stay with you until it is completely sorted out.';
  }

  return review.suggested_reply || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS (for testing)
// ═══════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    classifyReviewIntent,
    isApologyWarranted,
    checkResponseQuality,
    getQualityExplanation,
    buildPersonalizedReply,
    COMPLAINT_INDICATORS,
    THEME_REPLY_KEYWORDS
  };
}
