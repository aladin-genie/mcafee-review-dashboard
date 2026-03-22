#!/usr/bin/env python3
"""
Re-analyze existing dashboard_data.json with improved theme detection
Updates the JSON file with new classifications from autoresearch experiments
"""

import json
from datetime import datetime

# Load existing data
with open('docs/data/dashboard_data.json', 'r') as f:
    data = json.load(f)

print("="*60)
print("RE-ANALYZING REVIEWS WITH IMPROVED THEME DETECTION")
print("="*60)
print(f"Total reviews to process: {len(data['recent_reviews'])}")

# IMPROVED THEME DETECTION (from Experiments 008-012)
def analyze_themes_improved(content):
    """Improved theme detection with context awareness"""
    content_lower = content.lower()
    themes = []
    
    # PERFORMANCE (Exp 008) - Context-aware
    def has_performance_issue(text):
        strong = ['slow', 'lag', 'lags', 'freeze', 'freezes', 'frozen', 
                  'sluggish', 'unresponsive', 'hangs', 'hanging', 'stuck']
        if any(kw in text for kw in strong):
            return True
        
        contextual = ['battery', 'drain', 'memory', 'cpu', 'ram']
        negative = ['drain', 'drains', 'draining', 'eats', 'consumes', 'kills',
                    'wastes', 'hog', 'hogs', 'slow', 'slows', 'slower', 'freeze',
                    'freezes', 'worse', 'terrible', 'bad', 'problem', 'issues']
        
        for kw in contextual:
            if kw in text:
                idx = text.find(kw)
                window = text[max(0, idx-50):min(len(text), idx+50)]
                if any(neg in window for neg in negative):
                    return True
        
        neutral = ['speed', 'performance']
        for kw in neutral:
            if kw in text:
                idx = text.find(kw)
                window = text[max(0, idx-50):min(len(text), idx+50)]
                if any(neg in window for neg in negative):
                    return True
        return False
    
    if has_performance_issue(content_lower):
        themes.append('Performance')
    
    # VPN (Exp 009) - Expanded
    vpn_keywords = {
        'direct': ['vpn', 'virtual private network', 'virtual private'],
        'ip_related': ['ip hiding', 'hide my ip', 'hide ip', 'mask ip', 'ip mask'],
        'location': ['change location', 'location masking', 'fake location', 'geo location'],
        'connection': ['secure connection', 'private connection', 'encrypted connection'],
        'browsing': ['private browsing', 'anonymous browsing', 'hide browsing'],
    }
    exclude = ['no vpn', 'without vpn', 'disconnected from vpn', 'never use']
    if not any(e in content_lower for e in exclude):
        for keywords in vpn_keywords.values():
            if any(kw in content_lower for kw in keywords):
                themes.append('VPN')
                break
    
    # POP-UPS/ADS (Exp 010) - Check before UI/UX
    popup_keywords = ['popup', 'pop-up', 'pop-ups', 'pop up', 'notification', 'banner', 
                      'interstitial', 'alert', 'ads', 'advertisement', 'promo', 'upsell']
    if any(kw in content_lower for kw in popup_keywords):
        themes.append('Pop-ups/Ads')
    
    # UI/UX (Exp 010)
    if "Pop-ups/Ads" not in themes:
        ui_keywords = ['interface', 'design', 'ui', 'user interface', 'layout', 'navigation',
                       'menu', 'menus', 'button', 'screen', 'confusing', 'cluttered', 
                       'hard to use', 'difficult to use']
        if any(kw in content_lower for kw in ui_keywords):
            themes.append('UI/UX')
    
    # CUSTOMER SUPPORT (Exp 011)
    support_keywords = ['customer support', 'tech support', 'support team', 'support agent',
                        'customer service', 'contacted support', 'called support', 
                        'support ticket', 'rude', 'unhelpful', 'unresponsive']
    if any(kw in content_lower for kw in support_keywords):
        themes.append('Customer Support')
    elif 'help' in content_lower:
        positive_help = ['helps me', 'very helpful', 'really helpful', 'helpful app', 'helped me']
        if not any(pos in content_lower for pos in positive_help):
            support_ctx = ['support', 'representative', 'agent', 'ticket', 'case', 'response']
            if any(ctx in content_lower for ctx in support_ctx):
                themes.append('Customer Support')
    
    # AUTO-RENEWAL (Exp 012)
    auto_renewal = ['auto-renew', 'auto renew', 'automatic renewal', 'charged without notice',
                    'didnt know', 'never agreed', 'hard to cancel', 'impossible to cancel', 'refund']
    if any(kw in content_lower for kw in auto_renewal):
        themes.append('Auto-Renewal')
    
    # PRICING (Exp 012)
    pricing = ['price', 'cost', 'expensive', 'cheap', 'money', 'subscription', 
               'fee', 'payment', 'billing', 'pricing']
    if any(kw in content_lower for kw in pricing):
        themes.append('Pricing')
    
    # OTHER THEMES
    other = {
        'Security Features': ['antivirus', 'protection', 'virus', 'malware', 'safe', 'protect', 'threat'],
        'Dark Web': ['dark web', 'leaked', 'breach', 'monitoring', 'identity theft'],
        'Scam/Phishing': ['scam', 'phishing', 'fraud', 'fake'],
        'Installation': ['install', 'setup', 'uninstall', 'remove', 'bloatware'],
        'App Issues': ['crash', 'bug', 'error', 'not working', 'broken', 'glitch', 'frozen'],
    }
    for theme, keywords in other.items():
        if any(kw in content_lower for kw in keywords):
            themes.append(theme)
    
    return themes[:3]


# Count theme changes
theme_changes = 0
reviews_with_changes = []

# Process each review
for i, review in enumerate(data['recent_reviews']):
    if i % 100 == 0:
        print(f"  Processed {i}/{len(data['recent_reviews'])} reviews...")
    
    old_themes = review.get('themes', [])
    new_themes = analyze_themes_improved(review.get('content', ''))
    
    if set(old_themes) != set(new_themes):
        theme_changes += 1
        reviews_with_changes.append({
            'id': review.get('id', i),
            'old': old_themes,
            'new': new_themes,
            'content': review.get('content', '')[:80] + '...'
        })
    
    review['themes'] = new_themes

print(f"\n{'='*60}")
print("RE-ANALYSIS COMPLETE")
print(f"{'='*60}")
print(f"Total reviews: {len(data['recent_reviews'])}")
print(f"Reviews with theme changes: {theme_changes}")
print(f"Change rate: {theme_changes/len(data['recent_reviews'])*100:.1f}%")

# Show sample changes
if reviews_with_changes:
    print(f"\nSample changes (showing first 5):")
    for change in reviews_with_changes[:5]:
        print(f"  {change['content']}")
        print(f"    Old: {change['old']}")
        print(f"    New: {change['new']}")

# Update metadata
data['metadata']['generated_at'] = datetime.now().isoformat()
data['metadata']['theme_analysis_version'] = '2.0 (Autoresearch Exp 008-012)'

# Save updated data
with open('docs/data/dashboard_data.json', 'w') as f:
    json.dump(data, f, indent=2)

print(f"\n✅ Updated data saved to docs/data/dashboard_data.json")
print(f"   Refresh localhost:8888 to see improvements")
