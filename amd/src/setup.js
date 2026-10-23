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
 * Builds the interactive weeks table for local_forumseries/setup.php:
 * add/remove week rows, an optional per-row date override (for holiday
 * gaps / irregular scheduling) and a skip flag, rich-text message editing
 * via Moodle's bundled TinyMCE where available, download/upload of the
 * plan as a JSON template, and generating the real discussions.
 *
 * TinyMCE integration uses editor_tiny/loader's getTinyMCE(), which
 * returns the raw TinyMCE object - a lower-risk path than Moodle's more
 * elaborate (and less publicly documented) setupForElementId() wrapper,
 * at the cost of not getting Moodle's own file/image upload handling,
 * which isn't needed for plain descriptive text here. If this AMD module
 * isn't available on your Moodle version, it fails quietly to a plain
 * textarea - verify this against your actual Moodle 5.x build.
 */

let cfg = null;

let DEFAULT_OPEN_DAY = 1; // Monday
let DEFAULT_OPEN_TIME = '09:00';
let DEFAULT_LOCK_DAY = 5; // Friday
let DEFAULT_LOCK_TIME = '17:00';

let weekCounter = 0;
let editorIdCounter = 0;
let tbody = null;
let startDateInput = null;
let countInput = null;
let MAX_DISCUSSION_COUNT = 100; // Sane upper bound - well past a full year of weekly topics.
let ALL_PARTICIPANTS = -1; // Same sentinel Moodle itself uses for "no group restriction".
let selectedGroupIds = [ALL_PARTICIPANTS]; // Default: one shared discussion, same as before groups existed.
let tinyMCEInstance = null; // Cached once loaded, null if load failed.
let tinyMCEState = 'idle'; // 'idle' | 'loading' | 'ready' | 'failed'
let tinyMCEWaiters = []; // Callbacks queued while a load is in progress.

/**
 * Load tiny m c e.
 *
 * @param {*} callback The callback.
 */
function loadTinyMCE(callback) {
    if (tinyMCEState === 'ready') {
        callback(tinyMCEInstance);
        return;
    }
    if (tinyMCEState === 'failed') {
        callback(null);
        return;
    }
    if (tinyMCEState === 'loading') {
        tinyMCEWaiters.push(callback);
        return;
    }

    tinyMCEState = 'loading';
    tinyMCEWaiters.push(callback);

    /**
     * Helper.
     * @param {*} result The result.
     */
    function resolveAll(result) {
        tinyMCEState = result ? 'ready' : 'failed';
        tinyMCEInstance = result;
        let waiters = tinyMCEWaiters;
        tinyMCEWaiters = [];
        waiters.forEach(function(fn) {
            fn(result);
        });
    }

    if (typeof require !== 'function') {
        resolveAll(null);
        return;
    }

    try {
        require(['editor_tiny/loader'], function(Loader) {
            if (!Loader || typeof Loader.getTinyMCE !== 'function') {
                window.console.warn('local_forumseries: editor_tiny/loader has no getTinyMCE() - using plain text boxes.');
                resolveAll(null);
                return;
            }
            Loader.getTinyMCE().then(function(tinymce) {
                resolveAll(tinymce);
                return null;
            }).catch(function(err) {
                window.console.warn('local_forumseries: could not load TinyMCE, using plain text boxes.', err);
                resolveAll(null);
            });
        }, function(err) {
            window.console.warn('local_forumseries: editor_tiny/loader not available, using plain text boxes.', err);
            resolveAll(null);
        });
    } catch (e) {
        window.console.warn('local_forumseries: unexpected error loading TinyMCE, using plain text boxes.', e);
        resolveAll(null);
    }
}

/**
 * Init editor for textarea.
 *
 * @param {*} textarea The textarea.
 */
function initEditorForTextarea(textarea) {
    editorIdCounter++;
    let id = 'forumseries-message-' + editorIdCounter;
    textarea.id = id;

    loadTinyMCE(function(tinymce) {
        if (!tinymce) {
            window.console.warn('local_forumseries: TinyMCE unavailable for ' + id + ' - staying plain text.');
            return;
        }
        if (!document.getElementById(id)) {
            window.console.warn('local_forumseries: ' + id + ' was removed before TinyMCE loaded - skipping.');
            return;
        }
        if (tinymce.get(id)) {
            window.console.warn('local_forumseries: ' + id + ' already has an editor instance - skipping duplicate init.');
            return;
        }
        tinymce.init({
            selector: '#' + id,
            menubar: false,
            // NOTE: no "media" plugin/button here on purpose. TinyMCE's
            // media-embed dialog writes a raw <iframe>, and generate.php
            // sanitizes every message with PARAM_CLEANHTML before saving
            // it - which strips <iframe> tags for security, the same as
            // it would on the real post.php form. The embed would look
            // fine in this editor and then silently vanish once
            // generated. The supported way to add a video is to paste
            // the plain URL as text/a link - Moodle's own "Multimedia
            // plugins" filter turns a recognised video URL into a real
            // player at display time, and that survives PARAM_CLEANHTML
            // fine since it's just a link.
            plugins: 'lists link image table charmap searchreplace visualblocks ' +
                'code fullscreen insertdatetime paste wordcount advlist autolink',
            toolbar: 'undo redo | blocks | bold italic underline strikethrough | ' +
                'forecolor backcolor | alignleft aligncenter alignright alignjustify | ' +
                'bullist numlist outdent indent | link image table | ' +
                'charmap searchreplace | removeformat | fullscreen code',
            height: 400,
            branding: false,
        }).then(function() {
            window.console.log('local_forumseries: editor ready for ' + id);
            return null;
        }).catch(function(err) {
            window.console.warn('local_forumseries: tinymce.init() failed for ' + id, err);
        });
    });
}

/**
 * Destroy editor for textarea.
 *
 * @param {*} textarea The textarea.
 */
function destroyEditorForTextarea(textarea) {
    if (tinyMCEInstance && textarea.id) {
        let instance = tinyMCEInstance.get(textarea.id);
        if (instance) {
            instance.remove();
        }
    }
}

/**
 * Get message value.
 *
 * @param {*} textarea The textarea.
 */
function getMessageValue(textarea) {
    if (tinyMCEInstance && textarea.id) {
        let instance = tinyMCEInstance.get(textarea.id);
        if (instance) {
            return instance.getContent();
        }
    }
    return textarea.value;
}

// One shared popover for every "?" icon: click an icon to show its note,
// click it again, click anywhere else, scroll, or press Escape to close.
// Replaces the old hover tooltip (title attribute), which was fiddly -
// it vanished as soon as the pointer drifted and never worked on touch.
let helpPopover = null;
let helpPopoverOwner = null;

/**
 * Close help popover.
 */
function closeHelpPopover() {
    if (helpPopover && helpPopover.parentNode) {
        helpPopover.parentNode.removeChild(helpPopover);
    }
    if (helpPopoverOwner) {
        helpPopoverOwner.setAttribute('aria-expanded', 'false');
    }
    helpPopover = null;
    helpPopoverOwner = null;
}

/**
 * Open help popover.
 *
 * @param {*} icon The icon.
 * @param {*} text The text.
 */
