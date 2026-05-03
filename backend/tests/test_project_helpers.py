from app.api.projects import _parse_json_object


def test_parse_json_object_accepts_plain_json() -> None:
    assert _parse_json_object('{"passed": true, "score": 90}') == {"passed": True, "score": 90}


def test_parse_json_object_extracts_json_from_model_text() -> None:
    raw = '结论如下：\n{"passed": false, "issues": ["too short"]}\n请查看。'
    assert _parse_json_object(raw) == {"passed": False, "issues": ["too short"]}


def test_parse_json_object_returns_empty_on_invalid_text() -> None:
    assert _parse_json_object("not json") == {}
