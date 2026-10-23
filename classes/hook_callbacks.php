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

use core\hook\output\before_standard_top_of_body_html_generation;

/**
 * Hook callbacks for local_forumseries.
 *
 * @package    local_forumseries
 * @copyright  2026 Harvey / Equip English
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class hook_callbacks {
    /**
     * Adds "Plan a discussion series" and "Download discussions (no replies)"
     * buttons next to "Add discussion topic" on a forum's own page, only for
     * users who hold local/forumseries:manage.
     *
     * @param before_standard_top_of_body_html_generation $hook
     */
    public static function before_standard_top_of_body_html_generation(
        before_standard_top_of_body_html_generation $hook
    ): void {
        global $PAGE;

        $path = $PAGE->has_set_url() ? $PAGE->url->out_omit_querystring() : '';
        if (strpos($path, '/mod/forum/view.php') === false) {
            return;
        }

        $cm = null;
        if ($PAGE->context && $PAGE->context->contextlevel == CONTEXT_MODULE) {
            $cm = get_coursemodule_from_id('forum', $PAGE->context->instanceid, 0, false, IGNORE_MISSING);
        }

        if (!$cm || $cm->modname !== 'forum' || !has_capability('local/forumseries:manage', $PAGE->context)) {
            return;
        }

        $PAGE->requires->js_call_amd('local_forumseries/forumpage', 'init', [[
            'url'         => (new \moodle_url('/local/forumseries/setup.php', ['id' => $cm->id]))->out(false),
            'linktext'    => get_string('setuplinktext', 'local_forumseries'),
            'exporturl'   => (new \moodle_url('/local/forumseries/export.php'))->out(false),
            'exportlabel' => get_string('downloaddiscussionsbutton', 'local_forumseries'),
            'exporthelp'  => get_string('help_downloaddiscussions', 'local_forumseries'),
            'sesskey'     => sesskey(),
            'forumid'     => (int) $cm->instance,
        ]]);
    }
}
