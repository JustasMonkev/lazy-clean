import path from 'node:path';

export function isExcludedSubtree(root, file, directory, paths = path) {
  return paths.relative(root, file).split(paths.sep).includes(directory);
}

export function normalizePrivatePaths(text, studyRoot) {
  const roots = [studyRoot, studyRoot.replaceAll('\\', '/'), studyRoot.replaceAll('\\', '\\\\'), '/private/tmp/lazy-token-study-20261006'];
  for (const root of [...new Set(roots)].sort((a, b) => b.length - a.length)) {
    text = text.replaceAll(root, '<STUDY_ROOT>');
  }
  return text
    .replace(/(?<![\w.-])\/(Users|home)\/[^/\\\r\n"'`]+/g, '/$1/REDACTED')
    .replace(/[A-Za-z]:[\\/]+Users[\\/]+[^/\\\r\n"'`]+/gi, 'C:/Users/REDACTED');
}
