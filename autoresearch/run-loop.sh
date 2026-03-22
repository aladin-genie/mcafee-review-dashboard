#!/bin/bash
# Autoresearch Loop for Review Dashboard
# Run this to start automated experimentation

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
EXPERIMENTS_DIR="$REPO_DIR/experiments"
EVALUATION_DIR="$REPO_DIR/evaluation"
LOGS_DIR="$REPO_DIR/logs"

# Configuration
MAX_ITERATIONS=30
CONSECUTIVE_FAILURES_LIMIT=5
BEST_F1=0.0
ITERATION=0
FAIL_COUNT=0

# Create git branch for this autoresearch session
BRANCH_NAME="autoresearch/$(date +%Y%m%d-%H%M%S)"
cd "$REPO_DIR/../"
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"

echo "=========================================="
echo "Starting Autoresearch Loop"
echo "Branch: $BRANCH_NAME"
echo "Max iterations: $MAX_ITERATIONS"
echo "=========================================="
echo ""

# Log file
LOG_FILE="$LOGS_DIR/loop-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$LOGS_DIR"

log() {
    echo "$1" | tee -a "$LOG_FILE"
}

log "Iteration | Experiment | Theme F1 | Response Acc | Decision | Notes"
log "----------|------------|----------|--------------|----------|-------"

for i in $(seq 1 $MAX_ITERATIONS); do
    ITERATION=$i
    EXPERIMENT_NUM=$(printf "%03d" $i)
    EXPERIMENT_DIR="$EXPERIMENTS_DIR/${EXPERIMENT_NUM}-exp"
    
    log ""
    log "=== Iteration $i ==="
    
    # 1. SETUP: Copy baseline or previous best
    if [ $i -eq 1 ]; then
        # First iteration: copy baseline
        cp -r "$EXPERIMENTS_DIR/001-baseline" "$EXPERIMENT_DIR"
        log "Created experiment from baseline"
    else
        # Copy from best performing previous experiment
        BEST_PREV=$(find "$EXPERIMENTS_DIR" -maxdepth 1 -name "*.score" | sort -t: -k2 -nr | head -1 | xargs dirname 2>/dev/null || echo "")
        if [ -z "$BEST_PREV" ]; then
            BEST_PREV="$EXPERIMENTS_DIR/001-baseline"
        fi
        cp -r "$BEST_PREV" "$EXPERIMENT_DIR"
        log "Created experiment from: $(basename "$BEST_PREV")"
    fi
    
    # 2. EXPERIMENT: Spawn agent to make ONE change
    log "Spawning agent for experiment..."
    
    # Create prompt for the agent
    cat > "$EXPERIMENT_DIR/agent_prompt.md" << 'AGENT_PROMPT'
You are optimizing the McAfee Review Dashboard theme classification.

READ the current dashboard.js code first. Understand the THEME_DONUTS structure and theme detection logic.

HYPOTHESIS: Propose ONE specific change to improve theme classification F1 score.
Focus areas:
- Keyword weight tuning (add/remove/modify keywords)
- Negation handling ("not working" vs "working")
- Context awareness (sentence boundaries)
- Multi-theme detection logic

MAKE exactly ONE targeted change to dashboard.js. Do not refactor everything.

DOCUMENT your change in CHANGELOG.md with:
- Hypothesis
- What you changed (specific lines)
- Expected impact

DO NOT run the code. Just make the change.
AGENT_PROMPT

    # Note: In actual OpenClaw usage, you'd use sessions_spawn here
    # For now, we'll create a placeholder that the user can adapt
    log "Agent prompt written to: $EXPERIMENT_DIR/agent_prompt.md"
    log "(In OpenClaw, this would trigger: sessions_spawn --task @agent_prompt.md)"
    
    # 3. EVALUATION: Run scoring scripts
    log "Running evaluation..."
    
    THEME_SCORE=0
    RESPONSE_SCORE=0
    
    if python3 "$EVALUATION_DIR/score_themes.py" "$EXPERIMENT_DIR" > "$EXPERIMENT_DIR/eval_output.txt" 2>&1; then
        THEME_SCORE=$(grep "SCORE:" "$EXPERIMENT_DIR/eval_output.txt" | cut -d: -f2)
        log "Theme F1: $THEME_SCORE"
    else
        log "Theme evaluation failed"
        THEME_SCORE=0
    fi
    
    if python3 "$EVALUATION_DIR/score_responses.py" "$EXPERIMENT_DIR" > "$EXPERIMENT_DIR/eval_response.txt" 2>&1; then
        RESPONSE_SCORE=$(grep "SCORE:" "$EXPERIMENT_DIR/eval_response.txt" | cut -d: -f2)
        log "Response Acc: $RESPONSE_SCORE"
    else
        log "Response evaluation failed"
        RESPONSE_SCORE=0
    fi
    
    # 4. DECISION: Keep or discard
    IMPROVED=false
    
    if (( $(echo "$THEME_SCORE > $BEST_F1" | bc -l) )); then
        BEST_F1=$THEME_SCORE
        IMPROVED=true
        FAIL_COUNT=0
        
        # Mark as best
        echo "$EXPERIMENT_DIR:$THEME_SCORE" > "$EXPERIMENT_DIR.best"
        
        # Commit the improvement
        cd "$REPO_DIR/../"
        git add -A
        git commit -m "autoresearch-$ITERATION: Theme F1 improved to $THEME_SCORE

Changes: $(cat $EXPERIMENT_DIR/CHANGELOG.md 2>/dev/null || echo 'See diff')" || true
        
        log "✓ KEPT: New best F1 = $THEME_SCORE"
        echo "$EXPERIMENT_DIR:$THEME_SCORE" > "$EXPERIMENTS_DIR/best_experiment.txt"
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        log "✗ DISCARDED: F1 $THEME_SCORE < best $BEST_F1"
        
        # Remove failed experiment
        rm -rf "$EXPERIMENT_DIR"
    fi
    
    # Log the iteration
    DECISION=$([ "$IMPROVED" = true ] && echo "KEEP" || echo "DISCARD")
    log "$ITERATION | $EXPERIMENT_NUM | $THEME_SCORE | $RESPONSE_SCORE | $DECISION | $(cat $EXPERIMENT_DIR/CHANGELOG.md 2>/dev/null | head -1 || echo '-')"
    
    # 5. CIRCUIT BREAKER: Stop if too many failures
    if [ $FAIL_COUNT -ge $CONSECUTIVE_FAILURES_LIMIT ]; then
        log ""
        log "⚠️  CIRCUIT BREAKER: $CONSECUTIVE_FAILURES_LIMIT consecutive failures. Stopping."
        break
    fi
    
    # Small delay between iterations
    sleep 2
done

log ""
log "=========================================="
log "Autoresearch Complete"
log "Total iterations: $ITERATION"
log "Best F1 achieved: $BEST_F1"
log "Branch: $BRANCH_NAME"
log "=========================================="

# Summary
echo ""
echo "Best experiment: $(cat $EXPERIMENTS_DIR/best_experiment.txt 2>/dev/null || echo 'None')"
echo "See logs: $LOG_FILE"
