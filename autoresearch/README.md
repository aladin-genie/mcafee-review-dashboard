# Autoresearch: Review Dashboard Optimization

Automated experimentation framework for improving the McAfee Review Dashboard.

## Quick Start

```bash
cd /Users/yash/work/mcafee/review-dashboard-v2/autoresearch

# Run the autoresearch loop
./run-loop.sh

# Or run evaluations manually
python evaluation/score_themes.py experiments/001-baseline
python evaluation/score_responses.py experiments/001-baseline
```

## How It Works

### The Loop
1. **Copy** baseline to new experiment folder
2. **Spawn** agent to make ONE targeted change
3. **Evaluate** using benchmark dataset
4. **Keep** if score improved, **discard** if not
5. **Iterate** up to 30 times or until circuit breaker

### Evaluation Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Theme Classification F1 | > 0.75 | ~0.72 |
| Response Quality Accuracy | > 0.80 | ~0.74 |

### File Structure

```
autoresearch/
├── program.md              # Agent instructions
├── run-loop.sh             # Main orchestration script
├── experiments/
│   ├── 001-baseline/       # Starting point (copy of dashboard.js)
│   ├── 002-keyword-tuning/ # Example: keyword weight experiment
│   └── ...                 # Generated during loop
├── evaluation/
│   ├── benchmark_reviews.json  # 20 labeled reviews
│   ├── score_themes.py     # Theme classification F1
│   └── score_responses.py  # Response quality accuracy
└── logs/
    └── loop-YYYYMMDD-HHMMSS.log  # Experiment history
```

## Experiment Ideas

### High Impact
1. **Negation Handling** — "not secure" vs "secure" detection
2. **Keyword Weights** — Frequency scoring for theme keywords
3. **Context Windows** — Sentence-level analysis vs whole review

### Medium Impact
4. **Platform-Specific Tuning** — Different thresholds per platform
5. **Sentiment Polarity** — Combine VADER with keyword detection
6. **Review Length Weight** — Weight longer reviews more heavily

### Quick Wins
7. **Stop Word Filtering** — Remove common words before matching
8. **Synonym Expansion** — Map related terms ("fast" ↔ "speed" ↔ "performance")
9. **Emoji Handling** — Convert 😠😊 to sentiment signals

## OpenClaw Integration

### Option 1: Manual Trigger
```bash
# Start a new autoresearch session
sessions_spawn \
  --task "Read /Users/yash/work/mcafee/review-dashboard-v2/autoresearch/program.md and run the autoresearch loop for theme classification optimization. Focus on keyword tuning." \
  --label "autoresearch-dashboard-themes"
```

### Option 2: Cron Schedule (Overnight)
```yaml
# Run every night at 2 AM
schedule: "0 2 * * *"
payload:
  kind: "agentTurn"
  message: "Continue autoresearch for review-dashboard-v2. Run 20 iterations focusing on response quality scoring. Stop if no improvement after 5 attempts."
  timeoutSeconds: 3600  # 1 hour
```

### Option 3: Ad-Hoc Single Experiment
```bash
# Run one experiment iteration
sessions_spawn \
  --task "Create experiment 003 in autoresearch/experiments/. Focus on negation handling ('not working' patterns). Copy from best previous experiment, make ONE change, run evaluation. Report F1 before/after." \
  --label "autoresearch-single"
```

## Interpreting Results

### Log Format
```
Iteration | Experiment | Theme F1 | Response Acc | Decision | Notes
----------|------------|----------|--------------|----------|-------
1         | 001        | 0.720    | 0.740        | KEEP     | Baseline
2         | 002        | 0.735    | 0.740        | KEEP     | Added VPN synonyms
3         | 003        | 0.712    | 0.740        | DISCARD  | Broke negation
```

### Success Criteria
- **Theme F1** improves by > 0.05 over 10+ iterations
- **Response Accuracy** improves by > 0.05
- No regression in either metric

### Circuit Breakers
Loop stops automatically if:
- 5 consecutive failed experiments
- Max iterations (30) reached
- Manual interrupt (Ctrl+C)

## Extending the Framework

### Add New Evaluation
1. Create `evaluation/score_{metric}.py`
2. Return `SCORE:{value}` in output
3. Exit 0 if above threshold, 1 if below
4. Update `run-loop.sh` to call your scorer

### Add New Experiment Type
Edit `program.md` with new instructions for the agent:
- UI performance optimization (Lighthouse scores)
- Data pipeline efficiency (scraping speed)
- Insight generation quality (human evaluation)

## Troubleshooting

### "No baseline found"
```bash
cp ../mcafee-review-dashboard/docs/assets/dashboard.js experiments/001-baseline/
```

### "Evaluation returns 0"
Check that benchmark_reviews.json exists and has labeled data.

### "Git branch conflicts"
Each run creates a new branch: `autoresearch/YYYYMMDD-HHMMSS`
Clean up old branches: `git branch -d autoresearch/old-branch`

## Results Log

| Date | Experiments | Best F1 | Key Improvements |
|------|-------------|---------|------------------|
| 2026-03-22 | - | 0.720 | Baseline established |

---

*This is an active experimentation framework. Run it, review results, iterate.*
