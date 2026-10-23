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
 * Adds "Plan a discussion series" and "Download discussions (no replies)"
 * buttons beside "Add discussion topic" on a forum's own page.
 *
 * Moodle's markup for that control varies across versions/themes, so this
 * tries several strategies to find an anchor point, ending with a
 * text-content match that doesn't depend on markup shape at all.
 *
 * @module     local_forumseries/forumpage
 * @copyright  2026 Harvey / Equip English
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

const findAnchorControl = () => {
    const searchInput = document.querySelector('input[name="search"]');
    const searchForm = document.querySelector('form[action*="mod/forum/search.php"]') ||
        (searchInput ? searchInput.closest('form') : null);
    if (searchForm) {
        return searchForm;
    }

    const byHref = document.querySelector('a[href*="mod/forum/post.php"]');
    if (byHref) {
        return byHref;
    }

    const byForm = document.querySelector(
        'form[action*="mod/forum/post.php"] button, form[action*="mod/forum/post.php"] input[type="submit"]'
    );
    if (byForm) {
        return byForm;
    }

    const candidates = document.querySelectorAll('a, button, input[type="submit"]');
    for (let i = 0; i < candidates.length; i++) {
        const text = (candidates[i].textContent || candidates[i].value || '').trim().toLowerCase();
        if (text.indexOf('add discussion topic') !== -1) {
            return candidates[i];
        }
    }
    return null;
};

const downloadDiscussions = (config) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = config.exporturl;

    const addField = (name, value) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
    };

    addField('sesskey', config.sesskey);
    addField('forumid', String(config.forumid));

    document.body.appendChild(form);
    form.submit();
    window.setTimeout(() => form.remove(), 2000);
};

const addButtons = (config) => {
    const target = findAnchorControl();

    const link = document.createElement('a');
    link.href = config.url;
    // Both spacing classes: ms-2 for Bootstrap 5 themes, ml-2 for Bootstrap 4.
    link.className = 'btn btn-secondary ms-2 ml-2';
    link.textContent = config.linktext;

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'btn btn-secondary ms-2 ml-2';
    exportBtn.textContent = config.exportlabel;
    exportBtn.title = config.exporthelp;
    exportBtn.addEventListener('click', () => downloadDiscussions(config));

    if (target) {
        const anchor = target.closest('form') || target;
        anchor.insertAdjacentElement('afterend', link);
        link.insertAdjacentElement('afterend', exportBtn);
        return;
    }

    window.console.warn('local_forumseries: could not find any anchor control - falling back to page heading.');
    const heading = document.querySelector('#region-main h1, #region-main .page-header-headings');
    if (heading) {
        heading.insertAdjacentElement('afterend', link);
        link.insertAdjacentElement('afterend', exportBtn);
    }
};

/**
 * @param {Object} config {url, linktext, exporturl, exportlabel, exporthelp, sesskey, forumid}
 */
export const init = (config) => {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => addButtons(config));
    } else {
        addButtons(config);
    }
};
