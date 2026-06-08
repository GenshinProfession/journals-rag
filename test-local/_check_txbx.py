from docx import Document
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph

doc = Document('论文模板说明_converted_cleaned.docx')
body = doc.element.body

tbs = body.findall('.//' + qn('w:txbxContent'))
print(f'文本框数量: {len(tbs)}')

# 看第一个的父链
tb = tbs[0]
parent = tb.getparent()
chain = []
while parent is not None and parent != body:
    chain.append(parent.tag.split('}')[1] if '}' in parent.tag else parent.tag)
    parent = parent.getparent()
print(f'父链(从内到外): {" > ".join(reversed(chain))}')
print()

# 检查每个文本框所在段落
for i, tb in enumerate(tbs[:5]):
    para_elem = tb.getparent()
    while para_elem is not None and para_elem.tag != qn('w:p'):
        para_elem = para_elem.getparent()
    if para_elem is not None:
        p = Paragraph(para_elem, doc)
        has_tbox_runs = []
        for j, run in enumerate(p.runs):
            if run._element.findall('.//' + qn('w:txbxContent')):
                has_tbox_runs.append(j)
        print(f'[{i:>2}] 段落文本: "{p.text[:40]}"  runs={len(p.runs)}  含文本框的run: {has_tbox_runs}')
