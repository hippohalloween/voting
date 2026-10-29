# 🎃 Halloween Costume Contest Voting

Guests scan a QR code, type their picks for each award, and you reveal the winners one award at a time with a drumroll on the big screen. Votes are saved to a Google Sheet you own.

- **Voting page:** `index.html` (what guests see on their phones)
- **Host page:** `admin.html` (QR code, live results, answer cleanup, winner reveal)

---

## What's in this folder

| File | What it does |
|---|---|
| `index.html`, `vote.js` | The voting page |
| `admin.html`, `admin.js` | The host page |
| `questions.json` | **Your award questions. Edit this.** |
| `config.js` | **Your Google connection and host passcode. Edit this.** |
| `Code.gs` | The Google Apps Script backend (paste it into Google, not GitHub) |
| `api.js`, `fx.js`, `styles.css` | Shared code, effects and styling |

---

## Setup (about 15 minutes)

### 1. Create the Google Sheet and backend

1. Go to [sheets.new](https://sheets.new) to create a blank Google Sheet. Name it something like *Costume Contest Votes*.
2. In the Sheet, open **Extensions → Apps Script**.
3. Delete the sample code in the editor, then paste in **everything** from `Code.gs`.
4. At the top of the code, change `ADMIN_PASSCODE = 'pumpkin'` to your own passcode. Click **Save** (💾).
5. Click **Deploy → New deployment**.
   - Click the ⚙️ gear next to "Select type" and choose **Web app**.
   - **Execute as:** Me
   - **Who has access:** Anyone
   - Click **Deploy**.
6. Google will ask you to authorize. Choose your account. If you see "Google hasn't verified this app," click **Advanced → Go to (project name) (unsafe)** → **Allow**. This is your own script, so that's expected.
7. Copy the **Web app URL** (it ends in `/exec`).

> **Changed `Code.gs` later?** Use **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. That keeps the same URL. Making a *new* deployment gives you a new URL you'd have to paste again.

### 2. Connect the site

Open `config.js` and fill in:

```js
APPS_SCRIPT_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
ADMIN_PASSCODE: 'your-passcode',   // same as in Code.gs
```

### 3. Add your questions

Edit `questions.json`. Each award needs an `id` (short, no spaces, never change it once voting starts) and the `text` people see. `hint` and `placeholder` are optional.

```json
{
  "title": "Halloween Costume Contest",
  "intro": "Vote for your favorite costumes!",
  "questions": [
    { "id": "best",     "text": "Best Costume",     "hint": "Who has the best costume overall?" },
    { "id": "scariest", "text": "Scariest Costume" },
    { "id": "group",    "text": "Best Group Costume" }
  ]
}
```

Winners are revealed in the same order as this list. Watch your commas: every question except the last needs a comma after its closing `}`.

### 4. Put it on GitHub Pages

1. Create a new **public** repository on GitHub.
2. Upload all the files in this folder (`Code.gs` and `README.md` are fine to include; they're harmless).
3. Go to **Settings → Pages**, set **Source** to *Deploy from a branch*, choose **main** and **/ (root)**, and save.
4. After a minute your site will be at `https://YOUR-USERNAME.github.io/REPO-NAME/`.
   - Voting page: `https://YOUR-USERNAME.github.io/REPO-NAME/`
   - Host page: `https://YOUR-USERNAME.github.io/REPO-NAME/admin.html`

---

## Test before the party

1. Open the host page and enter your passcode.
2. Scan the QR code with your phone and vote a couple of times with messy spellings ("Sarah", "sara").
3. Check that the votes show up on **Live results** and in the **Votes** tab of your Google Sheet.
4. Try **Review answers** and **Reveal** to see how they work.
5. When you're done, go to **Settings → Clear votes and start fresh.** Practice votes are moved to an archive tab in the Sheet, so nothing is deleted.

**Trying it without Google first:** if `APPS_SCRIPT_URL` is empty, the app runs in **demo mode** and saves votes only in your browser. On the host page, **Settings → Add sample votes** fills in fake ballots so you can try merging and the reveal. Demo mode needs the files served from a web address (GitHub Pages works, or run `python3 -m http.server` in this folder and open `http://localhost:8000`). Double-clicking `index.html` won't load the questions.

---

## Running the contest

1. **Before costumes parade:** open the host page on the laptop connected to the projector. On the **Join** tab, click **Show QR full screen**.
2. **Voting:** guests scan, answer each award (they can skip any), review, and submit. Shared phones can tap "Someone else voting on this phone?" to vote again.
3. **Clean up answers:** on **Review answers**, approve the 🔮 suggested matches (you can rename the combined answer before merging), or tick answers yourself and click **Merge ticked**. Tick just one answer to rename it. **Undo** splits a merge back apart. Changes save automatically.
4. **The reveal:** on the **Reveal** tab, choose whether to show 2nd and 3rd place and whether to play sound, then click **Start the reveal**.
   - Each press of the big button (or Space / →) does a drumroll countdown and then reveals that award's winner.
   - ← goes back to the previous award. Esc or ✕ exits.
   - Ties show every tied winner.

---

## Good to know

- **Honor system:** anyone with the link can vote more than once. That's by design for a fun event.
- **No names are collected.** The Sheet stores only the time, a random ballot ID, the award and the typed answer.
- **The host passcode is a light lock.** `config.js` is public on GitHub Pages, so a determined guest could find it. The real protection is that changing merges or clearing votes also requires the passcode in `Code.gs`, which stays private inside your Google account (keep them the same).
- **Answers are capped at 100 characters,** and similar spellings (capital letters, punctuation, "'s") are automatically counted together even before you review.
- **Something not working?** Open the host page. If the stats line shows a ⚠ error, re-check the URL in `config.js`, make sure the deployment's access is set to **Anyone**, and confirm you deployed a new version after any code changes.
