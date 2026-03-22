#!/usr/bin/env python3
"""
Experiment 012: Pricing vs Auto-Renewal Separation

HYPOTHESIS: Auto-renewal complaints are distinct from general pricing complaints
- "Too expensive" → Pricing
- "Charged without notice" → Auto-Renewal (specific billing issue)
- "Auto-renewal scam" → Auto-Renewal

CHANGE: Separate Auto-Renewal as standalone theme with specific keywords
"""

from typing import List, Dict

# Current: Pricing includes auto-renewal keywords
BASELINE_KEYWORDS = {
    'Pricing': ['price', 'cost', 'expensive', 'cheap', 'money', 'subscription', 
                'charge', 'charged', 'billing', 'payment', 'fee', 'renew', 
                'renewal', 'refund', 'auto-renew', 'auto renew'],
}

# Improved: Separate themes
IMPROVED_KEYWORDS = {
    'Pricing': {
        'cost': ['price', 'cost', 'expensive', 'cheap', 'money', 'worth', 'value'],
        'subscription': ['subscription', 'fee', 'payment', 'billing', 'pricing'],
    },
    'Auto-Renewal': {
        'direct': ['auto-renew', 'auto renew', 'autorenew', 'auto-renewal', 
                   'automatic renewal', 'automatic renew'],
        'surprise': ['charged without notice', 'charged without warning', 
                     'didnt know', "didn't know", 'never agreed', 'without consent',
                     'unexpected charge', 'surprise charge', 'sudden charge'],
        'cancellation': ['hard to cancel', 'impossible to cancel', 'cant cancel', 
                        "can't cancel", 'cancel subscription', 'cancellation'],
        'refund': ['refund', 'money back', 'get my money', 'unauthorized charge'],
    }
}


def analyze_themes_baseline(content: str) -> List[str]:
    content_lower = content.lower()
    themes = []
    
    for keyword in BASELINE_KEYWORDS['Pricing']:
        if keyword in content_lower:
            themes.append('Pricing')
            break
    
    return themes


def analyze_themes_improved(content: str) -> List[str]:
    content_lower = content.lower()
    themes = []
    
    # Check Auto-Renewal first (more specific)
    auto_renewal_match = False
    for category in ['direct', 'surprise', 'cancellation', 'refund']:
        for keyword in IMPROVED_KEYWORDS['Auto-Renewal'][category]:
            if keyword in content_lower:
                themes.append('Auto-Renewal')
                auto_renewal_match = True
                break
        if auto_renewal_match:
            break
    
    # Check Pricing (if not already tagged as Auto-Renewal, or can have both)
    pricing_match = False
    for category in ['cost', 'subscription']:
        for keyword in IMPROVED_KEYWORDS['Pricing'][category]:
            if keyword in content_lower:
                themes.append('Pricing')
                pricing_match = True
                break
        if pricing_match:
            break
    
    return themes


TEST_CASES = [
    # AUTO-RENEWAL SPECIFIC
    {"id": "ar_001", "content": "Auto-renewal charged me without notice", "expected": ["Auto-Renewal"], "not_expected": []},
    {"id": "ar_002", "content": "Didn't know it would auto renew, want refund", "expected": ["Auto-Renewal", "Pricing"], "not_expected": []},
    {"id": "ar_003", "content": "Impossible to cancel the auto-renewal subscription", "expected": ["Auto-Renewal"], "not_expected": []},
    {"id": "ar_004", "content": "Charged without warning, this is a scam", "expected": ["Auto-Renewal"], "not_expected": []},
    {"id": "ar_005", "content": "Automatic renewal took money from my account", "expected": ["Auto-Renewal"], "not_expected": []},
    
    # PRICING ONLY (not auto-renewal)
    {"id": "price_001", "content": "Too expensive compared to competitors", "expected": ["Pricing"], "not_expected": ["Auto-Renewal"]},
    {"id": "price_002", "content": "Price is too high for what you get", "expected": ["Pricing"], "not_expected": ["Auto-Renewal"]},
    {"id": "price_003", "content": "Subscription cost is not worth it", "expected": ["Pricing"], "not_expected": ["Auto-Renewal"]},
    {"id": "price_004", "content": "Billing is confusing but not auto-renewal issue", "expected": ["Pricing"], "not_expected": ["Auto-Renewal"]},
    
    # BOTH
    {"id": "both_001", "content": "Auto-renewal charged me and price is too high", "expected": ["Auto-Renewal", "Pricing"], "not_expected": []},
]


def evaluate_classifier(test_cases, classifier_fn, name):
    correct = 0
    total = len(test_cases)
    errors = []
    
    for case in test_cases:
        predicted = set(classifier_fn(case['content']))
        expected = set(case['expected'])
        not_expected = set(case.get('not_expected', []))
        
        has_all_expected = expected.issubset(predicted)
        has_unexpected = len(not_expected.intersection(predicted)) > 0
        
        if has_all_expected and not has_unexpected:
            correct += 1
        else:
            errors.append(f"  FAIL: {case['id']}")
            errors.append(f"        Expected: {expected}, Got: {predicted}")
    
    accuracy = correct / total
    print(f"\n{'='*60}")
    print(f"RESULTS: {name}")
    print(f"{'='*60}")
    print(f"Correct: {correct}/{total}")
    print(f"Accuracy: {accuracy:.3f}")
    
    if errors:
        print("\nErrors:")
        for e in errors:
            print(e)
    
    return accuracy


def main():
    print("="*60)
    print("EXPERIMENT 012: Pricing vs Auto-Renewal Separation")
    print("="*60)
    
    baseline = evaluate_classifier(TEST_CASES, analyze_themes_baseline, "BASELINE")
    improved = evaluate_classifier(TEST_CASES, analyze_themes_improved, "IMPROVED")
    
    print(f"\n{'='*60}")
    print("COMPARISON")
    print(f"Baseline: {baseline:.3f}")
    print(f"Improved: {improved:.3f}")
    print(f"Change: {improved - baseline:+.3f}")
    
    if improved > baseline:
        print("\n✅ EXPERIMENT SUCCESSFUL")
    else:
        print("\n❌ EXPERIMENT FAILED")


if __name__ == '__main__':
    main()
