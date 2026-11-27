"""Read a populated, settled historical interval using the accepted broker receipts."""
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sys

from admin_api import Http, SetupError, command, require
import native_broker_execution as op
import native_settled_coverage as coverage


def observe():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-sha', required=True)
    args = parser.parse_args()
    folder = Path(os.environ['JEMS_OPERATION_JOURNAL']).parent / ('native-broker-'+op.SOURCE)
    accepted = op.saved(folder, 'accepted.json')
    require(accepted['native_run'] == '46056038814' and
            accepted['artifact_sha256'] == 'sha256:cb01648cc090948f68c1132b749db669b993deea68a94cd258b25865d87720ad'
            and accepted['serving_revision'] == 'jems-request-evidence-r-cf49775a5f0876047146' and
            accepted['image'] == op.broker.publication.IMAGE+'@sha256:9b4ea06f03b0725182fa123898d8ab536dcabebe604affee88aaefe23e983143',
            'ACCEPTANCE_RECEIPT_DIFFERS')
    baseline = op.saved(folder, 'rollback.json')
    current = op.guard(baseline)
    require(op.release.traffic(current) == {accepted['serving_revision']:100} and
            op.release.image(current['template']) == accepted['image'], 'ACCEPTED_BROKER_CHANGED')
    now = datetime.now(timezone.utc)
    end = (now-timedelta(minutes=20)).replace(second=0, microsecond=0)
    start = end-timedelta(days=7)
    token = command(['gcloud','auth','print-access-token','--quiet'])
    headers = {'x-goog-user-project':op.broker.PROJECT}
    monitor = Http('https://monitoring.googleapis.com', token, headers)
    samples = {s:coverage.positive_minutes(monitor,s,start,end) for s in coverage.SERVICES}
    interval = coverage.select_interval(samples,start,end)
    result = {'status':'NO_COMMON_POPULATED_HOUR', 'search_start':coverage.utc(start),'search_end':coverage.utc(end),
              'positive_minutes':{s:len(v) for s,v in samples.items()}, 'attestation_installed':False}
    if interval:
        evidence = coverage.collect(token, now, interval=interval)
        history = coverage.routing_history(Http('https://logging.googleapis.com',token,headers), evidence, now)
        evidence.update(accepted=accepted, routing_history=history, operator_source=args.source_sha, observed_utc=coverage.utc(now))
        result.update({k:evidence[k] for k in ('status','start_utc','end_utc','services','routing_checks')})
        routing = evidence['routing']
        result['routing_versions'] = {k:{f:v for f,v in routing[k].items() if f in ('createTime','updateTime')}
                                      for k in ('default_sink','bucket','view')}
        result['routing_changes_since_start'] = {k:v for k,v in history.items() if k != 'sink_errors_in_interval'}
        result['sink_errors'] = history['sink_errors_in_interval']
        result['sink_filter'] = coverage.sink_includes_requests(routing['default_sink'])
        evidence['summary'] = result
    else:
        evidence = result
    receipt = Path(os.environ['JEMS_OPERATION_JOURNAL']).stem + '-coverage.json'
    op.keep(folder, receipt, evidence)
    print(json.dumps({**result,'private_receipt':receipt}))


if __name__ == '__main__':
    try:
        observe()
    except (SetupError, KeyError, ValueError, OSError, TypeError) as exc:
        import re
        message = str(exc)
        status = re.search(r' returned HTTP ([1-5][0-9]{2})$', message)
        safe = message if re.fullmatch('[A-Z][A-Z0-9_]{2,80}',message) else ('HTTP_'+status[1] if status else type(exc).__name__)
        print(json.dumps({'status':'COVERAGE_OBSERVATION_STOPPED','code':safe}))
        sys.exit(2)
