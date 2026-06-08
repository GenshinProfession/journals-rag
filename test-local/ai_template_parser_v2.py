"""
AI模板解析服务 v2
更全面地提取论文格式规范
"""

import json
import requests
from pathlib import Path
from typing import Optional

# 阿里云模型配置
API_KEY = "sk-c2d7c7cefbe442248d955dc57d094cc4"
MODEL = "qwen-plus-2025-07-28"
API_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"


def convert_doc_to_docx(doc_path: str) -> Optional[str]:
    """将 .doc 转换为 .docx"""
    import subprocess
    from pathlib import Path
    
    doc_path = Path(doc_path)
    docx_path = doc_path.parent / f"{doc_path.stem}_converted.docx"
    
    wps_script = Path(__file__).parent / "wps_convert.py"
    
    try:
        result = subprocess.run(
            ['python', str(wps_script), str(doc_path), str(docx_path)],
            capture_output=True,
            text=True,
            timeout=120
        )
        
        if result.returncode == 0 and docx_path.exists():
            return str(docx_path)
        return None
    except Exception as e:
        print(f"转换失败: {e}")
        return None


def _format_para(para) -> str:
    """提取单个段落的文本和格式标注"""
    if not para.text.strip():
        return ""
    text = para.text
    if para.runs:
        run = para.runs[0]
        font_name = run.font.name or '默认'
        font_size = run.font.size
        bold = run.font.bold
        font_size_pt = font_size / 12700 if font_size else None
        
        align = para.alignment
        align_map = {0: '左对齐', 1: '居中', 2: '右对齐', 3: '两端对齐'}
        align_str = align_map.get(align, '默认') if align is not None else '默认'
        
        if font_size_pt or bold or align_str != '默认':
            parts = [f"字体:{font_name}"]
            if font_size_pt:
                parts.append(f"字号:{font_size_pt}pt")
            if bold:
                parts.append("加粗")
            if align_str != '默认':
                parts.append(align_str)
            text = f"[{', '.join(parts)}] {text}"
    return text


def _format_table(table) -> str:
    """提取单个表格的文本"""
    rows = []
    for row in table.rows:
        cells = [cell.text.strip().replace('\n', ' ') for cell in row.cells]
        # 去重连续相同单元格（合并单元格的常见情况）
        deduped = []
        for cell in cells:
            if not deduped or cell != deduped[-1]:
                deduped.append(cell)
        row_str = " | ".join(c for c in deduped if c)
        if row_str:
            rows.append(row_str)
    if rows:
        return "[表格]\n" + "\n".join(rows)
    return ""


def extract_text_from_file(file_path: str) -> str:
    """从 doc 或 docx 文件提取文本，保留格式信息和文档顺序"""
    file_path = Path(file_path)
    
    if file_path.suffix.lower() == '.doc':
        print("  检测到 .doc 文件，正在转换为 .docx...")
        docx_path = convert_doc_to_docx(str(file_path))
        if docx_path:
            file_path = Path(docx_path)
            print(f"  转换成功: {file_path}")
        else:
            return "转换失败: 无法将 .doc 转换为 .docx"
    
    try:
        from docx import Document
        from docx.table import Table
        from docx.text.paragraph import Paragraph
        
        doc = Document(str(file_path))
        text_parts = []
        
        # 按文档原始顺序遍历所有 body 元素（段落和表格交替）
        for element in doc.element.body:
            if element.tag.endswith('}p'):
                # 段落
                para = Paragraph(element, doc)
                line = _format_para(para)
                if line:
                    text_parts.append(line)
            elif element.tag.endswith('}tbl'):
                # 表格
                table = Table(element, doc)
                block = _format_table(table)
                if block:
                    text_parts.append(block)
        
        return "\n".join(text_parts)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return f"提取文本失败: {e}"


def call_ai_model(prompt: str, system_prompt: str = "") -> str:
    """调用阿里云模型"""
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    
    data = {
        "model": MODEL,
        "messages": messages,
        "temperature": 0.1,
        "max_tokens": 8000
    }
    
    try:
        response = requests.post(API_URL, headers=headers, json=data, timeout=120)
        response.raise_for_status()
        result = response.json()
        return result["choices"][0]["message"]["content"]
    except Exception as e:
        return f"AI调用失败: {e}"


