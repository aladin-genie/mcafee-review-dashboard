#!/usr/bin/env python3
"""
McAfee Review Classifier
Classifies each review's intent, themes, and reply quality using an LLM.
Adds `intent`, `themes`, `quality_tag`, and `suggested_reply` fields.

LLM priority (auto-detected at runtime):
  1. Anthropic API  — set ANTHROPIC_API_KEY in environment
  2. AWS Bedrock    — if boto3 is installed and credentials are present
  3. Cloud CLI      — any executable named in config['model']['cli_command']
  4. Rule-based     — offline fallback, no external calls

Configuration : config/classification_prompt.yaml
Input / output : docs/data/dashboard_data.json  (modified in-place)

Usage:
    python scripts/classify.py              # classify un-tagged reviews
    python scripts/classify.py --force      # re-classify all reviews
    python scripts/classify.py --dry-run    # print results, don't save
    python scripts/classify.py --limit 50   # process at most 50 reviews
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys

try:
    import yaml
except ImportError:
    print("PyYAML not found. Run: pip install pyyaml")
    sys.exit(1)

# ── Paths ───────────────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE   = os.path.join(BASE_DIR, "docs", "data", "dashboard_data.json")
CONFIG_FILE = os.path.join(BASE_DIR, "config", "classification_prompt.yaml")


# ── Config ──────────────────────────────────────────────────────────────────────

def load_config() -> dict:
    with open(CONFIG_FILE) as f:
        return yaml.safe_load(f)


# ── LLM backends ────────────────────────────────────────────────────────────────

class AnthropicBackend:
    """Calls Claude directly via the Anthropic API (requires ANTHROPIC_API_KEY env var)."""

    def __init__(self, cfg: dict):
        import anthropic as _anthropic
        self.client     = _anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
        self.model      = cfg["model"].get("anthropic_model_id", "claude-haiku-4-5-20251001")
        self.max_tokens = cfg["model"]["max_tokens"]
        self.temperature = cfg["model"]["temperature"]

    def call(self, prompt: str) -> str:
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text


class BedrockBackend:
    """Calls an Anthropic model via AWS Bedrock."""

    def __init__(self, client, cfg: dict):
        self.client    = client
        self.model_id  = cfg["model"]["bedrock_model_id"]
        self.max_tokens = cfg["model"]["max_tokens"]
        self.temperature = cfg["model"]["temperature"]

    def call(self, prompt: str) -> str:
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens":  self.max_tokens,
            "temperature": self.temperature,
            "messages":    [{"role": "user", "content": prompt}],
        })
        resp = self.client.invoke_model(
            modelId=self.model_id,
            body=body,
            contentType="application/json",
            accept="application/json",
        )
        return json.loads(resp["body"].read())["content"][0]["text"]


class CLIBackend:
    """
    Calls an LLM available as a CLI tool on this machine.
    Tries the `llm` CLI (Simon Willison) by default; falls back to
    passing the prompt via stdin if --no-stream / prompt sub-command
    is not supported.
    """

    def __init__(self, cmd: str, cfg: dict):
        self.cmd = cmd

    def call(self, prompt: str) -> str:
        # Try `llm` CLI style first: llm prompt --no-stream
        try:
            result = subprocess.run(
                [self.cmd, "prompt", "--no-stream"],
                input=prompt, capture_output=True, text=True, timeout=60,
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

        # Generic fallback: pipe prompt to stdin
        result = subprocess.run(
            [self.cmd],
            input=prompt, capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            raise RuntimeError(f"CLI LLM error: {result.stderr.strip()}")
        return result.stdout.strip()


class RuleBasedBackend:
    """
    Offline rule-based fallback — no LLM required.
    Accuracy is lower than an LLM but runs instantly with no credentials.
    """

    COMPLAINT_STRONG = {"terrible", "awful", "horrible", "worst", "hate", "garbage",
                        "scam", "fraud", "rip off", "useless", "worthless", "crap",
                        "disgusting", "unacceptable", "pathetic"}
    COMPLAINT_MOD    = {"problem", "issue", "bug", "crash", "broken", "not working",
                        "disappointing", "frustrated", "annoying", "confusing",
                        "slow", "lag", "freeze", "keeps", "constantly", "never"}
    NEUTRAL_CTX      = {"just started", "recently started", "giving it a try",
                        "so far", "for now", "at the moment"}

    APOLOGY_RE = re.compile(r"\b(sorry|apologize|apologies)\b", re.I)
    EMPATHY_RE = re.compile(r"\b(sorry|apologize|frustrat|concern|regret|disappoint|understand)\b", re.I)
    SPECIFIC_RE = re.compile(r"\b(steps?:|try |reinstall|download|update|restart|1-866|mcafee\.com)\b", re.I)
    GENERIC_RE  = re.compile(r"we.?re elated|we are elated|elated by your|awesome feedback|wonderful feedback", re.I)

    # Theme keyword map (same as scrape.py — kept in sync manually)
    THEME_KW = {
        "Performance":      ["slow", "lag", "battery drain", "freeze", "sluggish"],
        "VPN":              ["vpn", "virtual private", "hide my ip"],
        "Security Features":["antivirus", "protection", "virus", "malware", "threat"],
        "UI/UX":            ["interface", "design", "confusing", "cluttered", "hard to use"],
        "Customer Support": ["customer support", "tech support", "support team", "customer service"],
        "Pricing":          ["price", "cost", "expensive", "billing", "subscription fee"],
        "Auto-Renewal":     ["auto-renew", "auto renew", "automatic renewal", "hard to cancel",
                             "impossible to cancel", "refund", "cancel subscription"],
        "Dark Web":         ["dark web", "identity theft", "breach", "monitoring"],
        "Scam/Phishing":    ["scam", "phishing", "fraud", "fake"],
        "Pop-ups/Ads":      ["popup", "pop-up", "notification", "banner", "ads", "advertisement"],
        "Installation":     ["install", "uninstall", "setup", "bloatware", "remove"],
        "App Issues":       ["crash", "bug", "error", "not working", "broken", "glitch"],
    }

    def _intent(self, review: dict) -> str:
        t = (review.get("content") or "").lower()
        r = review.get("rating", 3)
        neutral = any(n in t for n in self.NEUTRAL_CTX)
        strong  = [w for w in self.COMPLAINT_STRONG if w in t]
        mod_cnt = sum(1 for w in self.COMPLAINT_MOD if w in t)
        score   = len(strong) * 3 + mod_cnt

        if r <= 2:
            return "COMPLAINT"
        if r == 3:
            if strong:             return "COMPLAINT"
            if neutral and not score: return "NEUTRAL_STATEMENT"
            return "FEEDBACK"
        if r >= 4 and strong:
            return "FEEDBACK"
        return "PRAISE"

    def _themes(self, review: dict) -> list:
        t = (review.get("content") or "").lower()
        found = []
        for theme, kws in self.THEME_KW.items():
            if any(k in t for k in kws):
                found.append(theme)
        return found[:3]

    def _quality_tag(self, review: dict, intent: str) -> str:
        reply = (review.get("developer_reply") or "").strip()
        if not reply:
            return "NO_RESPONSE"
        rl = reply.lower()
        apologises = bool(self.APOLOGY_RE.search(rl))
        rating     = review.get("rating", 3)

        if apologises and intent in ("NEUTRAL_STATEMENT", "PRAISE"):
            return "UNWARRANTED_APOLOGY"
        if rating >= 4 and apologises and intent == "PRAISE":
            return "HIGH_RATING_APOLOGY"
        if rating <= 2 and intent == "COMPLAINT" and not self.EMPATHY_RE.search(rl):
            return "LOW_RATING_NO_EMPATHY"
        if self.GENERIC_RE.search(rl):
            return "GENERIC_TEMPLATE"
        if len(reply) < 150 and not self.EMPATHY_RE.search(rl) and "thank" in rl:
            return "GENERIC_TEMPLATE"
        has_specific = bool(self.SPECIFIC_RE.search(rl))
        only_redirect = (re.search(r"contact (us|support)|reach (out|our support)", rl)
                         and not has_specific and len(reply) < 450)
        if intent == "COMPLAINT" and only_redirect:
            return "NO_SOLUTION"
        if intent in ("COMPLAINT", "FEEDBACK") and self.EMPATHY_RE.search(rl) and not has_specific:
            return "NO_SOLUTION"
        return "CORRECT"

    def _suggested_reply(self, review: dict, intent: str, themes: list, quality_tag: str) -> str | None:
        if quality_tag == "CORRECT":
            return None
        t = (review.get("content") or "").lower()
        theme_actions = {
            "Auto-Renewal":     "You can cancel and request a refund at mcafee.com/myaccount or by calling 1-866-622-3911.",
            "VPN":              "For VPN issues, try toggling it off and back on. Our specialists at 1-866-622-3911 can help.",
            "Pop-ups/Ads":      "Disable alerts under McAfee → Settings → General → turn off 'Product announcements'.",
            "Installation":     "Use our removal tool at download.mcafee.com/mcpR.aspx; if that fails call 1-866-622-3911.",
            "Performance":      "Try clearing the app cache (Settings → Apps → McAfee → Clear Cache) and restart your device.",
            "Customer Support": "Please share your case number so we can follow up directly.",
            "Pricing":          "Our billing team at 1-866-622-3911 can review your account and clarify any charges.",
            "App Issues":       "Try clearing the app cache or reinstalling. Contact us at mcafee.com/support if it persists.",
        }
        if intent == "PRAISE":
            return "Thank you for the kind words! We are thrilled McAfee is keeping you protected."
        if intent == "NEUTRAL_STATEMENT":
            return ("Thanks for giving McAfee a try! Have you explored our VPN or Dark Web Monitoring? "
                    "Let us know if you need help getting started.")
        action = "Please reach out at mcafee.com/support or call 1-866-622-3911."
        for theme in themes:
            if theme in theme_actions:
                action = theme_actions[theme]
                break
        return f"We are truly sorry your experience fell short. {action} We are committed to making this right."

    def call(self, prompt: str) -> str:
        # The prompt contains the review data embedded in it — we re-parse it
        # from the prompt so this backend doesn't need a separate review object.
        # (The call() interface is string-in/string-out for uniformity.)
        # Extract fields from the prompt text using simple patterns.
        rating_m  = re.search(r"Rating\s*:\s*(\d)", prompt)
        reply_m   = re.search(r"McAfee reply:\n(.*?)(?:\n══|$)", prompt, re.S)
        content_m = re.search(r"Text\s*:\n(.*?)McAfee reply", prompt, re.S)

        review = {
            "rating":           int(rating_m.group(1)) if rating_m else 3,
            "content":          content_m.group(1).strip() if content_m else "",
            "developer_reply":  reply_m.group(1).strip() if reply_m else "",
        }
        review["developer_reply"] = "" if review["developer_reply"] == "None" else review["developer_reply"]

        intent      = self._intent(review)
        themes      = self._themes(review)
        quality_tag = self._quality_tag(review, intent)
        suggested   = self._suggested_reply(review, intent, themes, quality_tag)

        return json.dumps({
            "intent":          intent,
            "themes":          themes,
            "quality_tag":     quality_tag,
            "suggested_reply": suggested,
            "reasoning":       "Rule-based classification (no LLM available)",
        })


# ── Backend detection ────────────────────────────────────────────────────────────

def detect_backend(cfg: dict):
    """Auto-detect and return the best available LLM backend."""

    # 1. Anthropic API (direct — set ANTHROPIC_API_KEY in environment)
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            backend = AnthropicBackend(cfg)
            model   = cfg["model"].get("anthropic_model_id", "claude-haiku-4-5-20251001")
            print(f"  ✓ Anthropic API  [{model}]")
            return backend
        except Exception as e:
            print(f"  Anthropic API unavailable ({type(e).__name__}: {e})")

    # 2. AWS Bedrock
    try:
        import boto3
        region = cfg["model"].get("bedrock_region", "us-east-1")
        client = boto3.client("bedrock-runtime", region_name=region)
        # Verify credentials are present without making an API call
        session = boto3.Session()
        creds   = session.get_credentials()
        if creds:
            frozen = creds.get_frozen_credentials()
            if frozen and frozen.access_key:
                print(f"  ✓ AWS Bedrock  [{cfg['model']['bedrock_model_id']}]")
                return BedrockBackend(client, cfg)
    except Exception as e:
        print(f"  Bedrock unavailable ({type(e).__name__})")

    # 3. CLI LLM
    cli = cfg["model"].get("cli_command", "llm")
    if shutil.which(cli):
        print(f"  ✓ CLI LLM  [{cli}]")
        return CLIBackend(cli, cfg)

    # 4. Rule-based fallback
    print("  ⚠ No LLM credentials found — using rule-based fallback")
    print("    Set ANTHROPIC_API_KEY for direct API access, or configure AWS credentials for Bedrock.")
    return RuleBasedBackend()


# ── Prompt builder ───────────────────────────────────────────────────────────────

def build_prompt(review: dict, template: str) -> str:
    content = (review.get("content") or review.get("text") or "").strip()
    reply   = (review.get("developer_reply") or "").strip() or "None"
    return template.format(
        platform=review.get("platform", "unknown"),
        rating=review.get("rating", "?"),
        content=content,
        developer_reply=reply,
    )


# ── JSON extraction ──────────────────────────────────────────────────────────────

_JSON_RE = re.compile(r"\{.*\}", re.S)

def extract_json(text: str) -> dict:
    """Pull the first JSON object out of the LLM response string."""
    m = _JSON_RE.search(text)
    if not m:
        raise ValueError(f"No JSON found in LLM output:\n{text[:300]}")
    return json.loads(m.group())


# ── Classify a single review ─────────────────────────────────────────────────────

def classify_review(review: dict, backend, template: str) -> dict:
    """Call the backend, parse the result, and return the updated review dict."""
    prompt = build_prompt(review, template)
    raw    = backend.call(prompt)
    result = extract_json(raw)

    # Validate / normalise required fields
    valid_intents = {"COMPLAINT", "FEEDBACK", "NEUTRAL_STATEMENT", "PRAISE"}
    valid_tags    = {"NO_RESPONSE", "UNWARRANTED_APOLOGY", "HIGH_RATING_APOLOGY",
                     "LOW_RATING_NO_EMPATHY", "GENERIC_TEMPLATE", "WRONG_ISSUE",
                     "NO_SOLUTION", "CORRECT"}

    intent      = result.get("intent", "FEEDBACK")
    quality_tag = result.get("quality_tag", "NO_RESPONSE")

    if intent not in valid_intents:
        intent = "FEEDBACK"
    if quality_tag not in valid_tags:
        quality_tag = "NO_RESPONSE"

    review["intent"]          = intent
    review["themes"]          = result.get("themes", [])[:3]
    review["quality_tag"]     = quality_tag
    review["suggested_reply"] = result.get("suggested_reply")   # may be null
    review["llm_reasoning"]   = result.get("reasoning", "")
    return review


# ── Main ─────────────────────────────────────────────────────────────────────────

def run(force: bool = False, dry_run: bool = False, limit: int = 0):
    print("=" * 70)
    print(f"McAfee Review Classifier{'  [DRY RUN]' if dry_run else ''}")
    print("=" * 70)

    cfg = load_config()
    skip_tagged = cfg.get("skip_already_classified", True) and not force

    # Load data
    with open(DATA_FILE) as f:
        data = json.load(f)
    reviews = data.get("recent_reviews", [])
    print(f"Loaded {len(reviews)} reviews from {DATA_FILE}")

    # Select untagged reviews
    to_classify = [r for r in reviews if not skip_tagged or not r.get("quality_tag")]
    if limit:
        to_classify = to_classify[:limit]
    print(f"Reviews to classify: {len(to_classify)}"
          + (" (--force: re-classifying all)" if force else ""))

    if not to_classify:
        print("Nothing to classify — all reviews already tagged.")
        return

    # Detect backend
    print("\nDetecting LLM backend...")
    backend  = detect_backend(cfg)
    template = cfg["prompt_template"]

    # Classify
    print(f"\nClassifying {len(to_classify)} reviews...\n")
    errors = 0
    for i, review in enumerate(to_classify, 1):
        rid = review.get("id", f"#{i}")
        snippet = (review.get("content") or "")[:60].replace("\n", " ")
        print(f"  [{i}/{len(to_classify)}] {rid}  \"{snippet}...\"", end="", flush=True)
        try:
            classify_review(review, backend, template)
            print(f"  → {review['quality_tag']}")
        except Exception as e:
            print(f"  ✗ ERROR: {e}")
            errors += 1
            # Leave review unchanged so it can be retried next run

    # Quality tag distribution summary
    all_tags   = [r.get("quality_tag", "UNCLASSIFIED") for r in reviews]
    tag_counts = {}
    for t in all_tags:
        tag_counts[t] = tag_counts.get(t, 0) + 1
    print("\nQuality tag distribution:")
    for tag, count in sorted(tag_counts.items(), key=lambda x: -x[1]):
        pct = count / len(reviews) * 100
        print(f"  {tag:<30} {count:>4}  ({pct:.1f}%)")

    if errors:
        print(f"\n⚠ {errors} review(s) failed to classify — will be retried on next run")

    # Save
    if not dry_run:
        tmp = DATA_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, DATA_FILE)
        print(f"\n✅ Saved → {DATA_FILE}")
    else:
        print("\n[DRY RUN] Results not saved")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="McAfee Review LLM Classifier")
    parser.add_argument("--force",   action="store_true",
                        help="Re-classify all reviews, even already-tagged ones")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print results without saving")
    parser.add_argument("--limit",   type=int, default=0,
                        help="Process at most N reviews (useful for testing)")
    args = parser.parse_args()
    run(force=args.force, dry_run=args.dry_run, limit=args.limit)
