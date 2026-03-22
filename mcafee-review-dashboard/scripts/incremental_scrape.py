#!/usr/bin/env python3
"""
Incremental Review Scraper — McAfee Reviews
Builds on top of existing data; only fetches new reviews since last run.

Run modes:
  python incremental_scrape.py          # incremental (default)
  python incremental_scrape.py --full   # full rescrape (replaces all)
  python incremental_scrape.py --dry-run  # simulate without saving

Checkpoint file: docs/data/scrape_checkpoint.json
Output file:     docs/data/dashboard_data.json
"""

import json
import os
import sys
import hashlib
import argparse
from datetime import datetime, timedelta
from collections import defaultdict

# ── optional live-scraping deps (skipped gracefully if not available) ──────────
try:
    from google_play_scraper import Sort, reviews as gp_reviews
    HAS_GP = True
except ImportError:
    HAS_GP = False

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# ── file paths ─────────────────────────────────────────────────────────────────
BASE_DIR       = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE    = os.path.join(BASE_DIR, "docs", "data", "dashboard_data.json")
CHECKPOINT_FILE = os.path.join(BASE_DIR, "docs", "data", "scrape_checkpoint.json")


# ══════════════════════════════════════════════════════════════════════════════
# CHECKPOINT MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

def load_checkpoint() -> dict:
    """Load last-run state. Returns empty dict if first run."""
    if not os.path.exists(CHECKPOINT_FILE):
        return {}
    with open(CHECKPOINT_FILE) as f:
        return json.load(f)


def save_checkpoint(cp: dict):
    os.makedirs(os.path.dirname(CHECKPOINT_FILE), exist_ok=True)
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump(cp, f, indent=2)
    print(f"  ✓ Checkpoint saved → {CHECKPOINT_FILE}")


# ══════════════════════════════════════════════════════════════════════════════
# DEDUPLICATION KEY
# ══════════════════════════════════════════════════════════════════════════════

def review_key(review: dict) -> str:
    """
    Stable, collision-resistant dedup key.
    Uses platform + author + date + first-80-chars of content.
    Hash → 16-char hex so it's compact in sets.
    """
    content = review.get("content") or review.get("text") or ""
    raw = f"{review['platform']}|{review.get('author','?')}|{review['date']}|{content[:80]}"
    return hashlib.md5(raw.encode()).hexdigest()[:16]


def assign_ids(reviews: list) -> list:
    """Ensure every review has a stable 'id' field."""
    for r in reviews:
        if not r.get("id"):
            r["id"] = review_key(r)
    return reviews


# ══════════════════════════════════════════════════════════════════════════════
# PLATFORM SCRAPERS (incremental-aware)
# ══════════════════════════════════════════════════════════════════════════════

def scrape_google_play(since_date: datetime | None, max_count: int = 500) -> list:
    """
    Fetch Google Play reviews.
    If since_date is set, only returns reviews after that date (incremental).
    """
    if not HAS_GP:
        print("  ⚠ google-play-scraper not installed — skipping Google Play")
        return []

    print(f"  Scraping Google Play {'(incremental since ' + since_date.strftime('%Y-%m-%d') + ')' if since_date else '(full)'}...")
    try:
        result, _ = gp_reviews(
            "com.wsandroid.suite",
            lang="en", country="us",
            sort=Sort.NEWEST,
            count=max_count,
            filter_score_with=None,
        )
    except Exception as e:
        print(f"  ✗ Google Play error: {e}")
        return []

    reviews = []
    cutoff = since_date if since_date else (datetime.now() - timedelta(days=90))

    for r in result:
        review_dt = r["at"]
        if isinstance(review_dt, str):
            review_dt = datetime.fromisoformat(review_dt)
        if review_dt < cutoff:
            break   # Sorted by newest — stop as soon as we pass the cutoff
        reviews.append({
            "platform":            "google_play",
            "author":              r["userName"],
            "rating":              r["score"],
            "content":             r["content"],
            "date":                review_dt.strftime("%Y-%m-%d"),
            "title":               (r.get("title") or "")[:50],
            "helpful_count":       r.get("thumbsUpCount", 0),
            "developer_reply":     r.get("replyContent") or "",
            "developer_reply_date": r["replyAt"].strftime("%Y-%m-%d") if r.get("replyAt") else "",
        })

    print(f"    ✓ {len(reviews)} new Google Play reviews")
    return reviews


