/**
 * Internationalisation (i18n) for CLI + report strings.
 *
 * Two languages ship in v1.1: English (default) and Arabic. Language is
 * selected by:
 *   1. Explicit --lang flag on the CLI (highest priority)
 *   2. KAKASHI_LANG env var
 *   3. LANG env var if it starts with "ar" (e.g. "ar_AE.UTF-8")
 *   4. Fallback: English
 *
 * All strings live in this single file. Consumers call `t(key)` to fetch
 * the localised string. Unknown keys fall back to the raw key so we never
 * crash on a missing translation.
 */

const STRINGS = {
  en: {
    scanning:            'Scanning',
    findings:            'findings',
    finding_singular:    'finding',
    id_docs:             'ID & documents',
    personal_info:       'personal info',
    credentials:         'credentials',
    apply_hint:          'Run `{cli} mask <file>` to apply (no previews shown — see `{cli} audit` for full mapping).',
    masked_saved:        '[ok] Masked version saved',
    replacements:        'replacements made',
    replacement:         'replacement made',
    id_docs_short:       'ID & docs',
    personal_info_short: 'personal info',
    credentials_short:   'credentials',
    error_prefix:        'Error',
    file_not_found:      'File not found',
    aborted:             'Aborted',
    total:               'Total',
    scan_dir_root:       'Root',
    scan_dir_conc:       'Concurrency',
    scan_dir_scanned:    'Scanned',
    scan_dir_duration:   'Duration',
    scan_dir_severity:   'Severity',
    scan_dir_severity_crit:   'critical',
    scan_dir_severity_high:   'high',
    scan_dir_severity_med:    'medium',
    scan_dir_severity_low:    'low',
    report_written:      '[ok] Report written',
  },
  ar: {
    scanning:            'جاري الفحص',
    findings:            'نتيجة',
    finding_singular:    'نتيجة',
    id_docs:             'وثائق وهويات',
    personal_info:       'معلومات شخصية',
    credentials:         'بيانات اعتماد',
    apply_hint:          'شغّل `{cli} mask <file>` للتطبيق (لا تُعرض القيم — راجع `{cli} audit` للتفاصيل).',
    masked_saved:        '[تم] تم حفظ النسخة المقنّعة',
    replacements:        'استبدالات',
    replacement:         'استبدال',
    id_docs_short:       'وثائق',
    personal_info_short: 'شخصي',
    credentials_short:   'اعتمادات',
    error_prefix:        'خطأ',
    file_not_found:      'الملف غير موجود',
    aborted:             'أُلغيت العملية',
    total:               'الإجمالي',
    scan_dir_root:       'المجلد',
    scan_dir_conc:       'المهام المتزامنة',
    scan_dir_scanned:    'تم فحص',
    scan_dir_duration:   'المدة',
    scan_dir_severity:   'الخطورة',
    scan_dir_severity_crit:   'حرجة',
    scan_dir_severity_high:   'عالية',
    scan_dir_severity_med:    'متوسطة',
    scan_dir_severity_low:    'منخفضة',
    report_written:      '[تم] تم كتابة التقرير',
  },
};

let currentLang = 'en';

/**
 * Resolve which language to use given a CLI-provided override and the
 * current process env. Sets the module-level language.
 * @param {string|null} explicit — value from a `--lang` flag
 * @returns {string} the resolved lang code
 */
function resolveLang(explicit) {
  if (explicit && STRINGS[explicit]) {
    currentLang = explicit;
    return currentLang;
  }
  const env = process.env.KAKASHI_LANG || process.env.LANG || '';
  if (STRINGS[env]) {
    currentLang = env;
  } else if (env.toLowerCase().startsWith('ar')) {
    currentLang = 'ar';
  } else {
    currentLang = 'en';
  }
  return currentLang;
}

function getLang() {
  return currentLang;
}

/**
 * Look up a translated string. Supports simple {placeholder} substitution.
 * @param {string} key
 * @param {object} [vars]
 * @returns {string}
 */
function t(key, vars = {}) {
  const table = STRINGS[currentLang] || STRINGS.en;
  let s = table[key] || STRINGS.en[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

module.exports = { t, resolveLang, getLang, STRINGS };
