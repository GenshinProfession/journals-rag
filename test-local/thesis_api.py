"""
论文代写服务 v3
支持：模板分析 → 大纲编辑 → 分章节写作 → 段落微调 → 随时导出
"""

import json
import uuid
import subprocess
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import quote

from ai_template_parser_v2 import call_ai_model

WORK_DIR = Path(__file__).parent / "_thesis_work"
WORK_DIR.mkdir(exist_ok=True)
SPECS_DIR = Path(__file__).parent / "_template_specs"
TEMPLATES_DIR = Path(__file__).parent / "_templates"
TEMPLATES_DIR.mkdir(exist_ok=True)


# ============================================================
# AI 写作逻辑
# ============================================================

def generate_outline_from_template(topic: str, spec: dict, template_content: str = "") -> dict:
    """基于模板生成大纲"""
    school = spec.get('_metadata', {}).get('school_name', '大学')
    
    prompt = f"""基于以下论文模板，为论文主题生成大纲。

论文主题：{topic}
学校：{school}

{f'模板内容摘录：{template_content[:2000]}' if template_content else ''}

要求：
1. 参考模板的章节结构
2. 生成5-6个章节
3. 每章2-4个小节
4. 只输出大纲结构，不写内容

以JSON格式输出：
{{
  "title": "论文标题",
  "title_en": "English Title",
  "chapters": [
    {{
      "number": "1",
      "title": "章节标题",
      "sections": [
        {{"number": "1.1", "title": "小节标题"}}
      ]
    }}
  ]
}}"""

    result = call_ai_model(prompt, "你是一个学术论文结构设计专家。")
    
    try:
        json_str = result
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0]
        elif "```" in json_str:
            json_str = json_str.split("```")[1].split("```")[0]
        return json.loads(json_str.strip())
    except:
        return {"error": result[:500]}


def generate_section_content(topic: str, spec: dict, chapter_info: dict, 
                            section_info: dict, context: str = "", 
                            custom_requirements: str = "") -> str:
    """生成单个小节内容"""
    
    prompt = f"""撰写以下论文章节的正文内容。

论文主题：{topic}
当前章节：{chapter_info['number']} {chapter_info['title']}
当前小节：{section_info['number']} {section_info['title']}

{f'上下文：{context[:1000]}' if context else ''}
{f'特殊要求：{custom_requirements}' if custom_requirements else ''}

要求：
1. 专业、严谨、有学术性
2. 正式学术语言
3. 至少300字
4. 只输出正文，不写标题
5. 多段落用换行分隔
6. 暂时不写参考文献标注，后面统一处理

请直接输出正文内容。"""

    return call_ai_model(prompt, "你是一个学术论文写作专家。")


def rewrite_paragraph(original_text: str, instruction: str, context: str = "") -> str:
    """段落微调：根据指令修改指定段落"""
    
    prompt = f"""根据以下指令修改指定段落。

原始段落：
{original_text}

修改指令：{instruction}

{f'上下文：{context[:500]}' if context else ''}

要求：
1. 保持原意不变
2. 根据指令进行针对性修改
3. 保持学术语言风格
4. 直接输出修改后的段落

请输出修改后的段落："""

    return call_ai_model(prompt, "你是一个学术论文修改专家。")


def polish_paragraph(text: str) -> str:
    """润色段落"""
    prompt = f"""润色以下学术论文段落，使其更加专业、流畅。

原文：
{text}

要求：
1. 保持原意
2. 提升学术性
3. 语言更流畅
4. 直接输出润色后的段落"""

    return call_ai_model(prompt, "你是一个学术论文润色专家。")


def expand_paragraph(text: str, target_length: str = "300字") -> str:
    """扩展段落"""
    prompt = f"""扩展以下段落，使其达到{target_length}左右。

原文：
{text}

要求：
1. 保持原意
2. 补充细节、例子、分析
3. 保持学术风格
4. 直接输出扩展后的段落"""

    return call_ai_model(prompt, "你是一个学术论文写作专家。")


# ============================================================
# HTTP API
# ============================================================

