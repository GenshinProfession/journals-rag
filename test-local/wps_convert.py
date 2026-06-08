"""独立的 WPS 转换脚本 - 通过子进程调用"""
import sys
from pathlib import Path
import win32com.client

def convert(doc_path_str, docx_path_str):
    wps = None
    try:
        wps = win32com.client.Dispatch('Kwps.Application')
        wps.Visible = False
        doc = wps.Documents.Open(str(Path(doc_path_str).resolve()))
        doc.SaveAs2(str(Path(docx_path_str).resolve()), FileFormat=16)
        doc.Close()
        return Path(docx_path_str).exists()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return False
    finally:
        if wps:
            try:
                wps.Quit()
            except:
                pass

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python wps_convert.py <input.doc> <output.docx>")
        sys.exit(1)
    
    success = convert(sys.argv[1], sys.argv[2])
    if success:
        print("OK")
    else:
        print("FAIL")
        sys.exit(1)
