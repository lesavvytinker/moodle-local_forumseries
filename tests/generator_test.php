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

/**
 * Unit tests for local_forumseries\generator.
 *
 * Everything runs in Australia/Brisbane (no daylight saving) with a series
 * start date far in the future, so the expected timestamps are fixed and
 * local_forumlock never discards a lock time for being in the past.
 * The start date, Monday 2099-01-05, is the anchor for every expected value.
 *
 * @package    local_forumseries
 * @copyright  2026 Harvey / Equip English
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \local_forumseries\generator
 */
final class generator_test extends \advanced_testcase {
    /** @var string Timezone used for every test. */
    private const TZ = 'Australia/Brisbane';

    /**
     * Converts a local Brisbane date/time string to a timestamp.
     *
     * @param string $local e.g. '2099-01-12 09:00'
     * @return int
     */
    private function ts(string $local): int {
        return (new \DateTime($local, new \DateTimeZone(self::TZ)))->getTimestamp();
    }

    /**
     * Creates a course, a forum and a set-up user/timezone.
     *
     * @return \stdClass
     */
    private function create_fixture(): \stdClass {
        $this->resetAfterTest();
        $this->setTimezone(self::TZ, self::TZ);
        $this->setAdminUser();

        $course = $this->getDataGenerator()->create_course();
        $forum = $this->getDataGenerator()->create_module('forum', ['course' => $course->id, 'type' => 'qanda']);

        return (object) ['course' => $course, 'forum' => $forum];
    }

    /**
     * Builds one week row with sensible defaults (no lock, no gate, no display period).
     *
     * @param array $overrides
     * @return array
     */
    private function week(array $overrides = []): array {
        return $overrides + [
            'weeknumber'         => 1,
            'title'              => 'Week 1 discussion',
            'message'            => '<p>Hello</p>',
            'skip'               => false,
            'overridedate'       => null,
            'exactdates'         => false,
            'refday'             => 1,
            'reftime'            => '09:00',
            'openenabled'        => false,
            'openat_exact'       => null,
            'lockenabled'        => false,
            'lockdurationvalue'  => 7,
            'lockdurationunit'   => 'days',
            'locktime'           => '17:00',
            'lockat_exact'       => null,
            'displayenabled'     => false,
            'displaystartday'    => 1,
            'displaystarttime'   => '09:00',
            'displayendday'      => 5,
            'displayendtime'     => '17:00',
            'displaystart_exact' => null,
            'displayend_exact'   => null,
        ];
    }

    /**
     * Runs the generator for the fixture's forum.
     *
     * @param \stdClass $fixture
     * @param array $weeks
     * @param array $groupids
     * @return array
     */
    private function generate(\stdClass $fixture, array $weeks, array $groupids = [-1]): array {
        global $USER;
        return generator::generate(
            $fixture->forum->id,
            $USER->id,
            $this->ts('2099-01-05 12:00'),
            $weeks,
            $groupids
        );
    }

    /**
     * Fetches the local_forumlock schedule row for a discussion, or false.
     *
     * @param int $discussionid
     * @return \stdClass|false
     */
    private function schedule(int $discussionid) {
        global $DB;
        return $DB->get_record('local_forumlock_schedule', ['discussionid' => $discussionid]);
    }

    /**
     * Creates one discussion per week with title and message.
     */
    public function test_creates_one_discussion_per_week_with_title_and_message(): void {
        global $DB;
        $fixture = $this->create_fixture();

        $result = $this->generate($fixture, [
            $this->week(['weeknumber' => 1, 'title' => 'First', 'message' => '<p>One</p>']),
            $this->week(['weeknumber' => 2, 'title' => 'Second', 'message' => '<p>Two</p>']),
        ]);

        $this->assertCount(2, $result['created']);
        $this->assertSame([], $result['skipped']);
        $this->assertSame(2, $DB->count_records('forum_discussions', ['forum' => $fixture->forum->id]));

        $first = $DB->get_record('forum_discussions', ['id' => $result['created'][0]]);
        $this->assertSame('First', $first->name);
        $post = $DB->get_record('forum_posts', ['id' => $first->firstpost]);
        $this->assertSame('<p>One</p>', $post->message);
    }