class ThesisAPIHandler(BaseHTTPRequestHandler):

    def send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, data, filename, content_type):
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        safe_name = quote(filename)
        self.send_header('Content-Disposition', f"attachment; filename*=UTF-8''{safe_name}")
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/status':
            self.send_json(200, {'status': 'ok'})
        elif self.path.startswith('/thesis/'):
            thesis_id = self.path.split('/')[-1]
            self._get_thesis(thesis_id)
        else:
            self.send_json(404, {'error': 'Not Found'})

    def do_POST(self):
        routes = {
            '/outline': self._handle_outline,
            '/section': self._handle_section,
            '/rewrite': self._handle_rewrite,
            '/polish': self._handle_polish,
            '/expand': self._handle_expand,
            '/export': self._handle_export,
        }
        
        for path, handler in routes.items():
            if self.path == path:
                handler()
                return
        
        self.send_json(404, {'error': 'Not Found'})

    def do_PUT(self):
        if self.path.startswith('/thesis/'):
            thesis_id = self.path.split('/')[-1]
            self._update_thesis(thesis_id)
        else:
            self.send_json(404, {'error': 'Not Found'})

    def _get_thesis(self, thesis_id):
        """获取论文数据"""
        thesis_path = WORK_DIR / f"{thesis_id}.json"
        if not thesis_path.exists():
            self.send_json(404, {'error': '论文不存在'})
            return
        thesis = json.loads(thesis_path.read_text(encoding='utf-8'))
        self.send_json(200, {'thesis_id': thesis_id, 'thesis': thesis})

    def _update_thesis(self, thesis_id):
        """更新论文数据"""
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            self.send_json(400, {'error': 'No data'})
            return
        
        data = json.loads(self.rfile.read(content_length))
        thesis_path = WORK_DIR / f"{thesis_id}.json"
        thesis_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        self.send_json(200, {'status': 'ok'})

    def _handle_outline(self):
        """生成大纲"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(content_length))
            
            topic = data.get('topic', '')
            spec_id = data.get('spec_id', '')
            
            if not topic:
                self.send_json(400, {'error': '请提供论文主题'})
                return
            
            # 加载规范
            spec = {}
            if spec_id:
                spec_path = SPECS_DIR / f"{spec_id}.json"
                if spec_path.exists():
                    spec = json.loads(spec_path.read_text(encoding='utf-8'))
            
            print(f"[outline] 主题: {topic}")
            
            # 生成大纲
            outline = generate_outline_from_template(topic, spec)
            
            if 'error' in outline:
                self.send_json(500, outline)
                return
            
            # 创建论文数据
            thesis_id = str(uuid.uuid4())[:8]
            thesis = {
                'thesis_id': thesis_id,
                'topic': topic,
                'spec_id': spec_id,
                'title': outline.get('title', ''),
                'title_en': outline.get('title_en', ''),
                'outline': outline,
                'chapters': [],
                'cover_info': {},
                'template_pages': [],  # 模板原样页面
            }
            
            # 保存
            thesis_path = WORK_DIR / f"{thesis_id}.json"
            thesis_path.write_text(json.dumps(thesis, ensure_ascii=False, indent=2), encoding='utf-8')
            
            print(f"[outline] 成功: {thesis_id}")
            self.send_json(200, {'thesis_id': thesis_id, 'thesis': thesis})
            
        except Exception as e:
            print(f"[outline] 异常: {e}")
            import traceback
            traceback.print_exc()
            self.send_json(500, {'error': str(e)})

    def _handle_section(self):
        """生成单个小节"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(content_length))
            
            thesis_id = data.get('thesis_id', '')
            chapter_idx = data.get('chapter_index', 0)
            section_idx = data.get('section_index', 0)
            custom_requirements = data.get('requirements', '')
            
            # 加载论文
            thesis_path = WORK_DIR / f"{thesis_id}.json"
            if not thesis_path.exists():
                self.send_json(404, {'error': '论文不存在'})
                return
            thesis = json.loads(thesis_path.read_text(encoding='utf-8'))
            
            # 加载规范
            spec = {}
            spec_id = thesis.get('spec_id', '')
            if spec_id:
                spec_path = SPECS_DIR / f"{spec_id}.json"
                if spec_path.exists():
                    spec = json.loads(spec_path.read_text(encoding='utf-8'))
            
            # 获取章节信息
            outline = thesis.get('outline', {})
            chapters_outline = outline.get('chapters', [])
            
            if chapter_idx >= len(chapters_outline):
                self.send_json(400, {'error': '章节索引无效'})
                return
            
            chapter_info = chapters_outline[chapter_idx]
            sections = chapter_info.get('sections', [])
            
            if section_idx >= len(sections):
                self.send_json(400, {'error': '小节索引无效'})
                return
            
            section_info = sections[section_idx]
            
            print(f"[section] 论文{thesis_id} 章节{chapter_idx+1}.{section_idx+1}")
            
            # 生成内容
            content = generate_section_content(
                thesis.get('topic', ''),
                spec,
                chapter_info,
                section_info,
                custom_requirements=custom_requirements
            )
            
            # 更新论文数据
            while len(thesis['chapters']) <= chapter_idx:
                thesis['chapters'].append({
                    'number': str(len(thesis['chapters']) + 1),
                    'title': chapters_outline[len(thesis['chapters'])]['title'] if len(thesis['chapters']) < len(chapters_outline) else '',
                    'sections': []
                })
            
            while len(thesis['chapters'][chapter_idx]['sections']) <= section_idx:
                sec_info = sections[len(thesis['chapters'][chapter_idx]['sections'])]
                thesis['chapters'][chapter_idx]['sections'].append({
                    'number': sec_info.get('number', ''),
                    'title': sec_info.get('title', ''),
                    'content': ''
                })
            
            thesis['chapters'][chapter_idx]['sections'][section_idx]['content'] = content
            
            # 保存
            thesis_path.write_text(json.dumps(thesis, ensure_ascii=False, indent=2), encoding='utf-8')
            
            print(f"[section] 成功")
            self.send_json(200, {
                'thesis_id': thesis_id,
                'chapter_index': chapter_idx,
                'section_index': section_idx,
                'content': content
            })
            
        except Exception as e:
            print(f"[section] 异常: {e}")
            import traceback
            traceback.print_exc()
            self.send_json(500, {'error': str(e)})

    def _handle_rewrite(self):
        """段落重写"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(content_length))
            
            text = data.get('text', '')
            instruction = data.get('instruction', '')
            context = data.get('context', '')
            
            if not text or not instruction:
                self.send_json(400, {'error': '请提供原文和修改指令'})
                return
            
            print(f"[rewrite] 指令: {instruction[:50]}...")
            
            result = rewrite_paragraph(text, instruction, context)
            
            print(f"[rewrite] 成功")
            self.send_json(200, {'original': text, 'rewritten': result})
            
        except Exception as e:
            print(f"[rewrite] 异常: {e}")
            self.send_json(500, {'error': str(e)})

    def _handle_polish(self):
        """润色段落"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(content_length))
            
            text = data.get('text', '')
            
            if not text:
                self.send_json(400, {'error': '请提供文本'})
                return
            
            print(f"[polish] 润色中...")
            
            result = polish_paragraph(text)
            
            print(f"[polish] 成功")
            self.send_json(200, {'original': text, 'polished': result})
            
        except Exception as e:
            print(f"[polish] 异常: {e}")
            self.send_json(500, {'error': str(e)})

    def _handle_expand(self):
        """扩展段落"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(content_length))
            
            text = data.get('text', '')
            target_length = data.get('target_length', '300字')
            
            if not text:
                self.send_json(400, {'error': '请提供文本'})
                return
            
            print(f"[expand] 扩展中...")
            
            result = expand_paragraph(text, target_length)
            
            print(f"[expand] 成功")
            self.send_json(200, {'original': text, 'expanded': result})
            
        except Exception as e:
            print(f"[expand] 异常: {e}")
            self.send_json(500, {'error': str(e)})

    def _handle_export(self):
        """导出DOCX"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(content_length))
            
            thesis_id = data.get('thesis_id', '')
            cover_info = data.get('cover_info', {})
            
            # 加载论文
            thesis_path = WORK_DIR / f"{thesis_id}.json"
            if not thesis_path.exists():
                self.send_json(404, {'error': '论文不存在'})
                return
            thesis = json.loads(thesis_path.read_text(encoding='utf-8'))
            
            # 加载规范
            spec = {}
            spec_id = thesis.get('spec_id', '')
            if spec_id:
                spec_path = SPECS_DIR / f"{spec_id}.json"
                if spec_path.exists():
                    spec = json.loads(spec_path.read_text(encoding='utf-8'))
            
            # 保存封面信息
            if cover_info:
                thesis['cover_info'] = cover_info
                thesis_path.write_text(json.dumps(thesis, ensure_ascii=False, indent=2), encoding='utf-8')
            
            print(f"[export] 论文: {thesis_id}")
            
            # 导入docx生成器
            from docx_generator import generate_thesis_docx, generate_thesis_docx_from_template
            template_docx = spec.get('_metadata', {}).get('template_docx')
            if template_docx and Path(template_docx).exists():
                docx_data = generate_thesis_docx_from_template(
                    template_docx,
                    thesis,
                    spec,
                    cover_info or thesis.get('cover_info', {})
                )
            else:
                docx_data = generate_thesis_docx(thesis, spec, cover_info or thesis.get('cover_info', {}))
            
            if docx_data is None:
                self.send_json(500, {'error': 'DOCX生成失败'})
                return
            
            title = thesis.get('title', 'thesis')
            print(f"[export] 成功: {len(docx_data)} bytes")
            self.send_file(docx_data, f"{title}.docx",
                           'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            
        except Exception as e:
            print(f"[export] 异常: {e}")
            import traceback
            traceback.print_exc()
            self.send_json(500, {'error': str(e)})

    def log_message(self, fmt, *args):
        pass


def main():
    port = 8897
    server = HTTPServer(('127.0.0.1', port), ThesisAPIHandler)

    print("=" * 50)
    print(f"论文代写API v3 已启动: http://localhost:{port}")
    print("接口:")
    print("  POST /outline  - 生成大纲")
    print("  POST /section  - 生成章节")
    print("  POST /rewrite  - 段落重写")
    print("  POST /polish   - 段落润色")
    print("  POST /expand   - 段落扩展")
    print("  POST /export   - 导出DOCX")
    print("  GET  /thesis/<id> - 获取论文")
    print("  PUT  /thesis/<id> - 更新论文")
    print("=" * 50)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == '__main__':
    main()
