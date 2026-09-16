<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Exports the forum's current discussions (title + first post only, no
 * replies) as a JSON template compatible with setup.php's "Upload
 * template" - each discussion becomes a week row in "exact dates" mode,
 * carrying its real title, message, and current open/lock/display state,
 * so it can be re-uploaded for a new intake and have its dates adjusted.
 *
 * Note: because this reads back from real discussions rather than from
 * the original series plan, there's no way to recover the original
 * "class day + duration" relative scheduling - only the exact timestamps
 * that exist right now. Exact-dates mode is the only mode that can
 * represent that without inventing a start date/weeknumber relationship
 * that never really existed.
 *
 * @package    local_forumseries
 * @copyright  2026 Harvey / Equip English
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require(__DIR__ . '/../../config.php');

require_sesskey();

$forumid = required_param('forumid', PARAM_INT);

$forum = $DB->get_record('forum', ['id' => $forumid], '*', MUST_EXIST);
$cm = get_coursemodule_from_instance('forum', $forum->id, $forum->course, false, MUST_EXIST);
$course = get_course($forum->course);

require_login($course, false, $cm);
$context = context_module::instance($cm->id);
require_capability('local/forumseries:manage', $context);

$discussions = $DB->get_records('forum_discussions', ['forum' => $forumid], 'id ASC');

$tz = core_date::get_user_timezone_object();

/**
 * @param int $timestamp
 * @return string 'YYYY-MM-DDTHH:MM' in the acting user's timezone.
 */
function local_forumseries_export_format(int $timestamp, \DateTimeZone $tz): string {
    $dt = new DateTime('@' . $timestamp);
    $dt->setTimezone($tz);
    return $dt->format('Y-m-d\TH:i');
}

$weeks = [];
$weeknumber = 1;

foreach ($discussions as $discussion) {
    $firstpost = $DB->get_record('forum_posts', ['id' => $discussion->firstpost]);
    if (!$firstpost) {
        continue;
    }

    // Prefer whichever schedule is still relevant (pending or applied) -
    // a cancelled/skipped one shouldn't carry forward into the export.
    $schedule = $DB->get_record_select(
        'local_forumlock_schedule',
        "discussionid = :id AND status IN ('pending_open', 'pending_lock', 'applied')",
        ['id' => $discussion->id],
        '*',
        IGNORE_MULTIPLE
    );

    $openenabled = false;
    $openatexact = null;
    $lockenabled = false;
    $lockatexact = null;

    if ($schedule) {
        if (!empty($schedule->openat)) {
            $openenabled = true;
            $openatexact = local_forumseries_export_format((int) $schedule->openat, $tz);
        }
        if (!empty($schedule->lockat)) {
            $lockenabled = true;
            $lockatexact = local_forumseries_export_format((int) $schedule->lockat, $tz);
        }
    }

    $displayenabled = false;
    $displaystartexact = null;
    $displayendexact = null;
    if (!empty($discussion->timestart) || !empty($discussion->timeend)) {
        $displayenabled = true;
        if (!empty($discussion->timestart)) {
            $displaystartexact = local_forumseries_export_format((int) $discussion->timestart, $tz);
        }
        if (!empty($discussion->timeend)) {
            $displayendexact = local_forumseries_export_format((int) $discussion->timeend, $tz);
        }
    }

    $weeks[] = [
        'weeknumber'         => $weeknumber++,
        'title'              => $discussion->name,
        'message'            => $firstpost->message,
        // Only force exact-dates mode when there's actually a real
        // schedule or display period to represent - a discussion with
        // neither should come through as a clean, fully-unticked row
        // rather than showing "Use exact dates" checked for no reason.
        'exactdates'         => ($openenabled || $lockenabled || $displayenabled),
        'refday'             => 1,
        'reftime'            => '09:00',
        'openenabled'        => $openenabled,
        'openat_exact'       => $openatexact,
        'lockenabled'        => $lockenabled,
        'lockdurationvalue'  => 7,
        'lockdurationunit'   => 'days',
        'locktime'           => '17:00',
        'lockat_exact'       => $lockatexact,
        'skip'               => false,
        'overridedate'       => null,
        'displayenabled'     => $displayenabled,
        'displaystartday'    => 1,
        'displaystarttime'   => '09:00',
        'displayendday'      => 5,
        'displayendtime'     => '17:00',
        'displaystart_exact' => $displaystartexact,
        'displayend_exact'   => $displayendexact,
    ];
}

$payload = ['startdate' => '', 'weeks' => $weeks];
$filename = 'discussion-series-export-' . $forum->id . '-' . date('Ymd-His') . '.json';

header('Content-Type: application/json; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
echo json_encode($payload, JSON_PRETTY_PRINT);
