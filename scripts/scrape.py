#!/usr/bin/env python3
"""
McAfee Review Scraper — Incremental mode by default.

Fetches new Google Play and App Store reviews since the last run,
merges them into docs/data/dashboard_data.json, and saves a checkpoint.

Usage:
    python scripts/scrape.py              # incremental (since last checkpoint)
    python scripts/scrape.py --full       # full rescrape, default window 90 days
    python scripts/scrape.py --days 180   # rescrape last N days (implies --full)
    python scripts/scrape.py --dry-run    # simulate without writing files

    Note: Google Play's API typically returns up to ~500 reviews per request,
    regardless of date range.  For very long windows (--days 365+) the date
    filter is applied to whatever the API returns, so you may not get complete
    coverage of older dates.

Sources:
    Google Play  : com.wsandroid.suite  (via google-play-scraper)
    App Store    : id=724596345         (via iTunes RSS, 10 countries)
    Windows      : static Trustpilot reviews (added on full/days runs)

Checkpoint file : docs/data/scrape_checkpoint.json
Output file     : docs/data/dashboard_data.json
"""

import argparse
import hashlib
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta

# Optional live-scraping deps — skipped gracefully if missing
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

# ── File paths ─────────────────────────────────────────────────────────────────
BASE_DIR        = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE     = os.path.join(BASE_DIR, "docs", "data", "dashboard_data.json")
CHECKPOINT_FILE = os.path.join(BASE_DIR, "docs", "data", "scrape_checkpoint.json")

GOOGLE_PLAY_APP_ID  = "com.wsandroid.suite"
APP_STORE_APP_ID    = "724596345"
APP_STORE_COUNTRIES = ["us", "gb", "ca", "au", "de", "fr", "jp", "in", "nl", "se"]


# ── Checkpoint ─────────────────────────────────────────────────────────────────

def load_checkpoint() -> dict:
    if not os.path.exists(CHECKPOINT_FILE):
        return {}
    with open(CHECKPOINT_FILE) as f:
        return json.load(f)


def save_checkpoint(cp: dict):
    os.makedirs(os.path.dirname(CHECKPOINT_FILE), exist_ok=True)
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump(cp, f, indent=2)
    print(f"  ✓ Checkpoint saved → {CHECKPOINT_FILE}")


# ── Deduplication ───────────────────────────────────────────────────────────────

def review_key(review: dict) -> str:
    """Stable hash key: platform + author + date + first 80 chars of content."""
    content = review.get("content") or review.get("text") or ""
    raw = f"{review['platform']}|{review.get('author', '?')}|{review['date']}|{content[:80]}"
    return hashlib.md5(raw.encode()).hexdigest()[:16]


def assign_ids(reviews: list) -> list:
    for r in reviews:
        if not r.get("id"):
            r["id"] = review_key(r)
    return reviews


# ── Scrapers ────────────────────────────────────────────────────────────────────

def scrape_google_play(since: datetime | None, max_count: int = 500) -> list:
    if not HAS_GP:
        print("  ⚠ google-play-scraper not installed — skipping Google Play")
        return []
    label = f"(since {since.strftime('%Y-%m-%d')})" if since else "(full 90 days)"
    print(f"  Scraping Google Play {label}...")
    try:
        result, _ = gp_reviews(
            GOOGLE_PLAY_APP_ID,
            lang="en", country="us",
            sort=Sort.NEWEST,
            count=max_count,
            filter_score_with=None,
        )
    except Exception as e:
        print(f"  ✗ Google Play error: {e}")
        return []

    cutoff = since or (datetime.now() - timedelta(days=90))
    reviews = []
    for r in result:
        dt = r["at"]
        if isinstance(dt, str):
            dt = datetime.fromisoformat(dt)
        if dt < cutoff:
            break  # newest-first — safe to stop
        reviews.append({
            "platform":             "google_play",
            "author":               r["userName"],
            "rating":               r["score"],
            "content":              r["content"],
            "date":                 dt.strftime("%Y-%m-%d"),
            "title":                (r.get("title") or "")[:50],
            "helpful_count":        r.get("thumbsUpCount", 0),
            "developer_reply":      r.get("replyContent") or "",
            "developer_reply_date": r["replyAt"].strftime("%Y-%m-%d") if r.get("replyAt") else "",
        })
    print(f"    ✓ {len(reviews)} Google Play reviews")
    return reviews


