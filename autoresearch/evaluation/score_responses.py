#!/usr/bin/env python3
"""
Response Quality Evaluation Script
Measures accuracy of response quality classification vs human judgment
"""

import json
import sys
from pathlib import Path
import re

# Ground truth: manually evaluated McAfee responses
# Categories: CORRECT, GENERIC_TEMPLATE, NO_SOLUTION, NO_RESPONSE, WRONG_ISSUE
GROUND_TRUTH = {
    "resp_001": {"response_type": "GENERIC_TEMPLATE", "response_text": "Please contact our support team at..."},
    "resp_002": {"response_type": "CORRECT", "response_text": "Thank you for reporting this issue. To resolve..."},
    "resp_003": {"response_type": "NO_SOLUTION", "response_text": "We're sorry to hear about your experience. Please reach out..."},
    "resp_004": {"response_type": "NO_RESPONSE", "response_text": ""},
    "resp_005": {"response_type": "WRONG_ISSUE", "response_text": "To update your subscription..."},  # Review was about VPN, not subscription
    # Add more examples...
}

def classify_response_quality(response_text, review_text=""):
    """Classify McAfee's response quality"""
    
    if not response_text or not response_text.strip():
        return "NO_RESPONSE"
    
    # Generic template patterns
    generic_patterns = [
        r"please contact (our )?support",
        r"reach out to (our )?support",
        r"customer support team",
        r"sorry to hear.*contact",
        r"we apologize.*please call",
    ]
    
    for pattern in generic_patterns:
        if re.search(pattern, response_text.lower()):
            # Check if it has specific solution steps
            solution_indicators = ["try", "step", "settings", "menu", "option", "click"]
            has_solution = any(ind in response_text.lower() for ind in solution_indicators)
            
            if not has_solution:
                return "GENERIC_TEMPLATE"
            else:
                return "NO_SOLUTION"  # Has some content but still redirects
    
    # Check for specific actionable advice
    solution_patterns = [
        r"go to.*settings",
        r"try.*(?:restarting|clearing|updating)",
        r"step \d+:",
        r"here's how",
    ]
    
    has_specifics = any(re.search(p, response_text.lower()) for p in solution_patterns)
    
    if has_specifics:
        # Check if it addresses the review's issue
        if review_text:
            review_lower = review_text.lower()
            # Simple heuristic: does response mention keywords from review?
            review_keywords = set(review_lower.split()) - {"the", "a", "is", "to", "and", "of"}
            response_keywords = set(response_text.lower().split())
            overlap = len(review_keywords & response_keywords)
            
            if overlap < 2:  # Minimal overlap
                return "WRONG_ISSUE"
        
        return "CORRECT"
    
    return "NO_SOLUTION"  # Default fallback

def evaluate_accuracy(experiment_dir=None):
    """Compare classifier predictions to ground truth"""
    correct = 0
    total = len(GROUND_TRUTH)
    confusion = {}
    
    for resp_id, truth in GROUND_TRUTH.items():
        predicted = classify_response_quality(truth["response_text"], truth.get("review_text", ""))
        actual = truth["response_type"]
        
        if predicted == actual:
            correct += 1
        
        # Track confusion
        key = f"{predicted}_vs_{actual}"
        confusion[key] = confusion.get(key, 0) + 1
    
    accuracy = correct / total if total > 0 else 0
    return accuracy, confusion

def main():
    experiment_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    
    print(f"Evaluating Response Quality Classifier")
    print("=" * 50)
    
    accuracy, confusion = evaluate_accuracy(experiment_dir)
    
    print(f"\nAccuracy: {accuracy:.1%} ({int(accuracy * len(GROUND_TRUTH))}/{len(GROUND_TRUTH)})")
    print(f"\nConfusion Matrix:")
    for key, count in sorted(confusion.items()):
        print(f"  {key}: {count}")
    
    # Per-category breakdown
    categories = ["CORRECT", "GENERIC_TEMPLATE", "NO_SOLUTION", "NO_RESPONSE", "WRONG_ISSUE"]
    print(f"\nPer-Category Precision:")
    for cat in categories:
        tp = confusion.get(f"{cat}_vs_{cat}", 0)
        fp = sum(confusion.get(f"{cat}_vs_{other}", 0) for other in categories if other != cat)
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        print(f"  {cat}: {precision:.2f}")
    
    print(f"\nSCORE:{accuracy:.3f}")
    return accuracy

if __name__ == "__main__":
    score = main()
    sys.exit(0 if score > 0.75 else 1)
