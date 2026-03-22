#!/usr/bin/env python3
"""
Add quality tags to reviews using improved classifier (Exp 007)
"""

import json
import re

# Load existing data
with open('docs/data/dashboard_data.json', 'r') as f:
    data = json.load(f)

print("="*60)
print("ADDING QUALITY TAGS (Exp 007)")
print("="*60)

# Complaint indicators
COMPLAINT_INDICATORS = {
    'strong': ['terrible', 'awful', 'horrible', 'worst', 'hate', 'garbage', 'trash', 
               'scam', 'fraud', 'rip off', 'rip-off', 'useless', 'worthless', 'crap',
               'disgusting', 'unacceptable', 'ridiculous', 'pathetic'],
    'moderate': ['problem', 'issue', 'bug', 'error', 'crash', 'broken', 'not working',
                 'doesn\'t work', 'won\'t work', 'can\'t', 'unable', 'failed', 'failure',
                 'disappointing', 'disappointed', 'frustrating', 'frustrated', 'annoying',
                 'confusing', 'confused', 'difficult', 'hard to', 'slow', 'lag', 'freeze',
                 'stuck', 'frozen', 'keeps', 'constantly', 'always', 'never'],
    'false_positive_triggers': ['just started', 'recently started', 'new to', 'first time',
                                'giving it a try', 'trying out', 'checking out', 'seeing how',
                                'so far', 'for now', 'at the moment']
}

def classify_intent(review):
    """Classify review intent"""
    text = review.get('content', '').lower()
    rating = review.get('rating', 3)
    
    has_neutral_context = any(trigger in text for trigger in COMPLAINT_INDICATORS['false_positive_triggers'])
    strong_complaints = [w for w in COMPLAINT_INDICATORS['strong'] if w in text]
    moderate_complaints = [w for w in COMPLAINT_INDICATORS['moderate'] if w in text]
    
    complaint_score = len(strong_complaints) * 3 + len(moderate_complaints)
    
    if rating <= 2 and strong_complaints:
        return 'COMPLAINT'
    if rating <= 2 and complaint_score > 0:
        return 'COMPLAINT'
    if rating <= 2:
        return 'COMPLAINT'
    
    if rating == 3 and strong_complaints:
        return 'COMPLAINT'
    if rating == 3 and has_neutral_context and complaint_score == 0:
        return 'NEUTRAL_STATEMENT'
    if rating == 3 and complaint_score > 0:
        return 'FEEDBACK'
    if rating == 3:
        return 'FEEDBACK'
    
    if rating >= 4 and strong_complaints:
        return 'FEEDBACK'
    
    return 'PRAISE'

def check_quality(review):
    """Check response quality"""
    reply = review.get('developer_reply') or ''
    reply = reply.strip()
    rating = review.get('rating', 3)
    intent = classify_intent(review)
    
    if not reply:
        return 'NO RESPONSE'
    
    reply_lower = reply.lower()
    apologizes = bool(re.search(r'\b(sorry|apologize|apologies)\b', reply_lower))
    
    # Check if apology is warranted
    apology_warranted = intent == 'COMPLAINT' or (intent == 'FEEDBACK' and 'issue' in review.get('content', '').lower())
    
    if apologizes and not apology_warranted and intent in ['NEUTRAL_STATEMENT', 'PRAISE']:
        return 'UNWARRANTED APOLOGY'
    
    if rating >= 4 and apologizes and intent == 'PRAISE':
        return 'HIGH RATING + APOLOGY'
    
    # Check for generic template
    if re.search(r'we.?re elated|we are elated|elated by your|(awesome|wonderful) feedback you have provided', reply_lower):
        return 'GENERIC TEMPLATE'
    
    if len(reply) < 150 and not re.search(r'(sorry|apologize|understand|frustrat)', reply_lower) and 'thank' in reply_lower:
        return 'GENERIC TEMPLATE'
    
    # Check for empathy
    has_empathy = bool(re.search(r'\b(sorry|apologize|apologies|frustrat|concern|regret|disappoint|understand|hear)', reply_lower))
    
    if rating <= 2 and intent == 'COMPLAINT' and not has_empathy:
        return 'LOW RATING + NO EMPATHY'
    
    # Check for specific help
    has_specific_help = bool(re.search(r'\b(steps?:|try |reinstall|download|update|restart|1-866|mcafee\.com)', reply_lower))
    only_redirects = bool(re.search(r'contact (us|support)|reach (out|our support)', reply_lower)) and not has_specific_help and len(reply) < 450
    
    if intent == 'COMPLAINT' and only_redirects:
        return 'NO SOLUTION'
    
    if intent in ['COMPLAINT', 'FEEDBACK'] and has_empathy and not has_specific_help and not only_redirects:
        return 'NO SOLUTION'
    
    return 'CORRECT'

# Process reviews
quality_counts = {}
for review in data['recent_reviews']:
    quality = check_quality(review)
    review['quality_tag'] = quality
    quality_counts[quality] = quality_counts.get(quality, 0) + 1

print(f"Total reviews processed: {len(data['recent_reviews'])}")
print(f"\nQuality Tag Distribution:")
for tag, count in sorted(quality_counts.items(), key=lambda x: -x[1]):
    pct = count / len(data['recent_reviews']) * 100
    print(f"  {tag}: {count} ({pct:.1f}%)")

# Save
with open('docs/data/dashboard_data.json', 'w') as f:
    json.dump(data, f, indent=2)

print(f"\n✅ Quality tags added to docs/data/dashboard_data.json")
