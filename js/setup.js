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
(function() {
    'use strict';

    var cfg = window.localForumseries;
    if (!cfg) {
        return;
    }

    var DEFAULT_OPEN_DAY = 1;   // Monday
    var DEFAULT_OPEN_TIME = '09:00';
    var DEFAULT_LOCK_DAY = 5;   // Friday
    var DEFAULT_LOCK_TIME = '17:00';

    var weekCounter = 0;
    var editorIdCounter = 0;
    var tbody = null;
    var startDateInput = null;
    var countInput = null;
    var MAX_DISCUSSION_COUNT = 100; // Sane upper bound - well past a full year of weekly topics.
    var ALL_PARTICIPANTS = -1; // Same sentinel Moodle itself uses for "no group restriction".
    var selectedGroupIds = [ALL_PARTICIPANTS]; // Default: one shared discussion, same as before groups existed.
    var tinyMCEInstance = null;   // Cached once loaded, null if load failed.
    var tinyMCEState = 'idle';    // 'idle' | 'loading' | 'ready' | 'failed'
    var tinyMCEWaiters = [];      // Callbacks queued while a load is in progress.

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

        function resolveAll(result) {
            tinyMCEState = result ? 'ready' : 'failed';
            tinyMCEInstance = result;
            var waiters = tinyMCEWaiters;
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
                    console.warn('local_forumseries: editor_tiny/loader has no getTinyMCE() - using plain text boxes.');
                    resolveAll(null);
                    return;
                }
                Loader.getTinyMCE().then(function(tinymce) {
                    resolveAll(tinymce);
                }).catch(function(err) {
                    console.warn('local_forumseries: could not load TinyMCE, using plain text boxes.', err);
                    resolveAll(null);
                });
            }, function(err) {
                console.warn('local_forumseries: editor_tiny/loader not available, using plain text boxes.', err);
                resolveAll(null);
            });
        } catch (e) {
            console.warn('local_forumseries: unexpected error loading TinyMCE, using plain text boxes.', e);
            resolveAll(null);
        }
    }

    function initEditorForTextarea(textarea) {
        editorIdCounter++;
        var id = 'forumseries-message-' + editorIdCounter;
        textarea.id = id;

        console.log('local_forumseries: requesting editor for ' + id);

        loadTinyMCE(function(tinymce) {
            if (!tinymce) {
                console.warn('local_forumseries: TinyMCE unavailable for ' + id + ' - staying plain text.');
                return;
            }
            if (!document.getElementById(id)) {
                console.warn('local_forumseries: ' + id + ' was removed before TinyMCE loaded - skipping.');
                return;
            }
            if (tinymce.get(id)) {
                console.warn('local_forumseries: ' + id + ' already has an editor instance - skipping duplicate init.');
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
                console.log('local_forumseries: editor ready for ' + id);
            }).catch(function(err) {
                console.warn('local_forumseries: tinymce.init() failed for ' + id, err);
            });
        });
    }

    function destroyEditorForTextarea(textarea) {
        if (tinyMCEInstance && textarea.id) {
            var instance = tinyMCEInstance.get(textarea.id);
            if (instance) {
                instance.remove();
            }
        }
    }

    function getMessageValue(textarea) {
        if (tinyMCEInstance && textarea.id) {
            var instance = tinyMCEInstance.get(textarea.id);
            if (instance) {
                return instance.getContent();
            }
        }
        return textarea.value;
    }

    function setMessageValue(textarea, value) {
        if (tinyMCEInstance && textarea.id) {
            var instance = tinyMCEInstance.get(textarea.id);
            if (instance) {
                instance.setContent(value || '');
                return;
            }
        }
        textarea.value = value || '';
    }

    function helpIcon(text) {
        var icon = document.createElement('span');
        icon.textContent = '?';
        icon.title = text;
        icon.setAttribute('tabindex', '0');
        icon.setAttribute('role', 'img');
        icon.setAttribute('aria-label', text);
        icon.style.display = 'inline-flex';
        icon.style.alignItems = 'center';
        icon.style.justifyContent = 'center';
        icon.style.width = '15px';
        icon.style.height = '15px';
        icon.style.borderRadius = '50%';
        icon.style.background = '#6c757d';
        icon.style.color = '#fff';
        icon.style.fontSize = '10px';
        icon.style.fontWeight = 'bold';
        icon.style.marginLeft = '5px';
        icon.style.cursor = 'help';
        icon.style.verticalAlign = 'middle';
        icon.style.flexShrink = '0';
        return icon;
    }

    function weekdayOptionsHtml(selected) {
        var out = '';
        for (var i = 1; i <= 7; i++) {
            var label = cfg.weekdays[i] || String(i);
            out += '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + label + '</option>';
        }
        return out;
    }

    function addRow(data, insertAfter) {
        weekCounter++;
        data = data || {};

        var row = document.createElement('tr');
        row.dataset.week = String(weekCounter);
        if (data.skip) {
            row.style.opacity = '0.5';
        }

        var numberCell = document.createElement('td');
        numberCell.textContent = String(weekCounter);
        row.appendChild(numberCell);

        var titleCell = document.createElement('td');
        titleCell.style.minWidth = '260px';
        var titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'form-control forumseries-title';
        titleInput.value = data.title || '';
        titleCell.appendChild(titleInput);
        row.appendChild(titleCell);

        var messageCell = document.createElement('td');
        messageCell.style.minWidth = '420px';
        var messageInput = document.createElement('textarea');
        messageInput.className = 'form-control forumseries-message';
        messageInput.rows = 8;
        messageInput.value = data.message || '';
        messageCell.appendChild(messageInput);
        row.appendChild(messageCell);

        var opensCell = document.createElement('td');
        opensCell.style.minWidth = '170px';

        var refLabel = document.createElement('span');
        refLabel.className = 'small text-muted';
        refLabel.textContent = cfg.strings.classdaylabel || 'Class day';
        var refLabelWrap = document.createElement('div');
        refLabelWrap.appendChild(refLabel);
        refLabelWrap.appendChild(helpIcon(cfg.help.classday));
        opensCell.appendChild(refLabelWrap);

        var refRow = document.createElement('div');
        refRow.innerHTML =
            '<select class="form-control forumseries-refday d-inline-block w-auto">' +
            weekdayOptionsHtml(data.refday || DEFAULT_OPEN_DAY) + '</select> ' +
            '<input type="time" class="form-control forumseries-reftime d-inline-block w-auto" value="' +
            (data.reftime || DEFAULT_OPEN_TIME) + '">';
        opensCell.appendChild(refRow);

        var openEnableWrap = document.createElement('div');
        openEnableWrap.className = 'form-check mt-1';
        var openEnableCheckbox = document.createElement('input');
        openEnableCheckbox.type = 'checkbox';
        openEnableCheckbox.className = 'form-check-input forumseries-open-enable';
        openEnableCheckbox.checked = !!data.openenabled;
        var openEnableLabel = document.createElement('label');
        openEnableLabel.className = 'form-check-label small';
        openEnableLabel.textContent = cfg.strings.openenablelabel;
        openEnableWrap.appendChild(openEnableCheckbox);
        openEnableWrap.appendChild(openEnableLabel);
        openEnableWrap.appendChild(helpIcon(cfg.help.gatereplies));
        opensCell.appendChild(openEnableWrap);

        var exactOpenWrap = document.createElement('div');
        exactOpenWrap.style.display = 'none';
        exactOpenWrap.style.marginTop = '0.25rem';
        exactOpenWrap.innerHTML =
            '<label class="small mb-0">' + cfg.strings.exactopenlabel + '</label><br>' +
            '<input type="datetime-local" class="form-control forumseries-exact-openat" value="' +
            (data.openat_exact || '') + '">';
        opensCell.appendChild(exactOpenWrap);
        row.appendChild(opensCell);

        var locksCell = document.createElement('td');
        locksCell.style.minWidth = '190px';

        var lockEnableWrap = document.createElement('div');
        lockEnableWrap.className = 'form-check';
        var lockEnableCheckbox = document.createElement('input');
        lockEnableCheckbox.type = 'checkbox';
        lockEnableCheckbox.className = 'form-check-input forumseries-lock-enable';
        var lockEnableLabel = document.createElement('label');
        lockEnableLabel.className = 'form-check-label';
        lockEnableLabel.textContent = cfg.strings.lockenablelabel;
        lockEnableWrap.appendChild(lockEnableCheckbox);
        lockEnableWrap.appendChild(lockEnableLabel);
        lockEnableWrap.appendChild(helpIcon(cfg.help.lockreplies));
        locksCell.appendChild(lockEnableWrap);

        var lockFieldsWrap = document.createElement('div');
        lockFieldsWrap.style.display = 'none';
        lockFieldsWrap.style.marginTop = '0.25rem';
        lockFieldsWrap.innerHTML =
            '<span class="small">' + cfg.strings.durationlabel + '</span> ' +
            '<input type="number" min="0" class="form-control forumseries-lockdurationvalue d-inline-block" ' +
            'style="width:4.5rem" value="' + (data.lockdurationvalue != null ? data.lockdurationvalue : 7) + '"> ' +
            '<select class="form-control forumseries-lockdurationunit d-inline-block w-auto">' +
            '<option value="days"' + (data.lockdurationunit === 'weeks' ? '' : ' selected') + '>' + cfg.strings.durationunitdays + '</option>' +
            '<option value="weeks"' + (data.lockdurationunit === 'weeks' ? ' selected' : '') + '>' + cfg.strings.durationunitweeks + '</option>' +
            '</select><br>' +
            '<span class="small">' + cfg.strings.locktimelabel + '</span> ' +
            '<input type="time" class="form-control forumseries-locktime d-inline-block w-auto" value="' +
            (data.locktime || DEFAULT_LOCK_TIME) + '">';
        locksCell.appendChild(lockFieldsWrap);

        var exactLockWrap = document.createElement('div');
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
        var exactDatesWrap = document.createElement('div');
        exactDatesWrap.className = 'form-check';
        exactDatesWrap.style.marginTop = '0.5rem';
        var exactDatesCheckbox = document.createElement('input');
        exactDatesCheckbox.type = 'checkbox';
        exactDatesCheckbox.className = 'form-check-input forumseries-exact-enable';
        // Deliberately always unticked on prefill, even if the source data
        // says exactdates: true - so uploading a template never silently
        // switches a row into exact-dates mode without the user choosing
        // to. The underlying openat_exact/lockat_exact/display*_exact
        // values below are still populated, so ticking this back on
        // recovers them exactly.
        exactDatesCheckbox.checked = false;
        var exactDatesLabel = document.createElement('label');
        exactDatesLabel.className = 'form-check-label small';
        exactDatesLabel.textContent = cfg.strings.exactdateslabel;
        exactDatesWrap.appendChild(exactDatesCheckbox);
        exactDatesWrap.appendChild(exactDatesLabel);
        exactDatesWrap.appendChild(helpIcon(cfg.help.exactdates));
        opensCell.appendChild(exactDatesWrap);

        function refreshOpenLockDisplay() {
            var exact = exactDatesCheckbox.checked;
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

        var noRestrictionsBtn = document.createElement('button');
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
        var optionsCell = document.createElement('td');
        optionsCell.style.minWidth = '180px';

        var overrideWrap = document.createElement('div');
        overrideWrap.className = 'form-check';
        var overrideCheckbox = document.createElement('input');
        overrideCheckbox.type = 'checkbox';
        overrideCheckbox.className = 'form-check-input forumseries-override-enable';
        var overrideLabel = document.createElement('label');
        overrideLabel.className = 'form-check-label';
        overrideLabel.textContent = cfg.strings.overridelabel;
        overrideWrap.appendChild(overrideCheckbox);
        overrideWrap.appendChild(overrideLabel);
        overrideWrap.appendChild(helpIcon(cfg.help.override));
        optionsCell.appendChild(overrideWrap);

        var overrideDateWrap = document.createElement('div');
        overrideDateWrap.style.display = 'none';
        overrideDateWrap.style.marginBottom = '0.5rem';
        var overrideDateLabel = document.createElement('label');
        overrideDateLabel.className = 'small';
        overrideDateLabel.textContent = cfg.strings.overridedatelabel;
        var overrideDateInput = document.createElement('input');
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

        var skipWrap = document.createElement('div');
        skipWrap.className = 'form-check';
        var skipCheckbox = document.createElement('input');
        skipCheckbox.type = 'checkbox';
        skipCheckbox.className = 'form-check-input forumseries-skip';
        skipCheckbox.checked = !!data.skip;
        var skipLabel = document.createElement('label');
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
        var displayWrap = document.createElement('div');
        displayWrap.className = 'form-check mt-2';
        var displayCheckbox = document.createElement('input');
        displayCheckbox.type = 'checkbox';
        displayCheckbox.className = 'form-check-input forumseries-display-enable';
        var displayLabel = document.createElement('label');
        displayLabel.className = 'form-check-label';
        displayLabel.textContent = cfg.strings.displayperiodlabel;
        displayWrap.appendChild(displayCheckbox);
        displayWrap.appendChild(displayLabel);
        displayWrap.appendChild(helpIcon(cfg.help.displayperiod));
        optionsCell.appendChild(displayWrap);

        var displayFieldsWrap = document.createElement('div');
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

        var exactDisplayFieldsWrap = document.createElement('div');
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

        function refreshDisplayFields() {
            var exact = exactDatesCheckbox.checked;
            var enabled = displayCheckbox.checked;
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

        var removeCell = document.createElement('td');
        removeCell.style.whiteSpace = 'nowrap';

        var moveUpBtn = document.createElement('button');
        moveUpBtn.type = 'button';
        moveUpBtn.className = 'btn btn-link px-1';
        moveUpBtn.title = cfg.strings.moveweekup || 'Move up';
        moveUpBtn.textContent = '\u25B2';
        moveUpBtn.addEventListener('click', function() {
            var prev = row.previousElementSibling;
            if (prev) {
                tbody.insertBefore(row, prev);
                renumberRows();
            }
        });

        var moveDownBtn = document.createElement('button');
        moveDownBtn.type = 'button';
        moveDownBtn.className = 'btn btn-link px-1';
        moveDownBtn.title = cfg.strings.moveweekdown || 'Move down';
        moveDownBtn.textContent = '\u25BC';
        moveDownBtn.addEventListener('click', function() {
            var next = row.nextElementSibling;
            if (next) {
                tbody.insertBefore(next, row);
                renumberRows();
            }
        });

        var duplicateBtn = document.createElement('button');
        duplicateBtn.type = 'button';
        duplicateBtn.className = 'btn btn-link mr-1';
        duplicateBtn.textContent = cfg.strings.duplicateweek;
        duplicateBtn.addEventListener('click', function() {
            duplicateRow(row);
        });
        var removeBtn = document.createElement('button');
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

    function collectRowData(row) {
        var messageTextarea = row.querySelector('.forumseries-message');
        var overrideEnabled = row.querySelector('.forumseries-override-enable').checked;
        var overrideDate = row.querySelector('.forumseries-overridedate').value;
        var displayEnabled = row.querySelector('.forumseries-display-enable').checked;
        var exactDates = row.querySelector('.forumseries-exact-enable').checked;

        return {
            title: row.querySelector('.forumseries-title').value,
            message: getMessageValue(messageTextarea),
            exactdates: exactDates,
            refday: parseInt(row.querySelector('.forumseries-refday').value, 10),
            reftime: row.querySelector('.forumseries-reftime').value,
            openenabled: row.querySelector('.forumseries-open-enable').checked,
            openat_exact: row.querySelector('.forumseries-exact-openat').value || null,
            lockenabled: row.querySelector('.forumseries-lock-enable').checked,
            lockdurationvalue: parseInt(row.querySelector('.forumseries-lockdurationvalue').value, 10) || 0,
            lockdurationunit: row.querySelector('.forumseries-lockdurationunit').value,
            locktime: row.querySelector('.forumseries-locktime').value,
            lockat_exact: row.querySelector('.forumseries-exact-lockat').value || null,
            skip: row.querySelector('.forumseries-skip').checked,
            overridedate: (overrideEnabled && overrideDate) ? overrideDate : null,
            displayenabled: displayEnabled,
            displaystartday: parseInt(row.querySelector('.forumseries-displaystartday').value, 10),
            displaystarttime: row.querySelector('.forumseries-displaystarttime').value,
            displayendday: parseInt(row.querySelector('.forumseries-displayendday').value, 10),
            displayendtime: row.querySelector('.forumseries-displayendtime').value,
            displaystart_exact: row.querySelector('.forumseries-exact-displaystart').value || null,
            displayend_exact: row.querySelector('.forumseries-exact-displayend').value || null,
        };
    }

    function duplicateRow(sourceRow) {
        var data = collectRowData(sourceRow);
        addRow(data, sourceRow);
        renumberRows();
    }

    function renumberRows() {
        var rows = tbody.querySelectorAll('tr');
        weekCounter = rows.length;
        rows.forEach(function(row, index) {
            row.dataset.week = String(index + 1);
            row.querySelector('td').textContent = String(index + 1);
        });
        syncCountDisplayFromRows();
    }

    function collectWeeks() {
        var rows = tbody.querySelectorAll('tr');
        var weeks = [];
        rows.forEach(function(row, index) {
            var data = collectRowData(row);
            data.weeknumber = index + 1;
            weeks.push(data);
        });
        return weeks;
    }

    function loadWeeks(weeks) {
        tbody.querySelectorAll('tr').forEach(function(row) {
            var textarea = row.querySelector('.forumseries-message');
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
     * @return array week numbers (or 1-based positions) with a suspect link.
     */
    function findLocalFileWeeks(weeks) {
        var suspects = [];
        (weeks || []).forEach(function(week, idx) {
            var html = week.message || '';
            var attrs = html.match(/(?:src|href)\s*=\s*["']([^"']*)["']/gi) || [];
            var hasLocal = attrs.some(function(attr) {
                var m = attr.match(/["']([^"']*)["']\s*$/);
                var url = m ? m[1] : '';
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

    function downloadTemplate() {
        var weeks = collectWeeks();
        var suspects = findLocalFileWeeks(weeks);
        if (suspects.length) {
            var warnMsg = (cfg.strings.localfilewarningdownload ||
                'Row(s) __WEEKS__ appear to link to something hosted on this course. That link will not work ' +
                'once this template is used in a different course - re-upload the file there and update the link.')
                .replace('__WEEKS__', suspects.join(', '));
            window.alert(warnMsg);
        }

        var payload = {
            startdate: startDateInput.value || '',
            weeks: weeks,
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'discussion-series-template.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function downloadExistingDiscussions() {
        var form = document.createElement('form');
        form.method = 'POST';
        form.action = cfg.exporturl;

        function addField(name, value) {
            var input = document.createElement('input');
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

    function handleUpload(file) {
        var reader = new FileReader();
        reader.onload = function() {
            try {
                var payload = JSON.parse(reader.result);
                if (payload.startdate) {
                    startDateInput.value = payload.startdate;
                }
                var weeks = payload.weeks || [];
                loadWeeks(weeks);

                var suspects = findLocalFileWeeks(weeks);
                if (suspects.length) {
                    var warnMsg = (cfg.strings.localfilewarningupload ||
                        'Row(s) __WEEKS__ in this template appear to link to something hosted on the course it ' +
                        'came from. Those links won\'t work in this course - check the messages and re-upload/re-link ' +
                        'anything like that here.')
                        .replace('__WEEKS__', suspects.join(', '));
                    window.alert(warnMsg);
                }
            } catch (e) {
                window.alert('Could not read that file - is it a template downloaded from this page?');
            }
        };
        reader.readAsText(file);
    }

    function isMessageEmpty(html) {
        if (!html) {
            return true;
        }
        var stripped = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
        return stripped.length === 0;
    }

    // Used before the count box removes a row, so we don't silently drop a
    // title/message the user has already written.
    function rowHasContent(row) {
        var title = row.querySelector('.forumseries-title');
        if (title && title.value.trim().length) {
            return true;
        }
        var messageTextarea = row.querySelector('.forumseries-message');
        if (messageTextarea && !isMessageEmpty(getMessageValue(messageTextarea))) {
            return true;
        }
        return false;
    }

    function highlightEmptyBodies() {
        var emptyWeekNumbers = [];
        var rows = tbody.querySelectorAll('tr');
        rows.forEach(function(row, index) {
            var skip = row.querySelector('.forumseries-skip').checked;
            var messageTextarea = row.querySelector('.forumseries-message');
            var empty = !skip && isMessageEmpty(getMessageValue(messageTextarea));

            var cell = messageTextarea.closest('td');
            var tinyContainer = cell.querySelector('.tox-tinymce');
            var target = tinyContainer || messageTextarea;
            target.style.outline = empty ? '2px solid #dc3545' : '';

            if (empty) {
                emptyWeekNumbers.push(index + 1);
            }
        });
        return emptyWeekNumbers;
    }

    function validateAndSubmit() {
        var weeks = collectWeeks();
        var toGenerate = weeks.filter(function(w) { return !w.skip; });

        if (!startDateInput.value) {
            window.alert('Please set a start date first.');
            return false;
        }
        if (!toGenerate.length) {
            window.alert('Add at least one non-skipped week first.');
            return false;
        }
        var badRow = toGenerate.find(function(w) { return w.openenabled && !w.lockenabled; });
        if (badRow) {
            window.alert(cfg.strings.openwithoutlockerror);
            return false;
        }
        var emptyWeekNumbers = highlightEmptyBodies();
        if (emptyWeekNumbers.length) {
            window.alert(cfg.strings.emptybodyerror.replace('__WEEKS__', emptyWeekNumbers.join(', ')));
            return false;
        }

        var groupMultiplier = selectedGroupIds.length || 1;
        var totalCount = toGenerate.length * groupMultiplier;
        var confirmMsg = cfg.strings.confirm.replace('__COUNT__', String(totalCount));
        if (!window.confirm(confirmMsg)) {
            return false;
        }

        var form = document.createElement('form');
        form.method = 'POST';
        form.action = cfg.generateurl;

        function addField(name, value) {
            var input = document.createElement('input');
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
        return true;
    }

    function buildStartDateBlock() {
        var wrap = document.getElementById('forumseries-startdate-wrap');
        wrap.style.display = 'flex';
        wrap.style.flexWrap = 'wrap';
        wrap.style.alignItems = 'flex-end';
        wrap.style.columnGap = '1.5rem';

        var startGroup = document.createElement('div');
        startGroup.style.marginTop = '1rem';

        var label = document.createElement('label');
        label.setAttribute('for', 'forumseries-startdate');
        label.textContent = 'Start date (Monday of week 1)';
        label.style.display = 'inline-block';
        label.style.fontWeight = 'bold';

        var labelRow = document.createElement('div');
        labelRow.appendChild(label);
        labelRow.appendChild(helpIcon(cfg.help.startdate));
        startGroup.appendChild(labelRow);

        startDateInput = document.createElement('input');
        startDateInput.type = 'date';
        startDateInput.id = 'forumseries-startdate';
        startDateInput.className = 'form-control d-inline-block w-auto';
        startGroup.appendChild(startDateInput);

        wrap.appendChild(startGroup);

        var countGroup = document.createElement('div');
        countGroup.style.marginTop = '1rem';

        var countLabel = document.createElement('label');
        countLabel.setAttribute('for', 'forumseries-discussioncount');
        countLabel.textContent = cfg.strings.discussioncountlabel || 'Number of discussions';
        countLabel.style.display = 'inline-block';
        countLabel.style.fontWeight = 'bold';

        var countLabelRow = document.createElement('div');
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
        var groupsGroup = document.createElement('div');
        groupsGroup.style.marginTop = '1rem';

        var groupsLabel = document.createElement('label');
        groupsLabel.textContent = cfg.strings.groupslabel || 'Generate for';
        groupsLabel.style.display = 'inline-block';
        groupsLabel.style.fontWeight = 'bold';

        var groupsLabelRow = document.createElement('div');
        groupsLabelRow.appendChild(groupsLabel);
        groupsLabelRow.appendChild(helpIcon(cfg.help.groups));
        groupsGroup.appendChild(groupsLabelRow);

        var list = document.createElement('div');
        list.style.maxHeight = '120px';
        list.style.overflowY = 'auto';
        list.style.border = '1px solid #ced4da';
        list.style.borderRadius = '0.25rem';
        list.style.padding = '0.4rem 0.6rem';
        list.style.marginTop = '0.25rem';

        var checkboxes = [];

        function makeCheckbox(id, labelText, groupid, checked) {
            var wrapDiv = document.createElement('div');
            wrapDiv.className = 'form-check';

            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'form-check-input';
            checkbox.id = id;
            checkbox.checked = checked;
            checkbox.dataset.groupid = String(groupid);

            var label = document.createElement('label');
            label.className = 'form-check-label';
            label.setAttribute('for', id);
            label.textContent = labelText;

            wrapDiv.appendChild(checkbox);
            wrapDiv.appendChild(label);
            list.appendChild(wrapDiv);
            checkboxes.push(checkbox);
            return checkbox;
        }

        var allCheckbox = makeCheckbox('forumseries-group-all',
            cfg.strings.groupsallparticipants || 'All participants (one shared discussion)',
            ALL_PARTICIPANTS, true);

        var groupCheckboxes = (cfg.groups || []).map(function(g) {
            return makeCheckbox('forumseries-group-' + g.id, g.name, g.id, false);
        });

        function refreshSelection() {
            var selected = checkboxes.filter(function(cb) {
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
    function syncRowCountFromCountInput() {
        if (!countInput || !tbody) {
            return;
        }
        var target = parseInt(countInput.value, 10);
        if (!target || target < 1) {
            target = 1;
        }
        if (target > MAX_DISCUSSION_COUNT) {
            target = MAX_DISCUSSION_COUNT;
        }

        var rows = tbody.querySelectorAll('tr');
        var current = rows.length;

        if (target > current) {
            for (var i = current; i < target; i++) {
                addRow();
            }
        } else if (target < current) {
            var rowsToRemove = Array.prototype.slice.call(rows, target);
            var rowsWithContent = rowsToRemove.filter(rowHasContent);

            if (rowsWithContent.length) {
                var weekNumbers = rowsWithContent.map(function(row) {
                    return row.dataset.week || '?';
                });
                var warnMsg = (cfg.strings.removecontentwarning ||
                    'Row(s) __WEEKS__ already have a title or message written in. Reducing the ' +
                    'count to __COUNT__ will delete those rows, and their content, from the table. Continue?')
                    .replace('__WEEKS__', weekNumbers.join(', '))
                    .replace('__COUNT__', String(target));

                if (!window.confirm(warnMsg)) {
                    // Bail out - put the box back to what the table actually has.
                    countInput.value = String(current);
                    return;
                }
            }

            for (var j = rows.length - 1; j >= target; j--) {
                var textarea = rows[j].querySelector('.forumseries-message');
                if (textarea) {
                    destroyEditorForTextarea(textarea);
                }
                rows[j].remove();
            }
            renumberRows();
        }

        countInput.value = String(target);
    }

    function buildApp() {
        var app = document.getElementById('forumseries-app');

        var scrollWrap = document.createElement('div');
        scrollWrap.style.overflowX = 'auto';
        app.appendChild(scrollWrap);

        var table = document.createElement('table');
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
        var messageHeader = table.querySelectorAll('th')[2];
        if (messageHeader) {
            messageHeader.appendChild(helpIcon(cfg.help.messagelimits));
        }

        function withHelp(el, helpText) {
            var wrap = document.createElement('span');
            wrap.style.display = 'inline-flex';
            wrap.style.alignItems = 'center';
            wrap.style.marginRight = '0.75rem';
            wrap.appendChild(el);
            wrap.appendChild(helpIcon(helpText));
            return wrap;
        }

        var controls = document.createElement('div');
        controls.className = 'mt-2';

        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn btn-secondary';
        addBtn.textContent = cfg.strings.addweek;
        addBtn.addEventListener('click', function() {
            addRow();
        });

        var downloadBtn = document.createElement('button');
        downloadBtn.type = 'button';
        downloadBtn.className = 'btn btn-secondary';
        downloadBtn.textContent = cfg.strings.download;
        downloadBtn.addEventListener('click', downloadTemplate);

        var uploadLabel = document.createElement('label');
        uploadLabel.className = 'btn btn-secondary mb-0';
        uploadLabel.textContent = cfg.strings.upload;
        var uploadInput = document.createElement('input');
        uploadInput.type = 'file';
        uploadInput.accept = 'application/json';
        uploadInput.style.display = 'none';
        uploadInput.addEventListener('change', function() {
            if (uploadInput.files && uploadInput.files[0]) {
                handleUpload(uploadInput.files[0]);
            }
        });
        uploadLabel.appendChild(uploadInput);

        var downloadDiscussionsBtn = document.createElement('button');
        downloadDiscussionsBtn.type = 'button';
        downloadDiscussionsBtn.className = 'btn btn-secondary';
        downloadDiscussionsBtn.textContent = cfg.strings.downloaddiscussions;
        downloadDiscussionsBtn.addEventListener('click', downloadExistingDiscussions);

        var generateBtn = document.createElement('button');
        generateBtn.type = 'button';
        generateBtn.className = 'btn btn-primary';
        generateBtn.textContent = cfg.strings.generate;
        generateBtn.addEventListener('click', validateAndSubmit);

        var downloadAndGenerateBtn = document.createElement('button');
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

    function init() {
        buildStartDateBlock();
        buildApp();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