function openHelpPopover(icon, text) {
    closeHelpPopover();
    let pop = document.createElement('div');
    pop.setAttribute('role', 'tooltip');
    pop.textContent = text;
    pop.style.position = 'fixed';
    pop.style.zIndex = '10000';
    pop.style.maxWidth = '280px';
    pop.style.padding = '8px 10px';
    pop.style.background = '#343a40';
    pop.style.color = '#fff';
    pop.style.fontSize = '13px';
    pop.style.lineHeight = '1.4';
    pop.style.borderRadius = '4px';
    pop.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    pop.style.whiteSpace = 'normal';
    pop.style.visibility = 'hidden';
    document.body.appendChild(pop);

    let r = icon.getBoundingClientRect();
    let pw = pop.offsetWidth;
    let ph = pop.offsetHeight;
    let left = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), window.innerWidth - pw - 8);
    let top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) {
        top = Math.max(8, r.top - ph - 6);
    }
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.style.visibility = 'visible';

    icon.setAttribute('aria-expanded', 'true');
    helpPopover = pop;
    helpPopoverOwner = icon;
}

document.addEventListener('click', function(e) {
    if (helpPopover && e.target !== helpPopoverOwner && !helpPopover.contains(e.target)) {
        closeHelpPopover();
    }
});
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
 closeHelpPopover();
}
});
window.addEventListener('scroll', closeHelpPopover, true);
window.addEventListener('resize', closeHelpPopover);

/**
 * Help icon.
 *
 * @param {*} text The text.
 */
function helpIcon(text) {
    let icon = document.createElement('button');
    icon.type = 'button';
    icon.textContent = '?';
    icon.setAttribute('aria-label', 'Help');
    icon.setAttribute('aria-expanded', 'false');
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.justifyContent = 'center';
    icon.style.width = '15px';
    icon.style.height = '15px';
    icon.style.padding = '0';
    icon.style.border = '0';
    icon.style.borderRadius = '50%';
    icon.style.background = '#6c757d';
    icon.style.color = '#fff';
    icon.style.fontSize = '10px';
    icon.style.fontWeight = 'bold';
    icon.style.marginLeft = '5px';
    icon.style.cursor = 'pointer';
    icon.style.verticalAlign = 'middle';
    icon.style.flexShrink = '0';
    icon.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (helpPopoverOwner === icon) {
            closeHelpPopover();
        } else {
            openHelpPopover(icon, text);
        }
    });
    return icon;
}

/**
 * Weekday options html.
 *
 * @param {*} selected The selected.
 */
function weekdayOptionsHtml(selected) {
    let out = '';
    for (let i = 1; i <= 7; i++) {
        let label = cfg.weekdays[i] || String(i);
        out += '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + label + '</option>';
    }
    return out;
}

/**
 * Add row.
 *
 * @param {*} data The data.
 * @param {*} insertAfter The insert after.
 */