SYSTEM_PROMPT = """你是一个论文格式规范解析专家。你的任务是从论文模板文档中**完整、准确地**提取所有结构和格式规范。

## 核心原则

1. **先发现，后提取**：先报告模板的整体结构，再提取每个部分的格式
2. **不遗漏，不假设**：模板有什么就提取什么，没有的不要硬套默认结构
3. **支持特殊结构**：双封面、声明页、答辩记录页等特殊页面都要报告
4. **可自定义**：你可以添加模板中实际存在但下方未列出的字段

## 输出格式

请严格按照以下 JSON 结构输出：

```json
{
  "_metadata": {
    "school_name": "学校名称",
    "college_name": "学院名称（如果模板中明确）",
    "degree_level": "bachelor/master/doctor",
    "total_pages": "估算总页数",
    "parsed_at": "解析时间"
  },
  
  "_structure": {
    "description": "模板整体结构描述，例如：本模板包含双封面（中文封面+英文封面）、摘要、目录、正文、参考文献、致谢",
    "covers": [
      {
        "index": 1,
        "type": "chinese",
        "description": "中文封面，包含学校logo、论文题目、学生信息",
        "has_logo": true
      },
      {
        "index": 2,
        "type": "english",
        "description": "英文封面，包含英文题目和学院信息",
        "has_logo": false
      }
    ],
    "special_pages": [
      {
        "type": "declaration",
        "description": "原创性声明页",
        "page_hint": 3
      },
      {
        "type": "defense_record",
        "description": "答辩记录页",
        "page_hint": "末尾"
      }
    ],
    "body_start": {
      "strategy": "after_toc",
      "description": "正文从目录之后开始"
    }
  },

  "page": {
    "size": "A4",
    "orientation": "portrait",
    "margin": {
      "top": 2.54,
      "bottom": 2.54,
      "left": 3.17,
      "right": 3.17,
      "binding": 0
    }
  },

  "covers": [
    {
      "index": 1,
      "type": "chinese",
      "title_cn": {
        "font": "宋体",
        "size": "小二号",
        "bold": true,
        "align": "居中"
      },
      "title_en": {
        "font": "Times New Roman",
        "size": "二号",
        "bold": false,
        "align": "居中"
      },
      "fields": {
        "college": {"label": "学院", "font": "宋体", "size": "四号"},
        "major": {"label": "专业", "font": "宋体", "size": "四号"},
        "student_id": {"label": "学号", "font": "宋体", "size": "四号"},
        "student_name": {"label": "姓名", "font": "宋体", "size": "四号"},
        "adviser": {"label": "指导教师", "font": "宋体", "size": "四号"},
        "date": {"label": "日期", "font": "宋体", "size": "四号"}
      }
    }
  ],

  "abstract_cn": {
    "title": {"font": "黑体", "size": "小二号", "bold": true, "align": "居中"},
    "body": {"font": "宋体", "size": "小四号", "line_spacing": "1.5倍", "first_indent": "2字符"},
    "keywords_label": {"font": "宋体", "size": "四号", "bold": true},
    "keywords": {"font": "宋体", "size": "四号", "separator": "；", "count": "3-5个"}
  },

  "abstract_en": {
    "title": {"font": "Times New Roman", "size": "小二号", "bold": true, "align": "居中"},
    "body": {"font": "Times New Roman", "size": "小四号", "line_spacing": "1.5倍"},
    "keywords_label": {"font": "Times New Roman", "size": "四号", "bold": true},
    "keywords": {"font": "Times New Roman", "size": "四号", "separator": "; "}
  },

  "toc": {
    "title": {"font": "黑体", "size": "小二号", "bold": true, "align": "居中"},
    "level1": {"font": "宋体", "size": "小四号", "bold": false},
    "level2": {"font": "宋体", "size": "小四号", "bold": false},
    "level3": {"font": "宋体", "size": "小四号", "bold": false}
  },

  "body": {
    "font": "宋体",
    "size": "小四号",
    "line_spacing": "1.5倍",
    "first_indent": "2字符",
    "align": "两端对齐"
  },

  "headings": [
    {
      "level": 1,
      "font": "黑体",
      "size": "小二号",
      "bold": true,
      "align": "居中",
      "numbering": "1",
      "example": "1 引言"
    },
    {
      "level": 2,
      "font": "黑体",
      "size": "小三号",
      "bold": true,
      "align": "左对齐",
      "numbering": "1.1",
      "example": "1.1 课题背景"
    },
    {
      "level": 3,
      "font": "黑体",
      "size": "四号",
      "bold": true,
      "align": "左对齐",
      "numbering": "1.1.1",
      "example": "1.1.1 具体内容"
    }
  ],

  "figure": {
    "title": {"font": "宋体", "size": "五号", "bold": false, "align": "居中"},
    "position": "图下方",
    "numbering": "图 X-Y",
    "example": "图 2-1"
  },

  "table": {
    "title": {"font": "宋体", "size": "五号", "bold": false, "align": "居中"},
    "position": "表上方",
    "numbering": "表 X-Y",
    "example": "表 2-1"
  },

  "reference": {
    "title": {"font": "黑体", "size": "小二号", "bold": true, "align": "居中"},
    "style": "GB/T 7714",
    "font": "宋体",
    "size": "五号",
    "line_spacing": "1.5倍",
    "numbering": "[1]",
    "type_marks": {"journal": "[J]", "book": "[M]", "thesis": "[D]", "conference": "[C]", "electronic": "[EB/OL]"}
  },

  "acknowledgement": {
    "title": {"font": "黑体", "size": "小二号", "bold": true, "align": "居中"},
    "body": {"font": "宋体", "size": "小四号", "line_spacing": "1.5倍", "first_indent": "2字符"}
  },

  "header": {"font": "宋体", "size": "小五号", "content": "章节标题"},
  "footer": {"font": "宋体", "size": "小五号", "numbering": "阿拉伯数字", "position": "居中"}
}
```

## 关键要求

1. **_structure 必须准确**：这是后续导出的基础，封面数量、特殊页面都不能错
2. **covers 是数组**：根据实际模板填写，有几个封面就写几个
3. **headings 是数组**：根据实际模板填写标题层级
4. **如果没有某个部分**：直接省略该字段，不要写 null 或空对象
5. **字号使用中文**：小二号、三号、小三号、四号、小四号、五号、小五号
6. **行距使用倍数**：1.5倍、1.25倍、单倍等
7. **页边距单位是厘米**

## 文档中的格式标注

文档中包含格式标注，如 `[字体:宋体, 字号:12pt, 加粗, 居中]`，请参考这些信息推断格式。"""


