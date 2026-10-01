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
 * Plan a series of Q&A discussions in advance, download/upload the plan
 * as a JSON template, and generate real discussions from it.
 *
 * @package    local_forumseries
 * @copyright  2026 Harvey / Equip English
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require(__DIR__ . '/../../config.php');

$id = required_param('id', PARAM_INT); // Course module id of the forum.

$cm = get_coursemodule_from_id('forum', $id, 0, false, MUST_EXIST);
$course = get_course($cm->course);
$forum = $DB->get_record('forum', ['id' => $cm->instance], '*', MUST_EXIST);

require_login($course, false, $cm);
$context = context_module::instance($cm->id);
require_capability('local/forumseries:manage', $context);

$PAGE->set_url('/local/forumseries/setup.php', ['id' => $id]);
$PAGE->set_context($context);
$PAGE->set_pagelayout('incourse');
$PAGE->set_title(get_string('setuppagetitle', 'local_forumseries'));
$PAGE->set_heading($course->fullname);

// Groups, so a teacher can generate one discussion per group in a single
// pass instead of posting the series once per group by hand. Moodle's own
// group mode (Separate/Visible groups) on the forum decides who can
// actually see or reply to each one - this just decides how many copies
// of each week get created and which group each belongs to.
$groupmode = groups_get_activity_groupmode($cm);
$coursegroups = [];
if ($groupmode != NOGROUPS) {
    foreach (groups_get_all_groups($course->id) as $group) {
        $coursegroups[] = ['id' => (int) $group->id, 'name' => format_string($group->name)];
    }
}

$jsfile = __DIR__ . '/js/setup.js';
$js = is_readable($jsfile) ? file_get_contents($jsfile) : '';

$weekdaystrings = [];
for ($i = 1; $i <= 7; $i++) {
    $weekdaystrings[$i] = get_string('weekday_' . $i, 'local_forumseries');
}

