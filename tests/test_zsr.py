import json
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test import TestCase, TransactionTestCase

from tracker.api.serializers import SpeedRunSerializer
from tracker.models import Event, SpeedRun, ZSRRunMetadata
from tracker.zsr_legacy import EXPORT_FORMAT, EXPORT_VERSION, LEGACY_FIELD_MAP

from .util import today_noon


class TestZSRLegacyExport(TransactionTestCase):
    def test_export_reads_legacy_columns_by_introspection(self):
        event = Event.objects.create(
            name='ZSR Marathon', short='zsr-export', datetime=today_noon
        )
        run = SpeedRun.objects.create(
            event=event,
            name='Zelda II',
            category='Any%',
            run_time='1:00:00',
        )
        run_table = connection.ops.quote_name(SpeedRun._meta.db_table)
        shortname = connection.ops.quote_name('shortname')

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    f'ALTER TABLE {run_table} ADD COLUMN {shortname} varchar(15)'
                )
                cursor.execute(
                    f'UPDATE {run_table} SET {shortname} = %s WHERE id = %s',
                    ['Zelda2', run.pk],
                )

            with TemporaryDirectory() as directory:
                path = Path(directory) / 'export.json'
                call_command('export_zsr_legacy', path)
                document = json.loads(path.read_text(encoding='utf-8'))

            self.assertEqual(document['source_columns'], ['shortname'])
            self.assertEqual(len(document['runs']), 1)
            self.assertEqual(document['runs'][0]['legacy_run_id'], run.pk)
            self.assertEqual(document['runs'][0]['event']['short'], event.short)
            self.assertEqual(document['runs'][0]['metadata']['shortname'], 'Zelda2')
        finally:
            with connection.cursor() as cursor:
                cursor.execute(f'ALTER TABLE {run_table} DROP COLUMN {shortname}')


class TestZSRFixturePreparation(TestCase):
    def test_rewrites_removed_permission_for_users_and_groups(self):
        old_permission = ['view_full_list', 'tracker', 'donation']
        fixture = [
            {
                'model': 'auth.user',
                'pk': 4,
                'fields': {'user_permissions': [old_permission]},
            },
            {
                'model': 'auth.group',
                'pk': 2,
                'fields': {'permissions': [old_permission]},
            },
        ]

        with TemporaryDirectory() as directory:
            input_path = Path(directory) / 'legacy.json'
            output_path = Path(directory) / 'prepared.json'
            input_path.write_text(json.dumps(fixture), encoding='utf-8')
            output = StringIO()

            call_command(
                'prepare_zsr_fixture', input_path, output_path, stdout=output
            )

            prepared = json.loads(output_path.read_text(encoding='utf-8'))

        expected = ['view_donation', 'tracker', 'donation']
        self.assertEqual(prepared[0]['fields']['user_permissions'], [expected])
        self.assertEqual(prepared[1]['fields']['permissions'], [expected])
        self.assertIn('rewrote 2 permission reference(s)', output.getvalue())


