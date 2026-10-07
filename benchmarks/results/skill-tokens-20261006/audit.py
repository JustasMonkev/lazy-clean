import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import tarfile

SKILLS = ['layz-test', 'lazy', 'lazy-audit', 'lazy-clean', 'lazy-debt', 'lazy-gain',
          'lazy-help', 'lazy-review', 'lazy-verify', 'slop-check', 'test-quality-review']
USAGE_FIELDS = ['input', 'cachedInput', 'uncachedInput', 'output', 'total']


def numeric(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def same_fields(actual, expected):
    if isinstance(expected, dict):
        return isinstance(actual, dict) and actual.keys() == expected.keys() and all(same_fields(actual[key], value) for key, value in expected.items())
    if isinstance(expected, list):
        return isinstance(actual, list) and len(actual) == len(expected) and all(same_fields(a, b) for a, b in zip(actual, expected))
    if isinstance(expected, bool) or expected is None:
        return actual is expected
    return not isinstance(actual, bool) and actual == expected


def summarize(records, grades, arm, skills, model, variant):
    selected = [record for record in records if record['arm'] == arm and record['skill'] in skills
                and (model is None or record['model'] == model) and (variant is None or record['variant'] == variant)]
    expected = len(skills) * 3 * (2 if model is None else 1) * (2 if variant is None else 1)
    valid = [record for record in selected if record['status'] == 'completed' and record['usage'] is not None
             and all(numeric(record['usage'].get(field)) for field in USAGE_FIELDS)]
    known = {}
    for field in USAGE_FIELDS:
        values = [record['usage'][field] for record in selected if record['usage'] is not None and numeric(record['usage'].get(field))]
        known[field] = {'records': len(values), 'sum': sum(values) if values else None}
    passed = sum(grades.get(record['id'], {}).get('pass') is True for record in selected)
    failed = sum(grades.get(record['id'], {}).get('pass') is False for record in selected)
    completed = sum(record['status'] == 'completed' for record in selected)
    return {'expected': expected, 'attempts': len(selected), 'absentOrNotYetTerminal': max(0, expected - len(selected)),
            'completions': completed, 'executionFailures': len(selected) - completed,
            'missingUsage': sum(record['usage'] is None for record in selected), 'qualityPass': passed, 'qualityFail': failed,
            'ungraded': len(selected) - passed - failed, 'knownUsage': known,
            'allExpectedMeasured': len(valid) == expected and len(selected) == expected,
            'allExpectedQualityPass': passed == expected and len(selected) == expected}


def comparison_row(records, grades, skills, model, variant, group):
    baseline = summarize(records, grades, 'baseline', skills, model, variant)
    recovery = summarize(records, grades, 'final-recovery', skills, model, variant)
    measured = baseline['allExpectedMeasured'] and recovery['allExpectedMeasured']
    matching = {}
    for record in records:
        if (record['arm'] in ['baseline', 'final-recovery'] and record['skill'] in skills
                and (model is None or record['model'] == model) and (variant is None or record['variant'] == variant)
                and record['status'] == 'completed' and record['usage'] is not None
                and grades.get(record['id'], {}).get('pass') is True):
            key = (record['skill'], record['model'], record['variant'], record['repetition'])
            matching.setdefault(key, {})[record['arm']] = record['usage']['total']
    pairs = [pair for pair in matching.values() if len(pair) == 2]
    before = sum(pair['baseline'] for pair in pairs)
    after = sum(pair['final-recovery'] for pair in pairs)
    total = baseline['knownUsage']['total']['sum']
    return {'group': group, 'skills': skills, 'model': model, 'reasoning': 'medium', 'variant': variant,
            'baseline': baseline, 'finalRecovery': recovery, 'allExpectedMeasured': measured,
            'fullRowTotalReduction': 1 - recovery['knownUsage']['total']['sum'] / total if measured and total > 0 else None,
            'efficiencyQualified': measured and baseline['allExpectedQualityPass'] and recovery['allExpectedQualityPass'],
            'conditionalMatchedQualityPass': {'label': 'Conditional on both attempts passing; not a full-suite efficiency qualification',
                                             'pairCount': len(pairs), 'baselineTotal': before if pairs else None,
                                             'comparatorTotal': after if pairs else None,
                                             'reduction': 1 - after / before if pairs and before > 0 else None}}


def audit_comparison(publication, snapshot, comparison):
    grades = {}
    for path in sorted(publication.glob('grades*.json')):
        if re.fullmatch(r'grades(?:-[\w-]+)?\.json', path.name) and 'before-root-scan-amendment' not in path.name:
            grades.update(json.loads(path.read_text()))
    records = snapshot['statuses']
    changed = ['lazy-help', 'lazy-debt', 'slop-check']
    groups = [('all-entrypoints', SKILLS), ('changed-three-entrypoints', changed),
              ('unchanged-eight-entrypoints', [skill for skill in SKILLS if skill not in changed])]
    per_skill, grouped = [], []
    for model in ['gpt-6.1-sol', 'gpt-6-luna']:
        for variant in ['train', 'heldout']:
            per_skill.extend(comparison_row(records, grades, [skill], model, variant, 'single-entrypoint') for skill in SKILLS)
            grouped.extend(comparison_row(records, grades, skills, model, variant, group) for group, skills in groups)
    grouped.extend(comparison_row(records, grades, skills, None, None, group) for group, skills in groups)
    final = [record for record in records if record['arm'] == 'final']
    infrastructure = None
    if final:
        infrastructure = {'terminal': len(final), 'completed': sum(record['status'] == 'completed' for record in final),
                          'failed': sum(record['status'] != 'completed' for record in final),
                          'unknownUsage': sum(record['usage'] is None for record in final), 'qualityPass': 0, 'qualityFail': 0,
                          'ungraded': 0, 'modelQualityNotApplicable': 0}
        for record in final:
            if record['status'] != 'completed' and record['usage'] is None:
                infrastructure['modelQualityNotApplicable'] += 1
            else:
                verdict = grades.get(record['id'], {}).get('pass')
                infrastructure['qualityPass' if verdict is True else 'qualityFail' if verdict is False else 'ungraded'] += 1
    return {'all44Rows': len(comparison['perSkill']) == 44, 'all15Groups': len(comparison['grouped']) == 15,
            'allDerivedFieldsMatch': same_fields(comparison['perSkill'], per_skill) and same_fields(comparison['grouped'], grouped),
            'matchingCapture': comparison['captured'] == snapshot['captured'],
            'gridFlagsMatch': comparison['completeMeasuredGrid'] is all(row['allExpectedMeasured'] for row in per_skill)
            and comparison['completelyGradedGrid'] is all(row['baseline']['ungraded'] == 0 and row['finalRecovery']['ungraded'] == 0
                and row['baseline']['attempts'] == 3 and row['finalRecovery']['attempts'] == 3 for row in per_skill),
            'armsMatch': comparison['baselineArm'] == 'baseline' and comparison['comparatorArm'] == 'final-recovery'
            and comparison['finalInfrastructureArm'] == infrastructure}


def main():
    publication = Path(__file__).resolve().parent
    study = Path(os.environ.get('STUDY_SNAPSHOT_ROOT', publication.parent))
    counts = dict(members=0, private_account_paths=0, original_study_paths=0, git_entries=0,
                  credential_shapes=0, record_metric_mismatches=0, compared_records=0,
                  archive_hash_mismatches=0, binary_files=0, private_owner_headers=0, unexpected_pax_headers=0,
                  missing_archives=0, missing_original_records=0, missing_archive_inventory=0, unexpected_archives=0,
                  duplicate_archives=0, duplicate_records=0, missing_published_records=0, unexpected_published_records=0,
                  duplicate_snapshot_records=0, snapshot_record_mismatches=0)
    snapshot = json.loads((publication / 'snapshot.json').read_text())
    snapshot_records = {record['id']: record for record in snapshot['statuses']}
    counts['duplicate_snapshot_records'] = len(snapshot['statuses']) - len(snapshot_records)
    archives = json.loads((publication / 'archives.json').read_text())
    expected_archives = {'inputs.tar.gz', 'attempts.tar.gz', 'cases.tar.gz', 'checks.tar.gz'}
    archive_names = [archive['file'] for archive in archives]
    counts['missing_archive_inventory'] = len(expected_archives - set(archive_names))
    counts['unexpected_archives'] = len(set(archive_names) - expected_archives)
    counts['duplicate_archives'] = len(archive_names) - len(set(archive_names))
    published_ids = set()
    for archive in archives:
        if archive['file'] not in expected_archives:
            continue
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
                counts['private_account_paths'] += len(re.findall(r'(?<![\w.-])/(?:Users|home)/(?!REDACTED(?:[\\/]|$|["\x27\r\n`]))[^/\\\r\n"\x27`]+|(?i:[A-Za-z]:[\\/]+Users[\\/]+(?!REDACTED(?:[\\/]|$|["\x27\r\n`]))[^/\\\r\n"\x27`]+)', text))
                roots = {str(study), str(study).replace('\\', '/'), str(study).replace('\\', '\\\\'), '/private/tmp/lazy-token-study-20261006'}
                counts['original_study_paths'] += sum(text.count(root) for root in roots)
                counts['credential_shapes'] += len(re.findall(r'\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|(?:AKIA|ASIA)[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,})\b', text))
                if entry.name.startswith('attempts/') and entry.name.endswith('/record.json') and not entry.name.startswith('attempts/preflight/'):
                    record_id = entry.name.split('/')[1]
                    counts['duplicate_records'] += record_id in published_ids
                    published_ids.add(record_id)
                    published = json.loads(text)
                    if record_id in snapshot_records:
                        fields = ['usage', 'status', 'code', 'signal', 'timeout', 'elapsedMs', 'arm', 'model', 'skill', 'variant', 'repetition']
                        counts['snapshot_record_mismatches'] += any(published.get(key) != snapshot_records[record_id].get(key) for key in fields)
                    original_path = study / 'runs' / record_id / 'record.json'
                    if original_path.exists():
                        original = json.loads(original_path.read_text())
                        fields = ['usage', 'status', 'terminal', 'code', 'signal', 'timeout', 'elapsedMs', 'arm', 'model', 'skill', 'variant', 'repetition']
                        counts['compared_records'] += 1
                        counts['record_metric_mismatches'] += any(published.get(key) != original.get(key) for key in fields)
                    else:
                        counts['missing_original_records'] += 1
    snapshot_ids = set(snapshot_records)
    counts['missing_published_records'] = len(snapshot_ids - published_ids)
    counts['unexpected_published_records'] = len(published_ids - snapshot_ids)
    comparison = json.loads((publication / 'final-comparison.json').read_text())
    comparison_checks = audit_comparison(publication, snapshot, comparison)
    (publication / 'comparison-audit.json').write_text(json.dumps({'captured': snapshot['captured'], 'checks': comparison_checks,
        'allPassed': all(comparison_checks.values()), 'scope': 'Every comparison row and derived count, sum, completeness flag, reduction and matched passing pair independently recomputed from snapshot statuses and canonical grades'}, indent=2) + '\n')
    counts['comparison_discrepancies'] = sum(not value for value in comparison_checks.values())
    report = {'captured': json.loads((publication / 'snapshot.json').read_text())['captured'], 'counts': counts,
              'scope': 'Every listed archive and original terminal record is required; missing evidence fails the audit. Pattern audit is not proof of absence of all possible secrets.'}
    (publication / 'archive-audit.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(counts))
    raise SystemExit(int(any(value for key, value in counts.items() if key not in ['members', 'compared_records'])))


if __name__ == '__main__':
    main()
