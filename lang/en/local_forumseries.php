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
 * Language strings for local_forumseries.
 *
 * @package    local_forumseries
 * @copyright  2026 Harvey / Equip English
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$string['pluginname'] = 'Discussion series planner';
$string['forumseries:manage'] = 'Plan and generate a series of Q&A discussions in advance';
$string['setuppagetitle'] = 'Plan discussion series';
$string['setuplinktext'] = 'Plan a discussion series';
$string['notqandaforum'] = 'This tool is designed for Q&A-type forums, so students can see upcoming topics without seeing replies before they\'ve posted their own. This forum is set to a different type.';
$string['startdatelabel'] = 'Start date (Monday of week 1)';
$string['weeksheading'] = 'Weeks';
$string['weeknumberheader'] = 'Week';
$string['titleheader'] = 'Title';
$string['messageheader'] = 'Message';
$string['opensheader'] = 'Class day';
$string['classdaylabel'] = 'Class day';
$string['locksheader'] = 'Locks';
$string['openenablelabel'] = 'Gate replies until this time';
$string['lockenablelabel'] = 'Lock replies after';
$string['durationlabel'] = 'Duration';
$string['durationunit_days'] = 'day(s)';
$string['durationunit_weeks'] = 'week(s)';
$string['locktimelabel'] = 'at';
$string['exactdateslabel'] = 'Use exact dates instead';
$string['exactopenlabel'] = 'Opens at';
$string['exactlocklabel'] = 'Locks at';
$string['exactdisplaystartlabel'] = 'Display start';
$string['exactdisplayendlabel'] = 'Display end';
$string['openwithoutlockerror'] = 'A week set to "gate replies until this time" also needs "lock replies after" ticked - local_forumlock can\'t open-gate a discussion that never locks.';
$string['emptybodyerror'] = 'These weeks have no message text: __WEEKS__. Add some text (or tick Skip) before generating.';
$string['addweek'] = 'Add week';
$string['removeweek'] = 'Remove';
$string['duplicateweek'] = 'Duplicate';
$string['moveweekup'] = 'Move up';
$string['moveweekdown'] = 'Move down';
$string['skiplabel'] = 'Skip (holiday - no discussion)';
$string['overridelabel'] = 'Override date for this week';
$string['overridedatelabel'] = 'Week starts';
$string['displayperiodlabel'] = 'Set display period (hides the discussion outside this window, separate from locking)';
$string['displaystartlabel'] = 'Display start';
$string['displayendlabel'] = 'Display end';
$string['downloadtemplate'] = 'Download template (JSON)';
$string['uploadtemplate'] = 'Upload template';
$string['generatebutton'] = 'Generate discussions';
$string['downloadandgeneratebutton'] = 'Download template & generate';
$string['generateconfirm'] = 'This will create {$a} real discussions in this forum, each with its own open/lock schedule. This can\'t be undone automatically - continue?';
$string['generatesuccess'] = '{$a->created} discussion(s) created and scheduled. {$a->skipped} week(s) skipped as holidays.';
$string['weekday_1'] = 'Monday';
$string['weekday_2'] = 'Tuesday';
$string['weekday_3'] = 'Wednesday';
$string['weekday_4'] = 'Thursday';
$string['weekday_5'] = 'Friday';
$string['weekday_6'] = 'Saturday';
$string['weekday_7'] = 'Sunday';
$string['privacy:metadata:null_provider_reason'] = 'This plugin creates real forum discussions (covered by mod_forum\'s own privacy provider) and hands scheduling entirely to local_forumlock (covered by its provider) - it stores no data of its own.';

$string['downloaddiscussionsbutton'] = 'Download discussions (no replies)';
$string['help_downloaddiscussions'] = 'Downloads the discussions currently in this forum (titles and original posts only, no student replies) as a JSON template you can upload into a new intake\'s forum. Dates come across as exact dates from what\'s live right now - you\'ll need to adjust them for the new term after uploading.';
$string['help_startdate'] = 'The Monday used as the base for every week\'s date, unless a row has its own override date or uses exact dates.';
$string['help_classday'] = 'The day and time this topic naturally starts (e.g. your class day). Used both as the reply-opening time (if gating is on) and as the base for the lock duration below, even when gating is off.';
$string['help_gatereplies'] = 'If ticked, students can\'t reply until the class day/time above. If unticked, the discussion is open immediately, but the class day is still used as the base for the lock duration.';
$string['help_lockreplies'] = 'If ticked, replies close automatically after the duration below, counted from the class day/time. E.g. 7 days = locks a week after class day; 3 days = locks a few days after.';
$string['help_exactdates'] = 'Bypasses the class day/duration above for this one row - pick literal dates and times for Open, Lock, and Display period instead. Useful for one-off cases that don\'t fit a weekly pattern.';
$string['help_override'] = 'Replaces this week\'s normal "start date + week number" calculation with a specific date you choose - use this for irregular gaps, e.g. the week after a holiday.';
$string['help_skip'] = 'Keeps this row in its numbered slot (so later weeks still land on their normal calendar dates) but creates no discussion for it - use for a holiday or no-class week.';
$string['help_displayperiod'] = 'Optionally sets Moodle\'s own "Display period" on the discussion, which hides it entirely outside this window - separate from the reply-locking above, and off by default.';
$string['help_addweek'] = 'Adds a new blank week row to the end of the table.';
$string['help_downloadtemplate'] = 'Saves everything currently in the table as a JSON file, so you can reuse this exact plan (titles, messages, and schedule pattern) for a future intake.';
$string['help_uploadtemplate'] = 'Loads a previously-downloaded JSON template back into the table, ready for you to set a new start date.';
$string['help_generate'] = 'Creates real discussions in this forum from everything in the table right now. This can\'t be undone automatically.';
$string['help_downloadandgenerate'] = 'Downloads a JSON backup of the current plan, then immediately generates the discussions - so you always have a copy of what you created.';
$string['norestrictions'] = 'No restrictions';
$string['help_norestrictions'] = 'Clears Gate replies, Lock replies, and Use exact dates for this row in one click - the discussion posts completely open with no time limits at all.';
