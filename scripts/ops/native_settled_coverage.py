"""Private, bounded evidence collection for the settled-coverage review after broker IAM acceptance."""
from bisect import bisect_right
from collections import Counter
from datetime import datetime, timedelta, timezone
import re
from urllib.parse import urlencode

from admin_api import Http, SetupError, require
import bootstrap_request_diagnostics as setup

METRIC = 'run.googleapis.com/request_count'
SERVICES = ('factory-gateway','factory-preview','factory-coach-private')


def instant(s):
    return datetime.fromisoformat(s.replace('Z','+00:00'))


def utc(t):
    return t.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def pages(read, key, limit=20):
    token = ''
    seen = set()
    for _ in range(limit):
        body = read(token)
        require(isinstance(body,dict) and not body.get('executionErrors') and not body.get('unreachable') and
                isinstance(body.get(key,[]),list),'INCOMPLETE_PAGE')
        yield from body.get(key,[])
        token = body.get('nextPageToken','')
        if not token:
            return
        require(isinstance(token,str) and token not in seen,'INVALID_PAGINATION')
        seen.add(token)
    raise SetupError('PAGE_LIMIT')


def log_counts(client,service,start,end,delays=None):
    clause = (f'logName="projects/{setup.PROJECT}/logs/run.googleapis.com%2Frequests" AND '
              f'resource.type="cloud_run_revision" AND resource.labels.location="{setup.REGION}" AND '
              f'resource.labels.service_name="{service}" AND timestamp>="{utc(start)}" AND timestamp<"{utc(end)}"')
    def read(token):
        body={'resourceNames':[setup.VIEW],'filter':clause,'pageSize':100,'orderBy':'timestamp asc'}
        if token:
            body['pageToken']=token
        return client.call('POST','v2/entries:list?fields=nextPageToken,entries(timestamp,receiveTimestamp,insertId,resource(labels),httpRequest(status))',body)
    counts=Counter()
    seen=set()
    for row in pages(read,'entries'):
        labels=row['resource']['labels']
        stamp=instant(row['timestamp'])
        key=(row['timestamp'],row['insertId'])
        require(key not in seen and len(seen)<1000 and key[1] and start<=stamp<end and
                labels['project_id']==setup.PROJECT and labels['service_name']==service and
                labels['location']==setup.REGION,'LOG_INTERVAL_OR_IDENTITY_UNVERIFIED')
        seen.add(key)
        if delays is not None:
            received = instant(row['receiveTimestamp'])
            delays.append((received - stamp).total_seconds())
        status=row['httpRequest']['status']
        require(type(status) is int and 100<=status<=599 and labels['revision_name'].startswith(service+'-'),
                'LOG_STATUS_UNVERIFIED')
        counts[(labels['revision_name'],str(status))]+=1
    return counts


def metric_counts(client,service,start,end):
    clause=(f'metric.type="{METRIC}" AND resource.type="cloud_run_revision" AND '
            f'resource.labels.location="{setup.REGION}" AND resource.labels.service_name="{service}"')
    def read(token):
        query={'filter':clause,'interval.startTime':utc(start),'interval.endTime':utc(end),'view':'FULL','pageSize':'1000'}
        if token: query['pageToken']=token
        return client.call('GET',f'v3/projects/{setup.PROJECT}/timeSeries?'+urlencode(query))
    counts=Counter()
    points=0
    for series in pages(read,'timeSeries'):
        labels=series['resource']['labels']
        code=series['metric']['labels']['response_code']
        require(series['metric']['type']==METRIC and series['resource']['type']=='cloud_run_revision' and
                series.get('metricKind')=='DELTA' and series.get('valueType')=='INT64' and
                labels['project_id']==setup.PROJECT and labels['location']==setup.REGION and
                labels['service_name']==service and labels['revision_name'].startswith(service+'-') and
                re.fullmatch('[1-5][0-9]{2}',code),'METRIC_IDENTITY_UNVERIFIED')
        for point in series['points']:
            lo=instant(point['interval']['startTime']); hi=instant(point['interval']['endTime'])
            raw=point['value']['int64Value']
            require(start<=lo<hi<=end and re.fullmatch('[0-9]{1,18}',raw),'METRIC_INTERVAL_UNVERIFIED')
            counts[(labels['revision_name'],code)]+=int(raw)
            points+=1
    require(points>0,'NO_INDEPENDENT_SAMPLES')
    return counts