def _app_store_rss(country: str, since: datetime | None) -> list:
    url = (f"https://itunes.apple.com/{country}/rss/customerreviews"
           f"/id={APP_STORE_APP_ID}/sortBy=mostRecent/json")
    try:
        resp = requests.get(url, timeout=30)
        data = resp.json()
        cutoff = since or (datetime.now() - timedelta(days=90))
        reviews = []
        for entry in data.get("feed", {}).get("entry", [])[1:]:
            try:
                date_str = entry.get("updated", {}).get("label", "")[:10]
                dt = datetime.strptime(date_str, "%Y-%m-%d")
                if dt < cutoff:
                    continue
                title   = entry.get("title", {}).get("label", "")
                content = entry.get("content", {}).get("label", "")
                reviews.append({
                    "platform":             "app_store",
                    "author":               entry.get("author", {}).get("name", {}).get("label", "Anonymous"),
                    "rating":               int(entry.get("im:rating", {}).get("label", 3)),
                    "content":              f"{title}\n\n{content}" if title else content,
                    "date":                 date_str,
                    "title":               title,
                    "helpful_count":        0,
                    "developer_reply":      "",
                    "developer_reply_date": "",
                })
            except Exception:
                continue
        return reviews
    except Exception:
        return []


def scrape_app_store(since: datetime | None) -> list:
    if not HAS_REQUESTS:
        print("  ⚠ requests not installed — skipping App Store")
        return []
    label = f"(since {since.strftime('%Y-%m-%d')})" if since else "(full 90 days)"
    print(f"  Scraping App Store {label}...")
    all_reviews, seen = [], set()
    for country in APP_STORE_COUNTRIES:
        for r in _app_store_rss(country, since):
            k = review_key(r)
            if k not in seen:
                seen.add(k)
                all_reviews.append(r)
    print(f"    ✓ {len(all_reviews)} App Store reviews")
    return all_reviews


def static_windows_reviews() -> list:
    """Trustpilot / Windows desktop reviews — hardcoded, added only on full runs."""
    return [
        {"platform": "windows_desktop", "author": "Jay", "rating": 1,
         "content": "McAfee came pre-downloaded on my laptop. Sends so many pop-ups asking to renew. Worse than a virus.",
         "date": "2026-01-15", "title": "Worse than a virus", "helpful_count": 1,
         "developer_reply": "", "developer_reply_date": ""},
        {"platform": "windows_desktop", "author": "Dick Searle", "rating": 1,
         "content": "Scammers. Had to purchase after pop-ups filled my screen threatening banking details were at risk. Auto-renew impossible to disable.",
         "date": "2026-01-28", "title": "Scammers", "helpful_count": 1,
         "developer_reply": "", "developer_reply_date": ""},
        {"platform": "windows_desktop", "author": "Martin Burke", "rating": 1,
         "content": "McAfee took four annual payments despite us having cancelled. Scammers in plain sight.",
         "date": "2025-10-18", "title": "Scammers in plain sight", "helpful_count": 1,
         "developer_reply": "", "developer_reply_date": ""},
        {"platform": "windows_desktop", "author": "Jerry Czernel", "rating": 5,
         "content": "Super skilled customer service rep JENNY did a great job. Patient, knowledgeable, and polite.",
         "date": "2026-01-16", "title": "Great customer service", "helpful_count": 1,
         "developer_reply": "", "developer_reply_date": ""},
        {"platform": "windows_desktop", "author": "Karl Y", "rating": 1,
         "content": "Impossible to remove and cancel subscription. Option not available if you follow their instructions.",
         "date": "2026-01-22", "title": "Impossible to cancel", "helpful_count": 0,
         "developer_reply": "", "developer_reply_date": ""},
        {"platform": "windows_desktop", "author": "Jonathan Sands", "rating": 1,
         "content": "Disgusted with auto-renew. Took £129 for a year while new customers pay £19.99. Why penalise loyal customers?",
         "date": "2026-03-15", "title": "Auto-renew rip off", "helpful_count": 0,
         "developer_reply": "", "developer_reply_date": ""},
    ]


# ── Analysis helpers ────────────────────────────────────────────────────────────

