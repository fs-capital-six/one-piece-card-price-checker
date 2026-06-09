const LANGUAGE_OPTIONS = [
  { key: 'ja', label: 'Japanese (日本語)', enabled: true },
  { key: 'en', label: 'English', enabled: false },
];

const LANGUAGE_OPTION_MAP = new Map(LANGUAGE_OPTIONS.map((option) => [option.key, option]));

function parseLanguageKey(value) {
  const normalized = String(value || 'ja').toLowerCase();
  if (normalized === 'ja' || normalized === 'jp' || normalized === 'japanese') return 'ja';
  if (normalized === 'en' || normalized === 'english') return 'en';
  return 'ja';
}

function languageKeyLabel(languageKey = 'ja') {
  return LANGUAGE_OPTION_MAP.get(languageKey)?.label || 'Japanese (日本語)';
}

function isLanguageEnabled(languageKey) {
  return LANGUAGE_OPTION_MAP.get(languageKey)?.enabled === true;
}

module.exports = {
  LANGUAGE_OPTIONS,
  parseLanguageKey,
  languageKeyLabel,
  isLanguageEnabled,
};
