/**
 * Jamaica We Active! – start the website build on time
 * ------------------------------------------------------
 * GitHub's own schedule often starts late or skips runs on small repos, so Apps Script starts the
 * "Build forecast and publish site" workflow at set times instead (GitHub's schedule stays as a backup).
 *
 * Setup (once), in the Wx-Exercise5day Apps Script project:
 *  1. Add this file (ExerciseKickoff.gs).
 *  2. Script Properties → GITHUB_TOKEN = a fine-grained GitHub token for AndrewCheeky/exercise with
 *     "Actions: Read and write". (If your marine token already covers the exercise repo, you can reuse it.)
 *  3. Run testExerciseKickoff(). The log should say "204 started", and a new run appears in GitHub → Actions.
 *  4. Run installExerciseKickoffTriggers().
 *
 * Times (Jamaica). Apps Script runs a daily trigger within about 15 minutes of the time asked for,
 * so each one is set a little early:
 *   ~3:30 AM  for the 4:30 AM run/ride and 5:30 AM swim windows
 *   ~11:45 AM for afternoon swimmers (the "12 PM" update)
 *   ~3:40 PM  for the 4:30 PM evening window (the "4 PM" update)
 *   ~6:20 PM  for planning tomorrow morning (the "6:30 PM" update)
 */

const JWA_GH_REPO = 'AndrewCheeky/exercise';
const JWA_GH_WORKFLOW = 'build.yml';
const JWA_KICKOFF_TIMES = [[3, 30], [11, 45], [15, 40], [18, 20]];

function jwaKickoff() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN script property is missing');
  const url = 'https://api.github.com/repos/' + JWA_GH_REPO + '/actions/workflows/' + JWA_GH_WORKFLOW + '/dispatches';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'},
        payload: JSON.stringify({ref: 'main'}),
      });
      const code = resp.getResponseCode();
      if (code === 204) { console.log('[JWA KICKOFF] 204 started'); return '204 started'; }
      if (code === 401 || code === 403 || code === 404) { console.error('[JWA KICKOFF] HTTP ' + code + ' – check the token and that it has Actions: Read and write on ' + JWA_GH_REPO); return 'HTTP ' + code; }
      console.warn('[JWA KICKOFF] attempt ' + attempt + ': HTTP ' + code);
    } catch (err) {
      console.warn('[JWA KICKOFF] attempt ' + attempt + ': ' + err);
    }
    Utilities.sleep(5000 * attempt);
  }
  console.error('[JWA KICKOFF] failed after 3 attempts');
  return 'failed';
}

function testExerciseKickoff() { return jwaKickoff(); }

/** Run once. Replaces any earlier jwaKickoff triggers; leaves the email and lightning triggers alone. */
function installExerciseKickoffTriggers() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'jwaKickoff').forEach(t => ScriptApp.deleteTrigger(t));
  JWA_KICKOFF_TIMES.forEach(([h, m]) => ScriptApp.newTrigger('jwaKickoff').timeBased().everyDays(1).atHour(h).nearMinute(m).inTimezone('America/Jamaica').create());
  console.log('Installed ' + JWA_KICKOFF_TIMES.length + ' website build triggers: ' + JWA_KICKOFF_TIMES.map(([h, m]) => h + ':' + String(m).padStart(2, '0')).join(', ') + ' Jamaica time.');
}
