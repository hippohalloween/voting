// =============================================================
//  Costume Contest settings: this is the only file you need to edit
//  (besides questions.json) to connect the app to your Google Sheet.
// =============================================================
window.CONFIG = {
  // Your Apps Script "Web app" URL (ends in /exec).
  // Leave it empty ('') to run in DEMO MODE, where votes are saved only
  // in the current browser.
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzPsVtFgPB65HWG0pucts9OQSzZnsLcCZhTUhl_7kKomZE7KrCJVgUiAa1O3pjqwB4Z4w/exec',

  // Passcode for the host page (admin.html).
  // It MUST match ADMIN_PASSCODE at the top of Code.gs.
  // Note: this file is public on GitHub Pages, so this is a light lock
  // to keep guests out of the host screen, not real security.
  ADMIN_PASSCODE: 'hippo',

  // Optional: the link the QR code points to. Leave empty and the app
  // will use the address of your site automatically.
  VOTE_URL: ''
};
