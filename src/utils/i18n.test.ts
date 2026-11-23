import test from 'node:test';
import assert from 'node:assert/strict';
import { getTranslations, LOCALE_STORAGE_KEY, TRANSLATIONS } from '../i18n/translations';

test('en and zh dictionaries have identical keys and non-empty strings', () => {
  const enKeys = Object.keys(TRANSLATIONS.en).sort();
  const zhKeys = Object.keys(TRANSLATIONS.zh).sort();

  assert.deepEqual(enKeys, zhKeys);
  assert.equal(LOCALE_STORAGE_KEY, 'cadence-locale');

  for (const key of enKeys) {
    const enVal = TRANSLATIONS.en[key as keyof typeof TRANSLATIONS.en];
    const zhVal = TRANSLATIONS.zh[key as keyof typeof TRANSLATIONS.zh];

    if (typeof enVal === 'string') {
      assert.equal(typeof zhVal, 'string');
      assert.ok(enVal.length > 0, `en.${key} should be non-empty`);
      assert.ok((zhVal as string).length > 0, `zh.${key} should be non-empty`);
    } else if (Array.isArray(enVal)) {
      assert.ok(Array.isArray(zhVal), `zh.${key} should be array`);
      assert.equal(enVal.length, (zhVal as readonly string[]).length);
    } else if (typeof enVal === 'object' && enVal !== null) {
      assert.deepEqual(Object.keys(enVal).sort(), Object.keys(zhVal as object).sort());
    }
  }
});

test('getTranslations switches between en and zh labels', () => {
  const en = getTranslations('en');
  const zh = getTranslations('zh');

  assert.equal(en.langButtonLabel, '中文');
  assert.equal(zh.langButtonLabel, 'EN');
  assert.equal(en.quickPrompts.length, 3);
  assert.equal(zh.quickPrompts.length, 3);
});