    /**
     * Skipped weeks create nothing and are reported.
     */
    public function test_skipped_weeks_create_nothing_and_are_reported(): void {
        $fixture = $this->create_fixture();

        $result = $this->generate($fixture, [
            $this->week(['weeknumber' => 1]),
            $this->week(['weeknumber' => 2, 'skip' => true]),
            $this->week(['weeknumber' => 3, 'skip' => true]),
        ]);

        $this->assertCount(1, $result['created']);
        $this->assertSame([2, 3], $result['skipped']);
    }

    /**
     * Relative schedule resolves open and lock times.
     */
    public function test_relative_schedule_resolves_open_and_lock_times(): void {
        $fixture = $this->create_fixture();

        // Week 2 starts Monday 2099-01-12. Class day is Wednesday 09:00 (the open
        // time), and it locks one week later on that date at 17:00.
        $result = $this->generate($fixture, [
            $this->week([
                'weeknumber' => 2,
                'refday' => 3,
                'reftime' => '09:00',
                'openenabled' => true,
                'lockenabled' => true,
                'lockdurationvalue' => 1,
                'lockdurationunit' => 'weeks',
                'locktime' => '17:00',
            ]),
        ]);

        $schedule = $this->schedule($result['created'][0]);
        $this->assertNotFalse($schedule);
        $this->assertEquals($this->ts('2099-01-14 09:00'), $schedule->openat);
        $this->assertEquals($this->ts('2099-01-21 17:00'), $schedule->lockat);
        $this->assertSame('pending_open', $schedule->status);
    }

    /**
     * Lock only week has no open gate.
     */
    public function test_lock_only_week_has_no_open_gate(): void {
        $fixture = $this->create_fixture();

        $result = $this->generate($fixture, [
            $this->week([
                'weeknumber' => 1,
                'refday' => 1,
                'lockenabled' => true,
                'lockdurationvalue' => 3,
                'lockdurationunit' => 'days',
                'locktime' => '12:30',
            ]),
        ]);

        $schedule = $this->schedule($result['created'][0]);
        $this->assertNotFalse($schedule);
        $this->assertEquals(0, $schedule->openat);
        $this->assertEquals($this->ts('2099-01-08 12:30'), $schedule->lockat);
        $this->assertSame('pending_lock', $schedule->status);
    }

    /**
     * Open gate is dropped when there is no lock.
     */
    public function test_open_gate_is_dropped_when_there_is_no_lock(): void {
        $fixture = $this->create_fixture();

        $result = $this->generate($fixture, [
            $this->week(['openenabled' => true, 'lockenabled' => false]),
        ]);

        $this->assertCount(1, $result['created']);
        $this->assertFalse($this->schedule($result['created'][0]));
    }

    /**
     * Override date replaces the computed week start.
     */
    public function test_override_date_replaces_the_computed_week_start(): void {
        $fixture = $this->create_fixture();

        // Without the override, week 3 would start 2099-01-19. Monday 2099-03-02 wins.
        $result = $this->generate($fixture, [
            $this->week([
                'weeknumber' => 3,
                'overridedate' => '2099-03-02',
                'refday' => 1,
                'lockenabled' => true,
                'lockdurationvalue' => 1,
                'lockdurationunit' => 'days',
                'locktime' => '17:00',
            ]),
        ]);

        $schedule = $this->schedule($result['created'][0]);
        $this->assertEquals($this->ts('2099-03-03 17:00'), $schedule->lockat);
    }

