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
 * Library callbacks for local_forumseries.
 *
 * @package    local_forumseries
 * @copyright  2026 Harvey / Equip English
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Adds a "Plan a discussion series" link next to "Add discussion topic" on
 * the forum's own page, only for users who hold local/forumseries:manage.
 * Same inline-JS technique as local_forumlock, for the same reasons (some
 * nginx configurations don't route a plugin's js/ subfolder through to
 * Moodle even though its PHP files work fine).
 */
function local_forumseries_before_standard_top_of_body_html(): string {
    global $PAGE;

    $path = $PAGE->url ? $PAGE->url->out_omit_querystring() : '';
    if (strpos($path, '/mod/forum/view.php') === false) {
        return '';
    }

    $cm = null;
    if ($PAGE->context && $PAGE->context->contextlevel == CONTEXT_MODULE) {
        $cm = get_coursemodule_from_id('forum', $PAGE->context->instanceid, 0, false, IGNORE_MISSING);
    }

    $output = '';
    if (is_siteadmin()) {
        $cmstatus = $cm ? ('modname=' . $cm->modname . ', instance=' . $cm->instance) : 'could not resolve cm from context';
        $capstatus = ($cm && has_capability('local/forumseries:manage', $PAGE->context)) ? 'yes' : 'no';
        $output .= "<!-- local_forumseries debug: {$cmstatus}, capability={$capstatus} -->\n";
    }

    if (!$cm || $cm->modname !== 'forum' || !has_capability('local/forumseries:manage', $PAGE->context)) {
        return $output;
    }

    $url = (new moodle_url('/local/forumseries/setup.php', ['id' => $cm->id]))->out(false);
    $linktext = get_string('setuplinktext', 'local_forumseries');
    $exporturl = (new moodle_url('/local/forumseries/export.php'))->out(false);
    $exportlabel = get_string('downloaddiscussionsbutton', 'local_forumseries');
    $exporthelp = get_string('help_downloaddiscussions', 'local_forumseries');
    $sesskey = sesskey();
    $forumid = (int) $cm->instance;

    // Every value below is JSON-encoded before interpolation - json_encode()
    // produces a fully-quoted, JS-safe string literal (escaping quotes,
    // apostrophes, backslashes, etc.), so nothing in a lang string can ever
    // break out of the surrounding JS and silently kill this whole script.
    $urljs = json_encode($url);
    $linktextjs = json_encode($linktext);
    $exporturljs = json_encode($exporturl);
    $exportlabeljs = json_encode($exportlabel);
    $exporthelpjs = json_encode($exporthelp);
    $sesskeyjs = json_encode($sesskey);
    $forumidjs = json_encode((string) $forumid);

    // Multiple fallback strategies for finding "Add discussion topic",
    // since it renders differently across Moodle versions/themes - some
    // render it as a plain <a href="...post.php...">, others as a form
    // with a submit button, and text-content matching is the most robust
    // fallback of all since it doesn't depend on markup shape at all.
    $js = <<<JS
(function() {
    'use strict';
    function findAnchorControl() {
        var searchForm = document.querySelector('form[action*="mod/forum/search.php"]') ||
            (document.querySelector('input[name="search"]') ?
                document.querySelector('input[name="search"]').closest('form') : null);
        if (searchForm) { return searchForm; }

        var byHref = document.querySelector('a[href*="mod/forum/post.php"]');
        if (byHref) { return byHref; }

        var byForm = document.querySelector('form[action*="mod/forum/post.php"] button, form[action*="mod/forum/post.php"] input[type="submit"]');
        if (byForm) { return byForm; }

        var candidates = document.querySelectorAll('a, button, input[type="submit"]');
        for (var i = 0; i < candidates.length; i++) {
            var text = (candidates[i].textContent || candidates[i].value || '').trim().toLowerCase();
            if (text.indexOf('add discussion topic') !== -1) {
                return candidates[i];
            }
        }
        return null;
    }

    function downloadDiscussions() {
        var form = document.createElement('form');
        form.method = 'POST';
        form.action = {$exporturljs};

        function addField(name, value) {
            var input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            input.value = value;
            form.appendChild(input);
        }

        addField('sesskey', {$sesskeyjs});
        addField('forumid', {$forumidjs});

        document.body.appendChild(form);
        form.submit();
        window.setTimeout(function() { form.remove(); }, 2000);
    }

    function init() {
        var target = findAnchorControl();
        var link = document.createElement('a');
        link.href = {$urljs};
        link.className = 'btn btn-secondary ml-2';
        link.textContent = {$linktextjs};

        var exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'btn btn-secondary ml-2';
        exportBtn.textContent = {$exportlabeljs};
        exportBtn.title = {$exporthelpjs};
        exportBtn.addEventListener('click', downloadDiscussions);

        if (target) {
            var anchor = target.closest('form') || target;
            anchor.insertAdjacentElement('afterend', link);
            link.insertAdjacentElement('afterend', exportBtn);
        } else {
            console.warn('local_forumseries: could not find any anchor control - falling back to page heading.');
            var heading = document.querySelector('#region-main h1, #region-main .page-header-headings');
            if (heading) {
                heading.insertAdjacentElement('afterend', link);
                link.insertAdjacentElement('afterend', exportBtn);
            }
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
JS;

    $output .= \html_writer::tag('script', $js);
    return $output;
}