def parse_template(file_path: str) -> dict:
    """解析模板文档，返回格式规范JSON"""
    
    print("[1/3] 提取文档文本...")
    text = extract_text_from_file(file_path)
    
    if text.startswith("提取文本失败"):
        return {"error": text}
    
    print(f"  提取到 {len(text)} 字符")
    
    print("[2/3] 调用AI解析...")
    # 增加文本长度，确保封面、摘要、目录等都能被完整提取
    text_limit = min(len(text), 30000)  # 最多30000字符
    if text_limit < len(text):
        print(f"  文本过长，截断为 {text_limit} 字符")
    
    prompt = f"""请仔细解析以下论文模板文档，提取所有结构和格式规范。

注意：
1. 文档中包含格式标注，如[字体:宋体, 字号:12pt, 加粗, 居中]，请参考这些信息
2. 括号内的内容是格式说明，请仔细阅读
3. 特别注意模板的结构：有几个封面？有哪些特殊页面？
4. 请确保 _structure 中的描述准确反映模板的实际结构

---文档内容开始---
{text[:text_limit]}
---文档内容结束---

请严格按照系统提示中的JSON格式输出，不要有任何额外说明。"""
    
    result = call_ai_model(prompt, SYSTEM_PROMPT)
    
    if result.startswith("AI调用失败"):
        return {"error": result}
    
    print("[3/3] 解析AI输出...")
    try:
        json_str = result
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0]
        elif "```" in json_str:
            json_str = json_str.split("```")[1].split("```")[0]
        
        json_str = json_str.strip()
        spec = json.loads(json_str)
        return spec
    except json.JSONDecodeError as e:
        return {
            "error": f"JSON解析失败: {e}",
            "raw_output": result
        }


def save_spec(spec: dict, output_path: str):
    """保存格式规范到JSON文件"""
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(spec, f, ensure_ascii=False, indent=2)
    print(f"格式规范已保存到: {output_path}")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("用法: python ai_template_parser_v2.py <模板文档路径> [输出JSON路径]")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else "格式规范.json"
    
    if not Path(input_path).exists():
        print(f"错误: 文件不存在 {input_path}")
        sys.exit(1)
    
    print(f"开始解析模板: {input_path}")
    print("=" * 50)
    
    spec = parse_template(input_path)
    
    if "error" in spec:
        print(f"错误: {spec['error']}")
        if "raw_output" in spec:
            print(f"AI原始输出:\n{spec['raw_output'][:2000]}")
        sys.exit(1)
    
    save_spec(spec, output_path)
    print("=" * 50)
    print("解析完成!")
