"""Reserve private receipt storage before account mutations; never replay on loss."""

import errno
import json
import os
from pathlib import Path

from admin_api import SetupError, require

RECEIPT_BYTES = 1024 * 1024


class Receipt:
    def __init__(self, path, head, phase):
        self.path = Path(path).expanduser() if path else None
        self.pending = self.path.with_name(self.path.name + ".pending") if self.path else None
        self.head, self.phase = head, phase
        self.file = None
        self.started = self.verified = self.completed = False

    def _sync_directory(self):
        fd = os.open(self.path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)

    def _write(self, record, *, final=False):
        data = (json.dumps(record, indent=2, sort_keys=True) + "\n").encode()
        require(len(data) <= RECEIPT_BYTES, "Receipt exceeds its reserved one-MiB limit")
        self.file.seek(0)
        self.file.write(data)
        self.file.write(b" " * (RECEIPT_BYTES - len(data)))
        self.file.flush()
        os.fsync(self.file.fileno())
        if final:
            self.file.truncate(len(data))
            self.file.flush()
            os.fsync(self.file.fileno())

    def __enter__(self):
        if not self.path:
            return self
        require(not os.path.lexists(self.path), "The requested receipt path already exists")
        require(not os.path.lexists(self.pending),
                "An incomplete receipt already exists; inspect current state instead of replaying the action")
        try:
            fd = os.open(self.pending, os.O_RDWR | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                self.file = os.fdopen(fd, "w+b")
            except BaseException:
                os.close(fd)
                self.pending.unlink()
                raise
            self._write({"head": self.head, "phase": self.phase, "receipt_status": "reserved",
                         "note": "No account action has started in this invocation."})
            self._sync_directory()
        except (OSError, SetupError) as error:
            self.__exit__(None, None, None)
            code = errno.errorcode.get(getattr(error, "errno", None), "STORAGE_ERROR")
            raise SetupError(f"Receipt storage could not be reserved and synced before account actions ({code}). "
                             "Free local space or choose a writable receipt directory before continuing.") from None
        return self

    def execute(self, plan, code):
        plan.verify_code(code)
        require(self.file is not None, "Account actions require reserved receipt storage")
        try:
            self._write({"head": self.head, "phase": self.phase, "receipt_status": "incomplete",
                         "review_code": code, "plan": plan.describe(),
                         "note": "This intent is not a completion receipt. Account changes may have occurred."})
        except (OSError, SetupError, TypeError, ValueError) as error:
            reason = str(error) if isinstance(error, SetupError) else errno.errorcode.get(
                getattr(error, "errno", None), "STORAGE_ERROR")
            raise SetupError(f"Receipt intent could not be saved and synced before any account action ({reason}). "
                             "Restore writable local storage before continuing.") from None
        self.started = bool(plan.actions)
        return plan.execute(code)

    def finish(self, details):
        if not self.path:
            return
        self.verified = True
        try:
            self._write({"head": self.head, "phase": self.phase, "details": details}, final=True)
            # A link publishes the complete file atomically and refuses any existing
            # destination, including a symlink. Both paths are in the same directory.
            os.link(self.pending, self.path, follow_symlinks=False)
            self._sync_directory()
            self.completed = True
        except (OSError, SetupError, TypeError, ValueError) as error:
            reason = str(error) if isinstance(error, SetupError) else errno.errorcode.get(
                getattr(error, "errno", None), "STORAGE_ERROR")
            raise SetupError(f"Account checks completed, but the completion receipt could not be saved and synced ({reason}). "
                             "Do not repeat an apply or dispatch to recover a receipt. Use the appropriate read-only "
                             "verification with a new receipt path; preserve the incomplete receipt.") from None

    def __exit__(self, _type, _error, _traceback):
        if self.file is None:
            return
        try:
            self.file.close()
        except OSError:
            # Preserve the primary failure; it has already reported the missing
            # receipt. Successful publication explicitly flushed and synced first.
            pass
        if self.completed or not (self.started or self.verified):
            try:
                self.pending.unlink()
            except OSError:
                pass
