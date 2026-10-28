"""发行验收中的辅助命名响应；主求解结束后允许客户端取消它。"""

import json


def assert_session_title_audits(audits, received_count):
    # 单个前台 Turn 最多尝试命名一次；发送前取消仍会留下尝试审计。
    assert received_count <= len(audits) <= 1, (received_count, audits)
    assert all(a["toolCount"] == 0 for a in audits), audits
    assert all(a["outcome"] in {"completed", "interrupted_or_unfinished"} for a in audits), audits
    if not received_count:
        assert all(
            a["outcome"] == "interrupted_or_unfinished" and a.get("httpStatus") is None
            for a in audits
        ), audits


def reply_to_session_title(handler, request, title):
    naming = any(
        message.get("role") == "system"
        and isinstance(message.get("content"), str)
        and message["content"].startswith("Generate a concise semantic session title")
        for message in request["messages"]
    )
    if not naming:
        return False
    # 协议断言必须在取消处理之外；不能把错误的辅助工具集当成正常取消。
    assert not request.get("tools"), "session naming must not receive tools"
    response = (
        "data: "
        + json.dumps(
            {"choices": [{"index": 0, "delta": {"content": title}, "finish_reason": "stop"}]}
        )
        + "\n\ndata: [DONE]\n\n"
    ).encode()
    try:
        handler.send_response(200)
        handler.send_header("Content-Type", "text/event-stream")
        handler.send_header("Content-Length", str(len(response)))
        handler.end_headers()
        handler.wfile.write(response)
    except (BrokenPipeError, ConnectionResetError):
        # 只接受已识别的辅助请求取消。求解回包的断开仍由原验收失败路径处理。
        handler.close_connection = True
    return True
