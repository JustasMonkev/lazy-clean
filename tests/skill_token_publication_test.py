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
        records = {'baseline--help': {'arm': 'baseline', 'status': 'completed', 'usage': {'total': 10}},
                   'recovery--help': {'arm': 'final-recovery', 'status': 'completed', 'usage': {'total': 12}}}
        archive_path = self.publication / 'attempts.tar.gz'
        with tarfile.open(archive_path, 'w:gz', format=tarfile.USTAR_FORMAT) as archive:
            for name, record in records.items():
                data = json.dumps(record).encode()
                entry = tarfile.TarInfo('attempts/' + name + '/record.json')
                entry.size = len(data)
                archive.addfile(entry, io.BytesIO(data))
                original = self.study / 'runs' / name / 'record.json'
                original.parent.mkdir(parents=True)
                original.write_bytes(data)
        (self.publication / 'archives.json').write_text(json.dumps([
            {'file': archive_path.name, 'sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest()}]))
        (self.publication / 'snapshot.json').write_text(json.dumps({'captured': 'fixture', 'statuses': []}))
        row = {'skills': [], 'model': None, 'variant': None,
               'baseline': {'attempts': 0, 'knownUsage': {}}, 'finalRecovery': {'attempts': 0, 'knownUsage': {}}}
        (self.publication / 'final-comparison.json').write_text(json.dumps(
            {'captured': 'fixture', 'perSkill': [row] * 44, 'grouped': [row] * 15}))

    def audit(self, study=None):
        result = subprocess.run([sys.executable, str(self.publication / 'audit.py')],
                                env={**os.environ, 'STUDY_SNAPSHOT_ROOT': str(self.study if study is None else study)},
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.stderr, '')
        return result, json.loads((self.publication / 'archive-audit.json').read_text())

    def test_complete_originals_pass(self):
        result, report = self.audit()
        self.assertEqual(result.returncode, 0)
        self.assertEqual(report['counts']['compared_records'], 2)

    def test_absent_originals_fail(self):
        result, report = self.audit(self.root / 'absent')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(report['counts']['missing_original_records'], 2)
        self.assertEqual(report['counts']['compared_records'], 0)

    def test_one_missing_original_fails(self):
        (self.study / 'runs/baseline--help/record.json').unlink()
        result, report = self.audit()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(report['counts']['missing_original_records'], 1)
        self.assertEqual(report['counts']['compared_records'], 1)

    def test_changed_usage_fails(self):
        original = self.study / 'runs/baseline--help/record.json'
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

    def test_proof_default_and_explicit_paths(self):
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
