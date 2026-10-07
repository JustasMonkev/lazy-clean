import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest


PUBLICATION = Path(__file__).resolve().parents[1] / 'benchmarks/results/skill-tokens-20261006'


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.publication = self.root / 'publication'
        self.publication.mkdir()
        self.study = self.root / 'study'
        shutil.copy(PUBLICATION / 'audit.py', self.publication)
        for path in PUBLICATION.glob('grades*.json'):
            shutil.copy(path, self.publication)
        for name in ['snapshot.json', 'final-comparison.json']:
            shutil.copy(PUBLICATION / name, self.publication)
        snapshot = json.loads((self.publication / 'snapshot.json').read_text())
        self.records = {record['id']: record for record in snapshot['statuses']}
        self.write_archives()
        for name, record in self.records.items():
            original = self.study / 'runs' / name / 'record.json'
            original.parent.mkdir(parents=True)
            original.write_text(json.dumps(record))

    def write_archives(self, omitted=None):
        archives = []
        for name in ['inputs', 'attempts', 'cases', 'checks']:
            path = self.publication / (name + '.tar.gz')
            with tarfile.open(path, 'w:gz', format=tarfile.USTAR_FORMAT) as archive:
                if name == 'attempts':
                    for record_id, record in self.records.items():
                        if record_id == omitted:
                            continue
                        data = json.dumps(record).encode()
                        entry = tarfile.TarInfo('attempts/' + record_id + '/record.json')
                        entry.size = len(data)
                        archive.addfile(entry, io.BytesIO(data))
            archives.append({'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
        (self.publication / 'archives.json').write_text(json.dumps(archives))

    def audit(self, study=None):
        result = subprocess.run([sys.executable, str(self.publication / 'audit.py')],
                                env={**os.environ, 'STUDY_SNAPSHOT_ROOT': str(self.study if study is None else study)},
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.stderr, '')
        return result, json.loads((self.publication / 'archive-audit.json').read_text())

    def test_complete_originals_pass(self):
        result, report = self.audit()
        self.assertEqual(result.returncode, 0)
        self.assertEqual(report['counts']['compared_records'], len(self.records))

    def test_absent_originals_fail(self):
        result, report = self.audit(self.root / 'absent')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(report['counts']['missing_original_records'], len(self.records))
        self.assertEqual(report['counts']['compared_records'], 0)

    def test_one_missing_original_fails(self):
        (self.study / 'runs' / next(iter(self.records)) / 'record.json').unlink()
        result, report = self.audit()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(report['counts']['missing_original_records'], 1)
        self.assertEqual(report['counts']['compared_records'], len(self.records) - 1)

    def test_changed_usage_fails(self):
        original = self.study / 'runs' / next(iter(self.records)) / 'record.json'
        record = json.loads(original.read_text())
        record['usage']['total'] = 0
        original.write_text(json.dumps(record))
        result, report = self.audit()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(report['counts']['record_metric_mismatches'], 1)

    def test_missing_archive_fails(self):
        (self.publication / 'attempts.tar.gz').unlink()
        result, report = self.audit()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(report['counts']['missing_archives'], 1)

    def test_omitted_published_record_fails(self):
        self.write_archives(omitted=next(iter(self.records)))
        result, report = self.audit()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(report['counts']['missing_published_records'], 1)

    def test_empty_archive_inventory_fails(self):
        (self.publication / 'archives.json').write_text('[]')
        result, report = self.audit()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(report['counts']['missing_archive_inventory'], 4)
        self.assertEqual(report['counts']['missing_published_records'], len(self.records))

    def test_corrupt_derived_comparison_fields_fail(self):
        path = self.publication / 'final-comparison.json'
        original = json.loads(path.read_text())
        mutations = [('quality count', lambda row: row['baseline'].__setitem__('qualityPass', 999)),
                     ('completeness', lambda row: row.__setitem__('allExpectedMeasured', False)),
                     ('nonboolean flag', lambda row: row.__setitem__('allExpectedMeasured', 1)),
                     ('reduction', lambda row: row.__setitem__('fullRowTotalReduction', 999)),
                     ('pair count', lambda row: row['conditionalMatchedQualityPass'].__setitem__('pairCount', 999)),
                     ('pair reduction', lambda row: row['conditionalMatchedQualityPass'].__setitem__('reduction', 999))]
        for name, mutate in mutations:
            with self.subTest(name=name):
                comparison = json.loads(json.dumps(original))
                mutate(comparison['perSkill'][0])
                path.write_text(json.dumps(comparison))
                result, report = self.audit()
                self.assertEqual(result.returncode, 1)
                self.assertGreater(report['counts']['comparison_discrepancies'], 0)

    def test_cross_platform_private_paths_fail(self):
        record = self.records[next(iter(self.records))]
        for path in ['/home/alice/private.txt', '/Users/bob smith/private.txt', 'd:\\users\\carol jane\\private.txt', str(self.study / 'private.txt')]:
            with self.subTest(path=path):
                record['privatePath'] = path
                self.write_archives()
                result, report = self.audit()
                self.assertEqual(result.returncode, 1)
                self.assertGreater(report['counts']['private_account_paths'] + report['counts']['original_study_paths'], 0)

    def test_redacted_paths_and_prose_pass(self):
        self.records[next(iter(self.records))]['note'] = 'No Git/home state; /home/REDACTED/file "C:\\Users\\REDACTED\\file"'
        self.write_archives()
        result, report = self.audit()
        self.assertEqual(result.returncode, 0)
        self.assertEqual(report['counts']['private_account_paths'], 0)

    def test_snapshot_record_corruption_fails(self):
        path = self.publication / 'snapshot.json'
        snapshot = json.loads(path.read_text())
        snapshot['statuses'][0]['elapsedMs'] = -1
        path.write_text(json.dumps(snapshot))
        result, report = self.audit()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(report['counts']['snapshot_record_mismatches'], 1)

    def test_proof_default_and_explicit_paths(self):
        node_major = int(subprocess.check_output(['node', '-p', 'process.versions.node.split(".")[0]'], text=True, timeout=5))
        if node_major < 26:
            self.skipTest('Study proof explicitly requires Node >=26; project support remains Node >=18.')
        shutil.copytree(PUBLICATION / 'grading', self.publication / 'grading')
        source = self.publication / 'inputs/source/packages/isomorphic/stringUtils.ts'
        source.parent.mkdir(parents=True)
        control = (PUBLICATION / 'grading/known-good-heldout.ts').read_text()
        original = control.replace("url.slice(0, 5).toLowerCase() !== 'data:'", "!url.startsWith('data:')")
        self.assertNotEqual(original, control)
        source.write_text(original)
        for arguments in [[], [str(source)]]:
            with self.subTest(arguments=arguments):
                result = subprocess.run(['node', str(self.publication / 'grading/proof.mjs'), *arguments],
                                        capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode, 0, result.stderr)
                proof = json.loads(result.stdout)
                self.assertEqual([case['exitCode'] for case in proof], [1, 1, 0, 0, 2])
        result = subprocess.run(['node', str(self.publication / 'grading/proof.mjs'), str(self.root / 'missing.ts')],
                                capture_output=True, text=True, timeout=30)
        self.assertNotEqual(result.returncode, 0)

    def test_final_check_matches_capture(self):
        shipped = json.loads((PUBLICATION / 'final-shipped-checks.json').read_text())['publishedArchiveAudit']
        audit = json.loads((PUBLICATION / 'archive-audit.json').read_text())
        self.assertEqual(shipped['archiveMembers'], audit['counts']['members'])
        self.assertEqual(shipped['comparedOriginalRecords'], audit['counts']['compared_records'])
        self.assertEqual(shipped['captured'], audit['captured'])


if __name__ == '__main__':
    unittest.main()
