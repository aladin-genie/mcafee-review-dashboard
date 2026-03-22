#!/usr/bin/env python3
"""
Experiment 008: Performance Theme Precision Improvement

HYPOTHESIS: "battery" and "drain" cause false positives when users mention 
"battery saver" or "battery protection" positively.

CHANGE: Add context-aware detection for Performance keywords to distinguish
between complaints ("drains battery") vs neutral/positive mentions ("battery saver").

BASELINE: Current Performance theme detection has F1 = 0.68
TARGET: F1 > 0.77 (matching top-performing themes)
"""

import json
import re
from typing import List, Dict, Tuple

# ═══════════════════════════════════════════════════════════════════════════
# BASELINE THEME KEYWORDS (current implementation)
# ═══════════════════════════════════════════════════════════════════════════

BASELINE_KEYWORDS = {
    'Performance': ['slow', 'fast', 'speed', 'performance', 'lag', 'battery', 'drain', 'memory', 'cpu', 'freeze'],
}

# ═══════════════════════════════════════════════════════════════════════════
# IMPROVED THEME KEYWORDS (Experiment 008)
# ═══════════════════════════════════════════════════════════════════════════

IMPROVED_KEYWORDS = {
    'Performance': {
        # Direct performance complaints - high confidence
        'strong': ['slow', 'lag', 'freeze', 'sluggish', 'unresponsive', 'hangs', 'stuck'],
        # Context-dependent - need negative context
        'contextual': ['battery', 'drain', 'memory', 'cpu', 'ram'],
        # Speed mentions that may be positive
        'neutral': ['speed', 'performance', 'fast'],
    }
}

# Context patterns that indicate a complaint vs neutral/positive
NEGATIVE_CONTEXT = [
    'drain', 'drains', 'draining', 'eats', 'consumes', 'uses too much',
    'kills', 'wastes', 'hog', 'hogs', 'hogging',
    'slow', 'slows', 'slowing', 'slower', 'sluggish',
    'freeze', 'freezes', 'freezing', 'frozen', 'hang', 'hangs', 'hanging',
    'crash', 'crashes', 'crashing', 'not responding', 'unresponsive'
]

POSITIVE_CONTEXT = [
    'saves', 'saving', 'saver', 'efficient', 'optimized', 'improved',
    'better', 'faster', 'boost', 'boosts', 'enhance', 'enhanced',
    'does not slow', 'doesnt slow', 'does not drain', 'doesnt drain',
    'no lag', 'no slowdown', 'no drain', 'no impact'
]

# ═══════════════════════════════════════════════════════════════════════════
# BASELINE CLASSIFIER (current implementation)
# ═══════════════════════════════════════════════════════════════════════════

def analyze_themes_baseline(content: str) -> List[str]:
    """Current baseline implementation - simple keyword matching"""
    content_lower = content.lower()
    themes = []
    
    for keyword in BASELINE_KEYWORDS['Performance']:
        if keyword in content_lower:
            themes.append('Performance')
            break
    
    return themes

# ═══════════════════════════════════════════════════════════════════════════
# IMPROVED CLASSIFIER (Experiment 008)
# ═══════════════════════════════════════════════════════════════════════════

def analyze_themes_improved(content: str) -> List[str]:
    """
    Improved implementation with context-aware detection.
    
    Logic:
    1. Strong keywords always tag as Performance (high confidence)
    2. Contextual keywords need negative context to tag
    3. Neutral keywords need explicit negative context
    """
    content_lower = content.lower()
    themes = []
    
    keywords = IMPROVED_KEYWORDS['Performance']
    
    # 1. Check strong keywords (always tag)
    for keyword in keywords['strong']:
        if keyword in content_lower:
            themes.append('Performance')
            return themes
    
    # 2. Check contextual keywords (need negative context)
    for keyword in keywords['contextual']:
        if keyword in content_lower:
            # Look for negative context within 10 words
            if has_negative_context(content_lower, keyword):
                themes.append('Performance')
                return themes
            # Check for explicit positive context (exclude)
            if has_positive_context(content_lower, keyword):
                return themes  # Don't tag - positive mention
    
    # 3. Check neutral keywords (need explicit negative context)
    for keyword in keywords['neutral']:
        if keyword in content_lower:
            if has_negative_context(content_lower, keyword):
                themes.append('Performance')
                return themes
    
    return themes


