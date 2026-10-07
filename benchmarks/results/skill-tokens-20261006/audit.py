import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tarfile

def main():
    publication = Path(__file__).resolve().parent
    study = Path(os.environ.get('STUDY_SNAPSHOT_ROOT', publication.parent))
    counts = dict(members=0, private_account_paths=0, original_study_paths=0, git_entries=0,
                  credential_shapes=0, record_metric_mismatches=0, compared_records=0,
                  archive_hash_mismatches=0, binary_files=0, private_owner_headers=0, unexpected_pax_headers=0,
                  missing_archives=0, missing_original_records=0)
    for archive in json.loads((publication / 'archives.json').read_text()):
        archive_path = publication / archive['file']
        if not archive_path.is_file():
            counts['missing_archives'] += 1
            continue
        counts['archive_hash_mismatches'] += hashlib.sha256(archive_path.read_bytes()).hexdigest() != archive['sha256']
        with tarfile.open(archive_path) as entries:
            for entry in entries:
                counts['members'] += 1
                counts['private_owner_headers'] += entry.uid != 0 or entry.gid != 0 or entry.uname != '' or entry.gname != ''
                counts['unexpected_pax_headers'] += bool(entry.pax_headers)
                counts['git_entries'] += '.git' in PurePosixPath(entry.name).parts
                if not entry.isfile():
                    continue
                data = entries.extractfile(entry).read()
                try:
                    text = data.decode()
                except UnicodeDecodeError:
                    counts['binary_files'] += 1
                    continue
                counts['private_account_paths'] += len(re.findall(r'/Users/(?!REDACTED(?:/|\b))[^/\s"\x27`]+', text))
                counts['original_study_paths'] += text.count('/private/tmp/lazy-token-study-20261006')
                counts['credential_shapes'] += len(re.findall(r'\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|(?:AKIA|ASIA)[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,})\b', text))
                if entry.name.startswith('attempts/') and entry.name.endswith('/record.json') and not entry.name.startswith('attempts/preflight/'):
                    original_path = study / 'runs' / entry.name.split('/')[1] / 'record.json'
                    if original_path.exists():
                        published = json.loads(text)
                        original = json.loads(original_path.read_text())
                        fields = ['usage', 'status', 'terminal', 'code', 'signal', 'timeout', 'elapsedMs', 'arm', 'model', 'skill', 'variant', 'repetition']
                        counts['compared_records'] += 1
                        counts['record_metric_mismatches'] += any(published.get(key) != original.get(key) for key in fields)
                    else:
                        counts['missing_original_records'] += 1
    snapshot = json.loads((publication / 'snapshot.json').read_text())
    comparison = json.loads((publication / 'final-comparison.json').read_text())
    comparison_checks = {'all44Rows': len(comparison['perSkill']) == 44, 'all15Groups': len(comparison['grouped']) == 15,
                         'allKnownSumsIndependentMatch': True, 'matchingCapture': comparison['captured'] == snapshot['captured']}
    for row in comparison['perSkill'] + comparison['grouped']:
        for arm, label in [('baseline', 'baseline'), ('final-recovery', 'finalRecovery')]:
            selected = [record for record in snapshot['statuses'] if record['arm'] == arm and record['skill'] in row['skills']
                        and (row['model'] is None or record['model'] == row['model'])
                        and (row['variant'] is None or record['variant'] == row['variant'])]
            comparison_checks['allKnownSumsIndependentMatch'] &= row[label]['attempts'] == len(selected)
            for field, metric in row[label]['knownUsage'].items():
                values = [record['usage'][field] for record in selected if record['usage'] is not None
                          and isinstance(record['usage'].get(field), (int, float))]
                comparison_checks['allKnownSumsIndependentMatch'] &= metric['records'] == len(values) and metric['sum'] == (sum(values) if values else None)
    (publication / 'comparison-audit.json').write_text(json.dumps({'captured': snapshot['captured'], 'checks': comparison_checks,
        'allPassed': all(comparison_checks.values()), 'scope': 'All per-entrypoint/group field sums independently recomputed from captured status rows'}, indent=2) + '\n')
    counts['comparison_discrepancies'] = sum(not value for value in comparison_checks.values())
    report = {'captured': json.loads((publication / 'snapshot.json').read_text())['captured'], 'counts': counts,
              'scope': 'Every listed archive and original terminal record is required; missing evidence fails the audit. Pattern audit is not proof of absence of all possible secrets.'}
    (publication / 'archive-audit.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(counts))
    raise SystemExit(int(any(value for key, value in counts.items() if key not in ['members', 'compared_records'])))


if __name__ == '__main__':
    main()
