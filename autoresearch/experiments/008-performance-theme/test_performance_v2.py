#!/usr/bin/env python3
"""
Experiment 008b: Performance Theme Precision - REFINED

Iteration 2: Fix remaining false negatives and false positives.
"""

import json
import re
from typing import List, Dict, Tuple

# ═══════════════════════════════════════════════════════════════════════════
# REFINED KEYWORDS (Iteration 2)
# ═══════════════════════════════════════════════════════════════════════════

IMPROVED_KEYWORDS = {
    'Performance': {
        # Direct performance complaints - high confidence
        'strong': ['slow', 'lag', 'lags', 'freeze', 'freezes', 'frozen', 'sluggish', 'unresponsive', 'hangs', 'hanging', 'stuck'],
        # Context-dependent - need negative context
        'contextual': ['battery', 'drain', 'memory', 'cpu', 'ram'],
        # Speed/performance mentions - need explicit negative context
        'neutral': ['speed', 'performance'],
    }
}

# Expanded context patterns
NEGATIVE_CONTEXT = [
    # Battery/Resource drain
    'drain', 'drains', 'draining', 'eats', 'consumes', 'eating', 'consuming',
    'uses too much', 'using too much', 'kills', 'wastes', 'wasting', 
    'hog', 'hogs', 'hogging', 'hungry', 'thirsty',
    # Speed issues
    'slow', 'slows', 'slowing', 'slower', 'slowed', 'sluggish',
    'fast', 'faster',  # In comparative negative context: "was fast, now slow"
    # Freezing/crashing
    'freeze', 'freezes', 'freezing', 'frozen', 'hang', 'hangs', 'hanging',
    'crash', 'crashes', 'crashing', 'not responding', 'unresponsive',
    # General negative
    'worse', 'worst', 'terrible', 'horrible', 'bad', 'awful',
    'problem', 'issues', 'issue', 'trouble', 'difficult'
]

POSITIVE_CONTEXT = [
    # Battery/resource efficiency
    'saves', 'saving', 'saver', 'efficient', 'efficiency', 'optimized', 'improved',
    'less', 'low', 'minimal', 'lower', 'reduce', 'reduced',
    # Performance positive
    'better', 'faster', 'boost', 'boosts', 'enhance', 'enhanced', 'great',
    'good', 'amazing', 'excellent', 'impressive',
    # Negation of negative
    'does not slow', 'doesnt slow', "doesn't slow",
    'does not drain', 'doesnt drain', "doesn't drain",
    'does not lag', 'doesnt lag', "doesn't lag",
    'does not freeze', 'doesnt freeze', "doesn't freeze",
    'no lag', 'no slowdown', 'no slow down', 'no drain', 'no impact',
    'not slow', 'not sluggish', 'not laggy', 'not a problem',
    'without slowing', 'without lag', 'without drain'
]

# Special patterns - explicit positive battery mentions
BATTERY_POSITIVE_PATTERNS = [
    r'battery saver',
    r'battery saving',
    r'saves battery',
    r'less battery',
    r'low battery usage',
    r'minimal battery',
    r'efficient.*battery',
    r'battery.*efficient',
]

# Special patterns - explicit negative battery mentions  
BATTERY_NEGATIVE_PATTERNS = [
    r'battery drain',
    r'drains? battery',
    r'eats.*battery',
    r'kills.*battery',
    r'battery.*fast',
    r'battery.*quick',
]


def analyze_themes_improved_v2(content: str) -> List[str]:
    """
    Refined implementation with better context detection.
    """
    content_lower = content.lower()
    themes = []
    
    keywords = IMPROVED_KEYWORDS['Performance']
    
    # 1. Check strong keywords (always tag)
    for keyword in keywords['strong']:
        if keyword in content_lower:
            themes.append('Performance')
            return themes
    
    # 2. Check contextual keywords with special handling
    for keyword in keywords['contextual']:
        if keyword in content_lower:
            # Special battery detection
            if keyword == 'battery':
                if has_battery_negative_pattern(content_lower):
                    themes.append('Performance')
                    return themes
                if has_battery_positive_pattern(content_lower):
                    continue  # Skip - positive battery mention
            
            # General negative context check
            if has_negative_context_v2(content_lower, keyword):
                themes.append('Performance')
                return themes
            
            # Check for explicit positive context (exclude)
            if has_positive_context_v2(content_lower, keyword):
                continue  # Don't tag
    
    # 3. Check neutral keywords (need explicit negative context)
    for keyword in keywords['neutral']:
        if keyword in content_lower:
            if has_negative_context_v2(content_lower, keyword):
                themes.append('Performance')
                return themes
    
    return themes


def has_battery_negative_pattern(text: str) -> bool:
    """Check for explicit battery drain complaints"""
    for pattern in BATTERY_NEGATIVE_PATTERNS:
        if re.search(pattern, text):
            return True
    return False


def has_battery_positive_pattern(text: str) -> bool:
    """Check for explicit battery efficiency praise"""
    for pattern in BATTERY_POSITIVE_PATTERNS:
        if re.search(pattern, text):
            return True
    return False


def has_negative_context_v2(text: str, keyword: str, window: int = 12) -> bool:
    """Check for negative context with expanded window and patterns"""
    words = text.split()
    
    for i, word in enumerate(words):
        if keyword in word:
            start = max(0, i - window)
            end = min(len(words), i + window + 1)
            context = ' '.join(words[start:end])
            
            for neg in NEGATIVE_CONTEXT:
                if neg in context:
                    return True
    
    return False


