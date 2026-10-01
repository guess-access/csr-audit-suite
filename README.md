# CSR Training & Audit Tools - Quick Reference Guide

## 🎯 Your 3-Tool Suite

You now have a complete system for training, evaluating, and coaching your service team. Here's how to use each tool:

---

## Tool 1️⃣: Audio Call Analyzer (RECOMMENDED - START HERE)

**File:** `audio-analyzer.html`

### What It Does:
- 🎵 Upload MP3 call recordings
- 🤖 Automatically transcribes the call using AI
- 📊 Analyzes against CSR Fundamentals metrics
- ⚡ Generates score instantly (0-100)
- 📋 Creates detailed coaching feedback

### How to Use:
1. Open `audio_call_analyzer.html` in your browser
2. Click the upload area or drag an MP3 file
3. Enter agent name and call date
4. Click "Analyze Call & Generate Score"
5. System analyzes the call and generates:
   - Overall score
   - Call transcription
   - Detailed metric scores (18 metrics)
   - Strengths observed
   - Areas for development
   - Concerns (if any)
   - Recommended action items
   - Coaching notes
6. Download report as PDF

### Score Interpretation:
- **90-100:** Exceptional Performance ⭐⭐⭐
- **85-89:** Passing — meets the QA form standard ✓
- **70-84:** Below passing — coaching required 🔄
- **Below 70 / Auto-Fail:** Needs Improvement ⚠️ (auto-fail = 0% + PIP enrollment review)

---

## Tool 2️⃣: Manual Call Quality Audit

**File:** `audit-form.html`

### What It Does:
- 📋 Manual audit form for calls you listen to
- ✋ Click buttons to score each metric
- 📊 Real-time score calculation
- 💾 Export to PDF

### How to Use:
1. Open `call_quality_audit.html`
2. Fill in call information
3. Listen to the recording
4. For each metric, click Yes/No/Partial/N/A
5. Score updates automatically (0-100)
6. Add coaching notes
7. Click "Generate PDF" to save

### When to Use:
- When you want to manually review a call in detail
- For calibration/training purposes
- When you need to take notes during review
- For disputed scores that need explanation

---

## Tool 3️⃣: Coaching Feedback Template

**File:** `coaching-template.html`

### What It Does:
- 💬 Structured one-on-one coaching conversation
- 📝 Capture strengths, opportunities, and concerns
- 🎯 Create action plans with specific goals
- 📅 Set follow-up meetings and timelines
- ✍️ Generate signed documentation

### How to Use:
1. Open `coaching_feedback_template.html`
2. Fill in agent and coach names, dates
3. Enter overall call score
4. Add strengths (click "+ Add Strength" for each)
5. Add opportunities for growth
6. Add any concerns
7. Rate performance across 4 categories:
   - Communication & Clarity
   - Customer Service & Empathy
   - Process & Procedures
   - Problem Solving & Efficiency
8. Create action items with target dates
9. Set follow-up meeting date
10. Add resources/training needed
11. Generate PDF and have agent acknowledge

### Key Features:
- Multi-category ratings (1-4 scale)
- Dynamically add/remove feedback items
- SMART goal tracking
- Signature lines for documentation
- Professional PDF export

---

## 🔄 Recommended Workflow

### **Daily/Weekly Operations:**
```
1. Call Happens
   ↓
2. Use Audio Analyzer (automatic)
   ↓
3. Review Results (2 min)
   ↓
4. If score < 85, schedule coaching
```

### **Monthly Coaching Session:**
```
1. Review Audio Analyzer Report
   ↓
2. Open Coaching Template
   ↓
3. Conduct 1-on-1 meeting with agent
   ↓
4. Document feedback in template
   ↓
5. Create action plan
   ↓
6. Agent acknowledges & signs
   ↓
7. Save PDF to personnel file
```

### **Quality Calibration:**
```
1. Team reviews same call
   ↓
2. Each uses Manual Audit Form
   ↓
3. Compare scores and observations
   ↓
4. Align on standards
```

---

## 📊 Metrics Overview

### Section 1: Call Flow Procedure (20 pts)
- Proper branding announcement
- Agent self-introduction

### Section 2: Body of the Call (24 pts)
- Ask reason for transfer
- Get customer name
- Introduce customer to department

### Section 3: System Process Accuracy (21 pts)
- Warm transfer protocol (3-ring hold)
- Data entry accuracy
- Correct disposition selected

### Section 4: Call Management Skills (35 pts)
- Hold procedure expectations
- Communication clarity
- Empathy & acknowledgment
- Active listening
- Professional tone
- Efficiency
- Confidence

### Section 5: Zero Tolerance (AUTO-FAIL)
- No rudeness/profanity
- No policy violations
- No call avoidance

---

## 💡 Pro Tips

### Using the Audio Analyzer:
- ✅ Works best with clear audio recordings
- ✅ Uploads happen securely through API
- ✅ Can analyze calls immediately
- ✅ Saves time on manual scoring
- ⚠️ Always review results - AI is helpful but not perfect

### Using the Coaching Template:
- ✅ Always start with strengths
- ✅ Be specific ("said dealership name twice" vs "good greeting")
- ✅ Make action items SMART (Specific, Measurable, Achievable, Relevant, Time-bound)
- ✅ Include resources they need
- ✅ Schedule 30-day follow-up

### Scoring Guidance:
- **Full Points:** Agent clearly demonstrated the behavior
- **Partial/N/A:** Behavior partially shown or not applicable
- **0 Points:** Behavior not observed
- **Auto-Fail:** Immediate escalation needed

---

## 📁 File Organization

Save these files to your DealerFocus Training Hub or local folder:
```
csr-audit-suite/
├── index.html (dashboard - start here)
├── audio-analyzer.html (START HERE)
├── audit-form.html
├── coaching-template.html
├── netlify/functions/ (transcribe.js + analyze.js - required by the analyzer)
└── README.md (this file)
```

---

## 🔗 Integration Ideas

1. **Upload Reports to Coaching Drive:** Auto-analyzer PDFs → Cloud storage
2. **Monthly Dashboard:** Track scores over time → Identify trends
3. **Coaching Tracker:** Store all coaching PDFs → Build training file
4. **Performance Reviews:** Use scores + coaching feedback for evaluations

---

## ❓ FAQ

**Q: Can I use these on mobile?**
A: Yes! HTML tools work on mobile browsers. Uploading audio may vary by device.

**Q: Can I share these with my team?**
A: Yes! Managers can use the audit form independently. Upload link to your training hub.

**Q: How accurate is the audio analysis?**
A: It's very good for identifying strengths/weaknesses but review results. AI doesn't replace human judgment.

**Q: Can I edit results after export?**
A: PDFs are static. For changes, edit the HTML form directly and regenerate.

**Q: What audio formats work?**
A: MP3 files work best. WAV and other formats may work depending on browser support.

---

## 🚀 Next Steps

1. **Test with your current call:** Upload Shanice Miller's call to audio analyzer
2. **Compare results:** Use manual audit form too, compare scores
3. **Coaching session:** Use template for feedback conversation
4. **Train team:** Show managers how to use each tool
5. **Monthly reviews:** Integrate into your existing processes

---

## 📞 Support

- **Browser Issues?** Try Chrome, Edge, or Firefox (most reliable)
- **Upload Problems?** Ensure file is MP3 and under 10MB (auto-compressed above 4MB)
- **PDF Export Issues?** Try different browser or disable ad-blockers
- **API Issues?** Check internet connection and try again

---

**Created for:** Clyde @ DealerFocus Training Hub
**Date:** September 2026
**Tools Suite:** CSR Fundamentals Audit & Coaching System