def has_negative_context(text: str, keyword: str, window: int = 10) -> bool:
    """Check if there's negative context within window words of keyword"""
    words = text.split()
    
    for i, word in enumerate(words):
        if keyword in word:
            # Get surrounding words
            start = max(0, i - window)
            end = min(len(words), i + window + 1)
            context = ' '.join(words[start:end])
            
            # Check for negative context patterns
            for neg in NEGATIVE_CONTEXT:
                if neg in context:
                    return True
    
    return False


def has_positive_context(text: str, keyword: str, window: int = 10) -> bool:
    """Check if there's positive context within window words of keyword"""
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
# TEST CASES
# ═══════════════════════════════════════════════════════════════════════════

TEST_CASES = [
    # ═════════════════════════════════════════════════════════════════════
    # TRUE POSITIVES (should be tagged as Performance)
    # ═════════════════════════════════════════════════════════════════════
    {
        "id": "perf_001",
        "content": "This app is so slow it takes forever to open anything",
        "expected": True,
        "reason": "Strong keyword 'slow'"
    },
    {
        "id": "perf_002",
        "content": "Phone lags constantly since installing McAfee",
        "expected": True,
        "reason": "Strong keyword 'lags'"
    },
    {
        "id": "perf_003",
        "content": "Battery drains so fast now, barely lasts half a day",
        "expected": True,
        "reason": "Contextual 'battery' + negative 'drains'"
    },
    {
        "id": "perf_004",
        "content": "Uses too much memory, phone keeps freezing up",
        "expected": True,
        "reason": "Contextual 'memory' + negative 'freezing'"
    },
    {
        "id": "perf_005",
        "content": "CPU usage is through the roof, makes everything sluggish",
        "expected": True,
        "reason": "Contextual 'CPU' + negative 'sluggish'"
    },
    {
        "id": "perf_006",
        "content": "Speed has gotten worse after the update, very disappointed",
        "expected": True,
        "reason": "Neutral 'speed' + negative 'worse'"
    },
    {
        "id": "perf_007",
        "content": "Performance was good before but now it slows down my games",
        "expected": True,
        "reason": "Neutral 'performance' + negative 'slows down'"
    },
    
    # ═════════════════════════════════════════════════════════════════════
    # FALSE POSITIVES TO ELIMINATE (should NOT be tagged as Performance)
    # ═════════════════════════════════════════════════════════════════════
    {
        "id": "perf_fp_001",
        "content": "Love the battery saver feature, really helps extend life",
        "expected": False,
        "reason": "Positive 'battery' mention - battery saver is good"
    },
    {
        "id": "perf_fp_002",
        "content": "Great app that doesn't drain battery like others",
        "expected": False,
        "reason": "Positive context - doesn't drain"
    },
    {
        "id": "perf_fp_003",
        "content": "Fast scanning and improved performance over previous version",
        "expected": False,
        "reason": "Positive 'performance' mention"
    },
    {
        "id": "perf_fp_004",
        "content": "Speed is amazing, no lag at all on my phone",
        "expected": False,
        "reason": "Positive 'speed' mention with 'no lag'"
    },
    {
        "id": "perf_fp_005",
        "content": "Memory efficient app that doesn't slow down my device",
        "expected": False,
        "reason": "Positive 'memory' context - efficient"
    },
    {
        "id": "perf_fp_006",
        "content": "Uses less battery than Norton, very efficient protection",
        "expected": False,
        "reason": "Comparative positive - uses less battery"
    },
    {
        "id": "perf_fp_007",
        "content": "Good performance and fast scanning capabilities",
        "expected": False,
        "reason": "Positive 'performance' with 'good'"
    },
    {
        "id": "perf_fp_008",
        "content": "No impact on battery life, works silently in background",
        "expected": False,
        "reason": "Explicit positive - 'no impact'"
    },
    
    # ═════════════════════════════════════════════════════════════════════
    # EDGE CASES
    # ═════════════════════════════════════════════════════════════════════
    {
        "id": "perf_edge_001",
        "content": "Battery usage is acceptable, not great but not terrible",
        "expected": False,
        "reason": "Neutral mention, no clear complaint"
    },
    {
        "id": "perf_edge_002",
        "content": "Speed could be better but it's not slow",
        "expected": False,
        "reason": "Mixed but leans positive ('not slow')"
    },
]