// eslint-disable-next-line complexity
function addRow(data, insertAfter) {
    weekCounter++;
    data = data || {};

    let row = document.createElement('tr');
    row.dataset.week = String(weekCounter);
    if (data.skip) {
        row.style.opacity = '0.5';
    }

    let numberCell = document.createElement('td');
    numberCell.textContent = String(weekCounter);
    row.appendChild(numberCell);

    let titleCell = document.createElement('td');
    titleCell.style.minWidth = '260px';
    let titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'form-control forumseries-title';
    titleInput.value = data.title || '';
    titleCell.appendChild(titleInput);
    row.appendChild(titleCell);

    let messageCell = document.createElement('td');
    messageCell.style.minWidth = '420px';
    let messageInput = document.createElement('textarea');
    messageInput.className = 'form-control forumseries-message';
    messageInput.rows = 8;
    messageInput.value = data.message || '';
    messageCell.appendChild(messageInput);
    row.appendChild(messageCell);

    let opensCell = document.createElement('td');
    opensCell.style.minWidth = '170px';

    let refLabel = document.createElement('span');
    refLabel.className = 'small text-muted';
    refLabel.textContent = cfg.strings.classdaylabel || 'Class day';
    let refLabelWrap = document.createElement('div');
    refLabelWrap.appendChild(refLabel);
    refLabelWrap.appendChild(helpIcon(cfg.help.classday));
    opensCell.appendChild(refLabelWrap);

    let refRow = document.createElement('div');
    refRow.innerHTML =
        '<select class="form-control forumseries-refday d-inline-block w-auto">' +
        weekdayOptionsHtml(data.refday || DEFAULT_OPEN_DAY) + '</select> ' +
        '<input type="time" class="form-control forumseries-reftime d-inline-block w-auto" value="' +
        (data.reftime || DEFAULT_OPEN_TIME) + '">';
    opensCell.appendChild(refRow);

    let openEnableWrap = document.createElement('div');
    openEnableWrap.className = 'form-check mt-1';
    let openEnableCheckbox = document.createElement('input');
    openEnableCheckbox.type = 'checkbox';
    openEnableCheckbox.className = 'form-check-input forumseries-open-enable';
    openEnableCheckbox.checked = !!data.openenabled;
    let openEnableLabel = document.createElement('label');
    openEnableLabel.className = 'form-check-label small';
    openEnableLabel.textContent = cfg.strings.openenablelabel;
    openEnableWrap.appendChild(openEnableCheckbox);
    openEnableWrap.appendChild(openEnableLabel);
    openEnableWrap.appendChild(helpIcon(cfg.help.gatereplies));
    opensCell.appendChild(openEnableWrap);

    let exactOpenWrap = document.createElement('div');
    exactOpenWrap.style.display = 'none';
    exactOpenWrap.style.marginTop = '0.25rem';
    exactOpenWrap.innerHTML =
        '<label class="small mb-0">' + cfg.strings.exactopenlabel + '</label><br>' +
        '<input type="datetime-local" class="form-control forumseries-exact-openat" value="' +
        (data.openat_exact || '') + '">';
    opensCell.appendChild(exactOpenWrap);
    row.appendChild(opensCell);

    let locksCell = document.createElement('td');
    locksCell.style.minWidth = '190px';

    let lockEnableWrap = document.createElement('div');
    lockEnableWrap.className = 'form-check';
    let lockEnableCheckbox = document.createElement('input');
    lockEnableCheckbox.type = 'checkbox';
    lockEnableCheckbox.className = 'form-check-input forumseries-lock-enable';
    let lockEnableLabel = document.createElement('label');
    lockEnableLabel.className = 'form-check-label';
    lockEnableLabel.textContent = cfg.strings.lockenablelabel;
    lockEnableWrap.appendChild(lockEnableCheckbox);
    lockEnableWrap.appendChild(lockEnableLabel);
    lockEnableWrap.appendChild(helpIcon(cfg.help.lockreplies));
    locksCell.appendChild(lockEnableWrap);

    let lockFieldsWrap = document.createElement('div');
    lockFieldsWrap.style.display = 'none';
    lockFieldsWrap.style.marginTop = '0.25rem';
    lockFieldsWrap.innerHTML =
        '<span class="small">' + cfg.strings.durationlabel + '</span> ' +
        '<input type="number" min="0" class="form-control forumseries-lockdurationvalue d-inline-block" ' +
        'style="width:4.5rem" value="' +
        (data.lockdurationvalue !== null && data.lockdurationvalue !== undefined ? data.lockdurationvalue : 7) + '"> ' +
        '<select class="form-control forumseries-lockdurationunit d-inline-block w-auto">' +
        '<option value="days"' + (data.lockdurationunit === 'weeks' ? '' : ' selected') + '>' +
        cfg.strings.durationunitdays + '</option>' +
        '<option value="weeks"' + (data.lockdurationunit === 'weeks' ? ' selected' : '') + '>' +
        cfg.strings.durationunitweeks + '</option>' +
        '</select><br>' +
        '<span class="small">' + cfg.strings.locktimelabel + '</span> ' +
        '<input type="time" class="form-control forumseries-locktime d-inline-block w-auto" value="' +
        (data.locktime || DEFAULT_LOCK_TIME) + '">';
    locksCell.appendChild(lockFieldsWrap);

    let exactLockWrap = document.createElement('div');
    exactLockWrap.style.display = 'none';
    exactLockWrap.style.marginTop = '0.25rem';
    exactLockWrap.innerHTML =
        '<label class="small mb-0">' + cfg.strings.exactlocklabel + '</label><br>' +
        '<input type="datetime-local" class="form-control forumseries-exact-lockat" value="' +
        (data.lockat_exact || '') + '">';
    locksCell.appendChild(exactLockWrap);

    if (data.lockenabled) {
        lockEnableCheckbox.checked = true;
    }
    row.appendChild(locksCell);

    // --- Exact dates toggle: bypasses class-day/duration entirely for
    // this row, in favour of literal date+time pickers. Lives here
    // since it controls both the Opens and Locks cells above. ---
    let exactDatesWrap = document.createElement('div');
    exactDatesWrap.className = 'form-check';
    exactDatesWrap.style.marginTop = '0.5rem';
    let exactDatesCheckbox = document.createElement('input');
    exactDatesCheckbox.type = 'checkbox';
    exactDatesCheckbox.className = 'form-check-input forumseries-exact-enable';
    // Deliberately always unticked on prefill, even if the source data
    // says exactdates: true - so uploading a template never silently
    // switches a row into exact-dates mode without the user choosing
    // to. The underlying openat_exact/lockat_exact/display*_exact
    // values below are still populated, so ticking this back on
    // recovers them exactly.
    exactDatesCheckbox.checked = false;
    let exactDatesLabel = document.createElement('label');
    exactDatesLabel.className = 'form-check-label small';
    exactDatesLabel.textContent = cfg.strings.exactdateslabel;
    exactDatesWrap.appendChild(exactDatesCheckbox);
    exactDatesWrap.appendChild(exactDatesLabel);
    exactDatesWrap.appendChild(helpIcon(cfg.help.exactdates));
    opensCell.appendChild(exactDatesWrap);

    /**
     *
     */
    function refreshOpenLockDisplay() {
        let exact = exactDatesCheckbox.checked;
        refLabelWrap.style.display = exact ? 'none' : '';
        refRow.style.display = exact ? 'none' : '';
        lockFieldsWrap.style.display = (!exact && lockEnableCheckbox.checked) ? '' : 'none';
        exactOpenWrap.style.display = (exact && openEnableCheckbox.checked) ? '' : 'none';
        exactLockWrap.style.display = (exact && lockEnableCheckbox.checked) ? '' : 'none';
    }

    exactDatesCheckbox.addEventListener('change', refreshOpenLockDisplay);
    openEnableCheckbox.addEventListener('change', refreshOpenLockDisplay);
    lockEnableCheckbox.addEventListener('change', refreshOpenLockDisplay);
    refreshOpenLockDisplay();

    let noRestrictionsBtn = document.createElement('button');
    noRestrictionsBtn.type = 'button';
    noRestrictionsBtn.className = 'btn btn-link btn-sm p-0 mt-1';
    noRestrictionsBtn.textContent = cfg.strings.norestrictions || 'No restrictions';
    noRestrictionsBtn.title = cfg.help.norestrictions || '';
    noRestrictionsBtn.addEventListener('click', function() {
        openEnableCheckbox.checked = false;
        lockEnableCheckbox.checked = false;
        exactDatesCheckbox.checked = false;
        refreshOpenLockDisplay();
    });
    opensCell.appendChild(noRestrictionsBtn);


    // --- Override / skip controls ---
    let optionsCell = document.createElement('td');
    optionsCell.style.minWidth = '180px';

    let overrideWrap = document.createElement('div');
    overrideWrap.className = 'form-check';
    let overrideCheckbox = document.createElement('input');
    overrideCheckbox.type = 'checkbox';
    overrideCheckbox.className = 'form-check-input forumseries-override-enable';
    let overrideLabel = document.createElement('label');
    overrideLabel.className = 'form-check-label';
    overrideLabel.textContent = cfg.strings.overridelabel;
    overrideWrap.appendChild(overrideCheckbox);
    overrideWrap.appendChild(overrideLabel);
    overrideWrap.appendChild(helpIcon(cfg.help.override));
    optionsCell.appendChild(overrideWrap);

    let overrideDateWrap = document.createElement('div');
    overrideDateWrap.style.display = 'none';
    overrideDateWrap.style.marginBottom = '0.5rem';
    let overrideDateLabel = document.createElement('label');
    overrideDateLabel.className = 'small';
    overrideDateLabel.textContent = cfg.strings.overridedatelabel;
    let overrideDateInput = document.createElement('input');
    overrideDateInput.type = 'date';
    overrideDateInput.className = 'form-control forumseries-overridedate';
    overrideDateWrap.appendChild(overrideDateLabel);
    overrideDateWrap.appendChild(overrideDateInput);
    optionsCell.appendChild(overrideDateWrap);

    if (data.overridedate) {
        overrideCheckbox.checked = true;
        overrideDateInput.value = data.overridedate;
        overrideDateWrap.style.display = '';
    }
    overrideCheckbox.addEventListener('change', function() {
        overrideDateWrap.style.display = overrideCheckbox.checked ? '' : 'none';
    });

    let skipWrap = document.createElement('div');
    skipWrap.className = 'form-check';
    let skipCheckbox = document.createElement('input');
    skipCheckbox.type = 'checkbox';
    skipCheckbox.className = 'form-check-input forumseries-skip';
    skipCheckbox.checked = !!data.skip;
    let skipLabel = document.createElement('label');
    skipLabel.className = 'form-check-label';
    skipLabel.textContent = cfg.strings.skiplabel;
    skipWrap.appendChild(skipCheckbox);
    skipWrap.appendChild(skipLabel);
    skipWrap.appendChild(helpIcon(cfg.help.skip));
    optionsCell.appendChild(skipWrap);

    skipCheckbox.addEventListener('change', function() {
        row.style.opacity = skipCheckbox.checked ? '0.5' : '';
    });

    // --- Optional native Moodle "Display period" (visibility, separate
    // from local_forumlock's reply-locking) - off by default, for
    // teachers who specifically want it. ---
    let displayWrap = document.createElement('div');
    displayWrap.className = 'form-check mt-2';
    let displayCheckbox = document.createElement('input');
    displayCheckbox.type = 'checkbox';
    displayCheckbox.className = 'form-check-input forumseries-display-enable';
    let displayLabel = document.createElement('label');
    displayLabel.className = 'form-check-label';
    displayLabel.textContent = cfg.strings.displayperiodlabel;
    displayWrap.appendChild(displayCheckbox);
    displayWrap.appendChild(displayLabel);
    displayWrap.appendChild(helpIcon(cfg.help.displayperiod));
    optionsCell.appendChild(displayWrap);

    let displayFieldsWrap = document.createElement('div');
    displayFieldsWrap.style.display = 'none';
    displayFieldsWrap.style.marginTop = '0.25rem';
    displayFieldsWrap.innerHTML =
        '<label class="small mb-0">' + cfg.strings.displaystartlabel + '</label><br>' +
        '<select class="form-control forumseries-displaystartday d-inline-block w-auto">' +
        weekdayOptionsHtml(data.displaystartday || DEFAULT_OPEN_DAY) + '</select> ' +
        '<input type="time" class="form-control forumseries-displaystarttime d-inline-block w-auto" value="' +
        (data.displaystarttime || DEFAULT_OPEN_TIME) + '"><br>' +
        '<label class="small mb-0 mt-1">' + cfg.strings.displayendlabel + '</label><br>' +
        '<select class="form-control forumseries-displayendday d-inline-block w-auto">' +
        weekdayOptionsHtml(data.displayendday || DEFAULT_LOCK_DAY) + '</select> ' +
        '<input type="time" class="form-control forumseries-displayendtime d-inline-block w-auto" value="' +
        (data.displayendtime || DEFAULT_LOCK_TIME) + '">';
    optionsCell.appendChild(displayFieldsWrap);

    let exactDisplayFieldsWrap = document.createElement('div');
    exactDisplayFieldsWrap.style.display = 'none';
    exactDisplayFieldsWrap.style.marginTop = '0.25rem';
    exactDisplayFieldsWrap.innerHTML =
        '<label class="small mb-0">' + cfg.strings.exactdisplaystartlabel + '</label><br>' +
        '<input type="datetime-local" class="form-control forumseries-exact-displaystart" value="' +
        (data.displaystart_exact || '') + '"><br>' +
        '<label class="small mb-0 mt-1">' + cfg.strings.exactdisplayendlabel + '</label><br>' +
        '<input type="datetime-local" class="form-control forumseries-exact-displayend" value="' +
        (data.displayend_exact || '') + '">';
    optionsCell.appendChild(exactDisplayFieldsWrap);

    /**
     *
     */
    function refreshDisplayFields() {
        let exact = exactDatesCheckbox.checked;
        let enabled = displayCheckbox.checked;
        displayFieldsWrap.style.display = (!exact && enabled) ? '' : 'none';
        exactDisplayFieldsWrap.style.display = (exact && enabled) ? '' : 'none';
    }

    if (data.displayenabled) {
        displayCheckbox.checked = true;
    }
    displayCheckbox.addEventListener('change', refreshDisplayFields);
    exactDatesCheckbox.addEventListener('change', refreshDisplayFields);
    refreshDisplayFields();

    row.appendChild(optionsCell);

    let removeCell = document.createElement('td');
    removeCell.style.whiteSpace = 'nowrap';

    let moveUpBtn = document.createElement('button');
    moveUpBtn.type = 'button';
    moveUpBtn.className = 'btn btn-link px-1';
    moveUpBtn.title = cfg.strings.moveweekup || 'Move up';
    moveUpBtn.textContent = '\u25B2';
    moveUpBtn.addEventListener('click', function() {
        let prev = row.previousElementSibling;
        if (prev) {
            tbody.insertBefore(row, prev);
            renumberRows();
        }
    });

    let moveDownBtn = document.createElement('button');
    moveDownBtn.type = 'button';
    moveDownBtn.className = 'btn btn-link px-1';
    moveDownBtn.title = cfg.strings.moveweekdown || 'Move down';
    moveDownBtn.textContent = '\u25BC';
    moveDownBtn.addEventListener('click', function() {
        let next = row.nextElementSibling;
        if (next) {
            tbody.insertBefore(next, row);
            renumberRows();
        }
    });

    let duplicateBtn = document.createElement('button');
    duplicateBtn.type = 'button';
    duplicateBtn.className = 'btn btn-link me-1 mr-1';
    duplicateBtn.textContent = cfg.strings.duplicateweek;
    duplicateBtn.addEventListener('click', function() {
        duplicateRow(row);
    });
    let removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-link text-danger';
    removeBtn.textContent = cfg.strings.removeweek;
    removeBtn.addEventListener('click', function() {
        destroyEditorForTextarea(messageInput);
        row.remove();
        renumberRows();
    });
    removeCell.appendChild(moveUpBtn);
    removeCell.appendChild(moveDownBtn);
    removeCell.appendChild(duplicateBtn);
    removeCell.appendChild(removeBtn);
    row.appendChild(removeCell);

    if (insertAfter && insertAfter.parentNode) {
        insertAfter.parentNode.insertBefore(row, insertAfter.nextSibling);
    } else {
        tbody.appendChild(row);
    }

    initEditorForTextarea(messageInput);

    syncCountDisplayFromRows();

    return row;
}