def scrape_app_store_rss(country: str = "us", since_date: datetime | None = None) -> list:
    if not HAS_REQUESTS:
        return []
    url = f"https://itunes.apple.com/{country}/rss/customerreviews/id=724596345/sortBy=mostRecent/json"
    try:
        resp = requests.get(url, timeout=30)
        data = resp.json()
        reviews = []
        cutoff = since_date if since_date else (datetime.now() - timedelta(days=90))

        for entry in data.get("feed", {}).get("entry", [])[1:]:
            try:
                date_str = entry.get("updated", {}).get("label", "")[:10]
                review_dt = datetime.strptime(date_str, "%Y-%m-%d")
                if review_dt < cutoff:
                    continue
                title   = entry.get("title", {}).get("label", "")
                content = entry.get("content", {}).get("label", "")
                reviews.append({
                    "platform":        "app_store",
                    "author":          entry.get("author", {}).get("name", {}).get("label", "Anonymous"),
                    "rating":          int(entry.get("im:rating", {}).get("label", 3)),
                    "content":         f"{title}\n\n{content}" if title else content,
                    "date":            date_str,
                    "title":           title,
                    "helpful_count":   0,
                    "developer_reply": "",
                    "developer_reply_date": "",
                })
            except Exception:
                continue
        return reviews
    except Exception:
        return []


def scrape_app_store(since_date: datetime | None = None) -> list:
    if not HAS_REQUESTS:
        print("  ⚠ requests not installed — skipping App Store")
        return []

    print(f"  Scraping App Store {'(incremental)' if since_date else '(full)'}...")
    countries = ["us", "gb", "ca", "au", "de", "fr", "jp", "in", "nl", "se"]
    all_reviews, seen_keys = [], set()
    for country in countries:
        for r in scrape_app_store_rss(country, since_date):
            k = review_key(r)
            if k not in seen_keys:
                seen_keys.add(k)
                all_reviews.append(r)

    print(f"    ✓ {len(all_reviews)} new App Store reviews")
    return all_reviews


# ══════════════════════════════════════════════════════════════════════════════
# ANALYSIS HELPERS - IMPROVED (Exp 008-012)
# ══════════════════════════════════════════════════════════════════════════════

def analyze_themes(content: str) -> list:
    """Extract themes from review content - IMPROVED VERSION"""
    content_lower = content.lower()
    themes = []
    
    # PERFORMANCE (Exp 008) - Context-aware
    def has_performance_issue(text):
        strong = ['slow', 'lag', 'lags', 'freeze', 'freezes', 'frozen', 
                  'sluggish', 'unresponsive', 'hangs', 'hanging', 'stuck']
        if any(kw in text for kw in strong):
            return True
        
        contextual = ['battery', 'drain', 'memory', 'cpu', 'ram']
        negative = ['drain', 'drains', 'draining', 'eats', 'consumes', 'kills',
                    'wastes', 'hog', 'hogs', 'slow', 'slows', 'slower', 'freeze',
                    'freezes', 'worse', 'terrible', 'bad', 'problem', 'issues']
        
        for kw in contextual:
            if kw in text:
                idx = text.find(kw)
                window = text[max(0, idx-50):min(len(text), idx+50)]
                if any(neg in window for neg in negative):
                    return True
        
        neutral = ['speed', 'performance']
        for kw in neutral:
            if kw in text:
                idx = text.find(kw)
                window = text[max(0, idx-50):min(len(text), idx+50)]
                if any(neg in window for neg in negative):
                    return True
        return False
    
    if has_performance_issue(content_lower):
        themes.append("Performance")
    
    # VPN (Exp 009) - Expanded
    vpn_keywords = {
        'direct': ['vpn', 'virtual private network', 'virtual private'],
        'ip_related': ['ip hiding', 'hide my ip', 'hide ip', 'mask ip', 'ip mask'],
        'location': ['change location', 'location masking', 'fake location', 'geo location'],
        'connection': ['secure connection', 'private connection', 'encrypted connection'],
        'browsing': ['private browsing', 'anonymous browsing', 'hide browsing'],
    }
    exclude = ['no vpn', 'without vpn', 'disconnected from vpn', 'never use']
    if not any(e in content_lower for e in exclude):
        for keywords in vpn_keywords.values():
            if any(kw in content_lower for kw in keywords):
                themes.append("VPN")
                break
    
    # POP-UPS/ADS (Exp 010) - Check before UI/UX
    popup_keywords = ['popup', 'pop-up', 'pop-ups', 'pop up', 'notification', 'banner', 
                      'interstitial', 'alert', 'ads', 'advertisement', 'promo', 'upsell']
    if any(kw in content_lower for kw in popup_keywords):
        themes.append("Pop-ups/Ads")
    
    # UI/UX (Exp 010)
    if "Pop-ups/Ads" not in themes:
        ui_keywords = ['interface', 'design', 'ui', 'user interface', 'layout', 'navigation',
                       'menu', 'menus', 'button', 'screen', 'confusing', 'cluttered', 
                       'hard to use', 'difficult to use']
        if any(kw in content_lower for kw in ui_keywords):
            themes.append("UI/UX")
    
    # CUSTOMER SUPPORT (Exp 011)
    support_keywords = ['customer support', 'tech support', 'support team', 'support agent',
                        'customer service', 'contacted support', 'called support', 
                        'support ticket', 'rude', 'unhelpful', 'unresponsive']
    if any(kw in content_lower for kw in support_keywords):
        themes.append("Customer Support")
    elif 'help' in content_lower:
        positive_help = ['helps me', 'very helpful', 'really helpful', 'helpful app', 'helped me']
        if not any(pos in content_lower for pos in positive_help):
            support_ctx = ['support', 'representative', 'agent', 'ticket', 'case', 'response']
            if any(ctx in content_lower for ctx in support_ctx):
                themes.append("Customer Support")
    
    # AUTO-RENEWAL (Exp 012)
    auto_renewal = ['auto-renew', 'auto renew', 'automatic renewal', 'charged without notice',
                    'didnt know', 'never agreed', 'hard to cancel', 'impossible to cancel', 'refund']
    if any(kw in content_lower for kw in auto_renewal):
        themes.append("Auto-Renewal")
    
    # PRICING (Exp 012)
    pricing = ['price', 'cost', 'expensive', 'cheap', 'money', 'subscription', 
               'fee', 'payment', 'billing', 'pricing']
    if any(kw in content_lower for kw in pricing):
        themes.append("Pricing")
    
    # OTHER THEMES
    other = {
        "Security Features": ['antivirus', 'protection', 'virus', 'malware', 'safe', 'protect', 'threat'],
        "Dark Web": ['dark web', 'leaked', 'breach', 'monitoring', 'identity theft'],
        "Scam/Phishing": ['scam', 'phishing', 'fraud', 'fake'],
        "Installation": ['install', 'setup', 'uninstall', 'remove', 'bloatware'],
        "App Issues": ['crash', 'bug', 'error', 'not working', 'broken', 'glitch', 'frozen'],
    }
    for theme, keywords in other.items():
        if any(kw in content_lower for kw in keywords):
            themes.append(theme)
    
    return themes[:3]