    /**
     * Exact dates mode uses literal datetimes.
     */
    public function test_exact_dates_mode_uses_literal_datetimes(): void {
        global $DB;
        $fixture = $this->create_fixture();

        $result = $this->generate($fixture, [
            $this->week([
                'exactdates' => true,
                'openenabled' => true,
                'openat_exact' => '2099-02-01T10:00',
                'lockenabled' => true,
                'lockat_exact' => '2099-02-08T16:30',
                'displayenabled' => true,
                'displaystart_exact' => '2099-01-30T08:00',
                'displayend_exact' => '2099-02-09T20:00',
            ]),
        ]);

        $schedule = $this->schedule($result['created'][0]);
        $this->assertEquals($this->ts('2099-02-01 10:00'), $schedule->openat);
        $this->assertEquals($this->ts('2099-02-08 16:30'), $schedule->lockat);

        $discussion = $DB->get_record('forum_discussions', ['id' => $result['created'][0]]);
        $this->assertEquals($this->ts('2099-01-30 08:00'), $discussion->timestart);
        $this->assertEquals($this->ts('2099-02-09 20:00'), $discussion->timeend);
    }

    /**
     * Relative display period is resolved within the week.
     */
    public function test_relative_display_period_is_resolved_within_the_week(): void {
        global $DB;
        $fixture = $this->create_fixture();

        $result = $this->generate($fixture, [
            $this->week([
                'weeknumber' => 1,
                'displayenabled' => true,
                'displaystartday' => 1,
                'displaystarttime' => '09:00',
                'displayendday' => 5,
                'displayendtime' => '17:00',
            ]),
        ]);

        $discussion = $DB->get_record('forum_discussions', ['id' => $result['created'][0]]);
        $this->assertEquals($this->ts('2099-01-05 09:00'), $discussion->timestart);
        $this->assertEquals($this->ts('2099-01-09 17:00'), $discussion->timeend);
    }

    /**
     * Default is a single all participants discussion.
     */
    public function test_default_is_a_single_all_participants_discussion(): void {
        global $DB;
        $fixture = $this->create_fixture();

        $result = $this->generate($fixture, [$this->week()]);

        $this->assertCount(1, $result['created']);
        $discussion = $DB->get_record('forum_discussions', ['id' => $result['created'][0]]);
        $this->assertEquals(-1, $discussion->groupid);
    }

    /**
     * Empty group list falls back to all participants.
     */
    public function test_empty_group_list_falls_back_to_all_participants(): void {
        global $DB;
        $fixture = $this->create_fixture();

        $result = $this->generate($fixture, [$this->week()], []);

        $this->assertCount(1, $result['created']);
        $discussion = $DB->get_record('forum_discussions', ['id' => $result['created'][0]]);
        $this->assertEquals(-1, $discussion->groupid);
    }

    /**
     * One discussion is created per week per group.
     */
    public function test_one_discussion_is_created_per_week_per_group(): void {
        global $DB;
        $fixture = $this->create_fixture();
        $group1 = $this->getDataGenerator()->create_group(['courseid' => $fixture->course->id]);
        $group2 = $this->getDataGenerator()->create_group(['courseid' => $fixture->course->id]);

        $lockweek = [
            'lockenabled' => true,
            'lockdurationvalue' => 1,
            'lockdurationunit' => 'days',
            'locktime' => '17:00',
        ];
        $result = $this->generate($fixture, [
            $this->week(['weeknumber' => 1, 'title' => 'Week 1'] + $lockweek),
            $this->week(['weeknumber' => 2, 'title' => 'Week 2'] + $lockweek),
        ], [(int) $group1->id, (int) $group2->id]);

        // 2 weeks x 2 groups.
        $this->assertCount(4, $result['created']);

        $bygroup = [];
        foreach ($result['created'] as $discussionid) {
            $discussion = $DB->get_record('forum_discussions', ['id' => $discussionid]);
            $bygroup[(int) $discussion->groupid][] = $discussion->name;

            // Every copy is scheduled independently, with the same lock time.
            $schedule = $this->schedule($discussionid);
            $this->assertNotFalse($schedule);
        }

        $this->assertEqualsCanonicalizing([(int) $group1->id, (int) $group2->id], array_keys($bygroup));
        $this->assertSame(['Week 1', 'Week 2'], $bygroup[(int) $group1->id]);
        $this->assertSame(['Week 1', 'Week 2'], $bygroup[(int) $group2->id]);
    }