class TestZSRRunMetadata(TestCase):
    def setUp(self):
        self.event = Event.objects.create(
            name='ZSR Marathon', short='zsr', datetime=today_noon
        )
        self.run = SpeedRun.objects.create(
            event=self.event,
            name='The Legend of Zelda',
            category='Any%',
            run_time='1:00:00',
        )

    def document(self, **metadata):
        return {
            'format': EXPORT_FORMAT,
            'version': EXPORT_VERSION,
            'source_columns': list(metadata),
            'runs': [
                {
                    # Deliberately use a different ID to exercise safe identity fallback.
                    'legacy_run_id': self.run.pk + 1000,
                    'event': {'legacy_id': self.event.pk, 'short': self.event.short},
                    'identity': {
                        'name': self.run.name,
                        'category': self.run.category,
                    },
                    'metadata': metadata,
                }
            ],
        }

    def write_document(self, directory, document):
        path = Path(directory) / 'zsr-export.json'
        path.write_text(json.dumps(document), encoding='utf-8')
        return path

    def test_every_legacy_mapping_targets_a_metadata_field(self):
        model_fields = {field.name for field in ZSRRunMetadata._meta.fields}
        self.assertLessEqual(set(LEGACY_FIELD_MAP.values()), model_fields)

    def test_serializer_exposes_optional_metadata(self):
        self.assertIsNone(SpeedRunSerializer(self.run).data['zsr'])
        metadata = ZSRRunMetadata(
            run=self.run,
            short_name='LoZ',
            twitch_tags=['Speedrun'],
        )
        self.assertEqual(
            metadata.youtube,
            {'record': False, 'playlistID': '', 'includeDate': False},
        )
        self.assertEqual(
            metadata.stats,
            {'bracket': {'enabled': False}, 'racers': {'enabled': False}},
        )
        metadata.youtube = {'playlist': 'abc'}
        metadata.save()

        data = SpeedRunSerializer(self.run).data['zsr']

        self.assertEqual(data['short_name'], 'LoZ')
        self.assertEqual(data['twitch_tags'], ['Speedrun'])
        self.assertEqual(data['youtube'], {'playlist': 'abc'})

    def test_import_is_dry_runnable_and_idempotent(self):
        document = self.document(
            shortname='LoZ',
            coms_layout='two-commentators',
            show_seeding=1,
            twitch_tags='["Speedrun", "Zelda"]',
            youtube='{"playlist": "abc"}',
            custom_channels='',
            racetime='2026-08-15T18:30:00Z',
            round='Grand Final',
            maxRunnerCount='6',
            isTeamMode='true',
            teamCount=3,
            custom_bg_hide_assets=1,
            hint_list='[{"label": "Goal"}]',
            stats='{"racers": {"enabled": true}}',
        )
        with TemporaryDirectory() as directory:
            path = self.write_document(directory, document)
            output = StringIO()
            call_command('import_zsr_legacy', path, dry_run=True, stdout=output)
            self.assertIn('Dry run:', output.getvalue())
            self.assertFalse(ZSRRunMetadata.objects.filter(run=self.run).exists())

            call_command('import_zsr_legacy', path, stdout=output)
            call_command('import_zsr_legacy', path, stdout=output)

        metadata = ZSRRunMetadata.objects.get(run=self.run)
        self.assertEqual(metadata.short_name, 'LoZ')
        self.assertEqual(metadata.commentary_layout, 'two-commentators')
        self.assertTrue(metadata.show_seeding)
        self.assertEqual(metadata.twitch_tags, ['Speedrun', 'Zelda'])
        self.assertEqual(metadata.youtube, {'playlist': 'abc'})
        self.assertEqual(metadata.custom_channels, {})
        self.assertEqual(metadata.round, 'Grand Final')
        self.assertEqual(metadata.max_runner_count, 6)
        self.assertTrue(metadata.team_mode)
        self.assertEqual(metadata.team_count, 3)
        self.assertTrue(metadata.custom_background_hide_assets)
        self.assertEqual(metadata.hint_list, [{'label': 'Goal'}])
        self.assertEqual(metadata.stats, {'racers': {'enabled': True}})
        self.assertEqual(metadata.race_time.isoformat(), '2026-08-15T18:30:00+00:00')
        self.assertEqual(ZSRRunMetadata.objects.count(), 1)
        self.assertIn('1 unchanged', output.getvalue())

    def test_invalid_structured_data_aborts_import(self):
        document = self.document(twitch_tags='not JSON')
        with TemporaryDirectory() as directory:
            path = self.write_document(directory, document)
            with self.assertRaisesMessage(CommandError, 'no changes were made'):
                call_command('import_zsr_legacy', path)

        self.assertFalse(ZSRRunMetadata.objects.filter(run=self.run).exists())
