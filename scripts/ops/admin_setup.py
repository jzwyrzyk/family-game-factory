#!/usr/bin/env python3
"""Plan and apply additive Jems account setup. Production activation is separate."""

import argparse
import json
import math
from pathlib import Path
import re
import sys

from admin_api import Http, Plan, SetupError, command, require
from admin_receipts import Receipt
import admin_cloud
from release import ReleaseError

ROOT = Path(__file__).resolve().parents[2]
REPO = "jzwyrzyk/family-game-factory"
REPO_ID = 1458033181
OWNER_ID = 356692244
PREFIX = f"repos/{REPO}/"
ENVIRONMENTS = ("jems-image-publication", "jems-cloud-run-production")
FLAGS = {"JEMS_IMAGE_PUBLISH_ENABLED", "JEMS_CLOUD_RUN_RELEASE_ENABLED"}
SELECTED_BRANCH = {"protected_branches": False, "custom_branch_policies": True}


def field_subset(actual, expected):
    return all(actual.get(key) == value for key, value in expected.items())


def exact_rules(actual, expected):
    keys = ("name", "target", "enforcement", "bypass_actors", "conditions")
    return all(actual.get(key) == expected[key] for key in keys) and comparable_rules(actual) == comparable_rules(expected)


def comparable_rules(ruleset):
    return {rule["type"]: normalize_parameters(rule.get("parameters", {})) for rule in ruleset["rules"]}


def normalize_parameters(params):
    # GitHub can return server defaults for newer, disabled review settings.
    result = dict(params)
    # GitHub may default this Copilot-only switch to true. With zero required
    # approvals it has no effect and must not be treated as configuration drift.
    if result.get("required_approving_review_count") == 0:
        result.pop("require_extra_approval_for_unattributed_changes", None)
    elif not result.get("require_extra_approval_for_unattributed_changes"):
        result.pop("require_extra_approval_for_unattributed_changes", None)
    for key in ("required_reviewers", "dismissal_restriction"):
        if not result.get(key):
            result.pop(key, None)
    for key in ("allowed_merge_methods", "required_status_checks"):
        if key in result:
            result[key] = sorted(result[key], key=lambda item: json.dumps(item, sort_keys=True))
    return result


def github_pages(api, path, key=None):
    for page in range(1, 11):
        sep = "&" if "?" in path else "?"
        response = api("GET", f"{path}{sep}per_page=100&page={page}")
        records = response[key] if key else response
        yield from records
        if len(records) < 100:
            return
    raise SetupError("GitHub pagination exceeded the setup bound")


def check_flags(api, location=""):
    path = PREFIX + location + "variables"
    variables = list(github_pages(api, path, "variables"))
    require(not FLAGS.intersection(variable["name"] for variable in variables),
            "Production release flags must both be unset")
    return {variable["name"]: variable.get("value") for variable in variables
            if variable["name"] in {"JEMS_RELEASE_WIF_PROVIDER", "JEMS_RELEASE_SERVICE_ACCOUNT",
                                    "JEMS_PUBLISH_WIF_PROVIDER", "JEMS_PUBLISH_SERVICE_ACCOUNT"}}


