# Experiment 011: Support Theme Accuracy

## Summary
**Date:** 2026-03-22  
**Result:** ✅ SUCCESS - F1 improved 0.632 → 0.923 (+46%)

## Problem
"help" too generic - caught "very helpful app" (positive) as Support complaint ❌

## Solution
- **Direct keywords**: customer support, tech support, support team, support agent
- **Contact keywords**: contacted support, called support, support ticket
- **Quality keywords**: rude, unhelpful, unresponsive, ignored
- **Contextual "help"**: Only tag if support context present AND not positive context

## Results
| Metric | Baseline | Improved | Change |
|--------|----------|----------|--------|
| Precision | 0.500 | 1.000 | +100% |
| Recall | 0.857 | 0.857 | 0% |
| **F1** | **0.632** | **0.923** | **+46%** |
| False Positives | 6 | 0 | -100% |

## Integration
Filter out positive "helpful" mentions before tagging as Support.
