#!/usr/bin/env python3
"""
Add suggested replies to reviews based on quality tags (Exp 007)
"""

import json

# Load existing data
with open('docs/data/dashboard_data.json', 'r') as f:
    data = json.load(f)

print("="*60)
print("ADDING SUGGESTED REPLIES (Exp 007)")
print("="*60)

def get_first_name(author):
    if not author:
        return None
    cleaned = author.strip()
    parts = cleaned.split()
    first = parts[0] if parts else ''
    if first.lower() in ['hi', 'hey', 'user', 'anonymous', 'test']:
        return None
    if len(first) < 2:
        return None
    return first

def generate_suggested_reply(review):
    """Generate suggested reply based on quality tag and intent"""
    quality = review.get('quality_tag', 'CORRECT')
    if quality == 'CORRECT':
        return None
    
    rating = review.get('rating', 3)
    content = review.get('content', '').lower()
    themes = review.get('themes', [])
    author = review.get('author', '')
    
    name = get_first_name(author)
    hi = f"Hi {name}, " if name else ""
    
    # Determine intent from content
    if rating <= 2:
        intent = 'COMPLAINT'
    elif rating == 3:
        if any(w in content for w in ['just started', 'giving it a try', 'so far']):
            intent = 'NEUTRAL'
        else:
            intent = 'FEEDBACK'
    else:
        intent = 'PRAISE'
    
    # Theme-specific actions
    theme_actions = {
        'Performance': 'To recover performance, try clearing the app cache (Settings → Apps → McAfee → Clear Cache).',
        'VPN': 'For VPN issues, try toggling it off and back on. Our specialists at 1-866-622-3911 can help.',
        'Customer Support': 'We take every support interaction seriously. Please share your case number so we can follow up.',
        'Pricing': 'Our billing team at 1-866-622-3911 can review your account and clarify any charges.',
        'Auto-Renewal': 'You can manage auto-renewal at mcafee.com/myaccount or call 1-866-622-3911.',
        'Pop-ups/Ads': 'Disable alerts under McAfee → Settings → General → turn off "Product announcements".',
        'Installation': 'Use our Removal Tool at download.mcafee.com/mcpR.aspx, then reinstall fresh.',
        'App Issues': 'Try clearing the app cache or contact us at mcafee.com/support.',
    }
    
    action = "Please reach out at mcafee.com/support or call 1-866-622-3911."
    for theme in themes:
        if theme in theme_actions:
            action = theme_actions[theme]
            break
    
    # Generate based on quality tag
    if quality == 'NO RESPONSE':
        if intent == 'PRAISE':
            return hi + "Thank you so much for the kind words! We're thrilled you're enjoying McAfee's protection."
        elif intent == 'NEUTRAL':
            return hi + "Thanks for trying McAfee! Have you explored features like our VPN, Dark Web Monitoring, or Identity Theft Protection?"
        elif intent == 'FEEDBACK':
            return hi + "Thank you for sharing your feedback! We'd love to know: what would make your experience a 5-star one?"
        else:  # COMPLAINT
            return hi + f"We sincerely apologize for the silence. {action} We would love the chance to make this right."
    
    elif quality == 'UNWARRANTED APOLOGY':
        if intent == 'NEUTRAL':
            if any(w in content for w in ['daughter', 'son', 'child', 'family']):
                return hi + "Thanks for choosing McAfee to protect your family! 🛡️ Features worth exploring: VPN, Dark Web Monitoring, Safe Family."
            return hi + "Thanks for trying McAfee! We want to make sure you're getting the most from your protection."
        return hi + f"Thank you for the {rating}-star review! We really appreciate your feedback."
    
    elif quality == 'HIGH RATING + APOLOGY':
        return hi + f"Thank you for the {rating}-star review! We really appreciate your feedback."
    
    elif quality == 'LOW RATING + NO EMPATHY':
        return hi + f"We are truly sorry your experience fell short. {action} We are committed to turning this around."
    
    elif quality == 'GENERIC TEMPLATE':
        if intent == 'NEUTRAL':
            return hi + "Thanks for trying McAfee! Have you explored all the features included with your subscription?"
        return hi + f"You deserve a real answer, not a copy-paste. {action}"
    
    elif quality == 'NO SOLUTION':
        return hi + f"We hear you, and we owe you a concrete solution. {action}"
    
    elif quality == 'WRONG ISSUE':
        focus = themes[0] if themes else 'your concern'
        return hi + f"We want to make sure we are helping with {focus}. {action}"
    
    return None

# Process reviews
added_count = 0
for review in data['recent_reviews']:
    suggested = generate_suggested_reply(review)
    review['suggested_reply'] = suggested
    if suggested:
        added_count += 1

print(f"Total reviews: {len(data['recent_reviews'])}")
print(f"Reviews with suggested replies: {added_count}")
print(f"Percentage: {added_count/len(data['recent_reviews'])*100:.1f}%")

# Save
with open('docs/data/dashboard_data.json', 'w') as f:
    json.dump(data, f, indent=2)

print(f"\n✅ Suggested replies added to docs/data/dashboard_data.json")
print(f"   Refresh localhost:8888 to see 💡 Suggested Better Reply")
