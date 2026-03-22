#!/usr/bin/env python3
"""
Experiment 009: VPN Theme Detection Improvement

HYPOTHESIS: Current VPN detection misses variations like:
- "virtual private" (not just "vpn")
- "ip hiding", "hide my ip"
- "location masking", "change location"
- "secure connection", "private browsing"
- VPN brand mentions (NordVPN comparison, etc.)

BASELINE: Current VPN keywords: ['vpn', 'virtual private network', 'connection', 'ip address']
TARGET: Improve recall while maintaining precision
"""

from typing import List, Dict

# ═══════════════════════════════════════════════════════════════════════════
# BASELINE KEYWORDS (current)
# ═══════════════════════════════════════════════════════════════════════════

BASELINE_KEYWORDS = ['vpn', 'virtual private network', 'connection', 'ip address']

# ═══════════════════════════════════════════════════════════════════════════
# IMPROVED KEYWORDS (Experiment 009)
# ═══════════════════════════════════════════════════════════════════════════

IMPROVED_KEYWORDS = {
    'direct': ['vpn', 'virtual private network', 'virtual private'],
    'ip_related': ['ip address', 'ip hiding', 'hide my ip', 'hide ip', 'mask ip', 'ip mask'],
    'location': ['change location', 'location masking', 'fake location', 'geo location', 'geolocation'],
    'connection': ['secure connection', 'private connection', 'encrypted connection'],
    'browsing': ['private browsing', 'anonymous browsing', 'hide browsing'],
    # Exclude - to avoid false positives
    'exclude_context': ['no vpn', 'without vpn', 'disconnected from vpn']
}


def analyze_themes_baseline(content: str) -> List[str]:
    """Current baseline implementation"""
    content_lower = content.lower()
    themes = []
    
    for keyword in BASELINE_KEYWORDS:
        if keyword in content_lower:
            themes.append('VPN')
            break
    
    return themes


def analyze_themes_improved(content: str) -> List[str]:
    """Improved implementation with expanded VPN detection"""
    content_lower = content.lower()
    themes = []
    
    # Check for explicit negative context first
    for exclude in IMPROVED_KEYWORDS['exclude_context']:
        if exclude in content_lower:
            return themes  # Don't tag VPN if user says "no vpn" etc.
    
    # Check all VPN keyword categories
    for category in ['direct', 'ip_related', 'location', 'connection', 'browsing']:
        for keyword in IMPROVED_KEYWORDS[category]:
            if keyword in content_lower:
                themes.append('VPN')
                return themes
    
    return themes


# ═══════════════════════════════════════════════════════════════════════════
# TEST CASES
# ═══════════════════════════════════════════════════════════════════════════

TEST_CASES = [
    # ═════════════════════════════════════════════════════════════════════
    # TRUE POSITIVES (should be tagged as VPN)
    # ═════════════════════════════════════════════════════════════════════
    {
        "id": "vpn_001",
        "content": "The VPN keeps disconnecting every few minutes, very frustrating",
        "expected": True,
        "reason": "Direct 'VPN' mention"
    },
    {
        "id": "vpn_002",
        "content": "Virtual private network is slow and unreliable",
        "expected": True,
        "reason": "Full phrase 'virtual private network'"
    },
    {
        "id": "vpn_003",
        "content": "Can't hide my ip address properly with this app",
        "expected": True,
        "reason": "IP hiding mention"
    },
    {
        "id": "vpn_004",
        "content": "Location masking doesn't work for streaming services",
        "expected": True,
        "reason": "Location masking"
    },
    {
        "id": "vpn_005",
        "content": "The secure connection drops whenever I switch networks",
        "expected": True,
        "reason": "Secure connection + drops context"
    },
    {
        "id": "vpn_006",
        "content": "Need better private browsing mode, current one is buggy",
        "expected": True,
        "reason": "Private browsing"
    },
    {
        "id": "vpn_007",
        "content": "Geo location feature shows wrong country",
        "expected": True,
        "reason": "Geolocation"
    },
    {
        "id": "vpn_008",
        "content": "Compared to NordVPN this virtual private is much slower",
        "expected": True,
        "reason": "Virtual private (partial) + comparison context"
    },
    {
        "id": "vpn_009",
        "content": "Anonymous browsing keeps turning off by itself",
        "expected": True,
        "reason": "Anonymous browsing"
    },
    {
        "id": "vpn_010",
        "content": "The ip mask feature doesn't hide my real location",
        "expected": True,
        "reason": "IP mask"
    },
    
    # ═════════════════════════════════════════════════════════════════════
    # FALSE POSITIVES TO AVOID (should NOT be tagged as VPN)
    # ═════════════════════════════════════════════════════════════════════
    {
        "id": "vpn_fp_001",
        "content": "I don't use the VPN feature, just the antivirus",
        "expected": False,
        "reason": "Explicit no VPN usage"
    },
    {
        "id": "vpn_fp_002",
        "content": "Works great without vpn, no need for that feature",
        "expected": False,
        "reason": "Without VPN context"
    },
    {
        "id": "vpn_fp_003",
        "content": "Disconnected from vpn and now everything works fine",
        "expected": False,
        "reason": "Disconnected from VPN = not using it"
    },
    {
        "id": "vpn_fp_004",
        "content": "Great virus protection, never use the vpn though",
        "expected": False,
        "reason": "Never use VPN"
    },
    
    # ═════════════════════════════════════════════════════════════════════
    # EDGE CASES (tricky cases)
    # ═════════════════════════════════════════════════════════════════════
    {
        "id": "vpn_edge_001",
        "content": "Connection is slow but I think that's my wifi not the app",
        "expected": False,
        "reason": "Generic connection, not VPN-specific"
    },
    {
        "id": "vpn_edge_002",
        "content": "IP address shows correctly in settings",
        "expected": False,
        "reason": "Generic IP mention, not VPN-related"
    },
]


# ═══════════════════════════════════════════════════════════════════════════
# EVALUATION
# ═══════════════════════════════════════════════════════════════════════════

def evaluate_classifier(test_cases: List[Dict], classifier_fn, name: str) -> Dict:
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
        for error in errors[:8]:
            print(error)
    
    return {'name': name, 'f1': f1, 'precision': precision, 'recall': recall}


def main():
    print("="*60)
    print("EXPERIMENT 009: VPN Theme Detection Improvement")
    print("="*60)
    print(f"\nTotal test cases: {len(TEST_CASES)}")
    
    baseline = evaluate_classifier(TEST_CASES, analyze_themes_baseline, "BASELINE")
    improved = evaluate_classifier(TEST_CASES, analyze_themes_improved, "IMPROVED")
    
    print(f"\n{'='*60}")
    print("COMPARISON")
    print(f"{'='*60}")
    print(f"Baseline F1: {baseline['f1']:.3f}")
    print(f"Improved F1: {improved['f1']:.3f}")
    print(f"Change: {improved['f1'] - baseline['f1']:+.3f}")
    
    if improved['f1'] > baseline['f1']:
        print("\n✅ EXPERIMENT SUCCESSFUL - Keep the changes")
    else:
        print("\n❌ EXPERIMENT FAILED - Revert the changes")


if __name__ == '__main__':
    main()
