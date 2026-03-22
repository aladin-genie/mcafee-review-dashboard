# Experiment 002: Negation Handling

## Hypothesis
The baseline classifier treats "not secure" and "secure" the same because it does simple keyword matching. Adding negation detection will improve classification accuracy for negative sentiment reviews that use negation.

## Changes Made

### 1. Added Negation Detection Function
```javascript
function detectNegationContext(text, keyword) {
  const sentences = text.split(/[.!?]+/);
  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes(keyword.toLowerCase())) {
      // Check for negation within 3 words before keyword
      const words = sentence.toLowerCase().split(/\s+/);
      const keywordIndex = words.findIndex(w => w.includes(keyword.toLowerCase()));
      
      if (keywordIndex > 0) {
        const windowStart = Math.max(0, keywordIndex - 3);
        const window = words.slice(windowStart, keywordIndex);
        const negationWords = ['not', "n't", 'no', 'never', 'nothing', 'nobody', 'neither', 'nowhere', 'hardly', 'barely'];
        
        if (negationWords.some(nw => window.includes(nw))) {
          return 'negated';
        }
      }
    }
  }
  return 'positive';
}
```

### 2. Modified Theme Detection
For themes like "Security Features", check negation context:
- "secure" → positive match
- "not secure" → exclude from Security Features, flag as negative sentiment

### 3. Expected Impact
- Reduce false positives for "Security Features" theme
- Improve sentiment accuracy for negated statements
- Target F1 improvement: 0.720 → 0.740

## Testing
Run evaluation:
```bash
python ../../evaluation/score_themes.py .
```

## Results
*To be filled after evaluation*
