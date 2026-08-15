import json

EXPORT_FORMAT = 'zsr.donation-tracker.run-metadata'
EXPORT_VERSION = 1


def default_youtube_settings():
    return {'record': False, 'playlistID': '', 'includeDate': False}


def default_stats_settings():
    return {'bracket': {'enabled': False}, 'racers': {'enabled': False}}


# Export files intentionally use the names from the legacy database. This
# makes the file an auditable copy of what was stored, rather than silently
# rewriting it during extraction.
LEGACY_FIELD_MAP = {
    'shortname': 'short_name',
    'layout_prefix': 'layout_prefix',
    'discord': 'discord',
    'coms_layout': 'commentary_layout',
    'tracker_mode': 'tracker_mode',
    'chat_group': 'chat_group',
    'show_seeding': 'show_seeding',
    'twitch_game': 'twitch_game',
    'twitch_tags': 'twitch_tags',
    'youtube': 'youtube',
    'custom_bg': 'custom_background',
    'custom_cta': 'custom_cta',
    'custom_channels': 'custom_channels',
    'racetime': 'race_time',
    'timer_notes': 'timer_notes',
    'srcom': 'speedrun_com_slug',
    'round': 'round',
    'quali': 'qualifier',
    'qamount': 'qualifier_race_count',
    'qmax': 'qualifier_max_races',
    'maxRunnerCount': 'max_runner_count',
    'max_runner_count': 'max_runner_count',
    'isTeamMode': 'team_mode',
    'is_team_mode': 'team_mode',
    'team_time': 'team_time',
    'use_team_timers': 'use_team_timers',
    'hide_timer': 'hide_timer',
    'teamCount': 'team_count',
    'team_count': 'team_count',
    'bracket': 'bracket',
    'data_source': 'data_source',
    'custom_bg_hide_assets': 'custom_background_hide_assets',
    'logo_overlay': 'logo_overlay',
    'discord_module': 'discord_module',
    'tourney_module': 'tournament_module',
    'tourney_slug': 'tournament_slug',
    'hint_list': 'hint_list',
    'racetime_bot': 'racetime_bot',
    'stats': 'stats',
    'title_template': 'title_template',
    'custom_music': 'custom_music',
    'sniping_check': 'sniping_check',
    'checklist': 'checklist',
    'extra_info': 'extra_info',
    'face_cam': 'face_cam',
}

STRUCTURED_FIELDS = {
    'twitch_tags': list,
    'youtube': dict,
    'custom_channels': dict,
    'hint_list': list,
    'stats': dict,
}

BOOLEAN_FIELDS = {
    'show_seeding',
    'qualifier',
    'team_mode',
    'use_team_timers',
    'hide_timer',
    'custom_background_hide_assets',
    'racetime_bot',
    'sniping_check',
    'face_cam',
}

INTEGER_DEFAULTS = {
    'qualifier_race_count': 0,
    'qualifier_max_races': 0,
    'max_runner_count': 4,
    'team_count': 1,
}


def normalize_legacy_metadata(metadata):
    """Translate and validate a legacy metadata mapping for the modern model."""

    if not isinstance(metadata, dict):
        raise ValueError('metadata must be a JSON object')

    normalized = {}
    for legacy_name, value in metadata.items():
        if legacy_name not in LEGACY_FIELD_MAP:
            continue
        modern_name = LEGACY_FIELD_MAP[legacy_name]

        if modern_name in STRUCTURED_FIELDS:
            expected_type = STRUCTURED_FIELDS[modern_name]
            if value in (None, ''):
                if modern_name == 'youtube':
                    value = default_youtube_settings()
                elif modern_name == 'stats':
                    value = default_stats_settings()
                else:
                    value = expected_type()
            elif isinstance(value, str):
                try:
                    value = json.loads(value)
                except json.JSONDecodeError as exc:
                    raise ValueError(
                        f'{legacy_name} is not valid JSON: {exc.msg}'
                    ) from exc
            if not isinstance(value, expected_type):
                expected_name = 'array' if expected_type is list else 'object'
                raise ValueError(f'{legacy_name} must contain a JSON {expected_name}')
        elif modern_name in BOOLEAN_FIELDS:
            if isinstance(value, str):
                lowered = value.lower()
                if lowered in ('1', 'true', 'yes', 'on'):
                    value = True
                elif lowered in ('0', 'false', 'no', 'off', ''):
                    value = False
                else:
                    raise ValueError(f'{legacy_name} is not a valid boolean')
            elif value in (0, 1, False, True):
                value = bool(value)
            else:
                raise ValueError(f'{legacy_name} is not a valid boolean')
        elif modern_name in INTEGER_DEFAULTS:
            if value in (None, ''):
                value = INTEGER_DEFAULTS[modern_name]
            try:
                value = int(value)
            except (TypeError, ValueError) as exc:
                raise ValueError(f'{legacy_name} is not a valid integer') from exc
        else:
            value = '' if value is None else str(value)

        normalized[modern_name] = value

    return normalized
