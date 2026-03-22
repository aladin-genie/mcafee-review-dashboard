# McAfee Review Intelligence Dashboard

A comprehensive analytics dashboard for monitoring and analyzing McAfee product reviews across Google Play, App Store, and Windows platforms.

## 🎯 Features

### Overview Dashboard
- **Sentiment Trend** - Track positive/negative sentiment over time
- **Rating Trend** - Monitor average rating changes
- **Sentiment Distribution** - Pie chart of overall sentiment
- **Rating Distribution** - Bar chart of star ratings
- **Platform Breakdown** - Review volume by platform
- **Daily Volume** - Daily review counts
- **Top Themes** - Most mentioned themes in reviews

### Reviews Tab
- **Working Pagination** - 25 reviews per page with navigation
- **Advanced Filters**:
  - Platform (Google Play, App Store, Windows)
  - Rating (1-5 stars)
  - Sentiment (Positive, Neutral, Negative)
  - Notable/Alerts (Response Mismatch, No Response, Billing, Cancellation, Critical)
  - Search functionality
- **Response Mismatch Detection** - Flags where McAfee's response doesn't match review sentiment
- **Expandable McAfee Responses** - Click to view full response
- **AI-Generated Suggested Replies** - Context-aware, unique responses for each review
- **Reviewer Attribution** - Shows author name and date

### Data
- **584 Real Reviews** from 2026 onwards
- **Google Play:** 499 reviews
- **App Store:** 75 reviews  
- **Windows:** 10 reviews (Trustpilot)
- **83.4% Response Rate** from McAfee support team

## 🚀 Quick Start

```bash
cd mcafee-review-dashboard/docs
python3 -m http.server 8888
# Open http://localhost:8888
```

## 📁 Project Structure

```
mcafee-review-dashboard/
├── docs/
│   ├── index.html              # Main dashboard UI
│   ├── assets/
│   │   ├── dashboard.js        # Chart rendering & interactivity
│   │   └── style.css           # Dashboard styling
│   └── data/
│       └── dashboard_data.json # Review data (584 reviews)
├── scripts/
│   └── scrape_reviews.py       # Automated data collection
├── .github/workflows/
│   └── daily-scrape.yml        # GitHub Actions automation
├── DATA_COLLECTION.md          # Data source documentation
└── SUPPORT_RESPONSE_QUALITY_REPORT.md  # Analysis report
```

## 🔄 Automated Data Collection

The dashboard includes a GitHub Actions workflow that:
- Runs daily at 6 AM UTC
- Scrapes new reviews from Google Play and App Store
- Updates dashboard_data.json automatically
- Commits changes to repository

## 🎨 Customization

### Date Filtering
Default view is "Last 1 Month" but can be changed to:
- Last 1 Week
- Last 15 Days
- Last 3 Months
- Last 1 Year
- All Time

### Suggested Replies
AI-generated responses are context-aware and include:
- Specific facts (500+ VPN servers, 5M+ users, etc.)
- Troubleshooting steps
- Direct contact information
- Empathetic tone based on sentiment

## 📝 Key Insights

### Response Quality Issues Detected
- **0.4%** clear mismatches (response tone doesn't match review)
- **96.7%** of responses contain generic support links
- **76.4%** lack specific solutions

### Platform Differences
- **Mobile (iOS/Android):** ~4.0★ - Users choose to install
- **Windows Desktop:** ~1.3★ - Pre-installed bloatware complaints

## 🔒 Private Repository

This is a **private repository** containing proprietary analysis for McAfee.

## 🛠️ Tech Stack

- **Frontend:** Vanilla JavaScript, Plotly.js for charts
- **Data:** JSON, Python scraping scripts
- **Automation:** GitHub Actions
- **Visualization:** Plotly 2.27.0

## 📊 Data Sources

| Platform | Method | Reviews |
|----------|--------|---------|
| Google Play | google-play-scraper library | 499 |
| App Store | RSS feeds (multi-country) | 75 |
| Windows | Trustpilot | 10 |

All data is real user reviews, no synthetic data.

## 🎯 Roadmap

- [ ] Deploy to GitHub Pages
- [ ] Add email alerts for critical reviews
- [ ] Integrate with Slack for team notifications
- [ ] Export reports as PDF
- [ ] Add competitor comparison

---

**Created:** March 21, 2026
**Repository:** https://github.com/aladin-genie/mcafee-review-dashboard