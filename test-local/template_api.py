"""
模板解析 API 服务（v2 - 清洗 + 格式提取）

职责：
1. POST /upload  - 上传模板 → 清洗 → 提取格式规范 → 返回清洗后 docx + spec JSON
2. GET  /file/<id> - 下载清洗后的 docx（用于 PDF 预览）
3. GET  /spec/<id> - 获取格式规范 JSON
4. POST /spec/<id> - 更新格式规范（人工修改）
"""

import json
import shutil
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import quote, unquote

from template_cleaner import clean_template
from format_spec_extractor import extract_format_spec
from ai_template_parser_v2 import convert_doc_to_docx

WORK_DIR = Path(__file__).parent / "_template_specs"
WORK_DIR.mkdir(exist_ok=True)
TEMPLATES_DIR = Path(__file__).parent / "_templates"
TEMPLATES_DIR.mkdir(exist_ok=True)


class TemplateAPIHandler(BaseHTTPRequestHandler):
    def send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_binary(self, data, content_type, filename=None):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        if filename:
            safe_name = quote(filename)
            self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{safe_name}")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-File-Name")
        self.end_headers()

    def do_GET(self):
        if self.path == "/status":
            self.send_json(200, {"status": "ok"})
            return

        # GET /file/<id> - 下载清洗后的 docx
        if self.path.startswith("/file/"):
            file_id = self.path.split("/")[-1]
            docx_path = TEMPLATES_DIR / f"{file_id}.docx"
            if docx_path.exists():
                self.send_binary(docx_path.read_bytes(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", f"{file_id}.docx")
            else:
                self.send_json(404, {"error": "File not found"})
            return

        # GET /spec/<id> - 获取格式规范
        if self.path.startswith("/spec/"):
            spec_id = self.path.split("/")[-1]
            spec_path = WORK_DIR / f"{spec_id}.json"
            if spec_path.exists():
                self.send_json(200, json.loads(spec_path.read_text(encoding="utf-8")))
            else:
                self.send_json(404, {"error": "Spec not found"})
            return

        self.send_json(404, {"error": "Not Found"})

    def do_POST(self):
        if self.path == "/upload":
            self._handle_upload()
            return
        self.send_json(404, {"error": "Not Found"})

    def do_PUT(self):
        # PUT /spec/<id> - 更新格式规范
        if self.path.startswith("/spec/"):
            self._handle_update_spec()
            return
        self.send_json(404, {"error": "Not Found"})

    def _handle_upload(self):
        """上传模板 → 清洗 → 提取格式规范"""
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self.send_json(400, {"error": "No file"})
                return

            file_data = self.rfile.read(content_length)
            encoded_name = self.headers.get("X-File-Name", "template.docx")
            try:
                original_name = unquote(encoded_name)
            except Exception:
                original_name = "template.docx"

            print(f"[upload] received: {original_name} ({len(file_data)} bytes)")

            # 1. 保存临时文件
            file_id = str(uuid.uuid4())[:8]
            suffix = Path(original_name).suffix.lower()
            temp_path = WORK_DIR / f"{file_id}_raw{suffix}"
            temp_path.write_bytes(file_data)

            # 2. .doc → .docx 转换
            docx_path = temp_path
            if suffix == ".doc":
                print("[upload] converting .doc to .docx...")
                converted = convert_doc_to_docx(str(temp_path))
                if not converted:
                    self.send_json(500, {"error": "无法转换 .doc 文件"})
                    return
                docx_path = Path(converted)

            # 3. 清洗模板
            print("[upload] cleaning template...")
            cleaned_path = WORK_DIR / f"{file_id}_cleaned.docx"
            clean_report = clean_template(str(docx_path), str(cleaned_path))
            if "error" in clean_report:
                self.send_json(500, clean_report)
                return
            print(f"[upload] cleaned: {clean_report.get('removed', {})}")

            # 4. 提取格式规范
            print("[upload] extracting format spec...")
            spec = extract_format_spec(str(cleaned_path))
            spec["_meta"] = {
                "id": file_id,
                "original_file": original_name,
                "clean_report": clean_report.get("removed", {}),
            }

            # 5. 保存清洗后的模板和规范
            saved_template = TEMPLATES_DIR / f"{file_id}.docx"
            shutil.copyfile(cleaned_path, saved_template)

            spec_path = WORK_DIR / f"{file_id}.json"
            spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")

            print(f"[upload] done: id={file_id}")

            self.send_json(200, {
                "id": file_id,
                "spec": spec,
                "clean_report": clean_report.get("removed", {}),
            })

        except Exception as exc:
            print(f"[upload] error: {exc}")
            import traceback
            traceback.print_exc()
            self.send_json(500, {"error": str(exc)})
        finally:
            # 清理临时文件
            for suffix in ["_raw.doc", "_raw.docx", "_converted.docx", "_cleaned.docx"]:
                p = WORK_DIR / f"{file_id}{suffix}"
                if p.exists():
                    p.unlink(missing_ok=True)

    def _handle_update_spec(self):
        """更新格式规范"""
        spec_id = self.path.split("/")[-1]
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self.send_json(400, {"error": "No data"})
                return
            spec = json.loads(self.rfile.read(content_length))
            spec_path = WORK_DIR / f"{spec_id}.json"
            spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
            self.send_json(200, {"id": spec_id, "spec": spec})
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})

    def log_message(self, fmt, *args):
        pass


def main():
    port = 8898
    server = HTTPServer(("127.0.0.1", port), TemplateAPIHandler)
    print("=" * 50)
    print(f"模板解析 API v2 已启动: http://localhost:{port}")
    print("  POST /upload      上传→清洗→提取规范")
    print("  GET  /file/<id>   下载清洗后 docx")
    print("  GET  /spec/<id>   获取格式规范")
    print("  PUT  /spec/<id>   更新格式规范")
    print("=" * 50)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
