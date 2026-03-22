#!/usr/bin/env python3
"""
Experiment 010: UI/UX vs Pop-ups/Ads Theme Separation

HYPOTHESIS: "annoying" appears in both themes causing confusion:
- "annoying interface" → UI/UX complaint
- "annoying popups" → Pop-ups/Ads complaint

CURRENT ISSUE: Both themes tagged when user mentions "annoying"

CHANGE: Distinguish between UI complaints vs notification complaints
"""

from typing import List, Dict

BASELINE_KEYWORDS = {
    'UI/UX': ['interface', 'design', 'confusing', 'ui', 'user interface', 'layout', 
              'navigation', 'menu', 'menus', 'cluttered', 'hard to use', 'difficult to use', 
              'usability', 'annoying'],
    'Pop-ups/Ads': ['popup', 'pop-up', 'pop-ups', 'ads', 'advertisement', 'notification', 
                    'banner', 'interstitial', 'promo', 'promotion', 'annoying'],
}

IMPROVED_KEYWORDS = {
    'UI/UX': {
        'direct': ['interface', 'design', 'ui', 'user interface', 'layout', 'navigation', 
                   'menu', 'menus', 'button', 'buttons', 'screen', 'screens'],
        'experience': ['confusing', 'cluttered', 'hard to use', 'difficult to use', 
                       'usability', 'intuitive', 'easy to use'],
        # "annoying" only counts for UI if no popup/notification context
        'contextual': ['annoying', 'frustrating', 'irritating'],
    },
    'Pop-ups/Ads': {
        'direct': ['popup', 'pop-up', 'pop-ups', 'pop up', 'notification', 'notifications',
                   'banner', 'banners', 'interstitial', 'alert', 'alerts'],
        'ads': ['ads', 'advertisement', 'advertising', 'promo', 'promotion', 'promotional',
                'upsell', 'upgrade prompt', 'buy now'],
        'frequency': ['constant', 'frequent', 'too many', 'keeps showing', 'always popping',
                      'every few minutes', 'non-stop'],
    }
}


def analyze_themes_baseline(content: str) -> List[str]:
    """Current implementation - simple keyword matching"""
    content_lower = content.lower()
    themes = []
    
    for keyword in BASELINE_KEYWORDS['UI/UX']:
        if keyword in content_lower:
            themes.append('UI/UX')
            break
    
    for keyword in BASELINE_KEYWORDS['Pop-ups/Ads']:
        if keyword in content_lower:
            themes.append('Pop-ups/Ads')
            break
    
    return themes


def analyze_themes_improved(content: str) -> List[str]:
    """Improved with separation logic"""
    content_lower = content.lower()
    themes = []
    
    # Check Pop-ups/Ads first (more specific)
    popup_match = False
    for category in ['direct', 'ads', 'frequency']:
        for keyword in IMPROVED_KEYWORDS['Pop-ups/Ads'][category]:
            if keyword in content_lower:
                themes.append('Pop-ups/Ads')
                popup_match = True
                break
        if popup_match:
            break
    
    # Check UI/UX
    ui_match = False
    for category in ['direct', 'experience']:
        for keyword in IMPROVED_KEYWORDS['UI/UX'][category]:
            if keyword in content_lower:
                themes.append('UI/UX')
                ui_match = True
                break
        if ui_match:
            break
    
    # Handle contextual words (annoying, frustrating)
    # Only tag if we haven't matched yet, or check context
    if not popup_match and not ui_match:
        contextual = ['annoying', 'frustrating', 'irritating']
        for word in contextual:
            if word in content_lower:
                # Check surrounding context for popup indicators
                idx = content_lower.find(word)
                window = content_lower[max(0, idx-30):min(len(content_lower), idx+30)]
                popup_indicators = ['popup', 'pop-up', 'notification', 'ad', 'banner', 'alert']
                if any(ind in window for ind in popup_indicators):
                    themes.append('Pop-ups/Ads')
                else:
                    themes.append('UI/UX')
                break
    
    return themes


