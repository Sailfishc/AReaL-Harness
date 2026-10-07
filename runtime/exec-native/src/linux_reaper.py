"""每次执行独占的 Linux subreaper；控制与回执只使用私有描述符。"""

import ctypes
import fcntl
import os
import select
import signal
import subprocess
import sys
import termios
import time


CLEANUP_SECONDS = 2.0
control_fd, receipt_fd, tty, filter_fd = map(int, sys.argv[1:5])
argv = sys.argv[6:]
stopping = False
reported = False


def stop(_signum, _frame):
    global stopping
    stopping = True


def write_line(message):
    data = message.replace("\n", " ").replace("\r", " ").encode()
    data = data[:900].decode("utf-8", errors="ignore").encode() + b"\n"
    try:
        os.write(receipt_fd, data)
    except OSError:
        # 调用方退出不能阻止这个进程继续收养并 wait 孤儿。
        pass


def report(message):
    global reported
    if reported:
        return
    reported = True
    write_line(message)
    os.close(receipt_fd)


def children():
    # 单线程 helper 的直接孩子均由本循环独占 wait；未 wait 的 PID 不会复用。
    with open("/proc/self/task/%d/children" % os.getpid(), encoding="ascii") as source:
        return [int(value) for value in source.read().split()]


def child_setup():
    # helper 是独立单线程解释器，复杂清理逻辑不在 Tokio 的 fork 后执行。
    os.setsid()
    if tty:
        fcntl.ioctl(0, termios.TIOCSCTTY, 0)


def supervise(leader, initial_error=None):
    global stopping
    failure = initial_error
    leader_status = None
    deadline = None
    while True:
        # 只收这个 helper 的孩子，绝不争抢 Runtime 里其他 Tokio Child 的退出码。
        no_children = False
        while True:
            try:
                pid, status = os.waitpid(-1, os.WNOHANG)
            except ChildProcessError:
                no_children = True
                break
            except InterruptedError:
                continue
            if pid == 0:
                break
            if leader is not None and pid == leader.pid:
                leader_status = status
                leader.returncode = os.waitstatus_to_exitcode(status)
                stopping = True
        if no_children:
            if failure is not None:
                report("ERROR " + failure)
                return 1
            if leader_status is None:
                report("ERROR execution ended without a leader status")
                return 1
            report("OK " + str(leader_status))
            return 0

        if not stopping:
            try:
                ready, _, _ = select.select([control_fd], [], [], 0.02)
                if ready:
                    os.read(control_fd, 1)
                    stopping = True
            except (OSError, ValueError) as error:
                failure = failure or "control pipe failed: " + str(error)
                stopping = True
        if failure is not None:
            stopping = True
        if not stopping:
            continue

        if deadline is None:
            deadline = time.monotonic() + CLEANUP_SECONDS
        try:
            owned = children()
        except OSError as error:
            owned = [leader.pid] if leader is not None and leader_status is None else []
            failure = failure or "cannot enumerate adopted children: " + str(error)
        # 先杀父，再在下一轮清理新收养的孩子；setsid 不改变收养关系。
        # 此处与 wait 不交错，已观察到的直接孩子不能在发信号前被复用。
        for pid in owned:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            except OSError as error:
                failure = failure or "cannot stop owned child: " + str(error)
        if time.monotonic() >= deadline:
            failure = failure or "owned descendants did not exit before cleanup deadline"
            report("ERROR " + failure)
            # D 态等异常先向调用方报告失败，但不退出并把后代丢给外层 PID 1。
        time.sleep(0.01 if not reported else 0.1)


def main():
    global stopping
    leader = None
    try:
        if not argv or sys.argv[5] != "--":
            raise ValueError("missing execution arguments")
        for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            signal.signal(signum, stop)
        signal.signal(signal.SIGCHLD, signal.SIG_DFL)
        libc = ctypes.CDLL(None, use_errno=True)
        libc.prctl.argtypes = [ctypes.c_int] + [ctypes.c_ulong] * 4
        libc.prctl.restype = ctypes.c_int
        if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER
            raise OSError(ctypes.get_errno(), "cannot become execution subreaper")
        children()  # 缺少 /proc 时，在启动工作负载前失败。
        for fd in (control_fd, receipt_fd):
            os.set_inheritable(fd, False)
        # 启动后立即取消也必须留下真实 Child/退出码，不能把正常取消报成清理失败。
        leader = subprocess.Popen(
            argv,
            close_fds=True,
            pass_fds=(filter_fd,) if filter_fd >= 0 else (),
            preexec_fn=child_setup,
        )
        write_line("STARTED")
        # 保留实际工具的管道/PTY；helper 不能自己持有这些端点延迟 EOF。
        for fd in (0, 1, 2):
            try:
                os.close(fd)
            except OSError:
                pass
        if filter_fd >= 0:
            os.close(filter_fd)
        return supervise(leader)
    except BaseException as error:
        stopping = True
        if leader is not None:
            return supervise(leader, "execution supervisor failed: " + str(error))
        # 没有 payload 时只是本次启动失败，不能触发整个 Runtime 的清理故障。
        report("START_FAILED " + str(error))
        return 1
    finally:
        os.close(control_fd)


# 不让解释器的 stdio flush 或 Popen 析构再干扰中央 wait 循环。
os._exit(main())
