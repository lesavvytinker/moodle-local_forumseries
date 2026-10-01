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

namespace local_forumseries;

defined('MOODLE_INTERNAL') || die();

require_once($GLOBALS['CFG']->dirroot . '/mod/forum/lib.php');

/**
 * Turns a "series" (a list of weeks) into real forum discussions, with
 * locking/opening handed off entirely to
 * \local_forumlock\observer::store_schedule() - this plugin never touches
 * forum_discussions.timelocked itself.
 *
 * Each week has a "reference day" (the natural anchor - e.g. the day class
 * actually happens) plus independent controls for whether replies are
 * gated until that time, and whether/how long after that they lock:
 *
 *   [
 *     'weeknumber'         => 1,
 *     'title'              => 'Week 1: Describing a photo',
 *     'message'            => '<p>...</p>',
 *     'skip'               => false,   // true = holiday/no-class week, don't generate
 *     'overridedate'       => null,    // 'YYYY-MM-DD' or null - literal date for this
 *                                      // week's reference point instead of computing
 *                                      // series start + (weeknumber - 1) weeks.
 *     'exactdates'         => false,   // true = bypass reference day/duration entirely;
 *                                      // use the *_exact fields below (for open, lock,
 *                                      // AND display period) as literal datetimes.
 *     'refday'             => 1,       // ISO weekday, 1 = Monday .. 7 = Sunday - the
 *                                      // "class day" anchor, used for open-gating AND
 *                                      // as the base for the lock duration below.
 *     'reftime'            => '09:00',
 *     'openenabled'        => false,   // gate replies until refday/reftime (or
 *                                      // openat_exact in exact mode). If false, no
 *                                      // gating - immediately postable - but refday
 *                                      // is still the duration base for locking.
 *     'openat_exact'       => null,    // 'YYYY-MM-DDTHH:MM', exact mode only.
 *     'lockenabled'        => false,   // if false, no lock at all for this week (and
 *                                      // openenabled is ignored too - an open-gate
 *                                      // needs an eventual lock to mean anything).
 *     'lockdurationvalue'  => 7,       // how long after refday/reftime it stays open.
 *     'lockdurationunit'   => 'days',  // 'days' | 'weeks'
 *     'locktime'           => '17:00', // time-of-day the lock actually happens.
 *     'lockat_exact'       => null,    // 'YYYY-MM-DDTHH:MM', exact mode only.
 *     'displayenabled'     => false,   // sets the discussion's native Moodle
 *                                      // "Display period" (visibility) - separate
 *                                      // from local_forumlock's reply-locking.
 *     'displaystartday'    => 1,
 *     'displaystarttime'   => '09:00',
 *     'displayendday'      => 5,
 *     'displayendtime'     => '17:00',
 *     'displaystart_exact' => null,    // exact mode only.
 *     'displayend_exact'   => null,    // exact mode only.
 *   ]
 *
 * @package    local_forumseries
 * @copyright  2026 Harvey / Equip English
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class generator {

    /**
     * Generates real discussions for every non-skipped week in $weeks - one
     * discussion per week per group id in $groupids. Moodle's own group
     * mode (Separate/Visible groups, set on the forum itself) decides who
     * can actually see or reply to each one; this just makes sure each
     * selected group gets its own copy instead of one shared discussion.
     *
     * @param int   $forumid
     * @param int   $userid The teacher generating the series - becomes the discussion author.
     * @param int   $startdate Unix timestamp for the series start date (any time-of-day; only the date part is used).
     * @param array $weeks
     * @param int[] $groupids Group ids to generate a copy for, or [-1] (the default) for a
     *                        single "All participants" discussion with no group restriction.
     * @return array{created: int[], skipped: int[]} Discussion IDs created, and week numbers that were skipped.
     */
    public static function generate(int $forumid, int $userid, int $startdate, array $weeks, array $groupids = [-1]): array {
        global $DB;

        if (empty($groupids)) {
            $groupids = [-1];
        }

        $forum = $DB->get_record('forum', ['id' => $forumid], '*', MUST_EXIST);
        get_coursemodule_from_instance('forum', $forum->id, $forum->course, false, MUST_EXIST);

        $tz = \core_date::get_user_timezone_object();
        $seriesstart = new \DateTime('@' . $startdate);
        $seriesstart->setTimezone($tz);
        $seriesstart->setTime(0, 0, 0);

        $created = [];
        $skipped = [];

        foreach ($weeks as $week) {
            if (!empty($week['skip'])) {
                $skipped[] = (int) ($week['weeknumber'] ?? 0);
                continue;
            }

            $exact = !empty($week['exactdates']);
            $weekstart = self::resolve_week_start($seriesstart, (int) $week['weeknumber'], $week['overridedate'] ?? null, $tz);

            if ($exact) {
                $openat = (!empty($week['openenabled']) && !empty($week['openat_exact']))
                    ? self::resolve_exact((string) $week['openat_exact'], $tz) : 0;
                $lockat = (!empty($week['lockenabled']) && !empty($week['lockat_exact']))
                    ? self::resolve_exact((string) $week['lockat_exact'], $tz) : 0;
            } else {
                $refat = self::resolve_datetime($weekstart, (int) $week['refday'], (string) $week['reftime']);
                $openat = !empty($week['openenabled']) ? $refat : 0;
                $lockat = 0;
                if (!empty($week['lockenabled'])) {
                    $unit = (($week['lockdurationunit'] ?? 'days') === 'weeks') ? 7 : 1;
                    $durationdays = max(0, (int) ($week['lockdurationvalue'] ?? 0)) * $unit;
                    $lockat = self::add_days_and_set_time($refat, $durationdays, (string) $week['locktime'], $tz);
                }
            }

            // An open-gate only means anything alongside an eventual lock.
            if ($openat > 0 && $lockat === 0) {
                $openat = 0;
            }

            $timestart = 0;
            $timeend = 0;
            if (!empty($week['displayenabled'])) {
                if ($exact) {
                    $timestart = !empty($week['displaystart_exact']) ? self::resolve_exact((string) $week['displaystart_exact'], $tz) : 0;
                    $timeend = !empty($week['displayend_exact']) ? self::resolve_exact((string) $week['displayend_exact'], $tz) : 0;
                } else {
                    $timestart = self::resolve_datetime($weekstart, (int) ($week['displaystartday'] ?? 1), (string) ($week['displaystarttime'] ?? '09:00'));
                    $timeend = self::resolve_datetime($weekstart, (int) ($week['displayendday'] ?? 5), (string) ($week['displayendtime'] ?? '17:00'));
                }
            }

            // Same computed schedule/content for every group - just one
            // discussion per selected group instead of one shared one.
            foreach ($groupids as $groupid) {
                $discussion = new \stdClass();
                $discussion->course        = $forum->course;
                $discussion->forum         = $forum->id;
                $discussion->name          = $week['title'];
                $discussion->message       = $week['message'];
                $discussion->messageformat = FORMAT_HTML;
                $discussion->messagetrust  = 1;
                $discussion->mailnow       = 0;
                $discussion->groupid       = $groupid;
                $discussion->timestart     = $timestart;
                $discussion->timeend       = $timeend;
                $discussion->userid        = $userid;

                $discussionid = forum_add_discussion($discussion, null, null, $userid);

                \local_forumlock\observer::store_schedule($discussionid, $forum->id, $forum->course, $userid, $lockat, $openat);

                $created[] = $discussionid;
            }
        }

        rebuild_course_cache($forum->course, true);

        return ['created' => $created, 'skipped' => $skipped];
    }

    /**
     * Resolves the "week start" (midnight, the reference date that
     * refday/displaystartday/etc are relative to) for one week: either the
     * literal override date if one was given, or the series start date
     * plus (weeknumber - 1) weeks.
     *
     * @param \DateTime   $seriesstart Midnight, series start date.
     * @param int         $weeknumber
     * @param string|null $overridedate 'YYYY-MM-DD' or null.
     * @param \DateTimeZone $tz
     * @return \DateTime
     */
    private static function resolve_week_start(\DateTime $seriesstart, int $weeknumber, ?string $overridedate, \DateTimeZone $tz): \DateTime {
        if (!empty($overridedate)) {
            $dt = new \DateTime($overridedate, $tz);
            $dt->setTime(0, 0, 0);
            return $dt;
        }

        $weekstart = clone $seriesstart;
        $weekstart->modify('+' . (($weeknumber - 1) * 7) . ' days');
        return $weekstart;
    }

    /**
     * Resolves "the given ISO weekday and time, within this particular
     * week" to a Unix timestamp.
     *
     * @param \DateTime $weekstart Midnight of the target week's reference date.
     * @param int       $isoweekday 1 (Monday) to 7 (Sunday).
     * @param string    $time "HH:MM"
     * @return int
     */
    private static function resolve_datetime(\DateTime $weekstart, int $isoweekday, string $time): int {
        $dt = clone $weekstart;
        $dt->modify('+' . max(0, $isoweekday - 1) . ' days');
        return self::apply_time($dt, $time)->getTimestamp();
    }

    /**
     * Adds a number of whole days to a base timestamp's *date* (ignoring
     * its time-of-day), then applies a separate time-of-day on top. Used
     * for the lock duration, so "7 days later" lands on the calendar date
     * 7 days on regardless of what time the reference point was at.
     *
     * @param int    $basetimestamp
     * @param int    $days
     * @param string $time "HH:MM"
     * @param \DateTimeZone $tz
     * @return int
     */
    private static function add_days_and_set_time(int $basetimestamp, int $days, string $time, \DateTimeZone $tz): int {
        $dt = new \DateTime('@' . $basetimestamp);
        $dt->setTimezone($tz);
        $dt->modify('+' . max(0, $days) . ' days');
        return self::apply_time($dt, $time)->getTimestamp();
    }

    /**
     * Parses a literal 'YYYY-MM-DDTHH:MM' (from a datetime-local input) as
     * a timestamp in the given timezone.
     *
     * @param string $isolocal
     * @param \DateTimeZone $tz
     * @return int
     */
    private static function resolve_exact(string $isolocal, \DateTimeZone $tz): int {
        $dt = new \DateTime($isolocal, $tz);
        return $dt->getTimestamp();
    }

    /**
     * Sets a DateTime's time-of-day from an "HH:MM" string, defaulting
     * sensibly if malformed.
     *
     * @param \DateTime $dt
     * @param string    $time
     * @return \DateTime
     */
    private static function apply_time(\DateTime $dt, string $time): \DateTime {
        $parts = explode(':', $time);
        $hour = isset($parts[0]) && $parts[0] !== '' ? (int) $parts[0] : 9;
        $minute = isset($parts[1]) && $parts[1] !== '' ? (int) $parts[1] : 0;
        $dt->setTime($hour, $minute, 0);
        return $dt;
    }
}
