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
 * Receives the submitted weeks plan from setup.php and actually creates
 * the discussions.
 *
 * @package    local_forumseries
 * @copyright  2026 Harvey / Equip English
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require(__DIR__ . '/../../config.php');

require_sesskey();

$forumid = required_param('forumid', PARAM_INT);
$startdatestr = required_param('startdate', PARAM_TEXT);
$weeksjson = required_param('weeksjson', PARAM_RAW);
$groupidsjson = optional_param('groupidsjson', '[-1]', PARAM_RAW);

$forum = $DB->get_record('forum', ['id' => $forumid], '*', MUST_EXIST);
$cm = get_coursemodule_from_instance('forum', $forum->id, $forum->course, false, MUST_EXIST);
$course = get_course($forum->course);

require_login($course, false, $cm);
$context = context_module::instance($cm->id);
require_capability('local/forumseries:manage', $context);

// -1 ("All participants", no group restriction) is always allowed; any
// other id must genuinely belong to this course - never trust the posted
// ids directly, since they're just JSON from the client.
$validgroupids = [-1];
foreach (groups_get_all_groups($course->id) as $group) {
    $validgroupids[] = (int) $group->id;
}
$rawgroupids = json_decode($groupidsjson, true);
$groupids = [];
if (is_array($rawgroupids)) {
    foreach ($rawgroupids as $gid) {
        $gid = (int) $gid;
        if (in_array($gid, $validgroupids, true) && !in_array($gid, $groupids, true)) {
            $groupids[] = $gid;
        }
    }
}
if (empty($groupids)) {
    $groupids = [-1];
}

$weeks = json_decode($weeksjson, true);
if (!is_array($weeks) || empty($weeks)) {
    throw new \moodle_exception('invalidparameter', 'debug', '', 'weeksjson was empty or malformed');
}

// Sanitise each week's fields explicitly rather than trusting the decoded
// JSON directly - it rode in as PARAM_RAW.
$clean = [];
foreach ($weeks as $week) {
    $overridedate = clean_param($week['overridedate'] ?? '', PARAM_TEXT);
    $row = [
        'weeknumber'         => (int) ($week['weeknumber'] ?? 0),
        'title'              => clean_param($week['title'] ?? '', PARAM_TEXT),
        'message'            => clean_param($week['message'] ?? '', PARAM_CLEANHTML),
        'exactdates'         => !empty($week['exactdates']),
        'refday'             => max(1, min(7, (int) ($week['refday'] ?? 1))),
        'reftime'            => clean_param($week['reftime'] ?? '09:00', PARAM_TEXT),
        'openenabled'        => !empty($week['openenabled']),
        'openat_exact'       => clean_param($week['openat_exact'] ?? '', PARAM_TEXT) ?: null,
        'lockenabled'        => !empty($week['lockenabled']),
        'lockdurationvalue'  => max(0, (int) ($week['lockdurationvalue'] ?? 7)),
        'lockdurationunit'   => (($week['lockdurationunit'] ?? 'days') === 'weeks') ? 'weeks' : 'days',
        'locktime'           => clean_param($week['locktime'] ?? '17:00', PARAM_TEXT),
        'lockat_exact'       => clean_param($week['lockat_exact'] ?? '', PARAM_TEXT) ?: null,
        'skip'               => !empty($week['skip']),
        'overridedate'       => $overridedate !== '' ? $overridedate : null,
        'displayenabled'     => !empty($week['displayenabled']),
        'displaystartday'    => max(1, min(7, (int) ($week['displaystartday'] ?? 1))),
        'displaystarttime'   => clean_param($week['displaystarttime'] ?? '09:00', PARAM_TEXT),
        'displayendday'      => max(1, min(7, (int) ($week['displayendday'] ?? 5))),
        'displayendtime'     => clean_param($week['displayendtime'] ?? '17:00', PARAM_TEXT),
        'displaystart_exact' => clean_param($week['displaystart_exact'] ?? '', PARAM_TEXT) ?: null,
        'displayend_exact'   => clean_param($week['displayend_exact'] ?? '', PARAM_TEXT) ?: null,
    ];
    // Defensive: an open-gate without an eventual lock isn't meaningful in
    // local_forumlock's model - the client already blocks this combination,
    // this just guards against it being bypassed.
    if ($row['openenabled'] && !$row['lockenabled']) {
        $row['openenabled'] = false;
    }
    $clean[] = $row;
}

$tz = core_date::get_user_timezone_object();
$startdt = new DateTime($startdatestr, $tz);
$startdt->setTime(0, 0, 0);

$result = \local_forumseries\generator::generate($forum->id, $USER->id, $startdt->getTimestamp(), $clean, $groupids);

$forumurl = new moodle_url('/mod/forum/view.php', ['id' => $cm->id]);
$message = get_string('generatesuccess', 'local_forumseries', (object) [
    'created' => count($result['created']),
    'skipped' => count($result['skipped']),
]);
redirect($forumurl, $message, null, \core\output\notification::NOTIFY_SUCCESS);
