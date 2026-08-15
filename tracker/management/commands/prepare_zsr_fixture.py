import json
from pathlib import Path

from django.core.management.base import CommandError

from tracker.commandutil import TrackerCommand


# Permissions removed or renamed between the legacy ZSR fork and the current
# tracker. Fixture relations use Permission natural keys, so they must point at
# permissions which exist in the freshly migrated target database.
PERMISSION_RENAMES = {
    ('view_full_list', 'tracker', 'donation'): (
        'view_donation',
        'tracker',
        'donation',
    ),
}


class Command(TrackerCommand):
    help = 'Rewrite legacy natural permission keys before loading a ZSR fixture.'

    def add_arguments(self, parser):
        parser.add_argument('input', help='path to the fixture produced by dumpdata')
        parser.add_argument('output', help='path for the rewritten fixture')

    def handle(self, *args, **options):
        super().handle(*args, **options)
        input_path = Path(options['input'])
        output_path = Path(options['output'])

        try:
            document = json.loads(input_path.read_text(encoding='utf-8'))
        except OSError as exc:
            raise CommandError(f'Could not read fixture: {exc}') from exc
        except json.JSONDecodeError as exc:
            raise CommandError(f'Fixture is not valid JSON: {exc}') from exc

        if not isinstance(document, list):
            raise CommandError('Fixture root must be a JSON array.')

        replacements = 0
        for record in document:
            if not isinstance(record, dict):
                continue
            model = record.get('model')
            field_name = {
                'auth.user': 'user_permissions',
                'auth.group': 'permissions',
            }.get(model)
            if field_name is None:
                continue
            fields = record.get('fields')
            if not isinstance(fields, dict):
                continue
            permissions = fields.get(field_name)
            if not isinstance(permissions, list):
                continue

            rewritten = []
            for permission in permissions:
                key = tuple(permission) if isinstance(permission, list) else None
                replacement = PERMISSION_RENAMES.get(key)
                if replacement is not None:
                    permission = list(replacement)
                    replacements += 1
                rewritten.append(permission)
            fields[field_name] = rewritten

        try:
            output_path.write_text(
                json.dumps(document, ensure_ascii=False, indent=2) + '\n',
                encoding='utf-8',
            )
        except OSError as exc:
            raise CommandError(f'Could not write fixture: {exc}') from exc

        self.stdout.write(
            f'Wrote {len(document)} object(s) to {output_path}; '
            f'rewrote {replacements} permission reference(s).'
        )
