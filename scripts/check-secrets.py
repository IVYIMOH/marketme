"""Check Git history, working files, logs and public output. Reports locations, never values."""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
os.chdir(root)
parser = argparse.ArgumentParser()
parser.add_argument('--local', action='store_true', help='Also compare against running local Supabase credentials')
args = parser.parse_args()
patterns = {
    'private key': rb'-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----',
    'provider secret': rb'(?:sb_secret_|GOCSPX-|gh[pousr]_|github_pat_|sk_live_|npm_)[a-zA-Z0-9_-]{16,}',
    'AWS key identifier': rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
}
signature = {label: re.compile(pattern) for label, pattern in patterns.items()}
jwt = re.compile(rb'\beyJ[\w-]+\.([\w-]+)\.[\w-]{10,}')
private_values = set()
findings = set()
checked = 0

def collect(name, value):
    if re.search('SECRET|PASSWORD|SERVICE_ROLE|SERVICE_KEY|PRIVATE_KEY|API_KEY|ACCESS_KEY|ACCESS_TOKEN', name, re.I):
        if len(value) >= 8 and not re.search(r'^(env\(|<|your-|replace-)', value, re.I):
            private_values.add(value.encode())

def is_private_env(path):
    return (path.name == '.env' or path.name.startswith('.env.')) and not path.name.endswith('.example')

def scan(label, data):
    global checked
    checked += 1
    for kind, regex in signature.items():
        if regex.search(data):
            findings.add((label, kind))
    if any(value in data for value in private_values):
        findings.add((label, 'configured private value'))
    for match in jwt.finditer(data):
        try:
            payload = json.loads(base64.urlsafe_b64decode(match[1] + b'==='))
            if payload.get('role') != 'anon':
                findings.add((label, 'non-public JWT'))
        except (ValueError, UnicodeError, AttributeError):
            continue

skip_dirs = {'.git', '.next', '.next-dev', 'node_modules', '.temp', '.codex', '.agents', '.aws', '.claude'}
logs = []
for directory, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in skip_dirs]
    for filename in files:
        p = Path(directory, filename)
        if is_private_env(p) and p.is_file():
            for line in p.read_text().splitlines():
                name, sep, value = line.partition('=')
                if sep: collect(name.strip(), value.strip().strip('"\''))
        elif filename.endswith('.log'):
            logs.append(p)
if args.local:
    # Only the CLI's local status command is used. Keep its credential output in memory.
    output = subprocess.check_output(['node_modules/.bin/supabase', 'status', '-o', 'json'], stderr=subprocess.DEVNULL)
    for key, value in json.loads(output).items():
        if isinstance(value, str): collect(key, value)

files = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z']).split(b'\0')
for name in filter(None, files):
    p = Path(os.fsdecode(name))
    if is_private_env(p):
        findings.add((str(p), 'unignored environment file'))
    elif p.is_file() and not p.is_symlink():
        scan(str(p), p.read_bytes())
for p in logs:
    scan(str(p), p.read_bytes())
for directory in ['frontend/.next/static', 'frontend/.next/server/app', 'frontend/.next-dev/static', 'frontend/public']:
    for p in Path(directory).rglob('*'):
        if p.is_file():
            if is_private_env(p):
                findings.add((str(p), 'environment file in served output'))
            scan(str(p), p.read_bytes())

# Read each distinct historical blob once. Binary assets can also contain secrets.
objects = subprocess.check_output(['git', 'rev-list', '--objects', '--all']).splitlines()
with subprocess.Popen(['git', 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE) as proc:
    for obj in objects:
        oid, _, path = obj.partition(b' ')
        if not path:
            continue
        proc.stdin.write(oid + b'\n')
        proc.stdin.flush()
        _, typ, size = proc.stdout.readline().split()
        data = proc.stdout.read(int(size))
        proc.stdout.read(1)
        if typ == b'blob':
            name = os.fsdecode(path)
            label = f'history {oid[:9].decode()} {name}'
            if is_private_env(Path(name)):
                findings.add((label, 'historical environment file'))
            scan(label, data)
    proc.stdin.close()
for location, kind in sorted(findings):
    print(f'{kind} in {location}')
print(f'Checked {checked} files and blobs; {len(findings)} findings.')
sys.exit(bool(findings))