def collect(token,now, *, interval=None):
    head={'x-goog-user-project':setup.PROJECT}
    log=Http('https://logging.googleapis.com',token,head)
    monitor=Http('https://monitoring.googleapis.com',token,head)
    crm=Http('https://cloudresourcemanager.googleapis.com',token,head)
    end=(now-timedelta(minutes=20)).replace(second=0,microsecond=0)
    start=end-timedelta(hours=1)
    if interval is not None:
        start,end=interval
        require(timedelta(0)<end-start<=timedelta(hours=1) and end<=now-timedelta(minutes=20),
                'UNSETTLED_INTERVAL')
    evidence={'start_utc':utc(start),'end_utc':utc(end),'services':{},'routing':{},
              'status':'COVERAGE_REVIEW_REQUIRED','attestation_installed':False}
    def snapshot(key,read):
        try:
            evidence['routing'][key]=read()
        except (SetupError,KeyError,ValueError,TypeError):
            evidence['routing'][key]={'status':'READ_UNAVAILABLE'}
    snapshot('bucket',lambda:log.call('GET','v2/'+setup.VIEW.split('/views/')[0]+'?fields=name,lifecycleState,retentionDays,restrictedFields,updateTime'))
    snapshot('view',lambda:log.call('GET','v2/'+setup.VIEW+'?fields=name,filter,createTime,updateTime'))
    snapshot('default_sink',lambda:log.call('GET',f'v2/projects/{setup.PROJECT}/sinks/_Default?fields=name,destination,filter,exclusions,disabled,updateTime'))
    def ancestors():
        hierarchy=crm.call('POST',f'v1/projects/{setup.PROJECT}:getAncestry',{})
        rows=[item['resourceId'] for item in hierarchy['ancestor']]
        require(rows and rows[0]['type']=='project' and rows[0]['id'] in (setup.PROJECT,setup.NUMBER),'INVALID_ANCESTRY')
        data=[]
        for row in rows[1:]:
            require(row['type'] in ('organization','folder') and re.fullmatch('[0-9]+',row['id']),'INVALID_ANCESTOR')
            path='v2/'+row['type']+'s/'+row['id']+'/sinks?'
            def read(t):
                return log.call('GET',path+urlencode({'fields':'nextPageToken,sinks(name,interceptChildren,includeChildren,disabled,filter,exclusions)','pageToken':t}))
            data.append({'scope':row,'sinks':list(pages(read,'sinks'))})
        return data
    snapshot('ancestors',ancestors)
    routing = evidence['routing']
    bucket = routing['bucket']
    view = routing['view']
    sink = routing['default_sink']
    ancestors = routing['ancestors']
    bucket_name = setup.VIEW.split('/views/')[0]
    evidence['routing_checks'] = {
        'bucket_active': bucket.get('name') == bucket_name and bucket.get('lifecycleState') == 'ACTIVE',
        'retention_days': bucket.get('retentionDays'),
        'restricted_fields_present': bool(bucket.get('restrictedFields')) if bucket.get('name') else None,
        'view_filter_matches': view.get('name') == setup.VIEW and
                               ' '.join(view.get('filter', '').split()) == setup.broker.VIEW_FILTER,
        'sink_targets_bucket': sink.get('destination') == 'logging.googleapis.com/' + bucket_name and
                               not sink.get('disabled', False),
        'active_sink_exclusions': sum(not item.get('disabled', False) for item in sink.get('exclusions', []))
                                  if sink.get('name') else None,
        'ancestor_intercepts': sum(item.get('interceptChildren', False) and not item.get('disabled', False)
                                   for scope in ancestors for item in scope['sinks'])
                               if isinstance(ancestors, list) else None,
    }
    for service in SERVICES:
        row=evidence['services'][service]={}
        try:
            delays = []
            logs=log_counts(log,service,start,end,delays)
            if delays:
                row['max_ingestion_seconds'] = max(delays)
            row['view_entries']=sum(logs.values())
            metrics=metric_counts(monitor,service,start,end)
            row['independent_requests']=sum(metrics.values())
            if interval is not None:
                evidence.setdefault('counts_by_revision_status', {})[service] = [
                    {'revision':revision, 'status':code, 'logs':logs[revision,code], 'metric':metrics[revision,code]}
                    for revision,code in sorted(set(logs) | set(metrics))]
            row['comparison']='MATCH' if +metrics==+logs else 'MISMATCH'
            if not sum(metrics.values()):
                row['comparison']='NO_POSITIVE_INDEPENDENT_REQUESTS'
        except (SetupError,ValueError,KeyError,TypeError,AttributeError) as exc:
            row['comparison']=str(exc) if re.fullmatch('[A-Z][A-Z_]+',str(exc)) else 'READ_UNVERIFIED'
    return evidence


