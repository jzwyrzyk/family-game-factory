#!/usr/bin/env python3
"""Verify GitHub OIDC claims without exchanging, storing, or printing the token."""
import argparse
import base64
import json
import os
import urllib.parse
import urllib.request

REPO = "jzwyrzyk/family-game-factory"
OWNER = "356692244"
REPO_ID = "1458033181"
PROJECT_NUMBER = "1054529152893"
LANES = {
    "publish": ("jems-image-publication", "jems-github-image-publish", "jems-service-images.yml"),
    "release": ("jems-cloud-run-production", "jems-github-cloud-run", "jems-cloud-run-release.yml"),
}


def expected_claims(lane):
    environment, pool, workflow = LANES[lane]
    return {
        "iss": "https://token.actions.githubusercontent.com",
        "aud": f"https://iam.googleapis.com/projects/{PROJECT_NUMBER}/locations/global/"
               f"workloadIdentityPools/{pool}/providers/github-main",
        "ref": "refs/heads/main",
        "repository": REPO,
        "repository_id": REPO_ID,
        "repository_owner_id": OWNER,
        "runner_environment": "github-hosted",
        "environment": environment,
        "workflow_ref": f"{REPO}/.github/workflows/{workflow}@refs/heads/main",
        "event_name": "workflow_dispatch",
        "sub": f"repo:jzwyrzyk@{OWNER}/family-game-factory@{REPO_ID}:environment:{environment}",
    }


def read_claims(audience, env):
    endpoint = urllib.parse.urlsplit(env["ACTIONS_ID_TOKEN_REQUEST_URL"])
    if endpoint.scheme != "https" or not endpoint.hostname or not endpoint.hostname.endswith(".actions.githubusercontent.com"):
        raise ValueError("Invalid GitHub token endpoint")
    query = urllib.parse.parse_qsl(endpoint.query, keep_blank_values=True)
    query = [(key, value) for key, value in query if key != "audience"]
    query.append(("audience", audience))
    url = endpoint._replace(query=urllib.parse.urlencode(query)).geturl()
    request = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + env["ACTIONS_ID_TOKEN_REQUEST_TOKEN"],
    })
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.load(response)["value"].split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


def mismatches(expected, actual):
    return sorted(key for key, value in expected.items() if actual.get(key) != value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lane", choices=LANES)
    args = parser.parse_args()
    expected = expected_claims(args.lane)
    try:
        differences = mismatches(expected, read_claims(expected["aud"], os.environ))
    except (OSError, ValueError, KeyError, IndexError, TypeError):
        raise SystemExit("GitHub OIDC claim check could not read a token") from None
    if differences:
        raise SystemExit("GitHub OIDC claim mismatch: " + ", ".join(differences))
    print(json.dumps({"claims_verified": args.lane, "claims": expected}, sort_keys=True))


if __name__ == "__main__":
    main()
