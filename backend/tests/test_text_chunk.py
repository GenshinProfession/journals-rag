from app.services.text_chunk import chunk_plain_text


def test_chunk_plain_text_keeps_short_text_whole() -> None:
    assert chunk_plain_text("hello", chunk_size=10, overlap=2) == ["hello"]


def test_chunk_plain_text_overlaps_long_text() -> None:
    chunks = chunk_plain_text("abcdefghij", chunk_size=4, overlap=1)
    assert chunks == ["abcd", "defg", "ghij"]


def test_chunk_plain_text_ignores_blank_text() -> None:
    assert chunk_plain_text("   ") == []