# Legacy compatibility
_THEME_KEYWORDS = {}


def analyze_sentiment(rating: int) -> dict:
    if rating >= 4:
        return {"label": "positive", "compound": 0.5 + (rating - 4) * 0.25}
    if rating == 3:
        return {"label": "neutral",  "compound": 0.0}
    return {"label": "negative", "compound": -0.5 - (2 - rating) * 0.25}


def generate_suggested_reply(review: dict) -> str:
    c = (review.get("content") or "").lower()
    r = review["rating"]
    if r >= 4:
        return "Thank you for your positive feedback! We're thrilled you're enjoying McAfee's protection."
    if any(w in c for w in ["charged", "billing", "payment", "refund", "auto-renew"]):
        return "We sincerely apologize for the billing issue. Please contact us at 1-866-622-3911 so we can resolve this within 24 hours."
    if any(w in c for w in ["popup", "pop-up", "annoying", "constant"]):
        return "You can disable notifications: McAfee → Settings → General → turn off 'Product and service notifications'."
    if any(w in c for w in ["uninstall", "remove", "delete"]):
        return "Please use our dedicated removal tool at download.mcafee.com/mcpR.aspx. If it still fails, call 1-866-622-3911."
    if any(w in c for w in ["cancel", "impossible to cancel"]):
        return "You can cancel at mcafee.com/myaccount or call 1-866-622-3911. We apologize for any difficulty."
    if r <= 2:
        return "We apologize for your experience. Please contact support at 1-866-622-3911 with your account details."
    return "Thank you for your feedback. Please reach out at mcafee.com/support if we can help further."


def enrich_review(review: dict) -> dict:
    """Add themes, sentiment, suggested_reply, and id to a raw review."""
    content = review.get("content") or review.get("text") or ""
    review.setdefault("themes",          analyze_themes(content))
    review.setdefault("sentiment",       analyze_sentiment(review["rating"]))
    review.setdefault("suggested_reply", generate_suggested_reply(review))
    review.setdefault("id",              review_key(review))
    return review


# ══════════════════════════════════════════════════════════════════════════════
# MERGE LOGIC (the core of incremental scraping)
# ══════════════════════════════════════════════════════════════════════════════

