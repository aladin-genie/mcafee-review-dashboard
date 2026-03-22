# Experiment 010: UI/UX vs Pop-ups/Ads Separation

## Summary
**Date:** 2026-03-22  
**Result:** ✅ SUCCESS - Accuracy improved 0.700 → 1.000 (+43%)

## Problem
"annoying" appeared in both themes, causing both to be tagged:
- "User interface is terrible, very annoying" → Tagged as BOTH UI/UX AND Pop-ups ❌

## Solution
Separated keywords by category:
- **UI/UX**: interface, design, layout, navigation, confusing, cluttered
- **Pop-ups/Ads**: popup, notification, banner, alert, constant, frequent
- **Contextual words** (annoying, frustrating): Check surrounding context

## Results
| Metric | Baseline | Improved | Change |
|--------|----------|----------|--------|
| Accuracy | 0.700 | 1.000 | +43% |
| Errors | 3/10 | 0/10 | -100% |

## Integration
Check Pop-ups/Ads first (more specific), then UI/UX. Contextual words check for popup indicators.
