"""Offline SQLite feasibility model. No transport, cloud config or production imports.

Rows represent separately authorized attempts under a per-attempt cap and one
aggregate family allowance. A claim is durably committed BEFORE a simulated
provider starts; a crashed/unknown claim cannot be replayed. This is a prototype,
not a replacement for the existing Firestore job coordinator.
"""
import hashlib
import json
import sqlite3


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


class Ledger:
    def __init__(self, path, allowance=3_000_000):
        self.db = sqlite3.connect(path, timeout=5, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS family(id INTEGER PRIMARY KEY CHECK(id=1), allowance INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS attempt(id TEXT PRIMARY KEY, contract TEXT NOT NULL,
            authorization TEXT NOT NULL UNIQUE, cancelled INTEGER NOT NULL DEFAULT 0);
          CREATE TABLE IF NOT EXISTS stage(attempt TEXT, name TEXT, reserve INTEGER NOT NULL,
            state TEXT NOT NULL, cost INTEGER, output TEXT, receipt TEXT,
            PRIMARY KEY(attempt,name), FOREIGN KEY(attempt) REFERENCES attempt(id));
        ''')
        self.db.execute('INSERT OR IGNORE INTO family VALUES(1,?)', (allowance,))

    def transaction(self, operation):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            result = operation()
            self.db.execute('COMMIT')
            return result
        except BaseException:
            self.db.execute('ROLLBACK')
            raise

    def exposure(self):
        # Unknown calls retain the entire reservation; only verified receipts
        # release the difference. A successful image receipt uses its approved
        # allowance unless the provider supplies independently reconciled cost.
        return self.db.execute('SELECT COALESCE(SUM(COALESCE(cost,reserve)),0) FROM stage').fetchone()[0]

    def admit(self, attempt, contract, authorization, stages, cap=1_000_000):
        if not authorization or not stages or any(type(v) is not int or v <= 0 for v in stages.values()):
            raise ValueError('INVALID_AUTHORIZATION_OR_RESERVE')
        total = sum(stages.values())
        if total > cap:
            raise ValueError('ATTEMPT_CAP')
        def operation():
            existing = self.db.execute('SELECT * FROM attempt WHERE id=?', (attempt,)).fetchone()
            if existing:
                saved = dict(self.db.execute('SELECT name,reserve FROM stage WHERE attempt=?', (attempt,)).fetchall())
                if (existing['contract'], existing['authorization'], saved) != (contract, authorization, stages):
                    raise ValueError('ADMISSION_CONFLICT')
                return False
            allowance = self.db.execute('SELECT allowance FROM family WHERE id=1').fetchone()[0]
            if self.exposure() + total > allowance:
                raise ValueError('FAMILY_ALLOWANCE')
            self.db.execute('INSERT INTO attempt(id,contract,authorization) VALUES(?,?,?)', (attempt, contract, authorization))
            self.db.executemany('INSERT INTO stage(attempt,name,reserve,state) VALUES(?,?,?,\'reserved\')',
                                [(attempt, k, v) for k, v in stages.items()])
            return True
        return self.transaction(operation)

    def claim(self, attempt, name, contract):
        def operation():
            a = self.db.execute('SELECT * FROM attempt WHERE id=?', (attempt,)).fetchone()
            if not a or a['cancelled'] or a['contract'] != contract:
                raise ValueError('CANCELLED_OR_STALE')
            cursor = self.db.execute("UPDATE stage SET state='uncertain' WHERE attempt=? AND name=? AND state='reserved'", (attempt, name))
            return cursor.rowcount == 1
        return self.transaction(operation)

    def settle(self, attempt, name, contract, cost, output, succeeded=True):
        def operation():
            a = self.db.execute('SELECT * FROM attempt WHERE id=?', (attempt,)).fetchone()
            row = self.db.execute('SELECT * FROM stage WHERE attempt=? AND name=?', (attempt, name)).fetchone()
            if not a or not row or a['contract'] != contract or type(cost) is not int or not 0 <= cost <= row['reserve']:
                raise ValueError('RECEIPT_INVALID')
            receipt = digest([attempt, name, contract, cost, output, succeeded])
            if row['receipt']:
                if receipt != row['receipt']:
                    raise ValueError('RECEIPT_CONFLICT')
                return False
            if row['state'] != 'uncertain':
                raise ValueError('UNCLAIMED_RECEIPT')
            self.db.execute('UPDATE stage SET state=?,cost=?,output=?,receipt=? WHERE attempt=? AND name=?',
                            ('complete' if succeeded else 'failed', cost, output, receipt, attempt, name))
            return True
        return self.transaction(operation)

    def cancel(self, attempt):
        def operation():
            self.db.execute('UPDATE attempt SET cancelled=1 WHERE id=?', (attempt,))
            self.db.execute("UPDATE stage SET state='cancelled',cost=0 WHERE attempt=? AND state='reserved'", (attempt,))
        self.transaction(operation)

    def join(self, attempt, contract, names):
        def operation():
            a = self.db.execute('SELECT * FROM attempt WHERE id=?', (attempt,)).fetchone()
            rows = self.db.execute('SELECT * FROM stage WHERE attempt=? ORDER BY name', (attempt,)).fetchall()
            selected = [r for r in rows if r['name'] in names]
            if not a or a['cancelled'] or a['contract'] != contract or len(selected) != len(set(names)) or not names or any(r['state'] != 'complete' or not r['output'] for r in selected):
                raise ValueError('JOIN_INCOMPLETE')
            return digest([contract, [(r['name'], r['output']) for r in selected]])
        return self.transaction(operation)

    def close(self):
        self.db.close()
