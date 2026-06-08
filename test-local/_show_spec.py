import json

with open('_format_spec.json', 'r', encoding='utf-8') as f:
    spec = json.load(f)

print('=== 页面设置 ===')
print(json.dumps(spec['page_setup'], ensure_ascii=False, indent=2))

print('\n=== 关键元素格式 ===')
for e in spec['elements']:
    text = e.get('text', '')
    if not text and e.get('type') != 'table':
        continue
    if len(text) > 50:
        text = text[:50] + '...'
    
    idx = e['index']
    zone = e['zone']
    typ = e['type']
    
    if typ == 'paragraph':
        font = e.get('primary_font') or '?'
        size = e.get('primary_size_cn') or '?'
        bold = '+' if e.get('primary_bold') else ' '
        align = (e.get('alignment') or '?')[:6]
        pf = e.get('paragraph_format', {})
        ls = pf.get('line_spacing')
        indent = pf.get('first_line_indent_chars')
        
        extra = ""
        if ls: extra += f" ls:{ls}"
        if indent: extra += f" indent:{indent}chars"
        
        print(f"[{idx:>3}] {zone:<12} font:{font:<15} size:{size:<5}{bold} align:{align:<6}{extra} | {text}")
    
    elif typ == 'table':
        rc = e.get('row_count', 0)
        cc = e.get('col_count', 0)
        first_row = e.get('rows', [[]])[0] if e.get('rows') else []
        print(f"[{idx:>3}] {zone:<12} TABLE {rc}x{cc} | {' | '.join(str(c)[:15] for c in first_row[:4])}")