def positive_minutes(monitor, service, start, end):
    """Discover traffic independently of the log view. Exact comparison still uses unaligned series."""
    clause = (f'metric.type="{METRIC}" AND resource.type="cloud_run_revision" AND '
              f'resource.labels.project_id="{setup.PROJECT}" AND resource.labels.location="{setup.REGION}" '
              f'AND resource.labels.service_name="{service}"')

    def read(token):
        params = {'filter':clause, 'interval.startTime':utc(start), 'interval.endTime':utc(end),
                  'aggregation.alignmentPeriod':'60s', 'aggregation.perSeriesAligner':'ALIGN_SUM',
                  'aggregation.crossSeriesReducer':'REDUCE_SUM',
                  'aggregation.groupByFields':'resource.labels.service_name', 'pageSize':'1000', 'view':'FULL'}
        if token:
            params['pageToken'] = token
        return monitor.call('GET', f'v3/projects/{setup.PROJECT}/timeSeries?' + urlencode(params))

    minutes = set()
    for series in pages(read, 'timeSeries', limit=50):
        require(series['resource']['type'] == 'cloud_run_revision' and
                series['resource']['labels'].get('service_name') == service and series['metric']['type'] == METRIC,
                'MONITORING_DISCOVERY_IDENTITY_DIFFERS')
        for point in series['points']:
            value = point['value']['int64Value']
            stop = instant(point['interval']['endTime'])
            require(re.fullmatch('[0-9]{1,18}', value) and start < stop <= end, 'INVALID_DISCOVERY_POINT')
            if int(value) > 0:
                minutes.add(stop)
    return sorted(minutes)


def select_interval(by_service, start, end):
    hour = timedelta(hours=1)

    def populated(left, right):
        return start <= left < right <= end and all(
            bisect_right(times, right) > bisect_right(times, left) for times in by_service.values())

    require(set(by_service) == set(SERVICES), 'MISSING_SERVICE_HISTORY')
    historical = instant('2026-11-24T02:19:00Z')
    if populated(historical, historical + hour):
        return historical, historical + hour
    for stop in sorted(set().union(*by_service.values()), reverse=True):
        if populated(stop-hour, stop):
            return stop-hour, stop
    return None


def routing_history(log, evidence, now):
    """Count relevant changes and error records; return no event payloads or principals."""
    start = evidence['start_utc']
    end = evidence['end_utc']
    project = 'projects/' + setup.PROJECT
    ancestors = evidence['routing']['ancestors']
    scopes = [project]
    if isinstance(ancestors, list):
        scopes.extend(x['scope']['type']+'s/'+x['scope']['id'] for x in ancestors)
    result = {}

    def count(scope, clause):
        def read(token):
            body = {'resourceNames':[scope], 'filter':clause, 'pageSize':100}
            if token:
                body['pageToken'] = token
            return log.call('POST', 'v2/entries:list?fields=nextPageToken,entries(insertId)', body)
        return sum(1 for _ in pages(read, 'entries'))

    for scope in scopes:
        clause = (f'logName="{scope}/logs/cloudaudit.googleapis.com%2Factivity" AND '
                  f'timestamp>="{start}" AND timestamp<="{utc(now)}" AND '
                  'protoPayload.serviceName="logging.googleapis.com" AND '
                  'protoPayload.methodName=~"(Create|Update|Delete|Undelete)(Sink|Bucket|View|Exclusion)"')
        try:
            result[scope] = count(scope, clause)
        except SetupError:
            result[scope] = 'UNKNOWN'
    try:
        result['sink_errors_in_interval'] = count(project,
            f'logName="{project}/logs/logging.googleapis.com%2Fsink_error" AND timestamp>="{start}" AND timestamp<"{end}"')
    except SetupError:
        result['sink_errors_in_interval'] = 'UNKNOWN'
    return result


def sink_includes_requests(sink):
    if not sink.get('name') or sink.get('disabled'):
        return 'UNKNOWN'
    expression = sink.get('filter', '').strip()
    if not expression:
        return 'UNFILTERED'
    if re.fullmatch(r'log_id\("run\.googleapis\.com/requests"\)', expression, re.I):
        return 'REQUEST_LOG'
    # Recognize only a conjunction of literal exclusions of other log IDs.
    terms = re.split(r'\s+AND\s+', expression, flags=re.I)
    for term in terms:
        match = re.fullmatch(r'NOT\s+LOG_ID\("([A-Za-z0-9._/-]+)"\)', term.strip(), re.I)
        if not match or match[1] == 'run.googleapis.com/requests':
            return 'REVIEW_FILTER'
    return 'ONLY_OTHER_LOGS_EXCLUDED'
