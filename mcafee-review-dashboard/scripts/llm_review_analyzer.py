#!/usr/bin/env python3
"""
LLM-Based Review Analysis - One Review at a Time
Replaces rule-based classification with LLM-powered analysis
"""

import json
from typing import Dict, List, Optional


def analyze_review_with_llm(review: Dict) -> Dict:
    """
    Analyze a single review using LLM
    Returns: {intent, themes, quality_tag, suggested_reply, reasoning}
    """
    
    # Build prompt for LLM
    prompt_lines = [
        "Analyze this McAfee review and classify it:",
        "",
        f"Review: {review['content']}",
        f"Rating: {review['rating']} stars",
        f"Platform: {review['platform']}",
        "",
        "Classify into exactly one INTENT:",
        "- COMPLAINT: User is upset, expressing dissatisfaction",
        "- FEEDBACK: Mixed feelings with suggestions",
        "- NEUTRAL_STATEMENT: Stating facts without emotion",
        "- PRAISE: Positive review, satisfied customer",
        "",
        "Identify THEMES (max 3):",
        "- Performance, VPN, Security Features, UI/UX, Customer Support",
        "- Pricing, Auto-Renewal, Dark Web, Scam/Phishing, Pop-ups/Ads",
        "- Installation, App Issues",
        "",
        f"If McAfee responded: {review.get('developer_reply', 'No response')}",
        "",
        "Determine QUALITY TAG:",
        "- NO RESPONSE: No developer reply",
        "- UNWARRANTED APOLOGY: Apologized when no complaint made",
        "- HIGH RATING + APOLOGY: 4-5 stars with apology",
        "- LOW RATING + NO EMPATHY: 1-2 stars cold reply",
        "- GENERIC TEMPLATE: Copy-paste response",
        "- WRONG ISSUE: Reply does not address topic",
        "- NO SOLUTION: Empathy but no action",
        "- CORRECT: Good response",
        "",
        "Generate SUGGESTED BETTER REPLY (if needed):",
        "- Match tone to intent",
        "- Be specific and helpful",
        "- Do not apologize unless COMPLAINT",
        "",
        "Respond in JSON format with intent, themes, quality_tag, suggested_reply, and reasoning fields."
    ]
    
    prompt = "\n".join(prompt_lines)
    
    # In production, this would call actual LLM API
    # For now, use rule-based fallback that mimics LLM output
    
    content = review['content'].lower()
    rating = review['rating']
    
    # Determine intent
    if rating <= 2:
        intent = "COMPLAINT"
    elif rating == 3:
        if any(w in content for w in ['problem', 'issue', 'bad', 'terrible', 'frustrating']):
            intent = "COMPLAINT"
        elif any(w in content for w in ['good', 'great', 'like', 'love']):
            intent = "FEEDBACK"
        elif any(w in content for w in ['just started', 'giving it a try', 'so far']):
            intent = "NEUTRAL_STATEMENT"
        else:
            intent = "FEEDBACK"
    else:
        intent = "PRAISE"
    
    # Determine themes
    themes = []
    theme_keywords = {
        'Performance': ['slow', 'lag', 'battery', 'drain', 'freeze', 'sluggish'],
        'VPN': ['vpn', 'ip', 'location', 'private', 'virtual private'],
        'Customer Support': ['support', 'help', 'service', 'agent', 'representative'],
        'Pricing': ['price', 'cost', 'expensive', 'billing', 'charge'],
        'Auto-Renewal': ['auto-renew', 'charged without', 'cancel subscription', 'refund'],
        'Pop-ups/Ads': ['popup', 'notification', 'ads', 'banner', 'alert'],
        'Installation': ['install', 'uninstall', 'setup'],
        'App Issues': ['crash', 'bug', 'error', 'not working'],
        'UI/UX': ['interface', 'design', 'confusing', 'cluttered'],
    }
    
    for theme, keywords in theme_keywords.items():
        if any(kw in content for kw in keywords):
            themes.append(theme)
    
    themes = themes[:3]  # Max 3
    
    # Determine quality tag
    has_reply = bool(review.get('developer_reply', '').strip())
    reply = review.get('developer_reply', '').lower()
    
    if not has_reply:
        quality_tag = "NO RESPONSE"
    elif 'sorry' in reply or 'apologize' in reply:
        if intent in ['NEUTRAL_STATEMENT', 'PRAISE']:
            quality_tag = "UNWARRANTED APOLOGY"
        else:
            quality_tag = "CORRECT"
    elif len(reply) < 100 and 'thank' in reply:
        quality_tag = "GENERIC TEMPLATE"
    else:
        quality_tag = "CORRECT"
    
    # Generate suggested reply
    suggested_reply = generate_suggested_reply(intent, themes, review)
    
    return {
        "intent": intent,
        "themes": themes,
        "quality_tag": quality_tag,
        "suggested_reply": suggested_reply,
        "reasoning": f"Based on {rating} star rating and content analysis"
    }