def analyze_themes(content: str) -> list:
    """Rule-based theme extraction — up to 3 themes per review."""
    t = content.lower()
    themes = []

    # Performance — context-aware
    perf_strong = ["slow", "lag", "lags", "freeze", "freezes", "frozen",
                   "sluggish", "unresponsive", "hangs", "hanging", "stuck"]
    perf_ctx    = ["battery", "drain", "memory", "cpu", "ram", "speed", "performance"]
    perf_neg    = ["drain", "drains", "eats", "consumes", "kills", "hog", "slow",
                   "freeze", "worse", "terrible", "bad", "problem", "issues"]
    if any(k in t for k in perf_strong) or any(
        (k in t and any(n in t[max(0, t.find(k)-50):t.find(k)+50] for n in perf_neg))
        for k in perf_ctx
    ):
        themes.append("Performance")

    # VPN
    vpn_kw = ["vpn", "virtual private network", "hide my ip", "mask ip",
               "ip address", "change location", "geo location",
               "private browsing", "anonymous browsing"]
    vpn_ex = ["no vpn", "without vpn", "disconnected from vpn"]
    if not any(e in t for e in vpn_ex) and any(k in t for k in vpn_kw):
        themes.append("VPN")

    # Pop-ups / Ads
    popup_kw = ["popup", "pop-up", "pop-ups", "pop up", "notification",
                "notifications", "banner", "alert", "ads", "advertisement",
                "upsell", "upgrade prompt"]
    if any(k in t for k in popup_kw):
        themes.append("Pop-ups/Ads")
    elif any(k in t for k in ["interface", "design", "ui", "layout", "navigation",
                               "confusing", "cluttered", "hard to use"]):
        themes.append("UI/UX")

    # Customer Support
    support_kw = ["customer support", "tech support", "support team", "support agent",
                  "customer service", "contacted support", "support ticket",
                  "rude", "unhelpful"]
    if any(k in t for k in support_kw):
        themes.append("Customer Support")

    # Auto-Renewal
    ar_kw = ["auto-renew", "auto renew", "automatic renewal", "charged without",
             "didn't know", "never agreed", "hard to cancel", "impossible to cancel",
             "can't cancel", "refund", "cancel subscription", "cancellation"]
    if any(k in t for k in ar_kw):
        themes.append("Auto-Renewal")

    # Pricing (general)
    price_kw = ["price", "cost", "expensive", "cheap", "money", "subscription",
                "fee", "payment", "billing", "pricing"]
    if any(k in t for k in price_kw):
        themes.append("Pricing")

    # Other themes
    other = {
        "Security Features": ["antivirus", "protection", "virus", "malware", "safe",
                              "protect", "threat", "detection"],
        "Dark Web":          ["dark web", "leaked", "breach", "monitoring", "identity theft"],
        "Scam/Phishing":     ["scam", "phishing", "fraud", "fake"],
        "Installation":      ["install", "setup", "uninstall", "remove", "bloatware"],
        "App Issues":        ["crash", "bug", "error", "not working", "broken", "glitch"],
    }
    for theme, kw in other.items():
        if any(k in t for k in kw):
            themes.append(theme)

    return list(dict.fromkeys(themes))[:3]  # deduplicate + cap at 3


def analyze_sentiment(rating: int) -> dict:
    if rating >= 4:
        return {"label": "positive", "compound": 0.5 + (rating - 4) * 0.25}
    if rating == 3:
        return {"label": "neutral",  "compound": 0.0}
    return {"label": "negative", "compound": -0.5 - (2 - rating) * 0.25}


def enrich_review(review: dict) -> dict:
    """Add id, themes, sentiment, and a rule-based suggested_reply to a raw review."""
    content = review.get("content") or review.get("text") or ""
    review.setdefault("id",        review_key(review))
    review.setdefault("themes",    analyze_themes(content))
    review.setdefault("sentiment", analyze_sentiment(review["rating"]))
    # suggested_reply and quality_tag are added by classify.py (LLM step)
    return review


# ── Merge logic ─────────────────────────────────────────────────────────────────

def merge_reviews(existing: list, new_raw: list) -> tuple[list, int]:
    """
    Add genuinely new reviews to the existing list.

    Existing entries are never modified here — the review is stored exactly
    as it was when first scraped, including whatever developer_reply was
    present at that moment.  If that reply is blank, classify.py will tag it
    NO_RESPONSE and generate a fresh suggested reply.

    To intentionally reprocess a date window, re-scrape with --full/--days
    (which rebuilds from scratch) and then run classify.py --force.

    Returns (merged_list, added_count).
    """
    seen   = {r["id"] for r in existing}
    merged = list(existing)
    added  = 0

    for raw in new_raw:
        enriched = enrich_review(raw)
        if enriched["id"] not in seen:
            merged.append(enriched)
            seen.add(enriched["id"])
            added += 1

    merged.sort(key=lambda r: (r["date"], r.get("author", "")), reverse=True)
    return merged, added


# ── Stats builders ──────────────────────────────────────────────────────────────

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
            "date":                    date,
            "total_reviews":           d["total"],
            "avg_rating":              round(avg, 2),
            "sentiment_distribution":  {
                "positive": d["positive"],
                "negative": d["negative"],
                "neutral":  d["neutral"],
            },
            "platform_counts":         dict(d["platforms"]),
            "developer_responses":     d["with_reply"],
        })
    return stats