def github_plan(api, head, *, after_merge=False):
    rules = json.loads((ROOT / "ops/github-main-ruleset.json").read_text())
    repo = api("GET", PREFIX.rstrip("/"))
    require(repo["id"] == REPO_ID and repo["owner"]["id"] == OWNER_ID and repo["default_branch"] == "main"
            and not repo["private"] and repo.get("permissions", {}).get("admin"),
            "Expected the authenticated Jems repository administrator and public main")
    check_flags(api, "actions/")
    pr = api("GET", PREFIX + "pulls/107")
    branch = api("GET", PREFIX + "branches/main")
    main = branch["commit"]["sha"]
    require(pr["head"]["sha"] == head and pr["head"]["repo"]["id"] == REPO_ID
            and pr["base"]["repo"]["id"] == REPO_ID and pr["base"]["ref"] == "main",
            "The pinned checkout is not the exact PR #107 head")
    if after_merge:
        require(pr.get("merged") and not pr.get("draft"), "Claims verification requires the reviewed inert merge")
        for workflow in ("jems-service-images.yml", "jems-cloud-run-release.yml"):
            path = ".github/workflows/" + workflow
            local = command(["git", "-C", str(ROOT), "rev-parse", f"{head}:{path}"])
            observed = api("GET", PREFIX + f"contents/{path}?ref={main}")
            require(observed["sha"] == local, "Protected main does not contain the reviewed workflow bytes")
        probe = "scripts/ops/oidc_claims.py"
        local = command(["git", "-C", str(ROOT), "rev-parse", f"{head}:{probe}"])
        require(api("GET", PREFIX + f"contents/{probe}?ref={main}")["sha"] == local,
                "Protected main does not contain the reviewed claims probe")
    else:
        require(pr["state"] == "open" and pr["draft"] and not pr["merged"], "PR #107 must remain an open draft")
        checks = list(github_pages(api, PREFIX + f"commits/{head}/check-runs?filter=latest", "check_runs"))
        expected = next(r["parameters"]["required_status_checks"] for r in rules["rules"]
                        if r["type"] == "required_status_checks")
        for entry in expected:
            matching = [run for run in checks if run["name"] == entry["context"] and
                        run["app"]["id"] == entry["integration_id"] and run["app"]["slug"] == "github-actions"]
            # The same workflow can have a cancelled push run and a newer PR run.
            current = max(matching, key=lambda run: run["id"], default={})
            require(current.get("conclusion") == "success", f"Current GitHub Actions check is not green: {entry['context']}")

    plan = Plan("github", {"repository": REPO, "main": main, "pr_head": head})
    listing = list(github_pages(api, PREFIX + "rulesets?includes_parents=true"))
    owned = [row for row in listing if row["name"] == rules["name"]]
    require(len(owned) <= 1 and all(row["target"] == "tag" or row.get("enforcement") == "disabled"
                                    or row in owned for row in listing), "Unknown active branch or push ruleset")
    effective = list(github_pages(api, PREFIX + "rules/branches/main"))
    if owned:
        ident = owned[0]["id"]
        actual = api("GET", PREFIX + f"rulesets/{ident}?includes_parents=false")
        require(exact_rules(actual, rules), "Named main ruleset differs from the reviewed scope")
        require(branch["protected"] and {row["type"] for row in effective if row.get("ruleset_id") == ident}
                == {row["type"] for row in rules["rules"]} and
                all(row.get("ruleset_id") == ident for row in effective), "Main ruleset enforcement did not match")
    else:
        require(not effective and not branch["protected"], "Unknown protection already applies to main")
        plan.add("Create the reviewed sole-maintainer main ruleset", rules,
                 lambda: api("POST", PREFIX + "rulesets", rules))

    existing_environments = {row["name"] for row in github_pages(api, PREFIX + "environments", "environments")}
    for environment in ENVIRONMENTS:
        path = PREFIX + "environments/" + environment
        actual = api("GET", path, missing=True)
        require((actual is not None) == (environment in existing_environments),
                f"Cannot establish whether {environment} exists")
        if actual is None:
            change = {"deployment_branch_policy": SELECTED_BRANCH}
            def create_environment(path=path, change=change):
                require(api("GET", path, missing=True) is None, "An environment appeared after review")
                api("PUT", path, change)

            plan.add(f"Create restricted environment {environment}", change, create_environment)
            branch_policies = []
        else:
            require(not actual.get("protection_rules") or
                    all(row["type"] == "branch_policy" for row in actual["protection_rules"]),
                    f"{environment} has unexpected protection rules")
            require(actual.get("deployment_branch_policy") == SELECTED_BRANCH,
                    f"{environment} does not enforce selected deployment branches")
            check_flags(api, f"environments/{environment}/")
            branch_policies = list(github_pages(api, path + "/deployment-branch-policies", "branch_policies"))
        require(len(branch_policies) <= 1 and all(field_subset(row, {"name": "main", "type": "branch"})
                                                for row in branch_policies),
                f"{environment} has an unexpected deployment ref")
        if not branch_policies:
            change = {"name": "main", "type": "branch"}
            plan.add(f"Allow only main in {environment}", change,
                     lambda path=path, change=change: api("POST", path + "/deployment-branch-policies", change))
    return plan