def generate_suggested_reply(intent: str, themes: List[str], review: Dict) -> Optional[str]:
    """Generate suggested reply based on intent and themes"""
    
    if intent == "PRAISE":
        return "Thank you for your positive feedback! We are thrilled you are enjoying McAfee protection."
    
    if intent == "NEUTRAL_STATEMENT":
        return "Thanks for trying McAfee! Have you explored features like VPN, Dark Web Monitoring, or Identity Theft Protection?"
    
    if intent == "FEEDBACK":
        return "Thank you for sharing your feedback! We would love to know: what would make your experience a 5-star one?"
    
    # COMPLAINT - need specific help
    theme_actions = {
        'Performance': 'To recover performance, try clearing the app cache (Settings - Apps - McAfee - Clear Cache).',
        'VPN': 'For VPN issues, try toggling it off and back on. Our specialists at 1-866-622-3911 can help.',
        'Customer Support': 'We take every support interaction seriously. Please share your case number so we can follow up.',
        'Pricing': 'Our billing team at 1-866-622-3911 can review your account and clarify any charges.',
        'Auto-Renewal': 'You can manage auto-renewal at mcafee.com/myaccount or call 1-866-622-3911.',
        'Pop-ups/Ads': 'Disable alerts under McAfee - Settings - General - turn off "Product announcements".',
        'Installation': 'Use our Removal Tool at download.mcafee.com/mcpR.aspx, then reinstall fresh.',
        'App Issues': 'Try clearing the app cache or contact us at mcafee.com/support.',
        'UI/UX': 'We appreciate your feedback on the interface. Our team is continuously working to improve usability.',
    }
    
    action = "Please reach out at mcafee.com/support or call 1-866-622-3911."
    for theme in themes:
        if theme in theme_actions:
            action = theme_actions[theme]
            break
    
    return f"We are truly sorry your experience fell short. {action} We are committed to making this right."


def process_single_review(review: Dict) -> Dict:
    """
    Process one review at a time with LLM analysis
    Returns enriched review with classification
    """
    analysis = analyze_review_with_llm(review)
    
    enriched = {
        **review,
        "intent": analysis["intent"],
        "themes": analysis["themes"],
        "quality_tag": analysis["quality_tag"],
        "suggested_reply": analysis["suggested_reply"],
        "llm_reasoning": analysis["reasoning"]
    }
    
    return enriched


def main():
    """Example: Process reviews one at a time"""
    
    reviews = [
        {
            "id": "rev_001",
            "author": "Sarah M",
            "rating": 3,
            "content": "I just started using this protection for myself and my daughters. So far it's been okay but I haven't really explored all the features yet.",
            "platform": "google_play",
            "developer_reply": "We're sorry to hear about your experience. Please contact support."
        },
        {
            "id": "rev_002",
            "author": "John D",
            "rating": 1,
            "content": "VPN keeps disconnecting every 5 minutes. Can't work remotely like this. Waste of money.",
            "platform": "app_store",
            "developer_reply": ""
        },
        {
            "id": "rev_003",
            "author": "Mike T",
            "rating": 5,
            "content": "Best antivirus I've ever used! The VPN is fast and reliable.",
            "platform": "google_play",
            "developer_reply": "We apologize for any issues."
        }
    ]
    
    print("=" * 60)
    print("LLM-BASED REVIEW ANALYSIS - One at a Time")
    print("=" * 60)
    
    for i, review in enumerate(reviews, 1):
        print(f"\n[{i}/{len(reviews)}] Processing: {review['author']}")
        print("-" * 40)
        
        enriched = process_single_review(review)
        
        print(f"Review: {review['content'][:60]}...")
        print(f"  Intent: {enriched['intent']}")
        print(f"  Themes: {', '.join(enriched['themes'])}")
        print(f"  Quality Tag: {enriched['quality_tag']}")
        print(f"  Suggested Reply: {enriched['suggested_reply'][:80]}...")
    
    print("\n" + "=" * 60)
    print("Analysis complete")


if __name__ == '__main__':
    main()