def merge_reviews(existing: list, new_raw: list) -> tuple[list, int, int]:
    """
    Merge new reviews into existing list.
    Returns: (merged_list, added_count, updated_count)
    - Reviews are identified by their stable `id` key
    - If a review's id already exists, we UPDATE it (reply may have been added)
    - New reviews are inserted, list stays sorted by date desc
    """
    # Build lookup of existing reviews by id
    index = {r["id"]: i for i, r in enumerate(existing)}
    merged = list(existing)   # copy
    added = updated = 0

    for raw in new_raw:
        enriched = enrich_review(raw)
        rid = enriched["id"]
        if rid in index:
            # Update in-place — developer may have replied since last run
            old = merged[index[rid]]
            if enriched.get("developer_reply") and not old.get("developer_reply"):
                merged[index[rid]] = enriched
                updated += 1
        else:
            merged.append(enriched)
            index[rid] = len(merged) - 1
            added += 1

    # Sort by date descending, then by author for stable ordering
    merged.sort(key=lambda r: (r["date"], r.get("author", "")), reverse=True)
    return merged, added, updated


# ══════════════════════════════════════════════════════════════════════════════
# DAILY STATS REBUILD (fast, from merged reviews)
# ══════════════════════════════════════════════════════════════════════════════

def build_daily_stats(reviews: list) -> list:
    by_date = defaultdict(lambda: {
        "total": 0, "positive": 0, "negative": 0, "neutral": 0,
        "platforms": defaultdict(int), "ratings": [], "with_reply": 0,
    })
    for r in reviews:
        d = by_date[r["date"]]
        d["total"] += 1
        d["ratings"].append(r["rating"])
        d["platforms"][r["platform"]] += 1
        d[r["sentiment"]["label"]] += 1
        if r.get("developer_reply"):
            d["with_reply"] += 1

    stats = []
    for date in sorted(by_date):
        d = by_date[date]
        avg = sum(d["ratings"]) / len(d["ratings"]) if d["ratings"] else 0
        stats.append({
            "date": date,
            "total_reviews": d["total"],
            "avg_rating": round(avg, 2),
            "sentiment_distribution": {
                "positive": d["positive"], "negative": d["negative"], "neutral": d["neutral"],
            },
            "platform_counts": dict(d["platforms"]),
            "developer_responses": d["with_reply"],
        })
    return stats


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def build_metadata(reviews: list) -> dict:
    dates = [r["date"] for r in reviews]
    gp  = sum(1 for r in reviews if r["platform"] == "google_play")
    ast = sum(1 for r in reviews if r["platform"] == "app_store")
    win = sum(1 for r in reviews if r["platform"] == "windows_desktop")
    with_reply = sum(1 for r in reviews if r.get("developer_reply"))
    avg = sum(r["rating"] for r in reviews) / len(reviews) if reviews else 0

    return {
        "generated_at": datetime.now().isoformat(),
        "source": "incremental_scraped_data",
        "platforms": ["google_play", "app_store", "windows_desktop"],
        "total_reviews": len(reviews),
        "avg_rating": round(avg, 2),
        "platform_distribution": {"google_play": gp, "app_store": ast, "windows_desktop": win},
        "date_range": f"{min(dates)} to {max(dates)}" if dates else "N/A",
        "developer_responses": {
            "total_with_replies": with_reply,
            "response_rate": round(with_reply / len(reviews) * 100, 1) if reviews else 0,
        },
        "scraping_mode": "incremental",
        "columns": {
            "id":                  "Stable dedup key (MD5 hash)",
            "developer_reply":     "Actual McAfee response (if any)",
            "suggested_reply":     "AI-generated improved response",
            "developer_reply_date":"When McAfee responded",
        },
    }


