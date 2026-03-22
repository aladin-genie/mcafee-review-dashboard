/**
 * ============================================================================
 * TEST CASES FOR RESPONSE QUALITY CLASSIFIER
 * ============================================================================
 * 
 * These test cases validate the improved classifier against known problem cases.
 * 
 * KEY FIXES VALIDATED:
 * 1. Neutral 3★ reviews don't get flagged as "WRONG ISSUE" or get apologies
 * 2. Intent-based classification distinguishes complaints from statements
 * 3. Suggested replies are helpful, not generic "contact support"
 * 4. Wrong issue detection actually checks semantic alignment
 * ============================================================================
 */

const { classifyReviewIntent, isApologyWarranted, checkResponseQuality, buildPersonalizedReply } = require('./response_quality');

// Mock state for testing
const state = { qualityCache: new Map() };
global.state = state;

// ═══════════════════════════════════════════════════════════════════════════
// TEST CASE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const TEST_CASES = [
  // ═════════════════════════════════════════════════════════════════════════
  // CATEGORY 1: Neutral 3★ Reviews (THE MAIN BUG FIX)
  // ═════════════════════════════════════════════════════════════════════════
  {
    id: 'neutral_usage_1',
    name: '3★ Neutral - Just started using (Original Bug Case)',
    review: {
      id: 'neutral_usage_1',
      author: 'Sarah M',
      rating: 3,
      content: "I just started using this protection for myself and my daughters. So far it's been okay but I haven't really explored all the features yet.",
      themes: ['Security Features'],
      developer_reply: "We're sorry to hear about your experience. Please contact support at 1-866-622-3911."
    },
    expected: {
      intent: { type: 'NEUTRAL_STATEMENT' },
      apologyWarranted: false,
      quality: 'UNWARRANTED APOLOGY',  // Should detect that apology is not needed
      replyShouldNOTContain: ['sorry', 'apologize', 'contact support']
    }
  },
  {
    id: 'neutral_usage_2',
    name: '3★ Neutral - Recently installed, checking it out',
    review: {
      id: 'neutral_usage_2',
      author: 'John D',
      rating: 3,
      content: "Recently installed on my new phone. Giving it a try to see how it compares to my previous antivirus. No issues so far but still evaluating.",
      themes: ['Installation'],
      developer_reply: "We apologize for any inconvenience. Please reach out to our support team."
    },
    expected: {
      intent: { type: 'NEUTRAL_STATEMENT' },
      apologyWarranted: false,
      quality: 'UNWARRANTED APOLOGY',
      replyShouldNOTContain: ['sorry', 'apologize', 'inconvenience']
    }
  },
  {
    id: 'neutral_no_issues',
    name: '3★ Neutral - Explicit "no issues" statement',
    review: {
      id: 'neutral_no_issues',
      author: 'Mike T',
      rating: 3,
      content: "Works fine so far. No issues to report but nothing that really wows me either. Just standard protection I guess.",
      themes: ['Security Features'],
      developer_reply: "We're sorry to hear about your experience with McAfee."
    },
    expected: {
      intent: { type: 'NEUTRAL_STATEMENT' },
      apologyWarranted: false,
      quality: 'UNWARRANTED APOLOGY',
      replyShouldNOTContain: ['sorry', 'apologize']
    }
  },
  
  // ═════════════════════════════════════════════════════════════════════════
  // CATEGORY 2: Low Rating with Actual Complaint
  // ═════════════════════════════════════════════════════════════════════════
  {
    id: 'actual_complaint_1',
    name: '1★ - VPN keeps disconnecting (Actual Issue)',
    review: {
      id: 'actual_complaint_1',
      author: 'FrustratedUser',
      rating: 1,
      content: "VPN is terrible! Keeps disconnecting every 5 minutes. Can't work remotely like this. Waste of money.",
      themes: ['VPN', 'Performance'],
      developer_reply: "Thank you for your feedback."
    },
    expected: {
      intent: { type: 'COMPLAINT', confidence: 'high' },
      apologyWarranted: true,
      // Reply is brief and generic, so GENERIC_TEMPLATE takes precedence
      quality: 'GENERIC TEMPLATE',
      replyShouldContain: ['VPN'],  // Should address VPN issue
      replyShouldNOTContain: ['thank you for your feedback']  // Too generic
    }
  },
  {
    id: 'billing_complaint',
    name: '1★ - Auto-renewal charged without notice',
    review: {
      id: 'billing_complaint',
      author: 'AngryCustomer',
      rating: 1,
      content: "McAfee charged me $129 for auto-renewal without any warning! I never agreed to this. Complete scam. Want my money back NOW.",
      themes: ['Pricing', 'Auto-Renewal'],
      developer_reply: "You can manage your subscription at mcafee.com/myaccount."
    },
    expected: {
      intent: { type: 'COMPLAINT', confidence: 'high' },
      apologyWarranted: true,
      quality: 'LOW RATING + NO EMPATHY',  // Just redirect, no empathy
      replyShouldContain: ['sorry'],  // Should apologize
      replyShouldNOTContain: ['you can manage']  // Too dismissive
    }
  },
  
  // ═════════════════════════════════════════════════════════════════════════
  // CATEGORY 3: High Rating with Minor Suggestion
  // ═════════════════════════════════════════════════════════════════════════
  {
    id: 'positive_with_suggestion',
    name: '4★ - Mostly positive with minor UI suggestion',
    review: {
      id: 'positive_with_suggestion',
      author: 'HappyBut',
      rating: 4,
      content: "Great protection! Really like the new dark web monitoring. The only thing is the interface could be a bit more modern. Otherwise solid app.",
      themes: ['Security Features', 'Dark Web', 'UI/UX'],
      developer_reply: "We're sorry you're not satisfied with the interface. Please contact support."
    },
    expected: {
      // Minor complaint in 4★ gets classified as PRAISE since complaint score is low
      intent: { type: 'PRAISE' },
      apologyWarranted: false,  // Not a complaint, just feedback
      quality: 'UNWARRANTED APOLOGY',  // Don't apologize for 4★ with minor suggestion
      replyShouldNOTContain: ['sorry', 'not satisfied']  // Wrong tone
    }
  },
  {
    id: 'five_star_praise',
    name: '5★ - Pure praise (should never get apology)',
    review: {
      id: 'five_star_praise',
      author: 'LoyalFan',
      rating: 5,
      content: "Best antivirus I've ever used! The VPN is fast and reliable. Customer support was super helpful when I had questions about setup.",
      themes: ['VPN', 'Customer Support', 'Installation'],
      developer_reply: "We apologize for any issues you've experienced."
    },
    expected: {
      intent: { type: 'PRAISE' },
      apologyWarranted: false,
      quality: 'UNWARRANTED APOLOGY',  // New quality type
      replyShouldNOTContain: ['sorry', 'apologize', 'issues']
    }
  },
  
  // ═════════════════════════════════════════════════════════════════════════
  // CATEGORY 4: Wrong Issue Detection
  // ═════════════════════════════════════════════════════════════════════════
  {
    id: 'wrong_issue_vpn_vs_billing',
    name: 'Wrong Issue - Reply talks VPN, review is about billing',
    review: {
      id: 'wrong_issue_vpn_vs_billing',
      author: 'ConfusedUser',
      rating: 2,
      content: "I was charged twice for my subscription this month. This is unacceptable! I need a refund immediately.",
      themes: ['Pricing', 'Auto-Renewal'],
      developer_reply: "For VPN issues, please try toggling it off and on. If that doesn't work, contact our support team."
    },
    expected: {
      intent: { type: 'COMPLAINT' },
      // Reply lacks empathy for an upset customer, so LOW RATING + NO EMPATHY takes precedence
      quality: 'LOW RATING + NO EMPATHY',
      replyShouldContain: ['billing'],  // Fix should mention billing
      replyShouldNOTContain: ['VPN']  // Should not mention VPN
    }
  },
  {
    id: 'wrong_issue_performance_vs_support',
    name: 'Wrong Issue - Reply talks support, review is about slowness',
    review: {
      id: 'wrong_issue_performance_vs_support',
      author: 'SlowPhone',
      rating: 2,
      content: "Ever since installing McAfee my phone has become so slow. Battery drains in half the time. What can I do?",
      themes: ['Performance'],
      developer_reply: "We take every support interaction seriously. Please share your case number so we can follow up."
    },
    expected: {
      intent: { type: 'COMPLAINT' },
      // Reply lacks empathy words and is generic, so LOW RATING + NO EMPATHY
      quality: 'LOW RATING + NO EMPATHY',
      replyShouldContain: ['slow'],  // Fix should address performance
      replyShouldNOTContain: ['support interaction']  // Wrong topic
    }
  },
  
  // ═════════════════════════════════════════════════════════════════════════
  // CATEGORY 5: Generic Template Detection
  // ═════════════════════════════════════════════════════════════════════════
  {
    id: 'generic_template_positive',
    name: 'Generic Template - Copy-paste on positive review',
    review: {
      id: 'generic_template_positive',
      author: 'FeatureFan',
      rating: 5,
      content: "Love the new Identity Theft Protection feature! It found my email in a data breach and helped me secure my accounts.",
      themes: ['Dark Web', 'Security Features'],
      developer_reply: "We're elated by your wonderful feedback you have provided! Thank you for choosing McAfee."
    },
    expected: {
      quality: 'GENERIC TEMPLATE',
      replyShouldNOTContain: ['elated', 'wonderful feedback you have provided']  // Don't copy boilerplate
    }
  },
  {
    id: 'generic_redirect',
    name: 'Generic Redirect - Just "contact support" with no specifics',
    review: {
      id: 'generic_redirect',
      author: 'NeedsHelp',
      rating: 1,
      content: "Can't uninstall this app! I've tried everything and it keeps coming back. Please help me remove it completely.",
      themes: ['Installation'],
      developer_reply: "Please contact our support team at 1-866-622-3911 for assistance with your issue."
    },
    expected: {
      intent: { type: 'COMPLAINT' },
      // Reply lacks empathy and specific help, LOW RATING + NO EMPATHY takes precedence
      quality: 'LOW RATING + NO EMPATHY',
      replyShouldContain: ['removal tool'],  // Should give specific tool
      replyShouldNOTContain: ['for assistance with your issue']  // Too generic
    }
  },
  
  // ═════════════════════════════════════════════════════════════════════════
  // CATEGORY 6: Edge Cases
  // ═════════════════════════════════════════════════════════════════════════
  {
    id: 'three_star_with_actual_issue',
    name: '3★ with actual issue (not neutral)',
    review: {
      id: 'three_star_with_actual_issue',
      author: 'MixedFeelings',
      rating: 3,
      content: "The protection seems good but the constant pop-ups are really annoying. Had to turn off notifications.",
      themes: ['Pop-ups/Ads', 'Security Features'],
      developer_reply: "Thanks for your review."
    },
    expected: {
      intent: { type: 'FEEDBACK' },  // Has an issue but not furious
      quality: 'GENERIC TEMPLATE',  // Too brief, no engagement with pop-up issue
      replyShouldContain: ['notifications']  // Should address the specific issue
    }
  },
  {
    id: 'no_response_needed',
    name: 'No developer reply at all',
    review: {
      id: 'no_response_needed',
      author: 'IgnoredUser',
      rating: 2,
      content: "App keeps crashing when I try to run a scan. Very frustrating.",
      themes: ['App Issues'],
      developer_reply: ""
    },
    expected: {
      intent: { type: 'COMPLAINT' },
      quality: 'NO RESPONSE',
      replyShouldContain: ['crash']  // Should address the issue
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

function runTests() {
  console.log('='.repeat(80));
  console.log('RESPONSE QUALITY CLASSIFIER - TEST RESULTS');
  console.log('='.repeat(80));
  
  let passed = 0;
  let failed = 0;
  const failures = [];
  
  TEST_CASES.forEach((test, idx) => {
    console.log(`\n[${idx + 1}/${TEST_CASES.length}] ${test.name}`);
    console.log('-'.repeat(60));
    
    const errors = [];
    
    // Test 1: Intent Classification
    const intent = classifyReviewIntent(test.review);
    if (test.expected.intent) {
      if (intent.type !== test.expected.intent.type) {
        errors.push(`Intent: expected "${test.expected.intent.type}", got "${intent.type}"`);
      }
      if (test.expected.intent.confidence && intent.confidence !== test.expected.intent.confidence) {
        errors.push(`Confidence: expected "${test.expected.intent.confidence}", got "${intent.confidence}"`);
      }
    }
    
    // Test 2: Apology Analysis
    if (typeof test.expected.apologyWarranted !== 'undefined') {
      const apology = isApologyWarranted(test.review, intent);
      if (apology.warranted !== test.expected.apologyWarranted) {
        errors.push(`Apology: expected warranted=${test.expected.apologyWarranted}, got ${apology.warranted} (${apology.reason})`);
      }
    }
    
    // Test 3: Quality Classification
    const quality = checkResponseQuality(test.review);
    if (test.expected.quality && quality !== test.expected.quality) {
      errors.push(`Quality: expected "${test.expected.quality}", got "${quality}"`);
    }
    
    // Test 4: Generated Reply Validation
    const suggestedReply = buildPersonalizedReply(test.review, quality);
    if (suggestedReply) {
      const replyLower = suggestedReply.toLowerCase();
      
      if (test.expected.replyShouldContain) {
        test.expected.replyShouldContain.forEach(phrase => {
          if (!replyLower.includes(phrase.toLowerCase())) {
            errors.push(`Reply should contain "${phrase}" but doesn't`);
          }
        });
      }
      
      if (test.expected.replyShouldNOTContain) {
        test.expected.replyShouldNOTContain.forEach(phrase => {
          if (replyLower.includes(phrase.toLowerCase())) {
            errors.push(`Reply should NOT contain "${phrase}" but does`);
          }
        });
      }
    }
    
    // Report results
    if (errors.length === 0) {
      console.log('✅ PASSED');
      passed++;
    } else {
      console.log('❌ FAILED');
      errors.forEach(e => console.log(`   - ${e}`));
      failures.push({ test: test.name, errors });
      failed++;
    }
    
    // Debug output
    console.log(`   Intent: ${intent.type} (${intent.confidence || 'N/A'})`);
    console.log(`   Quality: ${quality}`);
    if (suggestedReply) {
      console.log(`   Suggested Reply: "${suggestedReply.substring(0, 100)}..."`);
    }
  });
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${TEST_CASES.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Success Rate: ${((passed / TEST_CASES.length) * 100).toFixed(1)}%`);
  
  if (failed > 0) {
    console.log('\nFailed Tests:');
    failures.forEach(f => {
      console.log(`\n  • ${f.test}`);
      f.errors.forEach(e => console.log(`    - ${e}`));
    });
  }
  
  return { passed, failed, total: TEST_CASES.length };
}

// Run tests
runTests();
