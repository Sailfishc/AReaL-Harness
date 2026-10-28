"""辅助取消不能污染发行验收，也不能吞掉求解或协议错误。"""

import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location(
    "fixture_session_title", Path(__file__).resolve().parents[1] / "fixture_session_title.py"
)
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


class SessionTitleFixture(unittest.TestCase):
    def test_audits_distinguish_received_requests_from_cancelled_attempts(self):
        cancelled = {"toolCount": 0, "outcome": "interrupted_or_unfinished", "httpStatus": None}
        completed = {"toolCount": 0, "outcome": "completed", "httpStatus": 200}
        for audits, received in (([], 0), ([cancelled], 0), ([cancelled], 1), ([completed], 1)):
            with self.subTest(audits=audits, received=received):
                fixture.assert_session_title_audits(audits, received)

    def test_missing_duplicate_or_unobserved_completed_audits_fail(self):
        cancelled = {"toolCount": 0, "outcome": "interrupted_or_unfinished", "httpStatus": None}
        completed = {"toolCount": 0, "outcome": "completed", "httpStatus": 200}
        invalid = (
            ([], 1),
            ([cancelled, cancelled], 0),
            ([completed], 0),
            ([{**cancelled, "httpStatus": 200}], 0),
            ([{**completed, "toolCount": 1}], 1),
            ([{**completed, "outcome": "failed"}], 1),
        )
        for audits, received in invalid:
            with self.subTest(audits=audits, received=received), self.assertRaises(AssertionError):
                fixture.assert_session_title_audits(audits, received)

    def request(self):
        return {
            "messages": [
                {"role": "system", "content": "Generate a concise semantic session title for this"}
            ]
        }

    def test_cancelled_auxiliary_response_does_not_fail_solve_acceptance(self):
        for boundary in ("end_headers", "wfile.write"):
            for failure in (BrokenPipeError, ConnectionResetError):
                with self.subTest(boundary=boundary, failure=failure):
                    handler = Mock()
                    target = (
                        handler.end_headers if boundary == "end_headers" else handler.wfile.write
                    )
                    target.side_effect = failure("cancelled")
                    self.assertTrue(
                        fixture.reply_to_session_title(handler, self.request(), "Title")
                    )
                    self.assertTrue(handler.close_connection)

    def test_solve_responses_remain_owned_by_the_strict_fixture(self):
        handler = Mock()
        request = {"messages": [{"role": "user", "content": "Perform real tool work"}]}
        self.assertFalse(fixture.reply_to_session_title(handler, request, "Title"))
        handler.send_response.assert_not_called()

    def test_naming_protocol_error_is_not_treated_as_cancellation(self):
        handler = Mock()
        handler.wfile.write.side_effect = BrokenPipeError("cancelled")
        request = self.request()
        request["tools"] = [{"type": "function"}]
        with self.assertRaisesRegex(AssertionError, "must not receive tools"):
            fixture.reply_to_session_title(handler, request, "Title")
        handler.send_response.assert_not_called()

    def test_unrelated_io_error_remains_a_failure(self):
        handler = Mock()
        handler.wfile.write.side_effect = OSError("unrelated fixture failure")
        with self.assertRaisesRegex(OSError, "unrelated fixture failure"):
            fixture.reply_to_session_title(handler, self.request(), "Title")


if __name__ == "__main__":
    unittest.main()
