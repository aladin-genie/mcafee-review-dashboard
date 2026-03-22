# Autoresearch Program: Review Dashboard Optimization

## Mission
Optimize the McAfee Review Dashboard through automated experimentation. Focus on:
1. **Theme Classification Accuracy** — Better sentiment/theme detection
2. **Response Quality Scoring** — More accurate evaluation of McAfee replies
3. **Insight Generation** — Better automated insights from review patterns

## Directory Structure
```
autoresearch/
├── program.md              # This file — agent instructions
├── experiments/            # One folder per experiment
│   ├── 001-baseline/       # Current implementation
│   ├── 002-try-X/          # Each iteration
│   └── ...
├── evaluation/             # Evaluation scripts
│   ├── score_themes.py     # Theme classification accuracy
│   ├── score_responses.py  # Response quality scoring
│   └── benchmark.json      # Ground truth labels
├── run-loop.sh             # Main loop script
└── logs/                   # Experiment logs
```

## Experiment Rules

### 1. One Change Per Iteration
Each experiment modifies ONE file with ONE focused change:
- `dashboard.js` — Theme detection logic, chart rendering, insight generation
- `scrape_reviews.py` — Data preprocessing, feature extraction
- `evaluation/*.py` — Scoring algorithms (if improving evaluation itself)

### 2. Copy-Patch-Test Pattern
```bash
# 1. Copy baseline to new experiment folder
cp -r experiments/001-baseline experiments/002-keyword-weights

# 2. Make ONE targeted change to the code
# Edit experiments/002-keyword-weights/dashboard.js

# 3. Run evaluation
cd experiments/002-keyword-weights && python ../../evaluation/score_themes.py

# 4. Keep if score improved, discard if not
```

### 3. Evaluation Metrics

**Theme Classification (Primary)**
- Precision, Recall, F1 per theme
- Overall accuracy across all 8 themes
- Target: F1 > 0.75 for each theme

**Response Quality Scoring (Secondary)**
- Correlation with human judgment (benchmarked)
- Precision on identifying "bad" responses
- Target: Pearson r > 0.8 with human labels

**Performance (Tertiary)**
- Script execution time (faster is better)
- Bundle size (if modifying JS build)

### 4. Git Workflow
- Create branch: `git checkout -b autoresearch/$(date +%Y%m%d-%H%M%S)`
- Each kept experiment: `git commit -m "exp-N: description - score X→Y"`
- Failed experiments: `git checkout -- .` (revert)

## Current Baseline Performance

From manual evaluation on 50 labeled reviews:

| Theme | Precision | Recall | F1 |
|-------|-----------|--------|-----|
| VPN | 0.68 | 0.71 | 0.69 |
| Performance | 0.72 | 0.65 | 0.68 |
| Support | 0.81 | 0.78 | 0.79 |
| Pricing | 0.85 | 0.82 | 0.83 |
| Security | 0.79 | 0.88 | 0.83 |

Response Quality Scoring:
- Accuracy: 74% vs human judgment
- False positive rate: 18%

## Experiment Ideas (Prioritized)

1. **Keyword Weight Tuning** — Adjust keyword lists for each theme
2. **Context Window** — Look at surrounding sentences, not just keywords
3. **Negation Handling** — "not secure" vs "secure"
4. **Response Pattern Matching** — Better regex for generic templates
5. **Sentiment Polarity** — Combine VADER/stock sentiment with keywords
6. **Review Length Bias** — Weight longer reviews more heavily
7. **Platform-Specific Tuning** — Different thresholds per platform

## Agent Instructions

When running an experiment:

1. **Read** the current experiment code
2. **Analyze** the benchmark results from the previous iteration
3. **Propose** ONE specific change with clear hypothesis
4. **Implement** the change in a new experiment folder
5. **Evaluate** using the evaluation scripts
6. **Decide** keep or discard based on metrics
7. **Log** the result with reasoning

Always prefer small, testable changes over large rewrites.
Always document your hypothesis before implementing.
If score drops, analyze why before next iteration.

## Safety Limits
- Max 50 iterations per run
- Stop if 5 consecutive failures
- Manual review required for changes > 50 lines
