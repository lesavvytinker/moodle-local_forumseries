# Changelog

## 0.5.0 (2026-10-06)
- Front-end moved to AMD modules loaded through Moodle's hooks API
  (`local_forumseries/setup`, `local_forumseries/forumpage`); no more inline
  script injection.
- PHPUnit tests for the generator (`tests/generator_test.php`).
- Bootstrap 5 spacing fixes; click-to-open help notes instead of hover
  tooltips.
- Moodle coding-standards clean-up.

## 0.4.x
- Group support: generate one copy of the series per selected group.
- "Download discussions (no replies)" collapses per-group copies back into
  one template row per week.
- Warnings when downloading/uploading templates containing locally hosted
  files; content-loss warning when shrinking the number of discussions.

## 0.3.x and earlier
- Weekly planner table, JSON template download/upload, relative and exact
  scheduling, display period, skip/override weeks, TinyMCE message editor.
