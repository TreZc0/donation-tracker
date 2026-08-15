from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models

from tracker.models.fields import OneToOneOrNoneField
from tracker.zsr_legacy import default_stats_settings, default_youtube_settings


class ZSRRunMetadata(models.Model):
    """ZSR-specific stream metadata for a scheduled run.

    Keeping these fields in a companion table prevents the modern tracker
    migrations from colliding with columns added directly to SpeedRun by the
    legacy ZSR fork.
    """

    run = OneToOneOrNoneField(
        'tracker.SpeedRun',
        on_delete=models.CASCADE,
        related_name='zsr_metadata',
    )
    short_name = models.CharField(max_length=64, blank=True)
    layout_prefix = models.CharField(max_length=64, blank=True)
    discord = models.CharField(max_length=64, blank=True)
    commentary_layout = models.CharField(max_length=64, blank=True)
    tracker_mode = models.CharField(max_length=64, blank=True)
    chat_group = models.CharField(max_length=64, blank=True, default='ZSRM')
    show_seeding = models.BooleanField(default=False)
    twitch_game = models.CharField(max_length=256, blank=True)
    twitch_tags = models.JSONField(default=list, blank=True)
    youtube = models.JSONField(default=default_youtube_settings, blank=True)
    custom_background = models.CharField(max_length=64, blank=True)
    custom_cta = models.CharField(max_length=128, blank=True)
    custom_channels = models.JSONField(default=dict, blank=True)
    race_time = models.DateTimeField(null=True, blank=True)
    timer_notes = models.TextField(blank=True)
    speedrun_com_slug = models.CharField(max_length=256, blank=True)
    round = models.CharField(max_length=128, blank=True)
    qualifier = models.BooleanField(default=False)
    qualifier_race_count = models.PositiveSmallIntegerField(default=0)
    qualifier_max_races = models.PositiveSmallIntegerField(default=0)
    max_runner_count = models.PositiveSmallIntegerField(
        default=4, validators=[MinValueValidator(1)]
    )
    team_mode = models.BooleanField(default=False)
    team_time = models.CharField(max_length=64, default='default', blank=True)
    use_team_timers = models.BooleanField(default=False)
    hide_timer = models.BooleanField(default=False)
    team_count = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1)]
    )
    bracket = models.TextField(blank=True)
    data_source = models.CharField(max_length=64, blank=True)
    custom_background_hide_assets = models.BooleanField(default=False)
    logo_overlay = models.CharField(max_length=256, blank=True)
    discord_module = models.CharField(max_length=64, default='general', blank=True)
    tournament_module = models.CharField(max_length=64, blank=True)
    tournament_slug = models.CharField(max_length=256, blank=True)
    hint_list = models.JSONField(default=list, blank=True)
    racetime_bot = models.BooleanField(default=False)
    stats = models.JSONField(default=default_stats_settings, blank=True)
    title_template = models.TextField(blank=True)
    custom_music = models.CharField(max_length=256, blank=True)
    sniping_check = models.BooleanField(default=False)
    checklist = models.CharField(max_length=64, default='default', blank=True)
    extra_info = models.TextField(blank=True)
    face_cam = models.BooleanField(default=False)

    class Meta:
        app_label = 'tracker'
        verbose_name = 'ZSR run metadata'
        verbose_name_plural = 'ZSR run metadata'

    def __str__(self):
        return f'ZSR metadata for {self.run}'

    def clean(self):
        super().clean()
        errors = {}
        if not isinstance(self.twitch_tags, list):
            errors['twitch_tags'] = 'Twitch tags must be a JSON array.'
        if not isinstance(self.youtube, dict):
            errors['youtube'] = 'YouTube settings must be a JSON object.'
        if not isinstance(self.custom_channels, dict):
            errors['custom_channels'] = 'Custom channels must be a JSON object.'
        if not isinstance(self.hint_list, list):
            errors['hint_list'] = 'Hint list must be a JSON array.'
        if not isinstance(self.stats, dict):
            errors['stats'] = 'Stats settings must be a JSON object.'
        if errors:
            raise ValidationError(errors)