/**
 * Collect row data.
 *
 * @param {*} row The row.
 */
function collectRowData(row) {
    let messageTextarea = row.querySelector('.forumseries-message');
    let overrideEnabled = row.querySelector('.forumseries-override-enable').checked;
    let overrideDate = row.querySelector('.forumseries-overridedate').value;
    let displayEnabled = row.querySelector('.forumseries-display-enable').checked;
    let exactDates = row.querySelector('.forumseries-exact-enable').checked;

    return {
        title: row.querySelector('.forumseries-title').value,
        message: getMessageValue(messageTextarea),
        exactdates: exactDates,
        refday: parseInt(row.querySelector('.forumseries-refday').value, 10),
        reftime: row.querySelector('.forumseries-reftime').value,
        openenabled: row.querySelector('.forumseries-open-enable').checked,
        'openat_exact': row.querySelector('.forumseries-exact-openat').value || null,
        lockenabled: row.querySelector('.forumseries-lock-enable').checked,
        lockdurationvalue: parseInt(row.querySelector('.forumseries-lockdurationvalue').value, 10) || 0,
        lockdurationunit: row.querySelector('.forumseries-lockdurationunit').value,
        locktime: row.querySelector('.forumseries-locktime').value,
        'lockat_exact': row.querySelector('.forumseries-exact-lockat').value || null,
        skip: row.querySelector('.forumseries-skip').checked,
        overridedate: (overrideEnabled && overrideDate) ? overrideDate : null,
        displayenabled: displayEnabled,
        displaystartday: parseInt(row.querySelector('.forumseries-displaystartday').value, 10),
        displaystarttime: row.querySelector('.forumseries-displaystarttime').value,
        displayendday: parseInt(row.querySelector('.forumseries-displayendday').value, 10),
        displayendtime: row.querySelector('.forumseries-displayendtime').value,
        'displaystart_exact': row.querySelector('.forumseries-exact-displaystart').value || null,
        'displayend_exact': row.querySelector('.forumseries-exact-displayend').value || null,
    };
}

