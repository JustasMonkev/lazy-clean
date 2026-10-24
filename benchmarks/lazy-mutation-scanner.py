import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import tempfile
import time

CASES = [
    {
        "id": "selector-mapping",
        "contract": "The public scan tool forwards includeSelectors to Axe.",
        "file": "src/tools/axe.ts",
        "before": "include: params.includeSelectors,",
        "after": "include: undefined,",
        "testFile": "tests/tools-scanPageMatrix.test.ts",
        "test": "passes tags, rule filters and scope selectors through to the axe scan",
        "assertion": "forwarded include equals ['#checkout']",
    },
    {
        "id": "incomplete-filter",
        "contract": "includeIncomplete=false excludes incomplete findings from the report.",
        "file": "src/tools/scanPageMatrix.ts",
        "before": "incomplete: params.includeIncomplete\n",
        "after": "incomplete: true\n",
        "testFile": "tests/tools-scanPageMatrix.test.ts",
        "test": "records incomplete results per variant only when enabled",
        "assertion": "disabled variant incomplete list equals []",
    },
    {
        "id": "viewport-restoration",
        "contract": "The matrix tool restores the caller's original viewport.",
        "file": "src/tools/scanPageMatrix.ts",
        "before": "      await tab.page.setViewportSize(originalViewport);\n",
        "after": "",
        "testFile": "tests/tools-scanPageMatrix.test.ts",
        "test": "restores viewport, media emulation, and zoom in finally",
        "assertion": "last viewport equals 1280x720, not the mobile variant",
    },
    {
        "id": "serialized-error",
        "contract": "Serialized MCP responses preserve the error flag.",
        "file": "src/response.ts",
        "before": "isError: this._isError,",
        "after": "isError: undefined,",
        "testFile": "tests/response.test.ts",
        "test": "should include error flag when error occurred",
        "assertion": "serialized.isError is true",
    },
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def identity(path):
    return {"sha256": digest(path), "mode": stat.S_IMODE(path.stat().st_mode)}


def git(source, *args):
    return subprocess.check_output(["git", *args], cwd=source).decode().strip()


def run_test(probe, output, label, test_file, pattern):
    report_path = output / (label + ".report.json")
    command = ["node", "node_modules/vitest/vitest.mjs", "run", test_file,
               "-t", pattern, "--reporter=json", "--outputFile=" + str(report_path), "--no-file-parallelism",
               "--maxWorkers=1"]
    environment = {"PATH": os.environ["PATH"], "HOME": str(probe / "home"),
                   "TMPDIR": str(probe / "tmp"), "CI": "1", "NO_COLOR": "1"}
    started = time.monotonic()
    process = subprocess.Popen(command, cwd=probe, env=environment,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, start_new_session=True)
    try:
        stdout, stderr = process.communicate(timeout=90)
    finally:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()
    elapsed = round(time.monotonic() - started, 3)
    stdout = stdout.replace(str(probe), "<probe>").replace(str(output), "<evidence>")
    stderr = stderr.replace(str(probe), "<probe>").replace(str(output), "<evidence>")
    (output / (label + ".stdout.txt")).write_text(stdout)
    (output / (label + ".stderr.txt")).write_text(stderr)
    if not report_path.exists():
        raise RuntimeError("No Vitest report; inspect " + label + ".stderr.txt")
    report_text = report_path.read_text().replace(str(probe), "<probe>")
    report_path.write_text(report_text)
    report = json.loads(report_text)
    assertions = [item for suite in report["testResults"]
                  for item in suite["assertionResults"]
                  if item["status"] in ("passed", "failed")]
    return {"command": [arg.replace(str(output), "<evidence>") for arg in command], "exitCode": process.returncode,
            "seconds": elapsed, "assertions": assertions,
            "passed": sum(item["status"] == "passed" for item in assertions),
            "failed": sum(item["status"] == "failed" for item in assertions),
            "success": report["success"],
            "runtimeErrors": report.get("numRuntimeErrorTestSuites", 0)}


def require_green(result):
    if not (result["exitCode"] == 0 and result["success"]
            and result["passed"] > 0 and result["failed"] == 0):
        raise RuntimeError("Baseline/restoration did not execute passing assertions")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("scanner", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = args.scanner.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=source).decode().split("\0")
    files = [name for name in tracked if name]
    snapshot = {name: identity(source / name) for name in files
                if not (source / name).is_symlink() and (source / name).is_file()}
    if len(snapshot) != len(files):
        raise RuntimeError("Tracked source contains unsupported non-regular inputs")
    summary = {
        "sourceRepository": "JustasMonkev/mcp-accessibility-scanner",
        "sourceCommit": git(source, "rev-parse", "HEAD"),
        "sourceStatusBefore": git(source, "status", "--short"),
        "node": subprocess.check_output(["node", "--version"]).decode().strip(),
        "python": subprocess.check_output(["python3", "--version"]).decode().strip(),
        "vitest": json.loads((source / "node_modules/vitest/package.json").read_text())["version"],
        "lockSha256": digest(source / "package-lock.json"),
        "skillSha256": digest(Path(__file__).resolve().parents[1] / "skills/lazy-mutation/SKILL.md"),
        "runnerSha256": digest(Path(__file__)),
        "scope": "Four deliberately selected faults; existing tests unchanged; mocked browser/dependency boundaries; no skill-off comparison.",
        "cases": [],
    }
    (output / "source-manifest.json").write_text(json.dumps(snapshot, indent=2) + "\n")
    (output / "mutations.json").write_text(json.dumps(CASES, indent=2) + "\n")
    with tempfile.TemporaryDirectory(prefix="lazy-mutation-scanner-") as temporary:
        probe = Path(temporary)
        for name in files:
            target = probe / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source / name, target)
            if identity(target) != snapshot[name]:
                raise RuntimeError("Source snapshot mismatch: " + name)
        skipped_links = []
        dependency_hasher = hashlib.sha256()
        for directory, dirs, names in os.walk(source / "node_modules", followlinks=False):
            for name in dirs[:]:
                path = Path(directory) / name
                if path.is_symlink():
                    skipped_links.append(str(path.relative_to(source)))
                    dirs.remove(name)
                elif name in (".cache", ".vite", ".vite-temp"):
                    dirs.remove(name)
            for name in names:
                path = Path(directory) / name
                relative = path.relative_to(source)
                if path.is_symlink():
                    skipped_links.append(str(relative))
                    continue
                target = probe / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, target)
                original = identity(path)
                if identity(target) != original:
                    raise RuntimeError("Dependency copy mismatch: " + str(relative))
                dependency_hasher.update((str(relative) + json.dumps(original, sort_keys=True)).encode())
        summary["copiedDependencyFingerprint"] = dependency_hasher.hexdigest()
        summary["omittedDependencyLinks"] = sorted(skipped_links)
        (probe / "home").mkdir()
        (probe / "tmp").mkdir()
        print("Snapshot and independent dependency copy verified", flush=True)
        for case in CASES:
            path = probe / case["file"]
            original = path.read_text()
            if original.count(case["before"]) != 1:
                raise RuntimeError("Mutation anchor not unique: " + case["id"])
            pattern = re.escape(case["test"]) + "$"
            baseline = run_test(probe, output, case["id"] + "-baseline", case["testFile"], pattern)
            require_green(baseline)
            comparison = {}
            if case["id"] == "selector-mapping":
                comparison["baseline"] = run_test(probe, output, "component-baseline",
                                                  "tests/tools-axe.test.ts", "^axe helpers ")
                require_green(comparison["baseline"])
            try:
                path.write_text(original.replace(case["before"], case["after"]))
                mutant = run_test(probe, output, case["id"] + "-mutant", case["testFile"], pattern)
                if comparison:
                    comparison["mutant"] = run_test(probe, output, "component-mutant",
                                                    "tests/tools-axe.test.ts", "^axe helpers ")
            finally:
                path.write_text(original)
            if identity(path) != snapshot[case["file"]]:
                raise RuntimeError("Restoration mismatch: " + case["id"])
            restored = run_test(probe, output, case["id"] + "-restored", case["testFile"], pattern)
            require_green(restored)
            if comparison:
                comparison["restored"] = run_test(probe, output, "component-restored",
                                                  "tests/tools-axe.test.ts", "^axe helpers ")
                require_green(comparison["restored"])
            failures = [item for item in mutant["assertions"] if item["status"] == "failed"]
            killed = (mutant["exitCode"] != 0 and len(failures) == 1
                      and case["test"] == failures[0]["title"]
                      and any("AssertionError" in message for message in failures[0]["failureMessages"])
                      and mutant["runtimeErrors"] == 0)
            outcome = "killed" if killed else "survived" if mutant["success"] and mutant["passed"] else "invalid"
            summary["cases"].append({**case, "outcome": outcome, "baseline": baseline,
                                      "mutant": mutant, "restored": restored,
                                      "componentComparison": comparison})
            print(case["id"] + ": " + outcome, flush=True)
            (output / "results.json").write_text(json.dumps(summary, indent=2) + "\n")
        if any(identity(probe / name) != expected for name, expected in snapshot.items()):
            raise RuntimeError("Probe source changed outside the restored mutations")
    summary["probeRemoved"] = not probe.exists()
    summary["sourceUnchanged"] = all(identity(source / name) == expected for name, expected in snapshot.items())
    summary["sourceStatusAfter"] = git(source, "status", "--short")
    if not summary["sourceUnchanged"] or summary["sourceStatusBefore"] != summary["sourceStatusAfter"]:
        raise RuntimeError("Source changed during the benchmark")
    (output / "results.json").write_text(json.dumps(summary, indent=2) + "\n")
    print("Source unchanged; disposable probe removed", flush=True)


if __name__ == "__main__":
    main()
