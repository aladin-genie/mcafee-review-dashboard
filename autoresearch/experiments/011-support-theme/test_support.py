#!/usr/bin/env python3
"""
Experiment 011: Support Theme Accuracy Improvement

HYPOTHESIS: "help" is too generic - catches "this helps me" not just "need help"
- "Very helpful app" → NOT Support (positive app comment)
- "Customer support was rude" → Support (actual support complaint)
- "I need help with billing" → Support (support request)

CHANGE: Require support-specific context for "help" keyword
"""

from typing import List, Dict

BASELINE_KEYWORDS = ['support', 'service', 'help', 'contact', 'response', 'customer']

IMPROVED_KEYWORDS = {
    'Support': {
        'direct': ['customer support', 'tech support', 'technical support', 'support team',
                   'support agent', 'support rep', 'customer service'],
        'contact': ['contacted support', 'called support', 'emailed support', 
                    'reach support', 'support ticket', 'support case'],
        'quality': ['rude', 'unhelpful', 'unresponsive', 'ignored', 'never responded',
                    'terrible support', 'bad support', 'poor support', 'awful service'],
        # Generic "help" needs support context
        'contextual': ['help'],
    }
}

# Context that indicates support-related help vs general help
SUPPORT_CONTEXT = [
    'support', 'customer service', 'representative', 'agent', 'rep',
    'called', 'emailed', 'contacted', 'reached out', 'ticket', 'case',
    'response', 'responded', 'answer', 'resolved', 'resolution'
]

# Positive contexts that indicate NOT a support complaint
POSITIVE_HELP = [
    'helps me', 'very helpful', 'really helpful', 'extremely helpful',
    'helpful app', 'helpful feature', 'helped me', 'helping me'
]


def analyze_themes_baseline(content: str) -> List[str]:
    content_lower = content.lower()
    themes = []
    for keyword in BASELINE_KEYWORDS:
        if keyword in content_lower:
            themes.append('Customer Support')
            break
    return themes


def analyze_themes_improved(content: str) -> List[str]:
    content_lower = content.lower()
    themes = []
    
    # Check direct keywords (high confidence)
    for keyword in IMPROVED_KEYWORDS['Support']['direct']:
        if keyword in content_lower:
            themes.append('Customer Support')
            return themes
    
    # Check contact keywords
    for keyword in IMPROVED_KEYWORDS['Support']['contact']:
        if keyword in content_lower:
            themes.append('Customer Support')
            return themes
    
    # Check quality keywords
    for keyword in IMPROVED_KEYWORDS['Support']['quality']:
        if keyword in content_lower:
            themes.append('Customer Support')
            return themes
    
    # Handle "help" with context check
    if 'help' in content_lower:
        # Check if it's a positive "helpful" comment
        for pos in POSITIVE_HELP:
            if pos in content_lower:
                return themes  # Don't tag
        
        # Check for support context
        for ctx in SUPPORT_CONTEXT:
            if ctx in content_lower:
                themes.append('Customer Support')
                return themes
    
    return themes


TEST_CASES = [
    # TRUE POSITIVES (should be Support)
    {"id": "sup_001", "content": "Customer support was rude and unhelpful", "expected": True, "reason": "Support quality complaint"},
    {"id": "sup_002", "content": "I contacted support but never got a response", "expected": True, "reason": "Contacted support + no response"},
    {"id": "sup_003", "content": "Tech support couldn't solve my problem", "expected": True, "reason": "Tech support mention"},
    {"id": "sup_004", "content": "Called customer service and they were terrible", "expected": True, "reason": "Customer service call"},
    {"id": "sup_005", "content": "Support ticket still open after 2 weeks", "expected": True, "reason": "Support ticket"},
    {"id": "sup_006", "content": "The agent was unresponsive and ignored me", "expected": True, "reason": "Agent unresponsive"},
    
    # FALSE POSITIVES TO AVOID
    {"id": "sup_fp_001", "content": "Very helpful app, protects me well", "expected": False, "reason": "Positive 'helpful' - not support"},
    {"id": "sup_fp_002", "content": "This feature really helps me stay safe", "expected": False, "reason": "Feature helps - not support"},
    {"id": "sup_fp_003", "content": "Helpful protection against viruses", "expected": False, "reason": "Helpful protection - not support"},
    {"id": "sup_fp_004", "content": "Customer interface is easy to use", "expected": False, "reason": "Customer + interface, not support"},
    {"id": "sup_fp_005", "content": "Great service overall, very satisfied", "expected": False, "reason": "Generic 'service' praise"},
    {"id": "sup_fp_006", "content": "Response time is fast for scans", "expected": False, "reason": "Response = app response, not support"},
    
    # EDGE CASES
    {"id": "sup_edge_001", "content": "Need help understanding this feature", "expected": True, "reason": "Need help = support request"},
]


def evaluate_classifier(test_cases, classifier_fn, name):
    tp = fp = tn = fn = 0
    errors = []
    
    for case in test_cases:
        predicted = len(classifier_fn(case['content'])) > 0
        expected = case['expected']
        
        if predicted and expected: tp += 1
        elif predicted and not expected: 
            fp += 1
            errors.append(f"  FP: {case['id']} - {case['reason']}")
        elif not predicted and not expected: tn += 1
        else: 
            fn += 1
            errors.append(f"  FN: {case['id']} - {case['reason']}")
    
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
    
    print(f"\n{'='*60}")
    print(f"RESULTS: {name}")
    print(f"{'='*60}")
    print(f"TP: {tp} | FP: {fp} | TN: {tn} | FN: {fn}")
    print(f"Precision: {precision:.3f}")
    print(f"Recall:    {recall:.3f}")
    print(f"F1 Score:  {f1:.3f}")
    
    if errors:
        print("\nErrors:")
        for e in errors[:8]:
            print(e)
    
    return f1


def main():
    print("="*60)
    print("EXPERIMENT 011: Support Theme Accuracy")
    print("="*60)
    
    baseline = evaluate_classifier(TEST_CASES, analyze_themes_baseline, "BASELINE")
    improved = evaluate_classifier(TEST_CASES, analyze_themes_improved, "IMPROVED")
    
    print(f"\n{'='*60}")
    print("COMPARISON")
    print(f"Baseline F1: {baseline:.3f}")
    print(f"Improved F1: {improved:.3f}")
    print(f"Change: {improved - baseline:+.3f}")
    
    if improved > baseline:
        print("\n✅ EXPERIMENT SUCCESSFUL")
    else:
        print("\n❌ EXPERIMENT FAILED")


if __name__ == '__main__':
    main()
