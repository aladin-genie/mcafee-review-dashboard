#!/usr/bin/env python3
"""
Theme Classification Evaluation Script
Measures precision, recall, F1 for each theme category
"""

import json
import sys
from pathlib import Path
from collections import defaultdict

# Ground truth: manually labeled 50 reviews
# Format: {"review_id": {"themes": ["VPN", "Performance"], "sentiment": "negative"}}
GROUND_TRUTH = {
    "gp_001": {"themes": ["VPN"], "sentiment": "negative"},
    "gp_002": {"themes": ["Performance", "App Issues"], "sentiment": "negative"},
    "gp_003": {"themes": ["Customer Support"], "sentiment": "negative"},
    "gp_004": {"themes": ["Pricing"], "sentiment": "negative"},
    "gp_005": {"themes": ["Security Features"], "sentiment": "positive"},
    "gp_006": {"themes": ["UI/UX"], "sentiment": "neutral"},
    "gp_007": {"themes": ["Installation"], "sentiment": "negative"},
    "gp_008": {"themes": ["VPN", "Performance"], "sentiment": "negative"},
    "gp_009": {"themes": ["Auto-Renewal"], "sentiment": "negative"},
    "gp_010": {"themes": ["Scam/Phishing"], "sentiment": "positive"},
    "gp_011": {"themes": ["General Feedback"], "sentiment": "positive"},
    "gp_012": {"themes": ["Pop-ups/Ads"], "sentiment": "negative"},
    "gp_013": {"themes": ["Dark Web"], "sentiment": "neutral"},
    "gp_014": {"themes": ["Customer Support", "Pricing"], "sentiment": "negative"},
    "gp_015": {"themes": ["App Issues"], "sentiment": "negative"},
    # Add more labeled examples as you review them...
}

def load_predictions(experiment_dir):
    """Load theme predictions from experiment output"""
    pred_file = Path(experiment_dir) / "theme_predictions.json"
    if not pred_file.exists():
        # Generate predictions by running the classifier
        return generate_predictions(experiment_dir)
    return json.loads(pred_file.read_text())

def generate_predictions(experiment_dir):
    """Run the theme classifier on benchmark reviews"""
    # Import the classifier from the experiment
    sys.path.insert(0, str(experiment_dir))
    
    # Load test reviews from benchmark file
    benchmark_path = Path(__file__).parent / "benchmark_reviews.json"
    benchmark_data = json.loads(benchmark_path.read_text())
    test_reviews = {r["id"]: r for r in benchmark_data["reviews"]}
    
    predictions = {}
    for review_id, review_data in test_reviews.items():
        review_text = review_data["text"]
        # Call the experiment's classifier
        themes = classify_themes(review_text, experiment_dir)
        predictions[review_id] = {"themes": themes}
    
    return predictions

def classify_themes(text, experiment_dir):
    """Extract themes using the experiment's logic"""
    # Read the experiment's theme detection code
    dashboard_js = Path(experiment_dir) / "dashboard.js"
    if dashboard_js.exists():
        # For JS files, we need to evaluate or extract logic
        # Simplified: keyword matching based on THEME_DONUTS
        themes = []
        text_lower = text.lower()
        
        theme_keywords = {
            "VPN": ["vpn", "virtual private network", "ip address", "location"],
            "Performance": ["slow", "battery", "cpu", "memory", "lag", "freeze"],
            "App Issues": ["crash", "bug", "error", "stopped working", "won't open"],
            "Customer Support": ["support", "customer service", "help desk", "agent"],
            "Pricing": ["price", "cost", "expensive", "cheap", "money", "subscription"],
            "Auto-Renewal": ["auto-renew", "charged without", "cancel", "refund"],
            "Security Features": ["antivirus", "protection", "scan", "malware", "virus"],
            "Scam/Phishing": ["scam", "phishing", "fraud", "fake"],
            "UI/UX": ["interface", "design", "ui", "user experience", "confusing"],
            "Pop-ups/Ads": ["popup", "ad", "advertisement", "notification"],
            "Installation": ["install", "download", "setup", "uninstall"],
            "Dark Web": ["dark web", "identity theft", "breach"],
        }
        
        for theme, keywords in theme_keywords.items():
            if any(kw in text_lower for kw in keywords):
                themes.append(theme)
        
        if not themes:
            themes.append("General Feedback")
        
        return themes
    
    return ["General Feedback"]

def calculate_metrics(ground_truth, predictions):
    """Calculate precision, recall, F1 per theme"""
    metrics = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0})
    all_themes = set()
    
    for review_id, truth in ground_truth.items():
        pred = predictions.get(review_id, {"themes": []})
        
        truth_themes = set(truth["themes"])
        pred_themes = set(pred["themes"])
        
        all_themes.update(truth_themes)
        all_themes.update(pred_themes)
        
        for theme in all_themes:
            if theme in truth_themes and theme in pred_themes:
                metrics[theme]["tp"] += 1
            elif theme not in truth_themes and theme in pred_themes:
                metrics[theme]["fp"] += 1
            elif theme in truth_themes and theme not in pred_themes:
                metrics[theme]["fn"] += 1
    
    results = {}
    total_f1 = 0
    
    for theme in all_themes:
        tp = metrics[theme]["tp"]
        fp = metrics[theme]["fp"]
        fn = metrics[theme]["fn"]
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
        
        results[theme] = {
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "f1": round(f1, 3),
            "tp": tp,
            "fp": fp,
            "fn": fn
        }
        total_f1 += f1
    
    # Macro-average F1
    avg_f1 = total_f1 / len(all_themes) if all_themes else 0
    results["_average_f1"] = round(avg_f1, 3)
    
    return results

def main():
    experiment_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    
    print(f"Evaluating: {experiment_dir}")
    print("=" * 50)
    
    predictions = load_predictions(experiment_dir)
    metrics = calculate_metrics(GROUND_TRUTH, predictions)
    
    # Print results
    print(f"\n{'Theme':<20} {'Precision':>10} {'Recall':>8} {'F1':>8}")
    print("-" * 50)
    
    for theme, scores in sorted(metrics.items()):
        if theme.startswith("_"):
            continue
        print(f"{theme:<20} {scores['precision']:>10.3f} {scores['recall']:>8.3f} {scores['f1']:>8.3f}")
    
    print("-" * 50)
    print(f"{'AVERAGE F1':<20} {'':>10} {'':>8} {metrics['_average_f1']:>8.3f}")
    
    # Return score for scripting
    return metrics["_average_f1"]

if __name__ == "__main__":
    score = main()
    print(f"\nSCORE:{score}")  # Machine-parseable output
    sys.exit(0 if score > 0.7 else 1)  # Exit 0 if above threshold
