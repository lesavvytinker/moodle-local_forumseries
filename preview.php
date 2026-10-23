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
 * Returns, as JSON, what "Generate discussions" would create for the
 * posted plan - each week's resolved dates plus any warnings - without
 * creating anything. The date maths is the generator's own, so the preview
 * always matches what generation will do.
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

$forum = $DB->get_record('forum', ['id' => $forumid], '*', MUST_EXIST);
$cm = get_coursemodule_from_instance('forum', $forum->id, $forum->course, false, MUST_EXIST);
$course = get_course($forum->course);

require_login($course, false, $cm);
$context = context_module::instance($cm->id);
require_capability('local/forumseries:manage', $context);

$weeks = json_decode($weeksjson, true);
if (!is_array($weeks) || empty($weeks)) {
    throw new \moodle_exception('invalidparameter', 'debug', '', 'weeksjson was empty or malformed');
}

$tz = core_date::get_user_timezone_object();
try {
    $startdt = new DateTime($startdatestr, $tz);
} catch (\Exception $e) {
    throw new \moodle_exception('invalidparameter', 'debug', '', 'startdate was not a valid date');
}
$startdt->setTime(0, 0, 0);

$rows = \local_forumseries\generator::preview(
    $startdt->getTimestamp(),
    \local_forumseries\generator::clean_weeks($weeks)
);

header('Content-Type: application/json; charset=utf-8');
echo json_encode(['rows' => $rows]);
