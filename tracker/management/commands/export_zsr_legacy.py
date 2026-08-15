import json
from pathlib import Path

from django.core.management.base import CommandError
from django.db import connection

from tracker.commandutil import TrackerCommand
from tracker.models import Event, SpeedRun
from tracker.zsr_legacy import EXPORT_FORMAT, EXPORT_VERSION, LEGACY_FIELD_MAP


class Command(TrackerCommand):
    help = (
        'Export ZSR run metadata directly from legacy SpeedRun columns. '
        'Run this before applying modern tracker migrations.'
    )

    def add_arguments(self, parser):
        parser.add_argument('output', help='JSON output path, or - for stdout')
        parser.add_argument(
            '--event-id',
            type=int,
            help='only export runs belonging to this legacy event ID',
        )

    def handle(self, *args, **options):
        super().handle(*args, **options)
        quote = connection.ops.quote_name
        run_table = SpeedRun._meta.db_table
        event_table = Event._meta.db_table

        with connection.cursor() as cursor:
            tables = set(connection.introspection.table_names(cursor))
            if run_table not in tables or event_table not in tables:
                raise CommandError('The tracker run/event tables do not exist.')

            description = connection.introspection.get_table_description(
                cursor, run_table
            )
            run_columns = {column.name for column in description}
            legacy_columns = [
                column for column in LEGACY_FIELD_MAP if column in run_columns
            ]
            if not legacy_columns:
                raise CommandError(
                    'No legacy ZSR columns were found on the SpeedRun table. '
                    'This command must run against the legacy schema.'
                )

            selected = [
                ('legacy_run_id', 's', 'id'),
                ('legacy_event_id', 's', 'event_id'),
                ('name', 's', 'name'),
                ('category', 's', 'category'),
                ('event_short', 'e', 'short'),
            ] + [(column, 's', column) for column in legacy_columns]
            select_sql = ', '.join(
                f'{alias}.{quote(column)}' for _, alias, column in selected
            )
            sql = (
                f'SELECT {select_sql} FROM {quote(run_table)} s '
                f'LEFT JOIN {quote(event_table)} e '
                f'ON s.{quote("event_id")} = e.{quote("id")}'
            )
            params = []
            if options['event_id'] is not None:
                sql += f' WHERE s.{quote("event_id")} = %s'
                params.append(options['event_id'])
            sql += f' ORDER BY s.{quote("id")}'
            cursor.execute(sql, params)
            rows = cursor.fetchall()

        records = []
        keys = [key for key, _, _ in selected]
        for values in rows:
            row = dict(zip(keys, values))
            records.append(
                {
                    'legacy_run_id': row['legacy_run_id'],
                    'event': {
                        'legacy_id': row['legacy_event_id'],
                        'short': row['event_short'],
                    },
                    'identity': {
                        'name': row['name'],
                        'category': row['category'],
                    },
                    'metadata': {column: row[column] for column in legacy_columns},
                }
            )

        document = {
            'format': EXPORT_FORMAT,
            'version': EXPORT_VERSION,
            'source_columns': legacy_columns,
            'runs': records,
        }
        rendered = json.dumps(document, indent=2, ensure_ascii=False) + '\n'
        if options['output'] == '-':
            self.stdout.write(rendered, ending='')
        else:
            try:
                Path(options['output']).write_text(rendered, encoding='utf-8')
            except OSError as exc:
                raise CommandError(f'Could not write export: {exc}') from exc
            self.stdout.write(
                f'Exported {len(records)} run(s) with {len(legacy_columns)} '
                f'legacy ZSR column(s) to {options["output"]}.'
            )
