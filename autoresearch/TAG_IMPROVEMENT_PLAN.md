# Autoresearch Plan: All Tag Categories Improvement

## Current Tag Categories Identified

### 1. THEME CLASSIFICATION TAGS (8 Categories)
From `analyze_themes()` in scrape_reviews.py:

| Theme | Current Keywords | F1 Score (Baseline) |
|-------|-----------------|---------------------|
| Performance | slow, fast, speed, performance, lag, battery, drain, memory, cpu, freeze | 0.68 |
| VPN | vpn, virtual private network, connection, ip address | 0.69 |
| Security Features | antivirus, protection, virus, malware, safe, protect, threat, detection, hacked, hack, safety | 0.83 |
| UI/UX | interface, design, confusing, ui, user interface, layout, navigation, menu, menus, cluttered, hard to use, difficult to use, usability, annoying | - |
| Customer Support | support, service, help, contact, response, customer | 0.79 |
| Pricing | price, cost, expensive, cheap, money, subscription, charge, charged, billing, payment, fee, renew, renewal, refund | 0.83 |
| Dark Web | dark web, leaked, breach, monitoring, identity theft, personal info | - |
| App Issues | crash, bug, freeze, error, not working, broken, glitch, hang, unresponsive, frozen, not responding, stuck, force close, failed, failure | - |
| Pop-ups/Ads | popup, pop-up, pop-ups, ads, advertisement, notification, banner, interstitial, promo, promotion | - |
| Installation | install, download, setup, installs, installer, uninstall, remove, bloatware | - |
| False Positives | false positive, blocked, legitimate, wrong detection | - |
| Auto-Renewal | auto-renew, auto renew, renewal, charged, bank, card, payment | - |
| Scam/Phishing | scam, phishing, text, email, fraud, fake | - |

### 2. RESPONSE QUALITY TAGS (8 Categories)
From `checkResponseQuality()` in dashboard.js:

| Quality Tag | Description | Current Issue |
|-------------|-------------|---------------|
| NO RESPONSE | No developer reply | Working correctly |
| HIGH RATING + APOLOGY | 4-5★ with apology | Working correctly |
| LOW RATING + NO EMPATHY | 1-2★ with cold reply | Needs refinement |
| GENERIC TEMPLATE | Copy-paste boilerplate | Needs refinement |
| WRONG ISSUE | Reply misses topic | False positives on neutral reviews |
| NO SOLUTION | Empathy but no action | Working correctly |
| CORRECT | Good response | Working correctly |
| UNWARRANTED APOLOGY | NEW: Apology for non-complaint | Added in Exp 007 |

### 3. SENTIMENT TAGS (3 Categories)
- positive (4-5★)
- neutral (3★)
- negative (1-2★)

---

## Autoresearch Improvement Queue

### Priority 1: Theme Classification (High Impact)

#### Experiment 008: Performance Theme Precision
**Hypothesis**: "battery" and "drain" are causing false positives when users mention "battery saver" or "battery protection" positively.

**Change**: Add negation handling for Performance keywords.

**Test**: Reviews with "battery" + positive words should not tag as Performance.

---

#### Experiment 009: VPN Detection Improvement
**Hypothesis**: Missing VPN mentions like "virtual private", "ip hiding", "location masking".

**Change**: Expand VPN keyword list.

**Test**: Catch more VPN-related reviews without false positives.

---

#### Experiment 010: UI/UX vs Pop-ups/Ads Separation
**Hypothesis**: "annoying" appears in both UI/UX and Pop-ups, causing confusion.

**Change**: Distinguish between "annoying interface" vs "annoying popups".

**Test**: Better separation of UI complaints vs notification complaints.

---

#### Experiment 011: Support Theme Accuracy
**Hypothesis**: "help" is too generic - catches "this helps me" not just "need help".

**Change**: Add context requirements for Support detection.

**Test**: Reduce false positives on Support tagging.

---

#### Experiment 012: Pricing vs Auto-Renewal Separation
**Hypothesis**: Auto-renewal complaints are distinct from general pricing complaints.

**Change**: Separate Auto-Renewal as standalone theme with specific keywords.

**Test**: Better categorization of billing complaints.

---

### Priority 2: Response Quality Tags (Medium Impact)

#### Experiment 013: LOW RATING + NO EMPATHY Refinement
**Hypothesis**: Some 1-2★ reviews get empathetic replies but are still tagged incorrectly.

**Change**: Improve empathy detection regex.

**Test**: Better correlation with human judgment.

---

#### Experiment 014: GENERIC TEMPLATE Detection
**Hypothesis**: Missing generic patterns like "thank you for reaching out" and "we value your feedback".

**Change**: Expand boilerplate detection patterns.

**Test**: Catch more copy-paste responses.

---

#### Experiment 015: WRONG ISSUE Precision
**Hypothesis**: WRONG ISSUE has too many false positives (already partially fixed in Exp 007).

**Change**: Only flag when intent is COMPLAINT (from Exp 007).

**Test**: Reduced false positive rate.

---

### Priority 3: Sentiment Classification (Lower Impact)

#### Experiment 016: 3-Star Review Sentiment
**Hypothesis**: Not all 3★ reviews are "neutral" - some are positive with minor issues, some are complaints.

**Change**: Use intent classification to sub-categorize 3★ reviews.

**Test**: More nuanced sentiment for middle ratings.

---

## Evaluation Methodology

### For Each Experiment:

1. **Create test set**: 20-50 labeled examples for the specific category
2. **Run baseline**: Measure current precision/recall
3. **Make ONE change**: Adjust keywords, add context, or refine logic
4. **Evaluate**: Measure new precision/recall
5. **Decision**:
   - If F1 improved: Keep change, commit
   - If F1 dropped: Revert, document why
   - If F1 unchanged: Try different approach

### Success Criteria:

| Metric | Target |
|--------|--------|
| Theme Precision | > 0.80 |
| Theme Recall | > 0.75 |
| Theme F1 | > 0.77 |
| Response Quality Accuracy | > 0.85 |
| False Positive Rate | < 10% |

---

## Current Baseline (from program.md)

| Theme | Precision | Recall | F1 |
|-------|-----------|--------|-----|
| VPN | 0.68 | 0.71 | 0.69 |
| Performance | 0.72 | 0.65 | 0.68 |
| Support | 0.81 | 0.78 | 0.79 |
| Pricing | 0.85 | 0.82 | 0.83 |
| Security | 0.79 | 0.88 | 0.83 |

Response Quality: 74% accuracy, 18% false positive rate

---

## Next Steps

1. **Run Experiment 008**: Performance Theme Precision
2. **Create labeled test sets** for each theme category
3. **Iterate through Priority 1** themes first
4. **Document all results** in experiment folders
5. **Stop after 5 consecutive failures** or 50 total iterations

---

## Files to Modify

1. `dashboard.js` - Response quality logic
2. `scrape_reviews.py` - Theme keyword definitions
3. `incremental_scrape.py` - Theme classification (same keywords)

## Files to Create

1. `experiments/008-performance-theme/` - Test set + modified code
2. `experiments/009-vpn-theme/` - Test set + modified code
3. `experiments/010-uiux-theme/` - Test set + modified code
4. etc.

---

## Human Review Requirement

**IMPORTANT**: Per user instruction - every single review needs human review. The classifier provides suggestions, but humans make final tagging decisions.

The autoresearch improves the **suggestion accuracy**, not replaces human judgment.