def has_positive_context_v2(text: str, keyword: str, window: int = 12) -> bool:
    """Check for positive context with expanded window"""
    words = text.split()
    
    for i, word in enumerate(words):
        if keyword in word:
            start = max(0, i - window)
            end = min(len(words), i + window + 1)
            context = ' '.join(words[start:end])
            
            for pos in POSITIVE_CONTEXT:
                if pos in context:
                    return True
    
    return False


# ═══════════════════════════════════════════════════════════════════════════
# TEST CASES (same as v1)
# ═══════════════════════════════════════════════════════════════════════════

TEST_CASES = [
    # TRUE POSITIVES
    {"id": "perf_001", "content": "This app is so slow it takes forever to open anything", "expected": True, "reason": "Strong keyword 'slow'"},
    {"id": "perf_002", "content": "Phone lags constantly since installing McAfee", "expected": True, "reason": "Strong keyword 'lags'"},
    {"id": "perf_003", "content": "Battery drains so fast now, barely lasts half a day", "expected": True, "reason": "Contextual 'battery' + negative 'drains'"},
    {"id": "perf_004", "content": "Uses too much memory, phone keeps freezing up", "expected": True, "reason": "Contextual 'memory' + negative 'freezing'"},
    {"id": "perf_005", "content": "CPU usage is through the roof, makes everything sluggish", "expected": True, "reason": "Contextual 'CPU' + negative 'sluggish'"},
    {"id": "perf_006", "content": "Speed has gotten worse after the update, very disappointed", "expected": True, "reason": "Neutral 'speed' + negative 'worse'"},
    {"id": "perf_007", "content": "Performance was good before but now it slows down my games", "expected": True, "reason": "Neutral 'performance' + negative 'slows down'"},
    
    # FALSE POSITIVES TO ELIMINATE
    {"id": "perf_fp_001", "content": "Love the battery saver feature, really helps extend life", "expected": False, "reason": "Positive 'battery' mention - battery saver is good"},
    {"id": "perf_fp_002", "content": "Great app that doesn't drain battery like others", "expected": False, "reason": "Positive context - doesn't drain"},
    {"id": "perf_fp_003", "content": "Fast scanning and improved performance over previous version", "expected": False, "reason": "Positive 'performance' mention"},
    {"id": "perf_fp_004", "content": "Speed is amazing, no lag at all on my phone", "expected": False, "reason": "Positive 'speed' mention with 'no lag'"},
    {"id": "perf_fp_005", "content": "Memory efficient app that doesn't slow down my device", "expected": False, "reason": "Positive 'memory' context - efficient"},
    {"id": "perf_fp_006", "content": "Uses less battery than Norton, very efficient protection", "expected": False, "reason": "Comparative positive - uses less battery"},
    {"id": "perf_fp_007", "content": "Good performance and fast scanning capabilities", "expected": False, "reason": "Positive 'performance' with 'good'"},
    {"id": "perf_fp_008", "content": "No impact on battery life, works silently in background", "expected": False, "reason": "Explicit positive - 'no impact'"},
    
    # EDGE CASES
    {"id": "perf_edge_001", "content": "Battery usage is acceptable, not great but not terrible", "expected": False, "reason": "Neutral mention, no clear complaint"},
    {"id": "perf_edge_002", "content": "Speed could be better but it's not slow", "expected": False, "reason": "Mixed but leans positive ('not slow')"},
]


# ═══════════════════════════════════════════════════════════════════════════
# EVALUATION (same structure)
# ═══════════════════════════════════════════════════════════════════════════

def evaluate_classifier(test_cases, classifier_fn, name):
    tp = fp = tn = fn = 0
    errors = []
    
    for case in test_cases:
        predicted = len(classifier_fn(case['content'])) > 0
        expected = case['expected']
        
        if predicted and expected:
            tp += 1
        elif predicted and not expected:
            fp += 1
            errors.append(f"  FP: {case['id']} - {case['reason']}")
        elif not predicted and not expected:
            tn += 1
        else:
            fn += 1
            errors.append(f"  FN: {case['id']} - {case['reason']}")
    
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
    accuracy = (tp + tn) / len(test_cases)
    
    print(f"\n{'='*60}")
    print(f"RESULTS: {name}")
    print(f"{'='*60}")
    print(f"TP: {tp} | FP: {fp} | TN: {tn} | FN: {fn}")
    print(f"Precision: {precision:.3f}")
    print(f"Recall:    {recall:.3f}")
    print(f"F1 Score:  {f1:.3f}")
    print(f"Accuracy:  {accuracy:.3f}")
    
    if errors:
        print(f"\nErrors:")
        for error in errors:
            print(error)
    
    return {'name': name, 'f1': f1, 'precision': precision, 'recall': recall, 'accuracy': accuracy}


def main():
    print("="*60)
    print("EXPERIMENT 008b: Performance Theme - REFINED")
    print("="*60)
    
    # Import baseline from v1
    import sys
    sys.path.insert(0, '.')
    from test_performance import analyze_themes_baseline
    
    baseline = evaluate_classifier(TEST_CASES, analyze_themes_baseline, "BASELINE")
    improved = evaluate_classifier(TEST_CASES, analyze_themes_improved_v2, "IMPROVED v2")
    
    print(f"\n{'='*60}")
    print("COMPARISON")
    print(f"{'='*60}")
    print(f"Baseline F1: {baseline['f1']:.3f}")
    print(f"Improved F1: {improved['f1']:.3f}")
    print(f"Change: {improved['f1'] - baseline['f1']:+.3f}")
    
    if improved['f1'] > baseline['f1']:
        print("\n✅ IMPROVEMENT - Keep the changes")
        return True
    else:
        print("\n❌ NO IMPROVEMENT - Revert")
        return False


if __name__ == '__main__':
    main()
