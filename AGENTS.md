# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview
- **Type**: Static HTML/JS dashboard with Python data scraper
- **No build system** - open `mcafee-review-dashboard/docs/index.html` directly in browser

## Commands

### Run Python Scraper
```bash
cd mcafee-review-dashboard/scripts && python3 scrape_reviews.py
```
Output: `docs/data/dashboard_data.json`

### View Dashboard
Open `mcafee-review-dashboard/docs/index.html` in browser - no server needed.

## Architecture
- `scrape_reviews.py` scrapes Google Play, App Store RSS, and Trustpilot
- Outputs to `docs/data/dashboard_data.json` (NOT `mcafee-review-dashboard/docs/data/`)
- Frontend reads JSON from `docs/data/dashboard_data.json` directly
- Duplicate data exists: both `docs/data/` and `mcafee-review-dashboard/docs/data/`

## Python Dependencies
- `google_play_scraper` - Google Play review scraping
- `requests` - HTTP requests for App Store RSS