TEST_CASES = [
    # UI/UX COMPLAINTS (should NOT tag as Pop-ups)
    {"id": "ui_001", "content": "The interface is confusing and hard to navigate", "expected": ["UI/UX"], "not_expected": ["Pop-ups/Ads"]},
    {"id": "ui_002", "content": "Menu layout is cluttered and frustrating to use", "expected": ["UI/UX"], "not_expected": ["Pop-ups/Ads"]},
    {"id": "ui_003", "content": "User interface design is terrible, very annoying", "expected": ["UI/UX"], "not_expected": ["Pop-ups/Ads"]},
    {"id": "ui_004", "content": "Buttons are too small and usability is poor", "expected": ["UI/UX"], "not_expected": ["Pop-ups/Ads"]},
    
    # POP-UP COMPLAINTS (should NOT tag as UI/UX unless also UI issue)
    {"id": "popup_001", "content": "Too many popups constantly interrupting me", "expected": ["Pop-ups/Ads"], "not_expected": []},
    {"id": "popup_002", "content": "Notifications are annoying and frequent", "expected": ["Pop-ups/Ads"], "not_expected": []},
    {"id": "popup_003", "content": "Banner ads keep showing up, very frustrating", "expected": ["Pop-ups/Ads"], "not_expected": []},
    {"id": "popup_004", "content": "Upgrade prompts every few minutes, so irritating", "expected": ["Pop-ups/Ads"], "not_expected": []},
    
    # BOTH (legitimate dual tagging)
    {"id": "both_001", "content": "Confusing interface AND annoying popups everywhere", "expected": ["UI/UX", "Pop-ups/Ads"], "not_expected": []},
    
    # EDGE CASES
    {"id": "edge_001", "content": "Annoying app overall", "expected": ["UI/UX"], "not_expected": ["Pop-ups/Ads"]},  # Generic - default to UI
]


def evaluate_classifier(test_cases, classifier_fn, name):
    correct = 0
    total = len(test_cases)
    errors = []
    
    for case in test_cases:
        predicted = set(classifier_fn(case['content']))
        expected = set(case['expected'])
        not_expected = set(case.get('not_expected', []))
        
        # Check if all expected are present
        has_all_expected = expected.issubset(predicted)
        # Check if any not_expected are present
        has_unexpected = len(not_expected.intersection(predicted)) > 0
        
        if has_all_expected and not has_unexpected:
            correct += 1
        else:
            errors.append(f"  FAIL: {case['id']} - {case['content'][:50]}...")
            errors.append(f"        Expected: {expected}, Got: {predicted}")
    
    accuracy = correct / total
    print(f"\n{'='*60}")
    print(f"RESULTS: {name}")
    print(f"{'='*60}")
    print(f"Correct: {correct}/{total}")
    print(f"Accuracy: {accuracy:.3f}")
    
    if errors:
        print("\nErrors:")
        for e in errors[:10]:
            print(e)
    
    return accuracy


def main():
    print("="*60)
    print("EXPERIMENT 010: UI/UX vs Pop-ups/Ads Separation")
    print("="*60)
    
    baseline = evaluate_classifier(TEST_CASES, analyze_themes_baseline, "BASELINE")
    improved = evaluate_classifier(TEST_CASES, analyze_themes_improved, "IMPROVED")
    
    print(f"\n{'='*60}")
    print("COMPARISON")
    print(f"{'='*60}")
    print(f"Baseline: {baseline:.3f}")
    print(f"Improved: {improved:.3f}")
    print(f"Change: {improved - baseline:+.3f}")
    
    if improved > baseline:
        print("\n✅ EXPERIMENT SUCCESSFUL")
    else:
        print("\n❌ EXPERIMENT FAILED")


if __name__ == '__main__':
    main()
