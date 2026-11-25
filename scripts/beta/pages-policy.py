"""Read the current protected controller policy before checking out an application release."""
import json
import os
from pathlib import Path
import re


def delivery_policy(record):
    if set(record) != {"version", "mode", "hubOrigin", "operatorContact"} or record["version"] != 1:
        raise ValueError("PAGES_DELIVERY_POLICY_INVALID")
    mode = record["mode"]
    if mode == "household" and record["hubOrigin"] is None and record["operatorContact"] is None:
        return {"mode": mode}
    hub, contact = record["hubOrigin"], record["operatorContact"]
    if mode != "welcome-only" or not isinstance(hub, str) or not re.fullmatch(r"https://[a-z0-9-]+(?:\.[a-z0-9-]+)+", hub):
        raise ValueError("PAGES_DELIVERY_POLICY_INVALID")
    if not isinstance(contact, str) or not re.fullmatch(r"[-.\w+]+@[-.\w]+\.[A-Za-z]{2,}", contact):
        raise ValueError("PAGES_ADULT_CONTACT_REQUIRED")
    return {"mode": mode, "hub": hub, "contact": contact}


if __name__ == "__main__":
    selected = delivery_policy(json.loads(Path("ops/pages-delivery.json").read_text()))
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as handle:
        for name, value in selected.items():
            handle.write(f"{name}={value}\n")
