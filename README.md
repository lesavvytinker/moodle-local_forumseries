# local_forumseries

Plan a full series of Q&A-forum discussions in advance - one row per week,
each with its own title, message, and open/lock times - download the plan
as a JSON template, and reuse it for a new course intake by just picking a
new start date.

Depends on **local_forumlock** for the actual open/lock scheduling - this
plugin's only job is to create real discussions and hand each one to
`\local_forumlock\observer::store_schedule()`.

## How it works

1. **`setup.php`** (linked as "Plan a discussion series" next to the search
   box on the forum page) shows an editable table: one row per week, with
   title, a rich-text message (TinyMCE where available, plain text
   otherwise), and per-week scheduling built around a **class day**
   (a weekday + time - the natural anchor for that topic) rather than
   independent open/lock weekday pickers:
   - **Gate replies until this time** - if ticked, replies are blocked
     until the class day/time. If unticked, the discussion is postable
     immediately, but the class day is still used as the base for the
     lock duration below.
   - **Lock replies after** + **Duration** (a number + Days/Weeks) + a
     lock time-of-day - Lock = class day + duration, so "a week", "a week
     and 3 days", or "just 3 days" are all just a number away, and can
     genuinely span across week boundaries (unlike a fixed weekday picker,
     which was stuck within a single week).
   - **Use exact dates instead** - bypasses all of the above for a
     specific row, showing two literal date-and-time pickers for Open and
     Lock, for one-off cases that don't fit the "class day + duration"
     pattern. This also switches Display period (below) to literal
     pickers for that row.
   - **Override date for this week** - replaces the normal "series start +
     (week number - 1) weeks" calculation with a literal date, for
     irregular gaps (a holiday shifts everything after it, etc.).
   - **Skip (holiday - no discussion)** - stays in the plan/template for
     record-keeping, but creates nothing.
   - **Set display period** - optionally sets Moodle's native
     `timestart`/`timeend` (hides the discussion entirely outside this
     window) - separate from local_forumlock's reply-locking, off by
     default.
2. **Download template** exports the current table as JSON - open/lock
   times are stored as offsets ("week 3, Tuesday, 10am") rather than
   absolute dates (except for overridden rows, which store their literal
   date), so the same file works for any future intake.
3. **Upload template** reads a previously-downloaded JSON file back into
   the table, ready for a new start date.
4. **Generate discussions** posts the whole plan to `generate.php`, which
   calls `classes/generator.php` to resolve each week's offsets against
   the chosen start date, create the discussion via Moodle's own
   `forum_add_discussion()`, and hand scheduling off to local_forumlock.
5. **Download template & generate** does both of the above in one click,
   as a safety net so you always have a backup of what you're about to
   create before committing to it.
6. **Download discussions (no replies)** (`export.php`) reads the forum's
   *actual current* discussions - title and original post only, no student
   replies - plus their real open/lock/display state, and produces a
   template in "exact dates" mode. Lets you retroactively templatize a
   forum you built by hand (or generated previously) for reuse in a new
   intake, without retyping every title and message. Since it reads back
   real timestamps rather than the original relative plan, dates come
   across as literal values you'll need to adjust for the new term after
   uploading - there's no way to recover "class day + duration" from
   discussions that already exist.
7. Every non-obvious control has a small "?" icon next to it with a
   one-line explanation on hover - all the label text lives in
   `lang/en/local_forumseries.php` under the `help_*` string keys if you
   want to adjust the wording.

## Before relying on this in production

- **Verify `forum_add_discussion()`'s exact signature** against your
  Moodle 5.x source - this is a core function whose parameter order has
  shifted across major versions historically. `classes/generator.php` is
  built against the commonly-documented shape (course, forum, name,
  message, messageformat, messagetrust, mailnow, userid, groupid,
  timestart, timeend) - confirm this matches before generating anything
  you care about.
- **TinyMCE integration is the least-verified part of this plugin.** It
  uses `editor_tiny/loader`'s `getTinyMCE()` to get the raw TinyMCE object
  and calls `.init()` directly on each row's textarea - this sidesteps
  Moodle's own (less publicly documented) `setupForElementId()` wrapper,
  at the cost of not getting Moodle's file/image upload handling, which
  isn't needed here. If this AMD module path doesn't exist or behaves
  differently on your exact Moodle 5.x build, it's designed to fail
  quietly to a plain textarea (check the browser console for a warning
  starting "local_forumseries:") rather than break the page - but this
  genuinely hasn't been tested live yet.
- **No dry-run/preview step yet.** Generation is one-shot and creates real
  discussions immediately - there's no "preview the computed dates before
  committing" step. Worth adding before real classroom use: show the
  resolved absolute date/time for every week (computed from the start
  date, including override rows) in a confirmation step before the actual
  POST.
- **No partial-failure handling.** If discussion 8 of 13 fails to create
  (e.g. a scheduling error), discussions 1-7 already exist and there's no
  automatic rollback or clear "which ones succeeded" report back to the
  teacher - only the final count.
- No automated tests yet.
- This is genuinely new/untested code - unlike local_forumlock, none of
  this has been exercised against a live Moodle site yet. Test thoroughly
  with a throwaway test forum before using it for real course content.

## Capability

`local/forumseries:manage` - granted to editingteacher/manager by default.