def run(full: bool = False, dry_run: bool = False):
    print("=" * 70)
    print(f"McAfee Review Scraper — INCREMENTAL{'  [DRY RUN]' if dry_run else ''}")
    print("=" * 70)

    # ── 1. Load existing data ─────────────────────────────────────────────────
    existing_reviews = []
    if os.path.exists(OUTPUT_FILE) and not full:
        with open(OUTPUT_FILE) as f:
            old_data = json.load(f)
        existing_reviews = assign_ids(old_data.get("recent_reviews", []))
        print(f"Loaded {len(existing_reviews)} existing reviews from {OUTPUT_FILE}")
    else:
        print("Full rescrape — starting from scratch")

    # ── 2. Determine cutoff date ──────────────────────────────────────────────
    cp = load_checkpoint()
    last_run = cp.get("last_run")

    if full or not last_run or not existing_reviews:
        since_date = None   # fetch up to 90 days
    else:
        # Go back 2 days before last run to catch any late-posted reviews
        since_date = datetime.fromisoformat(last_run) - timedelta(days=2)
        print(f"Incremental mode: fetching reviews newer than {since_date.strftime('%Y-%m-%d')}")

    # ── 3. Scrape new data ────────────────────────────────────────────────────
    new_raw = []
    new_raw.extend(scrape_google_play(since_date))
    new_raw.extend(scrape_app_store(since_date))
    # Trustpilot / Windows reviews: hardcoded set, only add on full run
    if full or not existing_reviews:
        print("  Adding static Trustpilot/Windows reviews...")
        new_raw.extend(_static_windows_reviews())

    print(f"\nFetched {len(new_raw)} raw reviews from platforms")

    # ── 4. Merge ──────────────────────────────────────────────────────────────
    merged, added, updated = merge_reviews(existing_reviews, new_raw)
    print(f"\nMerge result: +{added} new  |  {updated} updated  |  {len(merged)} total")

    if added == 0 and updated == 0:
        print("Nothing new — output unchanged.")
        return

    # ── 5. Rebuild daily stats ────────────────────────────────────────────────
    daily_stats = build_daily_stats(merged)

    # ── 6. Save ───────────────────────────────────────────────────────────────
    output = {
        "metadata":       build_metadata(merged),
        "daily_stats":    daily_stats,
        "recent_reviews": merged,
    }

    if not dry_run:
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        # Atomic write (write to .tmp then rename)
        tmp = OUTPUT_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(output, f, indent=2)
        os.replace(tmp, OUTPUT_FILE)
        print(f"\n✅ Saved {len(merged)} reviews → {OUTPUT_FILE}")

        save_checkpoint({
            "last_run":        datetime.now().isoformat(),
            "total_reviews":   len(merged),
            "last_added":      added,
            "last_updated":    updated,
            "latest_date":     merged[0]["date"] if merged else None,
        })
    else:
        print(f"\n[DRY RUN] Would save {len(merged)} reviews (not written)")

    print(f"\n📊 Summary:")
    print(f"  Total:       {len(merged)}")
    print(f"  Added:       {added}")
    print(f"  Updated:     {updated}")
    print(f"  Date range:  {output['metadata']['date_range']}")
    print(f"  Avg rating:  {output['metadata']['avg_rating']}")
    print(f"  Reply rate:  {output['metadata']['developer_responses']['response_rate']}%")


def _static_windows_reviews() -> list:
    """Trustpilot/Windows reviews — hardcoded, included only on full runs."""
    return [
        {"platform": "windows_desktop", "author": "Jay", "rating": 1,
         "content": "Mcafee has come pre-downloaded on the last few laptops I've gotten. It sends so many pop-ups asking you to renew your protection!", "date": "2026-01-15", "title": "Worse than a computer virus", "helpful_count": 1, "developer_reply": "", "developer_reply_date": ""},
        {"platform": "windows_desktop", "author": "Dick Searle", "rating": 1,
         "content": "Scammers, one star is one too many! Had to purchase their protection and autorenew no other way after they filled my screen with annoying pop ups.", "date": "2026-01-28", "title": "Scammers", "helpful_count": 1, "developer_reply": "", "developer_reply_date": ""},
        {"platform": "windows_desktop", "author": "Martin Burke", "rating": 1,
         "content": "McAfee have taken four annual payments despite us having cancelled. Scammers in plain sight.", "date": "2025-10-18", "title": "Scammers in plain sight", "helpful_count": 1, "developer_reply": "", "developer_reply_date": ""},
        {"platform": "windows_desktop", "author": "Jerry Czernel", "rating": 5,
         "content": "Super skilled customer service representative JENNY did a great job. Patient, knowledgeable, and polite.", "date": "2026-01-16", "title": "Great customer service", "helpful_count": 1, "developer_reply": "", "developer_reply_date": ""},
        {"platform": "windows_desktop", "author": "Karl Y", "rating": 1,
         "content": "Impossible to remove and cancel subscription. The option is not available if you follow the instructions.", "date": "2026-01-22", "title": "Impossible to cancel", "helpful_count": 0, "developer_reply": "", "developer_reply_date": ""},
    ]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="McAfee Incremental Review Scraper")
    parser.add_argument("--full",    action="store_true", help="Full rescrape (ignore checkpoint)")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without saving")
    args = parser.parse_args()
    run(full=args.full, dry_run=args.dry_run)
