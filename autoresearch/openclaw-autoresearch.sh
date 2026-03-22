#!/bin/bash
# OpenClaw Autoresearch Integration
# Helper script to spawn autoresearch agents

REPO_DIR="/Users/yash/work/mcafee/review-dashboard-v2/autoresearch"
ACTION=$1

usage() {
    echo "Usage: $0 {start|status|stop|single} [focus_area]"
    echo ""
    echo "Commands:"
    echo "  start [focus]    - Start a new autoresearch session (themes|responses|both)"
    echo "  status           - Check running autoresearch sessions"
    echo "  stop             - Stop all autoresearch sessions"
    echo "  single [focus]   - Run a single experiment iteration"
    echo ""
    echo "Examples:"
    echo "  $0 start themes        # Optimize theme classification"
    echo "  $0 start responses     # Optimize response quality scoring"
    echo "  $0 single negation     # Test negation handling"
    exit 1
}

case "$ACTION" in
    start)
        FOCUS=${2:-themes}
        echo "Starting autoresearch session: focus=$FOCUS"
        
        # Create session message based on focus
        case "$FOCUS" in
            themes)
                TASK="Read /Users/yash/work/mcafee/review-dashboard-v2/autoresearch/program.md 
and run the autoresearch loop. Focus on theme classification optimization.
Run up to 20 iterations. Use the evaluation/score_themes.py script to measure F1 score.
Stop if no improvement after 5 consecutive attempts."
                LABEL="autoresearch-themes"
                ;;
            responses)
                TASK="Read /Users/yash/work/mcafee/review-dashboard-v2/autoresearch/program.md 
and run the autoresearch loop. Focus on response quality scoring optimization.
Run up to 20 iterations. Use evaluation/score_responses.py to measure accuracy.
Stop if no improvement after 5 consecutive attempts."
                LABEL="autoresearch-responses"
                ;;
            both)
                TASK="Read /Users/yash/work/mcafee/review-dashboard-v2/autoresearch/program.md 
and run the autoresearch loop. Optimize both theme classification AND response quality.
Alternate between the two evaluation scripts. Run up to 30 iterations total."
                LABEL="autoresearch-both"
                ;;
            *)
                echo "Unknown focus: $FOCUS"
                usage
                ;;
        esac
        
        echo "This would spawn: sessions_spawn --label $LABEL"
        echo "Task: $TASK"
        echo ""
        echo "To actually run, execute:"
        echo "sessions_spawn --task '$TASK' --label $LABEL --timeout 3600"
        ;;
        
    status)
        echo "Checking autoresearch sessions..."
        echo "(Would run: sessions_list | grep autoresearch)"
        echo ""
        echo "Active experiments:"
        ls -1d $REPO_DIR/experiments/0* 2>/dev/null | while read dir; do
            exp=$(basename "$dir")
            if [ -f "$dir.best" ]; then
                score=$(cat "$dir.best" | cut -d: -f2)
                echo "  ✓ $exp (F1: $score)"
            elif [ -f "$dir/CHANGELOG.md" ]; then
                echo "  ⟳ $exp (in progress)"
            else
                echo "  ○ $exp (pending)"
            fi
        done
        ;;
        
    stop)
        echo "Stopping autoresearch sessions..."
        echo "(Would run: subagents kill autoresearch)"
        ;;
        
    single)
        FOCUS=${2:-keyword-tuning}
        EXP_NUM=$(ls -1d $REPO_DIR/experiments/0* 2>/dev/null | wc -l | tr -d ' ')
        EXP_NUM=$(printf "%03d" $((EXP_NUM + 1)))
        
        echo "Running single experiment: $EXP_NUM (focus: $FOCUS)"
        
        TASK="Create a single autoresearch experiment $EXP_NUM in 
/Users/yash/work/mcafee/review-dashboard-v2/autoresearch/experiments/.

Focus: $FOCUS

Steps:
1. Copy from the best previous experiment (or 001-baseline if none)
2. Make ONE targeted change related to $FOCUS
3. Document the change in CHANGELOG.md
4. Run evaluation with: python ../evaluation/score_themes.py .
5. Report the F1 score and whether it improved

Be specific and surgical with your change."

        echo "To run:"
        echo "sessions_spawn --task '$TASK' --label autoresearch-$EXP_NUM"
        ;;
        
    *)
        usage
        ;;
esac
