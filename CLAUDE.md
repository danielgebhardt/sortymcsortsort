# Sorty McSort Sort — notes for Claude

An original block-sliding puzzle game for Android, iOS and the web. The user plays on real phones
with their family and gives feedback.

- Repo: https://github.com/danielgebhardt/sortymcsortsort
- Web app (GitHub Pages, deployed by CI from main; the main way the family plays, via Add to Home Screen): https://danielgebhardt.github.io/sortymcsortsort/
- Latest APK (rebuilt by CI on every push to main): https://github.com/danielgebhardt/sortymcsortsort/releases/download/latest/sorty-mcsort-sort.apk
- Latest unsigned iOS build (same release; sideloaded with a free Apple ID, see README): https://github.com/danielgebhardt/sortymcsortsort/releases/download/latest/sorty-mcsort-sort.ipa

Read `README.md` for the rules, chapters, layout and level pipeline.

## Workflow (keep)
- Work on a branch. Push the branch first; CI runs tests, the Android build and the `ios` job on every push.
- Fast-forward `main` only when all tests pass and the branch's CI is green; `main` publishes the APK, `.ipa` and web app.
- Don't open PRs unless asked.
- The container can't reach `*.github.io`: ask the user to check the live web app.

## Stack
- TypeScript, Phaser 4 and Vite, wrapped with Capacitor 8 for Android and iOS (`@capacitor/preferences`, `haptics`, `status-bar`). Vitest for tests; scripts run with `tsx`.
- No audio files; blocks and icons are drawn with Phaser Graphics; sounds are synthesised (`src/audio/sfx.ts`).
- App id `com.danielgebhardt.sortymcsortsort`. Portrait only. Renders at devicePixelRatio; safe areas come from `env(safe-area-inset-*)` via `#safe-probe` in `index.html`.
- Android: debug keystore committed (`android/app/debug.keystore`); `versionCode`/`versionName` from `GITHUB_RUN_NUMBER`. Launcher icons were generated from `assets/` with `@capacitor/assets` and are committed. **Keep the Android build and APK release exactly as they are.**
- iOS (`ios/`, Swift Package Manager): sideloading only, no App Store. `npm run ios` = web build + `scripts/icon.ts` + `cap sync ios`; `npm run ios:open` opens Xcode on a Mac. The app icon and launch logo PNGs are derived from `assets/icon-only.png` / `assets/icon-foreground.png` (`scripts/lib/icons.ts`, uses `sharp`) and are gitignored. `ios/App/App/public` and `capacitor.config.json` are generated, not committed. Info.plist: portrait only, `UIRequiresFullScreen`, light status bar, arm64, no non-exempt encryption.
- Web app: `scripts/lib/webapp.ts` (Vite plugin, `enforce: 'post'`) emits `manifest.webmanifest`, `icon-192/512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` and `sw.js` into every build. The service worker precaches every built file, is network-first (4 s timeout) for page loads and cache-first for hashed assets, and deletes old `sms-*` caches. `src/main.ts` (`initWebApp`) registers it only in production browser builds, never native, and requests persistent storage. In a browser, saves use localStorage (Preferences web fallback, plus a direct fallback in `src/storage/progress.ts`), haptics fall back to `navigator.vibrate` (`src/audio/haptics.ts`), and audio resumes whenever `ctx.state !== 'running'` (iOS reports `'interrupted'`).

