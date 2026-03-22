# Dashboard UI Integration: Suggested Better Reply

## Display Columns (per review)

| Column | Source | Editable by Human |
|--------|--------|-------------------|
| Rating | Review data | No |
| Sentiment | Auto-detected (positive/neutral/negative) | No |
| Review | Review text | No |
| McAfee's Response | Developer reply | No |
| Quality Tag | **💡 Suggested** (classifier output) | **Yes - human can override** |
| 💡 Suggested Better Reply | **💡 Suggested** (reply generator) | **Yes - human can edit** |

## Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Review Row                                                  │
├─────────────────────────────────────────────────────────────┤
│  Rating: ⭐⭐⭐ (3)                                           │
│  Sentiment: Neutral                                          │
│  Review: "Just started using this for my family..."         │
│  McAfee Response: "We're sorry to hear..."                  │
│                                                              │
│  💡 Quality Tag: [UNWARRANTED APOLOGY ▼]  ← Dropdown        │
│     Options: NO RESPONSE, UNWARRANTED APOLOGY,              │
│              HIGH RATING+APOLOGY, LOW RATING+NO EMPATHY,    │
│              GENERIC TEMPLATE, WRONG ISSUE, NO SOLUTION,    │
│              CORRECT                                        │
│                                                              │
│  💡 Suggested Better Reply:                                 │
│  [Thanks for choosing McAfee to protect your family! 🛡️     │
│   Here are features worth exploring: VPN, Dark Web...]      │
│                                                              │
│  [Save Changes]  [Reset to Suggested]                       │
└─────────────────────────────────────────────────────────────┘
```

## Quality Tag Dropdown Options

1. **NO RESPONSE** - No developer reply exists
2. **UNWARRANTED APOLOGY** - Apologized when no complaint was made
3. **HIGH RATING + APOLOGY** - 4-5★ review with apology
4. **LOW RATING + NO EMPATHY** - 1-2★ review with cold reply
5. **GENERIC TEMPLATE** - Copy-paste boilerplate response
6. **WRONG ISSUE** - Reply doesn't address the actual topic
7. **NO SOLUTION** - Empathy but no actionable help
8. **CORRECT** - Good response (no change needed)

## Integration Code

### dashboard.js - Row Rendering
```javascript
function renderReviewRow(review) {
  const quality = checkResponseQuality(review);
  const suggestedReply = buildPersonalizedReply(review, quality);
  
  return `
    <tr data-review-id="${review.id}">
      <td>${renderStars(review.rating)}</td>
      <td>${review.sentiment.label}</td>
      <td>${escapeHtml(review.content.substring(0, 100))}...</td>
      <td>${escapeHtml(review.developer_reply || '(No response)')}</td>
      <td>
        <select class="quality-tag-select" data-review-id="${review.id}">
          ${QUALITY_OPTIONS.map(opt => `
            <option value="${opt.value}" ${opt.value === quality ? 'selected' : ''}>
              ${opt.label}
            </option>
          `).join('')}
        </select>
      </td>
      <td>
        <textarea class="suggested-reply" data-review-id="${review.id}" rows="3">
${suggestedReply || '(No suggestion needed)'}
        </textarea>
      </td>
      <td>
        <button onclick="saveReviewChanges('${review.id}')">Save</button>
        <button onclick="resetToSuggested('${review.id}')">Reset</button>
      </td>
    </tr>
  `;
}
```

### Event Handlers
```javascript
// When quality tag changes, regenerate suggested reply
document.querySelectorAll('.quality-tag-select').forEach(select => {
  select.addEventListener('change', (e) => {
    const reviewId = e.target.dataset.reviewId;
    const newQuality = e.target.value;
    const review = findReviewById(reviewId);
    
    // Regenerate suggested reply based on new quality tag
    const newSuggestedReply = buildPersonalizedReply(review, newQuality);
    
    // Update textarea
    document.querySelector(`textarea[data-review-id="${reviewId}"]`).value = newSuggestedReply;
  });
});

// Save changes
function saveReviewChanges(reviewId) {
  const qualityTag = document.querySelector(`select[data-review-id="${reviewId}"]`).value;
  const suggestedReply = document.querySelector(`textarea[data-review-id="${reviewId}"]`).value;
  
  // Save to backend/database
  saveToDatabase(reviewId, { qualityTag, suggestedReply });
}

// Reset to classifier suggestion
function resetToSuggested(reviewId) {
  const review = findReviewById(reviewId);
  const quality = checkResponseQuality(review);
  const suggestedReply = buildPersonalizedReply(review, quality);
  
  document.querySelector(`select[data-review-id="${reviewId}"]`).value = quality;
  document.querySelector(`textarea[data-review-id="${reviewId}"]`).value = suggestedReply;
}
```

## Quality Tag Colors

```css
.quality-tag-NO-RESPONSE { color: #9CA3AF; }           /* Gray */
.quality-tag-UNWARRANTED-APOLOGY { color: #F59E0B; }   /* Amber */
.quality-tag-HIGH-RATING-APOLOGY { color: #F59E0B; }   /* Amber */
.quality-tag-LOW-RATING-NO-EMPATHY { color: #EF4444; } /* Red */
.quality-tag-GENERIC-TEMPLATE { color: #F97316; }      /* Orange */
.quality-tag-WRONG-ISSUE { color: #EC4899; }           /* Pink */
.quality-tag-NO-SOLUTION { color: #8B5CF6; }           /* Purple */
.quality-tag-CORRECT { color: #10B981; }               /* Green */
```

## API Endpoints Needed

```javascript
// GET /api/reviews - List all reviews with suggested tags/replies
// Response: { reviews: [{ id, rating, sentiment, content, developer_reply, suggested_quality, suggested_reply }] }

// POST /api/reviews/:id/quality - Update quality tag
// Body: { qualityTag: string }

// POST /api/reviews/:id/suggested-reply - Update suggested reply
// Body: { suggestedReply: string }

// POST /api/reviews/:id/reset - Reset to classifier suggestion
// Response: { quality, suggestedReply }
```

## Database Schema Addition

```sql
-- Add to reviews table or create new table
CREATE TABLE review_tags (
  review_id VARCHAR(255) PRIMARY KEY,
  suggested_quality VARCHAR(50),      -- Classifier output
  suggested_reply TEXT,                -- Reply generator output
  human_quality VARCHAR(50),           -- Human override (if different)
  human_reply TEXT,                    -- Human edited reply (if different)
  updated_by VARCHAR(100),             -- Who made the change
  updated_at TIMESTAMP
);
```

## Export for McAfee Team

When quality tags and better replies are reviewed, export:

```javascript
function exportForMcAfee() {
  const approvedReviews = getApprovedReviews();
  
  return approvedReviews.map(r => ({
    review_id: r.id,
    platform: r.platform,
    rating: r.rating,
    author: r.author,
    review_text: r.content,
    mcafee_response: r.developer_reply,
    quality_issue: r.human_quality || r.suggested_quality,
    suggested_better_reply: r.human_reply || r.suggested_reply,
    reviewed_by: r.updated_by,
    reviewed_at: r.updated_at
  }));
}
```
