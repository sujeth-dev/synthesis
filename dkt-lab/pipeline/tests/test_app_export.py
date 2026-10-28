"""The website's "Synaptic app" tab reads copies of results the app produced.
These tests prove the copies are byte-faithful and that drift is detected, so
re-running the app's comparison scripts without re-exporting cannot leave the
site quietly showing old numbers."""
import json
import os

import check_web
import export


def test_every_app_result_exists_and_is_valid_json():
    for source in export.APP_RESULTS:
        path = os.path.join(export.REPO, source)
        assert os.path.exists(path), f"{source} is listed in APP_RESULTS but missing"
        json.load(open(path))


def test_exported_copies_equal_their_sources(tmp_path, monkeypatch):
    monkeypatch.setattr(export, "WEB_DATA", str(tmp_path))
    export.export_app_results()
    for source in export.APP_RESULTS:
        copy = os.path.join(str(tmp_path), "app", os.path.basename(source))
        assert open(copy, "rb").read() == open(os.path.join(export.REPO, source), "rb").read()


def test_check_web_detects_a_tampered_app_copy(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(export, "WEB_DATA", str(tmp_path))
    monkeypatch.setattr(check_web, "WEB_DATA", str(tmp_path))
    monkeypatch.setattr(check_web, "available", lambda: [])
    # Isolate this test to the app copies: no dataset or summary results exist
    # in the empty directory, so only the new check can fail.
    empty = tmp_path / "no-results"
    empty.mkdir()
    monkeypatch.setattr(check_web, "RESULTS_DIR", str(empty))
    export.export_app_results()
    assert check_web.main() == 0

    victim = export.app_result_dest(export.APP_RESULTS[0])
    doc = json.load(open(victim))
    doc["synthetic"] = not doc["synthetic"]
    json.dump(doc, open(victim, "w"))

    assert check_web.main() == 1
    assert "MISMATCH" in capsys.readouterr().out