## CI (`.github/workflows/android.yml`)
- `build` (every push): `npm ci`, `npm test`, `npm run build`, `cap sync android`, `assembleDebug`, APK artifact. On main it also uploads `dist/` as the Pages artifact and recreates the `latest` pre-release with the APK.
- `pages` (main only, needs build): `configure-pages` + `deploy-pages`. Requires repo Settings → Pages → Source = GitHub Actions (the workflow token can't turn Pages on).
- `ios` (every push, needs build, `macos-26`): `npm run ios`, unsigned `xcodebuild` (Release, `generic/platform=iOS`, `CURRENT_PROJECT_VERSION=$GITHUB_RUN_NUMBER`), zips `Payload/App.app` into `sorty-mcsort-sort.ipa`, checks it contains `Frameworks/Capacitor.framework`, `public/index.html` and the JS assets, uploads it as an artifact, and on main attaches it to the `latest` release (`gh release upload --clobber`).

## Checks before pushing main
- `npx tsc --noEmit`, `npm test` (includes replaying all 600 shipped solutions, difficulty and variety rules, frozen levels 1–30).
- `npm run build && node e2e/webapp.cjs`: serves `dist/` under `/sortymcsortsort/`, checks Chrome's installability errors are empty (persistent profile, not incognito), the service worker controls the page after a reload, and offline the game boots, a level can be played and progress persists.
- Playwright playthroughs at Pixel 7 size through the real touch UI. For Playwright, use `executablePath /opt/pw-browsers/chromium` if it exists.

## Levels
- `src/core`: pure rules (board, solver, generator, progression), no Phaser. `src/levels/levels.json`: 600 shipped levels with their solutions.
- **Never change a finished level.** Levels 1–30 are frozen (hash pinned in `tests/generator.test.ts`, `FROZEN` in `scripts/generate-parallel.sh`). Raise both as levels ship.
- `npm run levels` regenerates 31–600 in parallel; `REPAIR="45 46" npx tsx scripts/generate-levels.ts` rebuilds single levels.

## Lab sessions (the home lab's dev VM)

<!-- From home-lab config/forgejo/lab-sessions-claude-md.md (runbook 07 §16; decision 43). Keep this section in sync with it. -->

You may be a **lab session**: Claude Code on the home lab's dev VM, started from the Claude app ("dev: …").
Check with `whoami`: `fjagent` means you are. Then these rules come first, over anything else in this file:

- **Where the code lives:** `origin` is the lab's Forgejo (`https://git.lab.dgebhardt.com/daniel/sortymcsortsort`), the
  source of truth. A GitHub copy, if there is one, is read-only and filled from Forgejo: never push or open PRs there.
- **No branches on Forgejo:** you have read access only, so Forgejo refuses any push to a branch (`main` included).
  Work on any local branch and hand your work in as a pull request pushed with AGit (below). Never merge, and don't
  ask how to get around this: the owner reviews and merges.
- **No tags or releases:** only the owner creates them (Forgejo refuses yours).
- **A pull request is a push** (Forgejo's AGit flow). Pick one short topic per task (lower case, dashes), then:
  ```bash
  git push origin HEAD:refs/for/main/<topic> -o title="WIP: <title>" -o description="<what, why, checks run>"
  ```
  The first push opens the pull request and prints its link (the API lists its head as `refs/pull/<number>/head`).
  Every later push to the same `refs/for/main/<topic>` updates it; after a rebase or an amend add
  `-o force-push=true`. Title and description are read on the first push only.
- **Save often:** your worktree is on a disk that isn't backed up. Commit and push to your pull request at every
  checkpoint, so nothing is lost if the lab restarts. Keep "WIP:" at the start of the title until you're done.
- **Checks:** no CI runs on lab pull requests. Run them yourself before you finish, and put the results in the pull
  request's description or a comment:
  - `npm ci`
  - `npx tsc --noEmit`
  - `npm test`
  - `npm run build`
- **Forgejo's API**, with your own token (no dollar signs in these blocks on purpose: Forgejo's repo templates would
  expand them). Your open pull requests, with their numbers:
  ```bash
  curl -sS -H @/home/fjagent/.config/forgejo/auth-header 'https://git.lab.dgebhardt.com/api/v1/repos/daniel/sortymcsortsort/pulls?state=open' | python3 -c 'import json,sys; [print(p["number"], p["head"]["ref"], p["title"]) for p in json.load(sys.stdin)]'
  ```
  When you're done, take "WIP:" out of the title (PATCH `pulls/<number>`), or add a comment (POST `issues/<number>/comments`):
  ```bash
  python3 - <<'PY' > /tmp/fj.json
  import json; print(json.dumps({"title": "<title without WIP>"}))   # or {"body": "<comment>"}
  PY
  curl -sS -X PATCH -H @/home/fjagent/.config/forgejo/auth-header -H 'Content-Type: application/json' \
    --data @/tmp/fj.json https://git.lab.dgebhardt.com/api/v1/repos/daniel/sortymcsortsort/pulls/<number> | python3 -c 'import json,sys; print(json.load(sys.stdin).get("html_url"))'
  ```
  Then give the owner the link.
- **Don't** change CI workflow files unless the task is about CI (say so in the pull request), add secrets or
  credentials to the repo, or install anything system-wide (you can't; use the project's own tooling).
- **Memory and CPU are shared** with other lab sessions and the MTP runner: one heavy build or test run at a time.
