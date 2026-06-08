"""
Format converter service for .doc ↔ .docx conversion.

Handles the bridge between legacy .doc format and modern .docx format,
allowing users to upload either format and download in their preferred format.
"""

import os
import subprocess
import tempfile
from pathlib import Path
from typing import Literal

OutputFormat = Literal["doc", "docx"]


class FormatConverter:
    """
    Converts between .doc and .docx formats.
    
    Strategy:
    - .doc → .docx: Required for python-docx processing
    - .docx → .doc: For users who need legacy format
    
    Conversion methods (in priority order):
    1. LibreOffice (headless) - Best for server environments
    2. Microsoft Word COM - Best for Windows with Office installed
    3. WPS Office COM - Alternative for Windows
    """
    
    def __init__(self, converter_path: str | None = None):
        """
        Initialize converter.
        
        Args:
            converter_path: Path to LibreOffice/soffice binary (auto-detected if None)
        """
        self.converter_path = converter_path or self._find_converter()
    
    def _find_converter(self) -> str | None:
        """Auto-detect available converter."""
        # Try LibreOffice
        for path in [
            r"C:\Program Files\LibreOffice\program\soffice.exe",
            r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
            "/usr/bin/soffice",
            "/usr/bin/libreoffice",
        ]:
            if os.path.exists(path):
                return path
        
        # Try WPS
        wps_paths = [
            r"C:\Users\{}\AppData\Local\Kingsoft\WPS Office\11.2.0.11470\office6\wps.exe".format(os.getenv('USERNAME', '')),
        ]
        for path in wps_paths:
            if os.path.exists(path):
                return path
        
        return None
    
    def convert(
        self,
        input_path: str | Path,
        output_format: OutputFormat,
        output_path: str | Path | None = None,
    ) -> Path:
        """
        Convert file to specified format.
        
        Args:
            input_path: Path to input file (.doc or .docx)
            output_format: Target format ('doc' or 'docx')
            output_path: Output file path (auto-generated if None)
            
        Returns:
            Path to converted file
            
        Raises:
            FileNotFoundError: If input file doesn't exist
            ValueError: If conversion not possible
        """
        input_path = Path(input_path)
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")
        
        input_format = input_path.suffix.lower().lstrip('.')
        
        # Same format, no conversion needed
        if input_format == output_format:
            return input_path
        
        # Generate output path if not specified
        if output_path is None:
            output_path = input_path.with_suffix(f".{output_format}")
        output_path = Path(output_path)
        
        # Try conversion methods
        try:
            return self._convert_with_libreoffice(input_path, output_format, output_path)
        except Exception as e:
            print(f"LibreOffice conversion failed: {e}")
        
        try:
            return self._convert_with_com(input_path, output_format, output_path)
        except Exception as e:
            print(f"COM conversion failed: {e}")
        
        raise ValueError(
            f"Cannot convert {input_format} to {output_format}. "
            "Please install LibreOffice or Microsoft Word."
        )
    
    def _convert_with_libreoffice(
        self,
        input_path: Path,
        output_format: str,
        output_path: Path,
    ) -> Path:
        """Convert using LibreOffice headless mode."""
        if not self.converter_path:
            raise ValueError("LibreOffice not found")
        
        # LibreOffice format codes
        format_map = {
            "doc": "doc",
            "docx": "docx",
        }
        
        cmd = [
            self.converter_path,
            "--headless",
            "--convert-to", format_map[output_format],
            "--outdir", str(output_path.parent),
            str(input_path),
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
        )
        
        if result.returncode != 0:
            raise RuntimeError(f"LibreOffice error: {result.stderr}")
        
        # Find the output file
        expected_output = output_path.parent / f"{input_path.stem}.{output_format}"
        if expected_output.exists():
            if expected_output != output_path:
                expected_output.rename(output_path)
            return output_path
        
        raise RuntimeError("Conversion output not found")
    
    def _convert_with_com(
        self,
        input_path: Path,
        output_format: str,
        output_path: Path,
    ) -> Path:
        """Convert using Microsoft Word COM interface (Windows only)."""
        try:
            import win32com.client
        except ImportError:
            raise RuntimeError("pywin32 not installed")
        
        word = None
        try:
            word = win32com.client.Dispatch('Word.Application')
            word.Visible = False
            
            doc = word.Documents.Open(str(input_path.resolve()))
            
            # Word format constants
            wd_format_doc = 0
            wd_format_docx = 12  # Actually wdFormatXMLDocument = 12
            
            save_format = wd_format_docx if output_format == "docx" else wd_format_doc
            doc.SaveAs2(str(output_path.resolve()), FileFormat=save_format)
            doc.Close()
            
            return output_path
        finally:
            if word:
                try:
                    word.Quit()
                except:
                    pass
    
    def convert_to_docx(self, input_path: str | Path) -> Path:
        """Convenience method: convert to .docx"""
        return self.convert(input_path, "docx")
    
    def convert_to_doc(self, input_path: str | Path) -> Path:
        """Convenience method: convert to .doc"""
        return self.convert(input_path, "doc")


class DocReader:
    """
    Read content from .doc files.
    
    For python-docx which only supports .docx, we need to:
    1. Convert .doc to .docx first
    2. Then read with python-docx
    3. Clean up temp file if needed
    """
    
    def __init__(self):
        self.converter = FormatConverter()
    
    def read_as_docx_bytes(self, file_path: str | Path) -> bytes:
        """
        Read a .doc file and return as .docx bytes.
        
        Args:
            file_path: Path to .doc file
            
        Returns:
            File content as .docx bytes
        """
        file_path = Path(file_path)
        
        if file_path.suffix.lower() == '.docx':
            return file_path.read_bytes()
        
        # Convert to .docx first
        with tempfile.NamedTemporaryFile(suffix='.docx', delete=False) as tmp:
            tmp_path = Path(tmp.name)
        
        try:
            self.converter.convert(file_path, "docx", tmp_path)
            return tmp_path.read_bytes()
        finally:
            tmp_path.unlink(missing_ok=True)
    
    def get_text_content(self, file_path: str | Path) -> str:
        """
        Extract text content from .doc or .docx file.
        
        Args:
            file_path: Path to document file
            
        Returns:
            Plain text content
        """
        from docx import Document
        
        file_path = Path(file_path)
        
        if file_path.suffix.lower() == '.docx':
            doc = Document(file_path)
        else:
            # Convert first
            docx_bytes = self.read_as_docx_bytes(file_path)
            doc = Document(io.BytesIO(docx_bytes))
        
        return '\n\n'.join(para.text for para in doc.paragraphs if para.text.strip())


# Singleton instance
_converter = None
_reader = None


def get_converter() -> FormatConverter:
    """Get singleton converter instance."""
    global _converter
    if _converter is None:
        _converter = FormatConverter()
    return _converter


def get_reader() -> DocReader:
    """Get singleton reader instance."""
    global _reader
    if _reader is None:
        _reader = DocReader()
    return _reader