$bootstrap = 'window.localForumseries = ' . json_encode([
    'forumid'    => (int) $forum->id,
    'cmid'       => (int) $cm->id,
    'sesskey'    => sesskey(),
    'generateurl' => (new moodle_url('/local/forumseries/generate.php'))->out(false),
    'exporturl'  => (new moodle_url('/local/forumseries/export.php'))->out(false),
    'forumurl'   => (new moodle_url('/mod/forum/view.php', ['id' => $cm->id]))->out(false),
    'weekdays'   => $weekdaystrings,
    'groups'     => $coursegroups,
    'strings'    => [
        'groupslabel' => get_string('groupslabel', 'local_forumseries'),
        'groupsallparticipants' => get_string('groupsallparticipants', 'local_forumseries'),
        'weeknumber'  => get_string('weeknumberheader', 'local_forumseries'),
        'title'       => get_string('titleheader', 'local_forumseries'),
        'message'     => get_string('messageheader', 'local_forumseries'),
        'opens'       => get_string('opensheader', 'local_forumseries'),
        'locks'       => get_string('locksheader', 'local_forumseries'),
        'addweek'     => get_string('addweek', 'local_forumseries'),
        'removeweek'  => get_string('removeweek', 'local_forumseries'),
        'download'    => get_string('downloadtemplate', 'local_forumseries'),
        'upload'      => get_string('uploadtemplate', 'local_forumseries'),
        'generate'    => get_string('generatebutton', 'local_forumseries'),
        'downloadandgenerate' => get_string('downloadandgeneratebutton', 'local_forumseries'),
        'confirm'     => get_string('generateconfirm', 'local_forumseries', '__COUNT__'),
        'overridelabel' => get_string('overridelabel', 'local_forumseries'),
        'overridedatelabel' => get_string('overridedatelabel', 'local_forumseries'),
        'skiplabel'   => get_string('skiplabel', 'local_forumseries'),
        'duplicateweek' => get_string('duplicateweek', 'local_forumseries'),
        'moveweekup' => get_string('moveweekup', 'local_forumseries'),
        'moveweekdown' => get_string('moveweekdown', 'local_forumseries'),
        'displayperiodlabel' => get_string('displayperiodlabel', 'local_forumseries'),
        'displaystartlabel' => get_string('displaystartlabel', 'local_forumseries'),
        'displayendlabel' => get_string('displayendlabel', 'local_forumseries'),
        'openenablelabel' => get_string('openenablelabel', 'local_forumseries'),
        'lockenablelabel' => get_string('lockenablelabel', 'local_forumseries'),
        'durationlabel' => get_string('durationlabel', 'local_forumseries'),
        'durationunitdays' => get_string('durationunit_days', 'local_forumseries'),
        'durationunitweeks' => get_string('durationunit_weeks', 'local_forumseries'),
        'locktimelabel' => get_string('locktimelabel', 'local_forumseries'),
        'exactdateslabel' => get_string('exactdateslabel', 'local_forumseries'),
        'exactopenlabel' => get_string('exactopenlabel', 'local_forumseries'),
        'exactlocklabel' => get_string('exactlocklabel', 'local_forumseries'),
        'exactdisplaystartlabel' => get_string('exactdisplaystartlabel', 'local_forumseries'),
        'exactdisplayendlabel' => get_string('exactdisplayendlabel', 'local_forumseries'),
        'openwithoutlockerror' => get_string('openwithoutlockerror', 'local_forumseries'),
        'emptybodyerror' => get_string('emptybodyerror', 'local_forumseries'),
        'downloaddiscussions' => get_string('downloaddiscussionsbutton', 'local_forumseries'),
        'localfilewarningdownload' => get_string('localfilewarningdownload', 'local_forumseries'),
        'localfilewarningupload' => get_string('localfilewarningupload', 'local_forumseries'),
        'classdaylabel' => get_string('classdaylabel', 'local_forumseries'),
        'norestrictions' => get_string('norestrictions', 'local_forumseries'),
        'discussioncountlabel' => get_string('discussioncountlabel', 'local_forumseries'),
        'removecontentwarning' => get_string('removecontentwarning', 'local_forumseries'),
    ],
    'help' => [
        'norestrictions' => get_string('help_norestrictions', 'local_forumseries'),
        'downloaddiscussions' => get_string('help_downloaddiscussions', 'local_forumseries'),
        'startdate'      => get_string('help_startdate', 'local_forumseries'),
        'discussioncount' => get_string('help_discussioncount', 'local_forumseries'),
        'groups'         => get_string('help_groups', 'local_forumseries'),
        'messagelimits'  => get_string('help_messagelimits', 'local_forumseries'),
        'classday'       => get_string('help_classday', 'local_forumseries'),
        'gatereplies'    => get_string('help_gatereplies', 'local_forumseries'),
        'lockreplies'    => get_string('help_lockreplies', 'local_forumseries'),
        'exactdates'     => get_string('help_exactdates', 'local_forumseries'),
        'override'       => get_string('help_override', 'local_forumseries'),
        'skip'           => get_string('help_skip', 'local_forumseries'),
        'displayperiod'  => get_string('help_displayperiod', 'local_forumseries'),
        'addweek'        => get_string('help_addweek', 'local_forumseries'),
        'downloadtemplate' => get_string('help_downloadtemplate', 'local_forumseries'),
        'uploadtemplate' => get_string('help_uploadtemplate', 'local_forumseries'),
        'generate'       => get_string('help_generate', 'local_forumseries'),
        'downloadandgenerate' => get_string('help_downloadandgenerate', 'local_forumseries'),
    ],
]) . ';';

echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('setuppagetitle', 'local_forumseries'));

if ($forum->type !== 'qanda') {
    echo $OUTPUT->notification(get_string('notqandaforum', 'local_forumseries'), 'warning');
}

echo $OUTPUT->notification(get_string('richtextlimitsnotice', 'local_forumseries'), 'info');

echo html_writer::tag('div', '', ['id' => 'forumseries-startdate-wrap']);
echo html_writer::tag('div', '', ['id' => 'forumseries-app']);

echo html_writer::tag('script', $bootstrap);
echo html_writer::tag('script', $js);

echo $OUTPUT->footer();