/**
 * Duplicate row.
 *
 * @param {*} sourceRow The source row.
 */
function duplicateRow(sourceRow) {
    let data = collectRowData(sourceRow);
    addRow(data, sourceRow);
    renumberRows();
}

/**
 * Renumber rows.
 */
function renumberRows() {
    let rows = tbody.querySelectorAll('tr');
    weekCounter = rows.length;
    rows.forEach(function(row, index) {
        row.dataset.week = String(index + 1);
        row.querySelector('td').textContent = String(index + 1);
    });
    syncCountDisplayFromRows();
}

/**
 * Collect weeks.
 */
function collectWeeks() {
    let rows = tbody.querySelectorAll('tr');
    let weeks = [];
    rows.forEach(function(row, index) {
        let data = collectRowData(row);
        data.weeknumber = index + 1;
        weeks.push(data);
    });
    return weeks;
}

/**
 * Load weeks.
 *
 * @param {*} weeks The weeks.
 */
function loadWeeks(weeks) {
    tbody.querySelectorAll('tr').forEach(function(row) {
        let textarea = row.querySelector('.forumseries-message');
        if (textarea) {
            destroyEditorForTextarea(textarea);
        }
    });
    tbody.innerHTML = '';
    weekCounter = 0;
    (weeks || []).forEach(function(week) {
        addRow(week);
    });
}

/**
 * Scans a list of week objects for messages that look like they link
 * to something hosted on THIS course (a Moodle pluginfile.php URL, a
 * relative path, or an embedded data: image) rather than a genuine
 * external URL (YouTube, an http(s) link to another site, etc.).
 * Those links don't survive being reused as a template in a different
 * course, so we flag them rather than let it be a silent surprise.
 *
 * @param {*} weeks The weeks.
 * @return array week numbers (or 1-based positions) with a suspect link.
 */
function findLocalFileWeeks(weeks) {
    let suspects = [];
    (weeks || []).forEach(function(week, idx) {
        let html = week.message || '';
        let attrs = html.match(/(?:src|href)\s*=\s*["']([^"']*)["']/gi) || [];
        let hasLocal = attrs.some(function(attr) {
            let m = attr.match(/["']([^"']*)["']\s*$/);
            let url = m ? m[1] : '';
            if (!url) {
                return false;
            }
            if (/^data:/i.test(url)) {
                return true;
            }
            if (/pluginfile\.php/i.test(url)) {
                return true;
            }
            // A genuine external embed/link is a full http(s) URL to
            // some other host. Anything else (relative, //host-relative
            // without a scheme, etc.) is treated as locally-hosted.
            return !/^https?:\/\//i.test(url);
        });
        if (hasLocal) {
            suspects.push(week.weeknumber || (idx + 1));
        }
    });
    return suspects;
}

/**
 * Download template.
 */
