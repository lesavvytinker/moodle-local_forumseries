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

$string['addweek'] = 'Add week';
$string['classdaylabel'] = 'Class day';
$string['discussioncountlabel'] = 'Number of discussions';
$string['displayendlabel'] = 'Display end';
$string['displayperiodlabel'] = 'Set display period (hides the discussion outside this window, separate from locking)';
$string['displaystartlabel'] = 'Display start';
$string['downloadandgeneratebutton'] = 'Download template & generate';
$string['downloaddiscussionsbutton'] = 'Download discussions (no replies)';
$string['downloadtemplate'] = 'Download template (JSON)';
$string['duplicateweek'] = 'Duplicate';
$string['durationlabel'] = 'Duration';
$string['durationunit_days'] = 'day(s)';
$string['durationunit_weeks'] = 'week(s)';
$string['emptybodyerror'] = 'These weeks have no message text: __WEEKS__. Add some text (or tick Skip) before generating.';
$string['exactdateslabel'] = 'Use exact dates instead';
$string['exactdisplayendlabel'] = 'Display end';
$string['exactdisplaystartlabel'] = 'Display start';
$string['exactlocklabel'] = 'Locks at';
$string['exactopenlabel'] = 'Opens at';
$string['forumseries:manage'] = 'Plan and generate a series of Q&A discussions in advance';
$string['generatebutton'] = 'Generate discussions';
$string['generateconfirm'] = 'This will create {$a} real discussions in this forum, each with its own open/lock schedule. It only ever adds new discussions - it won\'t remove or replace anything already in the forum, so running it again (or from a table you\'ve already generated once) will create duplicates. This can\'t be undone automatically - continue?';
$string['generatesuccess'] = '{$a->created} discussion(s) created and scheduled. {$a->skipped} week(s) skipped as holidays.';
$string['groupsallparticipants'] = 'All participants (one shared discussion)';
$string['groupslabel'] = 'Generate for';
$string['help_addweek'] = 'Adds a new blank week row to the end of the table.';
$string['help_classday'] = 'The day and time this topic naturally starts (e.g. your class day). Used both as the reply-opening time (if gating is on) and as the base for the lock duration below, even when gating is off.';
$string['help_discussioncount'] = 'How many discussion rows to plan for. Type a number or use the arrows - rows are added or removed from the bottom of the table to match. Existing rows and their content aren\'t affected.';
$string['help_displayperiod'] = 'Optionally sets Moodle\'s own "Display period" on the discussion, which hides it entirely outside this window - separate from the reply-locking above, and off by default.';
$string['help_downloadandgenerate'] = 'Downloads a JSON backup of the current plan, then immediately generates the discussions - so you always have a copy of what you created.';
$string['help_downloaddiscussions'] = 'Downloads the discussions currently in this forum (titles and original posts only, no student replies) as a JSON template you can upload into a new intake\'s forum. Dates come across as exact dates from what\'s live right now - you\'ll need to adjust them for the new term after uploading.';
$string['help_downloadtemplate'] = 'Saves everything currently in the table as a JSON file, so you can reuse this exact plan (titles, messages, and schedule pattern) for a future intake. If a message links to something you uploaded to this course rather than an external URL (YouTube, Vimeo etc.), that link won\'t work once you\'re in a new course - you\'ll need to re-upload it there and update the link.';
$string['help_exactdates'] = 'Bypasses the class day/duration above for this one row - pick literal dates and times for Open, Lock, and Display period instead. Useful for one-off cases that don\'t fit a weekly pattern.';
$string['help_gatereplies'] = 'If ticked, students can\'t reply until the class day/time above. If unticked, the discussion is open immediately, but the class day is still used as the base for the lock duration.';
$string['help_generate'] = 'Creates real discussions in this forum from everything in the table right now. This can\'t be undone automatically.';
$string['help_groups'] = 'Pick which group(s) to generate this series for. Each selected group gets its own copy of every week (same title/message/schedule), so you don\'t have to post the series once per group by hand. "All participants" creates one shared discussion instead, with no group restriction. Whether other groups can see a group\'s copy, or only its own members can, is controlled by this forum\'s own Group mode setting (Separate groups vs Visible groups) - this just decides how many copies get made and which group each belongs to.';
$string['help_lockreplies'] = 'If ticked, replies close automatically after the duration below, counted from the class day/time. E.g. 7 days = locks a week after class day; 3 days = locks a few days after.';
$string['help_messagelimits'] = 'You can format text and add links. Uploading a file or recording audio/video isn\'t available here, because this row needs to survive being downloaded and re-used as a template for a future intake - an uploaded file or recording can\'t travel inside that template. Add those directly in the forum afterwards instead. To add a YouTube/Vimeo video, paste the plain video URL as text (not a custom-worded link) - Moodle automatically turns it into a real player once the discussion is created.';
$string['help_norestrictions'] = 'Clears Gate replies, Lock replies, and Use exact dates for this row in one click - the discussion posts completely open with no time limits at all.';
$string['help_override'] = 'Replaces this week\'s normal "start date + week number" calculation with a specific date you choose - use this for irregular gaps, e.g. the week after a holiday.';
$string['help_skip'] = 'Keeps this row in its numbered slot (so later weeks still land on their normal calendar dates) but creates no discussion for it - use for a holiday or no-class week.';
$string['help_startdate'] = 'The Monday used as the base for every week\'s date, unless a row has its own override date or uses exact dates.';
$string['help_uploadtemplate'] = 'Loads a previously-downloaded JSON template back into the table, ready for you to set a new start date. If any message links to a file that was uploaded to the course the template came from (rather than an external URL), that link won\'t carry over - check the messages and re-upload/re-link anything like that in this course.';
$string['localfilewarningdownload'] = 'Row(s) __WEEKS__ appear to link to something hosted on this course (not an external URL). That link will not work once this template is used in a different course - re-upload the file there and update the link.';
$string['localfilewarningupload'] = 'Row(s) __WEEKS__ in this template appear to link to something hosted on the course it came from. Those links won\'t work in this course - check the messages and re-upload/re-link anything like that here.';
$string['lockenablelabel'] = 'Lock replies after';
$string['locksheader'] = 'Locks';
$string['locktimelabel'] = 'at';
$string['messageheader'] = 'Message';
$string['moveweekdown'] = 'Move down';
$string['moveweekup'] = 'Move up';
$string['norestrictions'] = 'No restrictions';
$string['notqandaforum'] = 'This tool is designed for Q&A-type forums, so students can see upcoming topics without seeing replies before they\'ve posted their own. This forum is set to a different type.';
$string['openenablelabel'] = 'Gate replies until this time';
$string['opensheader'] = 'Class day';
$string['openwithoutlockerror'] = 'A week set to "gate replies until this time" also needs "lock replies after" ticked - local_forumlock can\'t open-gate a discussion that never locks.';
$string['overridedatelabel'] = 'Week starts';
$string['overridelabel'] = 'Override date for this week';
$string['pluginname'] = 'Discussion series planner';
$string['previewaddsonly'] = 'This only ever adds new discussions - it never removes or replaces anything already in the forum, so creating the same plan twice produces duplicates. It can\'t be undone automatically.';
$string['previewcancel'] = 'Go back';
$string['previewcoldisplay'] = 'Display period';
$string['previewcollocks'] = 'Locks';
$string['previewcolnotes'] = 'Notes';
$string['previewcolopens'] = 'Opens for replies';
$string['previewcoltitle'] = 'Title';
$string['previewcolweek'] = 'Week';
$string['previewfrom'] = 'From {$a}';
$string['previewgenerate'] = 'Create {$a} discussion(s)';
$string['previewgroupsnote'] = 'Each discussion below will be created once for each of the {$a->groups} selected group(s), {$a->total} discussions in all.';
$string['previewintro'] = 'These are the dates each discussion will get, shown in your timezone. Nothing has been created yet.';
$string['previewnotset'] = 'Not set';
$string['previewskipped'] = 'Skipped (no discussion)';
$string['previewtitle'] = 'Preview: what will be created';
$string['previewuntil'] = 'Until {$a}';
$string['previewwarndisplayorder'] = 'The display period ends before it starts.';
$string['previewwarnlockpast'] = 'The lock time has already passed, so this discussion will not be locked.';
$string['previewwarnopenafterlock'] = 'The open time is not before the lock time, so the open gate will be ignored.';
$string['privacy:metadata:null_provider_reason'] = 'This plugin creates real forum discussions (covered by mod_forum\'s own privacy provider) and hands scheduling entirely to local_forumlock (covered by its provider) - it stores no data of its own.';
$string['removecontentwarning'] = 'Row(s) __WEEKS__ already have a title or message written in. Reducing the count to __COUNT__ will delete those rows, and their content, from the table. Continue?';
$string['removeweek'] = 'Remove';
$string['richtextlimitsnotice'] = 'Message formatting here supports text styling and links - it does not support uploading files or recording audio/video. That\'s deliberate: these messages need to survive being downloaded and re-used as a template for a future intake, and an uploaded file or recording can\'t travel inside that template. Add uploaded files or recordings directly in the forum afterwards if you need them. To add a YouTube/Vimeo video, paste the plain video URL as text (not a custom-worded link) - Moodle turns a recognised video URL into a real player automatically once the discussion is created. Don\'t use a raw embed/iframe - it will be stripped out for security when the discussion is generated.';
$string['setuplinktext'] = 'Plan a discussion series';
$string['setuppagetitle'] = 'Plan discussion series';
$string['skiplabel'] = 'Skip (holiday - no discussion)';
$string['startdatelabel'] = 'Start date (Monday of week 1)';
$string['titleheader'] = 'Title';
$string['uploadtemplate'] = 'Upload template';
$string['weekday_1'] = 'Monday';
$string['weekday_2'] = 'Tuesday';
$string['weekday_3'] = 'Wednesday';
$string['weekday_4'] = 'Thursday';
$string['weekday_5'] = 'Friday';
$string['weekday_6'] = 'Saturday';
$string['weekday_7'] = 'Sunday';
$string['weeknumberheader'] = 'Week';
$string['weeksheading'] = 'Weeks';