def verified_claims(api, main):
    receipts = {}
    for workflow, skipped in (("jems-service-images.yml", {"build", "publish"}),
                              ("jems-cloud-run-release.yml", {"plan", "transition"})):
        path = PREFIX + f"actions/workflows/{workflow}/runs?branch=main&event=workflow_dispatch&head_sha={main}&status=success"
        for run in github_pages(api, path, "workflow_runs"):
            if run["head_sha"] != main or run["event"] != "workflow_dispatch" or run["head_branch"] != "main":
                continue
            jobs = {job["name"]: job for job in github_pages(api, PREFIX + f'actions/runs/{run["id"]}/jobs', "jobs")}
            probe = jobs.get("verify-identity", {})
            if (probe.get("conclusion") == "success" and
                    any(step.get("conclusion") == "success" and step.get("name", "").startswith("Run python3 scripts/ops/oidc_claims.py")
                        for step in probe.get("steps", [])) and
                    all(jobs.get(name, {}).get("conclusion") == "skipped" for name in skipped)):
                receipts[workflow] = run["id"]
                break
        require(workflow in receipts, f"No completed claims-only proof for exact protected main: {workflow}")
    return receipts


def github_api():
    token = command(["gh", "auth", "token", "--hostname", "github.com"])
    return Http("https://api.github.com", token, {"X-GitHub-Api-Version": "2022-11-28"}).call


def read_head():
    head = command(["git", "-C", str(ROOT), "rev-parse", "HEAD"])
    require(re.fullmatch(r"[a-f0-9]{40}", head), "Invalid local checkout")
    require(not command(["git", "-C", str(ROOT), "status", "--porcelain", "--untracked-files=all"]),
            "Use a clean, pinned checkout to run this administrator program")
    return head