function downloadTemplate() {
    let weeks = collectWeeks();
    let suspects = findLocalFileWeeks(weeks);
    if (suspects.length) {
        let warnMsg = (cfg.strings.localfilewarningdownload ||
            'Row(s) __WEEKS__ appear to link to something hosted on this course. That link will not work ' +
            'once this template is used in a different course - re-upload the file there and update the link.')
            .replace('__WEEKS__', suspects.join(', '));
        // eslint-disable-next-line no-alert
        window.alert(warnMsg);
    }

    let payload = {
        startdate: startDateInput.value || '',
        weeks: weeks,
    };
    let blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = 'discussion-series-template.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/**
 * Download existing discussions.
 */
function downloadExistingDiscussions() {
    let form = document.createElement('form');
    form.method = 'POST';
    form.action = cfg.exporturl;

    /**
     * Helper.
     * @param {*} name The name.
     * @param {*} value The value.
     */
    function addField(name, value) {
        let input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
    }

    addField('sesskey', cfg.sesskey);
    addField('forumid', String(cfg.forumid));

    document.body.appendChild(form);
    form.submit();
    window.setTimeout(function() {
        form.remove();
    }, 2000);
}

/**
 * Handle upload.
 *
 * @param {*} file The file.
 */
function handleUpload(file) {
    let reader = new FileReader();
    /**
     *
     */
    reader.onload = function() {
        try {
            let payload = JSON.parse(reader.result);
            if (payload.startdate) {
                startDateInput.value = payload.startdate;
            }
            let weeks = payload.weeks || [];
            loadWeeks(weeks);

            let suspects = findLocalFileWeeks(weeks);
            if (suspects.length) {
                let warnMsg = (cfg.strings.localfilewarningupload ||
                    'Row(s) __WEEKS__ in this template appear to link to something hosted on the course it ' +
                    'came from. Those links won\'t work in this course - check the messages and re-upload/re-link ' +
                    'anything like that here.')
                    .replace('__WEEKS__', suspects.join(', '));
                // eslint-disable-next-line no-alert
                window.alert(warnMsg);
            }
        } catch {
            // eslint-disable-next-line no-alert
            window.alert('Could not read that file - is it a template downloaded from this page?');
        }
    };
    reader.readAsText(file);
}

/**
 * Is message empty.
 *
 * @param {*} html The html.
 */
function isMessageEmpty(html) {
    if (!html) {
        return true;
    }
    let stripped = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
    return stripped.length === 0;
}

// Used before the count box removes a row, so we don't silently drop a
// title/message the user has already written.
/**
 * Row has content.
 *
 * @param {*} row The row.
 */
function rowHasContent(row) {
    let title = row.querySelector('.forumseries-title');
    if (title && title.value.trim().length) {
        return true;
    }
    let messageTextarea = row.querySelector('.forumseries-message');
    if (messageTextarea && !isMessageEmpty(getMessageValue(messageTextarea))) {
        return true;
    }
    return false;
}

/**
 * Highlight empty bodies.
 */
function highlightEmptyBodies() {
    let emptyWeekNumbers = [];
    let rows = tbody.querySelectorAll('tr');
    rows.forEach(function(row, index) {
        let skip = row.querySelector('.forumseries-skip').checked;
        let messageTextarea = row.querySelector('.forumseries-message');
        let empty = !skip && isMessageEmpty(getMessageValue(messageTextarea));

        let cell = messageTextarea.closest('td');
        let tinyContainer = cell.querySelector('.tox-tinymce');
        let target = tinyContainer || messageTextarea;
        target.style.outline = empty ? '2px solid #dc3545' : '';

        if (empty) {
            emptyWeekNumbers.push(index + 1);
        }
    });
    return emptyWeekNumbers;
}

/**
 * Validate and submit.
 */
function validateAndSubmit() {
    let weeks = collectWeeks();
    let toGenerate = weeks.filter(function(w) {
 return !w.skip;
});

    if (!startDateInput.value) {
        // eslint-disable-next-line no-alert
        window.alert('Please set a start date first.');
        return false;
    }
    if (!toGenerate.length) {
        // eslint-disable-next-line no-alert
        window.alert('Add at least one non-skipped week first.');
        return false;
    }
    let badRow = toGenerate.find(function(w) {
 return w.openenabled && !w.lockenabled;
});
    if (badRow) {
        // eslint-disable-next-line no-alert
        window.alert(cfg.strings.openwithoutlockerror);
        return false;
    }
    let emptyWeekNumbers = highlightEmptyBodies();
    if (emptyWeekNumbers.length) {
        // eslint-disable-next-line no-alert
        window.alert(cfg.strings.emptybodyerror.replace('__WEEKS__', emptyWeekNumbers.join(', ')));
        return false;
    }

    let groupMultiplier = selectedGroupIds.length || 1;
    let totalCount = toGenerate.length * groupMultiplier;

    showPreview(weeks, totalCount, function() {
        submitGenerate(weeks);
    });
    return true;
}

/**
 * Submit generate.
 *
 * @param {*} weeks The weeks.
 */
function submitGenerate(weeks) {
    let form = document.createElement('form');
    form.method = 'POST';
    form.action = cfg.generateurl;

    /**
     * Helper.
     * @param {*} name The name.
     * @param {*} value The value.
     */
    function addField(name, value) {
        let input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
    }

    addField('sesskey', cfg.sesskey);
    addField('forumid', String(cfg.forumid));
    addField('startdate', startDateInput.value);
    addField('weeksjson', JSON.stringify(weeks));
    addField('groupidsjson', JSON.stringify(selectedGroupIds));

    document.body.appendChild(form);
    form.submit();
}

// Asks the server what each week would resolve to (using the generator's
// own date maths, so the preview can't drift from what generation does) and
// shows it in a dialog before anything is created. If the preview can't be
// loaded for any reason, falls back to the plain confirm() so generating is
// never blocked by a preview problem.
/**
 * Show preview.
 *
 * @param {*} weeks The weeks.
 * @param {*} totalCount The total count.
 * @param {*} onConfirm The on confirm.
 */
function showPreview(weeks, totalCount, onConfirm) {
    /**
     *
     */
    let fallback = function() {
        // eslint-disable-next-line no-alert
        if (window.confirm(cfg.strings.confirm.replace('__COUNT__', String(totalCount)))) {
            onConfirm();
        }
    };

    let body = new URLSearchParams();
    body.append('sesskey', cfg.sesskey);
    body.append('forumid', String(cfg.forumid));
    body.append('startdate', startDateInput.value);
    body.append('weeksjson', JSON.stringify(weeks));

    fetch(cfg.previewurl, {method: 'POST', body: body, credentials: 'same-origin'})
        .then(function(response) {
            if (!response.ok) {
                throw new Error('preview failed');
            }
            return response.json();
        })
        .then(function(data) {
            if (!data || !Array.isArray(data.rows)) {
                throw new Error('preview malformed');
            }
            renderPreview(data.rows, totalCount, onConfirm);
            return null;
        })
        .catch(function() {
            fallback();
        });
}

/**
 * Preview cell.
 *
 * @param {*} text The text.
 * @param {*} muted The muted.
 */
function previewCell(text, muted) {
    let td = document.createElement('td');
    td.textContent = text;
    if (muted) {
        td.style.color = '#6c757d';
    }
    return td;
}

/**
 * Render preview.
 *
 * @param {*} rows The rows.
 * @param {*} totalCount The total count.
 * @param {*} onConfirm The on confirm.
 */
function renderPreview(rows, totalCount, onConfirm) {
    let strings = cfg.strings;
    let previouslyFocused = document.activeElement;

    let overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0, 0, 0, 0.5)';
    overlay.style.zIndex = '10001';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '1rem';

    let dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'forumseries-preview-title');
    dialog.tabIndex = -1;
    dialog.style.background = 'var(--bs-body-bg, #fff)';
    dialog.style.color = 'var(--bs-body-color, #212529)';
    dialog.style.borderRadius = '6px';
    dialog.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.35)';
    dialog.style.width = '100%';
    dialog.style.maxWidth = '1000px';
    dialog.style.maxHeight = '90vh';
    dialog.style.display = 'flex';
    dialog.style.flexDirection = 'column';

    let header = document.createElement('div');
    header.style.padding = '1rem 1.25rem 0.5rem';
    let title = document.createElement('h4');
    title.id = 'forumseries-preview-title';
    title.textContent = strings.previewtitle;
    title.style.margin = '0 0 0.5rem';
    header.appendChild(title);
    let intro = document.createElement('p');
    intro.textContent = strings.previewintro;
    intro.style.margin = '0';
    header.appendChild(intro);
    if (selectedGroupIds.length > 1 || selectedGroupIds[0] !== ALL_PARTICIPANTS) {
        let groupsNote = document.createElement('p');
        groupsNote.textContent = strings.previewgroupsnote
            .replace('__GROUPS__', String(selectedGroupIds.length))
            .replace('__TOTAL__', String(totalCount));
        groupsNote.style.margin = '0.5rem 0 0';
        groupsNote.style.fontWeight = 'bold';
        header.appendChild(groupsNote);
    }
    dialog.appendChild(header);

    let scroll = document.createElement('div');
    scroll.style.overflow = 'auto';
    scroll.style.padding = '0.5rem 1.25rem';
    scroll.style.flex = '1 1 auto';

    let table = document.createElement('table');
    table.className = 'table table-sm';
    let headRow = document.createElement('tr');
    [strings.previewcolweek, strings.previewcoltitle, strings.previewcolopens,
        strings.previewcollocks, strings.previewcoldisplay, strings.previewcolnotes].forEach(function(label) {
        let th = document.createElement('th');
        th.scope = 'col';
        th.textContent = label;
        headRow.appendChild(th);
    });
    let thead = document.createElement('thead');
    thead.appendChild(headRow);
    table.appendChild(thead);

    let tbodyEl = document.createElement('tbody');
    let notSet = strings.previewnotset;
    rows.forEach(function(row) {
        let tr = document.createElement('tr');
        tr.appendChild(previewCell(String(row.weeknumber), row.skipped));
        tr.appendChild(previewCell(row.title, row.skipped));

        if (row.skipped) {
            let skippedCell = previewCell(strings.previewskipped, true);
            skippedCell.colSpan = 4;
            skippedCell.style.fontStyle = 'italic';
            tr.appendChild(skippedCell);
            tbodyEl.appendChild(tr);
            return;
        }

        tr.appendChild(previewCell(row.open || notSet, !row.open));
        tr.appendChild(previewCell(row.lock || notSet, !row.lock));

        let display = notSet;
        if (row.displaystart && row.displayend) {
            display = row.displaystart + ' \u2013 ' + row.displayend;
        } else if (row.displaystart) {
            display = strings.previewfrom.replace('__DATE__', row.displaystart);
        } else if (row.displayend) {
            display = strings.previewuntil.replace('__DATE__', row.displayend);
        }
        tr.appendChild(previewCell(display, display === notSet));

        let notes = document.createElement('td');
        (row.warnings || []).forEach(function(key) {
            let note = document.createElement('div');
            note.textContent = '\u26A0 ' + ((strings.previewwarnings || {})[key] || key);
            note.style.color = '#b02a37';
            notes.appendChild(note);
        });
        tr.appendChild(notes);
        tbodyEl.appendChild(tr);
    });
    table.appendChild(tbodyEl);
    scroll.appendChild(table);
    dialog.appendChild(scroll);

    let addsOnly = document.createElement('p');
    addsOnly.textContent = strings.previewaddsonly;
    addsOnly.style.margin = '0';
    addsOnly.style.padding = '0.5rem 1.25rem 0';
    addsOnly.style.fontSize = '0.875rem';
    addsOnly.style.color = '#6c757d';
    dialog.appendChild(addsOnly);

    let footer = document.createElement('div');
    footer.style.padding = '0.75rem 1.25rem 1rem';
    footer.style.display = 'flex';
    footer.style.justifyContent = 'flex-end';
    footer.style.gap = '0.5rem';

    /**
     *
     */
    function close() {
        document.removeEventListener('keydown', onKeydown, true);
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
            previouslyFocused.focus();
        }
    }
    /**
     * Helper.
     * @param {*} e The e.
     */
    function onKeydown(e) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
        }
    }

    let cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = strings.previewcancel;
    cancelBtn.addEventListener('click', close);

    let confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = strings.previewgenerate.replace('__COUNT__', String(totalCount));
    confirmBtn.addEventListener('click', function() {
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        onConfirm();
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    dialog.appendChild(footer);

    overlay.appendChild(dialog);
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            close();
        }
    });
    document.addEventListener('keydown', onKeydown, true);
    document.body.appendChild(overlay);
    // Start on "Go back", not the destructive-ish action, so a stray Enter doesn't create anything.
    cancelBtn.focus();
}

