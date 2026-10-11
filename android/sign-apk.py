#!/usr/bin/env python3
"""Sign only with the privately stored key matching our pinned public certificate."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def load_config(path):
    config = json.loads(Path(path).read_text())
    if not isinstance(config, dict):
        raise ValueError('Signing configuration must be an object')
    for key in ('keystore_base64', 'password', 'alias'):
        if not isinstance(config.get(key), str) or not config[key]:
            raise ValueError('Missing signing field: ' + key)
    if not re.fullmatch(r'[A-Za-z0-9_-]+', config['alias']):
        raise ValueError('Invalid signing alias')
    data = base64.b64decode(config['keystore_base64'], validate=True)
    if not data:
        raise ValueError('Empty keystore')
    return config, data


def sign(config_path, tools, unsigned, output):
    config, data = load_config(config_path)
    expected = Path(__file__).with_name('signing-certificate.sha256').read_text().strip()
    if not re.fullmatch(r'[0-9a-f]{64}', expected):
        raise ValueError('Missing or invalid pinned certificate')
    with tempfile.TemporaryDirectory(prefix='grandma-sign-') as folder:
        keystore = Path(folder) / 'release.p12'
        keystore.write_bytes(data)
        keystore.chmod(0o600)
        env = dict(os.environ, GTA_KEY_PASSWORD=config['password'])
        cert = subprocess.run(['keytool', '-exportcert', '-keystore', str(keystore),
            '-storepass:env', 'GTA_KEY_PASSWORD', '-alias', config['alias']],
            env=env, check=True, capture_output=True).stdout
        if hashlib.sha256(cert).hexdigest() != expected:
            raise ValueError('Signing certificate mismatch; refusing to publish a different identity')
        signer = str(Path(tools) / 'apksigner')
        subprocess.run([signer, 'sign', '--ks', str(keystore), '--ks-key-alias', config['alias'],
            '--ks-pass', 'env:GTA_KEY_PASSWORD', '--key-pass', 'env:GTA_KEY_PASSWORD',
            '--out', output, unsigned], env=env, check=True, capture_output=True)
        verified = subprocess.run([signer, 'verify', '--verbose', '--print-certs', output],
            check=True, capture_output=True, text=True).stdout
        if 'Signer #1 certificate SHA-256 digest: ' + expected not in verified:
            raise ValueError('Signed APK certificate verification failed')
        Path(output + '.sha256').write_text(hashlib.sha256(Path(output).read_bytes()).hexdigest() + '  ' + Path(output).name + '\n')
        print('Verified fixed signing certificate: ' + expected)


if __name__ == '__main__':
    try:
        if len(sys.argv) != 5:
            raise ValueError('Usage: sign-apk.py CONFIG BUILD_TOOLS UNSIGNED_APK OUTPUT_APK')
        sign(*sys.argv[1:])
    except (ValueError, OSError, subprocess.CalledProcessError):
        # Do not print raw config, subprocess arguments, or password-bearing output.
        print('Signing failed: check private configuration, pinned certificate and build tools. No fallback key is generated.', file=sys.stderr)
        sys.exit(1)
