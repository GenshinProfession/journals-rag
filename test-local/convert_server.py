"""
本地文件转换服务
支持 .doc/.docx 转换为 .docx 和 PDF
"""

import json
import uuid
import subprocess
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import unquote, quote


WORK_DIR = Path(__file__).parent / "_convert_tmp"
WORK_DIR.mkdir(exist_ok=True)
WPS_SCRIPT = Path(__file__).parent / "wps_convert.py"
WPS_PDF_SCRIPT = Path(__file__).parent / "wps_convert_pdf.py"


class ConvertHandler(BaseHTTPRequestHandler):

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
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-File-Name, X-Output-Format')
        self.end_headers()

    def do_GET(self):
        if self.path == '/status':
            self.send_json(200, {'status': 'ok'})
        else:
            self.send_json(404, {'error': 'Not Found'})

    def do_POST(self):
        if self.path != '/convert':
            self.send_json(404, {'error': 'Not Found'})
            return

        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                self.send_json(400, {'error': 'No file'})
                return

            file_data = self.rfile.read(content_length)

            encoded_name = self.headers.get('X-File-Name', 'document.doc')
            try:
                original_name = unquote(encoded_name)
            except:
                original_name = 'document.doc'

            output_format = self.headers.get('X-Output-Format', 'docx')

            print(f"[convert] 收到: {original_name} ({len(file_data)} bytes) -> {output_format}")

            if output_format == 'pdf':
                result_data = convert_to_pdf(file_data)
                if result_data:
                    output_name = Path(original_name).stem + '.pdf'
                    print(f"[convert] PDF成功: {output_name} ({len(result_data)} bytes)")
                    self.send_file(result_data, output_name, 'application/pdf')
                else:
                    print("[convert] PDF失败")
                    self.send_json(500, {'error': 'PDF conversion failed'})
            else:
                result_data = convert_to_docx(file_data)
                if result_data:
                    output_name = Path(original_name).stem + '.docx'
                    print(f"[convert] DOCX成功: {output_name} ({len(result_data)} bytes)")
                    self.send_file(result_data, output_name,
                                   'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
                else:
                    print("[convert] DOCX失败")
                    self.send_json(500, {'error': 'DOCX conversion failed'})

        except Exception as e:
            print(f"[convert] 异常: {e}")
            import traceback
            traceback.print_exc()
            self.send_json(500, {'error': str(e)})

    def log_message(self, fmt, *args):
        pass


def run_wps_script(script_path: Path, input_data: bytes, output_suffix: str) -> bytes | None:
    job_id = str(uuid.uuid4())[:8]
    input_path = WORK_DIR / f"{job_id}{output_suffix}"
    output_path = WORK_DIR / f"{job_id}.out"

    try:
        # 对于输入，如果是 doc 转 docx，输入后缀是 .doc
        # 对于 doc/docx 转 pdf，输入后缀保持原样
        if output_suffix == '.docx':
            input_path = WORK_DIR / f"{job_id}.doc"
        elif output_suffix == '.pdf':
            # PDF 转换需要先保存为原始格式
            input_path = WORK_DIR / f"{job_id}.doc"
        
        input_path.write_bytes(input_data)

        result = subprocess.run(
            ['python', str(script_path), str(input_path), str(output_path)],
            capture_output=True,
            text=True,
            timeout=120,
        )

        print(f"[subprocess] stdout: {result.stdout.strip()}")
        if result.stderr.strip():
            print(f"[subprocess] stderr: {result.stderr.strip()}")
        print(f"[subprocess] returncode: {result.returncode}")

        if result.returncode == 0 and output_path.exists():
            data = output_path.read_bytes()
            return data
        return None

    except Exception as e:
        print(f"[convert] 错误: {e}")
        return None
    finally:
        input_path.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)


def convert_to_docx(file_data: bytes) -> bytes | None:
    return run_wps_script(WPS_SCRIPT, file_data, '.docx')


def convert_to_pdf(file_data: bytes) -> bytes | None:
    return run_wps_script(WPS_PDF_SCRIPT, file_data, '.pdf')


def main():
    port = 8899
    server = HTTPServer(('127.0.0.1', port), ConvertHandler)

    print("=" * 50)
    print(f"转换服务已启动: http://localhost:{port}")
    print("支持: .doc -> .docx, .doc/.docx -> PDF")
    print("=" * 50)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == '__main__':
    main()
