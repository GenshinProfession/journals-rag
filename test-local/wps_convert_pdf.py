"""WPS 转换脚本 - doc/docx -> PDF"""
import sys
from pathlib import Path
import win32com.client

def convert(input_path_str, output_path_str):
    wps = None
    try:
        wps = win32com.client.Dispatch('Kwps.Application')
        wps.Visible = False
        doc = wps.Documents.Open(str(Path(input_path_str).resolve()))
        # 17 = wdFormatPDF
        doc.SaveAs2(str(Path(output_path_str).resolve()), FileFormat=17)
        doc.Close()
        return Path(output_path_str).exists()
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
        print("Usage: python wps_convert_pdf.py <input.doc> <output.pdf>")
        sys.exit(1)
    
    success = convert(sys.argv[1], sys.argv[2])
    if success:
        print("OK")
    else:
        print("FAIL")
        sys.exit(1)
