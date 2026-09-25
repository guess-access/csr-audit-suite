# CSR Fundamentals Module 05 - Deployment Guide

## Quick Deploy to Netlify (2 minutes)

### Option 1: Drag & Drop Deploy (Easiest — static pages only)
1. Download the `csr-audit-suite.zip` file
2. Go to [https://app.netlify.com/drop](https://app.netlify.com/drop)
3. Drag the **entire folder** (not the zip) onto the page
4. Netlify generates a live URL instantly
5. Customize your domain name (optional)

> **⚠ Important:** Drag-and-drop deploys do **not** process Netlify
> Functions — manual deploys "don't actually build anything" (Netlify
> Support Guide). The dashboard, Audit Form, and Coaching Template will
> work, but the **Audio Analyzer will fail** with
> `Unexpected token '<'` because `transcribe` and `analyze` were never
> deployed. To use the Audio Analyzer, deploy with **Option 2** (Git) or
> the **Netlify CLI** instead.

### Option 2: GitHub Integration (Recommended — required for the Audio Analyzer)
1. Extract the `csr-audit-suite.zip` file
2. Create a new GitHub repository
3. Push all files to the repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: CSR Audit Suite"
   git push origin main
   ```
4. Go to [Netlify](https://app.netlify.com)
5. Click "New site from Git"
6. Connect your GitHub repository
7. Netlify auto-deploys on every push

### Option 3: Manual Upload via Netlify UI
1. Extract the `csr-audit-suite.zip` file
2. Log in to [Netlify.com](https://netlify.com)
3. Click "Add new site" → "Deploy manually"
4. Drag your entire folder into the upload area
5. Wait for deployment to complete
6. Site goes live with a random URL
7. Change domain in Site Settings

---

## File Structure

```
csr-audit-suite/
├── index.html                 (Main dashboard/home page)
├── audio-analyzer.html        (Audio upload & auto-scoring tool)
├── audit-form.html           (Manual audit scoring form)
├── coaching-template.html    (Coaching feedback & development)
├── netlify.toml              (Netlify configuration)
├── README.md                 (Tool documentation)
└── DEPLOYMENT_GUIDE.md       (This file)
```

---

## What's Included

### 1. **Audio Call Analyzer** (`audio-analyzer.html`)
- Upload MP3 call recordings
- AI-powered auto transcription
- Automatic scoring against 18 metrics
- Generates coaching feedback
- PDF export capability
- **Best for:** Fast, consistent call reviews

### 2. **Audit Form** (`audit-form.html`)
- Manual call quality audit
- 18-metric evaluation form
- Real-time scoring (0-100)
- Detailed note-taking
- PDF export
- **Best for:** Training/calibration, detailed reviews

### 3. **Coaching Template** (`coaching-template.html`)
- Structured coaching conversations
- Strengths & opportunities tracking
- 4-category performance ratings
- SMART action plan builder
- Follow-up scheduling
- PDF export for documentation
- **Best for:** One-on-one development sessions

### 4. **Dashboard** (`index.html`)
- Central hub with navigation
- Quick start guide
- Tool descriptions
- Metrics overview
- Workflow guidance
- Links to all tools

---

## Setup After Deployment

### 1. **Custom Domain** (Optional)
- In Netlify Site Settings
- Click "Domain management"
- Add custom domain (e.g., `csr-audit.yourdealership.com`)
- Update DNS records if needed

### 2. **API Configuration**
The audio analyzer requires API access, via two Netlify Functions that ship
with this suite (`netlify/functions/transcribe.js` and `analyze.js`):
- **Deepgram** - transcribes the uploaded MP3 to text
- **Claude API** (Anthropic) - scores the transcript against the audit criteria
- Both require an API key, set as a Netlify environment variable (never
  exposed in the HTML) — see `FUNCTIONS_SETUP.md` for the exact steps.
- Until both keys are added in Netlify, the analyzer will show an error when
  you try to analyze a call.

### 3. **User Access**
- Share the live URL with your team
- Works on desktop, tablet, and mobile browsers
- No installation required
- No login/authentication needed (you can add this later)

### 4. **Data Privacy**
- Audio files are processed through API only
- Files are not stored permanently
- All processing happens securely
- Check your organization's privacy policies
- Consider adding privacy notices to your site

---

## Using the Suite

### Daily Workflow
1. **Get the MP3 recording** from your call center system
2. **Open Audio Analyzer** on the live site
3. **Upload the MP3** - system auto-analyzes in seconds
4. **Review results** - metrics, strengths, opportunities
5. **Download PDF** - save to agent's file
6. **Schedule coaching** if score < 85

### Monthly Coaching
1. **Open Coaching Template**
2. **Enter agent & call information**
3. **Fill in feedback** from analyzer results
4. **Add action items** with 30-day targets
5. **Export PDF** for agent to sign
6. **Schedule follow-up** in 30 days

### Team Calibration
1. **Assemble team** (supervisors, QA)
2. **Select same call** to review
3. **Each person uses Audit Form** independently
4. **Compare scores & notes**
5. **Discuss differences** - align on standards
6. **Update training** if needed

---

## Customization Options

### Add Company Logo
Replace the emoji icon in `index.html`:
```html
<a href="./" class="logo">
    <span>📚</span>  <!-- Change this -->
    DealerFocus Academy
</a>
```
Replace `📚` with your logo or company initials.

### Change Colors
Edit the CSS variables in each HTML file:
```css
:root {
    --primary-color: #1e3a8a;      /* Navy blue */
    --secondary-color: #0ea5e9;    /* Light blue */
    --accent-color: #f97316;       /* Orange */
    --success-color: #10b981;      /* Green */
}
```

### Add Navigation Links
Edit the navbar in `index.html` to link to:
- Your main training hub
- HR documentation
- Policy manuals
- etc.

---

## Troubleshooting

### Audio Upload Not Working
**Problem:** "File upload failed" or "Please upload an MP3"
**Solution:**
- Ensure file is MP3 format (not WAV, M4A, etc.)
- File size under 3MB (~3 minutes of typical MP3)
- Try a different browser (Chrome recommended)
- Check internet connection
- Clear browser cache

### API Errors When Analyzing
**Problem:** "Error analyzing call: ..." or `Unexpected token '<', "<!DOCTYPE "...`
**Solution:**
- `Unexpected token '<'` means the endpoint returned HTML instead of JSON —
  the functions were not deployed. This happens on **drag-and-drop
  deploys**, which never build functions (see DEPLOYMENT_GUIDE Options 2/3).
  Redeploy from a Git repo or with the Netlify CLI.
- Otherwise, most often this means a key isn't set in Netlify yet —
  `DEEPGRAM_API_KEY` for transcription, plus one free scoring key
  (`GEMINI_API_KEY` or `GROQ_API_KEY`; `ANTHROPIC_API_KEY` also works) —
  see `FUNCTIONS_SETUP.md`
- Check internet connection
- Try again in 30 seconds
- Check your AI provider's API status (Gemini: status.cloud.google.com,
  Groq: status.groq.com, Anthropic: status.anthropic.com) and Deepgram
  status.deepgram.com
- Ensure MP3 is valid audio file and under ~3MB (~3 minutes)
- Try a shorter audio clip first

### PDF Export Not Working
**Problem:** PDF download doesn't start
**Solution:**
- Disable ad-blockers (they block downloads)
- Try different browser
- Check browser popup/download settings
- Make sure pop-ups are allowed
- Try Chrome or Firefox

### Page Not Loading
**Problem:** Blank page or 404 error
**Solution:**
- Check Netlify deployment status
- Clear browser cache
- Try incognito/private mode
- Verify all files uploaded to Netlify
- Check netlify.toml is present

### Slow Performance
**Problem:** Pages load slowly
**Solution:**
- All HTML is self-contained (no external dependencies)
- Should load instantly
- Check your internet connection
- Try different browser
- Contact Netlify support if persistent

---

## Advanced Features

### For IT/Developers

#### Add Authentication
The suite is currently open. To add login:
1. Use Netlify Identity (built-in, free)
2. Enable in Site Settings
3. Add login code to `index.html`
4. Restrict access per user

#### Database Integration (Optional)
Store results in:
- Netlify Functions + MongoDB
- AWS DynamoDB
- Firebase
- Supabase
- Your existing HR system

#### Integration with HR Systems
Connect to:
- ADP/Workday (for employee data)
- Zendesk (for call data)
- Salesforce (for customer data)
- Your custom CRM

#### Add Report Dashboard
Create a analytics page to:
- Track trends over time
- Compare agent performance
- Identify training needs
- Export compliance reports

---

## Support & Maintenance

### Updating the Suite
1. Make changes to your files locally
2. Test thoroughly in dev environment
3. Push to GitHub (if using Git)
4. Netlify auto-deploys changes
5. No downtime during updates

### Monthly Tasks
- Verify all links work
- Test PDF export
- Check PDF displays correctly
- Review any user feedback
- Monitor page load times

### Quarterly Tasks
- Analyze call scores for trends
- Identify agents needing coaching
- Update training materials
- Review and refresh content
- Gather user feedback

---

## FAQ

**Q: Do I need a Netlify account?**
A: Yes, but it's free. Sign up at netlify.com with GitHub, GitLab, or email.

**Q: Can multiple people use this at the same time?**
A: Yes! It's a web app, so everyone can access simultaneously from different locations.

**Q: Is the audio data stored?**
A: No. Audio is processed through API and not saved permanently. Each upload is analyzed and results shown only in browser.

**Q: Can agents see their own scores?**
A: By default, everyone with the link can access everything. You can add authentication (see Advanced section).

**Q: How do I make it mobile-friendly?**
A: It's already mobile-responsive! Works on phones, tablets, and desktops.

**Q: Can I backup the data?**
A: PDFs are exported by each user. Set up a shared drive or database if you want centralized backup.

**Q: How much does Netlify cost?**
A: Free tier is plenty. $20+/month for advanced features (if needed).

**Q: Can I use this offline?**
A: Not the audio analyzer (needs API). The forms work offline after loading, but upload needs internet.

---

## Contact & Support

For issues:
1. **Netlify Issues:** Check [Netlify Support](https://support.netlify.com)
2. **General Questions:** See README.md
3. **API Issues:** Check [Anthropic Status](https://www.anthropic.com/status)

---

## Version Info
- **Suite Version:** 1.0
- **Created:** September 2026
- **Last Updated:** September 24, 2026
- **Deployment Platform:** Netlify
- **Status:** Production Ready

---

**Ready to deploy? Extract the zip file and drag it to netlify.com/drop!**
