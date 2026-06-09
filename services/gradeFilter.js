const GRADE_OPTIONS = [
  { key: 'raw', label: 'Raw / Ungraded', categories: ['A', 'B', 'C', 'D'], isGraded: false },
  { key: 'PSA10', label: 'PSA 10', categories: ['PSA10'], isGraded: true },
  { key: 'PSA9', label: 'PSA 9', categories: ['PSA9'], isGraded: true },
  { key: 'PSA8', label: 'PSA 8 & below (incl. PSA 7)', categories: ['PSA8以下'], isGraded: true },
  { key: 'BGS10_BL', label: 'BGS 10 Black Label', categories: ['BGS10 BL'], isGraded: true },
  { key: 'BGS10_GL', label: 'BGS 10 Gold Label', categories: ['BGS10 GL'], isGraded: true },
  { key: 'BGS10', label: 'BGS 10 (any label)', categories: ['BGS10 BL', 'BGS10 GL'], isGraded: true },
  { key: 'BGS9_5', label: 'BGS 9.5', categories: ['BGS9.5'], isGraded: true },
  { key: 'BGS9', label: 'BGS 9 & below', categories: ['BGS9以下'], isGraded: true },
  { key: 'ARS10_PLUS', label: 'ARS 10+', categories: ['ARS10+'], isGraded: true },
  { key: 'ARS10', label: 'ARS 10', categories: ['ARS10'], isGraded: true },
  { key: 'ARS9', label: 'ARS 9', categories: ['ARS9'], isGraded: true },
  { key: 'ARS8', label: 'ARS 8 & below', categories: ['ARS8以下'], isGraded: true },
  { key: 'CGC', label: 'CGC / Other graded', categories: ['他鑑定品'], isGraded: true },
];

const GRADE_OPTION_MAP = new Map(GRADE_OPTIONS.map((option) => [option.key, option]));

const RAW_PATTERN = /^(A|B|C|D)$/;
const GRADED_NAME_PATTERN = /PSA\s?\d|BGS|ARS|CGC|鑑定/i;

function parseGradeKey(value, { isGraded } = {}) {
  if (value && GRADE_OPTION_MAP.has(String(value))) {
    return String(value);
  }
  if (isGraded === true || isGraded === 'true' || isGraded === 'on' || isGraded === '1') {
    return 'PSA10';
  }
  return 'raw';
}

function getGradeOption(gradeKey) {
  return GRADE_OPTION_MAP.get(gradeKey) || GRADE_OPTION_MAP.get('raw');
}

function gradeKeyLabel(gradeKey) {
  return getGradeOption(gradeKey).label;
}

function isGradedGradeKey(gradeKey) {
  return getGradeOption(gradeKey).isGraded;
}

function matchesGradeCategory(entry, categories) {
  if (!entry?.gradeCategory) return false;
  return categories.includes(entry.gradeCategory);
}

function matchesGradeInText(entry, gradeKey) {
  const option = getGradeOption(gradeKey);
  const label = `${entry.variantName || ''} ${entry.gradeCategory || ''}`;
  if (gradeKey === 'raw') {
    if (entry.gradeCategory && RAW_PATTERN.test(entry.gradeCategory)) return true;
    return !GRADED_NAME_PATTERN.test(label) && !entry.isGraded;
  }

  for (const category of option.categories) {
    if (label.includes(category)) return true;
    if (category === 'PSA8以下' && /PSA\s*[87]/i.test(label)) return true;
    if (category === 'BGS9以下' && /BGS\s*9/i.test(label)) return true;
    if (category === 'ARS8以下' && /ARS\s*8/i.test(label)) return true;
    if (category === '他鑑定品' && /CGC|CDC/i.test(label)) return true;
  }
  return false;
}

function matchesGradeKey(entry, gradeKey) {
  const option = getGradeOption(gradeKey);
  if (matchesGradeCategory(entry, option.categories)) return true;
  return matchesGradeInText(entry, gradeKey);
}

function filterByGradeKey(entries, gradeKey) {
  return entries.filter((entry) => matchesGradeKey(entry, gradeKey));
}

function sourceSupportsGradeKey(sourceMeta, source, gradeKey) {
  if (gradeKey === 'raw') return true;
  if (source === 'yuyu-tei') return false;
  return sourceMeta?.[source]?.supportsGraded !== false;
}

module.exports = {
  GRADE_OPTIONS,
  parseGradeKey,
  getGradeOption,
  gradeKeyLabel,
  isGradedGradeKey,
  matchesGradeKey,
  filterByGradeKey,
  sourceSupportsGradeKey,
};
