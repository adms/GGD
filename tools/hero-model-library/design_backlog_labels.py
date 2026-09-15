"""Chinese display labels for the design queue; source identity stays unchanged."""
import re


def has_han(value):
    return bool(re.search(r'[\u3400-\u9fff]', str(value or '')))


def bilingual_label(chinese, original, original_label=None):
    """Put the readable Chinese label first, retaining useful original text."""
    chinese, original = str(chinese).strip(), str(original or '').strip()
    if not original or chinese == original:
        return chinese
    remainder = str(original_label).strip() if original_label is not None else original
    if original_label is None and chinese in remainder:
        remainder = remainder.replace(chinese, '', 1).strip(' ／/｜|－-：:;；')
    if not remainder or remainder == chinese:
        return chinese
    return f'{chinese}（{remainder}）'


def labels_for(row, translations):
    original_name = row['name']
    original_work = row.get('work') or 'unknown'
    name_entry = translations.get('names', {}).get(row['id'], {})
    work_entry = translations.get('works', {}).get(original_work, {})
    name_zh = name_entry.get('nameZh')
    name_basis = name_entry.get('translationBasis')
    if not name_zh:
        name_zh = original_name if has_han(original_name) else next(
            (alias for alias in row.get('aliases', []) if has_han(alias)), None)
        name_basis = 'existing-source-label-or-alias' if name_zh else 'pending-chinese-name'
        name_zh = name_zh or '角色／模型中文名稱待確認'
    work_zh = work_entry.get('workZh')
    work_basis = work_entry.get('translationBasis')
    if not work_zh:
        work_zh = original_work if has_han(original_work) else '作品中文名稱待確認'
        work_basis = 'existing-source-label' if has_han(original_work) else 'pending-chinese-title'
    if not has_han(name_zh) or not has_han(work_zh):
        raise ValueError('Chinese label must contain readable Chinese: ' + row['id'])
    return dict(nameZh=name_zh, workZh=work_zh,
        displayName=bilingual_label(name_zh, original_name, name_entry.get('originalLabel')),
        displayWork=bilingual_label(work_zh, original_work, work_entry.get('originalLabel')),
        nameTranslationBasis=name_basis, workTranslationBasis=work_basis,
        localizationChangesIdentity=False)


def hero_check_label(check):
    status = check['status']
    translated = {
        'mapped-id-without-current-definition': '目前找不到英雄定義',
        'mechanics-defined': '已有技能機制資料',
        'content-changed-requires-coverage-refresh': '內容已變更，待重新核對',
        'not-audited': '尚未核對設計',
    }.get(status, '設計狀態待核對')
    return f"{translated}（{check['heroId']}；{check['availability']}）"