/**
 * Build start date block.
 */
function buildStartDateBlock() {
    let wrap = document.getElementById('forumseries-startdate-wrap');
    wrap.style.display = 'flex';
    wrap.style.flexWrap = 'wrap';
    wrap.style.alignItems = 'flex-end';
    wrap.style.columnGap = '1.5rem';

    let startGroup = document.createElement('div');
    startGroup.style.marginTop = '1rem';

    let label = document.createElement('label');
    label.setAttribute('for', 'forumseries-startdate');
    label.textContent = 'Start date (Monday of week 1)';
    label.style.display = 'inline-block';
    label.style.fontWeight = 'bold';

    let labelRow = document.createElement('div');
    labelRow.appendChild(label);
    labelRow.appendChild(helpIcon(cfg.help.startdate));
    startGroup.appendChild(labelRow);

    startDateInput = document.createElement('input');
    startDateInput.type = 'date';
    startDateInput.id = 'forumseries-startdate';
    startDateInput.className = 'form-control d-inline-block w-auto';
    startGroup.appendChild(startDateInput);

    wrap.appendChild(startGroup);

    let countGroup = document.createElement('div');
    countGroup.style.marginTop = '1rem';

    let countLabel = document.createElement('label');
    countLabel.setAttribute('for', 'forumseries-discussioncount');
    countLabel.textContent = cfg.strings.discussioncountlabel || 'Number of discussions';
    countLabel.style.display = 'inline-block';
    countLabel.style.fontWeight = 'bold';

    let countLabelRow = document.createElement('div');
    countLabelRow.appendChild(countLabel);
    countLabelRow.appendChild(helpIcon(cfg.help.discussioncount));
    countGroup.appendChild(countLabelRow);

    countInput = document.createElement('input');
    countInput.type = 'number';
    countInput.id = 'forumseries-discussioncount';
    countInput.className = 'form-control d-inline-block w-auto';
    countInput.min = '1';
    countInput.max = String(MAX_DISCUSSION_COUNT);
    countInput.step = '1';
    countInput.value = '1';
    countInput.addEventListener('change', syncRowCountFromCountInput);
    countGroup.appendChild(countInput);

    // No "generate now" shortcut here on purpose: this box only ever
    // resizes the table. Creating real discussions happens exclusively
    // via the Generate / Download and generate buttons further down,
    // so there's no control near this one that can trigger it.

    wrap.appendChild(countGroup);

    if (cfg.groups && cfg.groups.length) {
        wrap.appendChild(buildGroupsGroup());
    }
}

/**
 * Builds the "Generate for" group-picker: "All participants" (one
 * shared discussion, the default/previous behaviour) plus a checkbox
 * per course group. Selecting any specific group deselects "All
 * participants" and vice versa - picking a mix of "shared" and
 * "per-group" in the same run isn't a combination that makes sense to
 * offer. At least one option stays selected at all times.
 */
function buildGroupsGroup() {
    let groupsGroup = document.createElement('div');
    groupsGroup.style.marginTop = '1rem';

    let groupsLabel = document.createElement('label');
    groupsLabel.textContent = cfg.strings.groupslabel || 'Generate for';
    groupsLabel.style.display = 'inline-block';
    groupsLabel.style.fontWeight = 'bold';

    let groupsLabelRow = document.createElement('div');
    groupsLabelRow.appendChild(groupsLabel);
    groupsLabelRow.appendChild(helpIcon(cfg.help.groups));
    groupsGroup.appendChild(groupsLabelRow);

    let list = document.createElement('div');
    list.style.maxHeight = '120px';
    list.style.overflowY = 'auto';
    list.style.border = '1px solid #ced4da';
    list.style.borderRadius = '0.25rem';
    list.style.padding = '0.4rem 0.6rem';
    list.style.marginTop = '0.25rem';

    let checkboxes = [];

    /**
     * Helper.
     * @param {*} id The id.
     * @param {*} labelText The labelText.
     * @param {*} groupid The groupid.
     * @param {*} checked The checked.
     */
    function makeCheckbox(id, labelText, groupid, checked) {
        let wrapDiv = document.createElement('div');
        wrapDiv.className = 'form-check';

        let checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'form-check-input';
        checkbox.id = id;
        checkbox.checked = checked;
        checkbox.dataset.groupid = String(groupid);

        let label = document.createElement('label');
        label.className = 'form-check-label';
        label.setAttribute('for', id);
        label.textContent = labelText;

        wrapDiv.appendChild(checkbox);
        wrapDiv.appendChild(label);
        list.appendChild(wrapDiv);
        checkboxes.push(checkbox);
        return checkbox;
    }

    let allCheckbox = makeCheckbox('forumseries-group-all',
        cfg.strings.groupsallparticipants || 'All participants (one shared discussion)',
        ALL_PARTICIPANTS, true);

    let groupCheckboxes = (cfg.groups || []).map(function(g) {
        return makeCheckbox('forumseries-group-' + g.id, g.name, g.id, false);
    });

    /**
     *
     */
    function refreshSelection() {
        let selected = checkboxes.filter(function(cb) {
            return cb.checked;
        }).map(function(cb) {
            return parseInt(cb.dataset.groupid, 10);
        });
        if (!selected.length) {
            // Never allow nothing selected - fall back to "All participants".
            allCheckbox.checked = true;
            selected = [ALL_PARTICIPANTS];
        }
        selectedGroupIds = selected;
    }

    allCheckbox.addEventListener('change', function() {
        if (allCheckbox.checked) {
            groupCheckboxes.forEach(function(cb) {
                cb.checked = false;
            });
        }
        refreshSelection();
    });

    groupCheckboxes.forEach(function(cb) {
        cb.addEventListener('change', function() {
            if (cb.checked) {
                allCheckbox.checked = false;
            }
            refreshSelection();
        });
    });

    groupsGroup.appendChild(list);
    return groupsGroup;
}