    /**
     * Preview resolves dates without creating anything.
     */
    public function test_preview_resolves_dates_without_creating_anything(): void {
        global $DB;
        $fixture = $this->create_fixture();

        $rows = generator::preview($this->ts('2099-01-05 12:00'), [
            $this->week([
                'weeknumber' => 2,
                'refday' => 3,
                'openenabled' => true,
                'lockenabled' => true,
                'lockdurationvalue' => 1,
                'lockdurationunit' => 'weeks',
            ]),
        ]);

        $format = get_string('strftimedaydatetime', 'langconfig');
        $this->assertCount(1, $rows);
        $this->assertSame(2, $rows[0]['weeknumber']);
        $this->assertSame(userdate($this->ts('2099-01-14 09:00'), $format), $rows[0]['open']);
        $this->assertSame(userdate($this->ts('2099-01-21 17:00'), $format), $rows[0]['lock']);
        $this->assertSame([], $rows[0]['warnings']);
        $this->assertSame(0, $DB->count_records('forum_discussions', ['forum' => $fixture->forum->id]));
    }

    /**
     * Preview matches what generate creates.
     */
    public function test_preview_matches_what_generate_creates(): void {
        $fixture = $this->create_fixture();
        $week = $this->week([
            'refday' => 2,
            'lockenabled' => true,
            'lockdurationvalue' => 2,
            'lockdurationunit' => 'days',
            'locktime' => '15:45',
        ]);

        $rows = generator::preview($this->ts('2099-01-05 12:00'), [$week]);
        $result = $this->generate($fixture, [$week]);

        $schedule = $this->schedule($result['created'][0]);
        $format = get_string('strftimedaydatetime', 'langconfig');
        $this->assertSame(userdate($schedule->lockat, $format), $rows[0]['lock']);
    }

    /**
     * Preview reports skipped weeks and blanks for unset dates.
     */
    public function test_preview_reports_skipped_weeks_and_blanks_for_unset_dates(): void {
        $this->create_fixture();

        $rows = generator::preview($this->ts('2099-01-05 12:00'), [
            $this->week(['weeknumber' => 1]),
            $this->week(['weeknumber' => 2, 'skip' => true]),
        ]);

        $this->assertFalse($rows[0]['skipped']);
        $this->assertSame('', $rows[0]['lock']);
        $this->assertTrue($rows[1]['skipped']);
        $this->assertSame('', $rows[1]['open']);
    }

    /**
     * Preview warns when the lock time has already passed.
     */
    public function test_preview_warns_when_the_lock_time_has_already_passed(): void {
        $this->create_fixture();

        // A series that started in 2000 locks long before now.
        $rows = generator::preview($this->ts('2000-01-03 12:00'), [
            $this->week(['lockenabled' => true, 'lockdurationvalue' => 1, 'lockdurationunit' => 'days']),
        ]);

        $this->assertContains('previewwarnlockpast', $rows[0]['warnings']);
    }

    /**
     * Preview warns when display period ends before it starts.
     */
    public function test_preview_warns_when_display_period_ends_before_it_starts(): void {
        $this->create_fixture();

        $rows = generator::preview($this->ts('2099-01-05 12:00'), [
            $this->week([
                'displayenabled' => true,
                'displaystartday' => 5,
                'displayendday' => 1,
            ]),
        ]);

        $this->assertContains('previewwarndisplayorder', $rows[0]['warnings']);
    }

    /**
     * Clean weeks coerces values and drops an open gate without a lock.
     */
    public function test_clean_weeks_coerces_values_and_drops_an_open_gate_without_a_lock(): void {
        $cleaned = generator::clean_weeks([
            [
                'weeknumber' => '3',
                'title' => 'A title',
                'message' => '<p>Hi</p>',
                'openenabled' => 1,
                'lockenabled' => 0,
                'refday' => 99,
                'lockdurationunit' => 'fortnights',
            ],
        ]);

        $this->assertSame(3, $cleaned[0]['weeknumber']);
        $this->assertFalse($cleaned[0]['openenabled']);
        $this->assertSame(7, $cleaned[0]['refday']);
        $this->assertSame('days', $cleaned[0]['lockdurationunit']);
        $this->assertNull($cleaned[0]['overridedate']);
    }
}
