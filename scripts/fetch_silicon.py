"""Fetch the pinned framework into an external directory, verifying every blob.

This is a development/test setup tool, not a user-file importer. It does not
execute or redistribute the downloaded source. It refuses an existing target.
"""
import argparse
import hashlib
from pathlib import Path
import shutil
import tempfile
from urllib.request import Request, urlopen

from generate_metadata import REVISION, SOURCES, verified_sources


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    if args.destination.exists():
        parser.exit(1, 'Destination already exists; choose an empty external path.\n')
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with tempfile.TemporaryDirectory(dir=args.destination.parent) as temporary:
            target = Path(temporary) / 'checkout'
            for path, expected in SOURCES.items():
                url = f'https://raw.githubusercontent.com/Wednesware/Silicon/{REVISION}/{path}'
                with urlopen(Request(url, headers={'User-Agent': 'Actwright-development-setup'}), timeout=30) as response:
                    content = response.read(2_000_001)
                digest = hashlib.sha1(f'blob {len(content)}\0'.encode() + content).hexdigest()
                if len(content) > 2_000_000 or digest != expected:
                    raise ValueError(f'Source verification failed: {path}')
                output = target / path
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(content)
            verified_sources(target)
            shutil.move(str(target), str(args.destination))
        print(f'Verified Silicon {REVISION} at {args.destination}')
    except (OSError, ValueError) as exc:
        parser.exit(1, f'{exc}\n')
