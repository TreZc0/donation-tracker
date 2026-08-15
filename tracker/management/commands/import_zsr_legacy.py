import json
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.management.base import CommandError
from django.db import transaction

from tracker.commandutil import TrackerCommand
from tracker.models import SpeedRun, ZSRRunMetadata
from tracker.zsr_legacy import (
    EXPORT_FORMAT,
    EXPORT_VERSION,
    normalize_legacy_metadata,
)


class Command(TrackerCommand):
    help = 'Validate and import an export produced by export_zsr_legacy.'

    def add_arguments(self, parser):
        parser.add_argument('input', help='path to a legacy ZSR JSON export')
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='validate and report changes, then roll the transaction back',
        )

    def _load_document(self, path):
        try:
            document = json.loads(Path(path).read_text(encoding='utf-8'))
        except OSError as exc:
            raise CommandError(f'Could not read import: {exc}') from exc
        except json.JSONDecodeError as exc:
            raise CommandError(f'Import is not valid JSON: {exc}') from exc

        if not isinstance(document, dict):
            raise CommandError('Import root must be a JSON object.')
        if document.get('format') != EXPORT_FORMAT:
            raise CommandError('Import has an unknown format identifier.')
        if document.get('version') != EXPORT_VERSION:
            raise CommandError(
                f'Unsupported import version {document.get("version")!r}; '
                f'expected {EXPORT_VERSION}.'
            )
        if not isinstance(document.get('runs'), list):
            raise CommandError('Import must contain a runs array.')
        return document

    @staticmethod
    def _identity_matches(run, record):
        event = record.get('event') or {}
        identity = record.get('identity') or {}
        return (
            run.event.short == event.get('short')
            and run.name == identity.get('name')
            and run.category == identity.get('category')
        )

    def _find_run(self, record):
        try:
            legacy_run_id = int(record['legacy_run_id'])
            event = record['event']
            identity = record['identity']
            event_short = event['short']
            name = identity['name']
            category = identity['category']
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(
                'record has incomplete or invalid identity fields'
            ) from exc

        by_pk = (
            SpeedRun.objects.select_related('event').filter(pk=legacy_run_id).first()
        )
        if by_pk is not None and self._identity_matches(by_pk, record):
            return by_pk

        matches = SpeedRun.objects.select_related('event').filter(
            event__short=event_short,
            name=name,
            category=category,
        )
        if matches.count() != 1:
            pk_detail = 'mismatched' if by_pk is not None else 'missing'
            raise ValueError(
                f'legacy run {legacy_run_id} is {pk_detail} by primary key and '
                f'identity matched {matches.count()} modern runs'
            )
        return matches.get()

    def handle(self, *args, **options):
        super().handle(*args, **options)
        document = self._load_document(options['input'])
        planned = []
        errors = []
        target_ids = set()

        for index, record in enumerate(document['runs'], start=1):
            try:
                if not isinstance(record, dict):
                    raise ValueError('record must be a JSON object')
                run = self._find_run(record)
                if run.pk in target_ids:
                    raise ValueError(
                        f'more than one record targets modern run {run.pk}'
                    )
                target_ids.add(run.pk)
                metadata_values = normalize_legacy_metadata(record.get('metadata', {}))
                metadata = ZSRRunMetadata.objects.filter(run=run).first()
                existing_values = None
                if metadata is None:
                    metadata = ZSRRunMetadata(run=run)
                    state = 'created'
                else:
                    existing_values = {
                        field: getattr(metadata, field) for field in metadata_values
                    }
                    state = 'unchanged'
                for field, value in metadata_values.items():
                    setattr(metadata, field, value)
                metadata.full_clean()
                metadata_values = {
                    field: getattr(metadata, field) for field in metadata_values
                }
                if existing_values is not None and existing_values != metadata_values:
                    state = 'updated'
                planned.append((run, metadata_values, state))
            except (ValidationError, ValueError, TypeError) as exc:
                errors.append(f'run record {index}: {exc}')

        if errors:
            details = '\n'.join(f'  - {error}' for error in errors)
            raise CommandError(
                f'Import validation failed; no changes were made:\n{details}'
            )

        counts = {'created': 0, 'updated': 0, 'unchanged': 0}
        with transaction.atomic():
            for run, metadata_values, state in planned:
                metadata, _ = ZSRRunMetadata.objects.get_or_create(run=run)
                changed_fields = []
                for field, value in metadata_values.items():
                    if getattr(metadata, field) != value:
                        setattr(metadata, field, value)
                        changed_fields.append(field)
                if changed_fields:
                    metadata.full_clean()
                    metadata.save(update_fields=changed_fields)
                counts[state] += 1
            if options['dry_run']:
                transaction.set_rollback(True)

        prefix = 'Dry run: ' if options['dry_run'] else ''
        self.stdout.write(
            f'{prefix}{len(planned)} run(s) validated; '
            f'{counts["created"]} created, {counts["updated"]} updated, '
            f'{counts["unchanged"]} unchanged.'
        )
