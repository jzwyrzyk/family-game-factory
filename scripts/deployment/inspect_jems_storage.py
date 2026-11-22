#!/usr/bin/env python3
"""Read-only Cloud Shell storage inventory. No cleanup, deployment or network calls.

Only the optional report is written, to an existing private directory under /tmp.
File bodies are not exported. Git may read its configuration and tracked files;
bounded release-journal and Git pointer metadata are inspected locally.
Findings are advisory, never deletion approval.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time

OPAQUE = {'.config', '.ssh', '.gnupg', '.gemini', '.codex', '.aws', '.azure', '.kube',
          '.docker', '.pki', '.password-store', '.mozilla', '.local', '.npmrc', '.netrc',
          '.git-credentials', '.gitconfig', '.bash_history', '.python_history'}
GENERATED = {'node_modules': 'installed_dependencies', 'dist': 'build_output_candidate',
             'build': 'build_output_candidate', 'coverage': 'test_output_candidate',
             'test-results': 'test_output_candidate', 'playwright-report': 'test_output_candidate'}
PRIVATE_NAME = re.compile(r'(^\.env(?:\.|$)|\.(?:pem|key|p12|pfx|gpg)$|(?:credential|password|passphrase|private[-_]?key|service[-_]?account|oauth)|^(?:token|secret)[.-])', re.I)
SHA = re.compile(r'^(?:[a-f0-9]{40}|[a-f0-9]{64})$')
PHASES = {'prepared', 'attempted', 'verified', 'success', 'succeeded', 'failed', 'completed'}
REGENERABLE = {'npm_download_cache', 'known_download_cache', 'installed_dependencies',
               'build_output_candidate', 'test_output_candidate'}


def now():
    return datetime.now(timezone.utc).isoformat()


def inside(path, root):
    try:
        Path(path).relative_to(root)
        return True
    except ValueError:
        return False


def category(parts):
    if parts and parts[0] in OPAQUE:
        return 'private_configuration_or_history'
    if any(PRIVATE_NAME.search(part) for part in parts):
        return 'protected_file'
    if '.git' in parts:
        return 'git_metadata'
    if any(part == '.factory-deployment' or part == 'state' or part.endswith('-state') for part in parts) or (parts and parts[-1] in {'release.json', 'release.lock', 'bootstrap.lock'}):
        return 'recovery_state'
    if len(parts) >= 2 and parts[:2] == ('.npm', '_cacache'):
        return 'npm_download_cache'
    if len(parts) >= 2 and parts[0] == '.cache' and parts[1] in {'pip', 'uv', 'ms-playwright', 'node-gyp', 'yarn', 'npm', 'pnpm'}:
        return 'known_download_cache'
    for part in parts:
        if part in GENERATED:
            return GENERATED[part]
    return 'unclassified_data'


def disk(path):
    info = os.statvfs(path)
    unit = info.f_frsize or info.f_bsize
    return {'totalBytes': info.f_blocks * unit, 'usedBytes': (info.f_blocks - info.f_bfree) * unit,
            'availableToUserBytes': info.f_bavail * unit, 'freeIncludingReservedBytes': info.f_bfree * unit,
            'reservedOrUnavailableBytes': max(0, info.f_bfree - info.f_bavail) * unit,
            'inodesTotal': info.f_files, 'inodesFree': info.f_ffree, 'device': os.stat(path).st_dev}


class Inventory:
    def __init__(self, home, output=None):
        self.home, self.output = home.resolve(), output
        self.started = now()
        self.entries, self.groups, self.repos, self.journals = {}, {}, set(), []
        self.errors, self.external_mounts = Counter(), []
        self.seen = set()
        self.opaque_counts = Counter()
        self.observed_stats, self.active_groups, self.dependencies = {}, set(), {}
        self.traversed_directories = set()
        self.disks_before = {'home': disk(self.home), 'temporary': disk('/tmp')}

    def label(self, path):
        path = Path(os.path.abspath(path))
        if inside(path, self.home):
            parts, prefix = path.relative_to(self.home).parts, 'HOME'
        elif inside(path, Path('/tmp')):
            parts, prefix = path.relative_to('/tmp').parts, 'TMP'
        else:
            return 'OUTSIDE_REVIEW_SCOPE'
        if parts and parts[0] in OPAQUE:
            return prefix + '/' + parts[0] + ('/[opaque]' if len(parts) > 1 else '')
        safe = []
        for part in parts:
            if PRIVATE_NAME.search(part) or len(part) > 160:
                safe.append('[protected-name]')
                break
            safe.append(part)
        return '/'.join((prefix, *safe))

    def add(self, path, info, scan_root, parts):
        kind = 'directory' if stat.S_ISDIR(info.st_mode) else 'file' if stat.S_ISREG(info.st_mode) else 'symlink' if stat.S_ISLNK(info.st_mode) else 'special'
        allocated = getattr(info, 'st_blocks', 0) * 512
        key = (info.st_dev, info.st_ino)
        unique = allocated if key not in self.seen else 0
        self.seen.add(key)
        cat = category(parts)
        entry = {'path': self.label(path), 'kind': kind, 'apparentBytes': info.st_size,
                 'allocatedBytes': allocated, 'uniqueAllocatedBytesAttributed': unique,
                 'links': info.st_nlink, 'category': cat}
        self.entries[str(path)] = entry
        self.observed_stats[str(path)] = (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns)
        if cat in {'private_configuration_or_history', 'protected_file'}:
            self.opaque_counts[cat] += 1
        for length in (1, 2):
            if len(parts) < length:
                continue
            group_path = scan_root.joinpath(*parts[:length])
            if length == 2 and category(parts[:1]) == 'private_configuration_or_history':
                continue
            name = self.label(group_path)
            group = self.groups.setdefault(name, {'path': name, 'depth': length,
                'allocatedBytes': 0, 'uniqueAllocatedBytesAttributed': 0, 'apparentBytes': 0,
                'entries': 0, 'categories': Counter(), 'symlinks': 0, 'reasons': []})
            group['allocatedBytes'] += allocated
            group['uniqueAllocatedBytesAttributed'] += unique
            group['apparentBytes'] += info.st_size if kind == 'file' else 0
            group['entries'] += 1
            group['categories'][cat] += allocated
            group['symlinks'] += kind == 'symlink'
        return kind, cat

    def scan(self, root, prefix_parts=()):
        try:
            device = root.stat().st_dev
        except OSError:
            self.errors['root_unreadable'] += 1
            return
        stack = [(root, prefix_parts, False)]
        while stack:
            directory, parts, in_git = stack.pop()
            try:
                with os.scandir(directory) as iterator:
                    children = list(iterator)
                self.traversed_directories.add(str(directory))
            except FileNotFoundError:
                self.errors['disappeared_during_scan'] += 1
                continue
            except OSError:
                self.errors['directory_unreadable'] += 1
                continue
            names = {child.name for child in children}
            if not in_git and category(parts) not in {'private_configuration_or_history', 'protected_file'}:
                if '.git' in names or {'HEAD', 'objects', 'refs', 'config'} <= names:
                    self.repos.add(directory)
            for child in children:
                path, current = Path(child.path), parts + (child.name,)
                if self.output and path == self.output:
                    continue
                try:
                    info = child.stat(follow_symlinks=False)
                except FileNotFoundError:
                    self.errors['disappeared_during_scan'] += 1
                    continue
                except OSError:
                    self.errors['entry_unreadable'] += 1
                    continue
                kind, cat = self.add(path, info, root if not prefix_parts else root.parent, current)
                if kind == 'directory':
                    if info.st_dev != device:
                        self.external_mounts.append(self.label(path))
                    else:
                        stack.append((path, current, in_git or child.name == '.git' or {'HEAD', 'objects', 'refs', 'config'} <= names))
                elif kind == 'file' and child.name == 'release.json' and cat == 'recovery_state' and not in_git:
                    self.journals.append(self.journal(path, info))

    def journal(self, path, info):
        result = {'path': self.label(path), 'decision': 'KEEP', 'bytes': info.st_size, 'read': False}
        if info.st_size > 5 * 1024 * 1024:
            result['reason'] = 'journal_too_large_for_bounded_metadata_read'
            return result
        try:
            descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            with os.fdopen(descriptor, 'rb') as stream:
                actual = os.fstat(stream.fileno())
                if actual.st_ino != info.st_ino or actual.st_dev != info.st_dev or not stat.S_ISREG(actual.st_mode):
                    raise ValueError('changed')
                data = stream.read(5 * 1024 * 1024 + 1)
                after = os.fstat(stream.fileno())
                if len(data) > 5 * 1024 * 1024 or (actual.st_size, actual.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                    raise ValueError('grew_or_changed')
                value = json.loads(data)
            if not isinstance(value, dict):
                raise ValueError('shape')
            result['read'] = True
            for key in ('source', 'tested', 'tool', 'primitives'):
                if isinstance(value.get(key), str) and SHA.fullmatch(value[key]):
                    result[key] = value[key]
            build = value.get('build', {})
            result['buildPhase'] = build.get('phase') if isinstance(build, dict) and build.get('phase') in PHASES else 'unknown'
            result['rollbackRequested'] = value.get('rollbackRequested') is True
            services = value.get('services', {})
            if isinstance(services, dict):
                result['servicePhases'] = {name: {step: record.get(step, {}).get('phase', 'unknown')
                    if isinstance(record.get(step), dict) and record[step].get('phase') in PHASES else 'unknown'
                    for step in ('stage', 'promotion', 'rollback') if step in record}
                    for name, record in services.items() if name in {'coach', 'gateway', 'preview', 'worker', 'sandbox'} and isinstance(record, dict)}
        except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
            result['reason'] = 'journal_metadata_unreadable_or_changed'
            self.errors['journal_unreadable_or_changed'] += 1
        return result

    def git(self, root, *args):
        env = os.environ.copy()
        for name in tuple(env):
            if not name.startswith('GIT_'):
                continue
            env.pop(name, None)
        env.update(GIT_OPTIONAL_LOCKS='0', GIT_NO_LAZY_FETCH='1', GIT_TERMINAL_PROMPT='0', GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL='/dev/null', GIT_ALLOW_PROTOCOL='', GIT_ATTR_NOSYSTEM='1')
        try:
            process = subprocess.run(['git', '--no-optional-locks', '-c', 'core.fsmonitor=false',
                '-c', 'core.hooksPath=/dev/null', '-c', 'core.untrackedCache=false', '-c', 'diff.external=',
                '-c', 'protocol.allow=never', '-c', 'core.quotePath=true', '-c', 'core.attributesFile=/dev/null',
                '-c', 'trace2.normalTarget=', '-c', 'trace2.eventTarget=', '-c', 'trace2.perfTarget=',
                '-C', str(root), *args], env=env, capture_output=True, timeout=20)
            if process.returncode or len(process.stdout) > 8 * 1024 * 1024:
                return None
            return process.stdout.decode('utf-8', 'surrogateescape').strip('\n')
        except (OSError, subprocess.TimeoutExpired):
            return None

    def metadata_text(self, path, limit=65536):
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, 'rb') as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode):
                raise ValueError('metadata_not_regular')
            data = stream.read(limit + 1)
            after = os.fstat(stream.fileno())
        if len(data) > limit or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise ValueError('metadata_large_or_changed')
        return data.decode('utf-8')

    def scanned_directory(self, path):
        path = Path(os.path.abspath(path))
        return str(path) in self.traversed_directories and path.resolve() == path

    def git_storage(self, root, result):
        """Resolve only bounded pointer metadata; preserve and skip out-of-scope repositories."""
        pointer = root / '.git'
        metadata = pointer if pointer.exists() or pointer.is_symlink() else root
        if metadata.is_symlink():
            raise ValueError('git_metadata_symlink')
        if metadata.is_file():
            text = self.metadata_text(metadata, 4096).strip()
            if not text.startswith('gitdir: '):
                raise ValueError('unrecognized_git_pointer')
            metadata = Path(os.path.abspath(root / text[8:]))
        if not self.scanned_directory(metadata):
            raise ValueError('git_metadata_outside_scanned_directories')
        common = metadata
        if (metadata / 'commondir').exists() or (metadata / 'commondir').is_symlink():
            common = Path(os.path.abspath(metadata / self.metadata_text(metadata / 'commondir', 4096).strip()))
        result['gitCommonDirectory'] = self.label(common)
        result['gitMetadataIsFile'] = pointer.is_file()
        if not self.scanned_directory(common):
            raise ValueError('git_common_directory_outside_scanned_directories')
        if any(entry['kind'] == 'symlink' for path, entry in self.entries.items() if inside(path, metadata) or inside(path, common)):
            raise ValueError('git_metadata_contains_symlinks')
        alternates = common / 'objects/info/alternates'
        providers = [common]
        self.dependencies[self.label(root)] = [self.label(common)]
        result['objectAlternates'] = []
        if alternates.exists():
            for line in self.metadata_text(alternates).splitlines():
                if not line or line.startswith('"'):
                    raise ValueError('unparsed_object_alternate')
                provider = Path(os.path.abspath(common / 'objects' / line))
                result['objectAlternates'].append(self.label(provider))
                providers.append(provider)
                self.dependencies[self.label(root)] = [self.label(path) for path in providers]
                if not self.scanned_directory(provider):
                    raise ValueError('object_alternate_outside_scanned_directories')
        result['httpAlternatesPresent'] = (common / 'objects/info/http-alternates').exists()
        self.dependencies[self.label(root)] = [self.label(path) for path in providers]
        return common

    def repository(self, root):
        result = {'path': self.label(root), 'decision': 'CHECKOUT_REVIEW', 'publicationVerified': False,
                  'reasons': ['remote_publication_not_checked', 'clean_git_status_alone_does_not_authorize_disposal']}
        try:
            common_path = self.git_storage(root, result)
        except (OSError, ValueError, UnicodeError):
            result.update(decision='KEEP', inspection='metadata_pointer_symlink_or_external_dependency_requires_review')
            return result
        bare = self.git(root, 'rev-parse', '--is-bare-repository')
        if bare not in {'true', 'false'}:
            result.update(decision='UNKNOWN_KEEP', inspection='git_metadata_unreadable')
            return result
        result['bare'] = bare == 'true'
        actual_root = self.git(root, 'rev-parse', '--show-toplevel') if not result['bare'] else str(root)
        result['actualRootMatches'] = bool(actual_root and Path(os.path.abspath(actual_root)) == root)
        if not result['actualRootMatches']:
            result.update(decision='KEEP', inspection='git_worktree_root_differs')
            return result
        head = self.git(root, 'rev-parse', '--verify', 'HEAD')
        result['head'] = head if head and SHA.fullmatch(head) else None
        result['shallow'] = self.git(root, 'rev-parse', '--is-shallow-repository') == 'true'
        result['worktrees'] = []
        worktrees = self.git(root, 'worktree', 'list', '--porcelain', '-z')
        if worktrees is not None:
            result['worktrees'] = [self.label(token[9:]) for token in worktrees.split('\0') if token.startswith('worktree ')]
        else:
            result['reasons'].append('worktree_graph_unreadable')
        origin = self.git(root, 'remote', 'get-url', 'origin')
        match = re.fullmatch(r'(?:https://(?:[^/@]+@)?github\.com/|git@github\.com:)(jzwyrzyk/[A-Za-z0-9_.-]+?)(?:\.git)?', origin or '')
        result['recognizedGithubRepository'] = match.group(1) if match else None
        result['originPresent'] = bool(origin)
        refs = self.git(root, 'for-each-ref', '--format=%(objectname) %(refname)', 'refs/heads', 'refs/remotes', 'refs/tags', 'refs/stash')
        result['refCounts'] = Counter()
        result['localRefTips'] = []
        if refs is not None:
            for line in refs.splitlines():
                fields = line.split(' ', 1)
                if len(fields) == 2 and SHA.fullmatch(fields[0]):
                    kind = fields[1].split('/')[1]
                    result['refCounts'][kind] += 1
                    if kind != 'remotes' and len(result['localRefTips']) < 80:
                        result['localRefTips'].append({'kind': kind, 'sha': fields[0]})
        result['localRefTipsTruncated'] = sum(count for kind, count in result['refCounts'].items() if kind != 'remotes') > len(result['localRefTips'])
        result['refsEnumerationComplete'] = refs is not None
        unique = self.git(root, 'rev-list', '--count', 'HEAD', '--branches', '--tags', '--not', '--remotes') if result['head'] else None
        result['commitsNotCoveredByCachedRemoteRefs'] = int(unique) if unique and unique.isdigit() else None
        reflogs = self.git(root, 'reflog', 'show', '--all', '--format=%H')
        result['reflogEntries'] = len(reflogs.splitlines()) if reflogs is not None else None
        stashes = self.git(root, 'stash', 'list', '--format=%H')
        result['stashEntries'] = len(stashes.splitlines()) if stashes is not None else None
        configuration = self.git(root, 'config', '--null', '--list', '--name-only')
        filters = configuration is None or any(record.split('\n', 1)[0].lower().startswith('filter.') for record in configuration.split('\0'))
        status = self.git(root, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching', '--ignore-submodules=all') if not result['bare'] and not filters else '' if result['bare'] else None
        if filters:
            result['reasons'].append('status_skipped_when_configured_filters_or_unreadable_configuration')
        counts, samples = Counter(), []
        if status is None:
            result['reasons'].append('git_status_unreadable_or_too_large')
        else:
            records, index = status.split('\0'), 0
            while index < len(records):
                entry = records[index]
                index += 1
                if not entry:
                    continue
                code, name = entry[:2], entry[3:]
                kind = 'untracked' if code == '??' else 'ignored' if code == '!!' else 'trackedChanges'
                counts[kind] += 1
                if len(samples) < 18 and kind != 'ignored':
                    samples.append({'kind': kind, 'path': self.label(root / name)})
                if 'R' in code or 'C' in code:
                    index += 1
        result.update(statusCounts=counts, statusEnumerationComplete=status is not None, changeSamples=samples, statusSamplesTruncated=sum(counts[k] for k in ('untracked', 'trackedChanges')) > len(samples))
        ignored = self.git(root, 'ls-files', '--others', '--ignored', '--exclude-standard', '-z') if not result['bare'] else ''
        ignored_categories = Counter()
        if ignored is not None:
            for name in ignored.split('\0'):
                if name:
                    entry = self.entries.get(str(root / name))
                    ignored_categories[entry['category'] if entry else 'unscanned_or_changed'] += 1
        result['ignoredFileCategories'] = ignored_categories
        result['ignoredEnumerationComplete'] = ignored is not None
        tracked = self.git(root, 'ls-files', '-z') if not result['bare'] else ''
        result['trackedGeneratedPathCount'] = sum(category(Path(name).parts) in REGENERABLE for name in (tracked or '').split('\0') if name)
        result['trackedEnumerationComplete'] = tracked is not None
        if not result['head'] or counts['trackedChanges'] or counts['untracked'] or result['stashEntries'] or status is None:
            result['decision'] = 'KEEP'
            result['reasons'].append('unborn_dirty_untracked_stashed_or_unreadable_work')
        if result['objectAlternates'] or result.get('httpAlternatesPresent') or len(result['worktrees']) > 1:
            result['reasons'].append('shared_git_objects_or_worktree_dependencies')
        return result

    def processes(self):
        result, counts, deleted_seen, deleted_by_device = [], Counter(), set(), Counter()
        self.active_groups = set()
        for directory in Path('/proc').iterdir():
            if not directory.name.isdigit():
                continue
            try:
                if directory.stat().st_uid != os.getuid():
                    continue
                counts['ownProcessesSeen'] += 1
                if int(directory.name) == os.getpid():
                    continue
                name = (directory / 'comm').read_text().strip()
                paths = set()
                try:
                    paths.add(os.readlink(directory / 'cwd'))
                except OSError:
                    counts['cwdUnreadable'] += 1
                try:
                    for argument in (directory / 'cmdline').read_bytes().split(b'\0'):
                        value = os.fsdecode(argument)
                        if value.startswith('--') and '=' in value:
                            value = value.split('=', 1)[1]
                        if value in self.entries:
                            paths.add(value)
                except OSError:
                    counts['argvUnreadable'] += 1
                try:
                    for fd in (directory / 'fd').iterdir():
                        try:
                            target = os.readlink(fd)
                            candidate = target.removesuffix(' (deleted)')
                            if candidate in self.entries:
                                paths.add(candidate)
                            elif target.endswith(' (deleted)') and str(Path(candidate).parent) in self.entries:
                                paths.add(str(Path(candidate).parent))
                            if target.endswith(' (deleted)'):
                                info = fd.stat()
                                key = (info.st_dev, info.st_ino)
                                if stat.S_ISREG(info.st_mode) and key not in deleted_seen:
                                    deleted_seen.add(key)
                                    deleted_by_device[str(info.st_dev)] += getattr(info, 'st_blocks', 0) * 512
                        except OSError:
                            counts['fdUnreadable'] += 1
                except OSError:
                    counts['fdDirectoryUnreadable'] += 1
                groups = set()
                for path in paths:
                    entry = self.entries.get(path)
                    if entry:
                        groups.update(group for group in self.groups if entry['path'] == group or entry['path'].startswith(group + '/'))
                self.active_groups.update(groups)
                if groups:
                    result.append({'pid': int(directory.name), 'name': name if re.fullmatch(r'[A-Za-z0-9_.+ -]{1,50}', name) else '[process]',
                                   'referencedGroups': sorted(groups)[:12], 'groupsTruncated': len(groups) > 12})
            except (OSError, ValueError):
                counts['processDisappearedOrUnreadable'] += 1
        return {'coverage': 'best_effort_cwd_open_files_and_arguments_matching_scanned_paths_only', 'notProofOfInactivity': True,
                'counts': counts, 'openDeletedUniqueAllocatedBytes': sum(deleted_by_device.values()),
                'openDeletedAllocatedBytesByDevice': deleted_by_device,
                'openDeletedUniqueFiles': len(deleted_seen), 'processes': result}

    def finish(self):
        print('INSPECTING_GIT_METADATA_AND_PROCESS_REFERENCES', file=sys.stderr, flush=True)
        repositories = [self.repository(root) for root in sorted(self.repos)]
        processes = self.processes()
        volatility, changing_groups = Counter(), set()
        for path, before in self.observed_stats.items():
            try:
                info = os.lstat(path)
                if before != (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns):
                    volatility['entriesChangedAfterFirstObservation'] += 1
                    changing_groups.update(group for group in self.groups if self.entries[path]['path'].startswith(group + '/') or self.entries[path]['path'] == group)
            except FileNotFoundError:
                volatility['entriesDisappearedAfterFirstObservation'] += 1
            except OSError:
                volatility['entriesUnreadableOnRecheck'] += 1
        for repo in repositories:
            consumers = [consumer for consumer, providers in self.dependencies.items() if consumer != repo['path'] and any(provider == repo['path'] or provider.startswith(repo['path'] + '/') for provider in providers)]
            repo['gitObjectProviderFor'] = consumers
            if consumers:
                repo['decision'] = 'KEEP'
                repo['reasons'].append('git_object_provider_for_other_workspaces')
        for group in self.groups.values():
            classes = set(group['categories'])
            current = any(marker in group['path'] for marker in ('coach-diagnostics-', 'jems-coach-lowspace-', 'jems-chat-rollout.', 'jems-coach-recovery.'))
            active = group['path'] in self.active_groups
            protected = bool(classes & {'recovery_state', 'private_configuration_or_history', 'protected_file'})
            owners = [repo for repo in repositories if group['path'] == repo['path'] or group['path'].startswith(repo['path'] + '/')]
            owner = max(owners, key=lambda repo: len(repo['path'])) if owners else None
            unverified_git = owner is not None and (not owner.get('statusEnumerationComplete') or not owner.get('trackedEnumerationComplete') or owner.get('trackedGeneratedPathCount', 0))
            provider = any(consumer != group['path'] and not consumer.startswith(group['path'] + '/') and any(path == group['path'] or path.startswith(group['path'] + '/') for path in providers) for consumer, providers in self.dependencies.items())
            changing = group['path'] in changing_groups
            group['activeReferenceObserved'] = active
            if current or active or protected or provider or changing or (unverified_git and classes <= REGENERABLE):
                group['decision'] = 'KEEP'
                group['reasons'] = [reason for condition, reason in ((current, 'current_coach_recovery_workspace'), (active, 'active_process_reference'), (protected, 'recovery_private_or_protected_data'), (provider, 'git_object_provider'), (changing, 'changed_during_scan'), (unverified_git and classes <= REGENERABLE, 'git_generated_content_not_verified')) if condition]
            elif classes and classes <= REGENERABLE:
                group['decision'] = 'REGENERABLE_CANDIDATE_REVIEW'
                group['reasons'] = ['verify_untracked_generated_contents_and_no_active_use_before_cleanup']
            elif any(repo['path'] == group['path'] or repo['path'].startswith(group['path'] + '/') for repo in repositories):
                group['decision'] = 'CHECKOUT_REVIEW'
                group['reasons'] = ['verify_published_commits_unique_files_and_git_dependencies']
            else:
                group['decision'] = 'UNKNOWN_KEEP'
                group['reasons'] = ['contents_not_proven_disposable']
        full_entries = [entry for entry in self.entries.values() if entry['category'] not in {'private_configuration_or_history', 'protected_file'}]
        largest = sorted((entry for entry in full_entries if entry['kind'] == 'file'), key=lambda row: row['allocatedBytes'], reverse=True)
        groups = sorted(self.groups.values(), key=lambda row: row['allocatedBytes'], reverse=True)
        return {'auditVersion': 1, 'startedAtUtc': self.started, 'finishedAtUtc': now(), 'readOnly': True,
                'cloudCalls': 0, 'networkCalls': 0, 'filesDeleted': 0, 'snapshotAtomic': False,
                'scope': 'all HOME entries and matching jems*/factory* temporary entries; no symlink or mount traversal',
                'disksBefore': self.disks_before, 'disksAfter': {'home': disk(self.home), 'temporary': disk('/tmp')},
                'errors': self.errors, 'volatility': volatility,
                'mountedDirectoriesNotTraversed': self.external_mounts, 'opaqueEntryCounts': self.opaque_counts,
                'totalEntriesScanned': len(self.entries), 'physicalBytesUniqueAcrossScannedRoots': sum(e['uniqueAllocatedBytesAttributed'] for e in self.entries.values()),
                'sizeNotes': 'Allocated totals include directory blocks. Hardlinked paths can overlap; unique bytes are attributed to the first observed path. Folder levels overlap and must not be summed.',
                'directories': groups, 'repositories': repositories, 'releaseJournals': self.journals,
                'gitStorageDependencies': self.dependencies,
                'processReferences': processes, 'largestFiles': largest[:80], 'entries': full_entries,
                'limitations': ['No deletion approval is issued.', 'Git remote refs may be stale; published commits are not verified.',
                    'Ignored files are not automatically disposable.', 'Opaque private data is sized and preserved, not content-reviewed.',
                    'Git inspection excludes system/global configuration and attributes; custom global ignores are not honored. Configured filters cause status inspection to be skipped.',
                    'Active processes can change files while the snapshot is taken; no active reference is not proof of inactivity.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, help='Existing private directory under /tmp for the full sanitized metadata report')
    args = parser.parse_args()
    os.umask(0o077)
    output = args.output_dir
    if output:
        info = output.lstat()
        if output.is_symlink() or not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077 or not inside(output.resolve(), Path('/tmp').resolve()):
            raise ValueError('PRIVATE_TMP_OUTPUT_DIRECTORY_REQUIRED')
        output = output.resolve()
    audit = Inventory(Path.home(), output)
    print('SCANNING_HOME_FILE_METADATA_NO_CONTENT_EXPORT', file=sys.stderr, flush=True)
    audit.scan(audit.home)
    for root in sorted(Path('/tmp').iterdir()):
        if root.name.startswith(('jems', 'factory')) and root != output:
            try:
                info = root.lstat()
                if info.st_uid != os.getuid():
                    continue
                if root.is_dir() and not root.is_symlink():
                    audit.add(root, info, Path('/tmp'), (root.name,))
                    if info.st_dev == os.stat('/tmp').st_dev:
                        audit.scan(root, (root.name,))
                    else:
                        audit.external_mounts.append(audit.label(root))
                else:
                    audit.add(root, info, Path('/tmp'), (root.name,))
            except OSError:
                audit.errors['temporary_entry_unreadable'] += 1
    report = audit.finish()
    if output:
        destination = output / ('storage-inventory-' + str(time.time_ns()) + '.json')
        descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'w') as stream:
            json.dump(report, stream, ensure_ascii=True, indent=2)
            stream.write('\n')
        report['fullMetadataReport'] = str(destination)
    summary = {key: value for key, value in report.items() if key not in {'entries', 'directories', 'repositories', 'releaseJournals', 'processReferences', 'largestFiles'}}
    arrays = {'topLevelDirectories': [row for row in report['directories'] if row['depth'] == 1],
              'secondLevelDirectories': [row for row in report['directories'] if row['depth'] == 2],
              'repositories': report['repositories'], 'releaseJournals': report['releaseJournals'],
              'largestFiles': report['largestFiles'], 'activeProcessReferences': report['processReferences']['processes']}
    limits = {'topLevelDirectories': 80, 'secondLevelDirectories': 60, 'repositories': 60, 'releaseJournals': 40, 'largestFiles': 20, 'activeProcessReferences': 30}
    summary['processCoverage'] = {key: value for key, value in report['processReferences'].items() if key != 'processes'}
    summary['terminalTruncation'] = {key: max(0, len(value) - limits[key]) for key, value in arrays.items()}
    print('JEMS_STORAGE_REVIEW_BEGIN')
    print('{')
    fields = [(key, value) for key, value in summary.items()]
    for key, value in fields:
        print(json.dumps(key) + ': ' + json.dumps(value, ensure_ascii=True) + ',')
    for index, (key, value) in enumerate(arrays.items()):
        print(json.dumps(key) + ': [')
        selected = value[:limits[key]]
        for offset, row in enumerate(selected):
            print(json.dumps(row, ensure_ascii=True) + (',' if offset + 1 < len(selected) else ''))
        print(']' + (',' if index + 1 < len(arrays) else ''))
    print('}')
    print('JEMS_STORAGE_REVIEW_END')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError):
        print('STORAGE_INVENTORY_STOPPED_NO_FILES_DELETED', file=sys.stderr)
        raise SystemExit(2)