# ═══════════════════════════════════════════════════════════════════════════
# EVALUATION
# ═══════════════════════════════════════════════════════════════════════════

def evaluate_classifier(test_cases: List[Dict], classifier_fn, name: str) -> Dict:
    """Evaluate a classifier against test cases"""
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
            errors.append(f"      Content: {case['content'][:60]}...")
        elif not predicted and not expected:
            tn += 1
        else:  # not predicted and expected
            fn += 1
            errors.append(f"  FN: {case['id']} - {case['reason']}")
            errors.append(f"      Content: {case['content'][:60]}...")
    
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
    accuracy = (tp + tn) / len(test_cases)
    
    print(f"\n{'='*60}")
    print(f"RESULTS: {name}")
    print(f"{'='*60}")
    print(f"True Positives:  {tp}")
    print(f"False Positives: {fp}")
    print(f"True Negatives:  {tn}")
    print(f"False Negatives: {fn}")
    print(f"Precision: {precision:.3f}")
    print(f"Recall:    {recall:.3f}")
    print(f"F1 Score:  {f1:.3f}")
    print(f"Accuracy:  {accuracy:.3f}")
    
    if errors:
        print(f"\nErrors:")
        for error in errors[:10]:  # Show first 10 errors
            print(error)
        if len(errors) > 10:
            print(f"  ... and {len(errors) - 10} more errors")
    
    return {
        'name': name,
        'tp': tp, 'fp': fp, 'tn': tn, 'fn': fn,
        'precision': precision,
        'recall': recall,
        'f1': f1,
        'accuracy': accuracy
    }


def main():
    print("="*60)
    print("EXPERIMENT 008: Performance Theme Precision")
    print("="*60)
    print(f"\nTotal test cases: {len(TEST_CASES)}")
    print(f"Expected True (Performance issues): {sum(1 for t in TEST_CASES if t['expected'])}")
    print(f"Expected False (Not performance): {sum(1 for t in TEST_CASES if not t['expected'])}")
    
    # Evaluate baseline
    baseline_results = evaluate_classifier(TEST_CASES, analyze_themes_baseline, "BASELINE (simple keywords)")
    
    # Evaluate improved
    improved_results = evaluate_classifier(TEST_CASES, analyze_themes_improved, "IMPROVED (context-aware)")
    
    # Compare
    print(f"\n{'='*60}")
    print("COMPARISON")
    print(f"{'='*60}")
    print(f"Baseline F1: {baseline_results['f1']:.3f}")
    print(f"Improved F1: {improved_results['f1']:.3f}")
    print(f"Improvement: {improved_results['f1'] - baseline_results['f1']:+.3f}")
    
    if improved_results['f1'] > baseline_results['f1']:
        print("\n✅ EXPERIMENT SUCCESSFUL - Keep the changes")
    else:
        print("\n❌ EXPERIMENT FAILED - Revert the changes")
    
    return baseline_results, improved_results


if __name__ == '__main__':
    main()