// Keeps the "Number of discussions" box showing the table's actual row
// count, after any change that adds/removes rows some other way (the
// add/remove/move/duplicate buttons, or loading a template).
/**
 * Sync count display from rows.
 */
function syncCountDisplayFromRows() {
    if (!countInput || !tbody) {
        return;
    }
    countInput.value = String(tbody.querySelectorAll('tr').length);
}

// Adds or removes rows from the bottom of the table so the row count
// matches whatever the user just typed/spun in the count box. Existing
// rows (and their content) are left alone - only the difference at the
// end is touched.
/**
 * Sync row count from count input.
 */
function syncRowCountFromCountInput() {
    if (!countInput || !tbody) {
        return;
    }
    let target = parseInt(countInput.value, 10);
    if (!target || target < 1) {
        target = 1;
    }
    if (target > MAX_DISCUSSION_COUNT) {
        target = MAX_DISCUSSION_COUNT;
    }

    let rows = tbody.querySelectorAll('tr');
    let current = rows.length;

    if (target > current) {
        for (let i = current; i < target; i++) {
            addRow();
        }
    } else if (target < current) {
        let rowsToRemove = Array.prototype.slice.call(rows, target);
        let rowsWithContent = rowsToRemove.filter(rowHasContent);

        if (rowsWithContent.length) {
            let weekNumbers = rowsWithContent.map(function(row) {
                return row.dataset.week || '?';
            });
            let warnMsg = (cfg.strings.removecontentwarning ||
                'Row(s) __WEEKS__ already have a title or message written in. Reducing the ' +
                'count to __COUNT__ will delete those rows, and their content, from the table. Continue?')
                .replace('__WEEKS__', weekNumbers.join(', '))
                .replace('__COUNT__', String(target));

            // eslint-disable-next-line no-alert
            if (!window.confirm(warnMsg)) {
                // Bail out - put the box back to what the table actually has.
                countInput.value = String(current);
                return;
            }
        }

        for (let j = rows.length - 1; j >= target; j--) {
            let textarea = rows[j].querySelector('.forumseries-message');
            if (textarea) {
                destroyEditorForTextarea(textarea);
            }
            rows[j].remove();
        }
        renumberRows();
    }

    countInput.value = String(target);
}

/**
 * Build app.
 */
function buildApp() {
    let app = document.getElementById('forumseries-app');

    let scrollWrap = document.createElement('div');
    scrollWrap.style.overflowX = 'auto';
    app.appendChild(scrollWrap);

    let table = document.createElement('table');
    table.className = 'table table-bordered mt-3';
    table.style.width = 'auto';
    table.innerHTML =
        '<thead><tr>' +
        '<th>' + cfg.strings.weeknumber + '</th>' +
        '<th>' + cfg.strings.title + '</th>' +
        '<th>' + cfg.strings.message + '</th>' +
        '<th>' + cfg.strings.opens + '</th>' +
        '<th>' + cfg.strings.locks + '</th>' +
        '<th></th>' +
        '<th></th>' +
        '</tr></thead><tbody></tbody>';
    scrollWrap.appendChild(table);
    tbody = table.querySelector('tbody');

    // The message column header gets its own help icon too, right where
    // the teacher is about to start typing - not just a banner they may
    // have already scrolled past.
    let messageHeader = table.querySelectorAll('th')[2];
    if (messageHeader) {
        messageHeader.appendChild(helpIcon(cfg.help.messagelimits));
    }

    /**
     * Helper.
     * @param {*} el The el.
     * @param {*} helpText The helpText.
     */
    function withHelp(el, helpText) {
        let wrap = document.createElement('span');
        wrap.style.display = 'inline-flex';
        wrap.style.alignItems = 'center';
        wrap.style.marginRight = '0.75rem';
        wrap.appendChild(el);
        wrap.appendChild(helpIcon(helpText));
        return wrap;
    }

    let controls = document.createElement('div');
    controls.className = 'mt-2';

    let addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-secondary';
    addBtn.textContent = cfg.strings.addweek;
    addBtn.addEventListener('click', function() {
        addRow();
    });

    let downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'btn btn-secondary';
    downloadBtn.textContent = cfg.strings.download;
    downloadBtn.addEventListener('click', downloadTemplate);

    let uploadLabel = document.createElement('label');
    uploadLabel.className = 'btn btn-secondary mb-0';
    uploadLabel.textContent = cfg.strings.upload;
    let uploadInput = document.createElement('input');
    uploadInput.type = 'file';
    uploadInput.accept = 'application/json';
    uploadInput.style.display = 'none';
    uploadInput.addEventListener('change', function() {
        if (uploadInput.files && uploadInput.files[0]) {
            handleUpload(uploadInput.files[0]);
        }
    });
    uploadLabel.appendChild(uploadInput);

    let downloadDiscussionsBtn = document.createElement('button');
    downloadDiscussionsBtn.type = 'button';
    downloadDiscussionsBtn.className = 'btn btn-secondary';
    downloadDiscussionsBtn.textContent = cfg.strings.downloaddiscussions;
    downloadDiscussionsBtn.addEventListener('click', downloadExistingDiscussions);

    let generateBtn = document.createElement('button');
    generateBtn.type = 'button';
    generateBtn.className = 'btn btn-primary';
    generateBtn.textContent = cfg.strings.generate;
    generateBtn.addEventListener('click', validateAndSubmit);

    let downloadAndGenerateBtn = document.createElement('button');
    downloadAndGenerateBtn.type = 'button';
    downloadAndGenerateBtn.className = 'btn btn-primary';
    downloadAndGenerateBtn.textContent = cfg.strings.downloadandgenerate;
    downloadAndGenerateBtn.addEventListener('click', function() {
        downloadTemplate();
        validateAndSubmit();
    });

    controls.appendChild(withHelp(addBtn, cfg.help.addweek));
    controls.appendChild(withHelp(downloadBtn, cfg.help.downloadtemplate));
    controls.appendChild(withHelp(uploadLabel, cfg.help.uploadtemplate));
    controls.appendChild(withHelp(downloadDiscussionsBtn, cfg.help.downloaddiscussions));
    controls.appendChild(withHelp(generateBtn, cfg.help.generate));
    controls.appendChild(withHelp(downloadAndGenerateBtn, cfg.help.downloadandgenerate));
    app.appendChild(controls);

    // Start with one week so the table isn't empty/confusing.
    addRow();
}

/**
 * Start.
 */
function start() {
    buildStartDateBlock();
    buildApp();
}

/**
 * @param {Object} config Page configuration built in setup.php.
 */
export const init = (config) => {
    cfg = config;
    if (!cfg) {
        return;
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
};
