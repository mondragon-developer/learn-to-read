"""Install Fish MCP recordings without an API key or another generation charge.

Usage: python3 scripts/import-fish-audio.py PLAN RECEIPTS --ffmpeg /path/to/ffmpeg
PLAN is produced by npm run audio -- --export=...; RECEIPTS contains voice, model,
and clips [{key, text, audio_url}]. Keep receipts to resume interrupted downloads.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('plan', type=Path)
    parser.add_argument('receipts', type=Path)
    parser.add_argument('--ffmpeg', required=True)
    parser.add_argument('--manifest', default='src/data/audio-manifest.json', help='Separate output manifest for an additional voice')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    plan = json.loads(args.plan.read_text())
    receipts = json.loads(args.receipts.read_text())
    catalog = {c['key']: c for c in plan['clips']}
    records = receipts['clips']
    keys = [r['key'] for r in records]
    if len(set(keys)) != len(keys):
        raise ValueError('Duplicate receipt keys')
    # Validate the entire batch before downloading or changing the manifest.
    for r in records:
        c = catalog[r['key']]
        if r['text'] != c['ttsText']:
            raise ValueError(f"Text mismatch: {r['key']}")
        path = Path(c['file'])
        if path.is_absolute() or '..' in path.parts or path.parts[0] != 'audio' or path.suffix != '.mp3':
            raise ValueError('Invalid catalog audio path')
        url = urllib.parse.urlparse(r['audio_url'])
        if url.scheme != 'https' or url.hostname != 'platform.r2.fish.audio':
            raise ValueError('Expected a Fish Audio recording URL')
        if not 0.5 <= c['speed'] <= 2:
            raise ValueError('Unsupported speaking speed')
    manifest_path = root / args.manifest
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    def install(r):
        c = catalog[r['key']]
        config = [c['ttsText'], c['speed'], receipts['voice'], receipts['model'], r['audio_url'], 'atempo-v1']
        signature = hashlib.sha256(json.dumps(config).encode()).hexdigest()[:12]
        path = Path(c['file'])
        relative = path.with_name(f'{path.stem}.{signature}.mp3')
        target = root / 'public' / relative
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='goal-reader-audio-') as folder:
                source = Path(folder) / 'source.mp3'
                with urllib.request.urlopen(r['audio_url'], timeout=60) as response:
                    source.write_bytes(response.read())
                output = Path(folder) / 'output.mp3'
                # atempo changes speaking speed while preserving the voice's pitch.
                subprocess.run([
                    args.ffmpeg, '-v', 'error', '-nostdin', '-i', str(source),
                    '-af', f"atempo={c['speed']}", '-ac', '1', '-ar', '44100',
                    '-codec:a', 'libmp3lame', '-b:a', '64k', str(output),
                ], check=True, capture_output=True)
                data = output.read_bytes()
                if len(data) < 512:
                    raise ValueError(f"Empty audio: {r['key']}")
                # Atomic replacement: interrupted downloads never become playable files.
                temporary = target.with_suffix('.mp3.tmp')
                temporary.write_bytes(data)
                temporary.replace(target)
        return r['key'], {
            'file': relative.as_posix(), 'hash': signature, 'provider': 'fish-mcp',
            'voice': receipts['voice'], 'model': receipts['model'], 'speed': c['speed'],
        }

    with ThreadPoolExecutor(max_workers=4) as pool:
        for count, (key, entry) in enumerate(pool.map(install, records), 1):
            manifest[key] = entry
            temporary = manifest_path.with_suffix('.json.tmp')
            temporary.write_text(json.dumps(dict(sorted(manifest.items())), indent=1) + '\n')
            temporary.replace(manifest_path)
            if count % 50 == 0 or count == len(records):
                print(f'Installed {count}/{len(records)} clips', flush=True)


if __name__ == '__main__':
    main()
