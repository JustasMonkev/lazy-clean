import json, sys, statistics as st
from collections import defaultdict

rows = [json.loads(l) for f in sys.argv[1:] for l in open(f)]
by = defaultdict(list)
for r in rows:
    by[(r['model'], r['arm'])].append(r)

def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else float('nan')

print('| Model | Arm | Runs | Pass | Mean total tokens | Median | Mean cache read | Mean cache write | Mean output | Mean turns | Mean cost USD | Checker runs | Ref reads | Skill calls | Denials |')
print('|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|')
for (m, a), rs in sorted(by.items()):
    tot = [r['totalTokens'] for r in rs if r['totalTokens'] is not None]
    print(f"| {m.replace('claude-','')} | {a} | {len(rs)} | {sum(r['pass'] for r in rs)} | {mean(tot):,.0f} | {st.median(tot):,.0f} | "
          f"{mean([r['cacheRead'] for r in rs]):,.0f} | {mean([r['cacheWrite'] for r in rs]):,.0f} | {mean([r['output'] for r in rs]):,.0f} | "
          f"{mean([r['turns'] for r in rs]):.1f} | {mean([r['costUsd'] for r in rs]):.3f} | {mean([r['slopRuns'] for r in rs]):.2f} | "
          f"{sum(len(r['refReads']) for r in rs)} | {sum(len(r['skills']) for r in rs)} | {sum(r['denials'] or 0 for r in rs)} |")

arms = sorted({r['arm'] for r in rows})
pairs = [('base', 'improved'), ('none', 'base'), ('none', 'improved')]
key = lambda r: (r['model'], r['task'], r['trial'])
idx = {(r['arm'],) + key(r): r for r in rows}
print()
print('| Model | Comparison | Paired runs | Total A | Total B | Change | Both-pass pairs | Change (both pass) | Turns A→B | Cost A→B |')
print('|---|---|--:|--:|--:|--:|--:|--:|--:|--:|')
for m in sorted({r['model'] for r in rows}):
    for a, b in pairs:
        if a not in arms or b not in arms: continue
        ps = [(idx[(a,) + k], idx[(b,) + k]) for k in {key(r) for r in rows if r['model'] == m}
              if (a,) + k in idx and (b,) + k in idx and idx[(a,) + k]['totalTokens'] and idx[(b,) + k]['totalTokens']]
        if not ps: continue
        ta = sum(x['totalTokens'] for x, _ in ps); tb = sum(y['totalTokens'] for _, y in ps)
        pp = [(x, y) for x, y in ps if x['pass'] and y['pass']]
        pa = sum(x['totalTokens'] for x, _ in pp); pb = sum(y['totalTokens'] for _, y in pp)
        print(f"| {m.replace('claude-','')} | {a} → {b} | {len(ps)} | {ta:,} | {tb:,} | {100*(tb-ta)/ta:+.1f}% | {len(pp)} | {100*(pb-pa)/pa if pa else float('nan'):+.1f}% | "
              f"{mean([x['turns'] for x,_ in ps]):.1f}→{mean([y['turns'] for _,y in ps]):.1f} | {sum(x['costUsd'] for x,_ in ps):.2f}→{sum(y['costUsd'] for _,y in ps):.2f} |")

fails = [r for r in rows if not r['pass']]
print('\nFailures:', [(r['model'].replace('claude-',''), r['arm'], r['task'], r['trial']) for r in fails])