def show(plan):
    print(json.dumps({**plan.describe(), "review_code": plan.review_code()}, indent=2, sort_keys=True), flush=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("phase", nargs="?", default="plan", choices=(
        "plan", "plan-github", "apply-github", "plan-gcp", "apply-gcp", "verify",
        "plan-claims", "dispatch-claims", "verify-claims", "plan-production"))
    p.add_argument("--review-code")
    p.add_argument("--drill-project")
    p.add_argument("--acknowledge-isolated-cost", action="store_true")
    p.add_argument("--log-gib-day", type=float)
    p.add_argument("--receipt")
    args = p.parse_args()
    require(args.phase.startswith(("apply-", "dispatch-")) == bool(args.review_code),
            "Apply and dispatch require the matching review code from a separate plan")
    require(args.log_gib_day is None or (math.isfinite(args.log_gib_day) and args.log_gib_day >= 0),
            "Expected a non-negative log volume estimate")
    require(not args.receipt or args.phase.startswith(("apply-", "dispatch-")) or args.phase in {"verify", "verify-claims"},
            "Receipts are for completed actions or verification")
    head = read_head()
    if args.review_code:
        require(re.fullmatch(r"[a-f0-9]{64}", args.review_code), "A review code is 64 lowercase hexadecimal characters")
        if not args.receipt:
            args.receipt = str(Path.home() / f"jems-107-{args.phase}-{head[:12]}-{args.review_code[:12]}.json")
    with Receipt(args.receipt, head, args.phase) as receipt:
        run_phase(args, head, receipt)


def run_phase(args, head, receipt):
    outcomes = {}
    blockers = {}
    if args.phase in {"plan", "verify", "plan-github", "apply-github", "plan-claims", "dispatch-claims", "verify-claims"}:
        try:
            api = github_api()
            after = args.phase in {"plan-claims", "dispatch-claims", "verify-claims"}
            plan = github_plan(api, head, after_merge=after)
            if after:
                require(not plan.actions, "Verify the GitHub protections before the claims-only dispatch")
                plan.phase = "claims-only"
            if args.phase == "verify-claims":
                plan.evidence["verified_runs"] = verified_claims(api, plan.evidence["main"])
            if args.phase in {"plan-claims", "dispatch-claims"}:
                for workflow in ("jems-service-images.yml", "jems-cloud-run-release.yml"):
                    path = PREFIX + f"actions/workflows/{workflow}/dispatches"
                    body = {"ref": "main", "inputs": {"verify_identity": True}}
                    plan.add(f"Dispatch {workflow} claims-only verifier", body,
                             lambda path=path, body=body: api("POST", path, body))
            show(plan)
            if args.phase in {"plan", "plan-github", "plan-claims"} and plan.actions:
                next_phase = "dispatch-claims" if after else "apply-github"
                print(f"After review: python3 scripts/ops/admin_setup.py {next_phase} --review-code {plan.review_code()}", flush=True)
            if args.phase in {"apply-github", "dispatch-claims"}:
                receipt.execute(plan, args.review_code)
                if not after:
                    require(not github_plan(api, head).actions, "GitHub protections did not verify after apply")
            if args.phase == "verify":
                require(not plan.actions, "GitHub protections are incomplete")
            outcomes["github"] = plan.describe()
        except SetupError as error:
            blockers["github"] = str(error)
    if args.phase in {"plan", "verify", "plan-gcp", "apply-gcp", "plan-production"}:
        try:
            cloud = admin_cloud.Cloud(ROOT, head)
            if args.phase == "plan-production":
                show(cloud.production_plan())
            else:
                plan = cloud.plan(args.drill_project, args.acknowledge_isolated_cost, args.log_gib_day)
                show(plan)
                outcomes["gcp"] = plan.describe()
                if args.phase in {"plan", "plan-gcp"} and plan.actions:
                    options = ""
                    if args.drill_project:
                        options += f" --drill-project {args.drill_project}"
                    if args.acknowledge_isolated_cost:
                        options += " --acknowledge-isolated-cost"
                    if args.log_gib_day is not None:
                        options += f" --log-gib-day {args.log_gib_day}"
                    print(f"After review: python3 scripts/ops/admin_setup.py apply-gcp --review-code {plan.review_code()}{options}", flush=True)
                if args.phase == "apply-gcp":
                    require(not github_plan(github_api(), head).actions,
                            "Apply and verify GitHub protections first; the PR must remain a draft")
                    observed = receipt.execute(plan, args.review_code)
                    outcomes["gcp"]["performed_checks"] = observed
                    outcomes["gcp"]["verified_state"] = cloud.verify(
                        args.drill_project if args.acknowledge_isolated_cost else None,
                        args.log_gib_day is not None and args.acknowledge_isolated_cost,
                        plan.evidence["production_serving"])
                if args.phase == "verify":
                    outcomes["gcp"]["verified_state"] = cloud.verify(
                        args.drill_project if args.acknowledge_isolated_cost else None,
                        args.log_gib_day is not None and args.acknowledge_isolated_cost)
        except (SetupError, ReleaseError) as error:
            blockers["gcp"] = str(error)

    if not blockers:
        try:
            receipt.finish(outcomes)
        except SetupError as error:
            blockers["receipt"] = str(error)
    result = {"head": head, "codex_egress": admin_cloud.egress_status(), "blockers": blockers}
    if blockers and (receipt.started or receipt.verified):
        result["incomplete_receipt"] = str(receipt.pending)
    print(json.dumps(result, sort_keys=True), flush=True)
    if blockers:
        raise SystemExit(1)
    if args.receipt:
        print(json.dumps({"receipt": args.receipt}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (SetupError, OSError, KeyError, TypeError, ValueError) as error:
        print(str(error) if isinstance(error, SetupError) else "Setup could not read expected local or account data",
              file=sys.stderr)
        raise SystemExit(1) from None
