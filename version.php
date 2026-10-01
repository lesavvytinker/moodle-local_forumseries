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
 * Version details for local_forumseries.
 *
 * @package    local_forumseries
 * @copyright  2026 Harvey / Equip English
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'local_forumseries';
$plugin->version   = 2026092908;
$plugin->requires  = 2024100700;      // Moodle 4.5+. CONFIRM against your exact Moodle 5.x build number.
$plugin->maturity  = MATURITY_ALPHA;  // Brand new - test thoroughly before relying on it.
$plugin->release   = '0.4.0';         // Added group support: a "Generate for" picker creates one copy of the series per selected group instead of one shared discussion.

// Depends on local_forumlock's schedule/lock mechanics - this plugin only
// creates the discussions and hands scheduling off to it.
$plugin->dependencies = [
    'local_forumlock' => 2026091504,
];
