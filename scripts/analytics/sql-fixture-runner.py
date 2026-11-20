"""Run the report SQL's relational semantics against synthetic fixtures in SQLite.

Only the documented PostHog property access, interval and aggregate syntax is
adapted. This does not claim to validate PostHog's live HogQL parser or UI.
"""
import json
import re
import sqlite3
import sys

payload = json.load(sys.stdin)
connection = sqlite3.connect(":memory:")
connection.row_factory = sqlite3.Row
connection.create_function("now", 0, lambda: payload["now"])
connection.create_function("toUnixTimestamp", 1, lambda value: value)
connection.create_function("toString", 1, lambda value: None if value is None else str(value))


class ArgMin:
    def __init__(self):
        self.value = None
        self.order = None

    def step(self, value, order):
        if value is not None and order is not None and (self.order is None or order < self.order):
            self.value, self.order = value, order

    def finalize(self):
        return self.value


def quantile_type(fraction):
    class Quantile:
        def __init__(self):
            self.values = []

        def step(self, value):
            if value is not None:
                self.values.append(value)

        def finalize(self):
            if not self.values:
                return None
            values = sorted(self.values)
            position = (len(values) - 1) * fraction
            low = int(position)
            high = min(low + 1, len(values) - 1)
            return values[low] + (values[high] - values[low]) * (position - low)

    return Quantile


connection.create_aggregate("argMin", 2, ArgMin)
connection.create_aggregate("quantile50", 1, quantile_type(0.5))
connection.create_aggregate("quantile95", 1, quantile_type(0.95))
connection.execute("CREATE TABLE events(event TEXT, distinct_id TEXT, timestamp INTEGER, properties TEXT)")
connection.executemany("INSERT INTO events VALUES (?, ?, ?, ?)", [
    (event["event"], event["distinct_id"], event["timestamp"], json.dumps(event["properties"]))
    for event in payload["events"]
])
answers = {}
for key, sql in payload["queries"].items():
    sql = re.sub(r"properties\.([a-z_]+)", r"json_extract(properties, '$.\1')", sql)
    sql = re.sub(r"INTERVAL (\d+) DAY", lambda match: str(int(match[1]) * 86400), sql)
    sql = sql.replace("quantile(0.5)(", "quantile50(").replace("quantile(0.95)(", "quantile95(")
    answers[key] = [dict(row) for row in connection.execute(sql).fetchall()]
json.dump(answers, sys.stdout)