def build_metadata(reviews: list) -> dict:
    dates      = [r["date"] for r in reviews]
    gp         = sum(1 for r in reviews if r["platform"] == "google_play")
    ast        = sum(1 for r in reviews if r["platform"] == "app_store")
    win        = sum(1 for r in reviews if r["platform"] == "windows_desktop")
    with_reply = sum(1 for r in reviews if r.get("developer_reply"))
    avg        = sum(r["rating"] for r in reviews) / len(reviews) if reviews else 0

    return {
        "generated_at":         datetime.now().isoformat(),
        "source":               "incremental_scraped_data",
        "platforms":            ["google_play", "app_store", "windows_desktop"],
        "total_reviews":        len(reviews),
        "avg_rating":           round(avg, 2),
        "platform_distribution": {"google_play": gp, "app_store": ast, "windows_desktop": win},
        "date_range":           f"{min(dates)} to {max(dates)}" if dates else "N/A",
        "developer_responses":  {
            "total_with_replies": with_reply,
            "response_rate":      round(with_reply / len(reviews) * 100, 1) if reviews else 0,
        },
        "data_urls": {
            "google_play": f"https://play.google.com/store/apps/details?id={GOOGLE_PLAY_APP_ID}",
            "app_store":   f"https://apps.apple.com/us/app/id{APP_STORE_APP_ID}",
            "app_store_rss": f"https://itunes.apple.com/us/rss/customerreviews/id={APP_STORE_APP_ID}/sortBy=mostRecent/json",
        },
    }


# ── Main ────────────────────────────────────────────────────────────────────────

def run(full: bool = False, dry_run: bool = False, days: int = 90):
    print("=" * 70)
    print(f"McAfee Review Scraper{'  [DRY RUN]' if dry_run else ''}")
    print("=" * 70)

    is_full = full or days != 90  # --days implies a fresh window fetch

    # 1. Load existing data
    existing = []
    if os.path.exists(OUTPUT_FILE) and not is_full:
        with open(OUTPUT_FILE) as f:
            old = json.load(f)
        existing = assign_ids(old.get("recent_reviews", []))
        print(f"Loaded {len(existing)} existing reviews from {OUTPUT_FILE}")
    else:
        print(f"Full rescrape — window: last {days} days")

    # 2. Determine cutoff
    cp       = load_checkpoint()
    last_run = cp.get("last_run")
    if is_full or not last_run or not existing:
        since = datetime.now() - timedelta(days=days)
        if is_full:
            print(f"Fetching reviews since {since.strftime('%Y-%m-%d')} ({days} days)")
    else:
        # 2-day overlap catches reviews posted just before the last run that
        # may not have appeared immediately in the API.
        since = datetime.fromisoformat(last_run) - timedelta(days=2)
        print(f"Incremental mode: fetching reviews since {since.strftime('%Y-%m-%d')}")

    # 3. Scrape
    new_raw = []
    new_raw.extend(scrape_google_play(since))
    new_raw.extend(scrape_app_store(since))
    if is_full or not existing:
        print("  Adding static Windows/Trustpilot reviews...")
        new_raw.extend(static_windows_reviews())
    print(f"\nFetched {len(new_raw)} raw reviews")

    # 4. Merge
    merged, added = merge_reviews(existing, new_raw)
    print(f"Merge: +{added} new  |  {len(merged)} total")

    if added == 0:
        print("Nothing new — output unchanged.")
        return

    # 5. Build output
    output = {
        "metadata":       build_metadata(merged),
        "daily_stats":    build_daily_stats(merged),
        "recent_reviews": merged,
    }

    # 6. Save (atomic write)
    if not dry_run:
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        tmp = OUTPUT_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(output, f, indent=2)
        os.replace(tmp, OUTPUT_FILE)
        print(f"\n✅ Saved {len(merged)} reviews → {OUTPUT_FILE}")
        save_checkpoint({
            "last_run":      datetime.now().isoformat(),
            "total_reviews": len(merged),
            "last_added":    added,
            "latest_date":   merged[0]["date"] if merged else None,
        })
    else:
        print(f"\n[DRY RUN] Would save {len(merged)} reviews (not written)")

    print(f"\nSummary: total={len(merged)} | added={added}")
    print(f"  avg_rating={output['metadata']['avg_rating']} | "
          f"reply_rate={output['metadata']['developer_responses']['response_rate']}%")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="McAfee Review Scraper")
    parser.add_argument("--full",    action="store_true",
                        help="Full rescrape using the default 90-day window")
    parser.add_argument("--days",    type=int, default=90,
                        help="Lookback window in days for a full rescrape "
                             "(default: 90). Values >90 fetch further back. "
                             "Automatically implies --full.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Simulate without writing any files")
    args = parser.parse_args()
    run(full=args.full, dry_run=args.dry_run, days=args.days)
